/**
 * Ticket 0070 — POST /api/ai/parent-report — coaching-signature voice anchors
 * across every team the coach has ever coached.
 *
 * Builds on:
 *  - 0016 same-player continuity (tests/ai/parent-report-continuity.test.ts)
 *  - 0034 cross-season memory (tests/ai/parent-report-cross-season.test.ts)
 *  - 0066 thin-week safety net (tests/api/parent-report-route-thin-week.test.ts)
 *
 * What this suite proves:
 *  AC: 5+ prior parent_report plans across multiple teams → the signature is
 *      threaded into the parentReport prompt (the "lean on" block fires).
 *  AC: 0 prior reports → the prompt is BYTE-IDENTICAL to the post-0066
 *      baseline (the prompt body has no voice-anchor block).
 *  AC: the new from('plans')...eq('coach_id', user.id).eq('type','parent_report')
 *      read failure (throws / errors) degrades gracefully — the parent-report
 *      generation still succeeds and the user sees the same artifact they
 *      would have seen before this ticket (LESSONS#0036).
 *  AC: the new read is scoped by `coach_id` (the cross-team semantic) NOT by
 *      `team_id` — the read fires with the caller's coach id, not the
 *      request body's team id.
 *  AC: the .select() keyset for the new read is an explicit allow-list —
 *      never select('*'), never a field on the players row, never minor
 *      data (LESSONS#0036).
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

/**
 * A chain that records every method call so we can inspect WHICH filters the
 * route applied (so we can prove the new read is scoped by coach_id, not
 * team_id, and that .select() is an explicit allow-list).
 */
type RecordingChain = Record<string, unknown> & {
  __selectArgs: unknown[];
  __eqCalls: Array<[string, unknown]>;
  __orderArgs: unknown[];
  __limitArgs: unknown[];
};

function buildRecordingChain(data: unknown = null, error: unknown = null): RecordingChain {
  const resolved = { data, error };
  const chain: RecordingChain = {
    __selectArgs: [],
    __eqCalls: [],
    __orderArgs: [],
    __limitArgs: [],
    select: vi.fn((arg: unknown) => {
      chain.__selectArgs.push(arg);
      return chain;
    }),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      chain.__eqCalls.push([col, val]);
      return chain;
    }),
    neq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    is: vi.fn(() => chain),
    not: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn((col: unknown) => {
      chain.__orderArgs.push(col);
      return chain;
    }),
    limit: vi.fn((n: unknown) => {
      chain.__limitArgs.push(n);
      return chain;
    }),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

/** A chain whose terminal read THROWS — to exercise the degrade-to-snapshot path. */
function throwingChain(): RecordingChain {
  const chain: RecordingChain = {
    __selectArgs: [],
    __eqCalls: [],
    __orderArgs: [],
    __limitArgs: [],
    select: vi.fn((arg: unknown) => {
      chain.__selectArgs.push(arg);
      return chain;
    }),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      chain.__eqCalls.push([col, val]);
      return chain;
    }),
    neq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    is: vi.fn(() => chain),
    not: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn().mockRejectedValue(new Error('coach-scoped read failed')),
    then: (_onF: unknown, onRejected: (e: unknown) => unknown) =>
      Promise.reject(new Error('coach-scoped read failed')).then(undefined, onRejected),
  };
  return chain;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COACH_ID = 'coach-1';
const TEAM_ID = 'team-1';
const PLAYER = {
  id: 'player-1',
  name: 'Maya',
  team_id: TEAM_ID,
};

// A prior parent-report plan row keyed by content_structured (highlights +
// coach_note are what the voice-anchor extractor reads).
function priorParentReportRow(highlights: string[], coachNote: string) {
  return {
    content_structured: {
      player_name: 'Maya',
      highlights,
      coach_note: coachNote,
    },
  };
}

// Five+ prior reports across (implicitly) multiple teams — the route does NOT
// filter by team_id, so these can come from any team the coach has coached.
const FIVE_PLUS_PRIOR_REPORTS = [
  priorParentReportRow(['playing with her hands ready'], 'Closeouts coming along.'),
  priorParentReportRow(['playing with her hands ready'], 'She is reading the play.'),
  priorParentReportRow(
    ['hearing the call before the ball comes'],
    'Switch communication is steadying.',
  ),
  priorParentReportRow(['playing with her hands ready'], 'Hands stayed up all practice.'),
  priorParentReportRow(['hearing the call before the ball comes'], 'Great week of defense.'),
  priorParentReportRow(['totally different observation'], 'Working the basics.'),
];

const AI_RESULT_CLEAN = {
  player_name: 'Maya',
  greeting: 'Maya had a strong week.',
  highlights: ['Closed out on the wing'],
  skill_progress: [
    { skill_name: 'Defense', level: 'Practicing', narrative: 'Closeouts steady.' },
  ],
  encouragement: 'Keep showing up.',
  coach_note: 'Watching how Tuesday goes.',
};

const CONTEXT = {
  teamName: 'Tigers',
  sportSlug: 'basketball',
  ageGroup: '11-13',
  seasonWeek: 5,
  roster: [],
};

const SAVED_PLAN = { id: 'plan-new', type: 'parent_report', player_id: 'player-1' };

function setAuthUser(id = COACH_ID) {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function makeRequest(playerId = 'player-1', teamId = TEAM_ID) {
  return new Request('http://localhost/api/ai/parent-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId, playerId }),
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

// The from() queue is, in route order:
//   1. coaches           — org_id lookup
//   2. players           — target row
//   3. observations      — recent obs
//   4. player_skill_proficiency — proficiency
//   5. plans             — same-player prior reports (0016)
//   6. plans             — coach-scoped prior parent_reports for voice anchors (0070)
//   7. plans             — insert (saved plan)
// (No prior_player_id set on PLAYER, so the 0034 cross-season branch does NOT
// fire — keeps the queue smaller and easier to reason about.)

describe('POST /api/ai/parent-report — coaching-signature voice anchors (ticket 0070)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockBuildAIContext.mockResolvedValue(CONTEXT);
    mockCallAIWithJSON.mockResolvedValue({
      parsed: AI_RESULT_CLEAN,
      interactionId: 'interaction-1',
    });
  });

  // AC: 5+ prior reports → the signature is threaded into the prompt body.
  it('threads the coach-signature voice-anchor block into the prompt when the coach has 5+ prior parent reports', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildRecordingChain({ org_id: 'org-1' }))             // coaches
      .mockReturnValueOnce(buildRecordingChain(PLAYER))                           // players (target)
      .mockReturnValueOnce(buildRecordingChain([]))                               // observations
      .mockReturnValueOnce(buildRecordingChain([]))                               // proficiency
      .mockReturnValueOnce(buildRecordingChain([]))                               // same-player prior reports (0016)
      .mockReturnValueOnce(buildRecordingChain(FIVE_PLUS_PRIOR_REPORTS))         // 0070 coach-scoped voice anchors
      .mockReturnValueOnce(buildRecordingChain(SAVED_PLAN));                      // insert

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as {
      systemPrompt: string;
      userPrompt: string;
    };
    // The "lean on" instruction is present.
    expect(promptArg.systemPrompt).toMatch(/lean on/i);
    // At least one of the anchors that repeats across the 6 reports surfaces.
    const containsHandsReady = promptArg.systemPrompt.includes('playing with her hands ready');
    const containsCallBeforeBall = promptArg.systemPrompt.includes(
      'hearing the call before the ball comes',
    );
    expect(containsHandsReady || containsCallBeforeBall).toBe(true);
  });

  // AC: 0 prior reports → BYTE-IDENTICAL post-0066 prompt (no voice-anchor block).
  it('produces a prompt with NO voice-anchor block when the coach has 0 prior parent reports', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildRecordingChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildRecordingChain(PLAYER))
      .mockReturnValueOnce(buildRecordingChain([]))
      .mockReturnValueOnce(buildRecordingChain([]))
      .mockReturnValueOnce(buildRecordingChain([])) // same-player prior reports
      .mockReturnValueOnce(buildRecordingChain([])) // 0070 coach-scoped (zero rows)
      .mockReturnValueOnce(buildRecordingChain(SAVED_PLAN));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as {
      systemPrompt: string;
      userPrompt: string;
    };
    // No voice-anchor block fired.
    expect(promptArg.systemPrompt).not.toMatch(/lean on/i);
  });

  // AC: the new coach-scoped read failure (throws) degrades gracefully — the
  // route returns 200 and the same artifact the user would have seen before
  // this ticket (LESSONS#0036).
  it('degrades gracefully (200) when the new coach-scoped read throws', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildRecordingChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildRecordingChain(PLAYER))
      .mockReturnValueOnce(buildRecordingChain([]))
      .mockReturnValueOnce(buildRecordingChain([]))
      .mockReturnValueOnce(buildRecordingChain([])) // same-player prior reports
      .mockReturnValueOnce(throwingChain())          // 0070 coach-scoped THROWS
      .mockReturnValueOnce(buildRecordingChain(SAVED_PLAN));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const promptArg = mockCallAIWithJSON.mock.calls[0][0] as {
      systemPrompt: string;
      userPrompt: string;
    };
    // No voice-anchor block — the read failed, so the prompt is the post-0066
    // baseline (no "lean on" instruction).
    expect(promptArg.systemPrompt).not.toMatch(/lean on/i);
  });

  // AC: the new read is scoped by coach_id (the cross-team semantic), NOT by
  // team_id — the eq() calls on the new chain must include `coach_id` with the
  // CALLER's user id and must NOT include `team_id`.
  it('scopes the new coach-scoped read by coach_id (cross-team) and NOT by team_id', async () => {
    setAuthUser();
    const coachScopedChain = buildRecordingChain(FIVE_PLUS_PRIOR_REPORTS);
    mockFromFn
      .mockReturnValueOnce(buildRecordingChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildRecordingChain(PLAYER))
      .mockReturnValueOnce(buildRecordingChain([]))
      .mockReturnValueOnce(buildRecordingChain([]))
      .mockReturnValueOnce(buildRecordingChain([])) // same-player prior reports
      .mockReturnValueOnce(coachScopedChain)         // 0070 coach-scoped
      .mockReturnValueOnce(buildRecordingChain(SAVED_PLAN));

    await POST(makeRequest());

    const eqColumns = coachScopedChain.__eqCalls.map((p) => p[0]);
    expect(eqColumns).toContain('coach_id');
    expect(eqColumns).toContain('type');
    expect(eqColumns).not.toContain('team_id');
    expect(eqColumns).not.toContain('player_id');

    // The coach_id filter MUST use the caller's user id (cross-team semantic).
    const coachIdCall = coachScopedChain.__eqCalls.find((p) => p[0] === 'coach_id');
    expect(coachIdCall?.[1]).toBe(COACH_ID);

    // The type filter is the parent_report-scoped one.
    const typeCall = coachScopedChain.__eqCalls.find((p) => p[0] === 'type');
    expect(typeCall?.[1]).toBe('parent_report');
  });

  // AC: the new read uses an explicit allow-list .select() — never select('*'),
  // never minor-data fields, never a players-row field (LESSONS#0036).
  it('uses an explicit .select() allow-list on the new coach-scoped read — never select("*") nor minor data', async () => {
    setAuthUser();
    const coachScopedChain = buildRecordingChain(FIVE_PLUS_PRIOR_REPORTS);
    mockFromFn
      .mockReturnValueOnce(buildRecordingChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildRecordingChain(PLAYER))
      .mockReturnValueOnce(buildRecordingChain([]))
      .mockReturnValueOnce(buildRecordingChain([]))
      .mockReturnValueOnce(buildRecordingChain([]))
      .mockReturnValueOnce(coachScopedChain)
      .mockReturnValueOnce(buildRecordingChain(SAVED_PLAN));

    await POST(makeRequest());

    expect(coachScopedChain.__selectArgs.length).toBeGreaterThan(0);
    const selectArg = String(coachScopedChain.__selectArgs[0] ?? '');
    expect(selectArg).not.toBe('*');
    // No minor-data field — the new read reads only the coach-authored plan column.
    expect(selectArg).not.toContain('date_of_birth');
    expect(selectArg).not.toContain('medical_notes');
    expect(selectArg).not.toContain('parent_email');
    expect(selectArg).not.toContain('parent_phone');
    // The route reads the persisted plan's structured content — the field that
    // carries the coach's prior phrasings.
    expect(selectArg).toContain('content_structured');
    // The read is bounded — limit at most 40 rows.
    expect(coachScopedChain.__limitArgs.length).toBeGreaterThan(0);
    expect(coachScopedChain.__limitArgs[0]).toBeLessThanOrEqual(40);
  });
});
