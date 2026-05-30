/**
 * Ticket 0057 — GET /api/weekly-pulse/preview?teamId=<id>.
 *
 * Authed live preview the home card uses to render BEFORE the coach taps
 * "Share this week". Same payload shape as the public token GET (minus the
 * `referralCode` field — only the public surface needs the warm-landing CTA).
 * The home card decides whether to render at all from this response: on a
 * coach with no observations this week, the card stays absent (silence beats
 * nag, ticket decision).
 *
 * Acceptance criteria → tests:
 *  - 401 when unauthenticated.
 *  - 400 when teamId is missing.
 *  - 404 when the team does NOT belong to the caller.
 *  - 200 happy path returns the SAME payload shape buildPulsePayload emits,
 *    PLUS an `existingToken` field telling the home card whether the coach
 *    has already shared THIS ISO week (so the button reads "Copy link"
 *    instead of "Share this week").
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

import { GET } from '@/app/api/weekly-pulse/preview/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = 'coach-1';
const TEAM_ID = 'team-1';

function setAuth(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(teamId?: string) {
  const url = teamId
    ? `http://localhost/api/weekly-pulse/preview?teamId=${encodeURIComponent(teamId)}`
    : `http://localhost/api/weekly-pulse/preview`;
  return new Request(url);
}

describe('GET /api/weekly-pulse/preview (ticket 0057)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuth(null);
    const res = await GET(makeRequest(TEAM_ID));
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 when teamId is missing', async () => {
    setAuth();
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it('returns 404 when the team belongs to a different coach', async () => {
    setAuth();
    // team_coaches membership check returns null → 404.
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await GET(makeRequest(TEAM_ID));
    expect(res.status).toBe(404);
  });

  it('happy path returns the preview payload + existingToken=null when never shared this week', async () => {
    setAuth();
    // The route reads: team_coaches (membership) → teams → coaches → sports
    // → observations → sessions → (readProgramFocus internal: teams +
    // config_overrides; for free tier it short-circuits after the first
    // teams read) → plans (coach signature) → weekly_pulse_shares
    // (existingToken lookup).
    mockFromFn
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID })) // team_coaches
      .mockReturnValueOnce(buildChain({
        id: TEAM_ID, name: 'Coach Maya Team',
        age_group: '11-13', org_id: 'org-1', sport_id: 'sport-1',
      }))
      .mockReturnValueOnce(buildChain({ id: COACH_ID, full_name: 'Maya Patel' }))
      .mockReturnValueOnce(buildChain({ id: 'sport-1', name: 'Basketball' }))
      .mockReturnValueOnce(buildChain([
        { id: 'o1', category: 'Defense', sentiment: 'positive', created_at: new Date().toISOString() },
      ]))
      .mockReturnValueOnce(buildChain([{ id: 's1', date: new Date().toISOString().slice(0, 10) }]))
      .mockReturnValueOnce(buildChain({ org_id: 'org-1', organizations: { tier: 'free' } }))
      .mockReturnValueOnce(buildChain([])) // coach signature plans
      .mockReturnValueOnce(buildChain(null)); // existingToken lookup → none

    const res = await GET(makeRequest(TEAM_ID));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.coachFirstName).toBe('Maya');
    expect(body.teamName).toBe('Coach Maya Team');
    expect(body.sportName).toBe('Basketball');
    expect(body.ageGroup).toBe('11-13');
    expect(typeof body.isoWeek).toBe('string');
    expect(body.sessionCount).toBe(1);
    expect(body.topCategories).toEqual(['Defense']);
    expect(body.existingToken).toBeNull();
    // Preview MUST NOT return a referralCode — that's a public-surface field only.
    expect(body.referralCode).toBeUndefined();
  });

  it('reports existingToken when the coach has already shared THIS week', async () => {
    setAuth();
    mockFromFn
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID })) // team_coaches
      .mockReturnValueOnce(buildChain({
        id: TEAM_ID, name: 'Coach Maya Team',
        age_group: '11-13', org_id: 'org-1', sport_id: 'sport-1',
      }))
      .mockReturnValueOnce(buildChain({ id: COACH_ID, full_name: 'Maya Patel' }))
      .mockReturnValueOnce(buildChain({ id: 'sport-1', name: 'Basketball' }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain({ org_id: 'org-1', organizations: { tier: 'free' } }))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain({ id: 'pulse-1', token: 'wp-active-1', is_active: true }));

    const res = await GET(makeRequest(TEAM_ID));
    const body = (await res.json()) as { existingToken?: string };
    expect(body.existingToken).toBe('wp-active-1');
  });
});
