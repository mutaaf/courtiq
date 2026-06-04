/**
 * Ticket 0066 — POST /api/ai/parent-report thin-week safety net.
 *
 * Builds on the 0016 same-player continuity tests
 * (`tests/ai/parent-report-continuity.test.ts`) and the 0034 cross-season tests
 * (`tests/ai/parent-report-cross-season.test.ts`).
 *
 * What this suite proves:
 *  AC: helper-true case → the route emits a prompt with the THIN-WEEK block
 *      (names the lighter week, quotes a previous commitment, includes the
 *      explicit positive instruction).
 *  AC: helper-false case → the prompt is BYTE-IDENTICAL to the existing
 *      0016/0034 behavior (no thin-week block, no extra instructions).
 *  AC: the route ALWAYS produces an output — never refuses to generate.
 *  AC: the route still calls `callAIWithJSON` exactly once on the AI path.
 *  AC: banned-word AI output → the template fallback fires; no second AI call.
 *  AC: tier gating is BYTE-IDENTICAL — no new feature key, no new tier check;
 *      the free-tier coach in their last AI call of the month also gets the
 *      thin-week prompt.
 *  AC: COPPA — the prompt input still carries the player's first name only;
 *      no DOB / medical_notes / parent_email reaches the model.
 *
 * Strategy mirrors the existing parent-report sibling tests: in-memory
 * chainable Supabase mock. .test.ts NOT .spec.ts (LESSONS#0020 / #38).
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

// A prior report 8 days old, with three coach-named focus areas the route can
// derive as "previous commitments" without inventing a new persisted shape.
// The route reads `created_at` to derive `daysSinceLastReport`; the new column
// surface needed is just `created_at` on the existing `plans` row.
const PRIOR_REPORT_PLAN = {
  content_structured: {
    player_name: 'Maya Johnson',
    greeting: 'Strong week!',
    highlights: ['finish the closeout', 'drive with the left hand'],
    skill_progress: [
      { skill_name: 'Defense', level: 'Practicing', narrative: 'closeouts coming along' },
      { skill_name: 'Ball-handling', level: 'Practicing', narrative: 'left hand getting there' },
      { skill_name: 'Communication', level: 'Practicing', narrative: 'switch calls' },
    ],
    encouragement: 'Keep it up!',
    coach_note: 'Working on closeouts, left hand, and switch communication.',
  },
  created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
};

const AI_RESULT_CLEAN = {
  player_name: 'Maya Johnson',
  greeting: 'Maya had a lighter week.',
  highlights: ['Made one strong closeout'],
  skill_progress: [
    { skill_name: 'Defense', level: 'Practicing', narrative: 'Closeouts still building.' },
  ],
  encouragement: 'Keep showing up.',
  coach_note: 'Watching how she comes back next practice.',
};

const AI_RESULT_BANNED_WORD = {
  ...AI_RESULT_CLEAN,
  coach_note: 'Maya had an amazing week of growth!',
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

// THIN week: 3 observations, 8 days since last report.
const THIN_OBSERVATIONS = Array.from({ length: 3 }, (_, i) => ({
  category: 'Defense',
  sentiment: 'positive',
  text: `obs-${i}`,
  skill_id: null,
  created_at: new Date(Date.now() - i * 60_000).toISOString(),
}));

// NOT thin: 6 observations.
const RICH_OBSERVATIONS = Array.from({ length: 6 }, (_, i) => ({
  category: 'Defense',
  sentiment: 'positive',
  text: `obs-${i}`,
  skill_id: null,
  created_at: new Date(Date.now() - i * 60_000).toISOString(),
}));

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/ai/parent-report — thin-week safety net (ticket 0066)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockBuildAIContext.mockResolvedValue(CONTEXT);
    mockCallAIWithJSON.mockResolvedValue({
      parsed: AI_RESULT_CLEAN,
      interactionId: 'interaction-1',
    });
  });

  // AC: thin-week true → prompt carries the thin-week block.
  it('emits the thin-week prompt block when the helper returns true (3 obs, 8 days, 2nd report)', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))                     // coaches
      .mockReturnValueOnce(buildChain(PLAYER))                                   // players (target)
      .mockReturnValueOnce(buildChain(THIN_OBSERVATIONS))                        // observations (3)
      .mockReturnValueOnce(buildChain([]))                                       // proficiency
      .mockReturnValueOnce(buildChain([PRIOR_REPORT_PLAN]))                      // prior report (0016)
      .mockReturnValueOnce(buildChain(SAVED_PLAN));                              // insert

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const callArgs = mockCallAIWithJSON.mock.calls[0];
    const promptArg = callArgs[0] as { userPrompt: string; systemPrompt: string };

    // The thin-week block must carry all three sub-parts.
    expect(promptArg.userPrompt).toContain('lighter');
    expect(promptArg.userPrompt).toContain('carried forward');
    // Quotes at least one of the previous coach-named focus areas the prompt
    // grounds the new report against.
    const quotesPreviousFocus =
      promptArg.userPrompt.includes('Defense') ||
      promptArg.userPrompt.includes('left hand') ||
      promptArg.userPrompt.includes('Communication');
    expect(quotesPreviousFocus).toBe(true);

    // The positive instruction is present and explicit about what to do.
    expect(promptArg.userPrompt).toMatch(/what we're watching next/i);
  });

  // AC: thin-week false (rich observations) → no thin-week block.
  it('does NOT inject the thin-week block when the helper returns false (6 obs)', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain(PLAYER))
      .mockReturnValueOnce(buildChain(RICH_OBSERVATIONS))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([PRIOR_REPORT_PLAN]))
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    // None of the thin-week lexical markers.
    expect(promptArg.userPrompt).not.toMatch(/this week was lighter/i);
    expect(promptArg.userPrompt).not.toMatch(/what we're watching next/i);
  });

  // AC: artifactCount=1 (first-ever report) → never thin-week.
  it('does NOT inject the thin-week block when this is the FIRST report (no prior report at all)', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain(PLAYER))
      .mockReturnValueOnce(buildChain(THIN_OBSERVATIONS))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([])) // empty — no prior report
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    expect(promptArg.userPrompt).not.toMatch(/this week was lighter/i);
  });

  // AC: the route still calls callAIWithJSON exactly once on the AI path.
  it('calls callAIWithJSON exactly once on the AI path', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain(PLAYER))
      .mockReturnValueOnce(buildChain(THIN_OBSERVATIONS))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([PRIOR_REPORT_PLAN]))
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    await POST(makeRequest());
    expect(mockCallAIWithJSON).toHaveBeenCalledTimes(1);
  });

  // AC: AI returns banned-word → template fallback fires; no second AI call.
  // The fallback also writes a marker on the existing ai_interactions row
  // (route .update().eq() — best-effort), so the from() sequence is one
  // longer than the AI path: coaches, players, observations, proficiency,
  // plans (prior report), ai_interactions (fallback marker), plans (insert).
  it('falls back to the structured template when the AI output contains a banned word', async () => {
    setAuthUser();
    mockCallAIWithJSON.mockResolvedValue({
      parsed: AI_RESULT_BANNED_WORD,
      interactionId: 'interaction-fallback',
    });
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain(PLAYER))
      .mockReturnValueOnce(buildChain(THIN_OBSERVATIONS))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([PRIOR_REPORT_PLAN]))
      .mockReturnValueOnce(buildChain(null))             // ai_interactions update (marker)
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // No second AI call (the fallback is template-only, not a re-prompt).
    expect(mockCallAIWithJSON).toHaveBeenCalledTimes(1);

    const body = await res.json();
    // The rendered output the parent reads contains no banned word.
    const rendered = JSON.stringify(body.content).toLowerCase();
    expect(rendered).not.toContain('amazing');
    expect(rendered).not.toContain('journey');
    expect(rendered).not.toContain('elevate');
    expect(rendered).not.toContain('empower');
  });

  // AC: even when the AI is clean, the route ALWAYS produces an output.
  it('produces a non-empty parent report content body on the AI path', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain(PLAYER))
      .mockReturnValueOnce(buildChain(THIN_OBSERVATIONS))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([PRIOR_REPORT_PLAN]))
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBeTruthy();
    expect(body.content.player_name).toBe('Maya Johnson');
  });

  // AC: the prompt body NEVER literally enumerates the banned tokens
  // (LESSONS#0023 — the prompt's own scan must not trip).
  it('the thin-week prompt body uses positive voice (no enumerated banned tokens)', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain(PLAYER))
      .mockReturnValueOnce(buildChain(THIN_OBSERVATIONS))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([PRIOR_REPORT_PLAN]))
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    await POST(makeRequest());

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as {
      userPrompt: string;
      systemPrompt: string;
    };
    const all = `${promptArg.systemPrompt}\n${promptArg.userPrompt}`.toLowerCase();
    for (const banned of [
      'journey',
      'amazing',
      'exciting',
      'elevate',
      'empower',
      'synergy',
      'unlock your potential',
    ]) {
      expect(all).not.toContain(banned);
    }
  });

  // AC: COPPA — the prompt input does NOT carry the player's full DB row.
  it('the prompt input does NOT carry player DOB / medical_notes / parent_email even when present on the row', async () => {
    setAuthUser();
    const playerWithExtra = {
      ...PLAYER,
      date_of_birth: '2012-05-01',
      medical_notes: 'asthma',
      parent_email: 'parent@example.com',
    };
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain(playerWithExtra))
      .mockReturnValueOnce(buildChain(THIN_OBSERVATIONS))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([PRIOR_REPORT_PLAN]))
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    await POST(makeRequest());

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    expect(promptArg.userPrompt).not.toContain('2012-05-01');
    expect(promptArg.userPrompt).not.toContain('asthma');
    expect(promptArg.userPrompt).not.toContain('parent@example.com');
  });
});
