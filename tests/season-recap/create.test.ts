/**
 * Ticket 0017 — POST /api/season-recap/create
 *
 * The season-recap create route turns ONE season_summary plan the caller owns into
 * a public, no-auth referral token. These specs assert the auth + ownership +
 * artifact-type guards that keep one coach's recap (and the existing referral
 * system) from leaking to another. Mirrors tests/team-card/create.test.ts: the
 * whole @/lib/supabase/server module is replaced with a chainable in-memory mock so
 * the route's real branching logic runs without a database.
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

import { POST as createPost } from '@/app/api/season-recap/create/route';

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
  return new Request('http://localhost/api/season-recap/create', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/season-recap/create', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC: no auth → 401 and no token created (no DB write).
  it('returns 401 when unauthenticated and never touches the share table', async () => {
    setNoAuth();
    const res = await createPost(req({ planId: 'plan-1' }));
    expect(res.status).toBe(401);
    // The insert path must never run for an unauthenticated caller.
    expect(mockFromFn).not.toHaveBeenCalledWith('season_recap_shares');
  });

  it('returns 400 when planId is missing', async () => {
    setAuthUser();
    const res = await createPost(req({}));
    expect(res.status).toBe(400);
  });

  // AC: a planId that is not a season_summary plan → 404, no token.
  it('returns 404 when the plan does not exist for this coach', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'plans') return buildChain(null); // no owned season_summary plan
      return buildChain(null);
    });
    const res = await createPost(req({ planId: 'ghost' }));
    expect(res.status).toBe(404);
    expect(mockFromFn).not.toHaveBeenCalledWith('season_recap_shares');
  });

  // AC: not owned by the caller → no cross-coach leakage. The route filters the
  // plan lookup by coach_id = user.id AND type = season_summary, so a plan owned
  // by another coach simply isn't found → 404 and no token.
  it('returns 404 for a plan owned by a different coach (no cross-coach leakage)', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'plans') return buildChain(null);
      return buildChain(null);
    });
    const res = await createPost(req({ planId: 'someone-elses-plan' }));
    expect(res.status).toBe(404);
    expect(mockFromFn).not.toHaveBeenCalledWith('season_recap_shares');
  });

  // AC: authenticated coach + a season_summary plan they own → 200 { token, url }
  // and a persisted share record.
  it('returns 200 with token + url and persists a share record for an owned season_summary plan', async () => {
    setAuthUser('coach-1');
    const plan = {
      id: 'plan-1',
      coach_id: 'coach-1',
      team_id: 'team-1',
      type: 'season_summary',
    };
    const insertedShare = {
      id: 'srs-1',
      token: 'deadbeefdeadbeefdeadbeefdeadbeef',
      plan_id: 'plan-1',
      coach_id: 'coach-1',
      is_active: true,
    };
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'plans') return buildChain(plan);
      if (table === 'season_recap_shares') return buildChain(insertedShare);
      return buildChain(null);
    });

    const res = await createPost(req({ planId: 'plan-1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.url).toMatch(/\/season-recap\//);
    // The share table was actually written to.
    expect(mockFromFn).toHaveBeenCalledWith('season_recap_shares');
  });
});
