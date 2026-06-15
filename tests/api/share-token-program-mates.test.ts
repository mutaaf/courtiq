/**
 * Ticket 0080 — GET /api/share/[token] now returns `programMates` for
 * the parent-portal cross-team forward.
 *
 * The existing parent-portal GET (widened by 0079 to return
 * `teamMates`) is widened AGAIN to also return:
 *
 *   programMates: Array<{
 *     player_id: string;
 *     first_name: string;
 *     team_name: string;
 *   }>
 *
 * This is the candidate list for the new "In your program" tab on the
 * ParentForwardOnTeamButton — OTHER players on DIFFERENT teams in the
 * SAME `org_id` whose parent_email exists AND whose team has at least
 * one row in `team_coaches` (LESSONS#0057 — team-coach lives on
 * `team_coaches`, NEVER `teams.coach_id`).
 *
 * COPPA: the response carries ONLY `player_id, first_name, team_name`
 * per entry — never DOB, jersey, parent_email, medical_notes, photo,
 * surname, parent_phone. The candidate list is capped at 50 entries
 * per program (LESSONS-style smallest-reasonable-cap).
 *
 * The Glob for `tests/api/share*` returns this file once it lands;
 * 0079's existing `share-parent-forward.test.ts` uses a
 * `mockReturnValueOnce` queue and so DOES need its queue extended for
 * the new shape — but the [token] route's GET is tested ONLY via this
 * file (no existing `share-token*.test.ts` to extend; per LESSONS#0116
 * an empty Glob sweep is a no-op).
 *
 * Mocks: hoisted Supabase via mockImplementation((table) => ...) per
 * LESSONS#0118 (the route walks many tables; queue-shape brittleness
 * is what burned the 0072 ship — table-keyed dispatch is safer).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

interface Resolved<T = unknown> {
  data: T | null;
  error: unknown;
}

/**
 * Build a thenable supabase chain that resolves to {data, error}. Every
 * builder method (.select / .eq / .neq / .in / .ilike / .gte / .lte /
 * .order / .limit / .is) returns the chain so the route can compose
 * filters; `.single()` / `.maybeSingle()` and `await` on the chain all
 * resolve to the same payload.
 */
function buildChain<T = unknown>(data: T | null, error: unknown = null) {
  const resolved: Resolved<T> = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: Resolved<T>) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const { mockFromFn } = vi.hoisted(() => ({ mockFromFn: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

// Stub the referral-code helper so the route doesn't compute one — we
// only care about the programMates shape.
vi.mock('@/lib/referral-code', () => ({
  makeReferralCode: vi.fn(() => 'CODECODE'),
}));

// Stub the coach-reactivation util so the 0072 best-effort branch
// stays a no-op (the dynamic import inside the route).
vi.mock('@/lib/coach-reactivation-utils', () => ({
  findDormantCoachesForReturningParent: vi.fn(() => []),
}));

import { GET } from '@/app/api/share/[token]/route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SHARE_TOKEN = 'test-share-token-0080-program-mates';

const SENDER_PLAYER_ID = '00000000-0000-4000-a000-000000000030';
const SENDER_TEAM_ID = '00000000-0000-4000-a000-000000000020';
const ORG_ID = '00000000-0000-4000-a000-000000000010';
const SENDER_COACH_ID = '00000000-0000-4000-a000-000000000001';

// Two OTHER teams in the SAME org, each with a head coach in
// team_coaches and players carrying parent_email.
const OTHER_TEAM_A_ID = '00000000-0000-4000-a000-000000000a01';
const OTHER_TEAM_B_ID = '00000000-0000-4000-a000-000000000a02';
// A third team in the SAME org with NO head coach — should be excluded.
const NO_COACH_TEAM_ID = '00000000-0000-4000-a000-000000000a03';
// A fourth team in the SAME org whose players have NO parent_email —
// the team gets excluded from candidates by virtue of the per-player
// parent_email filter (no player on it carries a parent_email).
const NO_EMAIL_TEAM_ID = '00000000-0000-4000-a000-000000000a04';

const SHARE_ROW = {
  id: '00000000-0000-4000-a000-000000000060',
  player_id: SENDER_PLAYER_ID,
  team_id: SENDER_TEAM_ID,
  coach_id: SENDER_COACH_ID,
  share_token: SHARE_TOKEN,
  is_active: true,
  expires_at: null,
  view_count: 0,
};

const SENDER_PLAYER = {
  id: SENDER_PLAYER_ID,
  name: 'Maya Walker',
  nickname: null,
  position: 'Guard',
  jersey_number: 1,
  photo_url: null,
  parent_name: 'Walker Family',
  parent_phone: null,
  parent_email: 'sarah@walker-family.test',
};

const SENDER_TEAM = {
  name: 'Hawks U10',
  age_group: '11-13',
  season: 'Spring 2026',
};

const SENDER_COACH = {
  full_name: 'Sarah Coach',
  preferences: {},
};

const TEAM_ORG = { org_id: ORG_ID };

// In-team teammate row (used by 0079 teamMates) — same team as sender.
const TEAM_MATE_BOB = {
  id: '00000000-0000-4000-a000-000000000031',
  name: 'Bob Carter',
  parent_email: 'bob-parent@e2e.test',
};

// Program teams + their head_coach rows.
const PROGRAM_TEAMS_FULL = [
  { id: OTHER_TEAM_A_ID, name: 'Hornets U10', org_id: ORG_ID },
  { id: OTHER_TEAM_B_ID, name: 'Bears U12', org_id: ORG_ID },
  { id: NO_COACH_TEAM_ID, name: 'Cardinals U8', org_id: ORG_ID },
  { id: NO_EMAIL_TEAM_ID, name: 'Eagles U14', org_id: ORG_ID },
];

const TEAM_COACHES_ROWS = [
  { team_id: OTHER_TEAM_A_ID, coach_id: 'coach-a-id', role: 'head_coach' },
  { team_id: OTHER_TEAM_B_ID, coach_id: 'coach-b-id', role: 'coach' },
  // NO_COACH_TEAM_ID intentionally absent — that team has no coach row.
  // NO_EMAIL_TEAM_ID has a head coach but its players carry no
  // parent_email so the candidate join drops it.
  { team_id: NO_EMAIL_TEAM_ID, coach_id: 'coach-d-id', role: 'head_coach' },
];

// Players across the OTHER teams in the same org.
const PROGRAM_PLAYERS = [
  // Two on team A — both with parent_email.
  {
    id: 'liam-id',
    name: 'Liam Hornet',
    team_id: OTHER_TEAM_A_ID,
    parent_email: 'liam-mom@e2e.test',
    is_active: true,
  },
  {
    id: 'noah-id',
    name: 'Noah Sting',
    team_id: OTHER_TEAM_A_ID,
    parent_email: 'noah-mom@e2e.test',
    is_active: true,
  },
  // One on team B — with parent_email.
  {
    id: 'devon-id',
    name: 'Devon Bear',
    team_id: OTHER_TEAM_B_ID,
    parent_email: 'devon-mom@e2e.test',
    is_active: true,
  },
  // One on the no-coach team — excluded because its team has no
  // team_coaches row at all.
  {
    id: 'sarah-id',
    name: 'Sarah Cardinal',
    team_id: NO_COACH_TEAM_ID,
    parent_email: 'sarah-mom@e2e.test',
    is_active: true,
  },
  // One on the no-email team — excluded because no parent_email.
  {
    id: 'eli-id',
    name: 'Eli Eagle',
    team_id: NO_EMAIL_TEAM_ID,
    parent_email: null,
    is_active: true,
  },
];

interface SetupOpts {
  /** Override the share lookup row. */
  share?: unknown;
  /** Override the sender's team's org_id row. */
  teamOrg?: { org_id: string } | null;
  /** The OTHER active players across the program (excluding sender). */
  programPlayers?: typeof PROGRAM_PLAYERS;
  /** Teams full rows (with org_id) for the program-wide team lookup. */
  programTeams?: typeof PROGRAM_TEAMS_FULL;
  /** Team-coaches rows for the program-wide head-coach gate. */
  teamCoaches?: typeof TEAM_COACHES_ROWS;
  /** Other-same-team players (sender's own team). */
  teamMatesRoster?: Array<{ id: string; name: string; parent_email: string | null }>;
  /** Override the sender's player row. */
  senderPlayer?: typeof SENDER_PLAYER;
}

function setupHappyPath(opts: SetupOpts = {}) {
  const share = (opts.share ?? SHARE_ROW) as typeof SHARE_ROW;
  const senderPlayer = opts.senderPlayer ?? SENDER_PLAYER;
  const teamOrg = opts.teamOrg === undefined ? TEAM_ORG : opts.teamOrg;
  const programPlayers = opts.programPlayers ?? PROGRAM_PLAYERS;
  const programTeams = opts.programTeams ?? PROGRAM_TEAMS_FULL;
  const teamCoaches = opts.teamCoaches ?? TEAM_COACHES_ROWS;
  const teamMatesRoster = opts.teamMatesRoster ?? [TEAM_MATE_BOB];

  mockFromFn.mockImplementation((table: string) => {
    switch (table) {
      case 'parent_shares':
        return buildChain(share);
      case 'players':
        // The route reads players multiple times, and the supabase-js
        // chain we hand back is the SAME chain object identity per
        // call — but we differentiate by the filter calls. Since the
        // test fixture is small, we simulate the route's behaviour
        // pragmatically:
        //   - the first `from('players').select(...).eq('id',
        //     share.player_id).single()` returns the sender player.
        //   - subsequent `from('players')` calls that the route uses
        //     to derive program-mates / team-mates / dormant-coach
        //     prior-players all resolve to a UNION of the program +
        //     team-mate roster (the route filters in-process).
        //
        // This is queue-shape-agnostic per LESSONS#0118 — we hand back
        // a builder whose `.single()` returns the sender and whose
        // `await` returns the multi-row roster. The route's actual
        // filter calls (`.eq('team_id', ...)`, `.neq('id', ...)`,
        // `.eq('is_active', true)`, etc.) all return the chain so the
        // last-resolved value is the same multi-row roster.
        return buildPlayersChain(senderPlayer, programPlayers, teamMatesRoster);
      case 'teams':
        // The route reads teams via:
        //   .from('teams').select('name, age_group, season').eq('id', share.team_id).single()
        //   .from('teams').select('org_id').eq('id', share.team_id).single()
        //   (new for 0080) .from('teams').select('id, name, org_id').eq('org_id', ORG_ID).neq('id', sender)
        return buildTeamsChain(SENDER_TEAM, teamOrg, programTeams, share.team_id);
      case 'coaches':
        return buildChain(SENDER_COACH);
      case 'org_branding':
        return buildChain(null);
      case 'observations':
        // Several reads; all return empty (the route handles
        // empty/null gracefully).
        return buildChain([]);
      case 'plans':
        return buildChain([]);
      case 'player_skill_proficiency':
        return buildChain([]);
      case 'player_achievements':
        return buildChain([]);
      case 'player_goals':
        return buildChain([]);
      case 'team_announcements':
        return buildChain([]);
      case 'sessions':
        return buildChain([]);
      case 'team_coaches':
        // The new program-mates gate — team_coaches rows for the OTHER
        // teams in the same program. Always returns the full set; the
        // route filters in-process.
        return buildChain(teamCoaches);
      case 'coach_reactivation_signals':
        return buildChain(null);
      default:
        return buildChain([]);
    }
  });
}

/**
 * The players chain has TWO modes:
 *   - `.single()` after `.eq('id', <senderId>)` → the sender player.
 *   - default await → the multi-row program/team-mate roster (applies
 *     the captured `.in('team_id', ...)` filter so the route's
 *     downstream join logic is honoured).
 */
function buildPlayersChain(
  sender: typeof SENDER_PLAYER,
  programPlayers: typeof PROGRAM_PLAYERS,
  teamMatesRoster: Array<{ id: string; name: string; parent_email: string | null }>,
) {
  const rosterUnion = [
    ...programPlayers,
    ...teamMatesRoster.map((m) => ({
      id: m.id,
      name: m.name,
      team_id: SENDER_TEAM_ID,
      parent_email: m.parent_email,
      is_active: true,
    })),
  ];
  // Captures the `.in('team_id', [...])` filter so the awaited result
  // honours it (the route uses the filter to scope the program-mate
  // roster to teams that have a team_coaches row).
  const inFilters: Array<{ column: string; values: string[] }> = [];
  const eqFilters: Array<{ column: string; value: unknown }> = [];
  const neqFilters: Array<{ column: string; value: unknown }> = [];
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn((column: string, value: unknown) => {
      eqFilters.push({ column, value });
      return chain;
    }),
    neq: vi.fn((column: string, value: unknown) => {
      neqFilters.push({ column, value });
      return chain;
    }),
    in: vi.fn((column: string, values: string[]) => {
      inFilters.push({ column, values });
      return chain;
    }),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: sender, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: sender, error: null }),
    then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) => {
      let filtered = rosterUnion as Array<{ team_id: string; id: string }>;
      for (const inFilter of inFilters) {
        if (inFilter.column === 'team_id') {
          filtered = filtered.filter((p) => inFilter.values.includes(p.team_id));
        }
      }
      for (const neqFilter of neqFilters) {
        if (neqFilter.column === 'id') {
          filtered = filtered.filter((p) => p.id !== neqFilter.value);
        }
      }
      return Promise.resolve({ data: filtered, error: null }).then(onFulfilled);
    },
  };
  return chain;
}

/**
 * The teams chain has THREE modes:
 *   - `.single()` after `.eq('id', share.team_id).select('name, age_group, season')`
 *     → the sender team display row.
 *   - `.single()` after `.eq('id', share.team_id).select('org_id')`
 *     → the team_org row { org_id }.
 *   - default await → the multi-row program teams.
 */
function buildTeamsChain(
  senderTeam: typeof SENDER_TEAM,
  teamOrg: { org_id: string } | null,
  programTeams: typeof PROGRAM_TEAMS_FULL,
  senderTeamId: string,
) {
  // Track which select shape was last requested.
  let lastSelect = '';
  const chain: Record<string, unknown> = {
    select: vi.fn((s?: string) => {
      lastSelect = typeof s === 'string' ? s : '';
      return chain;
    }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => {
      // Display row vs org_id-only row — disambiguate by select shape.
      if (lastSelect.includes('org_id') && !lastSelect.includes('name')) {
        return Promise.resolve({ data: teamOrg, error: null });
      }
      return Promise.resolve({ data: senderTeam, error: null });
    }),
    maybeSingle: vi.fn().mockResolvedValue({ data: senderTeam, error: null }),
    then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({
        data: programTeams.filter((t) => t.id !== senderTeamId),
        error: null,
      }).then(onFulfilled),
  };
  return chain;
}

function makeReq() {
  return new Request(`http://localhost/api/share/${SHARE_TOKEN}`);
}

const PARAMS = { params: Promise.resolve({ token: SHARE_TOKEN }) };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/share/[token] programMates (ticket 0080)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns programMates with first_name + team_name labelled for each candidate', async () => {
    setupHappyPath();
    const res = await GET(makeReq(), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.programMates)).toBe(true);
    // Two teams (A + B) with valid players AND a head coach (or any
    // coach role). The no-coach team and no-email team are excluded.
    const teamNames = json.programMates.map((m: { team_name: string }) => m.team_name);
    expect(teamNames).toContain('Hornets U10');
    expect(teamNames).toContain('Bears U12');
    expect(teamNames).not.toContain('Cardinals U8');
    expect(teamNames).not.toContain('Eagles U14');

    // First names only.
    const firstNames = json.programMates.map((m: { first_name: string }) => m.first_name);
    expect(firstNames).toContain('Liam');
    expect(firstNames).toContain('Noah');
    expect(firstNames).toContain('Devon');
    // No surnames.
    for (const name of firstNames) {
      expect(name).not.toMatch(/\s/);
    }
  });

  it('excludes teams with no team_coaches row (LESSONS#0057 — team-coach lives on team_coaches)', async () => {
    setupHappyPath();
    const res = await GET(makeReq(), PARAMS);
    const json = await res.json();
    const teams = json.programMates.map((m: { team_name: string }) => m.team_name);
    expect(teams).not.toContain('Cardinals U8');
    expect(teams.length).toBeGreaterThan(0);
  });

  it('excludes players with no parent_email', async () => {
    setupHappyPath();
    const res = await GET(makeReq(), PARAMS);
    const json = await res.json();
    const ids = json.programMates.map((m: { player_id: string }) => m.player_id);
    expect(ids).not.toContain('eli-id');
  });

  it("excludes the sender's OWN team's players from programMates (in-team go to teamMates)", async () => {
    setupHappyPath();
    const res = await GET(makeReq(), PARAMS);
    const json = await res.json();
    const ids = json.programMates.map((m: { player_id: string }) => m.player_id);
    // Bob is on the sender's team — he belongs to teamMates, NEVER
    // programMates.
    expect(ids).not.toContain(TEAM_MATE_BOB.id);
  });

  it('the response carries no surname, parent_email, DOB, jersey, medical, or photo on programMates entries', async () => {
    setupHappyPath();
    const res = await GET(makeReq(), PARAMS);
    const json = await res.json();
    const blob = JSON.stringify(json.programMates);
    expect(blob).not.toMatch(/parent_email/i);
    expect(blob).not.toMatch(/parent_phone/i);
    expect(blob).not.toMatch(/date_of_birth/i);
    expect(blob).not.toMatch(/medical_notes/i);
    expect(blob).not.toMatch(/photo_url/i);
    expect(blob).not.toMatch(/jersey_number/i);
    // Per-entry allow-list — every key must be in {player_id,
    // first_name, team_name}.
    const allowed = new Set(['player_id', 'first_name', 'team_name']);
    for (const entry of json.programMates as Array<Record<string, unknown>>) {
      for (const key of Object.keys(entry)) {
        expect(allowed.has(key), `unexpected key "${key}" in programMates entry`).toBe(true);
      }
    }
  });

  it("planted COPPA-sensitive fields on the underlying player rows are NEVER read into programMates", async () => {
    const planted = [
      {
        id: 'liam-id',
        name: 'Liam Hornet',
        team_id: OTHER_TEAM_A_ID,
        parent_email: 'liam-mom@e2e.test',
        // Sensitive planted fields:
        date_of_birth: '2015-06-01',
        medical_notes: 'mild asthma',
        jersey_number: 23,
        photo_url: 'https://x.test/photo.png',
        parent_phone: '+1-555-0100',
        is_active: true,
      },
    ];
    setupHappyPath({ programPlayers: planted as unknown as typeof PROGRAM_PLAYERS });
    const res = await GET(makeReq(), PARAMS);
    const json = await res.json();
    const blob = JSON.stringify(json.programMates);
    expect(blob).not.toContain('2015-06-01');
    expect(blob).not.toContain('mild asthma');
    expect(blob).not.toContain('555-0100');
    expect(blob).not.toContain('photo.png');
    expect(blob).not.toContain('"23"');
  });

  it('caps programMates at 50 entries to keep the portal-page server-render small', async () => {
    // Mint 60 candidates on team A — the route must cap at 50.
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `liam-${i}`,
      name: `Liam${i} Hornet`,
      team_id: OTHER_TEAM_A_ID,
      parent_email: `liam${i}-mom@e2e.test`,
      is_active: true,
    }));
    setupHappyPath({ programPlayers: many as unknown as typeof PROGRAM_PLAYERS });
    const res = await GET(makeReq(), PARAMS);
    const json = await res.json();
    expect(json.programMates.length).toBeLessThanOrEqual(50);
  });

  it('a free-tier neighbor coach is in the candidate list (the portal is not tier-gated)', async () => {
    // We never ask for coach tier on this read — just that a row in
    // team_coaches exists. Confirm the route never reads
    // organizations.tier / coaches.preferences.tier on the
    // program-mate path by asserting the route NEVER calls
    // `from('organizations')` for the program-mates derivation
    // (the existing org_branding read remains).
    setupHappyPath();
    const res = await GET(makeReq(), PARAMS);
    expect(res.status).toBe(200);
    const fromCalls = (mockFromFn.mock.calls as unknown[][]).map((c) => c[0] as string);
    // Tier resolution would manifest as a `from('organizations')`
    // read — the program-mates path must NOT trigger that lookup.
    expect(fromCalls).not.toContain('organizations');
  });

  it('returns programMates: [] (not null) when there are no eligible candidates', async () => {
    setupHappyPath({ programPlayers: [], programTeams: [], teamCoaches: [] });
    const res = await GET(makeReq(), PARAMS);
    const json = await res.json();
    expect(Array.isArray(json.programMates)).toBe(true);
    expect(json.programMates).toHaveLength(0);
  });
});
