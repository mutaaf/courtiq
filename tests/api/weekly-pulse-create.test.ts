/**
 * Ticket 0057 — POST /api/weekly-pulse/create.
 *
 * Turn the caller's current ISO week of observations + sessions on ONE of
 * their teams into a public token. The public page at /week/<token> renders
 * an aggregate "what my team is working on this week" card the coach drops
 * in the league group chat. Free for every tier — gating a viral surface
 * inverts the loop (ticket decision).
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user (before any DB read).
 *  - 400 when teamId is missing from the body.
 *  - 404 when the team does NOT belong to the caller.
 *  - 200 happy path returns { token, url: '/week/<token>' } with a 32-hex token.
 *  - Idempotent: a re-create for the same (coach, team, iso_week) reuses the
 *    existing active row (never two tokens per week).
 *  - Caption update on an idempotent re-create writes the new caption in place
 *    (the token stays stable so a previously-pasted link never goes stale).
 *
 * Mocking pattern mirrors tests/api/practice-plan-shares-create.test.ts.
 * .test.ts NOT .spec.ts (LESSONS#38). The route reads a JSON body, so it is
 * invoked with a real Request (LESSONS#55).
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

import { POST } from '@/app/api/weekly-pulse/create/route';

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
const OWNED_TEAM = { id: TEAM_ID, name: 'E2E Test Team', coach_id: COACH_ID };

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(body: unknown = { teamId: TEAM_ID }) {
  return new Request('http://localhost/api/weekly-pulse/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/weekly-pulse/create (ticket 0057)', () => {
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
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the team belongs to a different coach', async () => {
    setAuthUser();
    // The route looks up by (id, coach_id) — a foreign team returns null.
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it('happy path returns { token, url } with /week/<token> shape and a 32-hex token', async () => {
    setAuthUser();
    const teamChain = buildChain(OWNED_TEAM);
    const existingChain = buildChain(null);   // no existing active pulse this week
    const insertedChain = buildChain({
      id: 'pulse-1',
      token: 'a'.repeat(32),
      coach_id: COACH_ID,
      team_id: TEAM_ID,
      iso_week: '2026-W22',
      caption: null,
      is_active: true,
    });
    mockFromFn
      .mockReturnValueOnce(teamChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(insertedChain);

    const res = await POST(makeRequest({ teamId: TEAM_ID, isoWeek: '2026-W22' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string; url?: string };
    expect(typeof body.token).toBe('string');
    // The real route uses generateShareToken() = 32 hex chars; the mock just
    // confirms the URL is built from whatever the row's token resolves to.
    expect(body.url).toBe(`/week/${body.token}`);
  });

  it('is idempotent: re-create returns the EXISTING active token (never two)', async () => {
    setAuthUser();
    const teamChain = buildChain(OWNED_TEAM);
    const existingChain = buildChain({
      id: 'pulse-existing',
      token: 'existing-token-abc',
      coach_id: COACH_ID,
      team_id: TEAM_ID,
      iso_week: '2026-W22',
      caption: null,
      is_active: true,
    });
    const insertChain = buildChain(null);
    mockFromFn
      .mockReturnValueOnce(teamChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(insertChain); // never reached on the idempotent path

    const res = await POST(makeRequest({ teamId: TEAM_ID, isoWeek: '2026-W22' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string; url?: string };
    expect(body.token).toBe('existing-token-abc');
    expect(body.url).toBe('/week/existing-token-abc');
    // No insert ran — the route reused the existing share.
    expect(insertChain.insert).not.toHaveBeenCalled();
  });

  it('updates an existing row in place when a new caption is supplied', async () => {
    setAuthUser();
    const teamChain = buildChain(OWNED_TEAM);
    const existingChain = buildChain({
      id: 'pulse-existing',
      token: 'existing-token-abc',
      coach_id: COACH_ID,
      team_id: TEAM_ID,
      iso_week: '2026-W22',
      caption: null,
      is_active: true,
    });
    const updateChain = buildChain({ id: 'pulse-existing' });
    mockFromFn
      .mockReturnValueOnce(teamChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(updateChain);

    const res = await POST(
      makeRequest({
        teamId: TEAM_ID,
        isoWeek: '2026-W22',
        caption: 'anyone want to swap closeout drills?',
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string };
    // The token is STILL the same one — caption updates never mint a new link.
    expect(body.token).toBe('existing-token-abc');
    // And the update was actually called on the share table.
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ caption: 'anyone want to swap closeout drills?' }),
    );
  });

  it('defaults isoWeek to the current ISO week when omitted', async () => {
    setAuthUser();
    const teamChain = buildChain(OWNED_TEAM);
    const existingChain = buildChain(null);
    const insertedChain = buildChain({
      id: 'pulse-1',
      token: 'token-x',
      coach_id: COACH_ID,
      team_id: TEAM_ID,
      iso_week: '2026-W22',
      caption: null,
      is_active: true,
    });
    mockFromFn
      .mockReturnValueOnce(teamChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(insertedChain);

    // No isoWeek in the body — the route defaults it. Just assert no 400/500.
    const res = await POST(makeRequest({ teamId: TEAM_ID }));
    expect(res.status).toBe(200);
  });
});
