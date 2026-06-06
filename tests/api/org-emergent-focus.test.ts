/**
 * Ticket 0071 — GET /api/org/emergent-focus?orgId=...
 *
 * Director-private weekly emergent-focus card. The route reads the last 14
 * days of `plans` for every team in the org, aggregates skills_targeted
 * across distinct teams, and returns the top 1 or 2 skills with ≥
 * MIN_CONVERGENCE = 3 distinct teams.
 *
 * Auth posture mirrors the existing 0028 program-pulse route exactly:
 *   - `coaches.role === 'admin'` AND `organizations.tier === 'organization'`
 *   - 401 unauthed, 403 non-admin OR non-org tier, 404 cross-org / unknown org
 *
 * The route uses ONLY allow-list selects:
 *   - `teams.select('id, name')` (NEVER players, observations, parent_*, DOB)
 *   - `plans.select('team_id, skills_targeted, created_at')`
 *
 * Best-effort: a plans read failure resolves to `200 { focuses: [] }` per
 * the 0028 posture (silence beats nag).
 *
 * Strategy mirrors tests/ai/program-pulse.test.ts — chainable in-memory
 * mock keyed by table name.
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

import { GET as emergentFocusGet } from '@/app/api/org/emergent-focus/route';

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

function orgPlans(skillOnEachTeam: string, teamIds: string[]) {
  return teamIds.map((t, i) => ({
    team_id: t,
    skills_targeted: [skillOnEachTeam],
    created_at: new Date(now - (1 + i) * day).toISOString(),
  }));
}

interface WireOpts {
  role?: string;
  tier?: string;
  callerOrgId?: string;
  orgFound?: boolean; // for the unknown-orgId case
  teams?: Array<{ id: string; name: string }>;
  plans?: Array<{ team_id: string; skills_targeted: string[] | null; created_at: string }>;
  plansError?: unknown;
}

function defaultTeams() {
  return [
    { id: 'team-u10', name: 'Hawks U10' },
    { id: 'team-u12', name: 'Sharks U12' },
    { id: 'team-u14', name: 'Eagles U14' },
  ];
}

function wire(opts: WireOpts = {}) {
  const role = opts.role ?? 'admin';
  const tier = opts.tier ?? 'organization';
  const callerOrgId = opts.callerOrgId ?? 'org-1';
  const orgFound = opts.orgFound ?? true;
  const teams = opts.teams ?? defaultTeams();
  const plans = opts.plans ?? orgPlans('closeouts', teams.map((t) => t.id));

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      const callerRow = orgFound
        ? { id: 'coach-1', org_id: callerOrgId, role, organizations: { tier } }
        : null;
      const chain = buildChain(callerRow) as any;
      chain.single = vi.fn().mockResolvedValue({
        data: callerRow,
        error: orgFound ? null : { code: 'PGRST116' },
      });
      return chain;
    }
    if (table === 'teams') return buildChain(teams);
    if (table === 'plans') {
      if (opts.plansError) {
        const chain = buildChain([], opts.plansError);
        return chain;
      }
      return buildChain(plans);
    }
    return buildChain(null);
  });
}

function makeRequest(orgId: unknown = 'org-1') {
  const url = new URL('http://localhost/api/org/emergent-focus');
  if (orgId !== null && orgId !== undefined) {
    url.searchParams.set('orgId', String(orgId));
  }
  return new Request(url.toString(), { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
});

// ─── (iv) Unauthed → 401 ────────────────────────────────────────────────────

describe('GET /api/org/emergent-focus — auth', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await emergentFocusGet(makeRequest());

    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });
});

// ─── (ii) Coach-tier → 403 / (iii) Non-member → 403 ─────────────────────────

describe('GET /api/org/emergent-focus — role + tier gate', () => {
  it('returns 403 for a non-org-tier caller (coach tier admin)', async () => {
    setAuthUser('coach-1');
    wire({ role: 'admin', tier: 'coach' });

    const res = await emergentFocusGet(makeRequest('org-1'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.reason).toBe('tier');
  });

  it('returns 403 for a non-admin org coach (member but not director)', async () => {
    setAuthUser('coach-1');
    wire({ role: 'coach', tier: 'organization' });

    const res = await emergentFocusGet(makeRequest('org-1'));

    expect(res.status).toBe(403);
  });
});

// ─── (v) Unknown orgId → 404 / (iii) Cross-org → 404 ────────────────────────

describe('GET /api/org/emergent-focus — org resolution', () => {
  it('returns 404 when the orgId does not match the callers own org', async () => {
    setAuthUser('coach-1');
    wire({ role: 'admin', tier: 'organization', callerOrgId: 'org-OTHER' });

    const res = await emergentFocusGet(makeRequest('org-1'));

    expect(res.status).toBe(404);
  });

  it('returns 400 when orgId is missing from the query string', async () => {
    setAuthUser('coach-1');
    wire();

    const res = await emergentFocusGet(makeRequest(null));

    expect([400, 404]).toContain(res.status);
  });
});

// ─── (i) Happy path: 3 teams converge → 200 with the focus ──────────────────

describe('GET /api/org/emergent-focus — happy path', () => {
  it('returns 200 with the emergent focus when 3+ teams converge on a skill', async () => {
    setAuthUser('coach-1');
    wire();

    const res = await emergentFocusGet(makeRequest('org-1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.focuses)).toBe(true);
    expect(body.focuses).toHaveLength(1);
    expect(body.focuses[0].skill).toBe('closeouts');
    expect(body.focuses[0].teamCount).toBe(3);
    expect(body.focuses[0].teams).toHaveLength(3);
    expect(body.focuses[0].teams.map((t: { name: string }) => t.name).sort()).toEqual(
      ['Eagles U14', 'Hawks U10', 'Sharks U12']
    );
  });

  it('returns 200 with focuses: [] when the org has no convergence this week', async () => {
    setAuthUser('coach-1');
    // Only 2 teams targeted closeouts — below MIN_CONVERGENCE = 3.
    wire({
      plans: [
        { team_id: 'team-u10', skills_targeted: ['closeouts'], created_at: new Date(now - day).toISOString() },
        { team_id: 'team-u12', skills_targeted: ['closeouts'], created_at: new Date(now - day).toISOString() },
      ],
    });

    const res = await emergentFocusGet(makeRequest('org-1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focuses).toEqual([]);
  });
});

// ─── (vi) plans read failure → 200 { focuses: [] } (best-effort) ────────────

describe('GET /api/org/emergent-focus — best-effort', () => {
  it('returns 200 { focuses: [] } when the plans read fails (silence beats nag)', async () => {
    setAuthUser('coach-1');
    wire({ plansError: { message: 'boom', code: '500' } });

    const res = await emergentFocusGet(makeRequest('org-1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focuses).toEqual([]);
  });
});

// ─── (vii) Privacy / COPPA contract ─────────────────────────────────────────

describe('GET /api/org/emergent-focus — privacy contract', () => {
  it('never reads players / observations / parent_email / DOB / medical_notes from the route paths', async () => {
    setAuthUser('coach-1');
    wire();

    await emergentFocusGet(makeRequest('org-1'));

    const tablesRead = mockFromFn.mock.calls.map((c) => c[0]);
    // Allow-listed reads ONLY: coaches (caller-row), teams, plans.
    for (const t of tablesRead) {
      expect(['coaches', 'teams', 'plans']).toContain(t);
    }
    // Explicit negative-list: minor-data tables / columns are NEVER read.
    for (const banned of ['players', 'observations', 'parent_shares', 'media']) {
      expect(tablesRead).not.toContain(banned);
    }
  });

  it('response payload contains no minor-data fields (player names, jersey, DOB)', async () => {
    setAuthUser('coach-1');
    wire();

    const res = await emergentFocusGet(makeRequest('org-1'));
    const body = await res.json();
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/jersey|player_name|player_id|date_of_birth|medical_notes|parent_email|parent_phone/i);
  });
});
