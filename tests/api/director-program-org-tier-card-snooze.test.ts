/**
 * Ticket 0087 — POST /api/admin/program-org-tier-card/snooze.
 *
 * Schema-wins-over-prose deviation (LESSONS#0096): the ticket prose names
 * the route under `/api/director/…`; this repo's director surfaces all
 * live under `/api/admin/…` (the program-pulse component, the admin page).
 * The snooze route follows the same convention.
 *
 * The route: an admin director taps "Maybe later" on the program-org-tier
 * card; the route writes an `org_card_snoozes` row keyed by
 * (org_id, card_kind: 'program_org_tier', snoozed_until: now() + 14 days).
 * The card stays hidden until the snooze expires.
 *
 * COPPA: writes the snooze metadata only — no minor data ever rides on
 * the row.
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
    from: mockFromFn,
  })),
  createServiceSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromFn,
  })),
}));

import { POST as snoozePost } from '@/app/api/admin/program-org-tier-card/snooze/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function makeRequest(orgId: unknown = 'org-1') {
  return new Request('http://localhost/api/admin/program-org-tier-card/snooze', {
    method: 'POST',
    body: JSON.stringify({ orgId }),
    headers: { 'Content-Type': 'application/json' },
  });
}

const upsertSpy = vi.fn();

function wireAdmin(opts: { callerRole?: string; callerOrgId?: string } = {}) {
  const role = opts.callerRole ?? 'admin';
  const callerOrgId = opts.callerOrgId ?? 'org-1';
  upsertSpy.mockReset();
  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      const callerRow = {
        id: 'coach-1',
        org_id: callerOrgId,
        role,
      };
      const chain = buildChain(null) as any;
      chain.single = vi.fn().mockResolvedValue({ data: callerRow, error: null });
      return chain;
    }
    if (table === 'org_card_snoozes') {
      const chain = buildChain(null) as any;
      chain.upsert = upsertSpy.mockReturnValue(chain);
      chain.then = (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(onFulfilled);
      return chain;
    }
    return buildChain(null);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/program-org-tier-card/snooze (ticket 0087)', () => {
  it('returns 401 unauthed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await snoozePost(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin caller', async () => {
    setAuthUser('coach-2');
    wireAdmin({ callerRole: 'coach' });
    const res = await snoozePost(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns 400 when orgId is missing', async () => {
    setAuthUser('coach-1');
    wireAdmin();
    const res = await snoozePost(
      new Request('http://localhost/api/admin/program-org-tier-card/snooze', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when caller is admin of a different org than the one in the body', async () => {
    setAuthUser('coach-1');
    wireAdmin({ callerRole: 'admin', callerOrgId: 'org-999' });
    const res = await snoozePost(makeRequest('org-1'));
    expect([403, 404]).toContain(res.status);
  });

  it('writes a 14-day snooze for the admin director (success)', async () => {
    setAuthUser('coach-1');
    wireAdmin({ callerRole: 'admin', callerOrgId: 'org-1' });
    const res = await snoozePost(makeRequest('org-1'));
    expect(res.status).toBe(200);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const upsertArgs = upsertSpy.mock.calls[0][0];
    expect(upsertArgs.org_id).toBe('org-1');
    expect(upsertArgs.card_kind).toBe('program_org_tier');
    expect(upsertArgs.snoozed_by_coach_id).toBe('coach-1');
    // snoozed_until is ~14 days in the future.
    const until = Date.parse(upsertArgs.snoozed_until);
    const expected = Date.now() + 14 * 24 * 60 * 60 * 1000;
    expect(Math.abs(until - expected)).toBeLessThan(60 * 1000);
  });
});
