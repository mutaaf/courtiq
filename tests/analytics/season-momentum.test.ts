/**
 * Ticket 0032 — GET /api/analytics/season-momentum: the coach-private
 * season-position card built from data we already collect (teams.current_week /
 * teams.season_weeks + accumulated observations). No AI call, no new artifact.
 *
 * Backend behaviours under test (one per acceptance-criteria box):
 *  (AC1) authenticated coach + ?teamId → 200 { weekPosition, weekTotal,
 *        weeksActive, trend } where weekPosition = teams.current_week,
 *        weekTotal = teams.season_weeks, weeksActive is derived from the team's
 *        earliest observation to now, and trend = { positiveCount, totalCount }
 *        over the team's recent observations.
 *  (AC2) a team with season_weeks = null still returns 200 { weekTotal: null,… }
 *        (not an error) so the card can fall back to a weeks-active display.
 *  (AC3) no auth → 401 and NO DB read.
 *  (AC4) org-scoped: a cross-org teamId → 404 (matching /api/ai/weekly-star's
 *        not-found contract) and reads NO observations for that team.
 *  (AC5) tier enforcement is server-side: canAccess(tier,
 *        'feature_season_momentum') → 403 for a free coach, 200 for
 *        coach/pro_coach/organization. Plus the pure canAccess assertions.
 *  (AC8, no-AI branch) the route makes NO callAI* invocation — the trend
 *        sentence is derived deterministically from the counts.
 *  (AC9) COPPA: the response carries only aggregate integers + the team's own
 *        season position — no player name, jersey, or observation text.
 *
 * Strategy mirrors tests/ai/program-pulse.test.ts: @/lib/supabase/server is a
 * chainable in-memory mock; @/lib/ai/client's callAI/callAIWithJSON are mocked
 * so we can assert they are never invoked.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the Playwright spec glob. See
 * docs/LESSONS.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canAccess } from '@/lib/tier';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser, mockFromFn, mockCallAI, mockCallAIWithJSON } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
  mockCallAI: vi.fn(),
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
  callAI: mockCallAI,
  callAIWithJSON: mockCallAIWithJSON,
}));

import { GET as seasonMomentumGet } from '@/app/api/analytics/season-momentum/route';

// ─── Chainable mock helpers (mirror program-pulse.test.ts) ───────────────────────

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

/** Recent observations: 7 positive, 3 needs-work, earliest ~6 weeks ago. */
function teamObservations() {
  return [
    { sentiment: 'positive', created_at: new Date(now - 1 * day).toISOString() },
    { sentiment: 'positive', created_at: new Date(now - 2 * day).toISOString() },
    { sentiment: 'positive', created_at: new Date(now - 3 * day).toISOString() },
    { sentiment: 'needs-work', created_at: new Date(now - 4 * day).toISOString() },
    { sentiment: 'positive', created_at: new Date(now - 5 * day).toISOString() },
    { sentiment: 'positive', created_at: new Date(now - 6 * day).toISOString() },
    { sentiment: 'needs-work', created_at: new Date(now - 7 * day).toISOString() },
    { sentiment: 'positive', created_at: new Date(now - 10 * day).toISOString() },
    { sentiment: 'positive', created_at: new Date(now - 20 * day).toISOString() },
    { sentiment: 'needs-work', created_at: new Date(now - 42 * day).toISOString() },
  ];
}

function makeRequest(teamId: unknown = 'team-1') {
  const url = teamId === undefined
    ? 'http://localhost/api/analytics/season-momentum'
    : `http://localhost/api/analytics/season-momentum?teamId=${teamId}`;
  return new Request(url);
}

/**
 * Wire the standard happy path: caller (coach-1) is org-1, the team is org-1,
 * season_weeks set, with the recent observations above. Callers override.
 */
function wire(opts: {
  tier?: string;
  callerOrgId?: string;
  teamOrgId?: string | null;
  seasonWeeks?: number | null;
  currentWeek?: number;
  observations?: unknown[];
  observationsRead?: { value: boolean };
} = {}) {
  const tier = opts.tier ?? 'coach';
  const callerOrgId = opts.callerOrgId ?? 'org-1';
  const teamOrgId = opts.teamOrgId === undefined ? 'org-1' : opts.teamOrgId;
  const seasonWeeks = opts.seasonWeeks === undefined ? 12 : opts.seasonWeeks;
  const currentWeek = opts.currentWeek ?? 6;
  const observations = opts.observations ?? teamObservations();

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      return buildChain({ id: 'coach-1', org_id: callerOrgId, organizations: { tier } });
    }
    if (table === 'teams') {
      // A non-owned team resolves to null org (or a different org) so the route
      // can apply its not-found contract.
      return buildChain(
        teamOrgId === null
          ? null
          : { org_id: teamOrgId, season_weeks: seasonWeeks, current_week: currentWeek },
      );
    }
    if (table === 'observations') {
      if (opts.observationsRead) opts.observationsRead.value = true;
      return buildChain(observations);
    }
    return buildChain(null);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── AC3. No auth → 401, no DB read ──────────────────────────────────────────────

describe('GET /api/analytics/season-momentum — auth', () => {
  it('returns 401 and performs no DB read when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await seasonMomentumGet(makeRequest());

    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
    expect(mockCallAI).not.toHaveBeenCalled();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── AC5. Tier enforcement is server-side ────────────────────────────────────────

describe('GET /api/analytics/season-momentum — tier gate', () => {
  it('canAccess: feature_season_momentum is gated to coach+ (free is excluded)', () => {
    expect(canAccess('free', 'feature_season_momentum')).toBe(false);
    expect(canAccess('coach', 'feature_season_momentum')).toBe(true);
    expect(canAccess('pro_coach', 'feature_season_momentum')).toBe(true);
    expect(canAccess('organization', 'feature_season_momentum')).toBe(true);
  });

  it('returns 403 for a free coach and reads no observations / makes no AI call', async () => {
    setAuthUser('coach-1');
    const observationsRead = { value: false };
    wire({ tier: 'free', observationsRead });

    const res = await seasonMomentumGet(makeRequest());

    expect(res.status).toBe(403);
    expect(observationsRead.value).toBe(false);
    expect(mockCallAI).not.toHaveBeenCalled();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns 200 for a coach-tier coach', async () => {
    setAuthUser('coach-1');
    wire({ tier: 'coach' });

    const res = await seasonMomentumGet(makeRequest());
    expect(res.status).toBe(200);
  });

  it('returns 200 for a pro_coach and an organization coach', async () => {
    for (const tier of ['pro_coach', 'organization']) {
      vi.clearAllMocks();
      setAuthUser('coach-1');
      wire({ tier });
      const res = await seasonMomentumGet(makeRequest());
      expect(res.status).toBe(200);
    }
  });
});

// ─── AC4. Org-scoped: a cross-org teamId → 404, no observations read ──────────────

describe('GET /api/analytics/season-momentum — org scope', () => {
  it('returns 404 for a teamId the caller org does not own and reads no observations', async () => {
    setAuthUser('coach-1');
    const observationsRead = { value: false };
    // Caller is org-1; the team belongs to org-999.
    wire({ teamOrgId: 'org-999', observationsRead });

    const res = await seasonMomentumGet(makeRequest('team-other'));

    expect(res.status).toBe(404);
    expect(observationsRead.value).toBe(false);
  });

  it('returns 404 for a non-existent team and reads no observations', async () => {
    setAuthUser('coach-1');
    const observationsRead = { value: false };
    wire({ teamOrgId: null, observationsRead });

    const res = await seasonMomentumGet(makeRequest('team-missing'));

    expect(res.status).toBe(404);
    expect(observationsRead.value).toBe(false);
  });
});

// ─── AC1. Happy path: position + trend counts ────────────────────────────────────

describe('GET /api/analytics/season-momentum — position + trend', () => {
  it('returns the week position, total, weeksActive, and trend counts', async () => {
    setAuthUser('coach-1');
    wire({ seasonWeeks: 12, currentWeek: 6 });

    const res = await seasonMomentumGet(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.weekPosition).toBe(6);
    expect(body.weekTotal).toBe(12);
    // earliest observation ~6 weeks ago → weeksActive ~6 (>= 1).
    expect(typeof body.weeksActive).toBe('number');
    expect(body.weeksActive).toBeGreaterThanOrEqual(1);
    // 7 positive of 10 recent observations.
    expect(body.trend).toEqual({ positiveCount: 7, totalCount: 10 });
  });
});

// ─── AC2. season_weeks null → 200 with weekTotal null ────────────────────────────

describe('GET /api/analytics/season-momentum — no season set', () => {
  it('returns 200 { weekTotal: null, … } with a valid weeksActive when season_weeks is null', async () => {
    setAuthUser('coach-1');
    wire({ seasonWeeks: null, currentWeek: 4 });

    const res = await seasonMomentumGet(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.weekTotal).toBeNull();
    expect(body.weekPosition).toBe(4);
    expect(typeof body.weeksActive).toBe('number');
    expect(body.weeksActive).toBeGreaterThanOrEqual(1);
  });
});

// ─── AC8 (no-AI branch). The route makes NO AI call ──────────────────────────────

describe('GET /api/analytics/season-momentum — deterministic, no AI', () => {
  it('makes NO callAI / callAIWithJSON invocation on the happy path', async () => {
    setAuthUser('coach-1');
    wire();

    const res = await seasonMomentumGet(makeRequest());

    expect(res.status).toBe(200);
    expect(mockCallAI).not.toHaveBeenCalled();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── AC9 (COPPA). Aggregate-only response — no per-minor fields ───────────────────

describe('GET /api/analytics/season-momentum — COPPA / data minimization', () => {
  it('the response carries only aggregate integers + team-level position; no player fields', async () => {
    setAuthUser('coach-1');
    wire();

    const res = await seasonMomentumGet(makeRequest());
    const body = await res.json();

    const json = JSON.stringify(body);
    expect(json).not.toMatch(/player_name|player_id|jersey|birthdate|address|phone|parent_/i);

    // The body is a small, closed set of aggregate fields.
    expect(Object.keys(body).sort()).toEqual(['trend', 'weekPosition', 'weekTotal', 'weeksActive']);
    expect(Object.keys(body.trend).sort()).toEqual(['positiveCount', 'totalCount']);
  });
});
