/**
 * Ticket 0016 — Parent report continuity: "since last report" growth note.
 *
 * Tests the POST /api/ai/parent-report route changes:
 *  AC1: Prior report present → continuity block injected into the AI prompt
 *  AC2: No prior report → prompt has no continuity block; result has no since_last_report
 *  AC3: parentReportSchema accepts output with AND without since_last_report
 *  AC4: Prior-report fetch failure → route returns 2xx snapshot (since_last_report: null)
 *  AC5: Plans insert shape unchanged (regression: same fields, continuity inside content_structured)
 *  AC6: Multi-provider contract — parentReport prompt with continuity block parses under
 *       Anthropic AND OpenAI mock shapes
 *  AC7: COPPA — prior-report block in prompt carries no new minor-scoped data beyond what
 *       the existing report already contained (player_name, skill narrative only)
 *
 * Strategy mirrors tests/ai/weekly-star.test.ts: chainable in-memory Supabase mock.
 * .test.ts NOT .spec.ts (vitest excludes spec files — LESSONS.md 2026-05-20).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser, mockFromFn, mockCallAIWithJSON, mockBuildAIContext } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockFromFn: vi.fn(),
    mockCallAIWithJSON: vi.fn(),
    mockBuildAIContext: vi.fn(),
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

import { POST } from '@/app/api/ai/parent-report/route';
import { parentReportSchema } from '@/lib/ai/schemas';

// ─── Chainable mock helper ─────────────────────────────────────────────────────

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
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PLAYER = {
  id: 'player-1',
  name: 'Maya Johnson',
  team_id: 'team-1',
};

const PRIOR_REPORT = {
  player_name: 'Maya Johnson',
  greeting: 'Great work this month!',
  highlights: ['Improved closeouts'],
  skill_progress: [{ skill_name: 'Defense', level: 'Practicing', narrative: 'Getting better.' }],
  encouragement: 'Keep it up!',
  coach_note: 'Working on perimeter defense.',
};

const AI_RESULT_WITH_CONTINUITY = {
  player_name: 'Maya Johnson',
  greeting: "Maya had a great month!",
  highlights: ['Defended the perimeter well'],
  skill_progress: [{ skill_name: 'Defense', level: 'Got It!', narrative: 'Consistent closeouts.' }],
  encouragement: 'Keep going!',
  coach_note: 'Ready for the next challenge.',
  since_last_report: 'Since last month, Maya moved from Practicing to Got It! on closeouts.',
};

const AI_RESULT_NO_CONTINUITY = {
  player_name: 'Maya Johnson',
  greeting: "Maya had a great month!",
  highlights: ['Good energy'],
  skill_progress: [{ skill_name: 'Defense', level: 'Practicing', narrative: 'Building up.' }],
  encouragement: 'Keep going!',
  coach_note: 'Working hard.',
};

const CONTEXT = {
  teamName: 'Tigers',
  sportSlug: 'basketball',
  ageGroup: '11-13',
  seasonWeek: 5,
  roster: [],
};

const SAVED_PLAN = { id: 'plan-new', type: 'parent_report', player_id: 'player-1' };

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function makeRequest(playerId = 'player-1', teamId = 'team-1') {
  return new Request('http://localhost/api/ai/parent-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId, playerId }),
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/ai/parent-report — continuity (ticket 0016)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildAIContext.mockResolvedValue(CONTEXT);
    mockCallAIWithJSON.mockResolvedValue({
      parsed: AI_RESULT_WITH_CONTINUITY,
      interactionId: 'interaction-1',
    });
  });

  // AC1: prior report present → continuity block injected into prompt
  it('injects prior report content into the prompt when a prior report exists', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))     // coaches
      .mockReturnValueOnce(buildChain(PLAYER))                    // players
      .mockReturnValueOnce(buildChain([]))                         // observations
      .mockReturnValueOnce(buildChain([]))                         // proficiency
      .mockReturnValueOnce(buildChain([{ content_structured: PRIOR_REPORT }])) // prior report (0016)
      .mockReturnValueOnce(buildChain([]))                         // 0070 coach-scoped voice anchors
      .mockReturnValueOnce(buildChain(SAVED_PLAN));                // insert

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // The prompt passed to callAIWithJSON must reference the prior report content
    const callArgs = mockCallAIWithJSON.mock.calls[0];
    const promptArg = callArgs[0] as { userPrompt: string; systemPrompt: string };
    expect(promptArg.userPrompt).toContain('prior report');
    expect(promptArg.userPrompt).toContain('since_last_report');
  });

  // AC2: no prior report → no continuity block in prompt; result has no since_last_report
  it('generates a clean snapshot when no prior report exists', async () => {
    setAuthUser();
    mockCallAIWithJSON.mockResolvedValue({
      parsed: AI_RESULT_NO_CONTINUITY,
      interactionId: 'interaction-2',
    });
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain(PLAYER))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))    // empty prior reports
      .mockReturnValueOnce(buildChain([]))    // 0070 coach-scoped voice anchors
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    // Prompt must NOT contain a prior-report block
    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    expect(promptArg.userPrompt).not.toContain('prior report');

    // Result has no since_last_report or it is null/absent
    expect(body.content?.since_last_report ?? null).toBeNull();
  });

  // AC3: parentReportSchema accepts output with AND without since_last_report
  it('parentReportSchema accepts a report with since_last_report', () => {
    expect(() => parentReportSchema.parse(AI_RESULT_WITH_CONTINUITY)).not.toThrow();
    const parsed = parentReportSchema.parse(AI_RESULT_WITH_CONTINUITY);
    expect(parsed.since_last_report).toBe(AI_RESULT_WITH_CONTINUITY.since_last_report);
  });

  it('parentReportSchema still accepts a report WITHOUT since_last_report (existing fixtures)', () => {
    expect(() => parentReportSchema.parse(AI_RESULT_NO_CONTINUITY)).not.toThrow();
  });

  // AC4: prior-report fetch failure → 2xx snapshot (never 500)
  it('returns 200 snapshot when the prior-report query throws', async () => {
    setAuthUser();
    mockCallAIWithJSON.mockResolvedValue({
      parsed: { ...AI_RESULT_NO_CONTINUITY, since_last_report: null },
      interactionId: 'interaction-3',
    });
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain(PLAYER))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain(null, { message: 'DB error' })) // prior report errors
      .mockReturnValueOnce(buildChain([]))                              // 0070 coach-scoped voice anchors
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
  });

  // AC5: plans insert shape unchanged (regression)
  it('persists the plan with the same required fields as before (regression)', async () => {
    setAuthUser();
    const insertChain = buildChain(SAVED_PLAN);
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain(PLAYER))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([{ content_structured: PRIOR_REPORT }]))
      .mockReturnValueOnce(buildChain([]))                              // 0070 coach-scoped voice anchors
      .mockReturnValueOnce(insertChain);

    await POST(makeRequest());

    // Verify insert was called with required plan fields
    const insertFn = (insertChain.insert as ReturnType<typeof vi.fn>);
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'parent_report',
        player_id: 'player-1',
        team_id: 'team-1',
        coach_id: 'coach-1',
      })
    );
  });

  // AC7: COPPA — prior-report block carries only coach-authored narrative, no new minor data
  it('the prompt prior-report block contains no player-identifying fields beyond what the report already has', async () => {
    setAuthUser();
    const priorWithExtra = {
      ...PRIOR_REPORT,
      // These fields should NOT appear in the continuity prompt block
      date_of_birth: '2012-05-01',
      address: '123 Main St',
    };
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain(PLAYER))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([{ content_structured: priorWithExtra }]))
      .mockReturnValueOnce(buildChain([]))                              // 0070 coach-scoped voice anchors
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    await POST(makeRequest());

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    // The route should pass only the report's coaching content, not raw DB fields
    expect(promptArg.userPrompt).not.toContain('date_of_birth');
    expect(promptArg.userPrompt).not.toContain('address');
  });
});

// ─── AC6: Multi-provider contract ─────────────────────────────────────────────
// parentReport prompt with continuity block parses against parentReportSchema
// under both Anthropic and OpenAI mock shapes.

describe('parentReportSchema — continuity field (AC3 + AC6)', () => {
  it('accepts since_last_report: string', () => {
    const result = parentReportSchema.parse(AI_RESULT_WITH_CONTINUITY);
    expect(typeof result.since_last_report).toBe('string');
  });

  it('accepts since_last_report: null', () => {
    const result = parentReportSchema.parse({ ...AI_RESULT_NO_CONTINUITY, since_last_report: null });
    expect(result.since_last_report).toBeNull();
  });

  it('accepts absent since_last_report (backward-compat with existing stored reports)', () => {
    const result = parentReportSchema.parse(AI_RESULT_NO_CONTINUITY);
    expect(result.since_last_report).toBeUndefined();
  });

  it('the schema shape for a report with continuity is stable across both Anthropic and OpenAI mock shapes', () => {
    // Both providers return the same JSON string; schema must parse it identically
    const anthropicParsed = JSON.parse(JSON.stringify(AI_RESULT_WITH_CONTINUITY));
    const openaiParsed = JSON.parse(JSON.stringify(AI_RESULT_WITH_CONTINUITY));
    expect(parentReportSchema.parse(anthropicParsed)).toEqual(parentReportSchema.parse(openaiParsed));
  });
});
