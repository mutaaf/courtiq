/**
 * Ticket 0059 — POST /api/player-handoffs/[handoffId]/claim.
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user.
 *  - 404 when the handoff lives in a different org (cross-org access is
 *    impossible by construction — the org scope comes from the caller's
 *    record, never the URL).
 *  - 409 on a second claim by the same coach (idempotent re-claim returns
 *    the already-stamped claimed_player_id).
 *  - happy path stamps the row (claimed_by_coach_id, claimed_at,
 *    claimed_player_id) AND writes a row into the existing player_notes
 *    table (no new column on players — COPPA).
 *  - 404 when the receiving playerId belongs to another coach.
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

import { POST } from '@/app/api/player-handoffs/[handoffId]/claim/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const captured: { lastInsert?: unknown; lastUpdate?: unknown } = {};
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn((row: unknown) => {
      captured.lastInsert = row;
      return chain;
    }),
    update: vi.fn((row: unknown) => {
      captured.lastUpdate = row;
      return chain;
    }),
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

const COACH_ID = 'coach-2';
const ORG_ID = 'org-1';
const HANDOFF_ID = 'h-1';
const PLAYER_ID = 'p-receiver';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/player-handoffs/${HANDOFF_ID}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function paramsArg() {
  return { params: Promise.resolve({ handoffId: HANDOFF_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
});

describe('POST /api/player-handoffs/[handoffId]/claim (ticket 0059)', () => {
  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(makeRequest({ playerId: PLAYER_ID }), paramsArg());
    expect(res.status).toBe(401);
  });

  it('returns 404 when the handoff is in a different org', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID })) // coaches
      .mockReturnValueOnce(
        buildChain({
          id: HANDOFF_ID,
          org_id: 'other-org',
          card_body: 'card',
          season_label: '2025 fall',
          source_coach_id: 'coach-source',
          claimed_by_coach_id: null,
          claimed_player_id: null,
        }),
      );
    const res = await POST(makeRequest({ playerId: PLAYER_ID }), paramsArg());
    expect(res.status).toBe(404);
  });

  it('returns 409 with the SAME claimed_player_id when the handoff is already claimed', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(
        buildChain({
          id: HANDOFF_ID,
          org_id: ORG_ID,
          card_body: 'card',
          season_label: '2025 fall',
          source_coach_id: 'coach-source',
          claimed_by_coach_id: 'someone',
          claimed_player_id: 'p-previous',
        }),
      );
    const res = await POST(makeRequest({ playerId: PLAYER_ID }), paramsArg());
    expect(res.status).toBe(409);
    const body = (await res.json()) as { handoffId: string; claimed_player_id: string };
    expect(body.handoffId).toBe(HANDOFF_ID);
    expect(body.claimed_player_id).toBe('p-previous');
  });

  it('returns 404 when the receiving playerId belongs to a different coach', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(
        buildChain({
          id: HANDOFF_ID,
          org_id: ORG_ID,
          card_body: 'card',
          season_label: '2025 fall',
          source_coach_id: 'coach-source',
          claimed_by_coach_id: null,
          claimed_player_id: null,
        }),
      )
      .mockReturnValueOnce(
        buildChain({ id: PLAYER_ID, team_id: 't-other', name: 'Eli Smith' }),
      )
      .mockReturnValueOnce(buildChain(null)); // team_coaches → null
    const res = await POST(makeRequest({ playerId: PLAYER_ID }), paramsArg());
    expect(res.status).toBe(404);
  });

  it('happy path stamps the handoff row and writes a player_notes entry (no new column on players)', async () => {
    setAuthUser();
    const notesChain = buildChain({});
    const updateChain = buildChain({});
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(
        buildChain({
          id: HANDOFF_ID,
          org_id: ORG_ID,
          card_body: 'Eli responds well to short cues.',
          season_label: '2025 fall',
          source_coach_id: 'coach-source',
          claimed_by_coach_id: null,
          claimed_player_id: null,
        }),
      )
      .mockReturnValueOnce(
        buildChain({ id: PLAYER_ID, team_id: 't-receiver', name: 'Eli Smith' }),
      )
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))
      .mockReturnValueOnce(buildChain({ full_name: 'Maya Lee' }))
      .mockReturnValueOnce(notesChain)
      .mockReturnValueOnce(updateChain);

    const res = await POST(makeRequest({ playerId: PLAYER_ID }), paramsArg());
    expect(res.status).toBe(200);

    // The body of the player_notes insert MUST include the handoff card body
    // and the source coach's first name as the provenance prefix.
    const notesCaptured = (notesChain as unknown as { _captured: { lastInsert?: Record<string, unknown> } })
      ._captured.lastInsert!;
    expect(notesCaptured.player_id).toBe(PLAYER_ID);
    expect(notesCaptured.team_id).toBe('t-receiver');
    expect(notesCaptured.coach_id).toBe(COACH_ID);
    expect(notesCaptured.content).toContain('Maya');
    expect(notesCaptured.content).toContain('Eli responds well to short cues.');

    // The handoff row update stamps the three claim columns.
    const updateCaptured = (updateChain as unknown as { _captured: { lastUpdate?: Record<string, unknown> } })
      ._captured.lastUpdate!;
    expect(updateCaptured.claimed_by_coach_id).toBe(COACH_ID);
    expect(typeof updateCaptured.claimed_at).toBe('string');
    expect(updateCaptured.claimed_player_id).toBe(PLAYER_ID);
  });
});
