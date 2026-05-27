/**
 * Ticket 0049 — POST /api/practice-plan-shares/clone.
 *
 * Save a published practice plan to ONE of the caller's teams. Inserts a fresh
 * `plans` row with `coach_id = caller`, `team_id = $teamId`, `type='practice'`,
 * `content_structured` copied byte-for-byte from the source plan, and
 * `source_plan_id = sourcePlan.id` for attribution. The clone is a fresh draft;
 * the source plan is unchanged.
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user.
 *  - 404 when the share token is missing or inactive.
 *  - 404 when the target team does not belong to the caller's org.
 *  - 200 happy path: inserts a NEW plans row, with source_plan_id stamped to
 *    the source plan id, content_structured copied verbatim, and type='practice'.
 *  - A forged `source_plan_id` in the request body is IGNORED — the route
 *    recomputes it from the token's resolved plan_id (LESSONS#39 family).
 *
 * Mocking pattern mirrors tests/api/season-rollover.test.ts. .test.ts NOT
 * .spec.ts (LESSONS#38).
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

import { POST } from '@/app/api/practice-plan-shares/clone/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = 'coach-clone-1';
const ORG_ID = 'org-1';
const OTHER_ORG_ID = 'org-2';
const TEAM_ID = 'team-clone-1';
const SOURCE_PLAN_ID = 'plan-source-1';
const SOURCE_CONTENT = {
  drills: [
    { name: 'Defensive Slides', duration_minutes: 10, focus: 'Defense' },
    { name: 'Closeout Drill', duration_minutes: 12, focus: 'Defense' },
  ],
};

const ACTIVE_SHARE = {
  id: 'share-1',
  token: 'token-abc',
  plan_id: SOURCE_PLAN_ID,
  coach_id: 'publisher-coach',
  is_active: true,
};

const SOURCE_PRACTICE_PLAN = {
  id: SOURCE_PLAN_ID,
  team_id: 'source-team',
  coach_id: 'publisher-coach',
  type: 'practice',
  title: 'Tuesday Practice',
  content_structured: SOURCE_CONTENT,
};

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(body: unknown = { token: 'token-abc', teamId: TEAM_ID }) {
  return new Request('http://localhost/api/practice-plan-shares/clone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/practice-plan-shares/clone (ticket 0049)', () => {
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

  it('returns 404 when the share token is missing or inactive', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 404 when the target team is in another org', async () => {
    setAuthUser();
    const shareChain = buildChain(ACTIVE_SHARE);
    const planChain = buildChain(SOURCE_PRACTICE_PLAN);
    const callerCoachChain = buildChain({ org_id: ORG_ID });
    const foreignTeamChain = buildChain({ id: TEAM_ID, org_id: OTHER_ORG_ID });
    const insertChain = buildChain([]);
    mockFromFn
      .mockReturnValueOnce(shareChain)
      .mockReturnValueOnce(planChain)
      .mockReturnValueOnce(callerCoachChain)
      .mockReturnValueOnce(foreignTeamChain)
      .mockReturnValueOnce(insertChain);

    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    // No plan was ever inserted for the foreign team.
    expect(insertChain.insert).not.toHaveBeenCalled();
  });

  it('happy path inserts ONE new plans row with source_plan_id stamped and content copied', async () => {
    setAuthUser();
    const shareChain = buildChain(ACTIVE_SHARE);
    const planChain = buildChain(SOURCE_PRACTICE_PLAN);
    const callerCoachChain = buildChain({ org_id: ORG_ID });
    const ownTeamChain = buildChain({ id: TEAM_ID, org_id: ORG_ID });
    const insertChain = buildChain({ id: 'new-plan-1' });
    mockFromFn
      .mockReturnValueOnce(shareChain)
      .mockReturnValueOnce(planChain)
      .mockReturnValueOnce(callerCoachChain)
      .mockReturnValueOnce(ownTeamChain)
      .mockReturnValueOnce(insertChain);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const insertArg = (insertChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.coach_id).toBe(COACH_ID);
    expect(insertArg.team_id).toBe(TEAM_ID);
    expect(insertArg.type).toBe('practice');
    expect(insertArg.source_plan_id).toBe(SOURCE_PLAN_ID);
    // content_structured copied byte-for-byte from the source plan.
    expect(insertArg.content_structured).toEqual(SOURCE_CONTENT);
  });

  it('a forged source_plan_id in the body is IGNORED — the route recomputes from the token', async () => {
    // LESSONS#39 — the route never trusts a client-supplied identifier. A
    // caller posting source_plan_id='plan-attacker' would otherwise rewrite
    // attribution on every clone. The route ignores the body field and uses
    // the token-resolved plan id.
    setAuthUser();
    const shareChain = buildChain(ACTIVE_SHARE);
    const planChain = buildChain(SOURCE_PRACTICE_PLAN);
    const callerCoachChain = buildChain({ org_id: ORG_ID });
    const ownTeamChain = buildChain({ id: TEAM_ID, org_id: ORG_ID });
    const insertChain = buildChain({ id: 'new-plan-1' });
    mockFromFn
      .mockReturnValueOnce(shareChain)
      .mockReturnValueOnce(planChain)
      .mockReturnValueOnce(callerCoachChain)
      .mockReturnValueOnce(ownTeamChain)
      .mockReturnValueOnce(insertChain);

    await POST(
      makeRequest({
        token: 'token-abc',
        teamId: TEAM_ID,
        source_plan_id: 'plan-attacker',
        sourcePlanId: 'plan-attacker',
      }),
    );

    const insertArg = (insertChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.source_plan_id).toBe(SOURCE_PLAN_ID);
    expect(insertArg.source_plan_id).not.toBe('plan-attacker');
  });

  it('refuses to clone a share whose underlying plan is not a practice plan', async () => {
    setAuthUser();
    const shareChain = buildChain(ACTIVE_SHARE);
    // The plan lookup applies .eq('type','practice') — a non-practice plan
    // resolves to null and the route 404s without ever inserting.
    const planChain = buildChain(null);
    const insertChain = buildChain([]);
    mockFromFn
      .mockReturnValueOnce(shareChain)
      .mockReturnValueOnce(planChain)
      .mockReturnValueOnce(insertChain);

    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect(insertChain.insert).not.toHaveBeenCalled();
  });
});
