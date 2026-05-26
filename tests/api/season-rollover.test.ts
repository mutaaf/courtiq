/**
 * Ticket 0036 — POST /api/season/rollover.
 *
 * "Start next season with this team" creates the next season for the team:
 * advances the season label, resets current_week, and carries the RETURNING
 * (active) roster forward — re-creating each active player on the new season with
 * prior_player_id pointing at the finished-season player (the 0034 mechanism).
 *
 * Acceptance criteria → tests:
 *  AC3: new-season players exist, current_week reset, each carried player's
 *       prior_player_id points at its prior row; INACTIVE players are NOT carried.
 *  AC4: team-scoped + ownership-checked server-side — a cross-org teamId gets 404
 *       and writes NOTHING (no team update, no player inserts).
 *  AC5: the inserted player rows contain ONLY existing columns + prior_player_id;
 *       no new minor-scoped field is smuggled in (COPPA).
 *  AC8: coach-private — unauthenticated callers get 401 before any read/write.
 *
 * Strategy mirrors tests/ai/parent-report-cross-season.test.ts: a chainable
 * in-memory Supabase mock. .test.ts NOT .spec.ts (vitest excludes the spec glob —
 * LESSONS.md 2026-05-20). The route reads a JSON body, so it is invoked with its
 * real Request signature (LESSONS.md 2026-05-21).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

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

import { POST } from '@/app/api/season/rollover/route';

// ─── Chainable mock helper ─────────────────────────────────────────────────────

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
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-1';
const OTHER_ORG_ID = 'org-2';
const TEAM_ID = 'team-1';
const COACH_ID = 'coach-1';

const FINISHED_TEAM = {
  id: TEAM_ID,
  org_id: ORG_ID,
  season: 'Spring 2026',
  season_weeks: 10,
  current_week: 10,
};

// Two active players carried forward + one inactive that must NOT be carried.
const ACTIVE_PLAYERS = [
  {
    id: 'player-a',
    team_id: TEAM_ID,
    name: 'Devon Hayes',
    jersey_number: 7,
    position: 'Guard',
    is_active: true,
  },
  {
    id: 'player-b',
    team_id: TEAM_ID,
    name: 'Maya Johnson',
    jersey_number: 11,
    position: 'Forward',
    is_active: true,
  },
];

function setAuthUser(id = COACH_ID) {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function makeRequest(teamId = TEAM_ID, newSeasonLabel = 'Fall 2026') {
  return new Request('http://localhost/api/season/rollover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId, newSeasonLabel }),
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/season/rollover (ticket 0036)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC8: unauthenticated → 401, before any read/write.
  it('returns 401 when there is no authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  // AC4: a cross-org teamId is 404 and writes NOTHING.
  it('returns 404 and writes nothing for a team the caller org does not own', async () => {
    setAuthUser();
    const teamChain = buildChain({ ...FINISHED_TEAM, org_id: OTHER_ORG_ID });
    const playersInsertChain = buildChain([]);
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID })) // coaches (caller org)
      .mockReturnValueOnce(teamChain)                       // teams (foreign org)
      .mockReturnValue(playersInsertChain);                // anything after must not run

    const res = await POST(makeRequest());
    expect(res.status).toBe(404);

    // No team update and no player insert ever ran for the foreign team.
    expect(teamChain.update).not.toHaveBeenCalled();
    expect(playersInsertChain.insert).not.toHaveBeenCalled();
    // Exactly two reads: coaches, then teams — then it bailed.
    expect(mockFromFn).toHaveBeenCalledTimes(2);
  });

  // AC3: roster carried forward, current_week reset, prior_player_id set; inactive excluded.
  it('advances the season, resets current_week, and carries the active roster with prior_player_id', async () => {
    setAuthUser();
    const teamUpdateChain = buildChain({ ...FINISHED_TEAM, season: 'Fall 2026', current_week: 1 });
    const playersReadChain = buildChain(ACTIVE_PLAYERS);
    const playersInsertChain = buildChain(
      ACTIVE_PLAYERS.map((p) => ({ ...p, id: `new-${p.id}`, prior_player_id: p.id }))
    );
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID })) // coaches
      .mockReturnValueOnce(buildChain(FINISHED_TEAM))       // teams (owned)
      .mockReturnValueOnce(teamUpdateChain)                 // teams update (season + current_week)
      .mockReturnValueOnce(playersReadChain)                // players read (active roster)
      .mockReturnValueOnce(playersInsertChain);             // players insert (new season)

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // The team's season label was advanced and current_week reset to 1.
    expect(teamUpdateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ season: 'Fall 2026', current_week: 1 })
    );

    // The active roster was re-created, each pointing at its prior-season row.
    const insertArg = (playersInsertChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(Array.isArray(insertArg)).toBe(true);
    expect(insertArg).toHaveLength(2);
    const byName = Object.fromEntries(insertArg.map((r) => [r.name, r]));
    expect(byName['Devon Hayes'].prior_player_id).toBe('player-a');
    expect(byName['Maya Johnson'].prior_player_id).toBe('player-b');
    // Carried name/jersey/position the coach already entered.
    expect(byName['Devon Hayes'].jersey_number).toBe(7);
    expect(byName['Devon Hayes'].position).toBe('Guard');
    // All carried rows are on the same team and active.
    for (const row of insertArg) {
      expect(row.team_id).toBe(TEAM_ID);
      expect(row.is_active).toBe(true);
    }
  });

  it('does NOT carry inactive players forward', async () => {
    setAuthUser();
    const teamUpdateChain = buildChain({ ...FINISHED_TEAM });
    // The route filters is_active=true server-side; the read mock returns only
    // active rows (mirrors the eq('is_active', true) the route applies). We assert
    // the insert payload length equals the active count, never the full roster.
    const playersReadChain = buildChain(ACTIVE_PLAYERS);
    const playersInsertChain = buildChain([]);
    const readEq = playersReadChain.eq as ReturnType<typeof vi.fn>;
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain(FINISHED_TEAM))
      .mockReturnValueOnce(teamUpdateChain)
      .mockReturnValueOnce(playersReadChain)
      .mockReturnValueOnce(playersInsertChain);

    await POST(makeRequest());

    // The roster read must be scoped to active players only.
    expect(readEq).toHaveBeenCalledWith('is_active', true);
    const insertArg = (playersInsertChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as unknown[];
    expect(insertArg).toHaveLength(ACTIVE_PLAYERS.length);
  });

  // AC5: inserted rows contain ONLY existing columns + prior_player_id (COPPA).
  it('inserts only existing player columns + prior_player_id — no new minor field', async () => {
    setAuthUser();
    const playersInsertChain = buildChain([]);
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: ORG_ID }))
      .mockReturnValueOnce(buildChain(FINISHED_TEAM))
      .mockReturnValueOnce(buildChain({ ...FINISHED_TEAM }))
      .mockReturnValueOnce(buildChain(ACTIVE_PLAYERS))
      .mockReturnValueOnce(playersInsertChain);

    await POST(makeRequest());

    const insertArg = (playersInsertChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<Record<string, unknown>>;
    const ALLOWED = new Set([
      'team_id',
      'name',
      'nickname',
      'age_group',
      'position',
      'jersey_number',
      'is_active',
      'prior_player_id',
    ]);
    // No banned descriptive/derived minor fields ever appear in the carry payload.
    const BANNED = ['similarity', 'match_score', 'dob_match', 'name_match', 'biometric', 'photo_match', 'confidence'];
    for (const row of insertArg) {
      for (const key of Object.keys(row)) {
        expect(ALLOWED.has(key)).toBe(true);
        expect(BANNED).not.toContain(key);
      }
      // The carry copies nothing about the minor that wasn't already there: no
      // date_of_birth, medical_notes, parent_* carried onto the new season row.
      expect(row).not.toHaveProperty('date_of_birth');
      expect(row).not.toHaveProperty('medical_notes');
      expect(row).not.toHaveProperty('parent_email');
    }
  });

  it('requires teamId and newSeasonLabel (400 when missing)', async () => {
    setAuthUser();
    mockFromFn.mockReturnValue(buildChain(null));
    const res = await POST(
      new Request('http://localhost/api/season/rollover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: TEAM_ID }),
      })
    );
    expect(res.status).toBe(400);
  });
});
