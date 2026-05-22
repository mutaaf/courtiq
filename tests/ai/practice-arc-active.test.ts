/**
 * Ticket 0018 — GET /api/ai/practice-arc/active
 *
 * Returns the team's most recent practice_arc plan with a computed
 * currentSessionNumber, or { active: null } when none exists.
 * Team-scoped via coach_id: a coach can never read another team's arc.
 *
 * Strategy mirrors tests/team-card/*: replace @/lib/supabase/server with a
 * chainable in-memory mock so the route's branching logic runs without a DB.
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

import { GET } from '@/app/api/ai/practice-arc/active/route';

// ------------------------------------------------------------------ helpers --

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    // array-resolving terminal
    then: undefined as unknown,
  };
  // Make the chain itself a thenable that resolves to { data, error }
  // so `await admin.from('plans').select(...).eq(...).order(...).limit(1)` works.
  (chain as Record<string, unknown>)['[Symbol.iterator]'] = undefined;
  // Override limit to be the array-resolving terminal
  chain.limit = vi.fn().mockResolvedValue(resolved);
  return chain;
}

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}
function setNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

function req(teamId: string) {
  return new Request(`http://localhost/api/ai/practice-arc/active?teamId=${teamId}`);
}

// A minimal practice_arc plan row as saved by /api/ai/practice-arc
const SAMPLE_ARC = {
  id: 'plan-arc-1',
  team_id: 'team-1',
  coach_id: 'coach-1',
  type: 'practice_arc',
  title: 'Defense Arc — 3 Sessions',
  created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
  content_structured: {
    arc_title: 'Defense Arc',
    total_sessions: 3,
    sessions: [
      {
        session_number: 1,
        theme: 'Closeouts',
        carries_forward: 'Introduced closeout footwork; reinforce stance in session 2',
        key_coaching_point: 'Stay low, approach with control',
        drills: [],
      },
      {
        session_number: 2,
        theme: 'Help Defense',
        carries_forward: 'Build on closeouts; add rotation reads in session 3',
        key_coaching_point: 'Talk on every cut',
        drills: [],
      },
      {
        session_number: 3,
        theme: 'Game-Speed Defense',
        carries_forward: null,
        key_coaching_point: 'Apply everything in 5v5',
        drills: [],
      },
    ],
    progression_note: 'Three-session defensive build from individual to team',
  },
};

// ------------------------------------------------------------------ tests --

describe('GET /api/ai/practice-arc/active', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC: no auth → 401 and no DB read
  it('returns 401 when unauthenticated', async () => {
    setNoAuth();
    const res = await GET(req('team-1'));
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  // AC: team has no practice_arc plan → { active: null }
  it('returns { active: null } when the team has no practice_arc plan', async () => {
    setAuthUser();
    // plans query returns empty
    mockFromFn.mockImplementation(() => buildChain([], null));
    const res = await GET(req('team-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBeNull();
  });

  // AC: missing teamId → 400
  it('returns 400 when teamId is missing', async () => {
    setAuthUser();
    const res = await GET(new Request('http://localhost/api/ai/practice-arc/active'));
    expect(res.status).toBe(400);
  });

  // AC: returns arc with currentSessionNumber
  it('returns the active arc with currentSessionNumber computed from sessions since arc creation', async () => {
    setAuthUser();

    // Two sessions have been logged since the arc was created
    const sessionsSinceArc = [{ id: 'sess-1' }, { id: 'sess-2' }];

    let callCount = 0;
    mockFromFn.mockImplementation((table: string) => {
      callCount++;
      if (table === 'plans') {
        return buildChain([SAMPLE_ARC], null);
      }
      if (table === 'sessions') {
        return buildChain(sessionsSinceArc, null);
      }
      return buildChain(null, null);
    });

    const res = await GET(req('team-1'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.active).not.toBeNull();
    expect(body.active.arc_title).toBe('Defense Arc');
    expect(body.active.total_sessions).toBe(3);
    // 2 sessions logged → currently in session 3 (clamped to [1, 3])
    expect(body.active.currentSessionNumber).toBe(3);
    // current session index is 3-1=2 (0-indexed)
    expect(body.active.currentSession).toBeDefined();
    expect(body.active.priorSession).toBeDefined();
    expect(body.active.priorSession?.carries_forward).toBe(
      'Build on closeouts; add rotation reads in session 3',
    );
  });

  // AC: currentSessionNumber clamped to [1, totalSessions] even if more sessions logged
  it('clamps currentSessionNumber to totalSessions when more sessions have been logged', async () => {
    setAuthUser();
    // 10 sessions logged — well beyond the 3-session arc
    const manySessions = Array.from({ length: 10 }, (_, i) => ({ id: `sess-${i}` }));

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'plans') return buildChain([SAMPLE_ARC], null);
      if (table === 'sessions') return buildChain(manySessions, null);
      return buildChain(null, null);
    });

    const res = await GET(req('team-1'));
    const body = await res.json();
    expect(body.active.currentSessionNumber).toBe(3); // clamped
  });

  // AC: team-scoped — another coach's arc is not returned
  it('returns { active: null } when the practice_arc was created by a different coach', async () => {
    setAuthUser('coach-2'); // authenticated as coach-2
    // plans query for coach-2 returns empty (the arc belongs to coach-1)
    mockFromFn.mockImplementation(() => buildChain([], null));
    const res = await GET(req('team-1'));
    const body = await res.json();
    expect(body.active).toBeNull();
  });
});

// ------------------------------------------------------------------ prompt --

describe('PROMPT_REGISTRY.practicePlan — arcContext threading', () => {
  it('produces the same user prompt when arcContext is absent (regression)', async () => {
    const { PROMPT_REGISTRY } = await import('@/lib/ai/prompts');
    const params = { teamName: 'Rockets', ageGroup: '10-12', practiceDuration: 60, seasonWeek: 3, playerCount: 10 };
    const withoutArc = PROMPT_REGISTRY.practicePlan(params).user;
    const withUndefined = PROMPT_REGISTRY.practicePlan({ ...params, arcContext: undefined }).user;
    expect(withoutArc).toBe(withUndefined);
    expect(withoutArc).not.toContain('ARC CONTINUITY');
  });

  it('threads arcContext into the user prompt when provided', async () => {
    const { PROMPT_REGISTRY } = await import('@/lib/ai/prompts');
    const params = {
      teamName: 'Rockets',
      ageGroup: '10-12',
      practiceDuration: 60,
      seasonWeek: 3,
      playerCount: 10,
      arcContext: {
        arcTitle: 'Defense Arc',
        sessionNumber: 2,
        totalSessions: 3,
        carriesForward: 'Introduced closeouts; reinforce stance',
        keyCoachingPoint: 'Stay low on approach',
      },
    };
    const prompt = PROMPT_REGISTRY.practicePlan(params).user;
    expect(prompt).toContain('ARC CONTINUITY');
    expect(prompt).toContain('session 2 of 3');
    expect(prompt).toContain('Defense Arc');
    expect(prompt).toContain('Introduced closeouts');
    expect(prompt).toContain('Stay low on approach');
  });

  it('arcContext block appears after any insights block', async () => {
    const { PROMPT_REGISTRY } = await import('@/lib/ai/prompts');
    const params = {
      teamName: 'Rockets',
      ageGroup: '10-12',
      practiceDuration: 60,
      seasonWeek: 3,
      playerCount: 10,
      observationInsights: {
        totalObs: 10,
        daysOfData: 14,
        topNeedsWork: [{ category: 'Defense', count: 5 }],
        topStrengths: [],
      },
      arcContext: {
        arcTitle: 'Defense Arc',
        sessionNumber: 2,
        totalSessions: 3,
        carriesForward: 'Introduced closeouts',
        keyCoachingPoint: 'Stay low',
      },
    };
    const prompt = PROMPT_REGISTRY.practicePlan(params).user;
    const insightsIdx = prompt.indexOf('REAL TEAM PERFORMANCE DATA');
    const arcIdx = prompt.indexOf('ARC CONTINUITY');
    expect(insightsIdx).toBeGreaterThan(-1);
    expect(arcIdx).toBeGreaterThan(insightsIdx);
  });
});
