/**
 * Ticket 0063 — GET /api/coach-follows/new-followers.
 *
 * The publisher-side notification source. Returns the rows in `coach_follows`
 * whose `followee_id = auth.user.id` AND `created_at > coaches.preferences
 * .last_seen_follow_count` bookmark, in the last 7 days. Caps the named-line
 * list at 5; a remainder is returned as `extraCount`.
 *
 * Dedup posture: a follower contributing more than one row per week (e.g.
 * unfollow + re-follow) is still ONE line per render — the route returns
 * distinct follower coaches.
 *
 * Acceptance criteria → tests:
 *  - 401 unauthed.
 *  - happy path with 3 new follows → 3 named lines (first-name only), 0 extra.
 *  - cap at 5: 7 new follows → 5 named lines + extraCount = 2.
 *  - bookmark advances: rows older than `last_seen_follow_count` are excluded.
 *  - dedup: same follower appearing twice in the window is ONE line.
 *  - Privacy: response never carries the follower's full_name, email, or any
 *    contact field.
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

import { GET } from '@/app/api/coach-follows/new-followers/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
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
  return new Request('http://localhost/api/coach-follows/new-followers');
}

describe('GET /api/coach-follows/new-followers (ticket 0063)', () => {
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

  it('happy path: returns 3 first-name-only lines + extraCount=0', async () => {
    setAuthUser();

    // The bookmark is at the epoch (so every row counts).
    const coachPrefsChain = buildChain({ preferences: { last_seen_follow_count: '1970-01-01T00:00:00.000Z' } });
    const followsChain = buildChain([
      { follower_id: 'fol-A', created_at: '2026-06-01T10:00:00.000Z' },
      { follower_id: 'fol-B', created_at: '2026-06-01T09:00:00.000Z' },
      { follower_id: 'fol-C', created_at: '2026-06-01T08:00:00.000Z' },
    ]);
    const followerCoachesChain = buildChain([
      { id: 'fol-A', full_name: 'Sarah Rodriguez' },
      { id: 'fol-B', full_name: 'Jordan Lee' },
      { id: 'fol-C', full_name: 'Maya Chen' },
    ]);
    mockFromFn
      .mockReturnValueOnce(coachPrefsChain)
      .mockReturnValueOnce(followsChain)
      .mockReturnValueOnce(followerCoachesChain);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lines: Array<{ followerFirstName: string }>;
      extraCount: number;
      total: number;
    };

    expect(body.lines).toHaveLength(3);
    expect(body.lines.map((l) => l.followerFirstName).sort()).toEqual(['Jordan', 'Maya', 'Sarah']);
    expect(body.extraCount).toBe(0);
    expect(body.total).toBe(3);

    // Privacy: response NEVER carries a full_name / email / phone / contact field.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('Rodriguez');
    expect(serialized).not.toContain('full_name');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('phone');
  });

  it('caps named lines at 5 and returns extraCount for the remainder', async () => {
    setAuthUser();

    const coachPrefsChain = buildChain({ preferences: {} });
    const followsRows = [
      { follower_id: 'fol-1', created_at: '2026-06-01T10:00:00.000Z' },
      { follower_id: 'fol-2', created_at: '2026-06-01T09:00:00.000Z' },
      { follower_id: 'fol-3', created_at: '2026-06-01T08:00:00.000Z' },
      { follower_id: 'fol-4', created_at: '2026-06-01T07:00:00.000Z' },
      { follower_id: 'fol-5', created_at: '2026-06-01T06:00:00.000Z' },
      { follower_id: 'fol-6', created_at: '2026-06-01T05:00:00.000Z' },
      { follower_id: 'fol-7', created_at: '2026-06-01T04:00:00.000Z' },
    ];
    const followsChain = buildChain(followsRows);
    const followerCoachesChain = buildChain([
      { id: 'fol-1', full_name: 'Alpha One' },
      { id: 'fol-2', full_name: 'Beta Two' },
      { id: 'fol-3', full_name: 'Gamma Three' },
      { id: 'fol-4', full_name: 'Delta Four' },
      { id: 'fol-5', full_name: 'Epsilon Five' },
      { id: 'fol-6', full_name: 'Zeta Six' },
      { id: 'fol-7', full_name: 'Eta Seven' },
    ]);
    mockFromFn
      .mockReturnValueOnce(coachPrefsChain)
      .mockReturnValueOnce(followsChain)
      .mockReturnValueOnce(followerCoachesChain);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lines: Array<{ followerFirstName: string }>;
      extraCount: number;
      total: number;
    };

    expect(body.lines).toHaveLength(5);
    expect(body.extraCount).toBe(2);
    expect(body.total).toBe(7);
  });

  it('dedupes a follower appearing twice within the window to ONE line', async () => {
    setAuthUser();

    const coachPrefsChain = buildChain({ preferences: {} });
    const followsChain = buildChain([
      { follower_id: 'fol-X', created_at: '2026-06-01T10:00:00.000Z' },
      { follower_id: 'fol-X', created_at: '2026-05-30T10:00:00.000Z' }, // duplicate within window
      { follower_id: 'fol-Y', created_at: '2026-06-01T09:00:00.000Z' },
    ]);
    const followerCoachesChain = buildChain([
      { id: 'fol-X', full_name: 'Alex River' },
      { id: 'fol-Y', full_name: 'Bryn Stone' },
    ]);
    mockFromFn
      .mockReturnValueOnce(coachPrefsChain)
      .mockReturnValueOnce(followsChain)
      .mockReturnValueOnce(followerCoachesChain);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lines: Array<{ followerFirstName: string }>;
      total: number;
    };

    expect(body.lines).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.lines.map((l) => l.followerFirstName).sort()).toEqual(['Alex', 'Bryn']);
  });

  it('excludes follows older than the last_seen_follow_count bookmark', async () => {
    setAuthUser();

    // The bookmark is set to a recent ISO — only rows AFTER it should count.
    const coachPrefsChain = buildChain({
      preferences: { last_seen_follow_count: '2026-06-01T08:30:00.000Z' },
    });
    // Three rows total; we EXPECT the route to issue a .gte('created_at', bookmark)
    // so the underlying DB returns the post-bookmark rows. We model that here.
    const followsChain = buildChain([
      { follower_id: 'fol-new-1', created_at: '2026-06-01T10:00:00.000Z' },
      { follower_id: 'fol-new-2', created_at: '2026-06-01T09:00:00.000Z' },
    ]);
    const followerCoachesChain = buildChain([
      { id: 'fol-new-1', full_name: 'New One' },
      { id: 'fol-new-2', full_name: 'New Two' },
    ]);
    mockFromFn
      .mockReturnValueOnce(coachPrefsChain)
      .mockReturnValueOnce(followsChain)
      .mockReturnValueOnce(followerCoachesChain);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lines: unknown[]; total: number };
    expect(body.total).toBe(2);

    // Assert the route applied a .gte on created_at (we don't pin the exact
    // boundary — the bookmark OR a 7-day window, whichever is later).
    expect(followsChain.gte).toHaveBeenCalled();
  });
});
