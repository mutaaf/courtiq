/**
 * Ticket 0065 — extension of POST /api/auth/setup to handle the coach-to-
 * director invite claim path.
 *
 * The director taps the secondary CTA in the email and lands on
 * /programs?invite=director&ref=<signed>. They then claim a program, which
 * routes through /signup -> /api/auth/setup. The setup route already
 * handles the 0024 staff invite (`org` slug) and the 0050 parent referral
 * (`programReferralId`); this ticket adds a new parallel `directorInviteRef`
 * that, when verified, attaches the inviting coach's team to the newly-
 * claimed (or newly-created) org by updating the team's org_id.
 *
 * Sibling behaviors (orgSlug, programReferralId) MUST stay byte-identical
 * — assert by NOT mocking them and confirming the new branch only fires
 * when directorInviteRef is present + valid.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38). Mocking shape mirrors the
 * other auth/setup tests (none exist today, so this file follows the
 * drill-shares-create posture).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

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

import { POST } from '@/app/api/auth/setup/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const DIRECTOR_ID = 'director-user-001';

function signDirectorInviteRef(payload: {
  coachId: string;
  teamId: string;
  inviteId: string;
  sentAt: string;
}, secret = 'test-secret-0065'): string {
  // Mirror the helper's payload shape — base64url(json).base64url(hmac).
  const json = JSON.stringify(payload);
  const body = Buffer.from(json).toString('base64url');
  const hmac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${hmac}`;
}

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/setup directorInviteRef branch (ticket 0065)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    process.env.CRON_SECRET = 'test-secret-0065';
    mockGetUser.mockResolvedValue({
      data: { user: { id: DIRECTOR_ID, email: 'director@league.test', user_metadata: {} } },
      error: null,
    });
  });

  it('attaches the inviting coach\'s team to the newly-created org when the ref is valid', async () => {
    const INVITING_COACH_ID = 'coach-uuid-001';
    const INVITING_TEAM_ID = 'team-uuid-001';
    const ref = signDirectorInviteRef({
      coachId: INVITING_COACH_ID,
      teamId: INVITING_TEAM_ID,
      inviteId: 'invite-1',
      sentAt: new Date().toISOString(),
    });

    // The from-call order in the route:
    //   1) coaches existence check  -> null
    //   2) organizations insert -> new org row
    //   3) coaches insert
    //   4) (no `team` claim path)
    //   5) (no programReferralId)
    //   6) [NEW] teams lookup for inviting team -> { id, org_id: null }
    //   7) [NEW] teams update to set org_id = newOrg.id
    mockFromFn
      .mockReturnValueOnce(buildChain(null)) // coaches existence
      .mockReturnValueOnce(buildChain({ id: 'new-org-1', slug: 'director-org' })) // organizations insert
      .mockReturnValueOnce(buildChain(null, null)) // coaches insert
      .mockReturnValueOnce(buildChain({ id: INVITING_TEAM_ID, org_id: null })) // teams lookup
      .mockReturnValueOnce(buildChain(null, null)); // teams update

    const res = await POST(
      makeRequest({
        fullName: 'Mike Director',
        directorInviteRef: ref,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success?: boolean };
    expect(body.success).toBe(true);

    // The teams.update was called.
    const fromCalls = mockFromFn.mock.calls.map((c) => c[0]);
    expect(fromCalls).toContain('teams');
  });

  it('returns 409 when the inviting team is already attached to a DIFFERENT org', async () => {
    const INVITING_COACH_ID = 'coach-uuid-001';
    const INVITING_TEAM_ID = 'team-uuid-001';
    const OTHER_ORG_ID = 'other-org-uuid-001';
    const ref = signDirectorInviteRef({
      coachId: INVITING_COACH_ID,
      teamId: INVITING_TEAM_ID,
      inviteId: 'invite-1',
      sentAt: new Date().toISOString(),
    });

    mockFromFn
      .mockReturnValueOnce(buildChain(null)) // coaches existence
      .mockReturnValueOnce(buildChain({ id: 'new-org-1', slug: 'director-org' })) // org insert
      .mockReturnValueOnce(buildChain(null, null)) // coach insert
      .mockReturnValueOnce(buildChain({ id: INVITING_TEAM_ID, org_id: OTHER_ORG_ID })); // teams lookup: already attached elsewhere

    const res = await POST(
      makeRequest({
        fullName: 'Mike Director',
        directorInviteRef: ref,
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('team-already-attached');
  });

  it('silently ignores a tampered / mis-signed ref (no 4xx, no teams.update)', async () => {
    // Tampered ref — wrong HMAC.
    const tampered = 'eyJjb2FjaElkIjoiYSJ9.bogushmac';
    mockFromFn
      .mockReturnValueOnce(buildChain(null)) // coaches existence
      .mockReturnValueOnce(buildChain({ id: 'new-org-1', slug: 'director-org' }))
      .mockReturnValueOnce(buildChain(null, null));

    const res = await POST(
      makeRequest({
        fullName: 'Mike Director',
        directorInviteRef: tampered,
      }),
    );
    expect(res.status).toBe(200);
    // Never called teams or teams.update.
    const fromCalls = mockFromFn.mock.calls.map((c) => c[0]);
    expect(fromCalls).not.toContain('teams');
  });

  it('silently ignores a missing CRON_SECRET (no crash)', async () => {
    delete process.env.CRON_SECRET;
    const ref = 'anything.anything';
    mockFromFn
      .mockReturnValueOnce(buildChain(null))
      .mockReturnValueOnce(buildChain({ id: 'new-org-1', slug: 'director-org' }))
      .mockReturnValueOnce(buildChain(null, null));

    const res = await POST(
      makeRequest({
        fullName: 'Mike Director',
        directorInviteRef: ref,
      }),
    );
    expect(res.status).toBe(200);
  });
});
