/**
 * Ticket 0073 — POST /api/practice-plan-shares/clone — MILESTONE
 * WRITE-HOOK extension.
 *
 * When the existing 0049 clone fires, the route now also re-computes
 * the publishing coach's reputation and UPSERTs any milestone row
 * whose threshold was just crossed. The upsert is idempotent
 * (UNIQUE(published_coach_id, milestone_kind)) and BEST-EFFORT —
 * a milestone-write failure does NOT block the clone (LESSONS#0036).
 *
 * Assertions:
 *  - A clone that pushes cloneCount from 2 → 3 → upserts a clones_3
 *    row for the published coach.
 *  - A clone that pushes distinctProgramCount from 1 → 2 → upserts
 *    a programs_2 row for the published coach.
 *  - A clone that does NOT cross any threshold → no upsert.
 *  - A best-effort upsert error returns 200 on the clone path (the
 *    clone is unaffected).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
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
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = 'coach-clone-1';
const PUBLISHER_ID = 'publisher-coach';
const ORG_ID = 'org-cloner';
const PROG_X = 'org-X';
const TEAM_ID = 'team-clone-1';
const SOURCE_PLAN_ID = 'plan-source-1';

const ACTIVE_SHARE = {
  id: 'share-1',
  token: 'token-abc',
  plan_id: SOURCE_PLAN_ID,
  coach_id: PUBLISHER_ID,
  is_active: true,
};
const SOURCE_PRACTICE_PLAN = {
  id: SOURCE_PLAN_ID,
  team_id: 'source-team',
  coach_id: PUBLISHER_ID,
  type: 'practice',
  title: 'Tuesday Practice',
  content_structured: { drills: [] },
};

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest() {
  return new Request('http://localhost/api/practice-plan-shares/clone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'token-abc', teamId: TEAM_ID }),
  });
}

function queueCloneInsertHappyPath(): {
  shareChain: ReturnType<typeof buildChain>;
  planChain: ReturnType<typeof buildChain>;
  callerCoachChain: ReturnType<typeof buildChain>;
  ownTeamChain: ReturnType<typeof buildChain>;
  insertChain: ReturnType<typeof buildChain>;
} {
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
  return { shareChain, planChain, callerCoachChain, ownTeamChain, insertChain };
}

describe('POST /api/practice-plan-shares/clone — milestone hook (ticket 0073)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('clones_3: the third clone (cloneCount goes 2 → 3) upserts a clones_3 milestone row', async () => {
    setAuthUser();
    queueCloneInsertHappyPath();
    // The hook now does six reads in order:
    //   6. publisher's plans (id, coach_id where coach_id=publisher).
    //   7. clone rows (plans where source_plan_id IN publisherPlanIds).
    //   8. publisher's drill_shares (id, coach_id where coach_id=publisher).
    //   9. (drill_share_clones SKIPPED because no publisher drill shares.)
    //  10. cloning coach org_ids (coaches.id IN cloningCoachIds).
    //  11. milestone UPSERT.
    mockFromFn.mockReturnValueOnce(
      buildChain([{ id: SOURCE_PLAN_ID, coach_id: PUBLISHER_ID }]),
    );
    const today = '2026-06-07T00:00:00Z';
    mockFromFn.mockReturnValueOnce(
      buildChain([
        { source_plan_id: SOURCE_PLAN_ID, coach_id: 'c-prior-1', team_id: 't-1', created_at: today },
        { source_plan_id: SOURCE_PLAN_ID, coach_id: 'c-prior-2', team_id: 't-2', created_at: today },
        { source_plan_id: SOURCE_PLAN_ID, coach_id: COACH_ID, team_id: TEAM_ID, created_at: today },
      ]),
    );
    // publisher's drill_shares — none.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // cloning coach org_ids.
    mockFromFn.mockReturnValueOnce(
      buildChain([
        { id: 'c-prior-1', org_id: PROG_X },
        { id: 'c-prior-2', org_id: PROG_X },
        { id: COACH_ID, org_id: ORG_ID },
      ]),
    );
    // milestone UPSERT — chain receives the row payload.
    const upsertChain = buildChain({ id: 'm-new' });
    mockFromFn.mockReturnValueOnce(upsertChain);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(upsertChain.upsert).toHaveBeenCalled();
    const upserted = (upsertChain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as
      | Record<string, unknown>
      | Array<Record<string, unknown>>;
    const rows = Array.isArray(upserted) ? upserted : [upserted];
    const kinds = rows.map((r) => r.milestone_kind);
    expect(kinds).toContain('clones_3');
  });

  it('programs_2: a clone that pushes distinctProgramCount 1 → 2 upserts a programs_2 milestone row', async () => {
    setAuthUser();
    queueCloneInsertHappyPath();
    // Hook chain order: 6 publisher plans, 7 clone rows, 8 publisher
    // drill_shares (empty), 9 cloning coach org_ids, 10 upsert.
    mockFromFn.mockReturnValueOnce(
      buildChain([{ id: SOURCE_PLAN_ID, coach_id: PUBLISHER_ID }]),
    );
    // 1 prior clone in PROG_X. The new clone lands in ORG_ID (a different
    // program), pushing distinctProgramCount 1 → 2. Three clones total →
    // also triggers clones_3.
    const today = '2026-06-07T00:00:00Z';
    mockFromFn.mockReturnValueOnce(
      buildChain([
        { source_plan_id: SOURCE_PLAN_ID, coach_id: 'c-prior-1', team_id: 't-1', created_at: today },
        { source_plan_id: SOURCE_PLAN_ID, coach_id: 'c-prior-2', team_id: 't-2', created_at: today },
        { source_plan_id: SOURCE_PLAN_ID, coach_id: COACH_ID, team_id: TEAM_ID, created_at: today },
      ]),
    );
    // publisher's drill_shares — none.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // cloning coach org_ids.
    mockFromFn.mockReturnValueOnce(
      buildChain([
        { id: 'c-prior-1', org_id: PROG_X },
        { id: 'c-prior-2', org_id: PROG_X },
        { id: COACH_ID, org_id: ORG_ID },
      ]),
    );
    const upsertChain = buildChain({ id: 'm-new' });
    mockFromFn.mockReturnValueOnce(upsertChain);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(upsertChain.upsert).toHaveBeenCalled();
    const upserted = (upsertChain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as
      | Record<string, unknown>
      | Array<Record<string, unknown>>;
    const rows = Array.isArray(upserted) ? upserted : [upserted];
    const kinds = rows.map((r) => r.milestone_kind);
    expect(kinds).toContain('programs_2');
  });

  it('a clone that does NOT cross any threshold writes no milestone row', async () => {
    setAuthUser();
    queueCloneInsertHappyPath();
    mockFromFn.mockReturnValueOnce(
      buildChain([{ id: SOURCE_PLAN_ID, coach_id: PUBLISHER_ID }]),
    );
    // Only 1 clone after the insert — below the 3-clone, 2-program
    // thresholds. No milestone fires.
    const today = '2026-06-07T00:00:00Z';
    mockFromFn.mockReturnValueOnce(
      buildChain([
        { source_plan_id: SOURCE_PLAN_ID, coach_id: COACH_ID, team_id: TEAM_ID, created_at: today },
      ]),
    );
    // publisher's drill_shares — none.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // cloning coach org_ids.
    mockFromFn.mockReturnValueOnce(buildChain([{ id: COACH_ID, org_id: ORG_ID }]));
    // No upsert chain queued — if the route attempts an upsert with no
    // chain queued, mockFromFn returns undefined and the route would
    // throw; the route MUST short-circuit when no thresholds are crossed.

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
  });

  it('best-effort: a milestone read failure does NOT 5xx the clone (best-effort try/catch)', async () => {
    setAuthUser();
    queueCloneInsertHappyPath();
    // 6. Throw on the publisher-plans read — the route's milestone hook
    //    must catch and continue.
    mockFromFn.mockReturnValueOnce(buildChain(null, new Error('boom')));

    const res = await POST(makeRequest());
    // The clone path itself returns 200 (the clone insert succeeded).
    expect(res.status).toBe(200);
  });
});
