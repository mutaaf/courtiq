/**
 * Ticket 0047 — POST /api/referrals/celebration/seen.
 *
 * Advances the caller's coaches.last_seen_referral_count to their CURRENT
 * referral count, recomputed server-side. The route NEVER trusts a
 * client-supplied count (same pattern as LESSONS#0039 for the drill-signal
 * coach_id). A re-POST is idempotent: the second call writes the same
 * server-recomputed value.
 *
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

import { POST } from '@/app/api/referrals/celebration/seen/route';

interface Chain {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (onFulfilled: (v: { data: unknown; error: unknown; count?: number }) => unknown) => Promise<unknown>;
}

function buildChain(
  data: unknown = null,
  { count, error }: { count?: number; error?: unknown } = {},
): Chain {
  const resolved = { data, error: error ?? null, count };
  const chain: Chain = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
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

function makeRequest(body?: unknown) {
  return new Request('http://localhost/api/referrals/celebration/seen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

describe('POST /api/referrals/celebration/seen (ticket 0047)', () => {
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

  it('recomputes the count server-side and ignores a forged client-supplied count', async () => {
    setAuthUser();
    // Order:
    //   1) coaches -> select preferences (caller's referral_code source)
    //   2) coaches -> count by referred_by_code
    //   3) coaches -> update last_seen_referral_count
    const callerChain = buildChain({ preferences: {} });
    const countChain = buildChain([], { count: 2 });
    const updateChain = buildChain(null);
    mockFromFn
      .mockReturnValueOnce(callerChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(updateChain);

    // A forged 999 in the body must be ignored.
    const res = await POST(makeRequest({ currentCount: 999 }));
    expect(res.status).toBe(204);

    const updateArg = (updateChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(updateArg.last_seen_referral_count).toBe(2);
    expect(updateArg.last_seen_referral_count).not.toBe(999);
  });

  it('is idempotent on re-POST (second call writes the same server-computed value)', async () => {
    setAuthUser();
    // First call.
    const callerChain1 = buildChain({ preferences: {} });
    const countChain1 = buildChain([], { count: 3 });
    const updateChain1 = buildChain(null);
    // Second call (same auth + state).
    const callerChain2 = buildChain({ preferences: {} });
    const countChain2 = buildChain([], { count: 3 });
    const updateChain2 = buildChain(null);
    mockFromFn
      .mockReturnValueOnce(callerChain1)
      .mockReturnValueOnce(countChain1)
      .mockReturnValueOnce(updateChain1)
      .mockReturnValueOnce(callerChain2)
      .mockReturnValueOnce(countChain2)
      .mockReturnValueOnce(updateChain2);

    const r1 = await POST(makeRequest());
    const r2 = await POST(makeRequest());
    expect(r1.status).toBe(204);
    expect(r2.status).toBe(204);

    const v1 = (updateChain1.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    const v2 = (updateChain2.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(v1.last_seen_referral_count).toBe(3);
    expect(v2.last_seen_referral_count).toBe(3);
  });

  it('does not require a request body (empty POST works)', async () => {
    setAuthUser();
    const callerChain = buildChain({ preferences: {} });
    const countChain = buildChain([], { count: 0 });
    const updateChain = buildChain(null);
    mockFromFn
      .mockReturnValueOnce(callerChain)
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(updateChain);

    const res = await POST(makeRequest());
    expect(res.status).toBe(204);
  });
});
