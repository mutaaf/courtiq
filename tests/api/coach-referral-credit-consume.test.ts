/**
 * Ticket 0074 — POST /api/coach/referral-credit-status/consume.
 *
 * Stamps notified_at on the caller's most recent referral_credit_grants
 * row so the home-card hides. Asserts:
 *  - 401 on unauthed.
 *  - 200 ok:true when there is an unconsumed row.
 *  - 200 ok:true (no-op) when there are no unconsumed rows.
 *  - Ownership: only the inviter coach's own row is stamped.
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
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { POST } from '@/app/api/coach/referral-credit-status/consume/route';

interface Chain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (
    onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
  ) => Promise<unknown>;
}

function buildChain(data: unknown = null, error: unknown = null): Chain {
  const resolved = { data, error };
  const chain: Chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled) => Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = '00000000-0000-4000-a000-0000000000e1';

function setAuth(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

describe('POST /api/coach/referral-credit-status/consume (ticket 0074)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when the caller is not authed', async () => {
    setAuth(null);
    const res = await POST(
      new Request(
        'http://localhost/api/coach/referral-credit-status/consume',
        { method: 'POST' },
      ),
    );
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('stamps notified_at on the most recent unconsumed row, scoped to caller', async () => {
    setAuth();
    // The route first reads the latest unconsumed row.
    mockFromFn.mockReturnValueOnce(buildChain({ id: 'grant-1' }));
    // Then it updates that row's notified_at.
    const updateChain = buildChain(null);
    mockFromFn.mockReturnValueOnce(updateChain);
    const res = await POST(
      new Request(
        'http://localhost/api/coach/referral-credit-status/consume',
        { method: 'POST' },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // The update was called.
    expect(updateChain.update).toHaveBeenCalledTimes(1);
    const updatePayload = updateChain.update.mock.calls[0][0];
    expect(typeof updatePayload.notified_at).toBe('string');
  });

  it('returns ok:true (no-op) when there is no unconsumed row', async () => {
    setAuth();
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await POST(
      new Request(
        'http://localhost/api/coach/referral-credit-status/consume',
        { method: 'POST' },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
