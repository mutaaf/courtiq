/**
 * Ticket 0028 — POST /api/ai/program-pulse: the director-private weekly
 * "program pulse" built from the org's last 7 days of coach activity.
 *
 * Backend behaviours under test (one per acceptance-criteria box):
 *  (A) authenticated org admin + { orgId } → 200 with a structured pulse
 *      (week_summary string, active_coaches/total_coaches ints, teams_to_watch[],
 *      next_action with a closed `kind` enum) built from the org's last 7 days of
 *      coaches/sessions/observations; the call goes through callAIWithJSON with the
 *      resolved orgId so quota + provider routing apply.
 *  (B) below the activity threshold → 200 { pulse: null } with NO AI call.
 *  (C) no auth → 401 and no DB read.
 *  (D) role + tier scoped server-side: a non-admin coach of the org → 403, a coach
 *      of a DIFFERENT org → 403/404, a non-org tier → 403. BOTH the role check and
 *      the tier check happen in the route, not only in the UI.
 *  (E) COPPA: the pulse never exposes per-minor data — the prompt block is fed only
 *      aggregate counts + team/coach names, and the response carries no
 *      player-scoped fields.
 *
 * Strategy mirrors tests/ai/weekly-digest.test.ts: @/lib/supabase/server is a
 * chainable in-memory mock; @/lib/ai/client's callAIWithJSON is mocked.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob (reserved for
 * Playwright). See docs/LESSONS.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser, mockFromFn, mockCallAIWithJSON } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
  mockCallAIWithJSON: vi.fn(),
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

vi.mock('@/lib/ai/client', () => ({
  callAIWithJSON: mockCallAIWithJSON,
}));

import { POST as programPulsePost } from '@/app/api/ai/program-pulse/route';

// ─── Chainable mock helpers (mirror weekly-digest.test.ts) ───────────────────────

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

/** Several coaches in the org. */
function orgCoaches() {
  return [
    { id: 'coach-1', org_id: 'org-1', full_name: 'Pat Director', role: 'admin' },
    { id: 'coach-2', org_id: 'org-1', full_name: 'Jordan Rivera', role: 'coach' },
    { id: 'coach-3', org_id: 'org-1', full_name: 'Sam Quiet', role: 'coach' },
  ];
}

/** Two teams in the org. */
function orgTeams() {
  return [
    { id: 'team-u10', org_id: 'org-1', name: 'U10s' },
    { id: 'team-u12', org_id: 'org-1', name: 'U12s' },
  ];
}

/** A week of sessions + observations across two active coaches (coach-3 quiet). */
function weekOfSessions() {
  return [
    { id: 's1', team_id: 'team-u10', coach_id: 'coach-1', type: 'practice', created_at: new Date(now - 4 * day).toISOString() },
    { id: 's2', team_id: 'team-u10', coach_id: 'coach-1', type: 'practice', created_at: new Date(now - 2 * day).toISOString() },
    { id: 's3', team_id: 'team-u12', coach_id: 'coach-2', type: 'practice', created_at: new Date(now - 1 * day).toISOString() },
  ];
}

function weekOfObs() {
  return [
    { id: 'o1', team_id: 'team-u10', coach_id: 'coach-1', sentiment: 'positive', category: 'Defense', created_at: new Date(now - 4 * day).toISOString() },
    { id: 'o2', team_id: 'team-u10', coach_id: 'coach-1', sentiment: 'positive', category: 'Effort', created_at: new Date(now - 2 * day).toISOString() },
    { id: 'o3', team_id: 'team-u12', coach_id: 'coach-2', sentiment: 'needs-work', category: 'Offense', created_at: new Date(now - 1 * day).toISOString() },
    { id: 'o4', team_id: 'team-u12', coach_id: 'coach-2', sentiment: 'positive', category: 'IQ', created_at: new Date(now - 1 * day).toISOString() },
  ];
}

/** The pulse shape callAIWithJSON resolves to in the happy path. */
function pulseResult() {
  return {
    parsed: {
      week_summary: '2 of 3 coaches logged notes, 3 practices across the program.',
      active_coaches: 2,
      total_coaches: 3,
      teams_to_watch: [
        { team_name: 'U12s', note: 'Plenty of needs-work notes worth a check-in.' },
      ],
      next_action: {
        label: 'Nudge Sam — no notes logged in 2 weeks',
        kind: 'nudge_coach',
        rationale: 'Sam has not logged any activity this week.',
      },
    },
    interactionId: 'ai-int-pulse-1',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(orgId: unknown = 'org-1') {
  return new Request('http://localhost/api/ai/program-pulse', {
    method: 'POST',
    body: JSON.stringify({ orgId }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Wire mockFromFn for the standard "admin of org-1, organization tier, active
 * week" happy-path; callers override the coach row for the auth/role/tier cases.
 */
function wireOrg(opts: {
  role?: string;
  tier?: string;
  callerOrgId?: string;
  sessions?: unknown[];
  observations?: unknown[];
} = {}) {
  const role = opts.role ?? 'admin';
  const tier = opts.tier ?? 'organization';
  const callerOrgId = opts.callerOrgId ?? 'org-1';
  const sessions = opts.sessions ?? weekOfSessions();
  const observations = opts.observations ?? weekOfObs();

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      // The first read resolves the caller's own row (role + org + tier); a later
      // read lists all org coaches. We distinguish by what the route asks for:
      // the caller-row read uses .single() and returns the caller; the list read
      // resolves the array. buildChain serves the same data for both .single()
      // (caller) and the thenable (list), so we return a chain whose .single()
      // gives the caller and whose await gives the full roster.
      const callerRow = {
        id: 'coach-1',
        org_id: callerOrgId,
        role,
        organizations: { tier },
      };
      const chain = buildChain(orgCoaches()) as any;
      chain.single = vi.fn().mockResolvedValue({ data: callerRow, error: null });
      return chain;
    }
    if (table === 'teams') return buildChain(orgTeams());
    if (table === 'sessions') return buildChain(sessions);
    if (table === 'observations') return buildChain(observations);
    return buildChain(null);
  });
}

// ─── C. No auth → 401, no DB read ───────────────────────────────────────────────

describe('POST /api/ai/program-pulse — auth', () => {
  it('returns 401 and performs no DB read when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await programPulsePost(makeRequest());

    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── D. Role + tier enforcement is server-side ───────────────────────────────────

describe('POST /api/ai/program-pulse — role + tier gate', () => {
  it('returns 403 for a non-admin coach of the org and makes no AI call', async () => {
    setAuthUser('coach-2');
    wireOrg({ role: 'coach', tier: 'organization' });

    const res = await programPulsePost(makeRequest());

    expect(res.status).toBe(403);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns 403 for an admin on a non-organization tier and makes no AI call', async () => {
    setAuthUser('coach-1');
    wireOrg({ role: 'admin', tier: 'pro_coach' });

    const res = await programPulsePost(makeRequest());

    expect(res.status).toBe(403);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns 403/404 for a caller whose org_id does not match the requested orgId', async () => {
    setAuthUser('coach-1');
    // Caller is an org admin, but of a DIFFERENT org than the one requested.
    wireOrg({ role: 'admin', tier: 'organization', callerOrgId: 'org-999' });

    const res = await programPulsePost(makeRequest('org-1'));

    expect([403, 404]).toContain(res.status);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── B. Below threshold → 200 { pulse: null }, no AI call ─────────────────────────

describe('POST /api/ai/program-pulse — below activity threshold', () => {
  it('returns 200 { pulse: null } and makes NO AI call when the org had a quiet week', async () => {
    setAuthUser('coach-1');
    // One lonely observation, no sessions — below the threshold.
    wireOrg({
      sessions: [],
      observations: [
        { id: 'o1', team_id: 'team-u10', coach_id: 'coach-1', sentiment: 'positive', category: 'Defense', created_at: new Date(now - 1 * day).toISOString() },
      ],
    });

    const res = await programPulsePost(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pulse).toBeNull();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── A. Happy path: structured pulse via callAIWithJSON with orgId ────────────────

describe('POST /api/ai/program-pulse — happy path', () => {
  it('returns 200 with a structured pulse built from the org last 7 days', async () => {
    setAuthUser('coach-1');
    wireOrg();
    mockCallAIWithJSON.mockResolvedValue(pulseResult());

    const res = await programPulsePost(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pulse).not.toBeNull();
    expect(typeof body.pulse.week_summary).toBe('string');
    expect(typeof body.pulse.active_coaches).toBe('number');
    expect(typeof body.pulse.total_coaches).toBe('number');
    expect(Array.isArray(body.pulse.teams_to_watch)).toBe(true);
    expect(body.pulse.next_action.kind).toBe('nudge_coach');
  });

  it('routes through callAIWithJSON with the resolved orgId and interactionType custom', async () => {
    setAuthUser('coach-1');
    wireOrg();
    mockCallAIWithJSON.mockResolvedValue(pulseResult());

    await programPulsePost(makeRequest());

    expect(mockCallAIWithJSON).toHaveBeenCalledTimes(1);
    const callArgs = mockCallAIWithJSON.mock.calls[0][0];
    expect(callArgs.orgId).toBe('org-1');
    expect(callArgs.interactionType).toBe('custom');
    expect(callArgs.coachId).toBe('coach-1');
  });

  it('COPPA: the prompt block is fed only aggregate counts + team/coach names — no per-minor fields, and the response carries no player-scoped fields', async () => {
    setAuthUser('coach-1');
    wireOrg();
    mockCallAIWithJSON.mockResolvedValue(pulseResult());

    const res = await programPulsePost(makeRequest());

    const callArgs = mockCallAIWithJSON.mock.calls[0][0];
    const promptText = `${callArgs.systemPrompt}\n${callArgs.userPrompt}`;
    // Team-level and coach-level aggregates ARE present (team name + the quiet
    // coach surfaced as a nudge candidate by full name)…
    expect(promptText).toContain('U10s');
    expect(promptText).toContain('Sam Quiet');
    // …but NO player names, jerseys, or observation text leak into the prompt.
    expect(promptText).not.toContain('Alice');
    expect(promptText).not.toMatch(/jersey|player_id|birthdate|address|phone/i);

    // The response shape is coach/team aggregate only — no player-scoped fields.
    const body = await res.json();
    const pulseJson = JSON.stringify(body.pulse);
    expect(pulseJson).not.toMatch(/player_name|player_id|jersey/i);
  });
});
