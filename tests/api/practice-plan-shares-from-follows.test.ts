/**
 * Ticket 0063 — GET /api/practice-plan-shares/from-follows.
 *
 * Returns up to 5 most-recent active `practice_plan_shares` rows whose
 * `coach_id` is in the caller's `coach_follows.followee_id` set. The payload
 * shape per row:
 *
 *   { token, planTitle, publisherFirstName, publisherDisplaySport,
 *     ageGroup, createdAt }
 *
 * Never returns the publisher's email, full_name (only the first name parsed
 * server-side), or any player data. The query joins `coach_follows` →
 * `practice_plan_shares` → `plans` → `teams` (for the publisher's display
 * sport + age group) with explicit `.select()` allow-lists.
 *
 * Acceptance criteria → tests:
 *  - 401 unauthed.
 *  - empty array when the caller follows nobody.
 *  - empty array when followees have not published any plans.
 *  - returns plans from followed coaches with first-name-only attribution.
 *  - COPPA: response NEVER contains email / full_name / parent / player fields.
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

import { GET } from '@/app/api/practice-plan-shares/from-follows/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const CALLER_ID = 'caller-coach-id';

function setAuthUser(id: string | null = CALLER_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest() {
  return new Request('http://localhost/api/practice-plan-shares/from-follows');
}

describe('GET /api/practice-plan-shares/from-follows (ticket 0063)', () => {
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

  it('returns empty array when the caller follows no one', async () => {
    setAuthUser();

    // Chain 1: coach_follows lookup → empty.
    const followsChain = buildChain([]);
    mockFromFn.mockReturnValueOnce(followsChain);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: unknown[] };
    expect(body.plans).toEqual([]);
  });

  it('returns empty array when followees have not published any plans', async () => {
    setAuthUser();

    const followsChain = buildChain([
      { followee_id: 'pub-1' },
      { followee_id: 'pub-2' },
    ]);
    const sharesChain = buildChain([]);
    mockFromFn.mockReturnValueOnce(followsChain).mockReturnValueOnce(sharesChain);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: unknown[] };
    expect(body.plans).toEqual([]);
  });

  it('returns plans from followed coaches with first-name-only attribution', async () => {
    setAuthUser();

    const followsChain = buildChain([
      { followee_id: 'pub-1' },
      { followee_id: 'pub-2' },
    ]);
    const sharesChain = buildChain([
      {
        token: 'tok-A',
        coach_id: 'pub-1',
        plan_id: 'plan-A',
        created_at: '2026-06-01T10:00:00.000Z',
        is_active: true,
        plans: { id: 'plan-A', title: 'Tuesday Closeouts', team_id: 'team-1', type: 'practice' },
      },
      {
        token: 'tok-B',
        coach_id: 'pub-2',
        plan_id: 'plan-B',
        created_at: '2026-05-30T10:00:00.000Z',
        is_active: true,
        plans: { id: 'plan-B', title: 'Scrimmage Day', team_id: 'team-2', type: 'practice' },
      },
    ]);
    const coachesChain = buildChain([
      { id: 'pub-1', full_name: 'James Stark' },
      { id: 'pub-2', full_name: 'Sarah Rodriguez' },
    ]);
    const teamsChain = buildChain([
      { id: 'team-1', age_group: '11-13', sports: { slug: 'basketball' } },
      { id: 'team-2', age_group: '9-10', sports: { slug: 'flag_football' } },
    ]);
    mockFromFn
      .mockReturnValueOnce(followsChain)
      .mockReturnValueOnce(sharesChain)
      .mockReturnValueOnce(coachesChain)
      .mockReturnValueOnce(teamsChain);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plans: Array<{
        token: string;
        planTitle: string | null;
        publisherFirstName: string | null;
        publisherDisplaySport: string;
        ageGroup: string | null;
        createdAt: string;
      }>;
    };
    expect(body.plans).toHaveLength(2);
    const byToken = Object.fromEntries(body.plans.map((p) => [p.token, p]));
    expect(byToken['tok-A'].publisherFirstName).toBe('James');
    expect(byToken['tok-A'].planTitle).toBe('Tuesday Closeouts');
    expect(byToken['tok-A'].ageGroup).toBe('11-13');
    expect(byToken['tok-B'].publisherFirstName).toBe('Sarah');

    // COPPA: NO email / full_name / parent / player fields in the response.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('Stark');
    expect(serialized).not.toContain('Rodriguez');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('full_name');
    expect(serialized).not.toContain('parent');
  });
});
