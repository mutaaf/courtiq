/**
 * Ticket 0064 — GET /api/drill-shares/[token]  (public, no auth).
 *
 * Resolves a token → its drill_shares row → the underlying drill's name +
 * setup + the publishing coach's FIRST name (server-side split) + the
 * optional handle. The payload is an explicit allow-list — anything else
 * (last name, email, parent/player data) is not exposed.
 *
 * Acceptance criteria → tests:
 *  - 404 when the token is unknown (no row).
 *  - 410 when the row is is_active=false (the cloning coach who bookmarked
 *    the link sees "the publisher unpublished this drill" rather than a
 *    confusing not-found).
 *  - 200 happy path returns the keyset:
 *      { drill: { id, name, setup, sportSlug, ageGroupHint },
 *        caption, publisher: { id, firstName, handle }, createdAt, isActive }
 *  - Publisher's first name only — last name + email NEVER leak.
 *  - publisher.id is the coach UUID (LESSONS#0009 — exposing it lets the
 *    public page's 0063 follow card POST { followee_id } without a second
 *    round-trip; the coach id is NOT minor data and is already implicit in
 *    the public token).
 *  - The handle is `coaches.handle` if set, else null.
 *  - Planted player/team data (foreign to this table) does NOT leak.
 *
 * Mocking pattern mirrors tests/api/practice-plan-shares-token-get.test.ts.
 * .test.ts NOT .spec.ts (LESSONS#38). The route takes a `params` promise.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFromFn } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(async () => ({
    from: mockFromFn,
  })),
}));

import { GET } from '@/app/api/drill-shares/[token]/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function makeRequest() {
  return new Request('http://localhost/api/drill-shares/abc');
}

function paramsFor(token: string) {
  return { params: Promise.resolve({ token }) };
}

const ACTIVE_SHARE = {
  id: 'share-1',
  coach_id: 'coach-1',
  drill_id: 'drill-1',
  share_token: 'abc',
  caption: 'Finally got my U10s to finish their closeouts.',
  is_active: true,
  created_at: '2026-06-03T14:00:00Z',
};

const DRILL = {
  id: 'drill-1',
  name: 'Closeout Drill',
  setup_instructions:
    'Players close out on the shooter from the elbow.\nFocus on chest-to-the-ball-handler.',
  age_groups: ['8-10', '11-13'],
  // sports.slug resolution is a join in the route.
  sport_id: 'sport-bball',
};

const SPORT = { id: 'sport-bball', slug: 'basketball' };

const PUBLISHER_COACH = {
  id: 'coach-1',
  full_name: 'Sarah Rodriguez',
  email: 'sarah@example.com',
  handle: 'sarah-r',
};

describe('GET /api/drill-shares/[token] (ticket 0064)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 404 when the token is unknown (no row)', async () => {
    // First lookup returns null → the route treats unknown-token as 404.
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await GET(makeRequest(), paramsFor('does-not-exist'));
    expect(res.status).toBe(404);
  });

  it('returns 410 when the share row is is_active=false', async () => {
    // The route reads the row WITHOUT the is_active filter so it can
    // distinguish unknown (404) from unpublished (410).
    const shareChain = buildChain({ ...ACTIVE_SHARE, is_active: false });
    mockFromFn.mockReturnValueOnce(shareChain);
    const res = await GET(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(410);
  });

  it('happy path returns the keyset shape with first name only', async () => {
    const shareChain = buildChain(ACTIVE_SHARE);
    const drillChain = buildChain(DRILL);
    const sportChain = buildChain(SPORT);
    const coachChain = buildChain(PUBLISHER_COACH);
    mockFromFn
      .mockReturnValueOnce(shareChain)
      .mockReturnValueOnce(drillChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(coachChain);

    const res = await GET(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as Record<string, unknown>;

    // Exact key allow-list at the top level (LESSONS#0036).
    expect(Object.keys(payload).sort()).toEqual([
      'caption',
      'createdAt',
      'drill',
      'isActive',
      'publisher',
    ]);

    // Drill sub-object — only the five whitelisted keys.
    const drill = payload.drill as Record<string, unknown>;
    expect(Object.keys(drill).sort()).toEqual([
      'ageGroupHint',
      'id',
      'name',
      'setup',
      'sportSlug',
    ]);
    expect(drill.name).toBe('Closeout Drill');
    expect(drill.sportSlug).toBe('basketball');
    expect(drill.ageGroupHint).toBe('8-10');

    // Publisher sub-object — id + firstName + handle (LESSONS#0036).
    const publisher = payload.publisher as Record<string, unknown>;
    expect(Object.keys(publisher).sort()).toEqual(['firstName', 'handle', 'id']);
    expect(publisher.id).toBe('coach-1');
    expect(publisher.firstName).toBe('Sarah');
    expect(publisher.handle).toBe('sarah-r');

    expect(payload.caption).toBe('Finally got my U10s to finish their closeouts.');
    expect(payload.isActive).toBe(true);

    // Defensive: the publisher's last name + email NEVER cross.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('Rodriguez');
    expect(serialized).not.toContain('sarah@example.com');
  });

  it('publisher.handle is null when the coach has no handle', async () => {
    const shareChain = buildChain(ACTIVE_SHARE);
    const drillChain = buildChain(DRILL);
    const sportChain = buildChain(SPORT);
    const coachChain = buildChain({ ...PUBLISHER_COACH, handle: null });
    mockFromFn
      .mockReturnValueOnce(shareChain)
      .mockReturnValueOnce(drillChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(coachChain);

    const res = await GET(makeRequest(), paramsFor('abc'));
    const payload = (await res.json()) as { publisher: { handle: unknown } };
    expect(payload.publisher.handle).toBeNull();
  });

  it('caption is null when the publisher attached none', async () => {
    const shareChain = buildChain({ ...ACTIVE_SHARE, caption: null });
    const drillChain = buildChain(DRILL);
    const sportChain = buildChain(SPORT);
    const coachChain = buildChain(PUBLISHER_COACH);
    mockFromFn
      .mockReturnValueOnce(shareChain)
      .mockReturnValueOnce(drillChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(coachChain);

    const res = await GET(makeRequest(), paramsFor('abc'));
    const payload = (await res.json()) as { caption: unknown };
    expect(payload.caption).toBeNull();
  });
});
