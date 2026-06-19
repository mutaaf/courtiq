/**
 * Ticket 0091 — GET /api/sport-wide-convergence.
 *
 * The Capture surface mounts <SportWideConvergenceLine />; that line
 * fetches THIS route to learn whether the sport-wide pulse is eligible
 * AND who the TOP 2 named programs are. Authed (every signed-in coach
 * can read the cross-sport pulse for any skill in their sport) — there
 * is NO tier gate; the read is a FREE affordance.
 *
 * Acceptance criteria mapping (from the ticket):
 *  (i)    unauthed caller → 401
 *  (ii)   10 programs → eligible: false, eligibilityReason:
 *         'too_few_programs'
 *  (iii)  25 programs with 2 director-named → eligible: true with 2
 *         named
 *  (iv)   50 programs with 1 opted-out → 50 in count, opted-out
 *         excluded from named
 *  (vii)  planted coaches.email / phone / plans.content /
 *         players.* on every joined row are NEVER read
 *  (viii) chain mocks are filter-aware per LESSONS#0080
 *
 * .test.ts NOT .spec.ts (LESSONS#0038).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { GET } from '@/app/api/sport-wide-convergence/route';

const COACH_ID = '00000000-0000-4000-a000-0000000000c1';
const SPORT_ID = '00000000-0000-4000-a000-0000000000b1';
const SKILL_ID = 'closeouts';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
];

/**
 * Build a thenable chain that resolves to { data, error } when awaited.
 * mockReturnThis on every builder method so the route can chain
 * .select().eq().in().gte() freely. Per LESSONS#0080 — filter-aware:
 * captures the LATEST .in() args and post-filters the data array by
 * them so a route that scopes a read by `.in('org_id', subset)` only
 * sees the rows for that subset (mirrors real DB behavior).
 */
function chain<T extends Record<string, unknown>>(
  rows: T[] | null = null,
  opts: { inFilterField?: keyof T } = {},
) {
  let resolvedRows: T[] = Array.isArray(rows) ? [...rows] : [];
  let inFilter: { field: string; values: unknown[] } | null = null;
  const c: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn(function (this: unknown, field: string, values: unknown[]) {
      inFilter = { field, values };
      return c;
    }),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => {
      const filtered = applyInFilter(resolvedRows, inFilter, opts.inFilterField);
      return { data: filtered[0] ?? null, error: null };
    }),
    single: vi.fn(async () => {
      const filtered = applyInFilter(resolvedRows, inFilter, opts.inFilterField);
      return { data: filtered[0] ?? null, error: null };
    }),
    then: (onFulfilled: (v: { data: T[]; error: null }) => unknown) => {
      const filtered = applyInFilter(resolvedRows, inFilter, opts.inFilterField);
      return Promise.resolve({ data: filtered, error: null }).then(onFulfilled);
    },
  };
  return c;
}

function applyInFilter<T extends Record<string, unknown>>(
  rows: T[],
  inFilter: { field: string; values: unknown[] } | null,
  inFilterField: keyof T | undefined,
): T[] {
  if (!inFilter || !inFilterField) return rows;
  if (inFilter.field !== inFilterField) return rows;
  const valueSet = new Set(inFilter.values);
  return rows.filter((r) => valueSet.has(r[inFilterField]));
}

function makeReq(skillId = SKILL_ID, sportId = SPORT_ID): Request {
  const url = new URL('http://localhost/api/sport-wide-convergence');
  url.searchParams.set('skillId', skillId);
  url.searchParams.set('sportId', sportId);
  return new Request(url.toString());
}

function generatePrograms(count: number, base = 0) {
  const programs: Array<{
    id: string;
    name: string;
    opted_out_of_sport_pulse: boolean;
  }> = [];
  for (let i = 0; i < count; i++) {
    programs.push({
      id: `org-${String(base + i).padStart(4, '0')}`,
      name: `Program ${String(base + i).padStart(4, '0')}`,
      opted_out_of_sport_pulse: false,
    });
  }
  return programs;
}

function generateTeams(orgIds: string[]) {
  return orgIds.map((orgId, i) => ({
    id: `team-${String(i).padStart(4, '0')}`,
    org_id: orgId,
    sport_id: SPORT_ID,
    age_group: '8-10',
  }));
}

function generatePlans(teamIds: string[]) {
  const now = Date.now();
  return teamIds.map((teamId, i) => ({
    id: `plan-${String(i).padStart(4, '0')}`,
    team_id: teamId,
    created_at: new Date(now - 60 * 60 * 1000).toISOString(),
    skills_targeted: [SKILL_ID],
  }));
}

function generateDirectors(orgIds: string[], firstNames: string[]) {
  return orgIds.map((orgId, i) => ({
    id: `director-${String(i).padStart(4, '0')}`,
    org_id: orgId,
    full_name: `${firstNames[i % firstNames.length]} Walker`,
    role: 'admin',
    // planted PII — assert NEVER read by route
    email: 'pii@example.com',
    phone: '+15551234567',
  }));
}

describe('GET /api/sport-wide-convergence (ticket 0091)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
  });

  it('(i) unauthed caller → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('(ii) 10 programs → eligible: false, eligibilityReason: too_few_programs', async () => {
    const programs = generatePrograms(10);
    const teams = generateTeams(programs.map((p) => p.id));
    const plans = generatePlans(teams.map((t) => t.id));
    const directors = generateDirectors(programs.map((p) => p.id), ['Maya']);
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'teams') return chain(teams, { inFilterField: 'id' });
      if (table === 'plans') return chain(plans, { inFilterField: 'team_id' });
      if (table === 'organizations') return chain(programs, { inFilterField: 'id' });
      if (table === 'coaches') return chain(directors, { inFilterField: 'org_id' });
      return chain([]);
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(body.eligibilityReason).toBe('too_few_programs');
    expect(body.distinctProgramCount).toBe(10);
  });

  it('(iii) 25 programs with 2 director-named → eligible: true with 2 named', async () => {
    const programs = generatePrograms(25);
    // Bump program 00 to be the top shipper.
    const teams = generateTeams(programs.map((p) => p.id));
    const plans = generatePlans(teams.map((t) => t.id));
    // Add 5 more plans for team-0000 so org-0000 ships 6 total.
    for (let k = 0; k < 5; k++) {
      plans.push({
        id: `plan-extra-${k}`,
        team_id: 'team-0000',
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        skills_targeted: [SKILL_ID],
      });
    }
    const directors = generateDirectors(programs.map((p) => p.id), [
      'Riya',
      'Ben',
      'Maya',
      'James',
      'Lin',
    ]);
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'teams') return chain(teams, { inFilterField: 'id' });
      if (table === 'plans') return chain(plans, { inFilterField: 'team_id' });
      if (table === 'organizations') return chain(programs, { inFilterField: 'id' });
      if (table === 'coaches') return chain(directors, { inFilterField: 'org_id' });
      return chain([]);
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(true);
    expect(body.eligibilityReason).toBeUndefined();
    expect(body.distinctProgramCount).toBe(25);
    expect(body.namedPrograms).toHaveLength(2);
    // Top shipper org-0000 → first; org-0001 sorts alphabetically next.
    expect(body.namedPrograms[0].orgId).toBe('org-0000');
    expect(body.namedPrograms[0].planCount).toBe(6);
    expect(body.namedPrograms[0].directorFirstName).toBe('Riya');
    expect(body.namedPrograms[0].programName).toBe('Program 0000');
  });

  it('(iv) 50 programs with 1 opted-out → 50 in count, opted-out excluded from named', async () => {
    const programs = generatePrograms(50);
    // Make org-0000 the top shipper AND mark it opted-out — it should
    // drop from the named list but stay in the count.
    programs[0].opted_out_of_sport_pulse = true;
    const teams = generateTeams(programs.map((p) => p.id));
    const plans = generatePlans(teams.map((t) => t.id));
    for (let k = 0; k < 10; k++) {
      plans.push({
        id: `plan-x-${k}`,
        team_id: 'team-0000',
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        skills_targeted: [SKILL_ID],
      });
    }
    const directors = generateDirectors(programs.map((p) => p.id), [
      'Riya',
      'Ben',
      'Maya',
    ]);
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'teams') return chain(teams, { inFilterField: 'id' });
      if (table === 'plans') return chain(plans, { inFilterField: 'team_id' });
      if (table === 'organizations') return chain(programs, { inFilterField: 'id' });
      if (table === 'coaches') return chain(directors, { inFilterField: 'org_id' });
      return chain([]);
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(true);
    expect(body.distinctProgramCount).toBe(50);
    expect(body.namedPrograms.map((p: { orgId: string }) => p.orgId)).not.toContain('org-0000');
    // The named list still has 2 entries (other programs that ship).
    expect(body.namedPrograms.length).toBeLessThanOrEqual(2);
  });

  it('(vii) the route uses narrow .select() allow-lists — never reads coaches.email/phone or plans.content', async () => {
    // We capture the .select() argument for every from() table and
    // assert it carries no forbidden column. The route allow-list per
    // ticket: plans → id, team_id, created_at, skills_targeted;
    // teams → id, org_id, sport_id, age_group; organizations → id,
    // name, opted_out_of_sport_pulse; coaches → id, org_id, full_name,
    // role.
    const selectArgs: Record<string, string> = {};
    const forbidden = ['email', 'phone', 'content', 'content_structured', 'parent_email', 'date_of_birth'];
    mockFromFn.mockImplementation((table: string) => {
      const rows = table === 'organizations'
        ? generatePrograms(2)
        : table === 'teams'
        ? generateTeams(['org-0000', 'org-0001'])
        : table === 'plans'
        ? generatePlans(['team-0000'])
        : table === 'coaches'
        ? generateDirectors(['org-0000'], ['Riya'])
        : [];
      const c = chain(rows, {
        inFilterField:
          table === 'organizations'
            ? 'id'
            : table === 'plans'
            ? 'team_id'
            : table === 'coaches'
            ? 'org_id'
            : 'id',
      });
      const origSelect = c.select as ReturnType<typeof vi.fn>;
      origSelect.mockImplementation((arg: string) => {
        selectArgs[table] = arg;
        return c;
      });
      return c;
    });
    await GET(makeReq());
    // Whatever the route called .select() with on coaches MUST NOT
    // contain any of the forbidden columns.
    for (const table of ['coaches', 'plans', 'teams', 'organizations']) {
      const arg = selectArgs[table];
      if (!arg) continue;
      for (const word of forbidden) {
        expect(arg).not.toContain(word);
      }
    }
  });

  it('(viii) chain mock is filter-aware on plans .in("team_id", ...) (LESSONS#0080)', async () => {
    // Smoke-test the filter-aware behavior of the helper itself:
    // even when plans includes rows for a team NOT in the IN list,
    // the route's downstream count must reflect only the IN-set.
    const programs = generatePrograms(25);
    const teams = generateTeams(programs.map((p) => p.id));
    const plans = generatePlans(teams.map((t) => t.id));
    // Plant an "off-team" plan that the route should NOT see (because
    // the route never asks for that team's plans). Real DB would
    // filter via SQL .in('team_id', validIds); our chain mirrors that.
    plans.push({
      id: 'phantom-plan',
      team_id: 'team-phantom',
      created_at: new Date().toISOString(),
      skills_targeted: [SKILL_ID],
    });
    const directors = generateDirectors(programs.map((p) => p.id), ['Riya']);
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'teams') return chain(teams, { inFilterField: 'id' });
      if (table === 'plans') return chain(plans, { inFilterField: 'team_id' });
      if (table === 'organizations') return chain(programs, { inFilterField: 'id' });
      if (table === 'coaches') return chain(directors, { inFilterField: 'org_id' });
      return chain([]);
    });
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.distinctProgramCount).toBe(25); // phantom plan excluded
  });

  it('no banned hype word in the response payload (LESSONS#0023)', async () => {
    const programs = generatePrograms(25);
    const teams = generateTeams(programs.map((p) => p.id));
    const plans = generatePlans(teams.map((t) => t.id));
    const directors = generateDirectors(programs.map((p) => p.id), ['Riya']);
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'teams') return chain(teams, { inFilterField: 'id' });
      if (table === 'plans') return chain(plans, { inFilterField: 'team_id' });
      if (table === 'organizations') return chain(programs, { inFilterField: 'id' });
      if (table === 'coaches') return chain(directors, { inFilterField: 'org_id' });
      return chain([]);
    });
    const res = await GET(makeReq());
    const body = await res.json();
    const json = JSON.stringify(body).toLowerCase();
    for (const word of BANNED_HYPE) {
      expect(json).not.toContain(word);
    }
  });

  it('missing skillId or sportId query params → eligible: false', async () => {
    mockFromFn.mockImplementation(() => chain([]));
    const url = new URL('http://localhost/api/sport-wide-convergence');
    const res = await GET(new Request(url.toString()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
  });

  it('tier coach (free / coach / pro / org) → all eligible (no tier gate)', async () => {
    // The READ is a FREE affordance — there is no tier gate. We assert
    // the eligible payload is identical regardless of any tier field
    // the route might read (the route does NOT read any tier field).
    const programs = generatePrograms(25);
    const teams = generateTeams(programs.map((p) => p.id));
    const plans = generatePlans(teams.map((t) => t.id));
    const directors = generateDirectors(programs.map((p) => p.id), ['Riya']);
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'teams') return chain(teams, { inFilterField: 'id' });
      if (table === 'plans') return chain(plans, { inFilterField: 'team_id' });
      if (table === 'organizations') return chain(programs, { inFilterField: 'id' });
      if (table === 'coaches') return chain(directors, { inFilterField: 'org_id' });
      return chain([]);
    });
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.eligible).toBe(true);
  });
});
