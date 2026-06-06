/**
 * Ticket 0069 — game-decompression integration in /api/ai/plan.
 *
 * When an unconsumed decompression is present for the (coach, team), the
 * generator inserts the recommended drill at INDEX 0 of the new plan
 * AND writes the `why` line into content_structured.first_drill_why.
 * After the plan insert, the decompression row is marked consumed
 * (consumed_at + consumed_plan_id) so the same row never re-fires on
 * a second generation.
 *
 * Acceptance criteria → tests:
 *  - No unconsumed decompression → the plan is BYTE-IDENTICAL to today
 *    (the generator's reconciled `drills` array is what gets saved, with
 *    no first_drill_why field).
 *  - Unconsumed decompression present → the saved plan's drills[0] is
 *    the recommendation AND content_structured.first_drill_why is set.
 *  - The decompression row is marked consumed AFTER the plan insert
 *    (`consumed_at` non-null, `consumed_plan_id = <new plan id>`).
 *
 * `.test.ts` NOT `.spec.ts` (LESSONS#0020/#38). Mirrors the mock
 * pattern of plan-rollover.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const lastInsert: { value?: unknown } = {};
  const lastUpdate: { value?: unknown } = {};
  const chain: Record<string, unknown> = {
    __lastInsert: lastInsert,
    __lastUpdate: lastUpdate,
    select: vi.fn().mockReturnThis(),
    insert: vi.fn((arg?: unknown) => {
      lastInsert.value = arg;
      return chain;
    }),
    update: vi.fn((arg?: unknown) => {
      lastUpdate.value = arg;
      return chain;
    }),
    eq: vi.fn().mockReturnThis(),
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
  categories: ['Offense', 'Defense', 'Effort'],
};

const AI_PLAN_RESULT = {
  title: 'Defense Practice',
  duration_minutes: 60,
  warmup: { name: 'Dynamic Warmup', duration_minutes: 5, description: 'Light jog.' },
  drills: [
    { name: 'Closeout Drill', skill_id: 'defense', duration_minutes: 15, description: 'Closeouts.' },
  ],
  scrimmage: { duration_minutes: 15, focus: 'Apply spacing' },
  cooldown: { duration_minutes: 5, notes: 'Stretch.' },
};

const SAVED_PLAN = { id: 'plan-new' };

const DECOMPRESSION_ROW = {
  id: 'dec-1',
  recommended_drill_name: 'Live-ball rebound 2-on-2',
  recommended_drill_setup: ['Pair up at the elbows.', 'Box out on the shot.'],
  recommended_drill_why: "Saturday's note said rebounding.",
};

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

describe('POST /api/ai/plan — game-decompression integration (ticket 0069)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockBuildAIContext.mockResolvedValue(CONTEXT);
    mockReadProgramFocus.mockResolvedValue(null);
    mockCallAIWithJSON.mockResolvedValue({ parsed: AI_PLAN_RESULT, interactionId: 'i-1' });
  });

  it('with NO unconsumed decompression, the saved plan content has no first_drill_why and drills[0] is the AI plan drill', async () => {
    setAuthUser();
    const plansInsertChain = buildChain(SAVED_PLAN);
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))   // coaches
      .mockReturnValueOnce(buildChain([]))                   // observations
      .mockReturnValueOnce(buildChain([]))                   // coach plans (signature)
      .mockReturnValueOnce(buildChain([]))                   // coach_drill_signals
      .mockReturnValueOnce(buildChain([]))                   // prior plan for rollover
      .mockReturnValueOnce(buildChain([]))                   // game_decompressions: none
      .mockReturnValueOnce(plansInsertChain);                // plans insert

    const res = await PLAN_POST(planRequest());
    expect(res.status).toBe(200);

    const insertArg = plansInsertChain.__lastInsert as { value?: { content_structured?: Record<string, unknown> } };
    const cs = insertArg.value?.content_structured;
    expect(cs).toBeDefined();
    expect(cs?.first_drill_why).toBeUndefined();
    // drills[0] is the AI-reconciled plan's drill, byte-identical to today.
    expect((cs?.drills as Array<{ name: string }>)[0].name).toBe('Closeout Drill');
  });

  it('with an unconsumed decompression, drills[0] is the recommended drill AND first_drill_why is set', async () => {
    setAuthUser();
    const plansInsertChain = buildChain(SAVED_PLAN);
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))   // coaches
      .mockReturnValueOnce(buildChain([]))                   // observations
      .mockReturnValueOnce(buildChain([]))                   // coach plans (signature)
      .mockReturnValueOnce(buildChain([]))                   // coach_drill_signals
      .mockReturnValueOnce(buildChain([]))                   // prior plan for rollover
      .mockReturnValueOnce(buildChain([DECOMPRESSION_ROW]))  // game_decompressions: present
      .mockReturnValueOnce(plansInsertChain)                 // plans insert
      .mockReturnValueOnce(buildChain(null));                // game_decompressions update (consume)

    const res = await PLAN_POST(planRequest());
    expect(res.status).toBe(200);

    const insertArg = plansInsertChain.__lastInsert as { value?: { content_structured?: Record<string, unknown> } };
    const cs = insertArg.value?.content_structured;
    expect(cs?.first_drill_why).toBe("Saturday's note said rebounding.");
    const drills = cs?.drills as Array<{ name: string }>;
    expect(drills[0].name).toBe('Live-ball rebound 2-on-2');
    // The original AI drill is preserved AFTER the recommendation, never lost.
    expect(drills[1].name).toBe('Closeout Drill');
  });

  it('marks the decompression row consumed AFTER the plan insert (consumed_at + consumed_plan_id)', async () => {
    setAuthUser();
    const plansInsertChain = buildChain(SAVED_PLAN);
    const consumeChain = buildChain(null);
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([DECOMPRESSION_ROW]))
      .mockReturnValueOnce(plansInsertChain)
      .mockReturnValueOnce(consumeChain);

    await PLAN_POST(planRequest());

    expect(consumeChain.update).toHaveBeenCalled();
    const updateArg = consumeChain.__lastUpdate as {
      value?: { consumed_at?: string | null; consumed_plan_id?: string | null };
    };
    expect(updateArg.value?.consumed_at).toBeTruthy();
    expect(updateArg.value?.consumed_plan_id).toBe(SAVED_PLAN.id);
  });
});
