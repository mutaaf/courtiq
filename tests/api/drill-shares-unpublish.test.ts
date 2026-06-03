/**
 * Ticket 0064 — POST /api/drill-shares/[token]/unpublish.
 *
 * Flips is_active=false on a drill_shares row owned by the caller. The
 * route is idempotent: hitting it twice (or hitting it for a row that
 * doesn't exist on the caller's set) returns 200 with
 * { wasPublished: false }. The public page at /drill/<token> then returns
 * 410 — never 404 — so a bookmarked-link visitor sees "this was
 * unpublished" rather than a confusing not-found (asserted by the public
 * GET test).
 *
 * Acceptance criteria → tests:
 *  - 401 unauthed.
 *  - 200 + flips the row to is_active=false on the happy path.
 *  - 200 + { wasPublished: false } when no row exists for the caller (idempotent).
 *  - 200 + { wasPublished: false } when the row exists but is already
 *    is_active=false (idempotent on the already-unpublished case).
 *
 * Mocking pattern mirrors tests/api/practice-plan-shares-create.test.ts.
 * .test.ts NOT .spec.ts (LESSONS#38).
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

import { POST } from '@/app/api/drill-shares/[token]/unpublish/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = 'coach-1';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest() {
  return new Request('http://localhost/api/drill-shares/abc/unpublish', {
    method: 'POST',
  });
}

function paramsFor(token: string) {
  return { params: Promise.resolve({ token }) };
}

describe('POST /api/drill-shares/[token]/unpublish (ticket 0064)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(401);
  });

  it('flips is_active=false on the happy path + returns wasPublished:true', async () => {
    setAuthUser();
    const existingChain = buildChain({
      id: 'share-1',
      coach_id: COACH_ID,
      share_token: 'abc',
      is_active: true,
    });
    const updateChain = buildChain({ id: 'share-1', is_active: false });
    mockFromFn
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(updateChain);

    const res = await POST(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { wasPublished?: boolean };
    expect(body.wasPublished).toBe(true);
    expect(updateChain.update).toHaveBeenCalled();
  });

  it('is idempotent: 200 + wasPublished:false when no row exists for the caller', async () => {
    setAuthUser();
    const existingChain = buildChain(null);
    mockFromFn.mockReturnValueOnce(existingChain);

    const res = await POST(makeRequest(), paramsFor('does-not-exist'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { wasPublished?: boolean };
    expect(body.wasPublished).toBe(false);
  });

  it('is idempotent: 200 + wasPublished:false when the row is already is_active=false', async () => {
    setAuthUser();
    const existingChain = buildChain({
      id: 'share-1',
      coach_id: COACH_ID,
      share_token: 'abc',
      is_active: false,
    });
    mockFromFn.mockReturnValueOnce(existingChain);

    const res = await POST(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { wasPublished?: boolean };
    expect(body.wasPublished).toBe(false);
  });
});
