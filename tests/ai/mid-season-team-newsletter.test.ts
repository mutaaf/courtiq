/**
 * Ticket 0043 — POST /api/ai/mid-season-team-newsletter
 *
 * Backend behaviours under test (one per acceptance-criteria box where applicable):
 *  (A) no auth → 401 and no DB read.
 *  (B) team belongs to a different org → 404 and the AI is never called.
 *  (C) tier gate is SERVER-side via the EXISTING `parent_sharing` feature key:
 *      free → 402 { upgrade: true, feature: 'parent_sharing' }; coach → 200.
 *  (D) below-threshold (< 6 observations in the last 6 weeks) → 200 { newsletter: null }
 *      and the AI is NEVER called (mirrors the 0023 short-circuit philosophy).
 *  (E) happy path: persists a `plans` row of type 'mid_season_team_newsletter' with
 *      the five-key content_structured body, calls callAIWithJSON with the
 *      resolved orgId, and the interactionType is the existing 'custom'
 *      (no provider hardcoding).
 *  (F) COPPA: the insert payload has NO new minor field; only the five-key
 *      newsletter and the standard team/coach linkage that every plan already
 *      carries.
 *
 * Strategy mirrors tests/ai/pregame-brief.test.ts: @/lib/supabase/server is a
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

import { POST as midSeasonPost } from '@/app/api/ai/mid-season-team-newsletter/route';

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

// Six positive obs across the last 6 weeks — clears the route's threshold.
function manyObservations() {
  const now = Date.now();
  return Array.from({ length: 8 }, (_, i) => ({
    category: i % 2 === 0 ? 'Defense' : 'IQ',
    sentiment: i % 3 === 0 ? 'needs-work' : 'positive',
    created_at: new Date(now - (i + 1) * 86_400_000 * 4).toISOString(),
  }));
}

function happyAIResult() {
  return {
    parsed: {
      headline: 'Six weeks in: ball movement is starting to land.',
      arc_summary:
        'We have built around moving the ball and crashing the boards. The last two practices have shown those reps starting to translate.',
      team_strengths: [
        'The team is sharing the ball more on the second pass.',
        'Effort on rebounds is showing up in the second half of practice.',
      ],
      focus_areas: [
        'Closing out without fouling.',
        'Talking on defense in transition.',
      ],
      coach_voice_quote:
        'When we move the ball, good things happen — that has been the through line of this stretch.',
    },
    interactionId: 'ai-int-newsletter-1',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
  mockBuildAIContext.mockResolvedValue({
    teamName: 'Tigers',
    sportName: 'basketball',
    ageGroup: '11-13',
    seasonWeek: 6,
  });
});

function makeRequest(body: unknown = { teamId: 'team-1' }) {
  return new Request('http://localhost/api/ai/mid-season-team-newsletter', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── A. no auth → 401 ───────────────────────────────────────────────────────────

describe('POST /api/ai/mid-season-team-newsletter — auth', () => {
  it('returns 401 and reads nothing when unauthenticated', async () => {
    setNoAuth();

    const res = await midSeasonPost(makeRequest());

    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── C. tier gating server-side (uses EXISTING parent_sharing feature key) ────

describe('POST /api/ai/mid-season-team-newsletter — tier gate', () => {
  it('returns 402 { upgrade: true, feature: "parent_sharing" } for a free coach and never calls AI', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'free' } });
      return buildChain(null);
    });

    const res = await midSeasonPost(makeRequest());

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.upgrade).toBe(true);
    // The route returns the tier-key string VERBATIM so the client can map the
    // 402 to the same upgrade gate the surface uses (LESSONS#0023).
    expect(body.feature).toBe('parent_sharing');
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns 200 for a coach-tier coach (gate passes)', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-1' });
      if (table === 'observations') return buildChain(manyObservations());
      if (table === 'plans') return buildChain([]);
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(happyAIResult());

    const res = await midSeasonPost(makeRequest());

    expect(res.status).toBe(200);
  });
});

// ─── B. team-scoped (cross-org teamId → 404) ────────────────────────────────────

describe('POST /api/ai/mid-season-team-newsletter — team ownership', () => {
  it('returns 404 for a teamId the caller org does not own and never calls AI', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'coach' } });
      if (table === 'teams') return buildChain({ id: 'team-other', org_id: 'org-999' });
      return buildChain(null);
    });

    const res = await midSeasonPost(makeRequest({ teamId: 'team-other' }));

    expect(res.status).toBe(404);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── D. below-threshold short-circuit ───────────────────────────────────────────

describe('POST /api/ai/mid-season-team-newsletter — below threshold', () => {
  it('returns 200 { newsletter: null } and skips the AI call when there are too few observations', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-1' });
      // Only 3 obs across the window — below the route's threshold (>= 6).
      if (table === 'observations') {
        return buildChain([
          { category: 'IQ', sentiment: 'positive', created_at: new Date().toISOString() },
          { category: 'Effort', sentiment: 'positive', created_at: new Date().toISOString() },
          { category: 'Defense', sentiment: 'needs-work', created_at: new Date().toISOString() },
        ]);
      }
      return buildChain(null);
    });

    const res = await midSeasonPost(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newsletter).toBeNull();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── E. Happy path — persists mid_season_team_newsletter + calls AI with orgId ─

describe('POST /api/ai/mid-season-team-newsletter — happy path', () => {
  it('persists a mid_season_team_newsletter plan with the five-key body and calls AI with the caller orgId', async () => {
    setAuthUser('coach-1');

    let insertedPayload: Record<string, unknown> | null = null;
    const insertedChain = buildChain({ id: 'plan-newsletter-1', type: 'mid_season_team_newsletter' });
    (insertedChain.insert as ReturnType<typeof vi.fn>).mockImplementation(
      (payload: Record<string, unknown>) => {
        insertedPayload = payload;
        return insertedChain;
      },
    );

    let plansSelectCalls = 0;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-coach', organizations: { tier: 'coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-coach' });
      if (table === 'observations') return buildChain(manyObservations());
      if (table === 'plans') {
        plansSelectCalls += 1;
        // First call: coaching-signature plans read (best-effort, empty here).
        if (plansSelectCalls === 1) return buildChain([]);
        // Subsequent → the insert call.
        return insertedChain;
      }
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(happyAIResult());

    const res = await midSeasonPost(makeRequest());

    expect(res.status).toBe(200);
    expect(mockCallAIWithJSON).toHaveBeenCalledTimes(1);
    const aiArgs = mockCallAIWithJSON.mock.calls[0][0];
    expect(aiArgs.orgId).toBe('org-coach');
    expect(aiArgs.coachId).toBe('coach-1');
    expect(aiArgs.teamId).toBe('team-1');
    // No provider hardcoding — existing 'custom' interactionType.
    expect(aiArgs.interactionType).toBe('custom');
    expect(typeof aiArgs.systemPrompt).toBe('string');
    expect(typeof aiArgs.userPrompt).toBe('string');
    expect(aiArgs.systemPrompt.length).toBeGreaterThan(20);

    // ── Plan row: the five-key body + correct linkage; NO new minor field ────
    expect(insertedPayload).not.toBeNull();
    expect(insertedPayload!.type).toBe('mid_season_team_newsletter');
    expect(insertedPayload!.team_id).toBe('team-1');
    expect(insertedPayload!.coach_id).toBe('coach-1');
    const cs = insertedPayload!.content_structured as Record<string, unknown>;
    expect(Object.keys(cs).sort()).toEqual([
      'arc_summary',
      'coach_voice_quote',
      'focus_areas',
      'headline',
      'team_strengths',
    ]);

    // ── COPPA: the persisted row introduces NO per-player / DOB / parent field.
    const payload = insertedPayload as unknown as Record<string, unknown>;
    const allKeys = Object.keys(payload);
    expect(allKeys).not.toContain('date_of_birth');
    expect(allKeys).not.toContain('parent_name');
    expect(allKeys).not.toContain('parent_phone');
    expect(allKeys).not.toContain('medical_notes');
    // player_id may show up on existing plan types but the newsletter is
    // TEAM-level; the insert must not set a player_id (or it may be absent
    // entirely, equivalent to nullable on the Plan type).
    expect(payload.player_id === undefined || payload.player_id === null).toBe(true);

    // Response body shape — both the plan id and the structured content come back.
    const body = await res.json();
    expect(body.planId).toBe('plan-newsletter-1');
    expect(body.content_structured.headline).toBeTruthy();
  });
});

// ─── Bad input ──────────────────────────────────────────────────────────────────

describe('POST /api/ai/mid-season-team-newsletter — input validation', () => {
  it('returns 400 when teamId is missing', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'coach' } });
      return buildChain(null);
    });
    const res = await midSeasonPost(makeRequest({}));
    expect(res.status).toBe(400);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});
