/**
 * Ticket 0089 — POST /api/coach/paid-receipts/dismiss.
 *
 * The day-60 receipts card's "Got it" button calls this route. The
 * route UPSERTs a row into `coach_first_signal_celebrations` with
 * `kind: 'paid_receipts_d60'` so the next GET sees the row in the
 * dedup table and returns `eligible: false`.
 *
 * Acceptance criteria mapping:
 *  (i)   happy path: authed dismiss writes the row via UPSERT.
 *  (ii)  re-dismiss is idempotent (UNIQUE(coach_id, kind) +
 *        ON CONFLICT (coach_id, kind)).
 *  (iii) unauthed caller → 401.
 *  (iv)  post-dismiss GET returns eligible: false — covered by the
 *        GET route test's "already dismissed" case; this file
 *        asserts the UPSERT shape that produces that row.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #0038).
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

import { POST } from '@/app/api/coach/paid-receipts/dismiss/route';

const COACH_ID = '00000000-0000-4000-a000-0000000000c1';

function buildUpsertChain() {
  const resolved = { data: null, error: null };
  const c: Record<string, unknown> = {
    upsert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return c;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/coach/paid-receipts/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/coach/paid-receipts/dismiss (ticket 0089)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('(iii) unauthed caller → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it('(i) authed dismiss writes the row via UPSERT', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const chain = buildUpsertChain();
    mockFromFn.mockReturnValue(chain);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(chain.upsert).toHaveBeenCalled();
    const upsertArg = (chain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(upsertArg.coach_id).toBe(COACH_ID);
    expect(upsertArg.kind).toBe('paid_receipts_d60');
    expect(typeof upsertArg.dismissed_at).toBe('string');
  });

  it('writes against the coach_first_signal_celebrations table (shared 0088 dedup primitive)', () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const chain = buildUpsertChain();
    mockFromFn.mockReturnValue(chain);
    return POST(makeRequest({})).then(() => {
      const tablesUsed = (mockFromFn as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
      expect(tablesUsed).toContain('coach_first_signal_celebrations');
    });
  });

  it('(ii) a second dismiss is idempotent (UPSERT-shaped on the (coach_id, kind) unique)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const chain = buildUpsertChain();
    mockFromFn.mockReturnValue(chain);
    await POST(makeRequest({}));
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const lastCall = (chain.upsert as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    const opts = lastCall?.[1] as { onConflict?: string } | undefined;
    expect(opts?.onConflict).toContain('coach_id');
    expect(opts?.onConflict).toContain('kind');
  });
});
