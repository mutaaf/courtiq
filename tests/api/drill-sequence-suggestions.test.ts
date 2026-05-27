/**
 * Ticket 0044 — GET /api/drill-sequence-suggestions.
 *
 * The route is the privacy boundary: it ENFORCES the k-anonymity floor
 * (coach_count >= 5) regardless of what is in the table, and strips the
 * response keyset to exactly { next_drill_id, next_drill_title, coach_count,
 * sport } — never any field that could leak individual coach identity or
 * recency. The table itself can carry lower counts (so a single offline
 * batch run yields more granular telemetry); the floor lives here.
 *
 * AC mapped:
 *  - auth required (401 without a user).
 *  - the >=5 floor is enforced at the route — a planted count=4 row is
 *    filtered out even if explicitly requested by drill_id.
 *  - the response keyset matches the allow-list EXACTLY
 *    (LESSONS#84 — Object.keys deep-equality).
 *  - cross-sport rows never bleed in: a (basketball, A) request never
 *    returns soccer A→B even though the underlying table has them.
 *  - the route NEVER reads coach-scoped or minor-scoped tables.
 *
 * .test.ts NOT .spec.ts — vitest excludes the spec glob (LESSONS#38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockFromFn, mockGetUser } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { GET as suggestionsGet } from '@/app/api/drill-sequence-suggestions/route';

// ─── In-memory store + chainable mock ─────────────────────────────────────────

interface AggregateRow {
  sport: string;
  drill_id: string;
  next_drill_id: string;
  coach_count: number;
  last_refreshed_at: string;
}

interface DrillRow {
  id: string;
  name: string;
}

const store: {
  aggregates: AggregateRow[];
  drills: DrillRow[];
  tablesRead: string[];
} = {
  aggregates: [],
  drills: [],
  tablesRead: [],
};

function clearStore() {
  store.aggregates = [];
  store.drills = [];
  store.tablesRead = [];
}

function buildAggregatesChain() {
  const filters: Record<string, unknown> = {};
  let _gte: { col: string; val: number } | null = null;
  let _limit: number | null = null;
  let _order: { col: string; ascending: boolean } | null = null;

  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    }),
    gte: vi.fn((col: string, val: number) => {
      _gte = { col, val };
      return chain;
    }),
    order: vi.fn((col: string, opts?: { ascending?: boolean }) => {
      _order = { col, ascending: opts?.ascending ?? false };
      return chain;
    }),
    limit: vi.fn((n: number) => {
      _limit = n;
      return chain;
    }),
    then: (onFulfilled: (v: { data: AggregateRow[]; error: null }) => unknown) => {
      let rows = store.aggregates.filter((r) => {
        for (const [k, v] of Object.entries(filters)) {
          if ((r as unknown as Record<string, unknown>)[k] !== v) return false;
        }
        if (_gte && (r as unknown as Record<string, number>)[_gte.col] < _gte.val) return false;
        return true;
      });
      if (_order) {
        rows = [...rows].sort((a, b) => {
          const av = (a as unknown as Record<string, number>)[_order!.col];
          const bv = (b as unknown as Record<string, number>)[_order!.col];
          return (_order!.ascending ? 1 : -1) * (av - bv);
        });
      }
      if (_limit != null) rows = rows.slice(0, _limit);
      return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
    },
  };
  return chain;
}

function buildDrillsChain() {
  const filters: Record<string, unknown> = {};
  let _inFilter: { col: string; vals: unknown[] } | null = null;
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    }),
    in: vi.fn((col: string, vals: unknown[]) => {
      _inFilter = { col, vals };
      return chain;
    }),
    then: (onFulfilled: (v: { data: DrillRow[]; error: null }) => unknown) => {
      let rows = store.drills.filter((r) => {
        for (const [k, v] of Object.entries(filters)) {
          if ((r as unknown as Record<string, unknown>)[k] !== v) return false;
        }
        if (_inFilter && !_inFilter.vals.includes((r as unknown as Record<string, unknown>)[_inFilter.col])) {
          return false;
        }
        return true;
      });
      void rows;
      return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
    },
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
  clearStore();

  mockGetUser.mockResolvedValue({ data: { user: { id: 'auth-coach-1' } } });
  mockFromFn.mockImplementation((table: string) => {
    store.tablesRead.push(table);
    if (table === 'drill_sequence_aggregates') return buildAggregatesChain();
    if (table === 'drills') return buildDrillsChain();
    throw new Error(`unexpected table read: ${table}`);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const A = '00000000-0000-4000-a000-0000000000a1';
const B = '00000000-0000-4000-a000-0000000000b1';
const C = '00000000-0000-4000-a000-0000000000c1';
const D = '00000000-0000-4000-a000-0000000000d1';

function plantDrills() {
  store.drills = [
    { id: A, name: 'Corner shooting' },
    { id: B, name: 'Close-out drill' },
    { id: C, name: 'Elbow shooting' },
    { id: D, name: 'Soccer cone weave' },
  ];
}

function makeRequest(qs: string) {
  return new Request(`http://localhost/api/drill-sequence-suggestions?${qs}`);
}

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('GET /api/drill-sequence-suggestions — auth', () => {
  it('returns 401 when no user is authed', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await suggestionsGet(makeRequest(`drillId=${A}&sport=basketball`));
    expect(res.status).toBe(401);
  });
});

// ─── k-anonymity floor ───────────────────────────────────────────────────────

describe('GET /api/drill-sequence-suggestions — N>=5 floor at the route layer', () => {
  it('returns ONLY rows with coach_count >= 5 — counts 2 and 4 are filtered out', async () => {
    plantDrills();
    store.aggregates = [
      { sport: 'basketball', drill_id: A, next_drill_id: B, coach_count: 12, last_refreshed_at: '2026-05-26T03:00:00Z' },
      { sport: 'basketball', drill_id: A, next_drill_id: C, coach_count: 5,  last_refreshed_at: '2026-05-26T03:00:00Z' },
      // sub-floor — must NEVER cross the route to the client (LESSONS#39).
      { sport: 'basketball', drill_id: A, next_drill_id: D, coach_count: 4,  last_refreshed_at: '2026-05-26T03:00:00Z' },
      { sport: 'basketball', drill_id: A, next_drill_id: D, coach_count: 2,  last_refreshed_at: '2026-05-26T03:00:00Z' },
    ];

    const res = await suggestionsGet(makeRequest(`drillId=${A}&sport=basketball`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toHaveLength(2);
    for (const s of body.suggestions) {
      expect(s.coach_count).toBeGreaterThanOrEqual(5);
    }
    // The 12-coach row outranks the 5-coach row.
    expect(body.suggestions[0].coach_count).toBe(12);
    expect(body.suggestions[1].coach_count).toBe(5);
  });

  it('limits the response to the top 3 rows by coach_count DESC', async () => {
    plantDrills();
    store.drills = [
      ...store.drills,
      { id: '00000000-0000-4000-a000-0000000000e1', name: 'Mikan drill' },
      { id: '00000000-0000-4000-a000-0000000000f1', name: 'Three-on-three' },
    ];
    store.aggregates = [
      { sport: 'basketball', drill_id: A, next_drill_id: B, coach_count: 18, last_refreshed_at: '2026-05-26T03:00:00Z' },
      { sport: 'basketball', drill_id: A, next_drill_id: C, coach_count: 14, last_refreshed_at: '2026-05-26T03:00:00Z' },
      { sport: 'basketball', drill_id: A, next_drill_id: '00000000-0000-4000-a000-0000000000e1', coach_count: 12, last_refreshed_at: '2026-05-26T03:00:00Z' },
      { sport: 'basketball', drill_id: A, next_drill_id: '00000000-0000-4000-a000-0000000000f1', coach_count: 9,  last_refreshed_at: '2026-05-26T03:00:00Z' },
    ];

    const res = await suggestionsGet(makeRequest(`drillId=${A}&sport=basketball`));
    const body = await res.json();
    expect(body.suggestions).toHaveLength(3);
    expect(body.suggestions.map((s: { coach_count: number }) => s.coach_count)).toEqual([18, 14, 12]);
  });
});

// ─── Payload keyset (LESSONS#84 deep-equality) ───────────────────────────────

describe('GET /api/drill-sequence-suggestions — payload keyset', () => {
  it("each row's keys are EXACTLY { next_drill_id, next_drill_title, coach_count, sport }", async () => {
    plantDrills();
    store.aggregates = [
      { sport: 'basketball', drill_id: A, next_drill_id: B, coach_count: 12, last_refreshed_at: '2026-05-26T03:00:00Z' },
    ];

    const res = await suggestionsGet(makeRequest(`drillId=${A}&sport=basketball`));
    const body = await res.json();
    expect(body.suggestions).toHaveLength(1);

    const allowed = ['coach_count', 'next_drill_id', 'next_drill_title', 'sport'];
    expect(Object.keys(body.suggestions[0]).sort()).toEqual(allowed);

    // Confirm the joined title is present + correctly resolved.
    expect(body.suggestions[0].next_drill_title).toBe('Close-out drill');
  });

  it('NEVER leaks last_refreshed_at, drill_id, or any coach identifier', async () => {
    plantDrills();
    store.aggregates = [
      { sport: 'basketball', drill_id: A, next_drill_id: B, coach_count: 12, last_refreshed_at: '2026-05-26T03:00:00Z' },
    ];

    const res = await suggestionsGet(makeRequest(`drillId=${A}&sport=basketball`));
    const body = await res.json();
    const row = body.suggestions[0];
    expect(row).not.toHaveProperty('last_refreshed_at');
    expect(row).not.toHaveProperty('drill_id');
    expect(row).not.toHaveProperty('coach_id');
    expect(row).not.toHaveProperty('coach_ids');
  });
});

// ─── Cross-sport isolation ───────────────────────────────────────────────────

describe('GET /api/drill-sequence-suggestions — sport isolation', () => {
  it('returns no rows from another sport even when the table has them', async () => {
    plantDrills();
    store.aggregates = [
      // Same drill_id A in two different sports — the request must scope to
      // the requested sport only.
      { sport: 'basketball', drill_id: A, next_drill_id: B, coach_count: 12, last_refreshed_at: '2026-05-26T03:00:00Z' },
      { sport: 'soccer',     drill_id: A, next_drill_id: D, coach_count: 30, last_refreshed_at: '2026-05-26T03:00:00Z' },
    ];

    const res = await suggestionsGet(makeRequest(`drillId=${A}&sport=basketball`));
    const body = await res.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].sport).toBe('basketball');
  });
});

// ─── Required params ─────────────────────────────────────────────────────────

describe('GET /api/drill-sequence-suggestions — required params', () => {
  it('400 when drillId is missing', async () => {
    const res = await suggestionsGet(makeRequest('sport=basketball'));
    expect(res.status).toBe(400);
  });

  it('400 when sport is missing', async () => {
    const res = await suggestionsGet(makeRequest(`drillId=${A}`));
    expect(res.status).toBe(400);
  });
});

// ─── COPPA — minor-data tables never read ────────────────────────────────────

describe('GET /api/drill-sequence-suggestions — COPPA boundary', () => {
  it('reads ONLY drill_sequence_aggregates + drills — never any minor-scoped table', async () => {
    plantDrills();
    store.aggregates = [
      { sport: 'basketball', drill_id: A, next_drill_id: B, coach_count: 12, last_refreshed_at: '2026-05-26T03:00:00Z' },
    ];

    await suggestionsGet(makeRequest(`drillId=${A}&sport=basketball`));

    const allowed = new Set(['drill_sequence_aggregates', 'drills']);
    for (const table of store.tablesRead) {
      expect(allowed.has(table)).toBe(true);
    }
    // explicit banned-list assertion for any future grep
    for (const banned of ['players', 'observations', 'parent_reactions', 'coach_drill_signals']) {
      expect(store.tablesRead).not.toContain(banned);
    }
  });
});
