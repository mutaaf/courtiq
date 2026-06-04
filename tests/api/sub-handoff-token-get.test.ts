/**
 * Ticket 0067 — GET /api/sub-handoff/[token].
 *
 * Public sub-facing payload. Resolves the observer token → the sub_handoffs
 * row → the session/team/sport context. Three optional sections (queued
 * drills, this-week focus, eyes-on-players) are OMITTED from the response
 * when their include flag is false on the handoff row.
 *
 * Acceptance criteria → tests:
 *  - 200 payload shape, all three sections present, first-names only.
 *  - 200 with include_queued_drills:false → no `queuedDrills` key.
 *  - 200 with include_weekly_focus:false → no `weeklyFocusLine` key.
 *  - 200 with include_eyes_on_players:false → no `eyesOnPlayers` key.
 *  - 410 when the observer token has expired.
 *  - 404 when the token is unknown / inactive.
 *  - planted DOB / medical_notes / parent_email / parent_phone never appear.
 *
 * The route's `.select()` keysets are EXPLICIT allow-lists per LESSONS#0036.
 *
 * Mocking pattern mirrors tests/api/drill-shares-token-get.test.ts.
 * `.test.ts` NOT `.spec.ts` (LESSONS#38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFromFn } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({ from: mockFromFn })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { GET } from '@/app/api/sub-handoff/[token]/route';
import { generateObserverToken } from '@/lib/observer-utils';

const SESSION_ID = '00000000-0000-4000-a000-000000000040';
const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const COACH_ID = 'coach-1';
const SPORT_ID = 'sport-1';

const SESSION = {
  id: SESSION_ID,
  team_id: TEAM_ID,
  date: '2026-06-10',
  planned_drills: [
    {
      name: 'Closeout drill',
      setupLines: ['Set cones at the elbows', 'Close out high', 'Recover under control'],
      coachNote: 'this is the one where the U10 girls finally chest up before the hands go up',
    },
    {
      name: 'Mikan drill',
      setupLines: ['One ball per player', 'Two touches each side'],
    },
  ],
};

const TEAM = {
  id: TEAM_ID,
  name: 'Hawks U10',
  age_group: 'U10',
  sport_id: SPORT_ID,
};

const SPORT = { id: SPORT_ID, name: 'Basketball' };

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function makeParams(token: string) {
  return { params: Promise.resolve({ token }) };
}

function freshToken() {
  return generateObserverToken(SESSION_ID, 24);
}

function expiredToken() {
  // A token whose expires field is in the past — generated via the same
  // payload shape as observer-utils but with expires<=now.
  // We compute it inline to avoid having to monkey-patch Date.now.
  const past = Date.now() - 1000;
  // Use the helper's internal shape: `${sessionId}:${expires}` base64url, +
  // a valid sig from the same secret. The easiest way to make this match is
  // to round-trip through the helper with a tiny ttl.
  // Trick: generate with a TTL of 0.0001h (~360ms) and sleep is overkill —
  // instead manually-craft via direct hmac of the documented payload.
  void past;
  // Easier approach: call generate with a ttl of -1 hour through helper
  // arithmetic (negative TTL → past expiry).
  return generateObserverToken(SESSION_ID, -1);
}

function buildHandoff(overrides: Partial<{
  observer_token: string;
  include_queued_drills: boolean;
  include_weekly_focus: boolean;
  include_eyes_on_players: boolean;
  sub_first_name: string | null;
}> = {}) {
  return {
    id: 'handoff-1',
    session_id: SESSION_ID,
    coach_id: COACH_ID,
    observer_token: overrides.observer_token ?? freshToken(),
    sub_first_name: overrides.sub_first_name ?? 'Mark',
    include_queued_drills: overrides.include_queued_drills ?? true,
    include_weekly_focus: overrides.include_weekly_focus ?? true,
    include_eyes_on_players: overrides.include_eyes_on_players ?? true,
  };
}

describe('GET /api/sub-handoff/[token] (ticket 0067)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('404 when the token is unknown / no handoff row', async () => {
    const token = freshToken();
    mockFromFn.mockReturnValueOnce(buildChain(null)); // sub_handoffs lookup
    const res = await GET(new Request(`http://localhost/api/sub-handoff/${token}`), makeParams(token));
    expect(res.status).toBe(404);
  });

  it('410 when the token has expired', async () => {
    const exp = expiredToken();
    const handoff = buildHandoff({ observer_token: exp });
    mockFromFn.mockReturnValueOnce(buildChain(handoff));
    const res = await GET(new Request(`http://localhost/api/sub-handoff/${exp}`), makeParams(exp));
    expect(res.status).toBe(410);
  });

  it('200 happy path returns the full payload with all three sections', async () => {
    const token = freshToken();
    const handoff = buildHandoff({ observer_token: token });

    // Queue: handoff → session → team → sport → config (focus) → players (eyes)
    mockFromFn
      .mockReturnValueOnce(buildChain(handoff)) // sub_handoffs
      .mockReturnValueOnce(buildChain(SESSION)) // sessions
      .mockReturnValueOnce(buildChain(TEAM)) // teams
      .mockReturnValueOnce(buildChain(SPORT)) // sports
      .mockReturnValueOnce(buildChain({ value: 'finishing the closeout' })) // config_overrides
      .mockReturnValueOnce(buildChain([{ player_id: 'p-1' }, { player_id: 'p-2' }])) // parent_reactions open threads
      .mockReturnValueOnce(buildChain([
        { id: 'p-1', name: 'Maya Walker', team_id: TEAM_ID, released_at: null },
        { id: 'p-2', name: 'Caleb Reyes', team_id: TEAM_ID, released_at: null },
      ])) // players
      .mockReturnValueOnce(buildChain([
        { id: 'o-1', player_id: 'p-1', text: 'working on left-hand finishes', created_at: '2026-06-01T00:00:00Z' },
        { id: 'o-2', player_id: 'p-2', text: 'working on calling out switches', created_at: '2026-06-01T00:00:00Z' },
      ])); // observations

    const res = await GET(new Request(`http://localhost/api/sub-handoff/${token}`), makeParams(token));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.sessionDate).toBe('2026-06-10');
    expect(body.teamName).toBe('Hawks U10');
    expect(body.ageGroup).toBe('U10');
    expect(body.sportName).toBe('Basketball');
    expect(body.subFirstName).toBe('Mark');
    expect(body.weeklyFocusLine).toContain('closeout');
    expect(Array.isArray(body.queuedDrills)).toBe(true);
    expect(body.queuedDrills.length).toBeGreaterThan(0);
    expect(Array.isArray(body.eyesOnPlayers)).toBe(true);
    // FIRST NAMES only.
    expect(body.eyesOnPlayers[0].firstName).toBe('Maya');
    expect(body.eyesOnPlayers[1].firstName).toBe('Caleb');
    expect(body.eyesOnPlayers[0].oneLineWatch).toContain('left-hand');
    expect(typeof body.expiresAt).toBe('string');
  });

  it('omits weeklyFocusLine when include_weekly_focus is false', async () => {
    const token = freshToken();
    const handoff = buildHandoff({ observer_token: token, include_weekly_focus: false });

    mockFromFn
      .mockReturnValueOnce(buildChain(handoff))
      .mockReturnValueOnce(buildChain(SESSION))
      .mockReturnValueOnce(buildChain(TEAM))
      .mockReturnValueOnce(buildChain(SPORT))
      // No config_overrides call — skipped.
      .mockReturnValueOnce(buildChain([{ player_id: 'p-1' }]))
      .mockReturnValueOnce(buildChain([{ id: 'p-1', name: 'Maya W', team_id: TEAM_ID, released_at: null }]))
      .mockReturnValueOnce(buildChain([{ id: 'o-1', player_id: 'p-1', text: 'working on it', created_at: '2026-06-01T00:00:00Z' }]));

    const res = await GET(new Request(`http://localhost/api/sub-handoff/${token}`), makeParams(token));
    const body = await res.json();
    expect('weeklyFocusLine' in body).toBe(false);
    expect(Array.isArray(body.queuedDrills)).toBe(true);
    expect(Array.isArray(body.eyesOnPlayers)).toBe(true);
  });

  it('omits queuedDrills when include_queued_drills is false', async () => {
    const token = freshToken();
    const handoff = buildHandoff({ observer_token: token, include_queued_drills: false });

    mockFromFn
      .mockReturnValueOnce(buildChain(handoff))
      .mockReturnValueOnce(buildChain(SESSION))
      .mockReturnValueOnce(buildChain(TEAM))
      .mockReturnValueOnce(buildChain(SPORT))
      .mockReturnValueOnce(buildChain({ value: 'finishing the closeout' }))
      .mockReturnValueOnce(buildChain([{ player_id: 'p-1' }]))
      .mockReturnValueOnce(buildChain([{ id: 'p-1', name: 'Maya W', team_id: TEAM_ID, released_at: null }]))
      .mockReturnValueOnce(buildChain([{ id: 'o-1', player_id: 'p-1', text: 'left hand', created_at: '2026-06-01T00:00:00Z' }]));

    const res = await GET(new Request(`http://localhost/api/sub-handoff/${token}`), makeParams(token));
    const body = await res.json();
    expect('queuedDrills' in body).toBe(false);
  });

  it('omits eyesOnPlayers when include_eyes_on_players is false', async () => {
    const token = freshToken();
    const handoff = buildHandoff({ observer_token: token, include_eyes_on_players: false });

    mockFromFn
      .mockReturnValueOnce(buildChain(handoff))
      .mockReturnValueOnce(buildChain(SESSION))
      .mockReturnValueOnce(buildChain(TEAM))
      .mockReturnValueOnce(buildChain(SPORT))
      .mockReturnValueOnce(buildChain({ value: 'finishing the closeout' }));
      // No parent_reactions / players / observations calls — skipped.

    const res = await GET(new Request(`http://localhost/api/sub-handoff/${token}`), makeParams(token));
    const body = await res.json();
    expect('eyesOnPlayers' in body).toBe(false);
  });

  it('never returns DOB / medical_notes / parent_email / parent_phone, even if rows planted them', async () => {
    // We can't directly plant on the chain's "what columns came back" because
    // the route's `.select(...)` is the allow-list — but we can assert the
    // serialized response shape contains NONE of those keys ANYWHERE.
    const token = freshToken();
    const handoff = buildHandoff({ observer_token: token });

    mockFromFn
      .mockReturnValueOnce(buildChain(handoff))
      .mockReturnValueOnce(buildChain(SESSION))
      .mockReturnValueOnce(buildChain(TEAM))
      .mockReturnValueOnce(buildChain(SPORT))
      .mockReturnValueOnce(buildChain({ value: 'closeouts' }))
      .mockReturnValueOnce(buildChain([{ player_id: 'p-1' }]))
      .mockReturnValueOnce(buildChain([
        // Plant the forbidden fields directly — they must not surface.
        {
          id: 'p-1',
          name: 'Maya Walker',
          team_id: TEAM_ID,
          released_at: null,
          date_of_birth: '2014-04-12',
          medical_notes: 'asthma — albuterol in bag',
          parent_email: 'mom@example.test',
          parent_phone: '555-0100',
        },
      ]))
      .mockReturnValueOnce(buildChain([
        { id: 'o-1', player_id: 'p-1', text: 'left hand', created_at: '2026-06-01T00:00:00Z' },
      ]));

    const res = await GET(new Request(`http://localhost/api/sub-handoff/${token}`), makeParams(token));
    const raw = await res.text();
    expect(raw).not.toContain('2014-04-12');
    expect(raw).not.toContain('albuterol');
    expect(raw).not.toContain('mom@example.test');
    expect(raw).not.toContain('555-0100');
    // Maya's LAST name must not appear either (COPPA — first names only).
    expect(raw).not.toContain('Walker');
  });
});
