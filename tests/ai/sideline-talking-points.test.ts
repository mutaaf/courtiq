/**
 * Ticket 0046 — POST /api/ai/sideline-talking-points
 *
 * Backend behaviours under test (one per acceptance-criteria box):
 *  (A) no auth → 401 and no DB read.
 *  (B) team belongs to a different org → 404 and no AI call.
 *  (C) below-threshold (too few recent observations) → 200 { sheet: null } and
 *      no AI call (mirrors 0023's quiet-week short-circuit).
 *  (D) tier gate is SERVER-side: free → 402 { upgrade: true, feature:
 *      'report_cards' }; coach succeeds (the existing `report_cards` feature
 *      key already grants Coach/Pro/Org). Per LESSONS#0023 the gate uses the
 *      tier-key string verbatim.
 *  (E) happy path: persists a `plans` row of type 'sideline_talking_points'
 *      with the two-key content_structured body, calls callAIWithJSON with the
 *      resolved orgId, interactionType is the existing 'custom' (no provider
 *      hardcoding).
 *  (F) COPPA: the insert payload has NO new minor field; only the two-key sheet
 *      and the standard team/coach linkage that every plan already carries.
 *
 * Strategy mirrors tests/ai/pregame-brief.test.ts: @/lib/supabase/server is a
 * chainable in-memory mock; @/lib/ai/client's callAIWithJSON is mocked.
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

import { POST as sidelinePost } from '@/app/api/ai/sideline-talking-points/route';

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
      created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  return out;
}

function happyAIResult() {
  return {
    parsed: {
      team_id: 'team-1',
      entries: [
        {
          player_id: 'p-maya',
          player_first_name: 'Maya',
          lead_line: 'Closeouts have come a long way; mention her hustle on Tuesday.',
          working_on_line: 'We are working on her finishing with contact.',
        },
        {
          player_id: 'p-devon',
          player_first_name: 'Devon',
          lead_line: 'First to dive for the loose ball this week.',
          working_on_line: 'We are working on holding his position on rebounds.',
        },
        {
          player_id: 'p-sarah',
          player_first_name: 'Sarah',
          lead_line: 'Reads the floor before she dribbles — that is rare at this age.',
          working_on_line: 'We are working on her passing to the weak side.',
        },
      ],
    },
    interactionId: 'ai-int-sideline-1',
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

function makeRequest(body: unknown = { teamId: 'team-1' }) {
  return new Request('http://localhost/api/ai/sideline-talking-points', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── A. no auth → 401 ───────────────────────────────────────────────────────────

describe('POST /api/ai/sideline-talking-points — auth', () => {
  it('returns 401 and reads nothing when unauthenticated', async () => {
    setNoAuth();

    const res = await sidelinePost(makeRequest());

    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── D. tier gating server-side (report_cards) ──────────────────────────────────

describe('POST /api/ai/sideline-talking-points — tier gate', () => {
  it('returns 402 { upgrade: true, feature: "report_cards" } for a free coach and never calls AI', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'free' } });
      return buildChain(null);
    });

    const res = await sidelinePost(makeRequest());

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
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-coach' });
      if (table === 'players') return buildChain(makePlayers());
      if (table === 'observations') return buildChain(makeObservations(15));
      // The route inserts a plan row at the end of the happy path.
      if (table === 'plans') return buildChain({ id: 'plan-sideline-1' });
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(happyAIResult());

    const res = await sidelinePost(makeRequest());

    expect(res.status).toBe(200);
  });
});

// ─── B. team-scoped (cross-org teamId → 404) ────────────────────────────────────

describe('POST /api/ai/sideline-talking-points — team ownership', () => {
  it('returns 404 for a teamId the caller org does not own and never calls AI', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'coach' } });
      if (table === 'teams') return buildChain({ id: 'team-other', org_id: 'org-999' });
      return buildChain(null);
    });

    const res = await sidelinePost(makeRequest({ teamId: 'team-other' }));

    expect(res.status).toBe(404);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── C. below-threshold → { sheet: null } and no AI call ────────────────────────

describe('POST /api/ai/sideline-talking-points — below-threshold short-circuit', () => {
  it('returns 200 { sheet: null } when total recent observations are below the threshold (no AI call, no quota cost)', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-coach', organizations: { tier: 'coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-coach' });
      if (table === 'players') return buildChain(makePlayers());
      // A trickle of observations — below the threshold (route documents < 8).
      if (table === 'observations') return buildChain(makeObservations(2));
      return buildChain(null);
    });

    const res = await sidelinePost(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sheet).toBeNull();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── E. Happy path — persists sideline_talking_points + calls AI with orgId ─────

describe('POST /api/ai/sideline-talking-points — happy path', () => {
  it('persists a sideline_talking_points plan with the two-key body and calls AI with the caller orgId', async () => {
    setAuthUser('coach-1');

    let insertedPayload: Record<string, unknown> | null = null;
    const insertedChain = buildChain({ id: 'plan-sideline-1' });
    (insertedChain.insert as ReturnType<typeof vi.fn>).mockImplementation(
      (payload: Record<string, unknown>) => {
        insertedPayload = payload;
        return insertedChain;
      },
    );

    let plansCalls = 0;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-coach', organizations: { tier: 'coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-coach' });
      if (table === 'players') return buildChain(makePlayers());
      if (table === 'observations') return buildChain(makeObservations(15));
      if (table === 'plans') {
        plansCalls += 1;
        // The route inserts a fresh plan row.
        return insertedChain;
      }
      if (table === 'coach_drill_signals') return buildChain([]);
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(happyAIResult());

    const res = await sidelinePost(makeRequest());

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
    expect(insertedPayload!.type).toBe('sideline_talking_points');
    expect(insertedPayload!.team_id).toBe('team-1');
    expect(insertedPayload!.coach_id).toBe('coach-1');
    const cs = insertedPayload!.content_structured as Record<string, unknown>;
    expect(Object.keys(cs).sort()).toEqual(['entries', 'team_id']);
    const entries = cs.entries as Array<Record<string, unknown>>;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual([
        'lead_line', 'player_first_name', 'player_id', 'working_on_line',
      ]);
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
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-coach' });
      if (table === 'players') return buildChain(makePlayers());
      if (table === 'observations') return buildChain(makeObservations(15));
      if (table === 'plans') return insertedChain;
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(happyAIResult());

    const res = await sidelinePost(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.planId).toBe('plan-returned-1');
    expect(body.content_structured).toMatchObject({
      team_id: 'team-1',
      entries: expect.any(Array),
    });
  });
});

// ─── Input validation ───────────────────────────────────────────────────────────

describe('POST /api/ai/sideline-talking-points — input validation', () => {
  it('returns 400 when teamId is missing', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((_table: string) => buildChain(null));
    const res = await sidelinePost(makeRequest({}));
    expect(res.status).toBe(400);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});
