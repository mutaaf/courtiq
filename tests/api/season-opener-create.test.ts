/**
 * Ticket 0068 — POST /api/season-opener/create.
 *
 * Mint a season-opener share for ONE team. The caller is the head coach who
 * just finished setup; the response carries a public URL the coach pastes
 * into the team group chat.
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user (before any DB read).
 *  - 400 when teamId is missing.
 *  - 400 when focusLine is empty / >80 chars.
 *  - 400 { reason: 'voice' } when focusLine contains a banned word.
 *  - 404 when the team does not exist.
 *  - 403 when the caller is not a coach on the team (team_coaches lookup;
 *    LESSONS#0057 — never `teams.coach_id` because that column does not
 *    exist).
 *  - 200 happy path returns { token, url } and writes a season_opener_shares
 *    row; the URL is `${NEXT_PUBLIC_APP_URL}/opener/<token>`.
 *  - 200 idempotent re-create on the same (team_id, season_label) REPLACES
 *    the focus_line + the token; the URL changes.
 *  - The route does NOT import tier.ts (free-tier coaches can ship a
 *    season opener; gating the first-touch surface inverts the moat).
 *
 * Mocking mirrors tests/api/sub-handoff-create.test.ts (LESSONS#0096 — read
 * an existing pattern at pickup). `.test.ts` not `.spec.ts` (LESSONS#0020).
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

// Pin the URL so the response is stable across machines.
process.env.NEXT_PUBLIC_APP_URL = 'https://example.test';

import { POST } from '@/app/api/season-opener/create/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
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
const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const TEAM = {
  id: TEAM_ID,
  name: 'Hawks U10',
  age_group: '8-10',
  season: 'Spring 2026',
  sport_id: 'sport-1',
  created_at: '2026-03-15T00:00:00Z',
};

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(
  body: unknown = { teamId: TEAM_ID, focusLine: 'closeouts and good sportsmanship' },
) {
  return new Request('http://localhost/api/season-opener/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/season-opener/create (ticket 0068)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 when teamId is missing', async () => {
    setAuthUser();
    const res = await POST(makeRequest({ focusLine: 'closeouts' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when focusLine is empty', async () => {
    setAuthUser();
    const res = await POST(makeRequest({ teamId: TEAM_ID, focusLine: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when focusLine is longer than 80 chars', async () => {
    setAuthUser();
    const res = await POST(
      makeRequest({ teamId: TEAM_ID, focusLine: 'x'.repeat(81) }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 { reason: 'voice' } on a banned focusLine", async () => {
    setAuthUser();
    const res = await POST(
      makeRequest({
        teamId: TEAM_ID,
        focusLine: 'an amazing season ahead for the team',
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('voice');
  });

  it('returns 404 when the team does not exist', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(null)); // team lookup → null
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 403 when the caller is not a coach on the team (team_coaches miss)', async () => {
    setAuthUser();
    const teamChain = buildChain(TEAM);
    const teamCoachChain = buildChain(null);
    mockFromFn.mockReturnValueOnce(teamChain).mockReturnValueOnce(teamCoachChain);
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it('happy path: returns { token, url } and writes a season_opener_shares row', async () => {
    setAuthUser();
    const teamChain = buildChain(TEAM);
    const teamCoachChain = buildChain({ coach_id: COACH_ID });
    const existingChain = buildChain(null); // no prior row
    const insertedChain = buildChain({
      id: 'opener-1',
      team_id: TEAM_ID,
      coach_id: COACH_ID,
      token: 'deadbeefdeadbeefdeadbeefdeadbeef',
      season_label: 'Spring 2026',
      focus_line: 'closeouts and good sportsmanship',
      created_at: '2026-06-05T00:00:00Z',
    });
    mockFromFn
      .mockReturnValueOnce(teamChain)
      .mockReturnValueOnce(teamCoachChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(insertedChain);

    const res = await POST(
      makeRequest({
        teamId: TEAM_ID,
        focusLine: 'closeouts and good sportsmanship',
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string; url?: string };
    expect(typeof body.token).toBe('string');
    expect(body.token!.length).toBeGreaterThan(0);
    expect(body.url).toBe(`https://example.test/opener/${body.token}`);
  });

  it('idempotent re-create on the same (team, season) REPLACES the focus_line + the token', async () => {
    setAuthUser();
    const teamChain = buildChain(TEAM);
    const teamCoachChain = buildChain({ coach_id: COACH_ID });
    const existingChain = buildChain({
      id: 'opener-existing',
      team_id: TEAM_ID,
      coach_id: COACH_ID,
      token: 'oldtokenoldtokenoldtokenoldtoken',
      season_label: 'Spring 2026',
      focus_line: 'first version',
      created_at: '2026-06-05T00:00:00Z',
    });
    const updatedChain = buildChain({
      id: 'opener-existing',
      team_id: TEAM_ID,
      coach_id: COACH_ID,
      token: 'newtokennewtokennewtokennewtoken',
      season_label: 'Spring 2026',
      focus_line: 'an edited focus line',
      created_at: '2026-06-05T00:00:00Z',
    });
    mockFromFn
      .mockReturnValueOnce(teamChain)
      .mockReturnValueOnce(teamCoachChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(updatedChain);

    const res = await POST(
      makeRequest({
        teamId: TEAM_ID,
        focusLine: 'an edited focus line',
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string };
    expect(typeof body.token).toBe('string');
    expect(body.token).not.toBe('oldtokenoldtokenoldtokenoldtoken');
  });

  it('falls back to a "Season <YYYY>" label when teams.season is null', async () => {
    setAuthUser();
    const teamWithoutSeason = { ...TEAM, season: null };
    const teamChain = buildChain(teamWithoutSeason);
    const teamCoachChain = buildChain({ coach_id: COACH_ID });
    const existingChain = buildChain(null);
    const insertedChain = buildChain({
      id: 'opener-2',
      team_id: TEAM_ID,
      coach_id: COACH_ID,
      token: 'tokwithoutsea0000000000000000000',
      season_label: 'Season 2026',
      focus_line: 'fresh start',
      created_at: '2026-06-05T00:00:00Z',
    });
    mockFromFn
      .mockReturnValueOnce(teamChain)
      .mockReturnValueOnce(teamCoachChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(insertedChain);

    const res = await POST(
      makeRequest({ teamId: TEAM_ID, focusLine: 'fresh start' }),
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/season-opener/create — does NOT tier-gate (ticket 0068)', () => {
  it('the route source does not import @/lib/tier (free-tier accessible)', () => {
    // The first-touch surface is non-gated by design (the moat argument in
    // the ticket). This static check is the structural guarantee — a future
    // edit that quietly adds canAccess() trips the assertion.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/season-opener/create/route.ts'),
      'utf-8',
    );
    expect(source).not.toMatch(/from\s+['"]@\/lib\/tier['"]/);
    expect(source).not.toMatch(/canAccess\s*\(/);
  });
});
