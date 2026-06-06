/**
 * Ticket 0069 — GET /api/game-decompression/unconsumed-for-team.
 *
 * The /api/ai/plan route reads this endpoint at the START of plan
 * generation; if a decompression is present, the recommended drill is
 * inserted as drill #1 of the new plan. The endpoint returns:
 *   - the caller's MOST-RECENT unconsumed decompression for the team in
 *     the last 14 days, or
 *   - null when none exists.
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user.
 *  - 400 when teamId is missing.
 *  - 403 when the caller is not a coach on the team
 *    (head-coach check via `team_coaches`, LESSONS#0057).
 *  - 200 { decompression: null } when no unconsumed row in the window.
 *  - 200 { decompression: <row> } when one exists.
 *
 * `.test.ts` NOT `.spec.ts` (LESSONS#0020/#38).
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

import { GET } from '@/app/api/game-decompression/unconsumed-for-team/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const lastSelectArg: { value?: unknown } = {};
  const chain: Record<string, unknown> = {
    __lastSelectArg: lastSelectArg,
    select: vi.fn((arg?: unknown) => {
      lastSelectArg.value = arg;
      return chain;
    }),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = 'coach-1';
const TEAM_ID = '00000000-0000-4000-a000-000000000020';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(teamId: string | null = TEAM_ID) {
  const url = teamId
    ? `http://localhost/api/game-decompression/unconsumed-for-team?teamId=${teamId}`
    : 'http://localhost/api/game-decompression/unconsumed-for-team';
  return new Request(url);
}

describe('GET /api/game-decompression/unconsumed-for-team (ticket 0069)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 400 when teamId is missing', async () => {
    setAuthUser();
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it('returns 403 when the caller is not on the team (team_coaches miss)', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(null)); // team_coaches
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns 200 { decompression: null } when no unconsumed row in the 14-day window', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID })) // team_coaches
      .mockReturnValueOnce(buildChain([]));                    // game_decompressions
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { decompression: unknown };
    expect(body.decompression).toBeNull();
  });

  it('returns the most-recent unconsumed decompression when one exists', async () => {
    setAuthUser();
    const row = {
      id: 'dec-1',
      session_id: 'sess-1',
      coach_id: COACH_ID,
      team_id: TEAM_ID,
      transcript: "Rebounds.",
      duration_seconds: 22,
      recommended_drill_name: 'Box-out 2-on-2',
      recommended_drill_setup: ['Pair up at the elbows.'],
      recommended_drill_why: 'Saturday said rebounding.',
      consumed_at: null,
      consumed_plan_id: null,
      created_at: '2026-06-04T17:00:00Z',
    };
    const decompChain = buildChain([row]);
    mockFromFn
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID }))
      .mockReturnValueOnce(decompChain);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { decompression: { id: string; recommended_drill_name: string } | null };
    expect(body.decompression?.id).toBe('dec-1');
    expect(body.decompression?.recommended_drill_name).toBe('Box-out 2-on-2');

    // LESSONS#0036 — explicit `.select()` allow-list, NEVER `*`. The route's
    // select must name every column it wants (a `.select('*')` regression
    // would silently leak a future column through this read).
    const selectArg = decompChain.__lastSelectArg as { value?: unknown };
    expect(typeof selectArg.value).toBe('string');
    expect(selectArg.value).not.toBe('*');
    expect(String(selectArg.value)).toContain('recommended_drill_name');
    expect(String(selectArg.value)).toContain('consumed_at');
  });
});
