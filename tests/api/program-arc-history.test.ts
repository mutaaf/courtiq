/**
 * Ticket 0083 — GET /api/program/arc-history
 *
 * Read the program's cross-coach Practice Arc memory: aggregate
 * plans of OTHER teams in the same (org_id, age_group, sport_id)
 * bucket for the prior season(s), return the week-by-week arc
 * shape + coverage flag. Authed-coach scope. Best-effort posture.
 *
 * .test.ts (NOT .spec.ts) — per docs/LESSONS.md.
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

import { GET as arcHistoryGet } from '@/app/api/program/arc-history/route';

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

const ORG = 'org-hawks';
const AGE = 'U10';
const SPORT = 'sport-basketball';
const CALLER_TEAM = 'team-caller';

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
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function setAuthUser(id = 'coach-caller') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

interface WireOpts {
  // The caller's team_coaches rows — the route uses these to verify the
  // caller owns at least one team in the named org.
  callerTeamCoaches?: Array<{ team_id: string; coach_id: string }>;
  // Teams in the program — the route filters by org_id + age_group +
  // sport_id and then reads plans for those team_ids.
  programTeams?: Array<{ id: string; org_id: string; age_group: string; sport_id: string }>;
  // Plans on those teams.
  programPlans?: Array<{
    team_id: string;
    skills_targeted: string[] | null;
    created_at: string;
    curriculum_week: number | null;
  }>;
  // Organization name (used by the route to render the program name).
  organizationName?: string | null;
  // Planted players-table data — the route should NEVER read this.
  plantedPlayers?: Array<{ id: string; date_of_birth: string; medical_notes: string; parent_email: string }>;
}

function defaultProgramTeams() {
  return [
    // The caller's OWN team (excluded from aggregate).
    { id: CALLER_TEAM, org_id: ORG, age_group: AGE, sport_id: SPORT },
    // Another team in the program — the source of the program memory.
    { id: 'team-other', org_id: ORG, age_group: AGE, sport_id: SPORT },
  ];
}

function defaultProgramPlans() {
  // 14 plans on the "other" team, weeks 2-4 closeouts, weeks 5-7 transitions.
  const plans: Array<{
    team_id: string;
    skills_targeted: string[] | null;
    created_at: string;
    curriculum_week: number | null;
  }> = [];
  // Last-season window (200 days back).
  for (const wk of [2, 3, 4]) {
    plans.push({
      team_id: 'team-other',
      skills_targeted: ['closeouts'],
      created_at: new Date(now - 200 * day).toISOString(),
      curriculum_week: wk,
    });
    plans.push({
      team_id: 'team-other',
      skills_targeted: ['closeouts'],
      created_at: new Date(now - 200 * day).toISOString(),
      curriculum_week: wk,
    });
  }
  for (const wk of [5, 6, 7]) {
    plans.push({
      team_id: 'team-other',
      skills_targeted: ['transitions'],
      created_at: new Date(now - 200 * day).toISOString(),
      curriculum_week: wk,
    });
    plans.push({
      team_id: 'team-other',
      skills_targeted: ['transitions'],
      created_at: new Date(now - 200 * day).toISOString(),
      curriculum_week: wk,
    });
  }
  // Filler week 1 + week 8 to bring total to 14.
  plans.push({
    team_id: 'team-other',
    skills_targeted: ['warmup'],
    created_at: new Date(now - 200 * day).toISOString(),
    curriculum_week: 1,
  });
  plans.push({
    team_id: 'team-other',
    skills_targeted: ['warmup'],
    created_at: new Date(now - 200 * day).toISOString(),
    curriculum_week: 8,
  });
  return plans;
}

function wire(opts: WireOpts = {}) {
  const callerTeamCoaches = opts.callerTeamCoaches ?? [
    { team_id: CALLER_TEAM, coach_id: 'coach-caller' },
  ];
  const programTeams = opts.programTeams ?? defaultProgramTeams();
  const programPlans = opts.programPlans ?? defaultProgramPlans();
  const organizationName = opts.organizationName ?? 'Hawks Basketball';
  const plantedPlayers = opts.plantedPlayers ?? [
    {
      id: 'player-coppa-1',
      date_of_birth: '2014-06-01',
      medical_notes: 'allergic to peanuts',
      parent_email: 'leak@should-never-read.test',
    },
  ];

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'team_coaches') {
      return buildChain(callerTeamCoaches);
    }
    if (table === 'teams') {
      return buildChain(programTeams);
    }
    if (table === 'plans') {
      return buildChain(programPlans);
    }
    if (table === 'organizations') {
      return buildChain(
        organizationName ? { id: ORG, name: organizationName } : null,
      );
    }
    if (table === 'players') {
      // Planted data — if the route reads this we want to know.
      return buildChain(plantedPlayers);
    }
    return buildChain([]);
  });
}

function makeRequest(params: Partial<{ orgId: string; ageGroup: string; sportId: string; seasonLookback: string }> = {}) {
  const url = new URL('http://localhost/api/program/arc-history');
  url.searchParams.set('orgId', params.orgId ?? ORG);
  url.searchParams.set('ageGroup', params.ageGroup ?? AGE);
  url.searchParams.set('sportId', params.sportId ?? SPORT);
  if (params.seasonLookback !== undefined) {
    url.searchParams.set('seasonLookback', params.seasonLookback);
  }
  return new Request(url.toString(), { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
});

describe('GET /api/program/arc-history — auth', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await arcHistoryGet(makeRequest());
    expect(res.status).toBe(401);
  });
});

describe('GET /api/program/arc-history — happy path', () => {
  it('returns 200 with sufficient coverage + week-by-week shape', async () => {
    setAuthUser('coach-caller');
    wire();
    const res = await arcHistoryGet(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coverage).toBe('sufficient');
    expect(Array.isArray(body.weeks)).toBe(true);
    expect(body.weeks.length).toBeGreaterThan(0);
    // The program name + age group ride to the surface for the summary.
    expect(body.programName).toBe('Hawks Basketball');
    expect(body.ageGroup).toBe(AGE);
  });
});

describe('GET /api/program/arc-history — org membership', () => {
  it('returns 404 when the caller owns no team in the named org', async () => {
    setAuthUser('coach-caller');
    // No team_coaches rows for this coach.
    wire({ callerTeamCoaches: [] });
    const res = await arcHistoryGet(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 404 when the callers teams are NOT in the named org', async () => {
    setAuthUser('coach-caller');
    // The caller owns CALLER_TEAM, but CALLER_TEAM is in a different org —
    // so the SQL `.eq('org_id', ORG)` returns zero teams for the queried
    // program. The route's "at least one of my teams is in this program"
    // gate fails and returns 404.
    wire({
      programTeams: [],
    });
    const res = await arcHistoryGet(makeRequest());
    expect(res.status).toBe(404);
  });
});

describe('GET /api/program/arc-history — input validation', () => {
  it('returns 400 when orgId is missing', async () => {
    setAuthUser('coach-caller');
    const url = new URL('http://localhost/api/program/arc-history');
    url.searchParams.set('ageGroup', AGE);
    url.searchParams.set('sportId', SPORT);
    const res = await arcHistoryGet(new Request(url.toString(), { method: 'GET' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when ageGroup is missing', async () => {
    setAuthUser('coach-caller');
    const url = new URL('http://localhost/api/program/arc-history');
    url.searchParams.set('orgId', ORG);
    url.searchParams.set('sportId', SPORT);
    const res = await arcHistoryGet(new Request(url.toString(), { method: 'GET' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when sportId is missing', async () => {
    setAuthUser('coach-caller');
    const url = new URL('http://localhost/api/program/arc-history');
    url.searchParams.set('orgId', ORG);
    url.searchParams.set('ageGroup', AGE);
    const res = await arcHistoryGet(new Request(url.toString(), { method: 'GET' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/program/arc-history — exclusions', () => {
  it('the aggregate excludes the callers own team', async () => {
    setAuthUser('coach-caller');
    // The caller's team has 20 plans, the program has only the caller's
    // team — so the aggregate should be thin.
    const callerPlans: Array<{ team_id: string; skills_targeted: string[] | null; created_at: string; curriculum_week: number | null }> = [];
    for (let i = 0; i < 20; i++) {
      callerPlans.push({
        team_id: CALLER_TEAM,
        skills_targeted: ['closeouts'],
        created_at: new Date(now - 200 * day).toISOString(),
        curriculum_week: 2,
      });
    }
    wire({
      programTeams: [{ id: CALLER_TEAM, org_id: ORG, age_group: AGE, sport_id: SPORT }],
      programPlans: callerPlans,
    });
    const res = await arcHistoryGet(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coverage).toBe('thin');
  });

  it('the aggregate excludes plans outside the age_group', async () => {
    setAuthUser('coach-caller');
    // Program teams include the caller's team (in AGE) plus an "other"
    // team in a DIFFERENT age_group — its plans must not contribute.
    wire({
      programTeams: [
        { id: CALLER_TEAM, org_id: ORG, age_group: AGE, sport_id: SPORT },
        { id: 'team-other-age', org_id: ORG, age_group: 'U12', sport_id: SPORT },
      ],
      programPlans: defaultProgramPlans().map((p) => ({ ...p, team_id: 'team-other-age' })),
    });
    const res = await arcHistoryGet(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coverage).toBe('thin');
  });

  it('the aggregate excludes plans outside the sport_id', async () => {
    setAuthUser('coach-caller');
    wire({
      programTeams: [
        { id: CALLER_TEAM, org_id: ORG, age_group: AGE, sport_id: SPORT },
        { id: 'team-other-sport', org_id: ORG, age_group: AGE, sport_id: 'sport-soccer' },
      ],
      programPlans: defaultProgramPlans().map((p) => ({ ...p, team_id: 'team-other-sport' })),
    });
    const res = await arcHistoryGet(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coverage).toBe('thin');
  });
});

describe('GET /api/program/arc-history — thin coverage', () => {
  it('returns coverage:thin when the practice count is below the scarcity bar', async () => {
    setAuthUser('coach-caller');
    // Only 6 plans on the other team — below the 12-plan bar.
    const sparsePlans: Array<{ team_id: string; skills_targeted: string[] | null; created_at: string; curriculum_week: number | null }> = [];
    for (let i = 0; i < 6; i++) {
      sparsePlans.push({
        team_id: 'team-other',
        skills_targeted: ['closeouts'],
        created_at: new Date(now - 200 * day).toISOString(),
        curriculum_week: 2 + i,
      });
    }
    wire({ programPlans: sparsePlans });
    const res = await arcHistoryGet(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coverage).toBe('thin');
  });
});

describe('GET /api/program/arc-history — privacy contract (LESSONS#0036)', () => {
  it('never reads the players table on the happy path', async () => {
    setAuthUser('coach-caller');
    wire();
    await arcHistoryGet(makeRequest());
    const fromCalls = mockFromFn.mock.calls.map((c) => c[0] as string);
    expect(fromCalls).not.toContain('players');
  });

  it('the response payload contains no plan content or COPPA-sensitive fields', async () => {
    setAuthUser('coach-caller');
    wire();
    const res = await arcHistoryGet(makeRequest());
    const body = await res.json();
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('date_of_birth');
    expect(serialised).not.toContain('medical_notes');
    expect(serialised).not.toContain('parent_email');
    expect(serialised).not.toContain('peanuts');
    expect(serialised).not.toContain('jersey_number');
  });

  it('returns a deterministic shape across re-runs', async () => {
    setAuthUser('coach-caller');
    wire();
    const r1 = await arcHistoryGet(makeRequest());
    const r2 = await arcHistoryGet(makeRequest());
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1).toEqual(b2);
  });
});
