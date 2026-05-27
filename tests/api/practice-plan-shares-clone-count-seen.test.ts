/**
 * Ticket 0049 — POST /api/practice-plan-shares/clone-count/seen.
 *
 * Advances the caller's `coaches.preferences.last_seen_clone_count` to their
 * current 7-day clone count. Mirrors 0047's seen-bookmark pattern but stores
 * the bookmark in the existing `preferences` jsonb (per AC — no new `coaches`
 * column). This is what makes the clone-count home card auto-dismiss on view.
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user.
 *  - The bookmark advances to the caller's current count via an update on
 *    coaches.preferences.last_seen_clone_count.
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

import { POST } from '@/app/api/practice-plan-shares/clone-count/seen/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
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
  return new Request('http://localhost/api/practice-plan-shares/clone-count/seen', {
    method: 'POST',
  });
}

describe('POST /api/practice-plan-shares/clone-count/seen (ticket 0049)', () => {
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

  it('advances the bookmark on coaches.preferences.last_seen_clone_count', async () => {
    setAuthUser();
    const publishedPlansChain = buildChain([
      { id: 'plan-A', title: 'Tuesday Practice' },
    ]);
    const clonesChain = buildChain([
      { source_plan_id: 'plan-A' },
      { source_plan_id: 'plan-A' },
    ]);
    const coachReadChain = buildChain({ preferences: { last_seen_clone_count: 0 } });
    const coachUpdateChain = buildChain({ id: COACH_ID });
    mockFromFn
      .mockReturnValueOnce(publishedPlansChain)
      .mockReturnValueOnce(clonesChain)
      .mockReturnValueOnce(coachReadChain)
      .mockReturnValueOnce(coachUpdateChain);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const updateArg = (coachUpdateChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    const newPrefs = updateArg.preferences as Record<string, unknown>;
    expect(newPrefs.last_seen_clone_count).toBe(2);
  });
});
