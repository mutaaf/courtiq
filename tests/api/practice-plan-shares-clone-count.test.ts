/**
 * Ticket 0049 — GET /api/practice-plan-shares/clone-count.
 *
 * Returns the count of clones of the caller's published practice plans in the
 * last 7 days, plus a per-plan breakdown { plan_id, plan_title, count }. NO
 * cloning-coach identity ever crosses this route — the publisher sees only the
 * aggregate count, never which coach cloned (ticket decision: coach-private).
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user.
 *  - 200 happy path: count >= 1 with a per-plan breakdown that includes the
 *    cloned plan's title; NO coach_id of any cloning coach is in the response.
 *  - The lastSeenCount bookmark rides through unchanged from coaches.preferences.
 *  - count: 0 returns a coherent empty payload (count=0, byPlan=[]).
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

import { GET } from '@/app/api/practice-plan-shares/clone-count/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = 'publisher-coach';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest() {
  return new Request('http://localhost/api/practice-plan-shares/clone-count');
}

describe('GET /api/practice-plan-shares/clone-count (ticket 0049)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('happy path: returns count + byPlan with NO cloning-coach identity', async () => {
    setAuthUser();
    const publishedPlansChain = buildChain([
      { id: 'plan-A', title: 'Tuesday Practice' },
      { id: 'plan-B', title: 'Closeouts + Scrimmage' },
    ]);
    const clonesChain = buildChain([
      // Each clone row joins back to the source plan via source_plan_id; the
      // cloning coach_id is NEVER read or returned.
      { source_plan_id: 'plan-A' },
      { source_plan_id: 'plan-A' },
      { source_plan_id: 'plan-A' },
      { source_plan_id: 'plan-B' },
    ]);
    const coachPrefsChain = buildChain({ preferences: { last_seen_clone_count: 1 } });
    mockFromFn
      .mockReturnValueOnce(publishedPlansChain)
      .mockReturnValueOnce(clonesChain)
      .mockReturnValueOnce(coachPrefsChain);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      byPlan: Array<{ plan_id: string; plan_title: string; count: number }>;
      lastSeenCount?: number;
    };

    expect(body.count).toBe(4);
    expect(body.lastSeenCount).toBe(1);
    // Per-plan counts include the source plan TITLE (publisher's own plan — fine).
    const byId = Object.fromEntries(body.byPlan.map((r) => [r.plan_id, r]));
    expect(byId['plan-A']).toEqual({ plan_id: 'plan-A', plan_title: 'Tuesday Practice', count: 3 });
    expect(byId['plan-B']).toEqual({ plan_id: 'plan-B', plan_title: 'Closeouts + Scrimmage', count: 1 });

    // No cloning-coach identifier of any kind in the serialized response.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('coach_id');
    expect(serialized).not.toContain('cloner');
  });

  it('count: 0 returns a coherent empty payload', async () => {
    setAuthUser();
    const publishedPlansChain = buildChain([{ id: 'plan-A', title: 'Tuesday Practice' }]);
    const clonesChain = buildChain([]);
    const coachPrefsChain = buildChain({ preferences: { last_seen_clone_count: 0 } });
    mockFromFn
      .mockReturnValueOnce(publishedPlansChain)
      .mockReturnValueOnce(clonesChain)
      .mockReturnValueOnce(coachPrefsChain);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number; byPlan: unknown[] };
    expect(body.count).toBe(0);
    expect(body.byPlan).toEqual([]);
  });
});
