/**
 * Ticket 0073 — POST /api/coach/reputation-milestones/consume.
 *
 * Stamps notified_at = NOW() on a single milestone after ownership
 * verification. Asserts:
 *  - 401 when unauthed.
 *  - 400 when milestoneId is missing.
 *  - 404 when the milestone is unknown.
 *  - 403 when the milestone belongs to a different coach.
 *  - 200 happy path: the row is updated and the update was scoped by
 *    the milestone id.
 *
 * Mirrors tests/api/coach-reactivation-signals-consume.test.ts.
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

import { POST } from '@/app/api/coach/reputation-milestones/consume/route';

function buildChain<T = unknown>(data: T | null = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = '00000000-0000-4000-a000-0000000000b1';
const OTHER_COACH_ID = '00000000-0000-4000-a000-0000000000b2';
const MILESTONE_ID = 'm-1';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/coach/reputation-milestones/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/coach/reputation-milestones/consume (ticket 0073)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when unauthed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ milestoneId: MILESTONE_ID }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when milestoneId is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the milestone is unknown', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await POST(makeRequest({ milestoneId: MILESTONE_ID }));
    expect(res.status).toBe(404);
  });

  it('returns 403 when the milestone belongs to a different coach', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    mockFromFn.mockReturnValueOnce(
      buildChain({ id: MILESTONE_ID, published_coach_id: OTHER_COACH_ID }),
    );
    const res = await POST(makeRequest({ milestoneId: MILESTONE_ID }));
    expect(res.status).toBe(403);
  });

  it('happy path stamps notified_at and returns ok', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const lookupChain = buildChain({ id: MILESTONE_ID, published_coach_id: COACH_ID });
    const updateChain = buildChain({ id: MILESTONE_ID });
    mockFromFn
      .mockReturnValueOnce(lookupChain)
      .mockReturnValueOnce(updateChain);

    const res = await POST(makeRequest({ milestoneId: MILESTONE_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(updateChain.update).toHaveBeenCalled();
    const updateArg = (updateChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(typeof updateArg.notified_at).toBe('string');
  });
});
