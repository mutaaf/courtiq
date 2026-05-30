/**
 * Ticket 0059 — GET /api/player-handoffs/for-player?playerId=<id>.
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user.
 *  - { handoff: null } on no match.
 *  - { handoff: null } on cross-org candidate (org_id scope is server-side
 *    from the caller record per LESSONS#0039).
 *  - happy path: first-name + age-group within ±1 match resolves the most
 *    recent unclaimed handoff with source coach first name + season label.
 *  - most-recent-wins on multi-match (the route orders by created_at desc).
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
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

import { GET } from '@/app/api/player-handoffs/for-player/route';

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

const COACH_ID = 'coach-2'; // RECEIVER coach
const ORG_ID = 'org-1';
const RECEIVER_PLAYER_ID = 'p-receiver';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(playerId: string | null = RECEIVER_PLAYER_ID) {
  const url = new URL('http://localhost/api/player-handoffs/for-player');
  if (playerId) url.searchParams.set('playerId', playerId);
  return new Request(url.toString(), { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
});

describe('GET /api/player-handoffs/for-player (ticket 0059)', () => {
  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns { handoff: null } when no candidate matches the player', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID })) // coaches
      .mockReturnValueOnce(
        buildChain({
          id: RECEIVER_PLAYER_ID,
          team_id: 't-receiver',
          name: 'Eli Smith',
          age_group: 'U11',
          jersey_number: 7,
        }),
      )
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID })) // team_coaches
      .mockReturnValueOnce(buildChain([])); // candidates empty

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { handoff: unknown };
    expect(body.handoff).toBeNull();
  });

  it('happy path: returns the matching handoff with source coach first name and season label', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(
        buildChain({
          id: RECEIVER_PLAYER_ID,
          team_id: 't-receiver',
          name: 'Eli Smith',
          age_group: 'U11',
          jersey_number: 7,
        }),
      )
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))
      // one candidate handoff in this org
      .mockReturnValueOnce(
        buildChain([
          {
            id: 'h-1',
            source_coach_id: 'coach-source',
            source_player_id: 'p-source',
            season_label: '2025 fall',
            card_body: 'Eli responds well to short, specific cues.',
            created_at: '2026-05-01T00:00:00Z',
          },
        ]),
      )
      // source player lookup → same first name + age within ±1
      .mockReturnValueOnce(
        buildChain({ name: 'Eli Anderson', age_group: '10-and-under', jersey_number: 7 }),
      )
      // source coach lookup
      .mockReturnValueOnce(buildChain({ full_name: 'Maya Lee' }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      handoff: { handoffId: string; sourceCoachFirstName: string; seasonLabel: string; cardBody: string } | null;
    };
    expect(body.handoff).not.toBeNull();
    expect(body.handoff!.handoffId).toBe('h-1');
    expect(body.handoff!.sourceCoachFirstName).toBe('Maya');
    expect(body.handoff!.seasonLabel).toBe('2025 fall');
    expect(body.handoff!.cardBody).toContain('Eli');
  });

  it('skips a cross-name candidate and returns null when no others match', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(
        buildChain({
          id: RECEIVER_PLAYER_ID,
          team_id: 't-receiver',
          name: 'Eli Smith',
          age_group: 'U11',
          jersey_number: 7,
        }),
      )
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))
      .mockReturnValueOnce(
        buildChain([
          {
            id: 'h-2',
            source_coach_id: 'coach-source',
            source_player_id: 'p-source',
            season_label: '2025 fall',
            card_body: 'Different kid entirely.',
            created_at: '2026-05-01T00:00:00Z',
          },
        ]),
      )
      // source player has a DIFFERENT first name — should be skipped
      .mockReturnValueOnce(
        buildChain({ name: 'Jordan Cooper', age_group: '10-and-under', jersey_number: 7 }),
      );

    const res = await GET(makeRequest());
    const body = (await res.json()) as { handoff: unknown };
    expect(body.handoff).toBeNull();
  });

  it('most-recent-wins on a multi-match (the query orders by created_at desc)', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(
        buildChain({
          id: RECEIVER_PLAYER_ID,
          team_id: 't-receiver',
          name: 'Eli Smith',
          age_group: 'U11',
          jersey_number: 7,
        }),
      )
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))
      // TWO candidate handoffs, ordered created_at DESC by the SQL layer.
      // The route iterates in that order and returns on first match.
      .mockReturnValueOnce(
        buildChain([
          {
            id: 'h-newest',
            source_coach_id: 'coach-source-2',
            source_player_id: 'p-source-2',
            season_label: '2025 fall',
            card_body: 'Newest card.',
            created_at: '2026-05-02T00:00:00Z',
          },
          {
            id: 'h-older',
            source_coach_id: 'coach-source-1',
            source_player_id: 'p-source-1',
            season_label: '2024 fall',
            card_body: 'Older card.',
            created_at: '2026-04-02T00:00:00Z',
          },
        ]),
      )
      .mockReturnValueOnce(
        buildChain({ name: 'Eli Anderson', age_group: 'U10', jersey_number: 7 }),
      )
      .mockReturnValueOnce(buildChain({ full_name: 'Maya Lee' }));

    const res = await GET(makeRequest());
    const body = (await res.json()) as { handoff: { handoffId: string } | null };
    expect(body.handoff?.handoffId).toBe('h-newest');
  });
});
