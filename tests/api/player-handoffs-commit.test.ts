/**
 * Ticket 0059 — POST /api/player-handoffs/commit.
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user.
 *  - 404 when the team belongs to a different coach.
 *  - happy path inserts one player_handoffs row per checked player.
 *  - idempotent: a second commit reuses the existing handoff id rather than
 *    minting a second row.
 *  - planted contact info in the cardBody is stripped before persist (the
 *    server is the only honest authority on user-supplied prose; the strip
 *    helper from 0056 is reused).
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

import { POST } from '@/app/api/player-handoffs/commit/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const captured: { lastInsert?: unknown } = {};
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn((row: unknown) => {
      captured.lastInsert = row;
      return chain;
    }),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
    _captured: captured,
  };
  return chain;
}

const COACH_ID = 'coach-1';
const TEAM_ID = 'team-1';
const ORG_ID = 'org-1';
const PLAYER_ID = 'p-1';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/player-handoffs/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
});

describe('POST /api/player-handoffs/commit (ticket 0059)', () => {
  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(
      makeRequest({
        teamId: TEAM_ID,
        playerIds: [PLAYER_ID],
        previews: [{ playerId: PLAYER_ID, cardBody: 'short note' }],
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the team belongs to a different coach', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(
        buildChain({ org_id: ORG_ID, organizations: { tier: 'coach' } }),
      )
      .mockReturnValueOnce(buildChain(null)); // team_coaches → null
    const res = await POST(
      makeRequest({
        teamId: TEAM_ID,
        playerIds: [PLAYER_ID],
        previews: [{ playerId: PLAYER_ID, cardBody: 'short note' }],
      }),
    );
    expect(res.status).toBe(404);
  });

  it('happy path inserts one handoff row per player and returns committed ids', async () => {
    setAuthUser();
    const insertedChain = buildChain({ id: 'handoff-1' });
    mockFromFn
      // coaches
      .mockReturnValueOnce(
        buildChain({ org_id: ORG_ID, organizations: { tier: 'coach' } }),
      )
      // team_coaches
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))
      // teams
      .mockReturnValueOnce(buildChain({ id: TEAM_ID, org_id: ORG_ID, season: '2025 fall' }))
      // players (per player loop)
      .mockReturnValueOnce(buildChain({ id: PLAYER_ID, team_id: TEAM_ID }))
      // existing player_handoffs lookup → null (no existing row)
      .mockReturnValueOnce(buildChain(null))
      // insert player_handoffs
      .mockReturnValueOnce(insertedChain);

    const res = await POST(
      makeRequest({
        teamId: TEAM_ID,
        playerIds: [PLAYER_ID],
        previews: [{ playerId: PLAYER_ID, cardBody: 'Eli responds well to short cues.' }],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { committed: Array<{ playerId: string; handoffId: string }> };
    expect(body.committed).toEqual([{ playerId: PLAYER_ID, handoffId: 'handoff-1' }]);

    const insertChain = insertedChain as unknown as { _captured: { lastInsert?: Record<string, unknown> } };
    const insertedRow = insertChain._captured.lastInsert!;
    expect(insertedRow.source_coach_id).toBe(COACH_ID);
    expect(insertedRow.source_player_id).toBe(PLAYER_ID);
    expect(insertedRow.source_team_id).toBe(TEAM_ID);
    expect(insertedRow.org_id).toBe(ORG_ID);
    expect(insertedRow.season_label).toBe('2025 fall');
    expect(insertedRow.card_body).toBe('Eli responds well to short cues.');
  });

  it('idempotent: second commit returns the EXISTING handoff id', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(
        buildChain({ org_id: ORG_ID, organizations: { tier: 'coach' } }),
      )
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))
      .mockReturnValueOnce(buildChain({ id: TEAM_ID, org_id: ORG_ID, season: '2025 fall' }))
      .mockReturnValueOnce(buildChain({ id: PLAYER_ID, team_id: TEAM_ID }))
      // existing player_handoffs row → idempotent reuse
      .mockReturnValueOnce(buildChain({ id: 'handoff-existing' }));

    const res = await POST(
      makeRequest({
        teamId: TEAM_ID,
        playerIds: [PLAYER_ID],
        previews: [{ playerId: PLAYER_ID, cardBody: 'whatever new body' }],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { committed: Array<{ playerId: string; handoffId: string }> };
    expect(body.committed).toEqual([
      { playerId: PLAYER_ID, handoffId: 'handoff-existing' },
    ]);
  });

  it('strips planted email / URL / long-digit runs from cardBody before insert', async () => {
    setAuthUser();
    const insertedChain = buildChain({ id: 'handoff-2' });
    mockFromFn
      .mockReturnValueOnce(
        buildChain({ org_id: ORG_ID, organizations: { tier: 'coach' } }),
      )
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))
      .mockReturnValueOnce(buildChain({ id: TEAM_ID, org_id: ORG_ID, season: '2025 fall' }))
      .mockReturnValueOnce(buildChain({ id: PLAYER_ID, team_id: TEAM_ID }))
      .mockReturnValueOnce(buildChain(null))
      .mockReturnValueOnce(insertedChain);

    const planted =
      'Eli is great. Email me at coach@example.com or call 4155551234. See https://evil.example/x';

    const res = await POST(
      makeRequest({
        teamId: TEAM_ID,
        playerIds: [PLAYER_ID],
        previews: [{ playerId: PLAYER_ID, cardBody: planted }],
      }),
    );
    expect(res.status).toBe(200);

    const insertChain = insertedChain as unknown as { _captured: { lastInsert?: Record<string, unknown> } };
    const insertedRow = insertChain._captured.lastInsert!;
    const persisted = insertedRow.card_body as string;
    expect(persisted).not.toMatch(/coach@example\.com/);
    expect(persisted).not.toMatch(/4155551234/);
    expect(persisted).not.toMatch(/https:\/\/evil\.example/);
    expect(persisted).toContain('[contact removed]');
    expect(persisted).toContain('[number removed]');
    expect(persisted).toContain('[link removed]');
  });

  it('returns 402 for a free coach (defense in depth on the source-coach path)', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(
      buildChain({ org_id: ORG_ID, organizations: { tier: 'free' } }),
    );
    const res = await POST(
      makeRequest({
        teamId: TEAM_ID,
        playerIds: [PLAYER_ID],
        previews: [{ playerId: PLAYER_ID, cardBody: 'short note' }],
      }),
    );
    expect(res.status).toBe(402);
  });
});
