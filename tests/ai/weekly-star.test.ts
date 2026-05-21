/**
 * Ticket 0009 — Put the Player of the Week / Player of the Match spotlight on
 * the parent portal.
 *
 * Backend behaviours under test:
 *  (A) POST /api/ai/weekly-star stamps the standout candidate's `player_id`
 *      onto the inserted `plans` row (type='weekly_star') so the spotlight can
 *      be attached to the right player's share portal.
 *  (B) GET /api/share/[token] returns a `playerSpotlight` field = the
 *      content_structured of the most recent weekly_star/player_of_match plan
 *      for the share's player_id; null when none; and player-scoped so a
 *      sibling player's spotlight does NOT leak.
 *
 * Strategy mirrors tests/api-routes.test.ts: the @/lib/supabase/server module
 * is replaced with a chainable in-memory mock, and the AI client / context
 * builder are mocked so the route runs without a real DB or model call.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes spec files (reserved for
 * Playwright). See docs/LESSONS.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser, mockFromFn, mockCallAIWithJSON, mockBuildAIContext } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockFromFn: vi.fn(),
    mockCallAIWithJSON: vi.fn(),
    mockBuildAIContext: vi.fn(),
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

vi.mock('@/lib/ai/client', () => ({
  callAIWithJSON: mockCallAIWithJSON,
}));

vi.mock('@/lib/ai/context-builder', () => ({
  buildAIContext: mockBuildAIContext,
}));

import { POST as weeklyStarPost } from '@/app/api/ai/weekly-star/route';
import { GET as shareTokenGet } from '@/app/api/share/[token]/route';

// ─── Chainable mock helpers ─────────────────────────────────────────────────────

/**
 * A chainable Supabase query mock. Builder methods return `this` so they can be
 * chained; the chain is itself awaitable (thenable) resolving to {data,error}
 * — this matters for queries that end in `.limit()` rather than `.single()`,
 * which is exactly how the spotlight query terminates.
 */
function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    // Make the chain awaitable so `await supabase.from(...).…limit(1)` resolves.
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function setAuthUser(id = 'user-123') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function makeShare(overrides: Record<string, unknown> = {}) {
  return {
    id: 'share-1',
    share_token: 'abc123',
    player_id: 'player-1',
    team_id: 'team-1',
    coach_id: 'coach-1',
    is_active: true,
    expires_at: null,
    pin: null,
    view_count: 0,
    custom_message: null,
    include_report_card: false,
    include_development_card: false,
    include_highlights: false,
    include_goals: false,
    include_drills: false,
    include_observations: false,
    ...overrides,
  };
}

// ─── A. POST /api/ai/weekly-star stamps player_id ───────────────────────────────

describe('POST /api/ai/weekly-star — stamps candidate player_id onto the plan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('insert payload includes player_id: candidate.player_id', async () => {
    setAuthUser('coach-1');

    // 7 days of positive observations for two players so the selector can pick a
    // standout candidate. "Star Player" (player-star) gets more positive obs
    // across more categories + multiple days, so it ranks first.
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const obsRows = [
      { id: 'o1', player_id: 'player-star', category: 'Defense', sentiment: 'positive', text: 'Great lateral movement on defense', created_at: new Date(now - 3 * day).toISOString(), players: { name: 'Star Player' } },
      { id: 'o2', player_id: 'player-star', category: 'Offense', sentiment: 'positive', text: 'Strong finish at the rim in the scrimmage', created_at: new Date(now - 2 * day).toISOString(), players: { name: 'Star Player' } },
      { id: 'o3', player_id: 'player-star', category: 'Effort', sentiment: 'positive', text: 'First one back on defense every possession', created_at: new Date(now - 1 * day).toISOString(), players: { name: 'Star Player' } },
      { id: 'o4', player_id: 'player-other', category: 'Defense', sentiment: 'neutral', text: 'Worked on closeouts during the drill', created_at: new Date(now - 1 * day).toISOString(), players: { name: 'Other Player' } },
      { id: 'o5', player_id: 'player-other', category: 'Defense', sentiment: 'positive', text: 'Nice steal in the final scrimmage', created_at: new Date(now - 1 * day).toISOString(), players: { name: 'Other Player' } },
    ];

    // Capture the insert payload the route writes to plans.
    let insertedPlan: Record<string, unknown> | null = null;
    const insertedChain = buildChain({ id: 'plan-1' });
    (insertedChain.insert as ReturnType<typeof vi.fn>).mockImplementation(
      (payload: Record<string, unknown>) => {
        insertedPlan = payload;
        return insertedChain;
      }
    );

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1' });
      if (table === 'observations') return buildChain(obsRows);
      if (table === 'plans') return insertedChain;
      return buildChain(null);
    });

    mockBuildAIContext.mockResolvedValue({ seasonWeek: 3 });
    mockCallAIWithJSON.mockResolvedValue({
      parsed: {
        player_name: 'Star Player',
        week_label: 'May 19',
        headline: 'Showed up big all week',
        achievement: 'Defended hard and finished strong in every scrimmage.',
        growth_moment: 'Turned closeouts into steals by the end of the week.',
        challenge_ahead: 'Keep pushing the pace in transition.',
        coach_shoutout: 'Proud of your effort this week!',
      },
      interactionId: 'ai-int-1',
    });

    const req = new Request('http://localhost/api/ai/weekly-star', {
      method: 'POST',
      body: JSON.stringify({ teamId: 'team-1' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await weeklyStarPost(req);

    expect(res.status).toBe(200);
    expect(insertedPlan).not.toBeNull();
    expect(insertedPlan!).toMatchObject({ type: 'weekly_star' });
    // The candidate selected from the obs above is "player-star".
    expect(insertedPlan!.player_id).toBe('player-star');
  });
});

// ─── B. GET /api/share/[token] returns playerSpotlight ──────────────────────────

describe('GET /api/share/[token] — playerSpotlight', () => {
  beforeEach(() => vi.clearAllMocks());

  const player = { id: 'player-1', name: 'Alice Walker', nickname: null, position: 'Guard', jersey_number: 1, photo_url: null, parent_name: 'Walker Family', parent_phone: null };
  const team = { name: 'Wildcats', age_group: '11-13', season: 'Spring 2026', org_id: null };

  function wireShare(spotlightRows: unknown[]) {
    // The spotlight query is the one keyed on type IN (weekly_star,
    // player_of_match). We route the `plans` table to the spotlight rows only
    // for that .in() call; all other plans queries resolve empty so the report
    // still builds.
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'parent_shares') return buildChain(makeShare());
      if (table === 'players') return buildChain(player);
      if (table === 'teams') return buildChain(team);
      if (table === 'coaches') return buildChain({ full_name: 'Coach Rivera', preferences: {} });
      if (table === 'plans') {
        // Differentiate the spotlight query (uses .in(type, [...])) from the
        // single-type plan queries (use .eq(type, ...)). A chain whose `.in`
        // is called returns the spotlight rows; otherwise empty.
        const chain = buildChain([]);
        (chain.in as ReturnType<typeof vi.fn>).mockImplementation(() => {
          const spotChain = buildChain(spotlightRows);
          return spotChain;
        });
        return chain;
      }
      return buildChain([]);
    });
  }

  it('returns the content_structured of the most recent weekly_star/player_of_match plan', async () => {
    const spotlight = {
      player_name: 'Alice Walker',
      session_label: 'Game vs. Lincoln',
      headline: 'Locked down the perimeter',
      achievement: 'Three steals and relentless on-ball defense all game.',
      key_moment: 'Stole the inbound and finished the fast break.',
      coach_message: 'You set the tone defensively today!',
    };
    wireShare([{ content_structured: spotlight, created_at: new Date().toISOString(), type: 'player_of_match' }]);

    const req = new Request('http://localhost/api/share/abc123');
    const res = await shareTokenGet(req, { params: Promise.resolve({ token: 'abc123' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playerSpotlight).toEqual(spotlight);
  });

  it('returns playerSpotlight: null when the player has no spotlight plan', async () => {
    wireShare([]);

    const req = new Request('http://localhost/api/share/abc123');
    const res = await shareTokenGet(req, { params: Promise.resolve({ token: 'abc123' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playerSpotlight).toBeNull();
  });

  it('is scoped to the share player_id — a sibling player spotlight does not leak', async () => {
    // The route filters by eq('player_id', share.player_id) BEFORE the type
    // filter; the DB returns only this player's rows. We assert the query is
    // player-scoped by checking the `.eq('player_id', …)` argument used for the
    // spotlight chain, and that an empty result (sibling-only data) yields null.
    let spotlightPlayerFilter: unknown = undefined;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'parent_shares') return buildChain(makeShare({ player_id: 'player-1' }));
      if (table === 'players') return buildChain(player);
      if (table === 'teams') return buildChain(team);
      if (table === 'coaches') return buildChain({ full_name: 'Coach Rivera', preferences: {} });
      if (table === 'plans') {
        const chain = buildChain([]);
        (chain.in as ReturnType<typeof vi.fn>).mockImplementation(() => {
          // Sibling player (player-2) has a spotlight, but THIS player (player-1)
          // has none — the scoped query returns empty for player-1.
          return buildChain([]);
        });
        (chain.eq as ReturnType<typeof vi.fn>).mockImplementation((col: string, val: unknown) => {
          if (col === 'player_id') spotlightPlayerFilter = val;
          return chain;
        });
        return chain;
      }
      return buildChain([]);
    });

    const req = new Request('http://localhost/api/share/abc123');
    const res = await shareTokenGet(req, { params: Promise.resolve({ token: 'abc123' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Scoped to player-1 (the share's player), never the sibling player-2.
    expect(spotlightPlayerFilter).toBe('player-1');
    expect(body.playerSpotlight).toBeNull();
  });
});
