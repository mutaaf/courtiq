/**
 * Ticket 0045 — unfinished-drills rollover threading in /api/ai/plan.
 *
 * The route now fetches the SAME coach + SAME team's most recent prior
 * `type='practice'` plan, runs `diffPracticeForRollover` against its
 * `completed_drill_ids` stamp, and threads the resulting `rolloverDrills` into
 * the practicePlan prompt alongside the existing program-focus + signature
 * soft hints. With no rollovers (cold start or full-completion), the prompt is
 * byte-identical to today's shape (no carry-forward block).
 *
 * Acceptance criteria → tests:
 *   AC4: a prior plan with 4 of 6 drills completed → 2 rollovers threaded into
 *        the prompt; cold-start coach → prompt rendered string contains NO
 *        carry-forward block (byte-identical to today's behavior).
 *   AC4 (scope): the prior-plan fetch is scoped to BOTH coach_id AND team_id —
 *        a different coach's plan never bleeds into this one.
 *   AC7 (voice): the rendered prompt string carries none of the AGENTS.md
 *        banned words in the threaded carry-forward block.
 *   AC8 (privacy): the rollover-block in the prompt names DRILLS, not players.
 *
 * Strategy mirrors tests/ai/plan-coaching-signature.test.ts: a chainable
 * in-memory Supabase mock, hoisted mocks for buildAIContext / readProgramFocus
 * / callAIWithJSON, REAL `diffPracticeForRollover` so the wiring is exercised.
 * `.test.ts` NOT `.spec.ts` — LESSONS#38. Route reads a JSON body so invoked
 * with its real Request signature (LESSONS 2026-05-21). `mockFromFn.mockReset`
 * in beforeEach to drain queued mockReturnValueOnce chains (LESSONS#0039).
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
import { drillNameToSlug } from '@/lib/practice-rollover-utils';

// ─── Chainable mock helper ─────────────────────────────────────────────────────
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
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-1';
const COACH_ID = 'coach-1';
const TEAM_ID = 'team-now';

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
  warmup: { name: 'Dynamic Warmup', duration_minutes: 5, description: 'Light jog.' },
  drills: [
    { name: 'Closeout Drill', skill_id: 'defense', duration_minutes: 15, description: 'Closeouts.' },
  ],
  scrimmage: { duration_minutes: 15, focus: 'Apply spacing' },
  cooldown: { duration_minutes: 5, notes: 'Stretch.' },
};

const SAVED_PLAN = { id: 'plan-new' };

const PRIOR_PLAN_DRILLS = [
  { name: 'Warmup Layups', duration_minutes: 5, description: 'Warmup.' },
  { name: 'Ball Handling Stations', duration_minutes: 10, description: 'Stations.' },
  { name: 'Pick and Roll', duration_minutes: 12, description: 'PnR.' },
  { name: 'Corner Shooting', duration_minutes: 10, description: 'Corner.' },
  { name: '3-on-3 to Shot', duration_minutes: 12, description: '3v3.' },
  { name: 'Scrimmage', duration_minutes: 10, description: 'Scrimmage.' },
];

// Coach ran 4 of 6: corner-shooting + 3-on-3-to-shot are SKIPPED.
const PRIOR_PLAN_COMPLETED = [
  drillNameToSlug('Warmup Layups'),
  drillNameToSlug('Ball Handling Stations'),
  drillNameToSlug('Pick and Roll'),
  drillNameToSlug('Scrimmage'),
];

function priorPlanRow(extra: Record<string, unknown> = {}) {
  return {
    id: 'prior-plan-id',
    coach_id: COACH_ID,
    team_id: TEAM_ID,
    type: 'practice',
    content_structured: { drills: PRIOR_PLAN_DRILLS },
    completed_drill_ids: PRIOR_PLAN_COMPLETED,
    created_at: '2026-05-19T00:00:00Z',
    ...extra,
  };
}

function setAuthUser(id = COACH_ID) {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function planRequest(extra: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/ai/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId: TEAM_ID, type: 'practice', ...extra }),
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/ai/plan — unfinished-drills rollover (ticket 0045)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // LESSONS#0039: vi.clearAllMocks does NOT drain a mock's
    // mockReturnValueOnce queue; reset it so per-test chains don't bleed.
    mockFromFn.mockReset();
    mockBuildAIContext.mockResolvedValue(CONTEXT);
    mockReadProgramFocus.mockResolvedValue(null);
    mockCallAIWithJSON.mockResolvedValue({ parsed: AI_PLAN_RESULT, interactionId: 'interaction-1' });
  });

  // AC4: partial-completion prior plan → 2 rollover drills threaded into the prompt.
  it('threads the rolled-over drills (the ones the coach did not get to) into the practicePlan prompt', async () => {
    setAuthUser();
    const priorPlanChain = buildChain([priorPlanRow()]);
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))   // coaches (org_id)
      .mockReturnValueOnce(buildChain([]))                   // observations (insights)
      .mockReturnValueOnce(buildChain([]))                   // coach plans for signature
      .mockReturnValueOnce(buildChain([]))                   // coach_drill_signals (0039)
      .mockReturnValueOnce(priorPlanChain)                   // prior practice plan (rollover)
      .mockReturnValueOnce(buildChain(SAVED_PLAN));          // plans insert

    const res = await PLAN_POST(planRequest());
    expect(res.status).toBe(200);

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    // Both un-run drills surface in the prompt by name.
    expect(promptArg.userPrompt).toContain('Corner Shooting');
    expect(promptArg.userPrompt).toContain('3-on-3 to Shot');
    // Completed drills must NOT be re-suggested as rollovers.
    expect(promptArg.userPrompt.toLowerCase()).not.toMatch(/carry[^\n]*pick and roll/);
  });

  // AC4 (scope): the prior-plan fetch is scoped to BOTH coach_id AND team_id.
  it('scopes the prior-plan fetch to the requesting coach AND the requested team', async () => {
    setAuthUser();
    const priorPlanChain = buildChain([priorPlanRow()]);
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(priorPlanChain)
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    await PLAN_POST(planRequest());

    // The eq() filter must include BOTH coach_id and team_id — a cross-coach
    // or cross-team prior plan must never appear in the diff.
    const eqs = priorPlanChain.eqCalls as Array<[string, unknown]>;
    expect(eqs).toContainEqual(['coach_id', COACH_ID]);
    expect(eqs).toContainEqual(['team_id', TEAM_ID]);
  });

  // AC4 (cold start): no prior plan → no carry-forward block in the prompt.
  it('omits the carry-forward block for a coach with no prior practice plan', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))      // prior plan: NONE
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    const res = await PLAN_POST(planRequest());
    expect(res.status).toBe(200);

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    // No carry-forward block — phrase used positively in the prompt is absent.
    expect(promptArg.userPrompt.toLowerCase()).not.toContain('carry');
  });

  // AC4 (full completion): every drill completed → no carry-forward block.
  it('omits the carry-forward block when the prior plan was fully completed', async () => {
    setAuthUser();
    const fullyCompleted = priorPlanRow({
      completed_drill_ids: PRIOR_PLAN_DRILLS.map((d) => drillNameToSlug(d.name)),
    });
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([fullyCompleted]))
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    await PLAN_POST(planRequest());

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    expect(promptArg.userPrompt.toLowerCase()).not.toContain('carry');
  });

  // AC7 (voice): no AGENTS.md banned words in the threaded prompt string.
  it('the rendered prompt string contains no AGENTS.md banned words', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([priorPlanRow()]))
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    await PLAN_POST(planRequest());

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { systemPrompt: string; userPrompt: string };
    const blob = `${promptArg.systemPrompt}\n${promptArg.userPrompt}`.toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(blob).not.toContain(banned);
    }
  });

  // AC8 (privacy): the rollover block names DRILLS, never players.
  it('the rollover block names drills but never any player name from a poisoned prior plan', async () => {
    setAuthUser();
    // A pathological prior plan content_structured carrying a player_name field;
    // the helper reads only drill name/duration, so the player name never reaches
    // the prompt.
    const poisoned = priorPlanRow({
      content_structured: {
        drills: PRIOR_PLAN_DRILLS,
        // Should NEVER appear in the prompt:
        player_name: 'Maya Johnson',
        observations: [{ text: 'Maya struggled', player_name: 'Maya Johnson' }],
      },
    });
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([poisoned]))
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    await PLAN_POST(planRequest());

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    expect(promptArg.userPrompt).not.toContain('Maya Johnson');
    expect(promptArg.userPrompt).toContain('Corner Shooting');
  });

  // Degradation: a throwing prior-plan fetch must not 500 the plan.
  it('returns a 200 plan even when the prior-plan fetch throws', async () => {
    setAuthUser();
    const throwing = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error('prior-plan read failed')),
      then: (_f: unknown, onRejected: (e: unknown) => unknown) =>
        Promise.reject(new Error('prior-plan read failed')).then(undefined, onRejected),
    };
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(throwing)
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    const res = await PLAN_POST(planRequest());
    expect(res.status).toBe(200);
  });
});
