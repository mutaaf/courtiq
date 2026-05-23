/**
 * Vitest — GET /api/org/invite (ticket 0024).
 *
 * The authenticated director-side route that hands the program director ONE
 * org-scoped staff-invite link they can broadcast in their coaches' group chat.
 * The director-side control (settings/referrals) fetches this via query().
 *
 * Maps 1:1 to the ticket's acceptance criteria:
 *  - AC2: no auth → 401, and NO DB read happens (the service client is never used)
 *  - AC1: an authed coach whose org has a slug → 200 { url } where url ends in
 *         /org/<slug>?invite=staff
 *  - AC1: an authed coach with no org / no slug → 200 { url: null } (graceful, not 500)
 *  - AC3 / AC6 (privacy / data-minimization): the response body has ONLY the `url`
 *         key — no coach list, no player data, no email, no name; and the URL
 *         carries ONLY the org slug + invite param (no PII).
 *
 * File is `.test.ts` (NOT `.spec.ts`): vitest.config.ts excludes the spec glob
 * (those are Playwright). See docs/LESSONS.md.
 *
 * Pattern mirrors tests/referrals-route.test.ts (auth + chainable service mock).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockServiceFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockServiceFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({
    from: mockServiceFromFn,
  })),
}));

import { GET } from '@/app/api/org/invite/route';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
  };
  return chain;
}

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function setNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

describe('GET /api/org/invite — program staff-invite link (ticket 0024)', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC2: 401 when not authenticated, and no DB read.
  it('returns 401 when not authenticated', async () => {
    setNoAuth();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('performs no DB read when not authenticated', async () => {
    setNoAuth();
    await GET();
    expect(mockServiceFromFn).not.toHaveBeenCalled();
  });

  // AC1: an authed coach whose org has a slug → 200 { url } ending in /org/<slug>?invite=staff
  it('returns the org staff-invite URL for a coach whose org has a slug', async () => {
    setAuthUser('coach-with-org');
    // 1st from: coaches.select(org_id) → the caller's org id
    const coachChain = buildChain({ org_id: 'org-99' });
    // 2nd from: organizations.select(slug) → the org's slug
    const orgChain = buildChain({ slug: 'lincoln-rec-league' });
    mockServiceFromFn
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(orgChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe(`${APP_URL}/org/lincoln-rec-league?invite=staff`);
  });

  // AC1: graceful null when the coach has no org.
  it('returns { url: null } when the coach has no org', async () => {
    setAuthUser('coach-no-org');
    const coachChain = buildChain({ org_id: null });
    mockServiceFromFn.mockReturnValueOnce(coachChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBeNull();
  });

  // AC1: graceful null when the org exists but has no slug.
  it('returns { url: null } when the org has no slug', async () => {
    setAuthUser('coach-org-no-slug');
    const coachChain = buildChain({ org_id: 'org-77' });
    const orgChain = buildChain({ slug: null });
    mockServiceFromFn
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(orgChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBeNull();
  });

  // AC1: graceful null when the coach row is missing entirely (never 500).
  it('returns { url: null } when the coach row is missing', async () => {
    setAuthUser('ghost-coach');
    const coachChain = buildChain(null);
    mockServiceFromFn.mockReturnValueOnce(coachChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBeNull();
  });

  // AC3 / AC6 (privacy / data-minimization): the response body carries ONLY `url`.
  it('exposes ONLY { url } — no coach list, email, name, or player data', async () => {
    setAuthUser('coach-private');
    const coachChain = buildChain({ org_id: 'org-1', email: 'dir@example.com', full_name: 'Dana Ruiz' });
    const orgChain = buildChain({ slug: 'eastside-hoops', name: 'Eastside Hoops' });
    mockServiceFromFn
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(orgChain);

    const res = await GET();
    const body = await res.json();

    expect(Object.keys(body)).toEqual(['url']);

    const raw = JSON.stringify(body);
    expect(raw).not.toContain('dir@example.com');
    expect(raw).not.toContain('Dana');
    expect(raw).not.toContain('Eastside Hoops'); // org NAME is not in the link
    expect(raw).not.toMatch(/player/i);
  });

  // AC6 (privacy): the invite URL carries ONLY the slug + the invite param.
  it('the invite URL carries only the org slug and the invite param', async () => {
    setAuthUser('coach-url');
    const coachChain = buildChain({ org_id: 'org-2' });
    const orgChain = buildChain({ slug: 'westwood-soccer' });
    mockServiceFromFn
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(orgChain);

    const res = await GET();
    const body = await res.json();
    const url = body.url as string;

    expect(url).toContain('/org/westwood-soccer');
    expect(url).toContain('invite=staff');
    // Exactly one query-string segment, and it is the invite param only.
    expect(url.split('?').length).toBe(2);
    expect(url.split('?')[1]).toBe('invite=staff');
  });
});
