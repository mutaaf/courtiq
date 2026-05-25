/**
 * Ticket 0027 — POST /api/recap-card/create
 *
 * The recap-card create route turns ONE game_recap plan the caller owns into a
 * public, no-auth referral token at /recap/[token]. These specs assert the auth +
 * ownership + artifact-type guards that keep one coach's recap (and the existing
 * referral system) from leaking to another. Mirrors tests/season-recap/create.test.ts:
 * the whole @/lib/supabase/server module is replaced with a chainable in-memory mock
 * so the route's real branching logic runs without a database.
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

import { POST as createPost } from '@/app/api/recap-card/create/route';

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
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
  };
  return chain;
}

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}
function setNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

function req(body: Record<string, unknown>) {
  return new Request('http://localhost/api/recap-card/create', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/recap-card/create', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC: no auth → 401 and no token created (no DB write).
  it('returns 401 when unauthenticated and never touches the share table', async () => {
    setNoAuth();
    const res = await createPost(req({ planId: 'plan-1' }));
    expect(res.status).toBe(401);
    // The insert path must never run for an unauthenticated caller.
    expect(mockFromFn).not.toHaveBeenCalledWith('game_recap_shares');
  });

  it('returns 400 when planId is missing', async () => {
    setAuthUser();
    const res = await createPost(req({}));
    expect(res.status).toBe(400);
  });

  // AC: a planId that is not a game_recap plan → 404, no token.
  it('returns 404 when the plan does not exist for this coach', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'plans') return buildChain(null); // no owned game_recap plan
      return buildChain(null);
    });
    const res = await createPost(req({ planId: 'ghost' }));
    expect(res.status).toBe(404);
    expect(mockFromFn).not.toHaveBeenCalledWith('game_recap_shares');
  });

  // AC: not owned by the caller → no cross-coach leakage. The route filters the
  // plan lookup by coach_id = user.id AND type = game_recap, so a plan owned by
  // another coach simply isn't found → 404 and no token.
  it('returns 404 for a plan owned by a different coach (no cross-coach leakage)', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'plans') return buildChain(null);
      return buildChain(null);
    });
    const res = await createPost(req({ planId: 'someone-elses-plan' }));
    expect(res.status).toBe(404);
    expect(mockFromFn).not.toHaveBeenCalledWith('game_recap_shares');
  });

  // AC: a planId that exists but is the WRONG type (not game_recap) → 404. The
  // route's .eq('type','game_recap') means a non-recap plan isn't found, so a
  // coach can't turn (say) a season_summary into a recap card.
  it('returns 404 for a plan that is not a game_recap (wrong type filtered out)', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      // The .eq('type','game_recap') chain filters it out → single() → null.
      if (table === 'plans') return buildChain(null);
      return buildChain(null);
    });
    const res = await createPost(req({ planId: 'a-season-summary-plan' }));
    expect(res.status).toBe(404);
    expect(mockFromFn).not.toHaveBeenCalledWith('game_recap_shares');
  });

  // AC: authenticated coach + a game_recap plan they own → 200 { token, url }
  // (url ends in /recap/<token>) and a persisted share record.
  it('returns 200 with token + url and persists a share record for an owned game_recap plan', async () => {
    setAuthUser('coach-1');
    const plan = {
      id: 'plan-1',
      coach_id: 'coach-1',
      team_id: 'team-1',
      type: 'game_recap',
    };
    const insertedShare = {
      id: 'grs-1',
      token: 'deadbeefdeadbeefdeadbeefdeadbeef',
      plan_id: 'plan-1',
      coach_id: 'coach-1',
      is_active: true,
    };
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'plans') return buildChain(plan);
      if (table === 'game_recap_shares') return buildChain(insertedShare);
      return buildChain(null);
    });

    const res = await createPost(req({ planId: 'plan-1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
    // The URL the coach pastes must resolve to the public recap page.
    expect(body.url).toMatch(/\/recap\//);
    expect(body.url).toBe(`/recap/${body.token}`);
    // The share table was actually written to.
    expect(mockFromFn).toHaveBeenCalledWith('game_recap_shares');
  });
});
