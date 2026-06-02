/**
 * Ticket 0063 — POST /api/coach-follows/new-followers/seen.
 *
 * Advances the caller's `coaches.preferences.last_seen_follow_count` to
 * `now().toISOString()` so the publisher's `<NewFollowersCard />` auto-dismisses
 * on first view. Mirrors 0049's clone-count seen-bookmark pattern, using the
 * jsonb preferences column (no new `coaches` column).
 *
 * Acceptance criteria → tests:
 *  - 401 unauthed.
 *  - 200 + the route writes a new last_seen_follow_count = an ISO string.
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

import { POST } from '@/app/api/coach-follows/new-followers/seen/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const PUBLISHER_ID = 'publisher-coach-id';

function setAuthUser(id: string | null = PUBLISHER_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest() {
  return new Request('http://localhost/api/coach-follows/new-followers/seen', { method: 'POST' });
}

describe('POST /api/coach-follows/new-followers/seen (ticket 0063)', () => {
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

  it('advances coaches.preferences.last_seen_follow_count to an ISO string', async () => {
    setAuthUser();

    // Chain: read prefs, then update.
    const readPrefs = buildChain({ preferences: { existing_key: 'keep_me' } });
    const updatePrefs = buildChain({ id: PUBLISHER_ID });
    mockFromFn.mockReturnValueOnce(readPrefs).mockReturnValueOnce(updatePrefs);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const updateArg = (updatePrefs.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    const newPrefs = updateArg.preferences as Record<string, unknown>;
    expect(typeof newPrefs.last_seen_follow_count).toBe('string');
    // Round-trip the ISO to confirm it's a valid date.
    const parsed = new Date(newPrefs.last_seen_follow_count as string);
    expect(Number.isNaN(parsed.getTime())).toBe(false);

    // Pre-existing prefs survive the merge (no clobber).
    expect(newPrefs.existing_key).toBe('keep_me');
  });
});
