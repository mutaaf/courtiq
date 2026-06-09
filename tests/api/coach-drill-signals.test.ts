/**
 * Ticket 0039 — GET + PATCH /api/coach-drill-signals.
 *
 * AC2: GET returns the caller's signals scoped server-side; a second coach
 *      calling the same route NEVER sees the first coach's signals.
 * AC3: PATCH { drill_id, rating: 'up'|'down' } upserts the row; rating: null
 *      deletes it. The route NEVER trusts a client-supplied `coach_id` — it
 *      always resolves it from `auth.getUser()`.
 * AC2/AC3 auth: both verbs 401 when unauthenticated.
 * AC7: the GET payload contains ONLY (drill_id, rating, run_count,
 *      last_rated_at) — no team_id, no player ref.
 *
 * Strategy mirrors tests/api/season-rollover.test.ts: a chainable in-memory
 * Supabase mock. The route's GET takes no args (LESSONS#0008 — invoke as
 * `GET()`); PATCH takes a real Request.
 *
 * .test.ts NOT .spec.ts — vitest excludes the Playwright spec glob (LESSONS#38).
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

import { GET, PATCH } from '@/app/api/coach-drill-signals/route';

// ─── Chainable mock helper ─────────────────────────────────────────────────────

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COACH_A = '00000000-0000-4000-a000-000000000001';
const COACH_B = '00000000-0000-4000-a000-000000000002';
const DRILL_X = '00000000-0000-4000-a000-0000000000a1';
const DRILL_Y = '00000000-0000-4000-a000-0000000000a2';

function setAuthUser(id: string | null) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function patchRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/coach-drill-signals', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // LESSONS#0092 — clearAllMocks() does NOT drain a mock's
  // mockReturnValueOnce queue. The 0076 ticket added a stick-write
  // hook on the PATCH path that fires extra from() reads after the
  // thumbs-up upsert; resetting the queue here keeps each `it()`
  // hermetic.
  mockFromFn.mockReset();
});

// ─── AC2: GET scoping + payload shape ────────────────────────────────────────

describe('GET /api/coach-drill-signals (ticket 0039)', () => {
  it('401s when there is no authenticated user (no read either)', async () => {
    setAuthUser(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns only the caller-scoped signals (coach A never sees coach B)', async () => {
    setAuthUser(COACH_A);
    const coachASignals = [
      { drill_id: DRILL_X, rating: 'up', run_count: 3, last_rated_at: '2026-05-26T00:00:00Z' },
      { drill_id: DRILL_Y, rating: 'down', run_count: 1, last_rated_at: '2026-05-25T00:00:00Z' },
    ];
    const chain = buildChain(coachASignals);
    mockFromFn.mockReturnValueOnce(chain);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockFromFn).toHaveBeenCalledWith('coach_drill_signals');
    // The route scopes server-side via .eq('coach_id', user.id) — the AUTH user.
    expect(chain.eq).toHaveBeenCalledWith('coach_id', COACH_A);
    expect(body.signals).toEqual(coachASignals);
  });

  it('a different authenticated coach receives only their OWN signals (independent calls)', async () => {
    // First call: coach A.
    setAuthUser(COACH_A);
    const chainA = buildChain([{ drill_id: DRILL_X, rating: 'up', run_count: 2, last_rated_at: '2026-05-26T00:00:00Z' }]);
    mockFromFn.mockReturnValueOnce(chainA);
    const resA = await GET();
    const bodyA = await resA.json();
    expect(bodyA.signals).toHaveLength(1);
    expect(chainA.eq).toHaveBeenCalledWith('coach_id', COACH_A);

    // Second call: coach B, completely separate.
    setAuthUser(COACH_B);
    const chainB = buildChain([
      { drill_id: DRILL_Y, rating: 'down', run_count: 5, last_rated_at: '2026-05-26T01:00:00Z' },
    ]);
    mockFromFn.mockReturnValueOnce(chainB);
    const resB = await GET();
    const bodyB = await resB.json();
    expect(bodyB.signals).toHaveLength(1);
    expect(bodyB.signals[0].drill_id).toBe(DRILL_Y);
    expect(chainB.eq).toHaveBeenCalledWith('coach_id', COACH_B);
    // The two reads were filtered by DIFFERENT coach ids — never each other's.
    expect(chainA.eq).not.toHaveBeenCalledWith('coach_id', COACH_B);
    expect(chainB.eq).not.toHaveBeenCalledWith('coach_id', COACH_A);
  });

  it('payload exposes ONLY (drill_id, rating, run_count, last_rated_at) — no team_id, no player ref (COPPA)', async () => {
    setAuthUser(COACH_A);
    const chain = buildChain([
      { drill_id: DRILL_X, rating: 'up', run_count: 4, last_rated_at: '2026-05-26T00:00:00Z' },
    ]);
    mockFromFn.mockReturnValueOnce(chain);

    const res = await GET();
    const body = await res.json();

    const ALLOWED = new Set(['drill_id', 'rating', 'run_count', 'last_rated_at']);
    const BANNED = ['team_id', 'player_id', 'player_name', 'observation', 'date_of_birth', 'parent_email'];

    for (const sig of body.signals) {
      for (const key of Object.keys(sig)) {
        expect(ALLOWED.has(key)).toBe(true);
        expect(BANNED).not.toContain(key);
      }
    }

    // The route's select also asks the DB for ONLY those columns (defense in depth).
    expect(chain.select).toHaveBeenCalledWith('drill_id, rating, run_count, last_rated_at');
  });

  it('returns an empty signals list when the read errors (UI falls back to localStorage cleanly)', async () => {
    setAuthUser(COACH_A);
    const chain = buildChain(null, { message: 'simulated' });
    mockFromFn.mockReturnValueOnce(chain);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.signals).toEqual([]);
  });
});

// ─── AC3: PATCH semantics ────────────────────────────────────────────────────

describe('PATCH /api/coach-drill-signals (ticket 0039)', () => {
  it('401s when there is no authenticated user (no write either)', async () => {
    setAuthUser(null);
    const res = await PATCH(patchRequest({ drill_id: DRILL_X, rating: 'up' }));
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('400s on missing/invalid drill_id', async () => {
    setAuthUser(COACH_A);
    const res = await PATCH(patchRequest({ rating: 'up' }));
    expect(res.status).toBe(400);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('400s on an unrecognized rating value', async () => {
    setAuthUser(COACH_A);
    const res = await PATCH(patchRequest({ drill_id: DRILL_X, rating: 'meh' }));
    expect(res.status).toBe(400);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('upserts the row with the AUTH coach_id (never a client-supplied one)', async () => {
    setAuthUser(COACH_A);
    const upserted = { drill_id: DRILL_X, rating: 'up', run_count: 0, last_rated_at: '2026-05-26T00:00:00Z' };
    const chain = buildChain(upserted);
    mockFromFn.mockReturnValueOnce(chain);

    // A malicious body claiming to be coach B must be IGNORED — the auth user wins.
    const res = await PATCH(patchRequest({ coach_id: COACH_B, drill_id: DRILL_X, rating: 'up' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.signal).toEqual(upserted);

    // The upsert payload carries coach_id = AUTH user (COACH_A), NEVER COACH_B.
    const upsertCall = (chain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as { coach_id: string; drill_id: string; rating: string };
    expect(upsertCall.coach_id).toBe(COACH_A);
    expect(upsertCall.coach_id).not.toBe(COACH_B);
    expect(upsertCall.drill_id).toBe(DRILL_X);
    expect(upsertCall.rating).toBe('up');
  });

  it('deletes the row when rating is null (matches toggle-removes-existing semantics)', async () => {
    setAuthUser(COACH_A);
    const chain = buildChain(null);
    mockFromFn.mockReturnValueOnce(chain);

    const res = await PATCH(patchRequest({ drill_id: DRILL_X, rating: null }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);

    // The delete is scoped by BOTH coach_id (AUTH) and drill_id.
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('coach_id', COACH_A);
    expect(chain.eq).toHaveBeenCalledWith('drill_id', DRILL_X);
  });

  it('persists an optional run_count when the client supplies one', async () => {
    setAuthUser(COACH_A);
    const upserted = { drill_id: DRILL_X, rating: 'up', run_count: 7, last_rated_at: '2026-05-26T00:00:00Z' };
    const chain = buildChain(upserted);
    mockFromFn.mockReturnValueOnce(chain);

    await PATCH(patchRequest({ drill_id: DRILL_X, rating: 'up', run_count: 7 }));

    const upsertCall = (chain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as { run_count?: number };
    expect(upsertCall.run_count).toBe(7);
  });
});
