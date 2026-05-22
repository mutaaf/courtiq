/**
 * Vitest regression for GET /api/referrals (ticket 0015 AC2 + AC3).
 *
 * The InviteCoachButton (0015) fetches from this route. These tests assert
 * the route's existing contract is unchanged: lazy-generate and persist
 * the code when absent, no overwrite when already present, 401 when no auth.
 *
 * Pattern mirrors tests/ai/weekly-star.test.ts (chainable in-memory mock).
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

import { GET } from '@/app/api/referrals/route';

function buildChain(data: unknown = null, error: unknown = null, count: number | null = null) {
  const resolved = { data, error, count };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function setNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

describe('GET /api/referrals — regression (ticket 0015 AC2 + AC3)', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC3: 401 when not authenticated
  it('returns 401 when not authenticated', async () => {
    setNoAuth();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 with no DB read when not authenticated', async () => {
    setNoAuth();
    await GET();
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  // AC2: returns existing code unchanged when already present (no overwrite)
  it('returns the existing code unchanged when the coach already has one', async () => {
    setAuthUser('coach-existing');
    const existingPrefs = { referral_code: 'EXIST1' };
    // First from: coaches.select — returns existing code
    const coachChain = buildChain({ id: 'coach-existing', preferences: existingPrefs });
    // Second from: coaches.select count for referral_count — count in resolved value
    const countChain = buildChain(null, null, 2);
    mockFromFn
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(countChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe('EXIST1');
    expect(body.referralCount).toBe(2);
  });

  // AC2: lazy-generate and persist when absent
  it('generates and persists a code when the coach has none', async () => {
    setAuthUser('coach-new');
    // First from: coaches.select — returns coach with no referral_code
    const coachChain = buildChain({ id: 'coach-new', preferences: {} });
    // Second from: coaches.update — persist the generated code
    const updateChain = buildChain({ id: 'coach-new' });
    // Third from: coaches.select count
    const countChain = buildChain(null, null, 0);
    mockFromFn
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(countChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.code).toBe('string');
    expect(body.code.length).toBeGreaterThan(0);
    expect(body.referralCount).toBe(0);
  });
});
