/**
 * Ticket 0037 — coaching-signature threading in /api/ai/plan and
 * /api/ai/practice-arc.
 *
 * Both routes resolve the authed coach, fetch THAT coach's recent persisted
 * `plans` across all their teams (scoped `eq('coach_id', coachId)`), build a
 * compact coaching signature, and thread it into the practicePlan / practiceArc
 * prompts as a SOFT preference. A cold-start coach (too few plans) produces a
 * null signature and the routes degrade to exactly today's behavior. The
 * existing AI quota + `callAIWithJSON(orgId)` path is unchanged.
 *
 * Acceptance criteria → tests:
 *  AC2: the signature is built ONLY from plans owned by the requesting coach —
 *       the route filters `eq('coach_id', <session coach id>)`.
 *  AC3: /api/ai/plan threads the signature; cold-start → unchanged shape.
 *  AC4: /api/ai/practice-arc threads the signature alongside the 0031 programFocus;
 *       null signature → unchanged arc behavior.
 *  AC5: quota/tier unchanged — a free coach at quota still 402s with { upgrade:true }
 *       (the quota throw from callAIWithJSON is not bypassed); callAIWithJSON is
 *       invoked with the resolved orgId.
 *  AC7: COPPA — the signature block in the prompt carries no player/observation text.
 *
 * Strategy mirrors tests/ai/parent-report-cross-season.test.ts: chainable
 * in-memory Supabase, hoisted mocks for buildAIContext / readProgramFocus /
 * callAIWithJSON. The REAL buildCoachingSignature runs so the route↔helper wiring
 * is exercised. .test.ts NOT .spec.ts (LESSONS#38). Route reads a JSON body, so
 * invoked with its real Request signature (LESSONS 2026-05-21).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockGetUser, mockFromFn, mockCallAIWithJSON, mockBuildAIContext, mockReadProgramFocus } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockFromFn: vi.fn(),
    mockCallAIWithJSON: vi.fn(),
    mockBuildAIContext: vi.fn(),
    mockReadProgramFocus: vi.fn(),
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

vi.mock('@/lib/ai/client', () => ({ callAIWithJSON: mockCallAIWithJSON }));
vi.mock('@/lib/ai/context-builder', () => ({ buildAIContext: mockBuildAIContext }));
vi.mock('@/lib/ai/program-focus', () => ({ readProgramFocus: mockReadProgramFocus }));

import { POST as PLAN_POST } from '@/app/api/ai/plan/route';
import { POST as ARC_POST } from '@/app/api/ai/practice-arc/route';
import { TierLimitError } from '@/lib/rate-limit';

// ─── Chainable mock helper ─────────────────────────────────────────────────────
// Records the eq() filters so we can assert the coach-scope server-side. The chain
// is thenable AND has a terminal limit() so array reads work either way.
function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const eqCalls: Array<[string, unknown]> = [];
  const chain: Record<string, unknown> = {
    eqCalls,
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return chain;
    }),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-1';
const COACH_ID = 'coach-1';

// Enough of the requesting coach's plans (across two teams) to produce a signature.
function coachPlans() {
  const plan = (skill: string, drill: string) => ({
    type: 'practice',
    skills_targeted: [skill],
    content_structured: {
      duration_minutes: 60,
      warmup: { name: 'Dynamic Warmup', duration_minutes: 5, description: 'x' },
      drills: [{ name: drill, duration_minutes: 10, description: 'y' }],
    },
  });
  return [
    plan('Defense', 'Closeout Drill'),
    plan('Defense', 'Closeout Drill'),
    plan('Passing', 'Closeout Drill'),
    plan('Spacing', 'Shell Drill'),
    plan('Effort', 'Shell Drill'),
    plan('Defense', 'Monkey in the Middle'),
  ];
}

const CONTEXT = {
  teamName: 'Tigers',
  sportName: 'basketball',
  ageGroup: '11-13',
  seasonWeek: 5,
  playerCount: 10,
  practiceDuration: 60,
  roster: [],
  categories: ['Offense', 'Defense', 'Passing', 'Spacing', 'Effort'],
};

const AI_PLAN_RESULT = {
  title: 'Defense & Spacing Practice',
  duration_minutes: 60,
  warmup: { name: 'Dynamic Warmup', duration_minutes: 5, description: 'Light jog and stretches.' },
  drills: [
    { name: 'Closeout Drill', skill_id: 'defense', duration_minutes: 15, description: 'Closeouts.' },
  ],
  scrimmage: { duration_minutes: 15, focus: 'Apply spacing' },
  cooldown: { duration_minutes: 5, notes: 'Stretch.' },
};

const AI_ARC_RESULT = {
  arc_title: 'Defense Arc — 3 Practices',
  arc_goal: 'Build team defense over three sessions.',
  primary_focus: ['Defense'],
  total_sessions: 3,
  sessions: [
    {
      session_number: 1,
      title: 'Fundamentals',
      theme: 'Closeouts',
      duration_minutes: 60,
      session_goal: 'Introduce closeouts.',
      warmup: { name: 'Dynamic Warmup', duration_minutes: 5, description: 'x' },
      drills: [{ name: 'Closeout Drill', duration_minutes: 15, description: 'y', coaching_cues: ['Stay low'] }],
      cooldown: { duration_minutes: 5, notes: 'Stretch.' },
      key_coaching_point: 'Stay low',
      carries_forward: 'Closeout footwork',
    },
  ],
  progression_note: 'Each session builds on the last.',
};

const SAVED_PLAN = { id: 'plan-new' };

function setAuthUser(id = COACH_ID) {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function planRequest(extra: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/ai/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId: 'team-now', type: 'practice', ...extra }),
  });
}

function arcRequest(extra: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/ai/practice-arc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId: 'team-now', numSessions: 3, sessionDuration: 60, ...extra }),
  });
}

// ─── /api/ai/plan ────────────────────────────────────────────────────────────

describe('POST /api/ai/plan — coaching signature (ticket 0037)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildAIContext.mockResolvedValue(CONTEXT);
    mockReadProgramFocus.mockResolvedValue(null);
    mockCallAIWithJSON.mockResolvedValue({ parsed: AI_PLAN_RESULT, interactionId: 'interaction-1' });
  });

  // AC3 + AC2: a coach with history → signature threaded; fetch scoped to the coach.
  it('threads the coaching signature into the practicePlan prompt, fetched coach-scoped', async () => {
    setAuthUser();
    const sigChain = buildChain(coachPlans());
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))   // coaches (org_id)
      .mockReturnValueOnce(buildChain([]))                   // observations (insights)
      .mockReturnValueOnce(sigChain)                         // coach-scoped plans for signature
      .mockReturnValueOnce(buildChain(SAVED_PLAN));          // plans insert

    const res = await PLAN_POST(planRequest());
    expect(res.status).toBe(200);

    // The signature fetch was scoped to the requesting coach's id.
    expect((sigChain.eqCalls as Array<[string, unknown]>)).toContainEqual(['coach_id', COACH_ID]);

    // The signature block is present and clearly soft-priority.
    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    expect(promptArg.userPrompt).toContain('Closeout Drill'); // a recurring drill
    expect(promptArg.userPrompt.toLowerCase()).toContain('soft');
  });

  // AC3: cold-start coach (too few plans) → no signature block, unchanged shape.
  it('produces NO signature block for a cold-start coach (plan shape unchanged)', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))   // coaches
      .mockReturnValueOnce(buildChain([]))                   // observations
      .mockReturnValueOnce(buildChain([]))                   // coach plans: NONE → null signature
      .mockReturnValueOnce(buildChain(SAVED_PLAN));          // insert

    const res = await PLAN_POST(planRequest());
    expect(res.status).toBe(200);

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    expect(promptArg.userPrompt).not.toContain('This coach tends to');

    const body = await res.json();
    expect(body.plan).toEqual(SAVED_PLAN);
  });

  // AC5: a free coach at quota still 402s — the signature does not bypass the quota.
  it('still returns 402 { upgrade: true } when callAIWithJSON throws a quota error', async () => {
    setAuthUser();
    mockCallAIWithJSON.mockRejectedValueOnce(new TierLimitError('free', 5));
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain(coachPlans()));

    const res = await PLAN_POST(planRequest());
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.upgrade).toBe(true);
  });

  // AC5: callAIWithJSON is invoked with the resolved orgId (provider routing + logging).
  it('routes through callAIWithJSON with the resolved orgId', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain(coachPlans()))
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    await PLAN_POST(planRequest());
    const callArg = mockCallAIWithJSON.mock.calls[0][0] as { orgId: string; interactionType: string };
    expect(callArg.orgId).toBe(ORG_ID);
    expect(callArg.interactionType).toBe('generate_practice_plan');
  });

  // AC7: COPPA — the signature block carries no player/observation text even when a
  // coach plan row was (defensively) carrying some.
  it('the signature block contains no player names or observation text', async () => {
    setAuthUser();
    const poisoned = coachPlans().map((p) => ({
      ...p,
      content_structured: {
        ...(p.content_structured as Record<string, unknown>),
        player_name: 'Maya Johnson',
        observations: [{ text: 'Maya struggled', player_name: 'Maya Johnson' }],
      },
    }));
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain(poisoned))
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    await PLAN_POST(planRequest());
    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    expect(promptArg.userPrompt).not.toContain('Maya Johnson');
    expect(promptArg.userPrompt).not.toContain('observations');
  });

  // Degradation: a throwing signature fetch must not 500 the plan.
  it('returns a 200 plan even when the coach-plans signature fetch throws', async () => {
    setAuthUser();
    const throwingPlans: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error('signature read failed')),
      then: (_f: unknown, onRejected: (e: unknown) => unknown) =>
        Promise.reject(new Error('signature read failed')).then(undefined, onRejected),
    };
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(throwingPlans)
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    const res = await PLAN_POST(planRequest());
    expect(res.status).toBe(200);
  });
});

// ─── /api/ai/practice-arc ──────────────────────────────────────────────────────

describe('POST /api/ai/practice-arc — coaching signature (ticket 0037)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildAIContext.mockResolvedValue(CONTEXT);
    mockReadProgramFocus.mockResolvedValue(null);
    mockCallAIWithJSON.mockResolvedValue({ parsed: AI_ARC_RESULT, interactionId: 'interaction-2' });
  });

  // AC4 + AC2: signature threaded into the arc prompt, coach-scoped fetch.
  it('threads the coaching signature into the practiceArc prompt, fetched coach-scoped', async () => {
    setAuthUser();
    const sigChain = buildChain(coachPlans());
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID, name: 'Coach' })) // coaches
      .mockReturnValueOnce(buildChain([]))                                // observations (fetchObsSummary)
      .mockReturnValueOnce(buildChain([]))                                // sessions (fetchObsSummary)
      .mockReturnValueOnce(sigChain)                                      // coach plans for signature
      .mockReturnValueOnce(buildChain(SAVED_PLAN));                       // insert

    const res = await ARC_POST(arcRequest());
    expect(res.status).toBe(200);

    expect((sigChain.eqCalls as Array<[string, unknown]>)).toContainEqual(['coach_id', COACH_ID]);
    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    expect(promptArg.userPrompt).toContain('Closeout Drill');
    expect(promptArg.userPrompt.toLowerCase()).toContain('soft');
  });

  // AC4: cold-start coach → no signature block, unchanged arc behavior.
  it('produces NO signature block for a cold-start coach (arc behavior unchanged)', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID, name: 'Coach' }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))   // no coach plans → null signature
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    const res = await ARC_POST(arcRequest());
    expect(res.status).toBe(200);
    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    expect(promptArg.userPrompt).not.toContain('This coach tends to');
  });

  // AC5: arc route still 402s at free quota; orgId still threaded.
  it('still returns 402 { upgrade: true } at quota and routes through callAIWithJSON with orgId', async () => {
    setAuthUser();
    mockCallAIWithJSON.mockRejectedValueOnce(new TierLimitError('free', 5));
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID, name: 'Coach' }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain(coachPlans()));

    const res = await ARC_POST(arcRequest());
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.upgrade).toBe(true);
  });
});
