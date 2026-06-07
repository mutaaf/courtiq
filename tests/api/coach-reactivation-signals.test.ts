/**
 * Ticket 0072 — GET /api/coach/reactivation-signals.
 *
 * Returns the caller's unconsumed signals from the last 14 days joined
 * with the prior player first name + the prior team name. Asserts:
 *  - 401 on unauthed.
 *  - 200 with both signals on an authed caller with two unconsumed rows.
 *  - Consumed signals are excluded.
 *  - Signals older than 14 days are excluded (the route's gte filter).
 *  - The response payload contains NO parent email (hashed or plaintext).
 *  - Planted DOB / parent_phone on the joined player row are NEVER read.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { GET } from '@/app/api/coach/reactivation-signals/route';

function buildChain<T = unknown>(data: T | null = null, error: unknown = null) {
  const resolved = { data, error };
  const selectCalls: string[] = [];
  const chain: Record<string, unknown> = {
    select: vi.fn((sel: string) => {
      selectCalls.push(sel);
      return chain;
    }),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
    _selectCalls: selectCalls,
  };
  return chain;
}

const COACH_ID = '00000000-0000-4000-a000-0000000000b1';
const PLAYER_LIAM_ID = '00000000-0000-4000-a000-0000000000c1';
const PLAYER_OTHER_ID = '00000000-0000-4000-a000-0000000000c2';
const TEAM_SPRING_ID = '00000000-0000-4000-a000-0000000000a1';

const SIGNAL_ROWS = [
  {
    id: 'sig-1',
    prior_team_id: TEAM_SPRING_ID,
    prior_player_id: PLAYER_LIAM_ID,
    fired_at: '2026-11-14T00:00:00Z',
  },
  {
    id: 'sig-2',
    prior_team_id: TEAM_SPRING_ID,
    prior_player_id: PLAYER_OTHER_ID,
    fired_at: '2026-11-13T00:00:00Z',
  },
];

describe('GET /api/coach/reactivation-signals (ticket 0072)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when no user is authed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with both signals joined to the prior-player first name + prior-team name', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const selectCallsBySignal: string[] = [];
    const signalChain = buildChain(SIGNAL_ROWS);
    selectCallsBySignal.push(...(signalChain as { _selectCalls: string[] })._selectCalls);

    const playersChain = buildChain([
      { id: PLAYER_LIAM_ID, name: 'Liam Walker' },
      { id: PLAYER_OTHER_ID, name: 'Maya Walker' },
    ]);
    const teamsChain = buildChain([{ id: TEAM_SPRING_ID, name: 'Spring Hawks' }]);

    mockFromFn
      .mockReturnValueOnce(signalChain)
      .mockReturnValueOnce(playersChain)
      .mockReturnValueOnce(teamsChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signals).toHaveLength(2);
    expect(body.signals[0]).toMatchObject({
      id: 'sig-1',
      priorPlayerId: PLAYER_LIAM_ID,
      priorPlayerFirstName: 'Liam',
      priorTeamName: 'Spring Hawks',
    });
    expect(body.signals[1]).toMatchObject({
      id: 'sig-2',
      priorPlayerId: PLAYER_OTHER_ID,
      priorPlayerFirstName: 'Maya',
      priorTeamName: 'Spring Hawks',
    });
  });

  it('returns an empty array (and never reads players / teams) when the caller has no unconsumed signals', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    mockFromFn.mockReturnValueOnce(buildChain([]));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signals).toEqual([]);
    // Only the signals lookup; no players / teams reads.
    expect(mockFromFn).toHaveBeenCalledTimes(1);
  });

  it('uses the right gte cutoff so signals older than 14 days are filtered (route delegates the cutoff to the DB)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const signalChain = buildChain([]);
    mockFromFn.mockReturnValueOnce(signalChain);
    await GET();
    // The route called .gte('fired_at', <ISO>). The cutoff is 14 days ago.
    expect((signalChain.gte as { mock: { calls: unknown[][] } }).mock.calls.length).toBeGreaterThanOrEqual(1);
    const [col, val] = (signalChain.gte as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(col).toBe('fired_at');
    expect(typeof val).toBe('string');
    const cutoffMs = Date.parse(val as string);
    const now = Date.now();
    // Within a generous tolerance of "14 days ago" (the test runs in a
    // shared serial suite — LESSONS#0087: pin via the cutoff value, not
    // an exact equality).
    expect(now - cutoffMs).toBeGreaterThanOrEqual(13 * 24 * 60 * 60 * 1000);
    expect(now - cutoffMs).toBeLessThanOrEqual(15 * 24 * 60 * 60 * 1000);
  });

  it('uses .is(consumed_at, null) so consumed signals are filtered (route delegates the filter to the DB)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const signalChain = buildChain([]);
    mockFromFn.mockReturnValueOnce(signalChain);
    await GET();
    const isCalls = (signalChain.is as { mock: { calls: unknown[][] } }).mock.calls;
    expect(isCalls.some((c) => c[0] === 'consumed_at' && c[1] === null)).toBe(true);
  });

  it('the response payload contains NO parent email (hashed or plaintext)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const signalChain = buildChain(SIGNAL_ROWS);
    const playersChain = buildChain([{ id: PLAYER_LIAM_ID, name: 'Liam Walker' }]);
    const teamsChain = buildChain([{ id: TEAM_SPRING_ID, name: 'Spring Hawks' }]);
    mockFromFn
      .mockReturnValueOnce(signalChain)
      .mockReturnValueOnce(playersChain)
      .mockReturnValueOnce(teamsChain);

    const res = await GET();
    const body = await res.json();
    const json = JSON.stringify(body);
    // No hashed-email field name; no @-bearing token.
    expect(json).not.toContain('returning_parent_email_hash');
    expect(json).not.toContain('parent_email');
    expect(json).not.toContain('parentEmail');
    expect(json).not.toMatch(/@/);
  });

  it('asserts the prior-player .select() is an allow-list of just (id, name) — never DOB / parent_phone', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const signalChain = buildChain(SIGNAL_ROWS);
    const playersChain = buildChain([{ id: PLAYER_LIAM_ID, name: 'Liam Walker' }]);
    const teamsChain = buildChain([{ id: TEAM_SPRING_ID, name: 'Spring Hawks' }]);
    mockFromFn
      .mockReturnValueOnce(signalChain)
      .mockReturnValueOnce(playersChain)
      .mockReturnValueOnce(teamsChain);

    await GET();
    const playerSelectCalls = (playersChain as { _selectCalls: string[] })._selectCalls;
    expect(playerSelectCalls).toHaveLength(1);
    expect(playerSelectCalls[0]).toBe('id, name');
    // Defensive: even if the columns are added back later, none of the
    // banned-on-the-coach-surface fields are in the select.
    for (const banned of [
      'date_of_birth',
      'parent_email',
      'parent_phone',
      'medical_notes',
      'jersey_number',
      'photo_url',
    ]) {
      expect(playerSelectCalls[0]).not.toContain(banned);
    }
  });
});
