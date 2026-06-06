/**
 * Ticket 0034 — Cross-season player development memory in the parent report.
 *
 * Builds on the 0016 same-player continuity (tests/ai/parent-report-continuity.test.ts).
 * When the target player has a coach-confirmed `prior_player_id`, the route also
 * threads the PRIOR player's most-recent parent_report as cross-season context,
 * producing an optional `since_last_season` note. The prior player must belong to
 * the SAME org (verified via its team's org_id) or the link is ignored.
 *
 * Acceptance criteria → tests:
 *  AC2: linked prior player + seeded prior-season report → cross-season block in prompt
 *  AC2: prior_player_id null → byte-identical 0016 behavior (no cross-season block)
 *  AC3: cross-org prior_player_id → ignored, no cross-org read, no cross-season block
 *  AC4: parentReportSchema accepts since_last_season present AND absent (existing fixtures)
 *  AC5: cross-season prior-fetch throws → 2xx single-season, since_last_season: null (never 500)
 *  AC5b: persisted plans insert shape unchanged (regression)
 *  AC8: existing tier enforcement unchanged — free org over quota is still blocked
 *       server-side via the callAIWithJSON quota path; no NEW feature_* key added
 *  AC9: COPPA — the cross-season prompt block carries only the prior report's
 *       coach-authored narrative (no raw DB minor fields)
 *
 * Strategy mirrors tests/ai/parent-report-continuity.test.ts: chainable in-memory
 * Supabase mock. .test.ts NOT .spec.ts (vitest excludes the spec glob — LESSONS.md
 * 2026-05-20). The route reads a JSON body — invoked with its real Request
 * signature (LESSONS.md 2026-05-21).
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

/** A chain whose terminal read THROWS — to exercise the degrade-to-snapshot path. */
function throwingChain() {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockRejectedValue(new Error('cross-season read failed')),
    then: (_onF: unknown, onRejected: (e: unknown) => unknown) =>
      Promise.reject(new Error('cross-season read failed')).then(undefined, onRejected),
  };
  return chain;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-1';
const OTHER_ORG_ID = 'org-2';

// Target player on THIS season's team, linked to a prior-season player row.
const LINKED_PLAYER = {
  id: 'player-now',
  name: 'Maya Johnson',
  team_id: 'team-now',
  prior_player_id: 'player-prior',
};

const UNLINKED_PLAYER = {
  id: 'player-now',
  name: 'Maya Johnson',
  team_id: 'team-now',
  prior_player_id: null,
};

// The prior-season player row + its team (same org).
const PRIOR_PLAYER_SAME_ORG = { id: 'player-prior', team_id: 'team-prior' };
const PRIOR_TEAM_SAME_ORG = { id: 'team-prior', org_id: ORG_ID };
const PRIOR_TEAM_OTHER_ORG = { id: 'team-prior', org_id: OTHER_ORG_ID };

const PRIOR_SEASON_REPORT = {
  player_name: 'Maya Johnson',
  greeting: 'Last spring was a strong start.',
  highlights: ['Hesitated on closeouts but kept trying'],
  skill_progress: [{ skill_name: 'Defense', level: 'Practicing', narrative: 'Closeouts were tentative.' }],
  encouragement: 'Keep showing up.',
  coach_note: 'Closeouts are the growth edge for next season.',
};

const AI_RESULT_CROSS_SEASON = {
  player_name: 'Maya Johnson',
  greeting: 'Maya had a great month!',
  highlights: ['Leads closeouts now'],
  skill_progress: [{ skill_name: 'Defense', level: 'Got It!', narrative: 'Closeouts are a strength.' }],
  encouragement: 'Keep going!',
  coach_note: 'Ready for more.',
  since_last_season: "Since last season, Maya's closeouts have gone from hesitant to a strength.",
};

const AI_RESULT_SINGLE_SEASON = {
  player_name: 'Maya Johnson',
  greeting: 'Maya had a great month!',
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

const SAVED_PLAN = { id: 'plan-new', type: 'parent_report', player_id: 'player-now' };

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function makeRequest(playerId = 'player-now', teamId = 'team-now') {
  return new Request('http://localhost/api/ai/parent-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId, playerId }),
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/ai/parent-report — cross-season memory (ticket 0034)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildAIContext.mockResolvedValue(CONTEXT);
    mockCallAIWithJSON.mockResolvedValue({
      parsed: AI_RESULT_CROSS_SEASON,
      interactionId: 'interaction-1',
    });
  });

  // AC2: linked prior player + same-org prior-season report → cross-season block
  it('threads the prior-season report into the prompt when prior_player_id is set (same org)', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))                 // coaches
      .mockReturnValueOnce(buildChain(LINKED_PLAYER))                      // players (target)
      .mockReturnValueOnce(buildChain([]))                                 // observations
      .mockReturnValueOnce(buildChain([]))                                 // proficiency
      .mockReturnValueOnce(buildChain([]))                                 // same-player prior report (0016)
      .mockReturnValueOnce(buildChain(PRIOR_PLAYER_SAME_ORG))             // prior player row
      .mockReturnValueOnce(buildChain(PRIOR_TEAM_SAME_ORG))               // prior player's team (org check)
      .mockReturnValueOnce(buildChain([{ content_structured: PRIOR_SEASON_REPORT }])) // prior-season report
      .mockReturnValueOnce(buildChain([]))                                 // 0070 coach-scoped voice anchors
      .mockReturnValueOnce(buildChain(SAVED_PLAN));                        // insert

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    // Cross-season block present and instructs the since_last_season note.
    expect(promptArg.userPrompt).toContain('last season');
    expect(promptArg.userPrompt).toContain('since_last_season');
    // The prior-season narrative the model leans on is in the prompt.
    expect(promptArg.userPrompt).toContain('Closeouts are the growth edge for next season.');
  });

  // AC2: no prior_player_id → byte-identical 0016 behavior (no cross-season block)
  it('produces NO cross-season block when prior_player_id is null (0016 behavior intact)', async () => {
    setAuthUser();
    mockCallAIWithJSON.mockResolvedValue({
      parsed: AI_RESULT_SINGLE_SEASON,
      interactionId: 'interaction-2',
    });
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain(UNLINKED_PLAYER))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))     // same-player prior report (none)
      .mockReturnValueOnce(buildChain([]))     // 0070 coach-scoped voice anchors
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    expect(promptArg.userPrompt).not.toContain('last season');
    expect(promptArg.userPrompt).not.toContain('since_last_season');

    const body = await res.json();
    expect(body.content?.since_last_season ?? null).toBeNull();
  });

  // AC3: cross-org prior_player_id → ignored; no cross-org report is read or threaded.
  it('ignores a prior_player_id whose team belongs to a DIFFERENT org (no cross-org read)', async () => {
    setAuthUser();
    mockCallAIWithJSON.mockResolvedValue({
      parsed: AI_RESULT_SINGLE_SEASON,
      interactionId: 'interaction-3',
    });
    // After the org mismatch the route reads NOTHING cross-org and proceeds to the
    // 0070 coach-scoped voice-anchor read, then the insert. The from() sequence is
    // therefore exactly: coaches, players, observations, proficiency, plans(0016),
    // players(prior), teams(other org), plans(0070 voice anchors), insert — 9 calls.
    // A 10th read would mean the cross-org prior-report plans read ran, which the
    // org check must prevent.
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain(LINKED_PLAYER))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))                                 // same-player prior report
      .mockReturnValueOnce(buildChain(PRIOR_PLAYER_SAME_ORG))             // prior player row
      .mockReturnValueOnce(buildChain(PRIOR_TEAM_OTHER_ORG))             // prior team — DIFFERENT org
      .mockReturnValueOnce(buildChain([]))                                 // 0070 coach-scoped voice anchors
      .mockReturnValueOnce(buildChain(SAVED_PLAN));                        // insert (no cross-org read)

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    expect(promptArg.userPrompt).not.toContain('last season');
    expect(promptArg.userPrompt).not.toContain('Closeouts are the growth edge for next season.');
    // The cross-org prior-report plans read must never have run: exactly 9 from() calls.
    expect(mockFromFn).toHaveBeenCalledTimes(9);
  });

  // AC5: a throwing cross-season read degrades to single-season — never 500.
  it('returns 200 single-season when the cross-season prior-report read throws', async () => {
    setAuthUser();
    mockCallAIWithJSON.mockResolvedValue({
      parsed: { ...AI_RESULT_SINGLE_SEASON, since_last_season: null },
      interactionId: 'interaction-4',
    });
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain(LINKED_PLAYER))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))                                 // same-player prior report
      .mockReturnValueOnce(buildChain(PRIOR_PLAYER_SAME_ORG))             // prior player row
      .mockReturnValueOnce(buildChain(PRIOR_TEAM_SAME_ORG))               // prior team (same org)
      .mockReturnValueOnce(throwingChain())                               // prior-season report THROWS
      .mockReturnValueOnce(buildChain([]))                                 // 0070 coach-scoped voice anchors
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
  });

  // AC5b: plans insert shape unchanged (regression).
  it('persists the plan with the same required fields as before (regression)', async () => {
    setAuthUser();
    const insertChain = buildChain(SAVED_PLAN);
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain(LINKED_PLAYER))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain(PRIOR_PLAYER_SAME_ORG))
      .mockReturnValueOnce(buildChain(PRIOR_TEAM_SAME_ORG))
      .mockReturnValueOnce(buildChain([{ content_structured: PRIOR_SEASON_REPORT }]))
      .mockReturnValueOnce(buildChain([]))                                 // 0070 coach-scoped voice anchors
      .mockReturnValueOnce(insertChain);

    await POST(makeRequest());

    const insertFn = insertChain.insert as ReturnType<typeof vi.fn>;
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'parent_report',
        player_id: 'player-now',
        team_id: 'team-now',
        coach_id: 'coach-1',
      })
    );
  });

  // AC9: COPPA — the cross-season block carries only the prior report's narrative,
  // never raw DB minor fields.
  it('the cross-season block contains no raw minor DB fields beyond the report narrative', async () => {
    setAuthUser();
    const priorWithExtra = {
      ...PRIOR_SEASON_REPORT,
      date_of_birth: '2012-05-01',
      address: '123 Main St',
      medical_notes: 'asthma',
    };
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain(LINKED_PLAYER))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain(PRIOR_PLAYER_SAME_ORG))
      .mockReturnValueOnce(buildChain(PRIOR_TEAM_SAME_ORG))
      .mockReturnValueOnce(buildChain([{ content_structured: priorWithExtra }]))
      .mockReturnValueOnce(buildChain([]))                                 // 0070 coach-scoped voice anchors
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    await POST(makeRequest());

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as { userPrompt: string };
    expect(promptArg.userPrompt).not.toContain('date_of_birth');
    expect(promptArg.userPrompt).not.toContain('address');
    expect(promptArg.userPrompt).not.toContain('medical_notes');
    expect(promptArg.userPrompt).not.toContain('asthma');
  });

  // AC8: the cross-season feature does not change the route's interactionType /
  // orgId wiring — quota + provider routing + failover (0012) apply unchanged.
  it('routes through callAIWithJSON with the unchanged interactionType and orgId', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain(LINKED_PLAYER))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain(PRIOR_PLAYER_SAME_ORG))
      .mockReturnValueOnce(buildChain(PRIOR_TEAM_SAME_ORG))
      .mockReturnValueOnce(buildChain([{ content_structured: PRIOR_SEASON_REPORT }]))
      .mockReturnValueOnce(buildChain([]))                                 // 0070 coach-scoped voice anchors
      .mockReturnValueOnce(buildChain(SAVED_PLAN));

    await POST(makeRequest());

    const callArg = mockCallAIWithJSON.mock.calls[0][0] as {
      interactionType: string;
      orgId: string;
    };
    expect(callArg.interactionType).toBe('generate_parent_report');
    expect(callArg.orgId).toBe(ORG_ID);
  });
});

// ─── AC4: schema accepts the new optional field both ways ────────────────────────

describe('parentReportSchema — since_last_season field (ticket 0034)', () => {
  it('accepts a report WITH since_last_season', () => {
    expect(() => parentReportSchema.parse(AI_RESULT_CROSS_SEASON)).not.toThrow();
    const parsed = parentReportSchema.parse(AI_RESULT_CROSS_SEASON);
    expect(parsed.since_last_season).toBe(AI_RESULT_CROSS_SEASON.since_last_season);
  });

  it('accepts since_last_season: null', () => {
    const parsed = parentReportSchema.parse({ ...AI_RESULT_SINGLE_SEASON, since_last_season: null });
    expect(parsed.since_last_season).toBeNull();
  });

  it('still accepts a report WITHOUT since_last_season (existing fixtures / 0016 path)', () => {
    expect(() => parentReportSchema.parse(AI_RESULT_SINGLE_SEASON)).not.toThrow();
    const parsed = parentReportSchema.parse(AI_RESULT_SINGLE_SEASON);
    expect(parsed.since_last_season).toBeUndefined();
  });

  it('accepts the 0016 since_last_report AND the 0034 since_last_season together', () => {
    const both = {
      ...AI_RESULT_CROSS_SEASON,
      since_last_report: 'Since last month, closeouts improved.',
    };
    expect(() => parentReportSchema.parse(both)).not.toThrow();
    const parsed = parentReportSchema.parse(both);
    expect(parsed.since_last_report).toBe(both.since_last_report);
    expect(parsed.since_last_season).toBe(both.since_last_season);
  });
});
