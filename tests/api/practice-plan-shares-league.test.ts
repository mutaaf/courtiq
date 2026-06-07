/**
 * Ticket 0055 — GET /api/practice-plan-shares/league?teamId=<id>
 *
 * Returns the league-internal practice-plan discovery payload that powers the
 * <LeaguePlansSection /> at the top of /plans. Payload shape:
 *
 *   {
 *     plans: Array<{
 *       token, planTitle, publishedAt, coachFirstName, sportSlug,
 *       ageGroup, sourcePlanId, note,
 *     }>,
 *     eligible: boolean,
 *   }
 *
 * The route is AUTHED (`createServerSupabase().auth.getUser()` → 401). It
 * resolves the caller's `coaches.org_id`; if NULL → returns
 * `{ plans: [], eligible: false }` (the solo-coach case — they have no league).
 * It resolves the active team's sport from `teams.sport_id`. Then it queries
 * `practice_plan_shares` joined with `plans` + `teams` + `coaches`, filtered
 * by:
 *   coach.org_id = caller.org_id
 *   AND coach.id != caller.id     (the caller's own plans never appear)
 *   AND practice_plan_shares.is_active = true
 *   AND team.sport_id = caller_team.sport_id  (same-sport only)
 * ordered by created_at DESC LIMIT 5.
 *
 * COPPA: the response contains ONLY the documented fields — never the
 * publishing coach's email, full name (first name only), or any minor data.
 *
 * Mocking pattern mirrors tests/api/practice-plan-shares-create.test.ts.
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
const OTHER_ORG = 'org-B';
const TEAM_ID = 'team-caller-1';
const SPORT_ID = 'sport-basketball';

function setAuthUser(id: string | null = CALLER_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(url = `http://localhost/api/practice-plan-shares/league?teamId=${TEAM_ID}`) {
  return new Request(url, { method: 'GET' });
}

describe('GET /api/practice-plan-shares/league (ticket 0055)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    // Drop the in-memory cache for the orgs we exercise so a sibling test's
    // payload doesn't leak forward — LESSONS#41/#92 family.
    bustLeagueCache(CALLER_ORG);
    bustLeagueCache(OTHER_ORG);
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 when teamId is missing from the query', async () => {
    setAuthUser();
    const res = await GET(makeRequest('http://localhost/api/practice-plan-shares/league'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the team does not belong to the caller (cross-coach refusal)', async () => {
    setAuthUser();
    // Team-ownership lookup returns null (coach_id != caller).
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns eligible:false with an empty plans array for a SOLO coach (no org_id)', async () => {
    setAuthUser();
    // 1. team-ownership lookup resolves the team (sport_id + caller's coach_id).
    mockFromFn.mockReturnValueOnce(buildChain({ id: TEAM_ID, coach_id: CALLER_ID, sport_id: SPORT_ID }));
    // 2. caller-coach lookup: org_id is null (solo coach).
    mockFromFn.mockReturnValueOnce(buildChain({ id: CALLER_ID, org_id: null }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: unknown[]; eligible: boolean };
    expect(body.eligible).toBe(false);
    expect(body.plans).toEqual([]);
  });

  it('happy path returns plans[] with EXACTLY the documented keyset (no email, no full_name)', async () => {
    setAuthUser();
    // 1. team-ownership.
    mockFromFn.mockReturnValueOnce(buildChain({ id: TEAM_ID, coach_id: CALLER_ID, sport_id: SPORT_ID }));
    // 2. caller-coach with an org_id.
    mockFromFn.mockReturnValueOnce(buildChain({ id: CALLER_ID, org_id: CALLER_ORG }));
    // 3. peer coaches in the same org (excluding caller).
    mockFromFn.mockReturnValueOnce(buildChain([
      { id: 'coach-james', full_name: 'James Stark', org_id: CALLER_ORG },
      { id: 'coach-sarah', full_name: 'Sarah Reed', org_id: CALLER_ORG },
    ]));
    // 4. peer teams in those coaches' org + same sport.
    mockFromFn.mockReturnValueOnce(buildChain([
      { id: 'team-james', sport_id: SPORT_ID, age_group: '8', sports: { slug: 'flag_football' } },
      { id: 'team-sarah', sport_id: SPORT_ID, age_group: '9', sports: { slug: 'flag_football' } },
    ]));
    // 5. published practice_plan_shares JOINed to plans (the heavy read).
    mockFromFn.mockReturnValueOnce(buildChain([
      {
        id: 'share-1',
        token: 'tok-1',
        coach_id: 'coach-james',
        plan_id: 'plan-1',
        note: 'Worked great Tuesday',
        created_at: '2026-05-27T20:00:00.000Z',
        is_active: true,
        plans: {
          id: 'plan-1',
          title: 'Tuesday catch-up',
          team_id: 'team-james',
        },
      },
      {
        id: 'share-2',
        token: 'tok-2',
        coach_id: 'coach-sarah',
        plan_id: 'plan-2',
        note: null,
        created_at: '2026-05-26T20:00:00.000Z',
        is_active: true,
        plans: {
          id: 'plan-2',
          title: 'Closeout passing',
          team_id: 'team-sarah',
        },
      },
    ]));
    // Ticket 0073 reputation extension — 3 new from() calls:
    // 6. plans (clones with source_plan_id IN <peer plan ids>).
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // 7. drill_shares (publisher's drill shares).
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // 8. drill_share_clones — skipped when publisher has no shares,
    //    so this chain only gets pulled if there are drill shares.
    //    Keep it queued to be safe (the route reads coaches even when
    //    there are no drill shares — see step 9).
    // 9. coaches (cloning-coach org_id batch read).
    //    With no clones, distinctCloningCoachIds is empty and the
    //    route SKIPS this read. We DON'T queue a chain.

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plans: Array<Record<string, unknown>>;
      eligible: boolean;
    };
    expect(body.eligible).toBe(true);
    expect(body.plans.length).toBe(2);

    // Keyset deep-equality — exactly NINE keys per row (8 documented
    // 0055 keys + the new 0073 `reputation` field). Adding a future
    // key requires changing this assertion.
    const ALLOWED = [
      'token',
      'planTitle',
      'publishedAt',
      'coachFirstName',
      'sportSlug',
      'ageGroup',
      'sourcePlanId',
      'note',
      'reputation',
    ].sort();
    for (const row of body.plans) {
      expect(Object.keys(row).sort()).toEqual(ALLOWED);
    }

    // No email / full_name / coach_id / any minor data leaked anywhere.
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/email/i);
    expect(raw).not.toMatch(/full_name/i);
    expect(raw).not.toMatch(/Stark/); // last name MUST NOT appear
    expect(raw).not.toMatch(/Reed/);  // last name MUST NOT appear

    // First-name extraction worked.
    const names = body.plans.map((p) => p.coachFirstName);
    expect(names).toContain('James');
    expect(names).toContain('Sarah');
  });

  it('returns eligible:true with empty plans when the caller has an org but no peer has published', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain({ id: TEAM_ID, coach_id: CALLER_ID, sport_id: SPORT_ID }));
    mockFromFn.mockReturnValueOnce(buildChain({ id: CALLER_ID, org_id: CALLER_ORG }));
    // No peer coaches.
    mockFromFn.mockReturnValueOnce(buildChain([]));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: unknown[]; eligible: boolean };
    expect(body.eligible).toBe(true);
    expect(body.plans).toEqual([]);
  });
});
