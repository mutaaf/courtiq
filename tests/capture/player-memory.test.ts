/**
 * Ticket 0025 — Per-player capture memory: when the coach focuses a player,
 * remind them of that player's most recent prior needs-work (and a recent
 * positive) observation.
 *
 * Tests the GET /api/capture/player-memory route.
 *
 * Strategy mirrors tests/capture/carryover.test.ts and tests/ai/weekly-star.test.ts:
 * @/lib/supabase/server is replaced with a chainable in-memory mock so the route
 * runs without a real DB connection. The handler reads request.url, so each test
 * invokes it with a Request (LESSONS.md 2026-05-21 re: handler signatures).
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob (reserved for
 * Playwright). See docs/LESSONS.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser, mockFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromFn,
  })),
  createServiceSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromFn,
  })),
}));

import { GET } from '@/app/api/capture/player-memory/route';

// ─── Chainable mock helpers ─────────────────────────────────────────────────────

/**
 * A chainable Supabase query mock. Builder methods return `this` so they can be
 * chained; the chain is itself awaitable (thenable) resolving to {data,error}
 * — the observations query terminates in `.limit(1)`, not `.single()`, so the
 * chain must be awaitable directly.
 */
function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function makeRequest(playerId?: string, teamId?: string) {
  const params = new URLSearchParams();
  if (playerId) params.set('playerId', playerId);
  if (teamId) params.set('teamId', teamId);
  const qs = params.toString();
  return new Request(`http://localhost/api/capture/player-memory${qs ? `?${qs}` : ''}`);
}

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function setNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

/**
 * Wire the route's table reads. The route resolves the caller's org via
 * `coaches`, confirms the team via `teams`, then reads `observations` once per
 * sentiment (needs-work, then positive). We differentiate the two observation
 * reads by the `sentiment` value passed to `.eq('sentiment', …)`.
 */
function wireTables(opts: {
  coachOrg?: string | null;
  teamOrg?: string | null;
  needsWork?: unknown[];
  positive?: unknown[];
  onObsEq?: (col: string, val: unknown) => void;
}) {
  const { coachOrg = 'org-1', teamOrg = 'org-1', needsWork = [], positive = [], onObsEq } = opts;
  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') return buildChain(coachOrg === null ? null : { org_id: coachOrg });
    if (table === 'teams') return buildChain(teamOrg === null ? null : { org_id: teamOrg });
    if (table === 'observations') {
      // One chain whose data depends on which sentiment is filtered. The route
      // calls .eq('sentiment', 'needs-work') and .eq('sentiment', 'positive')
      // on two separate chains; we hand back the matching rows.
      let sentiment: string | null = null;
      const chain = buildChain([]);
      (chain.eq as ReturnType<typeof vi.fn>).mockImplementation((col: string, val: unknown) => {
        if (col === 'sentiment') sentiment = val as string;
        onObsEq?.(col, val);
        return chain;
      });
      // Resolve to the right rows when awaited.
      (chain as Record<string, unknown>).then = (onFulfilled: (v: { data: unknown; error: null }) => unknown) => {
        const rows = sentiment === 'positive' ? positive : needsWork;
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
      };
      return chain;
    }
    return buildChain(null);
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/capture/player-memory (ticket 0025)', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC1: needs-work + positive selection — both present → both returned.
  it('returns the most recent needs-work and positive observation text', async () => {
    setAuthUser();
    const nw = {
      id: 'o-nw',
      player_id: 'player-1',
      team_id: 'team-1',
      category: 'Defense',
      sentiment: 'needs-work',
      text: 'hesitated on closeouts',
      created_at: '2026-05-09T10:00:00.000Z',
    };
    const pos = {
      id: 'o-pos',
      player_id: 'player-1',
      team_id: 'team-1',
      category: 'Effort',
      sentiment: 'positive',
      text: 'first one back on defense',
      created_at: '2026-05-16T10:00:00.000Z',
    };
    wireTables({ needsWork: [nw], positive: [pos] });

    const res = await GET(makeRequest('player-1', 'team-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastNeedsWork).toBe('hesitated on closeouts');
    expect(body.lastPositive).toBe('first one back on defense');
    // observedAt is the needs-work observation's date (the primary memory line).
    expect(body.observedAt).toBe('2026-05-09T10:00:00.000Z');
  });

  // AC2: a player with zero prior observations → 200 with nulls, not an error.
  it('returns 200 with null fields when the player has no prior observations', async () => {
    setAuthUser();
    wireTables({ needsWork: [], positive: [] });

    const res = await GET(makeRequest('player-1', 'team-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastNeedsWork).toBeNull();
    expect(body.lastPositive).toBeNull();
  });

  // AC3: no auth → 401 and no DB read.
  it('returns 401 when not authenticated', async () => {
    setNoAuth();
    const res = await GET(makeRequest('player-1', 'team-1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 and performs no DB read when unauthenticated', async () => {
    setNoAuth();
    await GET(makeRequest('player-1', 'team-1'));
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  // AC4: cross-org — a player/team belonging to another org returns nulls and
  // never queries the observations of a non-owned team.
  it('returns 200 nulls for a team belonging to another org and never reads its observations', async () => {
    setAuthUser('coach-x');
    let observationsQueried = false;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-mine' });
      if (table === 'teams') return buildChain({ org_id: 'org-other' });
      if (table === 'observations') {
        observationsQueried = true;
        return buildChain([]);
      }
      return buildChain(null);
    });

    const res = await GET(makeRequest('player-other', 'team-other'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastNeedsWork).toBeNull();
    expect(body.lastPositive).toBeNull();
    // Server-side proof: the route bailed before reading another team's observations.
    expect(observationsQueried).toBe(false);
  });

  // AC5: the read excludes the in-progress note — it selects the most recent
  // PRIOR observation per sentiment via order(created_at desc) + limit(1).
  it('orders by created_at descending and limits to 1 per sentiment (excludes the in-progress note)', async () => {
    setAuthUser();
    const orderCalls: Array<[string, unknown]> = [];
    const limitCalls: number[] = [];

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1' });
      if (table === 'teams') return buildChain({ org_id: 'org-1' });
      if (table === 'observations') {
        const chain = buildChain([
          { text: 'prior row', created_at: '2026-05-09T10:00:00.000Z', sentiment: 'needs-work' },
        ]);
        (chain.order as ReturnType<typeof vi.fn>).mockImplementation(
          (col: string, opts: { ascending?: boolean }) => {
            orderCalls.push([col, opts]);
            return chain;
          }
        );
        (chain.limit as ReturnType<typeof vi.fn>).mockImplementation((n: number) => {
          limitCalls.push(n);
          return chain;
        });
        return chain;
      }
      return buildChain(null);
    });

    await GET(makeRequest('player-1', 'team-1'));
    // Ordered by created_at descending so the latest prior row wins.
    expect(orderCalls.length).toBeGreaterThanOrEqual(1);
    expect(orderCalls[0][0]).toBe('created_at');
    expect(orderCalls[0][1]).toMatchObject({ ascending: false });
    // Limited to a single row per sentiment.
    expect(limitCalls).toContain(1);
  });

  // AC1 (positive-only edge): returns 200 nulls when playerId is missing
  // (best-effort — never errors), without reading observations.
  it('returns 200 nulls without a DB observations read when playerId is missing', async () => {
    setAuthUser();
    let observationsQueried = false;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'observations') observationsQueried = true;
      return buildChain(table === 'coaches' ? { org_id: 'org-1' } : null);
    });

    const res = await GET(makeRequest(undefined, 'team-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastNeedsWork).toBeNull();
    expect(body.lastPositive).toBeNull();
    expect(observationsQueried).toBe(false);
  });
});
