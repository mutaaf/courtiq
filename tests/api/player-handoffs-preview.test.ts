/**
 * Ticket 0059 — POST /api/player-handoffs/generate-preview.
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user (before any DB read).
 *  - 404 when the team belongs to a different coach.
 *  - 404 when a playerId does NOT belong to the named team.
 *  - cold-start drop: a player with <5 observations is silently dropped into
 *    `dropped` with reason 'insufficient_observations'.
 *  - happy path: returns one preview per eligible player with the expected
 *    `{ playerId, playerFirstName, cardBody }` shape.
 *  - tier gate: a free coach gets 402 with the upgrade payload before any
 *    DB read of players or observations.
 *
 * Mock strategy mirrors tests/ai/pregame-brief.test.ts: chainable in-memory
 * supabase + a mocked callAIWithJSON.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
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

vi.mock('@/lib/ai/client', () => ({
  callAIWithJSON: mockCallAIWithJSON,
}));

import { POST } from '@/app/api/player-handoffs/generate-preview/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = 'coach-1';
const TEAM_ID = 'team-1';
const ORG_ID = 'org-1';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/player-handoffs/generate-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
  mockCallAIWithJSON.mockReset();
});

describe('POST /api/player-handoffs/generate-preview (ticket 0059)', () => {
  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(makeRequest({ teamId: TEAM_ID, playerIds: ['p-1'] }));
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 402 for a free coach with the upgrade payload before any team read', async () => {
    setAuthUser();
    mockFromFn
      // coaches lookup → free tier
      .mockReturnValueOnce(
        buildChain({ org_id: ORG_ID, full_name: 'Maya Lee', organizations: { tier: 'free' } }),
      );
    const res = await POST(makeRequest({ teamId: TEAM_ID, playerIds: ['p-1'] }));
    expect(res.status).toBe(402);
    const body = (await res.json()) as { upgrade?: boolean; feature?: string };
    expect(body.upgrade).toBe(true);
    expect(body.feature).toBe('feature_player_handoff');
    // AI was never called.
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns 404 when the team belongs to a different coach', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(
        buildChain({ org_id: ORG_ID, full_name: 'Maya Lee', organizations: { tier: 'coach' } }),
      )
      // team_coaches membership → null
      .mockReturnValueOnce(buildChain(null));
    const res = await POST(makeRequest({ teamId: TEAM_ID, playerIds: ['p-1'] }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when a player does not belong to the named team', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(
        buildChain({ org_id: ORG_ID, full_name: 'Maya Lee', organizations: { tier: 'coach' } }),
      )
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))
      .mockReturnValueOnce(
        buildChain({
          id: TEAM_ID,
          name: 'Tigers',
          age_group: '10-and-under',
          org_id: ORG_ID,
          season: '2025 fall',
          sports: { name: 'basketball' },
        }),
      )
      // player belongs to a different team
      .mockReturnValueOnce(
        buildChain({ id: 'p-1', team_id: 'other-team', name: 'Eli Smith', age_group: '10-and-under', jersey_number: 7 }),
      );

    const res = await POST(makeRequest({ teamId: TEAM_ID, playerIds: ['p-1'] }));
    expect(res.status).toBe(404);
  });

  it('cold-start drop: a player with fewer than 5 observations is silently dropped', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(
        buildChain({ org_id: ORG_ID, full_name: 'Maya Lee', organizations: { tier: 'coach' } }),
      )
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))
      .mockReturnValueOnce(
        buildChain({
          id: TEAM_ID,
          name: 'Tigers',
          age_group: '10-and-under',
          org_id: ORG_ID,
          season: '2025 fall',
          sports: { name: 'basketball' },
        }),
      )
      .mockReturnValueOnce(
        buildChain({ id: 'p-1', team_id: TEAM_ID, name: 'Eli Smith', age_group: '10-and-under', jersey_number: 7 }),
      )
      // only 3 observations — below the cold-start floor (5)
      .mockReturnValueOnce(
        buildChain([
          { category: 'Effort', sentiment: 'positive', text: 'hustled' },
          { category: 'IQ', sentiment: 'positive', text: 'good read' },
          { category: 'Defense', sentiment: 'needs-work', text: 'closeouts' },
        ]),
      );

    const res = await POST(makeRequest({ teamId: TEAM_ID, playerIds: ['p-1'] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      previews: unknown[];
      dropped: Array<{ playerId: string; reason: string }>;
    };
    expect(body.previews).toEqual([]);
    expect(body.dropped).toEqual([{ playerId: 'p-1', reason: 'insufficient_observations' }]);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('happy path: returns one preview per eligible player with the expected shape', async () => {
    setAuthUser();
    mockCallAIWithJSON.mockResolvedValue({
      text: '',
      parsed: {
        card_body:
          "Eli responds well to short, specific cues. One drill that landed for me: stationary form-shoot.",
      },
      tokensIn: 100,
      tokensOut: 50,
      latencyMs: 200,
      interactionId: 'interaction-1',
    });

    mockFromFn
      .mockReturnValueOnce(
        buildChain({ org_id: ORG_ID, full_name: 'Maya Lee', organizations: { tier: 'coach' } }),
      )
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))
      .mockReturnValueOnce(
        buildChain({
          id: TEAM_ID,
          name: 'Tigers',
          age_group: '10-and-under',
          org_id: ORG_ID,
          season: '2025 fall',
          sports: { name: 'basketball' },
        }),
      )
      .mockReturnValueOnce(
        buildChain({ id: 'p-1', team_id: TEAM_ID, name: 'Eli Smith', age_group: '10-and-under', jersey_number: 7 }),
      )
      .mockReturnValueOnce(
        buildChain([
          { category: 'Effort', sentiment: 'positive', text: 'hustled hard' },
          { category: 'IQ', sentiment: 'positive', text: 'read the press' },
          { category: 'Effort', sentiment: 'positive', text: 'first to drill' },
          { category: 'Defense', sentiment: 'needs-work', text: 'closeouts late' },
          { category: 'Defense', sentiment: 'needs-work', text: 'left-hand finishing' },
          { category: 'IQ', sentiment: 'positive', text: 'good help defense' },
        ]),
      );

    const res = await POST(makeRequest({ teamId: TEAM_ID, playerIds: ['p-1'] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      previews: Array<{ playerId: string; playerFirstName: string; cardBody: string }>;
      dropped: unknown[];
    };
    expect(body.previews).toHaveLength(1);
    expect(body.previews[0].playerId).toBe('p-1');
    expect(body.previews[0].playerFirstName).toBe('Eli');
    expect(body.previews[0].cardBody.length).toBeGreaterThan(20);
    expect(body.dropped).toEqual([]);
    expect(mockCallAIWithJSON).toHaveBeenCalledTimes(1);
    // The AI call MUST pass through orgId for quota + provider routing
    // (AGENTS.md rule 4).
    expect(mockCallAIWithJSON.mock.calls[0][0].orgId).toBe(ORG_ID);
    expect(mockCallAIWithJSON.mock.calls[0][0].interactionType).toBe(
      'generate_player_handoff_card',
    );
  });
});
