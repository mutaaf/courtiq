/**
 * Ticket 0049 — POST /api/practice-plan-shares/create.
 *
 * Turn ONE practice plan the caller owns into a public, no-auth referral token.
 * The public page at /plan/[token] renders the plan and a CTA other coaches tap
 * to clone the plan into their own team. Free for every tier — gating publish
 * inverts the network effect (ticket decision).
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user (before any DB read).
 *  - 404 when the plan does not belong to the caller (cross-coach refusal).
 *  - 404 when the plan exists but is NOT type='practice' (the public page only
 *    renders practice plans; other plan types must never publish via this route).
 *  - 200 happy path returns { token, url: '/plan/<token>' } with a non-empty token.
 *  - Idempotent: a re-create for the same planId reuses the existing active row
 *    (never two tokens per plan).
 *
 * Mocking pattern mirrors tests/api/season-rollover.test.ts: a hoisted Supabase
 * mock with a chainable single() / then() resolver. .test.ts NOT .spec.ts
 * (LESSONS#38). The route reads a JSON body, so it is invoked with a real
 * Request (LESSONS#55).
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

import { POST } from '@/app/api/practice-plan-shares/create/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = 'coach-1';
const PLAN_ID = 'plan-1';

const OWNED_PRACTICE_PLAN = {
  id: PLAN_ID,
  team_id: 'team-1',
  coach_id: COACH_ID,
  type: 'practice',
};

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(body: unknown = { planId: PLAN_ID }) {
  return new Request('http://localhost/api/practice-plan-shares/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/practice-plan-shares/create (ticket 0049)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 when planId is missing', async () => {
    setAuthUser();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the plan belongs to a different coach', async () => {
    setAuthUser();
    // The route looks up by (id, coach_id, type) — a foreign plan returns null.
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it("returns 404 when the plan is not type='practice'", async () => {
    setAuthUser();
    // The lookup filters .eq('type','practice') — a parent_report plan won't
    // resolve. The mock returns null to match that semantic.
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it('happy path returns { token, url } with /plan/<token> shape', async () => {
    setAuthUser();
    const planChain = buildChain(OWNED_PRACTICE_PLAN);
    const existingShareChain = buildChain(null); // no existing active share
    const insertedShareChain = buildChain({
      id: 'share-1',
      token: 'deadbeef',
      plan_id: PLAN_ID,
      coach_id: COACH_ID,
      is_active: true,
    });
    mockFromFn
      .mockReturnValueOnce(planChain)             // plans (ownership lookup)
      .mockReturnValueOnce(existingShareChain)    // practice_plan_shares (idempotency)
      .mockReturnValueOnce(insertedShareChain);   // practice_plan_shares insert

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string; url?: string };
    expect(typeof body.token).toBe('string');
    expect(body.token!.length).toBeGreaterThan(0);
    expect(body.url).toBe(`/plan/${body.token}`);
  });

  it('is idempotent: re-create returns the EXISTING active token (never two)', async () => {
    setAuthUser();
    const planChain = buildChain(OWNED_PRACTICE_PLAN);
    const existingShareChain = buildChain({
      id: 'share-existing',
      token: 'existing-token-abc',
      plan_id: PLAN_ID,
      coach_id: COACH_ID,
      is_active: true,
    });
    const insertChain = buildChain(null);
    mockFromFn
      .mockReturnValueOnce(planChain)
      .mockReturnValueOnce(existingShareChain)
      .mockReturnValueOnce(insertChain); // never reached on the idempotent path

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string; url?: string };
    expect(body.token).toBe('existing-token-abc');
    expect(body.url).toBe('/plan/existing-token-abc');
    // No insert ran — the route reused the existing share.
    expect(insertChain.insert).not.toHaveBeenCalled();
  });
});
