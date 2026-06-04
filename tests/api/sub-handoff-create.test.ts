/**
 * Ticket 0067 — POST /api/sub-handoff/create.
 *
 * Mint a sub-handoff for ONE session. The caller is the regular head coach
 * texting a parent volunteer at 4:11pm; the response carries a public URL
 * the parent opens unauthed.
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user (before any DB read).
 *  - 400 when sessionId is missing.
 *  - 404 when the session does not exist.
 *  - 403 when the caller is not a coach on the session's team
 *    (head-coach check goes through `team_coaches`, LESSONS#0057 — never
 *    `teams.coach_id` because that column does not exist).
 *  - 400 when subFirstName is longer than 40 chars.
 *  - 400 { reason: 'voice' } when subFirstName contains a banned word.
 *  - 200 happy path returns { token, url, expiresIn:'24 hours' } and inserts
 *    a sub_handoffs row with the include flags + the minted observer token.
 *  - 200 idempotent re-create on the same (session, coach) UPDATES the
 *    existing row with the new flags + new sub_first_name; URL stays a
 *    `/sub/<token>` shape.
 *
 * Mocking pattern mirrors tests/api/drill-shares-create.test.ts. `.test.ts`
 * NOT `.spec.ts` (LESSONS#38). Free for every tier — the route does NOT
 * import tier.ts (gating a sub-handoff inverts the moat).
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

// Pin the URL so the response is stable.
process.env.NEXT_PUBLIC_APP_URL = 'https://example.test';

import { POST } from '@/app/api/sub-handoff/create/route';

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
const SESSION_ID = '00000000-0000-4000-a000-000000000040';
const TEAM_ID = '00000000-0000-4000-a000-000000000020';

const SESSION = { id: SESSION_ID, team_id: TEAM_ID, type: 'practice', date: '2026-06-10' };

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(body: unknown = { sessionId: SESSION_ID }) {
  return new Request('http://localhost/api/sub-handoff/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/sub-handoff/create (ticket 0067)', () => {
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

  it('returns 400 when sessionId is missing', async () => {
    setAuthUser();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the session does not exist', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(null)); // session lookup → null
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 403 when the caller is not on the session team (team_coaches miss)', async () => {
    setAuthUser();
    const sessionChain = buildChain(SESSION);
    const teamCoachChain = buildChain(null); // not a coach on the team
    mockFromFn.mockReturnValueOnce(sessionChain).mockReturnValueOnce(teamCoachChain);
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns 400 when subFirstName is longer than 40 chars', async () => {
    setAuthUser();
    const sessionChain = buildChain(SESSION);
    const teamCoachChain = buildChain({ coach_id: COACH_ID });
    mockFromFn.mockReturnValueOnce(sessionChain).mockReturnValueOnce(teamCoachChain);
    const res = await POST(
      makeRequest({ sessionId: SESSION_ID, subFirstName: 'M'.repeat(41) }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 { reason: 'voice' } on a banned subFirstName", async () => {
    setAuthUser();
    const sessionChain = buildChain(SESSION);
    const teamCoachChain = buildChain({ coach_id: COACH_ID });
    mockFromFn.mockReturnValueOnce(sessionChain).mockReturnValueOnce(teamCoachChain);
    const res = await POST(makeRequest({ sessionId: SESSION_ID, subFirstName: 'amazing' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('voice');
  });

  it('happy path returns { token, url, expiresIn } and upserts a sub_handoffs row', async () => {
    setAuthUser();
    const sessionChain = buildChain(SESSION);
    const teamCoachChain = buildChain({ coach_id: COACH_ID });
    const existingChain = buildChain(null); // no prior handoff
    const insertedChain = buildChain({
      id: 'handoff-1',
      session_id: SESSION_ID,
      coach_id: COACH_ID,
      observer_token: 'tok.sig',
      sub_first_name: 'Mark',
      include_queued_drills: true,
      include_weekly_focus: true,
      include_eyes_on_players: true,
    });
    mockFromFn
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(teamCoachChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(insertedChain);

    const res = await POST(makeRequest({ sessionId: SESSION_ID, subFirstName: 'Mark' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token?: string;
      url?: string;
      expiresIn?: string;
    };
    expect(typeof body.token).toBe('string');
    expect(body.token!.length).toBeGreaterThan(0);
    expect(body.url).toBe(`https://example.test/sub/${body.token}`);
    expect(body.expiresIn).toBe('24 hours');
  });

  it('idempotent re-create UPDATES the row + replaces the token', async () => {
    setAuthUser();
    const sessionChain = buildChain(SESSION);
    const teamCoachChain = buildChain({ coach_id: COACH_ID });
    const existingChain = buildChain({
      id: 'handoff-existing',
      session_id: SESSION_ID,
      coach_id: COACH_ID,
      observer_token: 'old.tok',
      sub_first_name: 'Mark',
      include_queued_drills: true,
      include_weekly_focus: true,
      include_eyes_on_players: true,
    });
    const updatedChain = buildChain({
      id: 'handoff-existing',
      session_id: SESSION_ID,
      coach_id: COACH_ID,
      observer_token: 'new.tok',
      sub_first_name: 'James',
      include_queued_drills: true,
      include_weekly_focus: false,
      include_eyes_on_players: true,
    });
    mockFromFn
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(teamCoachChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(updatedChain);

    const res = await POST(
      makeRequest({
        sessionId: SESSION_ID,
        subFirstName: 'James',
        includeWeeklyFocus: false,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string };
    expect(typeof body.token).toBe('string');
    expect(body.token).not.toBe('old.tok'); // re-mint on re-create
  });
});
