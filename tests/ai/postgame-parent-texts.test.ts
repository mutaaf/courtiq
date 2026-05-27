/**
 * Ticket 0048 — POST /api/ai/postgame-parent-texts
 *
 * The post-game complement to the 0046 sideline cheat sheet. Same backend
 * shape, but session-scoped (game sessions only) and the artifact's per-entry
 * payload is a single 220-char text message — written to the PARENT, in second
 * person, sized for the Messages app.
 *
 * Backend behaviours under test (one per acceptance-criteria box):
 *  (A) no auth → 401 and no DB read.
 *  (B) session belongs to a different org → 404 and no AI call.
 *  (C) session.type !== 'game' → 400 { error: 'not_a_game' } and no AI call.
 *  (D) below-threshold (too few observations across the session window) →
 *      200 { sheet: null } and no AI call (mirrors 0046's quiet-team
 *      short-circuit so a cold just-finished game burns no quota).
 *  (E) tier gate is SERVER-side: free → 402 { upgrade: true, feature:
 *      'report_cards' }; coach succeeds (the existing `report_cards` feature
 *      key already grants Coach/Pro/Org). Per LESSONS#0023 the gate uses the
 *      tier-key string verbatim — same key as the sideline sheet and the
 *      parent report.
 *  (F) happy path: persists a `plans` row of type 'postgame_parent_texts'
 *      with the two-key content_structured body bound to session_id, calls
 *      callAIWithJSON with the resolved orgId, interactionType is the
 *      existing 'custom' (no provider hardcoding).
 *  (G) COPPA: the insert payload has NO new minor field; only the two-key
 *      sheet and the standard team/coach/session linkage that every plan
 *      already carries.
 *
 * Strategy mirrors tests/ai/sideline-talking-points.test.ts: @/lib/supabase/server
 * is a chainable in-memory mock; @/lib/ai/client's callAIWithJSON is mocked.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020/#38).
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

vi.mock('@/lib/ai/client', () => ({
  callAIWithJSON: mockCallAIWithJSON,
}));

vi.mock('@/lib/ai/context-builder', () => ({
  buildAIContext: mockBuildAIContext,
}));

import { POST as postgamePost } from '@/app/api/ai/postgame-parent-texts/route';

// ─── Chainable mock helpers ─────────────────────────────────────────────────────

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

function setNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

function makePlayers() {
  return [
    { id: 'p-maya', name: 'Maya Walker', is_active: true },
    { id: 'p-devon', name: 'Devon Hayes', is_active: true },
    { id: 'p-sarah', name: 'Sarah Lin', is_active: true },
  ];
}

function makeGameSession() {
  return {
    id: 'sess-1',
    team_id: 'team-1',
    type: 'game',
    date: '2026-05-25',
    started_at: '2026-05-25T17:00:00Z',
    opponent: 'Eagles',
  };
}

function makePracticeSession() {
  return {
    id: 'sess-practice-1',
    team_id: 'team-1',
    type: 'practice',
    date: '2026-05-23',
    started_at: '2026-05-23T17:00:00Z',
  };
}

function makeObservations(n = 12) {
  // Spread across the active roster so the per-player grouping has data for
  // each player. The route's below-threshold gate keys on the total count.
  const out: Array<{ player_id: string; team_id: string; category: string; sentiment: string; created_at: string; text: string }> = [];
  const pids = ['p-maya', 'p-devon', 'p-sarah'];
  for (let i = 0; i < n; i += 1) {
    out.push({
      player_id: pids[i % pids.length],
      team_id: 'team-1',
      category: i % 2 === 0 ? 'Defense' : 'Finishing',
      sentiment: i % 3 === 0 ? 'positive' : 'needs-work',
      text: `obs ${i}`,
      created_at: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
    });
  }
  return out;
}

function happyAIResult() {
  return {
    parsed: {
      session_id: 'sess-1',
      entries: [
        {
          player_id: 'p-maya',
          player_first_name: 'Maya',
          text_message: "Maya's defense in the second half was the difference today; she boxed out twice in a row, which is exactly what we have been working on.",
        },
        {
          player_id: 'p-devon',
          player_first_name: 'Devon',
          text_message: 'Devon was first to dive for the loose ball today and held his position on the line all four quarters.',
        },
        {
          player_id: 'p-sarah',
          player_first_name: 'Sarah',
          text_message: 'Sarah read the floor before she dribbled all game and made two beautiful weak-side passes — rare at this age.',
        },
      ],
    },
    interactionId: 'ai-int-postgame-1',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the from() factory between tests so per-call mockImplementationOnce
  // queues from a prior test do not leak (LESSONS#0039).
  mockFromFn.mockReset();
  mockBuildAIContext.mockResolvedValue({
    teamName: 'Tigers',
    sportName: 'basketball',
    ageGroup: '11-13',
    seasonWeek: 7,
  });
});

function makeRequest(body: unknown = { sessionId: 'sess-1' }) {
  return new Request('http://localhost/api/ai/postgame-parent-texts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── A. no auth → 401 ───────────────────────────────────────────────────────────

describe('POST /api/ai/postgame-parent-texts — auth', () => {
  it('returns 401 and reads nothing when unauthenticated', async () => {
    setNoAuth();

    const res = await postgamePost(makeRequest());

    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── E. tier gating server-side (report_cards) ──────────────────────────────────

describe('POST /api/ai/postgame-parent-texts — tier gate', () => {
  it('returns 402 { upgrade: true, feature: "report_cards" } for a free coach and never calls AI', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'free' } });
      return buildChain(null);
    });

    const res = await postgamePost(makeRequest());

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.upgrade).toBe(true);
    // Per LESSONS#0023 — the feature key must equal the tier-key string verbatim.
    expect(body.feature).toBe('report_cards');
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns 200 for a coach-tier coach (gate passes — report_cards is on Coach+)', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-coach', organizations: { tier: 'coach' } });
      if (table === 'sessions') return buildChain(makeGameSession());
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-coach' });
      if (table === 'players') return buildChain(makePlayers());
      if (table === 'observations') return buildChain(makeObservations(15));
      if (table === 'plans') return buildChain({ id: 'plan-postgame-1' });
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(happyAIResult());

    const res = await postgamePost(makeRequest());

    expect(res.status).toBe(200);
  });
});

// ─── B. session ownership (cross-org sessionId → 404) ───────────────────────────

describe('POST /api/ai/postgame-parent-texts — session ownership', () => {
  it('returns 404 for a sessionId on a team the caller org does not own and never calls AI', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'coach' } });
      if (table === 'sessions') return buildChain({ id: 'sess-other', team_id: 'team-other', type: 'game' });
      if (table === 'teams') return buildChain({ id: 'team-other', org_id: 'org-999' });
      return buildChain(null);
    });

    const res = await postgamePost(makeRequest({ sessionId: 'sess-other' }));

    expect(res.status).toBe(404);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── C. session.type !== 'game' → 400 not_a_game ────────────────────────────────

describe('POST /api/ai/postgame-parent-texts — game-only', () => {
  it('returns 400 { error: "not_a_game" } when the session is a practice and never calls AI', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-coach', organizations: { tier: 'coach' } });
      if (table === 'sessions') return buildChain(makePracticeSession());
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-coach' });
      return buildChain(null);
    });

    const res = await postgamePost(makeRequest({ sessionId: 'sess-practice-1' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('not_a_game');
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── D. below-threshold → { sheet: null } and no AI call ────────────────────────

describe('POST /api/ai/postgame-parent-texts — below-threshold short-circuit', () => {
  it('returns 200 { sheet: null } when total observations in the session window are below the threshold (no AI call, no quota cost)', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-coach', organizations: { tier: 'coach' } });
      if (table === 'sessions') return buildChain(makeGameSession());
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-coach' });
      if (table === 'players') return buildChain(makePlayers());
      // A trickle of observations — below the threshold.
      if (table === 'observations') return buildChain(makeObservations(2));
      return buildChain(null);
    });

    const res = await postgamePost(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sheet).toBeNull();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── F. Happy path — persists postgame_parent_texts + calls AI with orgId ──────

describe('POST /api/ai/postgame-parent-texts — happy path', () => {
  it('persists a postgame_parent_texts plan with the two-key body bound to session_id and calls AI with the caller orgId', async () => {
    setAuthUser('coach-1');

    let insertedPayload: Record<string, unknown> | null = null;
    const insertedChain = buildChain({ id: 'plan-postgame-1' });
    (insertedChain.insert as ReturnType<typeof vi.fn>).mockImplementation(
      (payload: Record<string, unknown>) => {
        insertedPayload = payload;
        return insertedChain;
      },
    );

    let plansCalls = 0;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-coach', organizations: { tier: 'coach' } });
      if (table === 'sessions') return buildChain(makeGameSession());
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-coach' });
      if (table === 'players') return buildChain(makePlayers());
      if (table === 'observations') return buildChain(makeObservations(15));
      if (table === 'plans') {
        plansCalls += 1;
        return insertedChain;
      }
      if (table === 'coach_drill_signals') return buildChain([]);
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(happyAIResult());

    const res = await postgamePost(makeRequest());

    expect(res.status).toBe(200);
    expect(mockCallAIWithJSON).toHaveBeenCalledTimes(1);
    const aiArgs = mockCallAIWithJSON.mock.calls[0][0];
    expect(aiArgs.orgId).toBe('org-coach');
    expect(aiArgs.coachId).toBe('coach-1');
    expect(aiArgs.teamId).toBe('team-1');
    // No provider hardcoding — existing 'custom' interactionType (multi-provider
    // failover wrapper from 0012 still applies).
    expect(aiArgs.interactionType).toBe('custom');
    expect(typeof aiArgs.systemPrompt).toBe('string');
    expect(typeof aiArgs.userPrompt).toBe('string');
    expect(aiArgs.systemPrompt.length).toBeGreaterThan(20);
    expect(aiArgs.userPrompt.length).toBeGreaterThan(40);

    // ── Plan row: the two-key body + correct linkage; NO new minor field ──────
    expect(insertedPayload).not.toBeNull();
    expect(insertedPayload!.type).toBe('postgame_parent_texts');
    expect(insertedPayload!.team_id).toBe('team-1');
    expect(insertedPayload!.coach_id).toBe('coach-1');
    // The artifact is bound to the same session_id as the game_recap from 0027
    // — both rows can coexist for the same session (regression guard).
    expect(insertedPayload!.session_id).toBe('sess-1');

    const cs = insertedPayload!.content_structured as Record<string, unknown>;
    expect(Object.keys(cs).sort()).toEqual(['entries', 'session_id']);
    const entries = cs.entries as Array<Record<string, unknown>>;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual([
        'player_first_name', 'player_id', 'text_message',
      ]);
      // 220-character cap enforced by the prompt + schema; assert here too.
      expect((entry.text_message as string).length).toBeLessThanOrEqual(220);
    }

    // ── COPPA: the persisted row introduces NO per-player / DOB / parent field.
    const allKeys = Object.keys(insertedPayload!);
    for (const banned of ['date_of_birth', 'parent_name', 'parent_phone', 'medical_notes']) {
      expect(allKeys).not.toContain(banned);
    }

    // sanity: plans was hit once for the insert.
    expect(plansCalls).toBe(1);
  });

  it('returns the planId + content_structured on the happy path', async () => {
    setAuthUser('coach-1');
    const insertedChain = buildChain({ id: 'plan-returned-1' });
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-coach', organizations: { tier: 'coach' } });
      if (table === 'sessions') return buildChain(makeGameSession());
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-coach' });
      if (table === 'players') return buildChain(makePlayers());
      if (table === 'observations') return buildChain(makeObservations(15));
      if (table === 'plans') return insertedChain;
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(happyAIResult());

    const res = await postgamePost(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.planId).toBe('plan-returned-1');
    expect(body.content_structured).toMatchObject({
      session_id: 'sess-1',
      entries: expect.any(Array),
    });
  });
});

// ─── Input validation ───────────────────────────────────────────────────────────

describe('POST /api/ai/postgame-parent-texts — input validation', () => {
  it('returns 400 when sessionId is missing', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((_table: string) => buildChain(null));
    const res = await postgamePost(makeRequest({}));
    expect(res.status).toBe(400);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});
