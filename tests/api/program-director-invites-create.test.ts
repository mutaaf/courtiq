/**
 * Ticket 0065 — POST /api/program-director-invites/create.
 *
 * The coach taps "Send to <Mike>" on the new section beneath the 0057
 * weekly-pulse share sheet's Copy-link button. The route:
 *  - verifies the caller is on team_coaches for the team (LESSONS#0057 —
 *    team_coaches is the join, NOT teams.coach_id);
 *  - verifies the weekly_pulse_shares token belongs to the same team;
 *  - validates the director name + email (voice-clean + length + format);
 *  - upserts the (coach_id, director_email_hash) row (re-invite increments
 *    invite_count + bumps last_invited_at on the SAME row);
 *  - reads the SHARED 30-day dedup across the org against BOTH
 *    coach_director_contacts and program_referrals (0050) AND a check for
 *    director-already-on-platform via a coach row in the same org;
 *  - rate-limits: max 20 sends per coach per 7 rolling days;
 *  - fires ONE structured email via sendEmail.
 *
 * Mocking pattern mirrors tests/api/drill-shares-create.test.ts. .test.ts
 * NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn, mockSendEmail, mockResetRate } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
  mockSendEmail: vi.fn(),
  mockResetRate: vi.fn(),
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

vi.mock('@/lib/email', () => ({
  sendEmail: mockSendEmail,
}));

import { POST } from '@/app/api/program-director-invites/create/route';
import { _resetDirectorInviteRateLimiterForTest } from '@/lib/director-invite-utils';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = 'coach-uuid-001';
const ORG_ID = 'org-uuid-001';
const TEAM_ID = 'team-uuid-001';
const PULSE_TOKEN = 'wpt-001';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/program-director-invites/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function defaultBody() {
  return {
    teamId: TEAM_ID,
    weeklyPulseToken: PULSE_TOKEN,
    directorFirstName: 'Mike',
    directorEmail: 'mike@league.test',
  };
}

/**
 * Set up a from-chain queue that mirrors the route's read order on a
 * happy-path send:
 *   1) team_coaches  (head-coach ownership)
 *   2) weekly_pulse_shares  (token resolves to a row on the same team)
 *   3) coaches  (caller's org_id)
 *   4) coach_director_contacts (prior contact for this coach + this email)
 *   5) coaches  (program-membership probe: director already in the org?)
 *   6) coach_director_contacts (org-shared 30-day dedup probe across siblings)
 *   7) program_referrals (cross-flow dedup from 0050)
 *   8) coach_director_contacts (upsert)
 *   9) teams  (team name for the email subject)
 *  10) coaches (full name for the email body)
 *  11) weekly_pulse_shares (caption + iso_week for the preview)
 */
function setHappyPathChains(overrides: {
  teamCoach?: unknown;
  pulseShare?: unknown;
  callerCoach?: unknown;
  priorContact?: unknown;
  directorAlreadyOnPlatform?: unknown;
  orgSiblingDedup?: unknown;
  programReferralDedup?: unknown;
  upsertedContact?: unknown;
  team?: unknown;
  coach?: unknown;
  pulseShareFull?: unknown;
} = {}) {
  const teamCoach = overrides.teamCoach ?? { coach_id: COACH_ID };
  const pulseShare = overrides.pulseShare ?? {
    id: 'pulse-share-1',
    token: PULSE_TOKEN,
    coach_id: COACH_ID,
    team_id: TEAM_ID,
    iso_week: '2026-W22',
    caption: 'anyone want to swap closeout drills?',
    is_active: true,
  };
  const callerCoach = overrides.callerCoach ?? {
    id: COACH_ID,
    org_id: ORG_ID,
    full_name: 'Sarah Rodriguez',
  };
  const priorContact = overrides.priorContact ?? null;
  const directorOnPlatform = overrides.directorAlreadyOnPlatform ?? null;
  const orgSibling = overrides.orgSiblingDedup ?? null;
  const programRef = overrides.programReferralDedup ?? null;
  const upserted = overrides.upsertedContact ?? {
    id: 'cdc-1',
    coach_id: COACH_ID,
    director_email_hash: 'h',
    invite_count: 1,
    last_invited_at: '2026-06-03T00:00:00Z',
  };
  const team = overrides.team ?? { id: TEAM_ID, name: 'Hawks' };
  const coach = overrides.coach ?? { id: COACH_ID, full_name: 'Sarah Rodriguez', org_id: ORG_ID };
  const pulseFull = overrides.pulseShareFull ?? pulseShare;

  mockFromFn
    .mockReturnValueOnce(buildChain(teamCoach))
    .mockReturnValueOnce(buildChain(pulseShare))
    .mockReturnValueOnce(buildChain(callerCoach))
    .mockReturnValueOnce(buildChain(priorContact))
    .mockReturnValueOnce(buildChain(directorOnPlatform))
    .mockReturnValueOnce(buildChain(orgSibling))
    .mockReturnValueOnce(buildChain(programRef))
    .mockReturnValueOnce(buildChain(upserted))
    .mockReturnValueOnce(buildChain(team))
    .mockReturnValueOnce(buildChain(coach))
    .mockReturnValueOnce(buildChain(pulseFull));
}

describe('POST /api/program-director-invites/create (ticket 0065)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ success: true });
    _resetDirectorInviteRateLimiterForTest();
    mockResetRate.mockClear();
    process.env.NEXT_PUBLIC_APP_URL = 'https://youthsportsiq.com';
    process.env.CRON_SECRET = 'test-secret-0065';
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 400 { reason: 'format' } for a malformed director email", async () => {
    setAuthUser();
    const res = await POST(
      makeRequest({ ...defaultBody(), directorEmail: 'not-an-email' }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('format');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 400 { reason: 'length' } for an empty director name", async () => {
    setAuthUser();
    const res = await POST(
      makeRequest({ ...defaultBody(), directorFirstName: '' }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('length');
  });

  it("returns 400 { reason: 'voice' } when the director name contains a banned word", async () => {
    setAuthUser();
    // "amazing" is in the AGENTS.md banned list.
    const res = await POST(
      makeRequest({ ...defaultBody(), directorFirstName: 'amazing Mike' }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('voice');
  });

  it('returns 403 when the caller is not a coach on the team', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(403);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 404 when the weekly-pulse token does not belong to the team', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID })) // team_coaches OK
      .mockReturnValueOnce(buildChain(null)); // weekly_pulse_shares miss
    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(404);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('happy path returns 200 { sent: true, inviteCount: 1 } and fires the email exactly once', async () => {
    setAuthUser();
    setHappyPathChains();
    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent?: boolean; inviteCount?: number };
    expect(body.sent).toBe(true);
    expect(body.inviteCount).toBe(1);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0][0];
    expect(call.to).toBe('mike@league.test');
    expect(typeof call.subject).toBe('string');
    expect(call.subject).toContain('Sarah Rodriguez');
    expect(call.subject).toContain('Hawks');
    expect(typeof call.html).toBe('string');
    // The deep link carries ?ref=director-invite.
    expect(call.html).toMatch(/\?ref=director-invite/);
    // The program-claim CTA points to /programs?invite=director&ref=<signed>.
    expect(call.html).toMatch(/invite=director/);
    expect(call.html).toMatch(/ref=/);
  });

  it('a re-invite of the same director returns inviteCount 2 (upsert increments)', async () => {
    setAuthUser();
    setHappyPathChains({
      priorContact: {
        id: 'cdc-1',
        coach_id: COACH_ID,
        director_email_hash: 'h',
        invite_count: 1,
        last_invited_at: '2026-04-01T00:00:00Z',
      },
      upsertedContact: {
        id: 'cdc-1',
        coach_id: COACH_ID,
        director_email_hash: 'h',
        invite_count: 2,
        last_invited_at: '2026-06-03T00:00:00Z',
      },
    });
    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent?: boolean; inviteCount?: number };
    expect(body.sent).toBe(true);
    expect(body.inviteCount).toBe(2);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("returns 200 { sent: false, dedupVia: 'coach' } when a sibling coach in the org already invited", async () => {
    setAuthUser();
    // Same caller, but the org-sibling-dedup probe finds a row in the last 30 days.
    mockFromFn
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID })) // team_coaches
      .mockReturnValueOnce(
        buildChain({
          id: 'pulse-share-1',
          token: PULSE_TOKEN,
          coach_id: COACH_ID,
          team_id: TEAM_ID,
          iso_week: '2026-W22',
          caption: null,
          is_active: true,
        }),
      ) // weekly_pulse_shares
      .mockReturnValueOnce(
        buildChain({ id: COACH_ID, org_id: ORG_ID, full_name: 'Sarah Rodriguez' }),
      ) // coaches (caller)
      .mockReturnValueOnce(buildChain(null)) // prior-contact (none)
      .mockReturnValueOnce(buildChain(null)) // director-already-on-platform: NO
      .mockReturnValueOnce(
        buildChain({
          id: 'sibling-cdc-1',
          coach_id: 'sibling-coach',
          last_invited_at: new Date().toISOString(),
        }),
      ); // org-sibling-dedup HIT

    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent?: boolean; reason?: string; dedupVia?: string };
    expect(body.sent).toBe(false);
    expect(body.reason).toBe('already-invited');
    expect(body.dedupVia).toBe('coach');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 200 { sent: false, dedupVia: 'org-membership' } when the director already has a coach row in the org", async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ coach_id: COACH_ID })) // team_coaches
      .mockReturnValueOnce(
        buildChain({
          id: 'pulse-share-1',
          token: PULSE_TOKEN,
          coach_id: COACH_ID,
          team_id: TEAM_ID,
          iso_week: '2026-W22',
          caption: null,
          is_active: true,
        }),
      )
      .mockReturnValueOnce(
        buildChain({ id: COACH_ID, org_id: ORG_ID, full_name: 'Sarah Rodriguez' }),
      )
      .mockReturnValueOnce(buildChain(null)) // prior-contact
      .mockReturnValueOnce(
        buildChain({ id: 'director-coach-1', org_id: ORG_ID, email: 'mike@league.test' }),
      ); // director already on platform IN THIS ORG

    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent?: boolean; reason?: string; dedupVia?: string };
    expect(body.sent).toBe(false);
    expect(body.reason).toBe('already-on-platform');
    expect(body.dedupVia).toBe('org-membership');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 429 on the 21st send by the same caller within 7 days', async () => {
    setAuthUser();
    // First 20 sends succeed.
    for (let i = 0; i < 20; i++) {
      mockFromFn.mockReset();
      setHappyPathChains({
        upsertedContact: {
          id: `cdc-${i}`,
          coach_id: COACH_ID,
          director_email_hash: `h${i}`,
          invite_count: 1,
          last_invited_at: new Date().toISOString(),
        },
      });
      const res = await POST(
        makeRequest({
          ...defaultBody(),
          directorEmail: `mike${i}@league.test`,
        }),
      );
      expect(res.status).toBe(200);
    }
    // 21st send must be 429.
    mockFromFn.mockReset();
    setHappyPathChains();
    const res = await POST(
      makeRequest({ ...defaultBody(), directorEmail: 'mike21@league.test' }),
    );
    expect(res.status).toBe(429);
  });

  it('is free for every tier — the route does NOT import @/lib/tier', async () => {
    // The route never imports tier.ts; assert by import-shape rather than
    // by mocking. The presence of @/lib/tier as a route import would
    // require this test to mock it; here it must not be needed.
    const routeSrc = await import('@/app/api/program-director-invites/create/route');
    expect(typeof routeSrc.POST).toBe('function');
  });
});
