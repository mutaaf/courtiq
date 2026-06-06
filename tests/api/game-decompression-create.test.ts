/**
 * Ticket 0069 — POST /api/game-decompression/create.
 *
 * The coach just finished a bad loss and is driving home. She taps "Quick
 * voice note — what hurt?" on the game session, records up to 60 seconds
 * via the existing voice path, and on Save this route persists the
 * transcript + asks the AI for ONE drill for the first slot of the next
 * practice plan.
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user (before any DB read).
 *  - 400 when sessionId is missing.
 *  - 404 when the session does not exist.
 *  - 400 { reason: 'type' } when the session is not game/scrimmage/tournament.
 *  - 400 { reason: 'window' } when the session is more than 24h old.
 *  - 403 when the caller is not a coach on the session's team
 *    (head-coach check goes through `team_coaches`, LESSONS#0057).
 *  - 400 { reason: 'length' } when the transcript is empty or > 1200 chars.
 *  - 400 { reason: 'voice' } when the transcript contains a banned word.
 *  - 200 happy path on a coach-tier coach: row written, AI called, the
 *    recommendation persisted back, response carries the recommendation.
 *  - 402 { reason: 'tier' } when the caller is free-tier — the transcript
 *    persists but NO AI call fires.
 *  - 200 idempotent re-record on (session_id, coach_id) REPLACES the prior
 *    transcript and recommendation.
 *  - the saved `why` line never carries a "First Last" surname shape even
 *    if the AI returns one (LESSONS#0061 last-name strip).
 *
 * `.test.ts` NOT `.spec.ts` (LESSONS#0020/#38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('@/lib/ai/client', () => ({ callAIWithJSON: mockCallAIWithJSON }));

import { POST } from '@/app/api/game-decompression/create/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = 'coach-1';
const ORG_ID = 'org-1';
const SESSION_ID = '00000000-0000-4000-a000-000000000040';
const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const TRANSCRIPT =
  "We couldn't get a single rebound today. They outran us on every transition. Need to work on rebounding and effort.";

const RECENT_GAME = {
  id: SESSION_ID,
  team_id: TEAM_ID,
  type: 'game',
  date: new Date().toISOString().slice(0, 10),
  start_time: null,
  created_at: new Date().toISOString(),
};

const STALE_GAME = {
  id: SESSION_ID,
  team_id: TEAM_ID,
  type: 'game',
  // 3 days ago — outside the 24h window.
  date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  start_time: null,
  created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
};

const PRACTICE_SESSION = {
  id: SESSION_ID,
  team_id: TEAM_ID,
  type: 'practice',
  date: new Date().toISOString().slice(0, 10),
  start_time: null,
  created_at: new Date().toISOString(),
};

const AI_RECOMMENDATION = {
  drill_name: 'Live-ball rebound 2-on-2',
  setup_lines: [
    'Pair up at the elbows; one shooter at the wing.',
    'Box out on the shot; first to 5 boards wins.',
    'Eight minutes. Switch partners every two.',
  ],
  why: "Saturday's note said rebounding and effort. Starting here.",
};

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(
  body: unknown = {
    sessionId: SESSION_ID,
    transcript: TRANSCRIPT,
    durationSeconds: 28,
  },
) {
  return new Request('http://localhost/api/game-decompression/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Queue a happy-path coach-tier chain set:
 *   1) session lookup
 *   2) team_coaches head-coach check
 *   3) coaches.org_id
 *   4) organizations.tier
 *   5) game_decompressions upsert (returns row)
 *   6) teams.sport_id  (drill library)
 *   7) drills.list
 *   8) plans (coaching signature)
 *   9) game_decompressions update (recommendation persisted back)
 */
function queueHappyPath(savedRow: Record<string, unknown>) {
  mockFromFn
    .mockReturnValueOnce(buildChain(RECENT_GAME))                       // sessions
    .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))             // team_coaches
    .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))                 // coaches
    .mockReturnValueOnce(buildChain({ tier: 'coach' }))                  // organizations
    .mockReturnValueOnce(buildChain(savedRow))                           // game_decompressions upsert
    .mockReturnValueOnce(buildChain({ sport_id: 'sport-1' }))            // teams.sport_id
    .mockReturnValueOnce(buildChain([{ name: 'Box-out drill', category: 'rebounding' }])) // drills
    .mockReturnValueOnce(buildChain([]))                                 // plans (signature)
    .mockReturnValueOnce(buildChain({ ...savedRow, recommended_drill_name: AI_RECOMMENDATION.drill_name })); // game_decompressions update
}

describe('POST /api/game-decompression/create (ticket 0069)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // LESSONS#0039 — drain the per-mock queue between tests.
    mockFromFn.mockReset();
    mockCallAIWithJSON.mockResolvedValue({ parsed: AI_RECOMMENDATION, interactionId: 'i-1' });
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 when sessionId is missing', async () => {
    setAuthUser();
    const res = await POST(makeRequest({ transcript: TRANSCRIPT, durationSeconds: 28 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 { reason: "length" } when the transcript is empty', async () => {
    setAuthUser();
    const res = await POST(
      makeRequest({ sessionId: SESSION_ID, transcript: '   ', durationSeconds: 12 }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('length');
  });

  it('returns 400 { reason: "length" } when the transcript is > 1200 chars', async () => {
    setAuthUser();
    const long = 'a'.repeat(1201);
    const res = await POST(
      makeRequest({ sessionId: SESSION_ID, transcript: long, durationSeconds: 28 }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('length');
  });

  it('returns 400 { reason: "length" } when durationSeconds is out of bounds', async () => {
    setAuthUser();
    const res = await POST(
      makeRequest({ sessionId: SESSION_ID, transcript: TRANSCRIPT, durationSeconds: 600 }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('length');
  });

  it('returns 400 { reason: "voice" } when the transcript contains a banned word', async () => {
    setAuthUser();
    const res = await POST(
      makeRequest({
        sessionId: SESSION_ID,
        transcript: 'It was an amazing game and the kids journeyed through the loss.',
        durationSeconds: 28,
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('voice');
  });

  it('returns 404 when the session does not exist', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 400 { reason: "type" } when the session is not game/scrimmage/tournament', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(PRACTICE_SESSION));
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('type');
  });

  it('returns 400 { reason: "window" } when the session is more than 24h old', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(STALE_GAME));
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('window');
  });

  it('returns 403 when the caller is not a coach on the session team (team_coaches miss)', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain(RECENT_GAME))
      .mockReturnValueOnce(buildChain(null)); // team_coaches: not on team
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns 402 { reason: "tier" } on a free-tier coach AND does NOT call the AI step', async () => {
    setAuthUser();
    const savedRow = {
      id: 'dec-1',
      session_id: SESSION_ID,
      coach_id: COACH_ID,
      team_id: TEAM_ID,
      transcript: TRANSCRIPT,
      duration_seconds: 28,
    };
    mockFromFn
      .mockReturnValueOnce(buildChain(RECENT_GAME))                  // sessions
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))        // team_coaches
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))            // coaches
      .mockReturnValueOnce(buildChain({ tier: 'free' }))              // organizations
      .mockReturnValueOnce(buildChain(savedRow));                     // game_decompressions upsert

    const res = await POST(makeRequest());
    expect(res.status).toBe(402);
    const body = (await res.json()) as { reason?: string; transcript?: string };
    expect(body.reason).toBe('tier');
    // The voice-first promise: the TRANSCRIPT is still persisted on free.
    expect(body.transcript).toBe(TRANSCRIPT);
    // The AI step did NOT fire — the load-bearing server gate per AGENTS.md.
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('happy path on a coach-tier coach: row written, AI called, recommendation persisted', async () => {
    setAuthUser();
    const savedRow = {
      id: 'dec-1',
      session_id: SESSION_ID,
      coach_id: COACH_ID,
      team_id: TEAM_ID,
      transcript: TRANSCRIPT,
      duration_seconds: 28,
    };
    queueHappyPath(savedRow);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      transcript: string;
      recommendation: { drillName: string; setupLines: string[]; why: string };
    };
    expect(body.transcript).toBe(TRANSCRIPT);
    expect(body.recommendation.drillName).toBe(AI_RECOMMENDATION.drill_name);
    expect(body.recommendation.setupLines.length).toBeGreaterThan(0);
    expect(body.recommendation.why).toContain('rebounding');

    // The AI step fired exactly once with the new prompt.
    expect(mockCallAIWithJSON).toHaveBeenCalledTimes(1);
    const aiArg = mockCallAIWithJSON.mock.calls[0][0] as {
      systemPrompt: string;
      userPrompt: string;
      orgId: string;
    };
    expect(aiArg.userPrompt).toContain(TRANSCRIPT);
    expect(aiArg.orgId).toBe(ORG_ID);
  });

  it('strips a "First Last" surname shape from the AI why line before persistence (LESSONS#0061)', async () => {
    setAuthUser();
    const surnameOutput = {
      ...AI_RECOMMENDATION,
      why: 'Maya Walker outran the press all night. Starting here.',
    };
    mockCallAIWithJSON.mockResolvedValueOnce({ parsed: surnameOutput, interactionId: 'i-2' });
    const savedRow = {
      id: 'dec-1',
      session_id: SESSION_ID,
      coach_id: COACH_ID,
      team_id: TEAM_ID,
      transcript: TRANSCRIPT,
      duration_seconds: 28,
    };
    queueHappyPath(savedRow);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      recommendation: { why: string };
    };
    // The surname is stripped: "Maya Walker" becomes "Maya".
    expect(body.recommendation.why).toContain('Maya');
    expect(body.recommendation.why).not.toContain('Walker');
  });

  it('re-record on (session_id, coach_id) goes through the upsert path (idempotency)', async () => {
    setAuthUser();
    const savedRow = {
      id: 'dec-1',
      session_id: SESSION_ID,
      coach_id: COACH_ID,
      team_id: TEAM_ID,
      transcript: TRANSCRIPT,
      duration_seconds: 28,
    };
    const upsertChain = buildChain(savedRow);
    mockFromFn
      .mockReturnValueOnce(buildChain(RECENT_GAME))
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain({ tier: 'coach' }))
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(buildChain({ sport_id: 'sport-1' }))
      .mockReturnValueOnce(buildChain([{ name: 'Box-out drill', category: 'rebounding' }]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain({ ...savedRow, recommended_drill_name: AI_RECOMMENDATION.drill_name }));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // The route's .upsert() was called on the game_decompressions chain —
    // the idempotency contract is upsert on (session_id, coach_id).
    expect(upsertChain.upsert).toHaveBeenCalled();
    const upsertArg = (upsertChain.upsert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(upsertArg[1]).toMatchObject({ onConflict: 'session_id,coach_id' });
  });
});
