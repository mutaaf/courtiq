/**
 * Ticket 0064 — POST /api/drill-shares/[token]/clone.
 *
 * Save a published drill into the caller's favorites (the existing 0039
 * primitive: coaches.preferences.favorited_drills). Writes a
 * drill_share_clones row so the publisher's clone-count rollup includes
 * this cloner. ONLY adds — never removes (so a coach who already
 * favorited the drill stays favorited).
 *
 * Acceptance criteria → tests:
 *  - 401 unauthed.
 *  - 404 when the token is unknown.
 *  - 410 when the share row is is_active=false (unpublished).
 *  - 200 happy path: the drill is added to favorites, a drill_share_clones
 *    row is written, returns { drillId, alreadyFavorited: false }.
 *  - 200 idempotent: a second clone returns { alreadyFavorited: true }
 *    and writes NO additional drill_share_clones row.
 *  - 200 self-clone is a silent no-op (the publisher previewing their own
 *    share doesn't error) — { reason: 'self' }.
 *
 * Mocking pattern mirrors tests/api/practice-plan-shares-clone.test.ts.
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

import { POST } from '@/app/api/drill-shares/[token]/clone/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const CLONER_COACH_ID = 'cloner-1';
const PUBLISHER_COACH_ID = 'publisher-1';
const DRILL_ID = 'drill-1';

const ACTIVE_SHARE = {
  id: 'share-1',
  coach_id: PUBLISHER_COACH_ID,
  drill_id: DRILL_ID,
  share_token: 'abc',
  is_active: true,
};

const CLONER_COACH = {
  id: CLONER_COACH_ID,
  preferences: { favorited_drills: [] as string[] },
};

function setAuthUser(id: string | null = CLONER_COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest() {
  return new Request('http://localhost/api/drill-shares/abc/clone', {
    method: 'POST',
  });
}

function paramsFor(token: string) {
  return { params: Promise.resolve({ token }) };
}

describe('POST /api/drill-shares/[token]/clone (ticket 0064)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the token is unknown', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await POST(makeRequest(), paramsFor('does-not-exist'));
    expect(res.status).toBe(404);
  });

  it('returns 410 when the share row is is_active=false', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(
      buildChain({ ...ACTIVE_SHARE, is_active: false }),
    );
    const res = await POST(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(410);
  });

  it('happy path adds to favorites + writes drill_share_clones row', async () => {
    setAuthUser();
    const shareChain = buildChain(ACTIVE_SHARE);
    const coachReadChain = buildChain(CLONER_COACH);
    const coachUpdateChain = buildChain({ id: CLONER_COACH_ID });
    const cloneInsertChain = buildChain(
      { id: 'clone-1', drill_share_id: 'share-1', cloner_coach_id: CLONER_COACH_ID },
      null,
    );
    mockFromFn
      .mockReturnValueOnce(shareChain) // drill_shares lookup
      .mockReturnValueOnce(coachReadChain) // coaches.preferences read
      .mockReturnValueOnce(coachUpdateChain) // coaches.preferences update (favorite add)
      .mockReturnValueOnce(cloneInsertChain) // drill_share_clones insert
      // Ticket 0073 milestone hook (LESSONS#0072 / #0118 — extend the
      // existing queue when a new from() call lands on the route).
      // Publisher has no plans and no drill_shares → short-circuits.
      .mockReturnValueOnce(buildChain([])) // hook: publisher plans (empty)
      .mockReturnValueOnce(buildChain([])); // hook: publisher drill_shares (empty)

    const res = await POST(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      drillId?: string;
      alreadyFavorited?: boolean;
    };
    expect(body.drillId).toBe(DRILL_ID);
    expect(body.alreadyFavorited).toBe(false);
    expect(coachUpdateChain.update).toHaveBeenCalled();
    expect(cloneInsertChain.insert).toHaveBeenCalled();
  });

  it('idempotent: second clone returns alreadyFavorited:true + no extra clone row', async () => {
    setAuthUser();
    const shareChain = buildChain(ACTIVE_SHARE);
    const coachReadChain = buildChain({
      id: CLONER_COACH_ID,
      preferences: { favorited_drills: [DRILL_ID] }, // already favorited
    });
    // No update / no clone insert chain is queued — the route must short-circuit.
    // To prove the clone row was NOT written, we queue an explicit
    // existing-clone lookup that returns the existing row.
    const existingCloneChain = buildChain({
      id: 'clone-existing',
      drill_share_id: 'share-1',
      cloner_coach_id: CLONER_COACH_ID,
    });
    mockFromFn
      .mockReturnValueOnce(shareChain)
      .mockReturnValueOnce(coachReadChain)
      .mockReturnValueOnce(existingCloneChain);

    const res = await POST(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadyFavorited?: boolean };
    expect(body.alreadyFavorited).toBe(true);
  });

  it('self-clone is a silent no-op { reason: "self" }', async () => {
    // Publisher is the caller — they're previewing their own share.
    setAuthUser(PUBLISHER_COACH_ID);
    const shareChain = buildChain(ACTIVE_SHARE);
    mockFromFn.mockReturnValueOnce(shareChain);

    const res = await POST(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reason?: string;
      alreadyFavorited?: boolean;
    };
    expect(body.reason).toBe('self');
  });
});
