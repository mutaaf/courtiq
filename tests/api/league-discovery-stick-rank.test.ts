/**
 * Ticket 0076 — GET /api/practice-plan-shares/league — STICK-RANK
 * EXTENSION.
 *
 * The existing 0073 reputation extension ranks by
 *  (distinctProgramCount desc, cloneCount desc, recency desc).
 * This extension re-ranks by
 *  (stuckProgramCount desc, distinctProgramCount desc, cloneCount
 *   desc, recency desc) — a plan that stuck in 3 programs
 *  out-ranks a plan that was cloned by 5 programs but stuck in zero.
 *
 * The route gains ONE new from() call: a
 * `drill_clone_stick_signals` read scoped to the publisher's drill
 * share ids. The new keys default to 0 when no stick rows exist,
 * so the sort tuple ties on the existing 0073 order — BYTE-
 * IDENTICAL when no stick signals exist.
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

import { GET } from '@/app/api/practice-plan-shares/league/route';
import { bustLeagueCache } from '@/lib/cache/league-plans-cache';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
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

const CALLER_ID = 'coach-caller';
const CALLER_ORG = 'org-A';
const TEAM_ID = 'team-caller-1';
const SPORT_ID = 'sport-basketball';

const MAYA = 'coach-maya';
const SARAH = 'coach-sarah';

function setAuthUser(id: string | null = CALLER_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest() {
  return new Request(`http://localhost/api/practice-plan-shares/league?teamId=${TEAM_ID}`, {
    method: 'GET',
  });
}

function queueBaselineSharesChain(shares: unknown) {
  mockFromFn.mockReturnValueOnce(
    buildChain({ id: TEAM_ID, coach_id: CALLER_ID, sport_id: SPORT_ID }),
  );
  mockFromFn.mockReturnValueOnce(buildChain({ id: CALLER_ID, org_id: CALLER_ORG }));
  mockFromFn.mockReturnValueOnce(
    buildChain([
      { id: MAYA, full_name: 'Maya Walker', org_id: CALLER_ORG },
      { id: SARAH, full_name: 'Sarah Reed', org_id: CALLER_ORG },
    ]),
  );
  mockFromFn.mockReturnValueOnce(
    buildChain([
      { id: 'team-maya', sport_id: SPORT_ID, age_group: '11-13', sports: { slug: 'basketball' } },
      { id: 'team-sarah', sport_id: SPORT_ID, age_group: '11-13', sports: { slug: 'basketball' } },
    ]),
  );
  mockFromFn.mockReturnValueOnce(buildChain(shares));
}

describe('GET /api/practice-plan-shares/league — stick-rank extension (ticket 0076)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    bustLeagueCache(CALLER_ORG);
  });

  it('two plans above the 0073 threshold, one with stuckProgramCount = 3 and one with 0 → the stuck one is first', async () => {
    setAuthUser();
    queueBaselineSharesChain([
      // Sarah's plan is MORE RECENT; under 0073 alone Sarah would
      // out-rank Maya. Both have identical clone counts (3 in 2
      // programs) so the 0073 tuple ties — meaning the existing 0073
      // recency tiebreaker would put Sarah first.
      {
        id: 'share-sarah',
        token: 'tok-sarah',
        coach_id: SARAH,
        plan_id: 'plan-sarah',
        note: null,
        created_at: '2026-06-08T20:00:00.000Z',
        is_active: true,
        plans: { id: 'plan-sarah', title: 'Sarah plan', team_id: 'team-sarah' },
      },
      {
        id: 'share-maya',
        token: 'tok-maya',
        coach_id: MAYA,
        plan_id: 'plan-maya',
        note: null,
        created_at: '2026-06-06T20:00:00.000Z',
        is_active: true,
        plans: { id: 'plan-maya', title: 'Maya plan', team_id: 'team-maya' },
      },
    ]);
    // 6. plans (clones).
    const today = new Date(Date.now() - 60 * 1000).toISOString();
    const mayaClones = [1, 2, 3].map((i) => ({
      source_plan_id: 'plan-maya',
      coach_id: `cloner-m-${i}`,
      team_id: `team-cloner-m-${i}`,
      created_at: today,
    }));
    const sarahClones = [1, 2, 3].map((i) => ({
      source_plan_id: 'plan-sarah',
      coach_id: `cloner-s-${i}`,
      team_id: `team-cloner-s-${i}`,
      created_at: today,
    }));
    mockFromFn.mockReturnValueOnce(buildChain([...mayaClones, ...sarahClones]));
    // 7. drill_shares (publisher's). Maya has one share; Sarah none.
    //    The stick read filters by these share ids.
    mockFromFn.mockReturnValueOnce(
      buildChain([{ id: 'share-maya-drill', coach_id: MAYA }]),
    );
    // 8. drill_share_clones — none of these are clones-of-drill-shares
    //    (Maya's clones are plan clones). Empty.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // 9. drill_clone_stick_signals — Maya has 3 stuck rows in 2
    //    distinct cloner_org_ids (P, Q); Sarah has none.
    mockFromFn.mockReturnValueOnce(
      buildChain([
        {
          drill_share_id: 'share-maya-drill',
          cloner_coach_id: 'cloner-m-1',
          cloner_org_id: 'prog-P',
          stuck_at: today,
        },
        {
          drill_share_id: 'share-maya-drill',
          cloner_coach_id: 'cloner-m-2',
          cloner_org_id: 'prog-P',
          stuck_at: today,
        },
        {
          drill_share_id: 'share-maya-drill',
          cloner_coach_id: 'cloner-m-3',
          cloner_org_id: 'prog-Q',
          stuck_at: today,
        },
      ]),
    );
    // 10. coaches (cloning-coach org_id resolution).
    mockFromFn.mockReturnValueOnce(
      buildChain([
        // Maya's 3 clones land in 2 distinct programs (P, Q).
        { id: 'cloner-m-1', org_id: 'prog-P' },
        { id: 'cloner-m-2', org_id: 'prog-P' },
        { id: 'cloner-m-3', org_id: 'prog-Q' },
        // Sarah's 3 clones also in 2 distinct programs (R, S).
        { id: 'cloner-s-1', org_id: 'prog-R' },
        { id: 'cloner-s-2', org_id: 'prog-R' },
        { id: 'cloner-s-3', org_id: 'prog-S' },
      ]),
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plans: Array<{
        token: string;
        reputation: {
          cloneCount: number;
          distinctProgramCount: number;
          distinctCoachCount: number;
          stuckCloneCount?: number;
          stuckProgramCount?: number;
        } | null;
      }>;
    };
    expect(body.plans).toHaveLength(2);
    // Maya is first — stuck in 2 programs (P, Q).
    expect(body.plans[0].token).toBe('tok-maya');
    expect(body.plans[0].reputation?.stuckProgramCount).toBe(2);
    // Sarah is second — stuckProgramCount = 0.
    expect(body.plans[1].token).toBe('tok-sarah');
    expect(body.plans[1].reputation?.stuckProgramCount ?? 0).toBe(0);
  });

  it('stick beats download volume: a plan with stuckProgramCount=2 out-ranks a plan with distinctProgramCount=5 but stuckProgramCount=0', async () => {
    setAuthUser();
    queueBaselineSharesChain([
      // Sarah has BIG download volume (5 distinct programs cloned)
      // but stuck in zero of those.
      {
        id: 'share-sarah',
        token: 'tok-sarah',
        coach_id: SARAH,
        plan_id: 'plan-sarah',
        note: null,
        created_at: '2026-06-08T20:00:00.000Z',
        is_active: true,
        plans: { id: 'plan-sarah', title: 'Sarah plan', team_id: 'team-sarah' },
      },
      // Maya has smaller download volume (2 programs) but BOTH
      // clones stuck.
      {
        id: 'share-maya',
        token: 'tok-maya',
        coach_id: MAYA,
        plan_id: 'plan-maya',
        note: null,
        created_at: '2026-06-06T20:00:00.000Z',
        is_active: true,
        plans: { id: 'plan-maya', title: 'Maya plan', team_id: 'team-maya' },
      },
    ]);
    const today = new Date(Date.now() - 60 * 1000).toISOString();
    // Sarah: 5 clones across 5 different programs (above the 0073
    // discovery threshold). Maya: 3 clones across 2 programs.
    const sarahClones = [1, 2, 3, 4, 5].map((i) => ({
      source_plan_id: 'plan-sarah',
      coach_id: `cloner-s-${i}`,
      team_id: `team-cloner-s-${i}`,
      created_at: today,
    }));
    const mayaClones = [1, 2, 3].map((i) => ({
      source_plan_id: 'plan-maya',
      coach_id: `cloner-m-${i}`,
      team_id: `team-cloner-m-${i}`,
      created_at: today,
    }));
    mockFromFn.mockReturnValueOnce(buildChain([...sarahClones, ...mayaClones]));
    // drill_shares — Maya has one share (the source of stick signals).
    mockFromFn.mockReturnValueOnce(
      buildChain([{ id: 'share-maya-drill', coach_id: MAYA }]),
    );
    // drill_share_clones — none.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // drill_clone_stick_signals — Maya stuck in 2 programs; Sarah
    // stuck in zero.
    mockFromFn.mockReturnValueOnce(
      buildChain([
        {
          drill_share_id: 'share-maya-drill',
          cloner_coach_id: 'cloner-m-1',
          cloner_org_id: 'prog-M1',
          stuck_at: today,
        },
        {
          drill_share_id: 'share-maya-drill',
          cloner_coach_id: 'cloner-m-3',
          cloner_org_id: 'prog-M2',
          stuck_at: today,
        },
      ]),
    );
    // coaches batch read.
    mockFromFn.mockReturnValueOnce(
      buildChain([
        { id: 'cloner-s-1', org_id: 'prog-S1' },
        { id: 'cloner-s-2', org_id: 'prog-S2' },
        { id: 'cloner-s-3', org_id: 'prog-S3' },
        { id: 'cloner-s-4', org_id: 'prog-S4' },
        { id: 'cloner-s-5', org_id: 'prog-S5' },
        { id: 'cloner-m-1', org_id: 'prog-M1' },
        { id: 'cloner-m-2', org_id: 'prog-M1' },
        { id: 'cloner-m-3', org_id: 'prog-M2' },
      ]),
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plans: Array<{
        token: string;
        reputation: { stuckProgramCount?: number } | null;
      }>;
    };
    // Maya first — stick beats download volume.
    expect(body.plans[0].token).toBe('tok-maya');
    expect(body.plans[0].reputation?.stuckProgramCount).toBe(2);
    expect(body.plans[1].token).toBe('tok-sarah');
    expect(body.plans[1].reputation?.stuckProgramCount ?? 0).toBe(0);
  });

  it('zero stuck signals → BYTE-IDENTICAL ordering to today (recency tiebreaker preserved)', async () => {
    setAuthUser();
    queueBaselineSharesChain([
      {
        id: 'share-sarah',
        token: 'tok-sarah',
        coach_id: SARAH,
        plan_id: 'plan-sarah',
        note: null,
        created_at: '2026-06-08T20:00:00.000Z',
        is_active: true,
        plans: { id: 'plan-sarah', title: 'Sarah plan', team_id: 'team-sarah' },
      },
      {
        id: 'share-maya',
        token: 'tok-maya',
        coach_id: MAYA,
        plan_id: 'plan-maya',
        note: null,
        created_at: '2026-06-06T20:00:00.000Z',
        is_active: true,
        plans: { id: 'plan-maya', title: 'Maya plan', team_id: 'team-maya' },
      },
    ]);
    // 6. plans (clones) — none.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // 7. drill_shares — none.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // 8. drill_clone_stick_signals — none.
    mockFromFn.mockReturnValueOnce(buildChain([]));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: Array<{ token: string }> };
    // Recency order preserved — Sarah (newer) before Maya (older).
    expect(body.plans[0].token).toBe('tok-sarah');
    expect(body.plans[1].token).toBe('tok-maya');
  });

  it('payload contains NO minor-side fields (parent_email, date_of_birth, jersey_number, medical_notes)', async () => {
    setAuthUser();
    queueBaselineSharesChain([
      {
        id: 'share-maya',
        token: 'tok-maya',
        coach_id: MAYA,
        plan_id: 'plan-maya',
        note: null,
        created_at: '2026-06-06T20:00:00.000Z',
        is_active: true,
        plans: { id: 'plan-maya', title: 'Maya plan', team_id: 'team-maya' },
      },
    ]);
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));

    const res = await GET(makeRequest());
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toMatch(/parent_email/);
    expect(raw).not.toMatch(/date_of_birth/);
    expect(raw).not.toMatch(/medical_notes/);
    expect(raw).not.toMatch(/jersey_number/);
  });
});
