/**
 * Ticket 0061 — GET /api/og/player-trajectory/[playerId].
 *
 * AC:
 *  - The OG route reads the SAME `player_trajectories` cache row the JSON
 *    route writes, so the JSON page and the OG card never disagree.
 *  - Per LESSONS#0060 — vi.mock('next/og') to a fake ImageResponse, assert
 *    status + content-type only, never render real pixels.
 *  - 401 when unauthed; 403 when the caller is not a head coach of the
 *    player's team.
 *  - The render input contains the player's FIRST NAME ONLY (no last name,
 *    no parent contact, no DOB) per the COPPA boundary.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const imageResponseConstructions: Array<{ element: unknown; opts: unknown }> = [];

vi.mock('next/og', () => ({
  ImageResponse: class {
    status = 200;
    headers = new Headers({ 'content-type': 'image/png' });
    constructor(element: unknown, opts: unknown) {
      imageResponseConstructions.push({ element, opts });
    }
  },
}));

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

import { GET } from '@/app/api/og/player-trajectory/[playerId]/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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

const COACH_ID = '00000000-0000-4000-a000-000000000001';
const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const PLAYER_ID = '00000000-0000-4000-a000-000000000030';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest() {
  return new Request(`http://localhost/api/og/player-trajectory/${PLAYER_ID}`);
}

const PLAYER_FIXTURE = {
  id: PLAYER_ID,
  team_id: TEAM_ID,
  name: 'Alice Walker',
  parent_email: 'sarah@walker-family.test',
  parent_phone: '5551234567',
  date_of_birth: '2014-08-15',
};

const TEAM_FIXTURE = { id: TEAM_ID, name: 'E2E Test Team' };

const CACHE_FIXTURE = {
  id: 'cache-1',
  player_id: PLAYER_ID,
  observation_count_bucket: 9,
  started: {
    headline: 'Tentative on closeouts',
    sentence: 'Started the season hesitating on closeouts.',
    observation_id: 'obs-0',
    observed_at: '2026-01-01T00:00:00Z',
  },
  now: {
    headline: 'Closes out and recovers',
    sentence: 'Now closes out and recovers without losing balance.',
    observation_id: 'obs-10',
    observed_at: '2026-05-20T00:00:00Z',
  },
  turning_points: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
  imageResponseConstructions.length = 0;
});

describe('GET /api/og/player-trajectory/[playerId] (ticket 0061)', () => {
  it('returns 401 when unauthed', async () => {
    setAuthUser(null);
    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is NOT a head coach of the player\'s team', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(PLAYER_FIXTURE));
    mockFromFn.mockReturnValueOnce(buildChain(null)); // team_coaches misses

    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    expect(res.status).toBe(403);
  });

  it('returns 200 image/png with the cached started+now sentences and the player\'s FIRST name only', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(PLAYER_FIXTURE));
    mockFromFn.mockReturnValueOnce(buildChain({ coach_id: COACH_ID }));
    mockFromFn.mockReturnValueOnce(buildChain(TEAM_FIXTURE));
    mockFromFn.mockReturnValueOnce(buildChain(CACHE_FIXTURE));

    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');

    expect(imageResponseConstructions.length).toBe(1);
    // The rendered React tree must reference only the first name and the
    // cached sentences, never the last name, parent contact, or DOB.
    const tree = JSON.stringify(imageResponseConstructions[0].element);
    expect(tree).toContain('Alice');
    expect(tree).not.toContain('Walker');
    expect(tree).not.toContain('sarah@walker-family.test');
    expect(tree).not.toContain('5551234567');
    expect(tree).not.toContain('2014-08-15');
    expect(tree).toContain('Started the season hesitating on closeouts.');
    expect(tree).toContain('Now closes out and recovers without losing balance.');
    // The footer is the load-bearing attribution.
    expect(tree).toContain('SportsIQ');
  });

  it('returns 404 when the cache row does NOT exist (UI should fall back; no live AI render)', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(PLAYER_FIXTURE));
    mockFromFn.mockReturnValueOnce(buildChain({ coach_id: COACH_ID }));
    mockFromFn.mockReturnValueOnce(buildChain(TEAM_FIXTURE));
    mockFromFn.mockReturnValueOnce(buildChain(null));

    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    expect(res.status).toBe(404);
  });
});
