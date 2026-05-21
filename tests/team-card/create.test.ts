/**
 * Ticket 0010 — POST /api/team-card/create
 *
 * The team-card create route turns ONE team_personality plan the caller owns into
 * a public, no-auth referral token. These specs assert the auth + ownership +
 * artifact-type guards that keep one coach's card (and the existing referral
 * system) from leaking to another.
 *
 * Strategy mirrors tests/api-routes.test.ts: the whole @/lib/supabase/server
 * module is replaced with a chainable in-memory mock so the route's real branching
 * logic runs without a database.
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

import { POST as createPost } from '@/app/api/team-card/create/route';

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
  return new Request('http://localhost/api/team-card/create', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/team-card/create', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC: no auth → 401 and no token created.
  it('returns 401 when unauthenticated and never touches the share table', async () => {
    setNoAuth();
    const res = await createPost(req({ planId: 'plan-1' }));
    expect(res.status).toBe(401);
    // The insert path must never run for an unauthenticated caller.
    expect(mockFromFn).not.toHaveBeenCalledWith('team_card_shares');
  });

  it('returns 400 when planId is missing', async () => {
    setAuthUser();
    const res = await createPost(req({}));
    expect(res.status).toBe(400);
  });

  // AC: a planId that is not a team_personality plan → 403/404, no token.
  it('returns 404 when the plan does not exist for this coach', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'plans') return buildChain(null); // no owned team_personality plan
      return buildChain(null);
    });
    const res = await createPost(req({ planId: 'ghost' }));
    expect([403, 404]).toContain(res.status);
    expect(mockFromFn).not.toHaveBeenCalledWith('team_card_shares');
  });

  // AC: not owned by the caller → no cross-coach leakage. The route filters the
  // plan lookup by coach_id = user.id AND type = team_personality, so a plan owned
  // by another coach simply isn't found → 404 and no token.
  it('returns 404 for a plan owned by a different coach (no cross-coach leakage)', async () => {
    setAuthUser('coach-1');
    // Plan lookup scoped to coach_id+type returns nothing because the row belongs
    // to coach-2; the mock returns null to model the scoped query missing.
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'plans') return buildChain(null);
      return buildChain(null);
    });
    const res = await createPost(req({ planId: 'someone-elses-plan' }));
    expect([403, 404]).toContain(res.status);
    expect(mockFromFn).not.toHaveBeenCalledWith('team_card_shares');
  });

  // AC: authenticated coach + a team_personality plan they own → 200 { token, url }
  // and a persisted share record.
  it('returns 200 with token + url and persists a share record for an owned team_personality plan', async () => {
    setAuthUser('coach-1');
    const plan = {
      id: 'plan-1',
      coach_id: 'coach-1',
      team_id: 'team-1',
      type: 'team_personality',
    };
    const insertedShare = {
      id: 'tcs-1',
      token: 'deadbeefdeadbeefdeadbeefdeadbeef',
      plan_id: 'plan-1',
      coach_id: 'coach-1',
      is_active: true,
    };
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'plans') return buildChain(plan);
      if (table === 'team_card_shares') return buildChain(insertedShare);
      return buildChain(null);
    });

    const res = await createPost(req({ planId: 'plan-1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.url).toMatch(/\/team-card\//);
    // The share table was actually written to.
    expect(mockFromFn).toHaveBeenCalledWith('team_card_shares');
  });
});
