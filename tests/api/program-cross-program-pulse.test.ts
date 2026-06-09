/**
 * Ticket 0077 — GET /api/program/cross-program-pulse?orgId=<uuid>
 *
 * Director-private cross-program pulse line. The route reads the caller's
 * own org's plans + the plans of OTHER orgs in the same SPORT, computes
 * each program's top skill emphasis over the last 14 days, and returns
 * (up to TWO) neighboring programs whose top skill matches the caller's
 * top skill. The persona is a director who already pays for 0028/0071;
 * the cross-program pulse rides the SAME `feature_program_pulse` gate.
 *
 * Auth posture MIRRORS the existing 0028 program-pulse + 0071 emergent-
 * focus routes (read at pickup per LESSONS#0096):
 *   - 401 unauthed
 *   - 403 non-org-tier OR non-admin coach
 *   - 404 cross-org / unknown org
 *   - 200 happy path
 *   - 200 { topSkill: null, neighborPrograms: [] } on best-effort silence
 *
 * Reconciliation note (Implementation log): the AC names
 * `organizations.select('id, name, sport_id')` but `organizations` has NO
 * `sport_id` column — sport is on `teams`. The route resolves sport via
 * teams (mirrors the 0075 sport-emergent-focus pattern), groups teams by
 * org_id, and returns up to 2 neighboring programs whose top-skill
 * matches.
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

import { GET as crossProgramPulseGet } from '@/app/api/program/cross-program-pulse/route';

// ─── Chainable mock helpers (mirror tests/api/org-emergent-focus.test.ts) ──

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

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

const BASKETBALL = 'sport-basketball';
const CALLER_ORG = 'org-caller-hawks';

interface WireOpts {
  role?: string;
  tier?: string;
  callerOrgId?: string;
  orgFound?: boolean;
  // teams across orgs in the sport.
  teams?: Array<{ id: string; org_id: string; sport_id: string }>;
  plans?: Array<{ team_id: string; skills_targeted: string[] | null; created_at: string }>;
  plansError?: unknown;
  // neighbor org rows (id + name).
  neighborOrgs?: Array<{ id: string; name: string }>;
  // admin coaches per org (for first_name + email).
  directorCoaches?: Array<{ id: string; org_id: string; full_name: string; email: string; role: string }>;
}

function defaultTeams() {
  return [
    // Caller org team — basketball.
    { id: 'team-caller-1', org_id: CALLER_ORG, sport_id: BASKETBALL },
    // Riverside (neighbor).
    { id: 'team-riverside-1', org_id: 'org-riverside', sport_id: BASKETBALL },
    // Westview (neighbor).
    { id: 'team-westview-1', org_id: 'org-westview', sport_id: BASKETBALL },
  ];
}

function defaultPlans() {
  // Caller, Riverside, Westview all on "transitions" — 3 per program.
  const out: Array<{ team_id: string; skills_targeted: string[] | null; created_at: string }> = [];
  for (let i = 0; i < 3; i++) {
    out.push({ team_id: 'team-caller-1', skills_targeted: ['transitions'], created_at: new Date(now - (1 + i) * day).toISOString() });
    out.push({ team_id: 'team-riverside-1', skills_targeted: ['transitions'], created_at: new Date(now - (1 + i) * day).toISOString() });
    out.push({ team_id: 'team-westview-1', skills_targeted: ['transitions'], created_at: new Date(now - (1 + i) * day).toISOString() });
  }
  return out;
}

function defaultNeighborOrgs() {
  return [
    { id: 'org-riverside', name: 'Riverside Basketball' },
    { id: 'org-westview', name: 'Westview Hoops' },
  ];
}

function defaultDirectorCoaches() {
  return [
    { id: 'coach-anna', org_id: 'org-riverside', full_name: 'Anna Reyes', email: 'anna@riverside.test', role: 'admin' },
    { id: 'coach-ben', org_id: 'org-westview', full_name: 'Ben Park', email: 'ben@westview.test', role: 'admin' },
  ];
}

function wire(opts: WireOpts = {}) {
  const role = opts.role ?? 'admin';
  const tier = opts.tier ?? 'organization';
  const callerOrgId = opts.callerOrgId ?? CALLER_ORG;
  const orgFound = opts.orgFound ?? true;
  const teams = opts.teams ?? defaultTeams();
  const plans = opts.plans ?? defaultPlans();
  const neighborOrgs = opts.neighborOrgs ?? defaultNeighborOrgs();
  const directorCoaches = opts.directorCoaches ?? defaultDirectorCoaches();

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      // The route reads twice from coaches:
      //   (a) the caller's own row (role + org_id + organizations.tier)
      //   (b) neighbor-org admin coaches (full_name + email)
      // We disambiguate by inspecting the next chain call's filter; the
      // single() flavor below resolves to the caller row, the array
      // flavor resolves to the admins.
      const callerRow = orgFound
        ? { id: 'coach-caller', org_id: callerOrgId, role, organizations: { tier } }
        : null;
      const adminRows = directorCoaches;
      // Build a chain that returns the caller row on .single() / .maybeSingle()
      // and the admin rows on plain await (the array read).
      const chain = buildChain(adminRows) as any;
      chain.single = vi.fn().mockResolvedValue({
        data: callerRow,
        error: orgFound ? null : { code: 'PGRST116' },
      });
      chain.maybeSingle = vi.fn().mockResolvedValue({
        data: callerRow,
        error: null,
      });
      return chain;
    }
    if (table === 'organizations') {
      // The route may resolve org names via this table. Return all known
      // orgs (caller + neighbors).
      const allOrgs = [
        { id: callerOrgId, name: 'Hawks Basketball' },
        ...neighborOrgs,
      ];
      return buildChain(allOrgs);
    }
    if (table === 'teams') {
      return buildChain(teams);
    }
    if (table === 'plans') {
      if (opts.plansError) return buildChain([], opts.plansError);
      return buildChain(plans);
    }
    if (table === 'coach_director_contacts') {
      // No prior contacts on the happy path.
      return buildChain([]);
    }
    // Default: empty.
    return buildChain([]);
  });
}

function makeRequest(orgId: unknown = CALLER_ORG) {
  const url = new URL('http://localhost/api/program/cross-program-pulse');
  if (orgId !== null && orgId !== undefined) {
    url.searchParams.set('orgId', String(orgId));
  }
  return new Request(url.toString(), { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
});

// ─── (vii) unauthed → 401 ───────────────────────────────────────────────────

describe('GET /api/program/cross-program-pulse — auth', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await crossProgramPulseGet(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });
});

// ─── (ii) not a director on the org → 403 ───────────────────────────────────

describe('GET /api/program/cross-program-pulse — role + tier gate', () => {
  it('returns 403 for a non-admin org coach (member but not director)', async () => {
    setAuthUser('coach-caller');
    wire({ role: 'coach', tier: 'organization' });

    const res = await crossProgramPulseGet(makeRequest(CALLER_ORG));
    expect(res.status).toBe(403);
  });

  it('returns 403 for a non-org-tier caller (coach tier admin)', async () => {
    setAuthUser('coach-caller');
    wire({ role: 'admin', tier: 'coach' });

    const res = await crossProgramPulseGet(makeRequest(CALLER_ORG));
    expect(res.status).toBe(403);
  });
});

// ─── cross-org caller → 404 ─────────────────────────────────────────────────

describe('GET /api/program/cross-program-pulse — org resolution', () => {
  it('returns 404 when the orgId does not match the callers own org', async () => {
    setAuthUser('coach-caller');
    wire({ role: 'admin', tier: 'organization', callerOrgId: 'org-OTHER' });

    const res = await crossProgramPulseGet(makeRequest(CALLER_ORG));
    expect(res.status).toBe(404);
  });
});

// ─── (i) happy path: 2 neighbor programs above threshold → 200 ─────────────

describe('GET /api/program/cross-program-pulse — happy path', () => {
  it('returns 200 with the populated result when 2 neighbor programs share the caller top skill', async () => {
    setAuthUser('coach-caller');
    wire();

    const res = await crossProgramPulseGet(makeRequest(CALLER_ORG));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topSkill).toBe('transitions');
    expect(Array.isArray(body.neighborPrograms)).toBe(true);
    expect(body.neighborPrograms).toHaveLength(2);
    const names = body.neighborPrograms.map((p: { org_name: string }) => p.org_name).sort();
    expect(names).toEqual(['Riverside Basketball', 'Westview Hoops']);
    // Director attribution carried through from the neighbor org's admin
    // coach row.
    const riverside = body.neighborPrograms.find(
      (p: { org_name: string }) => p.org_name === 'Riverside Basketball',
    );
    expect(riverside?.director_first_name).toBe('Anna');
    expect(riverside?.director_contact_email).toBe('anna@riverside.test');
  });
});

// ─── (iii) only ONE neighbor in the sport → 200 with empty neighborPrograms

describe('GET /api/program/cross-program-pulse — silence beats nag', () => {
  it('returns 200 { topSkill, neighborPrograms: [] } when only ONE neighbor program exists in the sport', async () => {
    setAuthUser('coach-caller');
    wire({
      teams: [
        { id: 'team-caller-1', org_id: CALLER_ORG, sport_id: BASKETBALL },
        { id: 'team-riverside-1', org_id: 'org-riverside', sport_id: BASKETBALL },
      ],
      neighborOrgs: [{ id: 'org-riverside', name: 'Riverside Basketball' }],
      plans: [
        ...Array.from({ length: 3 }).map((_, i) => ({
          team_id: 'team-caller-1',
          skills_targeted: ['transitions'],
          created_at: new Date(now - (1 + i) * day).toISOString(),
        })),
        ...Array.from({ length: 3 }).map((_, i) => ({
          team_id: 'team-riverside-1',
          skills_targeted: ['transitions'],
          created_at: new Date(now - (1 + i) * day).toISOString(),
        })),
      ],
    });

    const res = await crossProgramPulseGet(makeRequest(CALLER_ORG));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.neighborPrograms).toEqual([]);
  });
});

// ─── (iv) caller's own program is NEVER in neighborPrograms ────────────────

describe('GET /api/program/cross-program-pulse — caller is never a neighbor', () => {
  it('the response neighborPrograms never includes the callers own org', async () => {
    setAuthUser('coach-caller');
    wire();

    const res = await crossProgramPulseGet(makeRequest(CALLER_ORG));
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.neighborPrograms.map((p: { org_id: string }) => p.org_id);
    expect(ids).not.toContain(CALLER_ORG);
  });
});

// ─── (v) plans older than 14 days are excluded ─────────────────────────────

describe('GET /api/program/cross-program-pulse — window', () => {
  it('returns 200 empty when every plan is OUTSIDE the 14-day window', async () => {
    setAuthUser('coach-caller');
    wire({
      plans: [
        // All 30 days old.
        ...defaultTeams().map((t) => ({
          team_id: t.id,
          skills_targeted: ['transitions'],
          created_at: new Date(now - 30 * day).toISOString(),
        })),
      ],
    });

    const res = await crossProgramPulseGet(makeRequest(CALLER_ORG));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topSkill).toBeNull();
    expect(body.neighborPrograms).toEqual([]);
  });
});

// ─── (vi) a query failure on plans → 200 empty (best-effort, LESSONS#0036) ─

describe('GET /api/program/cross-program-pulse — best-effort', () => {
  it('returns 200 { topSkill: null, neighborPrograms: [] } on a plans-read error', async () => {
    setAuthUser('coach-caller');
    wire({ plansError: { message: 'boom', code: '500' } });

    const res = await crossProgramPulseGet(makeRequest(CALLER_ORG));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topSkill).toBeNull();
    expect(body.neighborPrograms).toEqual([]);
  });
});

// ─── (viii) Privacy / COPPA contract ───────────────────────────────────────

describe('GET /api/program/cross-program-pulse — privacy contract', () => {
  it('never reads players / observations / parent_email / DOB / medical_notes from the route paths', async () => {
    setAuthUser('coach-caller');
    wire();

    await crossProgramPulseGet(makeRequest(CALLER_ORG));

    const tablesRead = mockFromFn.mock.calls.map((c) => c[0]);
    // Allow-listed reads ONLY: coaches, organizations, teams, plans,
    // coach_director_contacts.
    for (const t of tablesRead) {
      expect([
        'coaches',
        'organizations',
        'teams',
        'plans',
        'coach_director_contacts',
      ]).toContain(t);
    }
    // Explicit negative-list: minor-data tables / columns are NEVER read.
    for (const banned of ['players', 'observations', 'parent_shares', 'media']) {
      expect(tablesRead).not.toContain(banned);
    }
  });

  it('response payload contains no minor-data fields (player names, jersey, DOB)', async () => {
    setAuthUser('coach-caller');
    wire();

    const res = await crossProgramPulseGet(makeRequest(CALLER_ORG));
    const body = await res.json();
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/jersey|player_name|player_id|date_of_birth|medical_notes|parent_email|parent_phone/i);
  });

  // (ix) when no director contact exists for a neighbor program, the
  // returned program has `director_contact_email` undefined.
  it('returns director_contact_email undefined when no admin coach exists for the neighbor program', async () => {
    setAuthUser('coach-caller');
    wire({
      directorCoaches: [
        // Only Riverside has an admin coach; Westview has none.
        { id: 'coach-anna', org_id: 'org-riverside', full_name: 'Anna Reyes', email: 'anna@riverside.test', role: 'admin' },
      ],
    });

    const res = await crossProgramPulseGet(makeRequest(CALLER_ORG));
    expect(res.status).toBe(200);
    const body = await res.json();
    const westview = body.neighborPrograms.find(
      (p: { org_name: string }) => p.org_name === 'Westview Hoops',
    );
    expect(westview).toBeTruthy();
    expect(westview.director_contact_email == null || westview.director_contact_email === undefined).toBe(true);
  });
});
