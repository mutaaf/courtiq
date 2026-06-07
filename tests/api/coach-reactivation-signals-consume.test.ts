/**
 * Ticket 0072 — POST /api/coach/reactivation-signals/consume.
 *
 * Stamps consumed_at on a single signal after ownership check. Asserts:
 *  - 401 on unauthed.
 *  - 200 + row updated on the caller's own signal.
 *  - 403 on someone else's signal.
 *  - 404 on an unknown signalId.
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

import { POST } from '@/app/api/coach/reactivation-signals/consume/route';

function buildChain<T = unknown>(data: T | null = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const CALLER_ID = '00000000-0000-4000-a000-0000000000b1';
const OTHER_COACH_ID = '00000000-0000-4000-a000-0000000000b2';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/coach/reactivation-signals/consume', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/coach/reactivation-signals/consume (ticket 0072)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when no user is authed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ signalId: 'sig-1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when signalId is missing or non-string', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 200 and stamps consumed_at when the caller owns the signal", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } });
    const lookupChain = buildChain({ id: 'sig-1', dormant_coach_id: CALLER_ID });
    const updateChain = buildChain(null);
    mockFromFn.mockReturnValueOnce(lookupChain).mockReturnValueOnce(updateChain);
    const res = await POST(makeRequest({ signalId: 'sig-1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // The update was invoked with `{ consumed_at: <iso> }`
    const calls = (updateChain.update as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(1);
    const payload = calls[0][0] as { consumed_at: string };
    expect(typeof payload.consumed_at).toBe('string');
    expect(Number.isFinite(Date.parse(payload.consumed_at))).toBe(true);
  });

  it('returns 403 when the signal belongs to a different coach', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } });
    const lookupChain = buildChain({ id: 'sig-1', dormant_coach_id: OTHER_COACH_ID });
    mockFromFn.mockReturnValueOnce(lookupChain);
    const res = await POST(makeRequest({ signalId: 'sig-1' }));
    expect(res.status).toBe(403);
  });

  it('returns 404 when the signalId is unknown', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: CALLER_ID } } });
    const lookupChain = buildChain(null);
    mockFromFn.mockReturnValueOnce(lookupChain);
    const res = await POST(makeRequest({ signalId: 'nonexistent' }));
    expect(res.status).toBe(404);
  });
});
