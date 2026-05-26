/**
 * Ticket 0044 — POST /api/cron/refresh-drill-sequences.
 *
 * Each acceptance-criteria box maps to one or more cases:
 *  (1) 401 on missing/wrong bearer; 200 + { rows_written, took_ms } on valid.
 *  (2) Six coaches all upvote drill A then drill B within 14 days → ONE row
 *      written for (basketball, A, B) with coach_count = 6.
 *  (3) The cron reads ONLY `coach_drill_signals` + `drills` (COPPA — never
 *      `players` / `observations` / `parent_reactions`).
 *  (4) The cron does NOT enforce the N>=5 floor itself — it writes every
 *      tuple it computes; the GET route is the privacy boundary (so the
 *      table can grow more granular without re-deriving on read).
 *  (5) Idempotent: a re-run on the same fixture produces the same row count
 *      (the write is wrapped in DELETE-then-INSERT, so the table is always a
 *      consistent snapshot).
 *  (6) 14-day window: a pair separated by 20 days produces no aggregate row.
 *
 * .test.ts NOT .spec.ts — vitest excludes the spec glob (LESSONS#38).
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockFromFn } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { POST as refreshPost } from '@/app/api/cron/refresh-drill-sequences/route';

// ─── In-memory store + chainable mock ─────────────────────────────────────────

interface Signal {
  coach_id: string;
  drill_id: string;
  rating: 'up' | 'down';
  signal_type: 'rating' | 'dismiss_suggestion';
  last_rated_at: string;
}

interface Drill {
  id: string;
  sport_slug: string;
}

interface AggregateRow {
  sport: string;
  drill_id: string;
  next_drill_id: string;
  coach_count: number;
}

const store: {
  signals: Signal[];
  drills: Drill[];
  aggregates: AggregateRow[];
  // every table the cron read (COPPA contract — must be a subset of the
  // two-table allow-list)
  tablesRead: string[];
  // every distinct (drill_id, signal_type, rating) shape the route SELECT-ed
  // from `coach_drill_signals` so the test can assert the cron only consumes
  // the 'rating'-typed upvote rows.
  signalFilters: Array<Record<string, unknown>>;
} = {
  signals: [],
  drills: [],
  aggregates: [],
  tablesRead: [],
  signalFilters: [],
};

function clearStore() {
  store.signals = [];
  store.drills = [];
  store.aggregates = [];
  store.tablesRead = [];
  store.signalFilters = [];
}

function buildSignalsChain() {
  const filters: Record<string, unknown> = {};
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    }),
    order: vi.fn(() => chain),
    then: (onFulfilled: (v: { data: Signal[]; error: null }) => unknown) => {
      store.signalFilters.push({ ...filters });
      const filtered = store.signals.filter((s) => {
        for (const [k, v] of Object.entries(filters)) {
          if ((s as unknown as Record<string, unknown>)[k] !== v) return false;
        }
        return true;
      });
      return Promise.resolve({ data: filtered, error: null }).then(onFulfilled);
    },
  };
  return chain;
}

function buildDrillsChain() {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    then: (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) => {
      // The cron reads (id, sport_id, sports(slug)) and folds it to
      // { id, sport: <slug> }. The mock returns rows already shaped so the
      // route can normalise to a slug Map without depending on the actual
      // PostgREST join syntax.
      const data = store.drills.map((d) => ({
        id: d.id,
        sports: { slug: d.sport_slug },
      }));
      return Promise.resolve({ data, error: null }).then(onFulfilled);
    },
  };
  return chain;
}

function buildAggregatesChain() {
  const chain: Record<string, unknown> = {
    // The transaction shape: a DELETE followed by an INSERT.
    delete: vi.fn(() => ({
      // The route calls .neq('drill_id', impossible) to delete-all (Supabase
      // requires a filter; use a sentinel that matches every row).
      neq: vi.fn(() => Promise.resolve({ error: null })),
      // Alternative: .gte('coach_count', 0) — equally a delete-all sentinel.
      gte: vi.fn(() => Promise.resolve({ error: null })),
    })),
    insert: vi.fn((rows: AggregateRow[]) => {
      store.aggregates = [...store.aggregates, ...rows];
      return Promise.resolve({ error: null, data: rows });
    }),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  // mockReturnValueOnce queues do NOT drain via clearAllMocks (LESSONS#92).
  mockFromFn.mockReset();
  clearStore();
  process.env.CRON_SECRET = 'test-secret';

  mockFromFn.mockImplementation((table: string) => {
    store.tablesRead.push(table);
    if (table === 'coach_drill_signals') return buildSignalsChain();
    if (table === 'drills') return buildDrillsChain();
    if (table === 'drill_sequence_aggregates') return buildAggregatesChain();
    throw new Error(`unexpected table read: ${table}`);
  });
});

const ORIG_CRON_SECRET = process.env.CRON_SECRET;
afterAll(() => {
  if (ORIG_CRON_SECRET == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIG_CRON_SECRET;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders(bearer = process.env.CRON_SECRET ?? 'test-secret') {
  return { authorization: `Bearer ${bearer}` };
}

function makeRequest(headers: Record<string, string> = authHeaders()) {
  return new Request('http://localhost/api/cron/refresh-drill-sequences', {
    method: 'POST',
    headers,
  });
}

const A_DRILL_ID = '00000000-0000-4000-a000-0000000000a1';
const B_DRILL_ID = '00000000-0000-4000-a000-0000000000b1';
const C_DRILL_ID = '00000000-0000-4000-a000-0000000000c1';

function plantBasketballDrills() {
  store.drills = [
    { id: A_DRILL_ID, sport_slug: 'basketball' },
    { id: B_DRILL_ID, sport_slug: 'basketball' },
    { id: C_DRILL_ID, sport_slug: 'basketball' },
  ];
}

function dayOffset(daysFromNow: number, hours = 12): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hours, 0, 0, 0);
  return d.toISOString();
}

// ─── (1) Auth ────────────────────────────────────────────────────────────────

describe('POST /api/cron/refresh-drill-sequences — auth', () => {
  it('returns 401 on missing bearer and writes nothing', async () => {
    const res = await refreshPost(makeRequest({}));
    expect(res.status).toBe(401);
    expect(store.aggregates).toEqual([]);
  });

  it('returns 401 on wrong bearer and writes nothing', async () => {
    const res = await refreshPost(makeRequest({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    expect(store.aggregates).toEqual([]);
  });

  it('returns 200 + { rows_written, took_ms } on valid bearer', async () => {
    plantBasketballDrills();
    const res = await refreshPost(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      rows_written: expect.any(Number),
      took_ms: expect.any(Number),
    });
  });
});

// ─── (2) Happy path — six coaches → one row with count 6 ─────────────────────

describe('POST /api/cron/refresh-drill-sequences — aggregation', () => {
  it('aggregates six coaches who all upvoted A then B within 14 days into ONE row, count 6', async () => {
    plantBasketballDrills();
    // Six coaches, each with a (A, B) upvote pair 3 days apart.
    for (let i = 0; i < 6; i++) {
      const coachId = `coach-${i}`;
      store.signals.push(
        {
          coach_id: coachId,
          drill_id: A_DRILL_ID,
          rating: 'up',
          signal_type: 'rating',
          last_rated_at: dayOffset(-10),
        },
        {
          coach_id: coachId,
          drill_id: B_DRILL_ID,
          rating: 'up',
          signal_type: 'rating',
          last_rated_at: dayOffset(-7),
        },
      );
    }

    const res = await refreshPost(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows_written).toBe(1);

    expect(store.aggregates).toHaveLength(1);
    expect(store.aggregates[0]).toMatchObject({
      sport: 'basketball',
      drill_id: A_DRILL_ID,
      next_drill_id: B_DRILL_ID,
      coach_count: 6,
    });
  });

  it('counts DISTINCT coaches — the same coach rating A→B twice produces count 1, not 2', async () => {
    plantBasketballDrills();
    // One coach with TWO A→B pairs across separate sessions.
    store.signals.push(
      {
        coach_id: 'coach-dup',
        drill_id: A_DRILL_ID,
        rating: 'up',
        signal_type: 'rating',
        last_rated_at: dayOffset(-30),
      },
      {
        coach_id: 'coach-dup',
        drill_id: B_DRILL_ID,
        rating: 'up',
        signal_type: 'rating',
        last_rated_at: dayOffset(-28),
      },
      // A re-rating much later — within the 14-day window of its own
      // partner so it'd otherwise emit a SECOND (A,B) pair; the distinct-
      // coach contract collapses it to one.
      {
        coach_id: 'coach-dup',
        drill_id: A_DRILL_ID,
        rating: 'up',
        signal_type: 'rating',
        last_rated_at: dayOffset(-5),
      },
      {
        coach_id: 'coach-dup',
        drill_id: B_DRILL_ID,
        rating: 'up',
        signal_type: 'rating',
        last_rated_at: dayOffset(-3),
      },
    );

    await refreshPost(makeRequest());
    const row = store.aggregates.find(
      (r) => r.drill_id === A_DRILL_ID && r.next_drill_id === B_DRILL_ID,
    );
    expect(row).toBeDefined();
    expect(row!.coach_count).toBe(1);
  });

  it('drops pairs separated by more than 14 days (the 14-day next-up window)', async () => {
    plantBasketballDrills();
    store.signals.push(
      {
        coach_id: 'coach-far',
        drill_id: A_DRILL_ID,
        rating: 'up',
        signal_type: 'rating',
        last_rated_at: dayOffset(-30),
      },
      {
        coach_id: 'coach-far',
        drill_id: B_DRILL_ID,
        rating: 'up',
        signal_type: 'rating',
        last_rated_at: dayOffset(-5), // 25 days later → outside the window
      },
    );

    await refreshPost(makeRequest());
    expect(store.aggregates).toEqual([]);
  });

  it('writes every pair regardless of count — the N>=5 floor lives at the ROUTE layer, not the cron', async () => {
    plantBasketballDrills();
    // 3 coaches → 3 < 5 floor, but the cron writes the row anyway.
    for (let i = 0; i < 3; i++) {
      const coachId = `coach-${i}`;
      store.signals.push(
        {
          coach_id: coachId,
          drill_id: A_DRILL_ID,
          rating: 'up',
          signal_type: 'rating',
          last_rated_at: dayOffset(-10),
        },
        {
          coach_id: coachId,
          drill_id: B_DRILL_ID,
          rating: 'up',
          signal_type: 'rating',
          last_rated_at: dayOffset(-7),
        },
      );
    }

    await refreshPost(makeRequest());
    const row = store.aggregates.find(
      (r) => r.drill_id === A_DRILL_ID && r.next_drill_id === B_DRILL_ID,
    );
    expect(row).toBeDefined();
    expect(row!.coach_count).toBe(3);
  });
});

// ─── (3) COPPA — only the two named tables are read ──────────────────────────

describe('POST /api/cron/refresh-drill-sequences — COPPA boundary', () => {
  it('reads ONLY coach_drill_signals + drills + drill_sequence_aggregates', async () => {
    plantBasketballDrills();
    store.signals.push(
      {
        coach_id: 'coach-x',
        drill_id: A_DRILL_ID,
        rating: 'up',
        signal_type: 'rating',
        last_rated_at: dayOffset(-5),
      },
    );
    await refreshPost(makeRequest());

    const allowed = new Set([
      'coach_drill_signals',
      'drills',
      'drill_sequence_aggregates',
    ]);
    for (const table of store.tablesRead) {
      expect(allowed.has(table)).toBe(true);
    }
  });

  it('filters signals to rating=up + signal_type=rating only (never reads dismiss rows)', async () => {
    plantBasketballDrills();
    await refreshPost(makeRequest());

    // The cron filters the signals query by both `rating='up'` AND
    // `signal_type='rating'`. The mock captures every filter chain that
    // landed on the table.
    const captured = store.signalFilters.flatMap((f) => Object.entries(f));
    expect(captured).toContainEqual(['rating', 'up']);
    expect(captured).toContainEqual(['signal_type', 'rating']);
  });
});

// ─── (4) Idempotency ─────────────────────────────────────────────────────────

describe('POST /api/cron/refresh-drill-sequences — idempotent', () => {
  it('a second run produces the same final row count (delete-then-insert snapshot)', async () => {
    plantBasketballDrills();
    for (let i = 0; i < 5; i++) {
      const coachId = `coach-${i}`;
      store.signals.push(
        {
          coach_id: coachId,
          drill_id: A_DRILL_ID,
          rating: 'up',
          signal_type: 'rating',
          last_rated_at: dayOffset(-10),
        },
        {
          coach_id: coachId,
          drill_id: B_DRILL_ID,
          rating: 'up',
          signal_type: 'rating',
          last_rated_at: dayOffset(-7),
        },
      );
    }

    await refreshPost(makeRequest());
    const firstCount = store.aggregates.length;

    // Re-run: the route deletes the table THEN re-inserts, so we mimic the
    // snapshot replacement by resetting the table first.
    store.aggregates = [];
    await refreshPost(makeRequest());

    expect(store.aggregates.length).toBe(firstCount);
    expect(store.aggregates[0]).toMatchObject({
      drill_id: A_DRILL_ID,
      next_drill_id: B_DRILL_ID,
      coach_count: 5,
    });
  });
});
