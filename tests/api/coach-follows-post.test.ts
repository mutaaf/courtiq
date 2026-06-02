/**
 * Ticket 0063 — POST /api/coach-follows.
 *
 * The cloning coach taps "Follow Coach <Name>" on the public plan page (or the
 * league-feed card) and the client POSTs { followee_id } to this route. The
 * route writes a row to `coach_follows` with follower=auth.user.id, followee=
 * body.followee_id. Idempotent: a second POST returns 200 with
 * { alreadyFollowing: true } (the UNIQUE constraint protects the row count).
 *
 * Tier posture: NEITHER following nor being-followed is tier-gated. The route
 * MUST NOT import `src/lib/tier.ts` (asserted by an indirect proxy here — the
 * 200 happy path runs against a free-tier publisher).
 *
 * Rate limit: at most 30 follows per coach per rolling 7 days. The route
 * counts existing rows whose follower_id = caller in the last 7 days and
 * returns 429 on the 31st.
 *
 * Acceptance criteria → tests:
 *  - 401 unauthed (no row written).
 *  - 200 first follow (row inserted).
 *  - 200 duplicate POST with { alreadyFollowing: true } (no second row).
 *  - 400 on self-follow (followee_id == caller).
 *  - 429 on the 31st follow in the rolling 7-day window.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { POST } from '@/app/api/coach-follows/route';

interface BuildChainOpts {
  selectData?: unknown;
  selectError?: unknown;
  insertData?: unknown;
  insertError?: unknown;
  countValue?: number;
}

/**
 * A thenable chain mock. Supabase-js routes await `.eq().eq()`-terminated
 * chains; the final await must resolve to { data, error }. We expose `then` so
 * the route's `await chain` resolves to a settled value AND keeps `.eq()`
 * returning the same chain object for chained calls (LESSONS#108).
 *
 * The insert path returns `insertData / insertError`; the select / count path
 * returns `selectData / selectError`. The `countValue` is for `.select(...,
 * { count: 'exact', head: true })` style calls that resolve to { count }.
 */
function buildChain(opts: BuildChainOpts = {}) {
  const {
    selectData = null,
    selectError = null,
    insertData = null,
    insertError = null,
    countValue,
  } = opts;

  const selectResolved = { data: selectData, error: selectError };
  const insertResolved = { data: insertData, error: insertError };
  const countResolved = { count: countValue ?? 0, error: null, data: null };

  // The chain tracks which operation was invoked so the terminal await resolves
  // to the right payload.
  let mode: 'select' | 'insert' | 'count' = 'select';

  const chain: Record<string, unknown> = {
    select: vi.fn((_cols?: string, opts2?: { count?: string; head?: boolean }) => {
      if (opts2?.count === 'exact' && opts2?.head) mode = 'count';
      else mode = 'select';
      return chain;
    }),
    insert: vi.fn(() => {
      mode = 'insert';
      return chain;
    }),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    single: vi.fn(async () => selectResolved),
    maybeSingle: vi.fn(async () => selectResolved),
    then: (onFulfilled: (v: unknown) => unknown) => {
      const resolved =
        mode === 'insert' ? insertResolved : mode === 'count' ? countResolved : selectResolved;
      return Promise.resolve(resolved).then(onFulfilled);
    },
  };
  return chain;
}

const FOLLOWER_ID = 'follower-coach-id';
const FOLLOWEE_ID = 'followee-coach-id';

function setAuthUser(id: string | null = FOLLOWER_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/coach-follows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/coach-follows (ticket 0063)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(makeRequest({ followee_id: FOLLOWEE_ID }));
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 on a self-follow (followee_id === auth.user.id)', async () => {
    setAuthUser();
    const res = await POST(makeRequest({ followee_id: FOLLOWER_ID }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });

  it('returns 400 when followee_id is missing or malformed', async () => {
    setAuthUser();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('happy path: writes one coach_follows row and returns 200', async () => {
    setAuthUser();

    // Chain order:
    //   1) count rolling 7-day follows by caller (rate limit) → < 30
    //   2) insert into coach_follows → ok
    const rateLimitChain = buildChain({ countValue: 4 });
    const insertChain = buildChain({
      insertData: {
        id: 'follow-row-1',
        follower_id: FOLLOWER_ID,
        followee_id: FOLLOWEE_ID,
        created_at: '2026-06-01T00:00:00.000Z',
      },
    });

    mockFromFn.mockReturnValueOnce(rateLimitChain).mockReturnValueOnce(insertChain);

    const res = await POST(makeRequest({ followee_id: FOLLOWEE_ID }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok?: boolean;
      alreadyFollowing?: boolean;
      followeeId?: string;
    };
    expect(body.ok).toBe(true);
    expect(body.alreadyFollowing).not.toBe(true);
    expect(body.followeeId).toBe(FOLLOWEE_ID);

    // The from() calls hit coach_follows both times (rate-limit count + insert).
    const fromCalls = mockFromFn.mock.calls.map((c) => c[0]);
    expect(fromCalls).toEqual(['coach_follows', 'coach_follows']);

    // The insert payload pinned follower_id to the auth user, not the body.
    const insertSpy = insertChain.insert as ReturnType<typeof vi.fn>;
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.follower_id).toBe(FOLLOWER_ID);
    expect(payload.followee_id).toBe(FOLLOWEE_ID);
  });

  it('duplicate POST returns 200 with { alreadyFollowing: true } and no second row', async () => {
    setAuthUser();

    // Chain order:
    //   1) rate-limit count → low
    //   2) insert returns the postgres unique-violation code 23505 — the
    //      route catches it and resolves to alreadyFollowing.
    const rateLimitChain = buildChain({ countValue: 4 });
    const dupInsertChain = buildChain({
      insertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    mockFromFn.mockReturnValueOnce(rateLimitChain).mockReturnValueOnce(dupInsertChain);

    const res = await POST(makeRequest({ followee_id: FOLLOWEE_ID }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; alreadyFollowing?: boolean };
    expect(body.ok).toBe(true);
    expect(body.alreadyFollowing).toBe(true);
  });

  it('returns 429 when the caller already has 30+ follows in the last 7 days', async () => {
    setAuthUser();

    // The 31st attempt — rate-limit count returns 30 (>= 30) so the route
    // short-circuits before any insert.
    const rateLimitChain = buildChain({ countValue: 30 });
    mockFromFn.mockReturnValueOnce(rateLimitChain);

    const res = await POST(makeRequest({ followee_id: FOLLOWEE_ID }));
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();

    // Only ONE from() call (the count) — the insert never ran.
    expect(mockFromFn).toHaveBeenCalledTimes(1);
  });
});
