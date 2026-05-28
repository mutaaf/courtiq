/**
 * Ticket 0047 — GET /api/referrals/celebration.
 *
 * Returns the inviter-facing celebration payload:
 *   { show, message, currentCount, latestFirstName }
 *
 * Auth via createServerSupabase().auth.getUser() → 401 on missing user. The
 * route resolves the caller's deterministic referral code via
 * makeReferralCode, counts coaches where preferences->>'referred_by_code'
 * equals that code, reads the caller's own last_seen_referral_count, and
 * picks the most-recent referred coach's FIRST NAME (split from full_name)
 * via a scoped service-role select ordered by created_at DESC LIMIT 1.
 *
 * Privacy: the response NEVER returns the referred coach's email, full name,
 * id, or any non-first-name field. The payload keyset is asserted exactly.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 * Hand-rolled supabase chain mocks reset per beforeEach (LESSONS#0039).
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

import { GET } from '@/app/api/referrals/celebration/route';

interface Chain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (onFulfilled: (v: { data: unknown; error: unknown; count?: number }) => unknown) => Promise<unknown>;
}

function buildChain(
  data: unknown = null,
  { count, error }: { count?: number; error?: unknown } = {},
): Chain {
  const resolved = { data, error: error ?? null, count };
  const chain: Chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled) => Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = '00000000-0000-4000-a000-000000000aaa';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

describe('GET /api/referrals/celebration (ticket 0047)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns show:true with the named message when a new conversion exists', async () => {
    setAuthUser();
    // Order of from() calls inside the route:
    //   1) coaches -> select preferences (caller's own row, for referral_code + last_seen_referral_count)
    //   2) coaches -> select count of rows where preferences->>'referred_by_code' = code
    //   3) coaches -> select most recent referred coach's full_name
    const callerChain = buildChain({
      preferences: {},
      last_seen_referral_count: 0,
    });
    const countChain = buildChain([], { count: 1 });
    const latestChain = buildChain({
      full_name: 'Maya Patel',
      created_at: '2026-05-28T00:00:00.000Z',
    });
    mockFromFn
      .mockReturnValueOnce(callerChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(latestChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.show).toBe(true);
    expect(body.message).toBe('Coach Maya you invited just joined SportsIQ');
    expect(body.currentCount).toBe(1);
    expect(body.latestFirstName).toBe('Maya');
  });

  it('returns show:false when currentCount matches lastSeenCount', async () => {
    setAuthUser();
    const callerChain = buildChain({
      preferences: {},
      last_seen_referral_count: 4,
    });
    const countChain = buildChain([], { count: 4 });
    // Latest still queried but the helper short-circuits on the count diff.
    const latestChain = buildChain(null);
    mockFromFn
      .mockReturnValueOnce(callerChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(latestChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.show).toBe(false);
    expect(body.message).toBeNull();
    expect(body.currentCount).toBe(4);
  });

  it('returns show:true with anonymous fallback when count advanced but name lookup is null', async () => {
    setAuthUser();
    const callerChain = buildChain({
      preferences: {},
      last_seen_referral_count: 2,
    });
    const countChain = buildChain([], { count: 3 });
    const latestChain = buildChain(null);
    mockFromFn
      .mockReturnValueOnce(callerChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(latestChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.show).toBe(true);
    expect(body.message).toBe('Someone you invited just joined SportsIQ');
    expect(body.currentCount).toBe(3);
    expect(body.latestFirstName).toBeNull();
  });

  it('payload keyset is exactly the four-key allow-list, no email/full-name leakage', async () => {
    setAuthUser();
    const callerChain = buildChain({
      preferences: {},
      last_seen_referral_count: 0,
    });
    const countChain = buildChain([], { count: 1 });
    const latestChain = buildChain({
      // Plant emailish / role / full-name / org id payload — none of these
      // keys may surface on the response.
      full_name: 'Maya Patel',
      email: 'maya@example.com',
      id: 'minor-id-1',
      role: 'head_coach',
      created_at: '2026-05-28T00:00:00.000Z',
    });
    mockFromFn
      .mockReturnValueOnce(callerChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(latestChain);

    const res = await GET();
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ['currentCount', 'latestFirstName', 'message', 'show'].sort(),
    );
    const flat = JSON.stringify(body).toLowerCase();
    expect(flat).not.toContain('maya@example.com');
    expect(flat).not.toContain('patel');
    expect(flat).not.toContain('minor-id-1');
    expect(flat).not.toContain('head_coach');
  });

  it('returns show:false (universal across tiers — no gating)', async () => {
    // Tier is irrelevant; the route does not even read it. This test just
    // documents the contract: the response shape is byte-identical regardless
    // of the caller's tier, since no tier branch exists in the route.
    setAuthUser();
    const callerChain = buildChain({
      preferences: {},
      last_seen_referral_count: 0,
    });
    const countChain = buildChain([], { count: 0 });
    const latestChain = buildChain(null);
    mockFromFn
      .mockReturnValueOnce(callerChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(latestChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.show).toBe(false);
    expect(body.currentCount).toBe(0);
  });
});
