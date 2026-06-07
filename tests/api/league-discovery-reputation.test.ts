/**
 * Ticket 0073 — GET /api/practice-plan-shares/league?teamId=<id>
 * — REPUTATION EXTENSION.
 *
 * The existing 0055 league-discovery route returns the five most-
 * recent practice-plan shares from peer coaches in the same org. This
 * extension:
 *
 *  - reads the existing `plans` table for clone rows
 *    (`source_plan_id IN <peerPlanIds>`) and the existing
 *    `drill_share_clones` table for drill clones;
 *  - calls the pure `computeCoachReputation` helper for each
 *    published coach;
 *  - attaches `reputation: { cloneCount, distinctProgramCount,
 *    distinctCoachCount } | null` to each row;
 *  - RE-RANKS by (distinctProgramCount desc, cloneCount desc,
 *    recency desc);
 *  - sets `reputation: null` for rows below threshold
 *    (cloneCount < 3 OR distinctProgramCount < 2) — silence beats
 *    small-number bragging;
 *  - is BYTE-IDENTICAL to today when every plan's reputation is
 *    null (the new sort tuple ties on the existing recency sort).
 *
 * The new from() calls are appended to the existing chain.
 * LESSONS#0049 / #0092 / #0100 / #0110 — we extend the existing
 * `tests/api/practice-plan-shares-league.test.ts` mock queues in
 * the same PR; this NEW file pins the reputation extension shape
 * directly.
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
const BOB = 'coach-bob';
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
  // 1. team-ownership.
  mockFromFn.mockReturnValueOnce(
    buildChain({ id: TEAM_ID, coach_id: CALLER_ID, sport_id: SPORT_ID }),
  );
  // 2. caller-coach with org_id.
  mockFromFn.mockReturnValueOnce(buildChain({ id: CALLER_ID, org_id: CALLER_ORG }));
  // 3. peer coaches.
  mockFromFn.mockReturnValueOnce(
    buildChain([
      { id: MAYA, full_name: 'Maya Walker', org_id: CALLER_ORG },
      { id: BOB, full_name: 'Bob Reed', org_id: CALLER_ORG },
      { id: SARAH, full_name: 'Sarah Reed', org_id: CALLER_ORG },
    ]),
  );
  // 4. peer teams.
  mockFromFn.mockReturnValueOnce(
    buildChain([
      { id: 'team-maya', sport_id: SPORT_ID, age_group: '11-13', sports: { slug: 'basketball' } },
      { id: 'team-bob', sport_id: SPORT_ID, age_group: '11-13', sports: { slug: 'basketball' } },
      { id: 'team-sarah', sport_id: SPORT_ID, age_group: '11-13', sports: { slug: 'basketball' } },
    ]),
  );
  // 5. practice_plan_shares JOIN plans.
  mockFromFn.mockReturnValueOnce(buildChain(shares));
}

describe('GET /api/practice-plan-shares/league — reputation extension (ticket 0073)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    bustLeagueCache(CALLER_ORG);
  });

  it('re-ranks plans by (distinctProgramCount desc, cloneCount desc, recency desc) and attaches reputation only above threshold', async () => {
    setAuthUser();
    // Bob's plan is more recent (today) than Maya's (yesterday) but Maya
    // has reputation 12 clones x 4 programs; Bob has no clones; Sarah's
    // plan is older but has 4 clones in 2 programs. Expected rank:
    //  1. Maya (4 programs, 12 clones)
    //  2. Sarah (2 programs, 4 clones)
    //  3. Bob (null reputation, falls to recency)
    queueBaselineSharesChain([
      {
        id: 'share-bob',
        token: 'tok-bob',
        coach_id: BOB,
        plan_id: 'plan-bob',
        note: null,
        created_at: '2026-06-07T20:00:00.000Z',
        is_active: true,
        plans: { id: 'plan-bob', title: 'Bob plan', team_id: 'team-bob' },
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
      {
        id: 'share-sarah',
        token: 'tok-sarah',
        coach_id: SARAH,
        plan_id: 'plan-sarah',
        note: null,
        created_at: '2026-06-05T20:00:00.000Z',
        is_active: true,
        plans: { id: 'plan-sarah', title: 'Sarah plan', team_id: 'team-sarah' },
      },
    ]);
    // 6. plans (cloned plans whose source_plan_id IN the peer plan ids).
    //    Maya: 12 clones in 4 programs. Sarah: 4 clones in 2 programs.
    //    Bob: nothing.
    const today = '2026-06-07T00:00:00Z';
    const mayaClones = Array.from({ length: 12 }).map((_, i) => ({
      source_plan_id: 'plan-maya',
      coach_id: `cloner-m-${i}`,
      team_id: `team-cloner-m-${i}`,
      created_at: today,
    }));
    const sarahClones = Array.from({ length: 4 }).map((_, i) => ({
      source_plan_id: 'plan-sarah',
      coach_id: `cloner-s-${i}`,
      team_id: `team-cloner-s-${i}`,
      created_at: today,
    }));
    mockFromFn.mockReturnValueOnce(buildChain([...mayaClones, ...sarahClones]));
    // 7. drill_shares (publisher's drill shares) — none for any of these coaches.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // (drill_share_clones is SKIPPED because there are no publisher drill shares.)
    // 8. coaches (cloning-coach org_id resolution per cloner).
    const cloningCoaches = [
      ...mayaClones.map((c, i) => ({
        id: c.coach_id,
        org_id: i < 3 ? 'org-A' : i < 6 ? 'org-B' : i < 9 ? 'org-C' : 'org-D',
      })),
      ...sarahClones.map((c, i) => ({
        id: c.coach_id,
        org_id: i < 2 ? 'org-A' : 'org-B',
      })),
    ];
    mockFromFn.mockReturnValueOnce(buildChain(cloningCoaches));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plans: Array<{
        token: string;
        reputation: { cloneCount: number; distinctProgramCount: number; distinctCoachCount: number } | null;
      }>;
    };
    expect(body.plans.length).toBe(3);
    // Maya first — biggest reputation.
    expect(body.plans[0].token).toBe('tok-maya');
    expect(body.plans[0].reputation).not.toBeNull();
    expect(body.plans[0].reputation?.cloneCount).toBe(12);
    expect(body.plans[0].reputation?.distinctProgramCount).toBe(4);
    expect(body.plans[0].reputation?.distinctCoachCount).toBe(12);
    // Sarah second — 4 clones x 2 programs.
    expect(body.plans[1].token).toBe('tok-sarah');
    expect(body.plans[1].reputation?.cloneCount).toBe(4);
    expect(body.plans[1].reputation?.distinctProgramCount).toBe(2);
    // Bob last — reputation null (below threshold).
    expect(body.plans[2].token).toBe('tok-bob');
    expect(body.plans[2].reputation).toBeNull();
  });

  it('zero plans above threshold → BYTE-IDENTICAL recency order to today', async () => {
    setAuthUser();
    queueBaselineSharesChain([
      {
        id: 'share-bob',
        token: 'tok-bob',
        coach_id: BOB,
        plan_id: 'plan-bob',
        note: null,
        created_at: '2026-06-07T20:00:00.000Z',
        is_active: true,
        plans: { id: 'plan-bob', title: 'Bob plan', team_id: 'team-bob' },
      },
      {
        id: 'share-sarah',
        token: 'tok-sarah',
        coach_id: SARAH,
        plan_id: 'plan-sarah',
        note: null,
        created_at: '2026-06-05T20:00:00.000Z',
        is_active: true,
        plans: { id: 'plan-sarah', title: 'Sarah plan', team_id: 'team-sarah' },
      },
    ]);
    // No clones for either coach.
    // 6. plans (clones) — empty.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // 7. drill_shares — empty.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // (drill_share_clones SKIPPED because drill_shares is empty.)
    // (coaches SKIPPED because cloningCoachIds is empty.)

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plans: Array<{ token: string; reputation: unknown }>;
    };
    expect(body.plans.length).toBe(2);
    // Recency order preserved: Bob (newer) before Sarah (older).
    expect(body.plans[0].token).toBe('tok-bob');
    expect(body.plans[1].token).toBe('tok-sarah');
    expect(body.plans[0].reputation).toBeNull();
    expect(body.plans[1].reputation).toBeNull();
  });

  it('reputation below threshold (cloneCount < 3 OR distinctProgramCount < 2) is set to null', async () => {
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
    // 2 clones, 1 program — below cloneCount (3) AND distinctProgramCount (2).
    const today = '2026-06-07T00:00:00Z';
    const twoClones = [
      { source_plan_id: 'plan-maya', coach_id: 'c1', team_id: 't1', created_at: today },
      { source_plan_id: 'plan-maya', coach_id: 'c2', team_id: 't2', created_at: today },
    ];
    // 6. plans (clones).
    mockFromFn.mockReturnValueOnce(buildChain(twoClones));
    // 7. drill_shares.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // 8. coaches (cloning coach org_ids).
    mockFromFn.mockReturnValueOnce(
      buildChain([
        { id: 'c1', org_id: 'org-X' },
        { id: 'c2', org_id: 'org-X' },
      ]),
    );

    const res = await GET(makeRequest());
    const body = (await res.json()) as { plans: Array<{ reputation: unknown }> };
    expect(body.plans[0].reputation).toBeNull();
  });

  it('the response payload contains NO cloning-coach name (the SELECT is allow-listed; no minor data leaks)', async () => {
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
    // 6. plans (clones).
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // 7. drill_shares.
    mockFromFn.mockReturnValueOnce(buildChain([]));

    const res = await GET(makeRequest());
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toMatch(/parent_email/);
    expect(raw).not.toMatch(/date_of_birth/);
    expect(raw).not.toMatch(/medical_notes/);
    expect(raw).not.toMatch(/jersey_number/);
    expect(raw).not.toMatch(/cloningCoachName/);
    // publishedCoachId is internal — stripped from the public response.
    expect(raw).not.toMatch(/publishedCoachId/);
  });
});
