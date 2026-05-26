/**
 * Ticket 0040 — POST /api/ai/pregame-brief
 *
 * Backend behaviours under test (one per acceptance-criteria box):
 *  (A) no auth → 401 and no DB read.
 *  (B) team belongs to a different org → 404 and the opponent profile is never read.
 *  (C) opponent-profile plan does not exist, belongs to another team, or has the
 *      wrong type → 404 and no AI call.
 *  (D) tier gate is SERVER-side: free + coach tiers → 402 { upgrade: true };
 *      pro_coach succeeds.
 *  (E) happy path: persists a `plans` row of type 'pregame_brief' with the four-key
 *      content_structured body, calls callAIWithJSON with the resolved orgId, and
 *      the interactionType is the existing 'custom' (no provider hardcoding).
 *  (F) COPPA: the insert payload has NO new minor field; only the four-key brief
 *      and the standard team/coach linkage that every plan already carries.
 *
 * Strategy mirrors tests/ai/weekly-digest.test.ts: @/lib/supabase/server is a
 * chainable in-memory mock; @/lib/ai/client's callAIWithJSON is mocked.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
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

import { POST as pregameBriefPost } from '@/app/api/ai/pregame-brief/route';

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

const OPPONENT_PROFILE = {
  id: 'plan-opp-1',
  team_id: 'team-1',
  coach_id: 'coach-1',
  type: 'opponent_profile',
  title: 'Riverside Hawks',
  content_structured: {
    name: 'Riverside Hawks',
    strengths: ['fast breaks', 'press defense'],
    weaknesses: ['weak perimeter shooting'],
    key_players: ['#23 tall center'],
    notes: 'They sub a fresh five every four minutes.',
  },
};

function happyAIResult() {
  return {
    parsed: {
      opponent_read:
        'Riverside leans on a press to force turnovers and breaks fast off the steal. They get tired late and their second unit is a notch behind.',
      our_edge:
        'We have worked Spacing and closeouts for four weeks; both are the answer to their press. Effort has been our calling card.',
      huddle_points: [
        'Beat the press with two short passes before the half line.',
        'Closeouts under control — do not bite on the first pump fake.',
        'When their second five comes in, push the pace.',
      ],
      coach_note: 'Sub aggressively in the third quarter; that is when their starters get tired.',
    },
    interactionId: 'ai-int-pregame-1',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildAIContext.mockResolvedValue({
    teamName: 'Tigers',
    sportName: 'basketball',
    ageGroup: '11-13',
    seasonWeek: 7,
  });
});

function makeRequest(body: unknown = { teamId: 'team-1', opponentProfilePlanId: 'plan-opp-1' }) {
  return new Request('http://localhost/api/ai/pregame-brief', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── A. no auth → 401 ───────────────────────────────────────────────────────────

describe('POST /api/ai/pregame-brief — auth', () => {
  it('returns 401 and reads nothing when unauthenticated', async () => {
    setNoAuth();

    const res = await pregameBriefPost(makeRequest());

    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── D. tier gating server-side ─────────────────────────────────────────────────

describe('POST /api/ai/pregame-brief — tier gate', () => {
  it('returns 402 { upgrade: true } for a free coach and never calls AI', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'free' } });
      return buildChain(null);
    });

    const res = await pregameBriefPost(makeRequest());

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.upgrade).toBe(true);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns 402 for a coach-tier coach (pre-pro)', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'coach' } });
      return buildChain(null);
    });

    const res = await pregameBriefPost(makeRequest());

    expect(res.status).toBe(402);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns 200 for a pro_coach (gate passes)', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'pro_coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-1' });
      if (table === 'plans') return buildChain(OPPONENT_PROFILE);
      if (table === 'observations') return buildChain([]);
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(happyAIResult());

    const res = await pregameBriefPost(makeRequest());

    expect(res.status).toBe(200);
  });
});

// ─── B. team-scoped (cross-org teamId → 404) ────────────────────────────────────

describe('POST /api/ai/pregame-brief — team ownership', () => {
  it('returns 404 for a teamId the caller org does not own and never reads the opponent profile', async () => {
    setAuthUser('coach-1');
    let plansRead = false;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'pro_coach' } });
      if (table === 'teams') return buildChain({ id: 'team-other', org_id: 'org-999' });
      if (table === 'plans') {
        plansRead = true;
        return buildChain(OPPONENT_PROFILE);
      }
      return buildChain(null);
    });

    const res = await pregameBriefPost(
      makeRequest({ teamId: 'team-other', opponentProfilePlanId: 'plan-opp-1' }),
    );

    expect(res.status).toBe(404);
    expect(plansRead).toBe(false);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── C. opponent-profile guard ──────────────────────────────────────────────────

describe('POST /api/ai/pregame-brief — opponent profile guard', () => {
  it('returns 404 when the named plan does not exist', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'pro_coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-1' });
      if (table === 'plans') return buildChain(null); // not found
      return buildChain(null);
    });

    const res = await pregameBriefPost(makeRequest());

    expect(res.status).toBe(404);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns 404 when the named plan exists but is not type opponent_profile', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'pro_coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-1' });
      if (table === 'plans') {
        return buildChain({ ...OPPONENT_PROFILE, type: 'practice' });
      }
      return buildChain(null);
    });

    const res = await pregameBriefPost(makeRequest());

    expect(res.status).toBe(404);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns 404 when the named plan belongs to a different team than the request', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'pro_coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-1' });
      if (table === 'plans') {
        return buildChain({ ...OPPONENT_PROFILE, team_id: 'team-other' });
      }
      return buildChain(null);
    });

    const res = await pregameBriefPost(makeRequest());

    expect(res.status).toBe(404);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── E. Happy path — persists pregame_brief + calls AI with orgId ───────────────

describe('POST /api/ai/pregame-brief — happy path', () => {
  it('persists a pregame_brief plan with the four-key body and calls AI with the caller orgId', async () => {
    setAuthUser('coach-1');

    let insertedPayload: Record<string, unknown> | null = null;
    const insertedChain = buildChain({ id: 'plan-brief-1' });
    (insertedChain.insert as ReturnType<typeof vi.fn>).mockImplementation(
      (payload: Record<string, unknown>) => {
        insertedPayload = payload;
        return insertedChain;
      },
    );

    let plansSelectCalls = 0;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-pro', organizations: { tier: 'pro_coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-pro' });
      if (table === 'plans') {
        plansSelectCalls += 1;
        // First call → fetch opponent profile (a single row).
        if (plansSelectCalls === 1) return buildChain(OPPONENT_PROFILE);
        // Subsequent plans queries (coaching signature, etc.) resolve to empty.
        if (plansSelectCalls === 2) return buildChain([]);
        // Insert call.
        return insertedChain;
      }
      if (table === 'observations') return buildChain([]);
      if (table === 'coach_drill_signals') return buildChain([]);
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(happyAIResult());

    const res = await pregameBriefPost(makeRequest());

    expect(res.status).toBe(200);
    expect(mockCallAIWithJSON).toHaveBeenCalledTimes(1);
    const aiArgs = mockCallAIWithJSON.mock.calls[0][0];
    expect(aiArgs.orgId).toBe('org-pro');
    expect(aiArgs.coachId).toBe('coach-1');
    expect(aiArgs.teamId).toBe('team-1');
    // No provider hardcoding — existing 'custom' interactionType (multi-provider
    // failover wrapper from 0012 still applies).
    expect(aiArgs.interactionType).toBe('custom');
    // System+user prompts are non-empty strings (the prompt-shape test pins their
    // contents; here we only assert the route assembled them).
    expect(typeof aiArgs.systemPrompt).toBe('string');
    expect(typeof aiArgs.userPrompt).toBe('string');
    expect(aiArgs.systemPrompt.length).toBeGreaterThan(20);
    expect(aiArgs.userPrompt.length).toBeGreaterThan(40);

    // ── Plan row: the four-key body + correct linkage; NO new minor field ──────
    expect(insertedPayload).not.toBeNull();
    expect(insertedPayload!.type).toBe('pregame_brief');
    expect(insertedPayload!.team_id).toBe('team-1');
    expect(insertedPayload!.coach_id).toBe('coach-1');
    const cs = insertedPayload!.content_structured as Record<string, unknown>;
    expect(Object.keys(cs).sort()).toEqual(['coach_note', 'huddle_points', 'opponent_read', 'our_edge']);

    // ── COPPA: the persisted row introduces NO per-player / DOB / parent field.
    const allKeys = Object.keys(insertedPayload!);
    for (const banned of ['date_of_birth', 'parent_name', 'parent_phone', 'medical_notes']) {
      expect(allKeys).not.toContain(banned);
    }
  });
});

// ─── Bad input ──────────────────────────────────────────────────────────────────

describe('POST /api/ai/pregame-brief — input validation', () => {
  it('returns 400 when teamId is missing', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'pro_coach' } });
      return buildChain(null);
    });
    const res = await pregameBriefPost(
      makeRequest({ opponentProfilePlanId: 'plan-opp-1' }),
    );
    expect(res.status).toBe(400);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns 400 when opponentProfilePlanId is missing', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'pro_coach' } });
      return buildChain(null);
    });
    const res = await pregameBriefPost(makeRequest({ teamId: 'team-1' }));
    expect(res.status).toBe(400);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});
