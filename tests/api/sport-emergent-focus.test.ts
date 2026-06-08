/**
 * Ticket 0075 — GET /api/sport/emergent-focus?sportId=<uuid>&excludeOrgId=<uuid>
 *
 * Cross-program "three coaches in your sport are on closeouts too" signal,
 * surfaced on Capture. The route reads the last 14 days of plans for teams in
 * the caller's sport EXCLUDING the caller's own org, aggregates
 * skills_targeted across DISTINCT orgs, and returns the top focus skill +
 * (when one exists) the most-thumbed-up drill associated with that skill via
 * the existing 0044 / 0064 primitives.
 *
 * Allow-listed reads ONLY (LESSONS#0036):
 *   teams         id, org_id, sport_id
 *   plans         team_id, skills_targeted, created_at
 *   drill_shares  id, drill_id (joined with drills.category)
 *   drills        id, name, category, duration_minutes, setup_instructions
 *   coach_drill_signals  drill_id, rating  (for the thumbed-up ranking)
 *   drill_share_clones   drill_share_id    (clone-count tiebreak)
 * The route NEVER reads players, observations, parent_*, DOB, jersey,
 * medical_notes, photo_url.
 *
 * Best-effort: a plans-read error returns 200 { focus: null }.
 *
 * Strategy mirrors tests/api/org-emergent-focus.test.ts — chainable in-memory
 * mock keyed by table name.
 *
 * .test.ts (NOT .spec.ts) — per docs/LESSONS.md#0038.
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

import { GET as sportEmergentGet } from '@/app/api/sport/emergent-focus/route';

// ─── Chainable mock helpers ──────────────────────────────────────────────────

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

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

interface PlannedTeam {
  id: string;
  org_id: string;
}

interface PlannedPlan {
  team_id: string;
  skills_targeted: string[] | null;
  created_at: string;
}

interface WireOpts {
  teams?: PlannedTeam[];
  plans?: PlannedPlan[];
  plansError?: unknown;
  teamsError?: unknown;
  // Drill ranking inputs:
  drillShares?: Array<{ id: string; drill_id: string }>;
  drills?: Array<{
    id: string;
    name: string;
    category: string;
    duration_minutes: number | null;
    setup_instructions: string | null;
  }>;
  // coach_drill_signals: { drill_id, rating: 'up' }[] — used to count thumbs-up per drill.
  signals?: Array<{ drill_id: string; rating: 'up' | 'down' }>;
  // drill_share_clones: { drill_share_id }[] — clone-count tiebreak.
  clones?: Array<{ drill_share_id: string }>;
  // Planted minor-data fields that must NEVER be read:
  plantedPlayers?: Array<{ id: string; date_of_birth: string; parent_phone: string; medical_notes: string }>;
}

function defaultThreeOrgConvergence(): WireOpts {
  return {
    teams: [
      { id: 'team-a', org_id: 'org-A' },
      { id: 'team-b', org_id: 'org-B' },
      { id: 'team-c', org_id: 'org-C' },
    ],
    plans: [
      { team_id: 'team-a', skills_targeted: ['closeouts'], created_at: new Date(now - day).toISOString() },
      { team_id: 'team-b', skills_targeted: ['closeouts'], created_at: new Date(now - 2 * day).toISOString() },
      { team_id: 'team-c', skills_targeted: ['closeouts'], created_at: new Date(now - 3 * day).toISOString() },
    ],
    drillShares: [
      { id: 'share-1', drill_id: 'drill-1' },
      { id: 'share-2', drill_id: 'drill-2' },
    ],
    drills: [
      {
        id: 'drill-1',
        name: 'Live closeout 1-on-1',
        category: 'Defense',
        duration_minutes: 8,
        setup_instructions: 'Defender starts at the rim.',
      },
      {
        id: 'drill-2',
        name: 'Spacing flow',
        category: 'Offense',
        duration_minutes: 12,
        setup_instructions: 'Five players spread out.',
      },
    ],
    signals: [
      { drill_id: 'drill-1', rating: 'up' },
      { drill_id: 'drill-1', rating: 'up' },
      { drill_id: 'drill-1', rating: 'up' },
      { drill_id: 'drill-2', rating: 'up' },
    ],
    clones: [],
  };
}

function wire(opts: WireOpts = {}) {
  const teams = opts.teams ?? [];
  const plans = opts.plans ?? [];
  const drillShares = opts.drillShares ?? [];
  const drills = opts.drills ?? [];
  const signals = opts.signals ?? [];
  const clones = opts.clones ?? [];
  const plantedPlayers = opts.plantedPlayers ?? [];

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'teams') {
      if (opts.teamsError) return buildChain([], opts.teamsError);
      return buildChain(teams);
    }
    if (table === 'plans') {
      if (opts.plansError) return buildChain([], opts.plansError);
      return buildChain(plans);
    }
    if (table === 'drill_shares') return buildChain(drillShares);
    if (table === 'drills') return buildChain(drills);
    if (table === 'coach_drill_signals') return buildChain(signals);
    if (table === 'drill_share_clones') return buildChain(clones);
    // Planted minor-data tables — the route must NEVER reach them.
    if (table === 'players') return buildChain(plantedPlayers);
    return buildChain(null);
  });
}

function makeRequest(
  sportId: string | null = 'sport-basketball',
  excludeOrgId: string | null = 'org-OWN'
) {
  const url = new URL('http://localhost/api/sport/emergent-focus');
  if (sportId !== null) url.searchParams.set('sportId', sportId);
  if (excludeOrgId !== null) url.searchParams.set('excludeOrgId', excludeOrgId);
  return new Request(url.toString(), { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
});

// ─── (vii) Unauthed → 401 ────────────────────────────────────────────────────

describe('GET /api/sport/emergent-focus — auth', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await sportEmergentGet(makeRequest());

    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });
});

// ─── (i) Happy path: 3 distinct orgs converge → 200 with focus + drill ──────

describe('GET /api/sport/emergent-focus — happy path', () => {
  it('returns 200 with the focus + the most-thumbed-up drill when 3+ distinct orgs converge', async () => {
    setAuthUser('coach-1');
    wire(defaultThreeOrgConvergence());

    const res = await sportEmergentGet(makeRequest('sport-basketball', 'org-OWN'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focus).not.toBeNull();
    expect(body.focus.skill).toBe('closeouts');
    expect(body.focus.distinctProgramCount).toBe(3);
    expect(body.focus.drill).not.toBeNull();
    expect(body.focus.drill.name).toBe('Live closeout 1-on-1');
    expect(body.focus.drill.duration_minutes).toBe(8);
    // The opaque sourceDrillShareId is what the clone POST consumes — never
    // a publishing coach id.
    expect(typeof body.focus.drill.sourceDrillShareId).toBe('string');
  });
});

// ─── (ii) Only 2 distinct orgs converge → 200 with focus: null ──────────────

describe('GET /api/sport/emergent-focus — below the cross-program threshold', () => {
  it('returns 200 with focus: null when only 2 distinct orgs converge', async () => {
    setAuthUser('coach-1');
    wire({
      teams: [
        { id: 'team-a', org_id: 'org-A' },
        { id: 'team-b', org_id: 'org-A' }, // same org!
        { id: 'team-c', org_id: 'org-B' },
      ],
      plans: [
        { team_id: 'team-a', skills_targeted: ['closeouts'], created_at: new Date(now - day).toISOString() },
        { team_id: 'team-b', skills_targeted: ['closeouts'], created_at: new Date(now - day).toISOString() },
        { team_id: 'team-c', skills_targeted: ['closeouts'], created_at: new Date(now - day).toISOString() },
      ],
    });

    const res = await sportEmergentGet(makeRequest('sport-basketball', 'org-OWN'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focus).toBeNull();
  });
});

// ─── (iii) Caller's own org plans are NEVER included ────────────────────────

describe('GET /api/sport/emergent-focus — excludeOrgId contract', () => {
  it("passes excludeOrgId to the teams read so the caller's own org plans never count", async () => {
    setAuthUser('coach-1');

    // The seeded teams response represents the FILTERED set already — the
    // route is expected to push excludeOrgId into the teams query via .neq().
    // The supabase chain mock no-ops .neq() but we assert that the route
    // CALLS .neq('org_id', 'org-OWN') on the teams chain.
    let teamsChainCaptured: any = null;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'teams') {
        teamsChainCaptured = buildChain([
          { id: 'team-a', org_id: 'org-A' },
          { id: 'team-b', org_id: 'org-B' },
          { id: 'team-c', org_id: 'org-C' },
        ]);
        return teamsChainCaptured;
      }
      if (table === 'plans') {
        return buildChain([
          { team_id: 'team-a', skills_targeted: ['closeouts'], created_at: new Date(now - day).toISOString() },
          { team_id: 'team-b', skills_targeted: ['closeouts'], created_at: new Date(now - day).toISOString() },
          { team_id: 'team-c', skills_targeted: ['closeouts'], created_at: new Date(now - day).toISOString() },
        ]);
      }
      return buildChain([]);
    });

    await sportEmergentGet(makeRequest('sport-basketball', 'org-OWN'));

    expect(teamsChainCaptured).not.toBeNull();
    // .neq('org_id', 'org-OWN') is the load-bearing call.
    const neqCalls = teamsChainCaptured.neq.mock.calls;
    const orgIdNeqCall = neqCalls.find((c: unknown[]) => c[0] === 'org_id');
    expect(orgIdNeqCall).toBeDefined();
    expect(orgIdNeqCall[1]).toBe('org-OWN');
  });
});

// ─── (iv) plans older than 14 days are excluded ─────────────────────────────

describe('GET /api/sport/emergent-focus — windowDays', () => {
  it('returns focus: null when the 3 distinct-org plans are all outside the 14-day window', async () => {
    setAuthUser('coach-1');
    wire({
      teams: [
        { id: 'team-a', org_id: 'org-A' },
        { id: 'team-b', org_id: 'org-B' },
        { id: 'team-c', org_id: 'org-C' },
      ],
      plans: [
        { team_id: 'team-a', skills_targeted: ['closeouts'], created_at: new Date(now - 30 * day).toISOString() },
        { team_id: 'team-b', skills_targeted: ['closeouts'], created_at: new Date(now - 30 * day).toISOString() },
        { team_id: 'team-c', skills_targeted: ['closeouts'], created_at: new Date(now - 30 * day).toISOString() },
      ],
    });

    const res = await sportEmergentGet(makeRequest('sport-basketball', 'org-OWN'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focus).toBeNull();
  });
});

// ─── (v) no drill found for the focus skill → focus is non-null, drill: null

describe('GET /api/sport/emergent-focus — drill resolution', () => {
  it('returns focus with drill: null when no drill matches the focus skill in drill_shares', async () => {
    setAuthUser('coach-1');
    const opts = defaultThreeOrgConvergence();
    opts.drillShares = [];
    opts.drills = [];
    opts.signals = [];
    wire(opts);

    const res = await sportEmergentGet(makeRequest('sport-basketball', 'org-OWN'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focus).not.toBeNull();
    expect(body.focus.skill).toBe('closeouts');
    expect(body.focus.distinctProgramCount).toBe(3);
    expect(body.focus.drill).toBeNull();
  });
});

// ─── (vi) plans read failure → 200 { focus: null } (best-effort) ────────────

describe('GET /api/sport/emergent-focus — best-effort', () => {
  it('returns 200 { focus: null } when the plans read fails', async () => {
    setAuthUser('coach-1');
    wire({
      teams: [
        { id: 'team-a', org_id: 'org-A' },
        { id: 'team-b', org_id: 'org-B' },
        { id: 'team-c', org_id: 'org-C' },
      ],
      plansError: { message: 'boom', code: '500' },
    });

    const res = await sportEmergentGet(makeRequest('sport-basketball', 'org-OWN'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focus).toBeNull();
  });

  it('returns 200 { focus: null } when no teams exist for the sport outside the caller org', async () => {
    setAuthUser('coach-1');
    wire({ teams: [] });

    const res = await sportEmergentGet(makeRequest('sport-basketball', 'org-OWN'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focus).toBeNull();
  });
});

// ─── (viii) Planted DOB / parent_phone / medical_notes are NEVER read ───────

describe('GET /api/sport/emergent-focus — privacy / COPPA contract', () => {
  it('never reads players / observations / parent_email / DOB / medical_notes', async () => {
    setAuthUser('coach-1');
    const opts = defaultThreeOrgConvergence();
    opts.plantedPlayers = [
      {
        id: 'player-1',
        date_of_birth: '2015-04-10',
        parent_phone: '+1-555-0000',
        medical_notes: 'asthma',
      },
    ];
    wire(opts);

    await sportEmergentGet(makeRequest('sport-basketball', 'org-OWN'));

    const tablesRead = mockFromFn.mock.calls.map((c) => c[0]);
    for (const banned of ['players', 'observations', 'parent_shares', 'media', 'media_uploads']) {
      expect(tablesRead).not.toContain(banned);
    }
  });

  it('response payload contains no coach names / publishing coach id / DOB / parent fields', async () => {
    setAuthUser('coach-1');
    wire(defaultThreeOrgConvergence());

    const res = await sportEmergentGet(makeRequest('sport-basketball', 'org-OWN'));
    const body = await res.json();
    const json = JSON.stringify(body);
    expect(json).not.toMatch(
      /jersey|player_name|player_id|date_of_birth|medical_notes|parent_email|parent_phone|coach_id|publishing_coach/i
    );
  });
});
