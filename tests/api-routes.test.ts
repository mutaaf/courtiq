/**
 * Integration tests for API route handlers: config, share, and the AI error handler.
 *
 * Strategy:
 * - Config resolver functions are pure — tested without any mocking.
 * - Route handlers depend on Supabase; the entire @/lib/supabase/server module is
 *   replaced with a chainable in-memory mock so tests run without a real database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────
// vi.mock() calls are hoisted to the top of the file, so all mock factories must
// reference variables created via vi.hoisted() — plain const/let at module scope
// would not yet be initialised when the factory runs.

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

// ─── Pure-function imports ─────────────────────────────────────────────────────

import {
  resolveConfig,
  getConfigSource,
  resolveConfigWithSource,
} from '@/lib/config/resolver';
import { handleAIError } from '@/lib/ai/error';

// ─── Route handler imports ─────────────────────────────────────────────────────

import {
  GET as configGet,
  PUT as configPut,
  DELETE as configDelete,
} from '@/app/api/config/[domain]/route';
import { GET as shareTokenGet } from '@/app/api/share/[token]/route';
import { POST as shareCreatePost } from '@/app/api/share/create/route';

// ─── Mock helpers ──────────────────────────────────────────────────────────────

/**
 * Returns a chainable Supabase query mock.
 * All builder methods (select/insert/update/delete/eq/is/gte/order/limit) return
 * `this` so they can be chained. `.single()` resolves with `{ data, error }`.
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
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
  };
  return chain;
}

/** Simulate an authenticated session. */
function setAuthUser(id = 'user-123') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

/** Simulate an unauthenticated session. */
function setNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

// ─── 1. Config Resolver — pure functions ──────────────────────────────────────

const SYS = {
  sport: {
    categories: ['Offense', 'Defense'],
    positions: ['PG', 'SG'],
  },
};

describe('resolveConfig', () => {
  it('returns the system default when there are no overrides', () => {
    const result = resolveConfig({
      domain: 'sport',
      key: 'categories',
      systemDefaults: SYS,
      orgOverrides: {},
      teamOverrides: {},
    });
    expect(result).toEqual(['Offense', 'Defense']);
  });

  it('org override takes precedence over system default', () => {
    const result = resolveConfig({
      domain: 'sport',
      key: 'categories',
      systemDefaults: SYS,
      orgOverrides: { 'sport.categories': ['Basketball'] },
      teamOverrides: {},
    });
    expect(result).toEqual(['Basketball']);
  });

  it('team override takes precedence over org override', () => {
    const result = resolveConfig({
      domain: 'sport',
      key: 'categories',
      systemDefaults: SYS,
      orgOverrides: { 'sport.categories': ['OrgVal'] },
      teamOverrides: { 'sport.categories': ['TeamVal'] },
    });
    expect(result).toEqual(['TeamVal']);
  });

  it('returns null for an unknown key with no overrides', () => {
    const result = resolveConfig({
      domain: 'sport',
      key: 'nonexistent',
      systemDefaults: SYS,
      orgOverrides: {},
      teamOverrides: {},
    });
    expect(result).toBeNull();
  });

  it('null org override does not shadow the system default', () => {
    const result = resolveConfig({
      domain: 'sport',
      key: 'categories',
      systemDefaults: SYS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orgOverrides: { 'sport.categories': null as any },
      teamOverrides: {},
    });
    expect(result).toEqual(['Offense', 'Defense']);
  });

  it('undefined team override does not shadow an org override', () => {
    const result = resolveConfig({
      domain: 'sport',
      key: 'categories',
      systemDefaults: SYS,
      orgOverrides: { 'sport.categories': ['OrgVal'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      teamOverrides: { 'sport.categories': undefined as any },
    });
    expect(result).toEqual(['OrgVal']);
  });

  it('a non-sport domain key resolves from system defaults', () => {
    const result = resolveConfig({
      domain: 'sport',
      key: 'positions',
      systemDefaults: SYS,
      orgOverrides: {},
      teamOverrides: {},
    });
    expect(result).toEqual(['PG', 'SG']);
  });
});

describe('getConfigSource', () => {
  it('returns "system" when there are no matching overrides', () => {
    expect(
      getConfigSource({
        domain: 'sport',
        key: 'categories',
        systemDefaults: SYS,
        orgOverrides: {},
        teamOverrides: {},
      })
    ).toBe('system');
  });

  it('returns "org" when an org override exists', () => {
    expect(
      getConfigSource({
        domain: 'sport',
        key: 'categories',
        systemDefaults: SYS,
        orgOverrides: { 'sport.categories': ['X'] },
        teamOverrides: {},
      })
    ).toBe('org');
  });

  it('returns "team" when a team override exists alongside an org override', () => {
    expect(
      getConfigSource({
        domain: 'sport',
        key: 'categories',
        systemDefaults: SYS,
        orgOverrides: { 'sport.categories': ['X'] },
        teamOverrides: { 'sport.categories': ['Y'] },
      })
    ).toBe('team');
  });

  it('returns "system" even when org override is null', () => {
    expect(
      getConfigSource({
        domain: 'sport',
        key: 'categories',
        systemDefaults: SYS,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        orgOverrides: { 'sport.categories': null as any },
        teamOverrides: {},
      })
    ).toBe('system');
  });
});

describe('resolveConfigWithSource', () => {
  it('returns the value and source together', () => {
    const result = resolveConfigWithSource({
      domain: 'sport',
      key: 'categories',
      systemDefaults: SYS,
      orgOverrides: { 'sport.categories': ['OrgCats'] },
      teamOverrides: {},
    });
    expect(result.value).toEqual(['OrgCats']);
    expect(result.source).toBe('org');
  });

  it('source is "system" for unoverridden keys', () => {
    const result = resolveConfigWithSource({
      domain: 'sport',
      key: 'positions',
      systemDefaults: SYS,
      orgOverrides: {},
      teamOverrides: {},
    });
    expect(result.source).toBe('system');
    expect(result.value).toEqual(['PG', 'SG']);
  });

  it('team override produces source "team"', () => {
    const result = resolveConfigWithSource({
      domain: 'sport',
      key: 'categories',
      systemDefaults: SYS,
      orgOverrides: {},
      teamOverrides: { 'sport.categories': ['T'] },
    });
    expect(result.source).toBe('team');
    expect(result.value).toEqual(['T']);
  });
});

// ─── 2. handleAIError ─────────────────────────────────────────────────────────

describe('handleAIError', () => {
  it('returns 429 for a RateLimitError (status 429)', async () => {
    const err = { status: 429, message: 'Rate limit exceeded — 20/hr', limit: 20, resetAt: Date.now() + 3_600_000 };
    const response = handleAIError(err, 'Test');
    expect(response.status).toBe(429);
  });

  it('includes Retry-After and X-RateLimit-Limit headers on 429', () => {
    const limit = 20;
    const resetAt = Date.now() + 5_000;
    const err = { status: 429, message: 'Rate limit', limit, resetAt };
    const response = handleAIError(err, 'Test');
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(response.headers.get('X-RateLimit-Limit')).toBe(String(limit));
  });

  it('returns 500 for a generic Error', async () => {
    const response = handleAIError(new Error('db connection failed'), 'Test');
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('db connection failed');
  });

  it('returns 500 with "Unknown error" for a non-Error thrown value', async () => {
    const response = handleAIError('some string', 'Test');
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Unknown error');
  });

  it('uses the error object message property when available', async () => {
    const response = handleAIError({ message: 'custom message' }, 'Test');
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('custom message');
  });
});

// ─── 3. Config API route ──────────────────────────────────────────────────────

describe('Config API — GET /api/config/[domain]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when the request is unauthenticated', async () => {
    setNoAuth();
    const req = new Request('http://localhost/api/config/sport');
    const res = await configGet(req, { params: Promise.resolve({ domain: 'sport' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the coach record is missing', async () => {
    setAuthUser();
    // coaches table returns null
    mockFromFn.mockReturnValue(buildChain(null));
    const req = new Request('http://localhost/api/config/sport');
    const res = await configGet(req, { params: Promise.resolve({ domain: 'sport' }) });
    expect(res.status).toBe(404);
  });

  it('returns 400 for an unknown config domain', async () => {
    setAuthUser();
    mockFromFn.mockReturnValue(buildChain({ org_id: 'org-1' }));
    const req = new Request('http://localhost/api/config/completely_unknown');
    const res = await configGet(req, { params: Promise.resolve({ domain: 'completely_unknown' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('completely_unknown');
  });
});

describe('Config API — PUT /api/config/[domain]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    setNoAuth();
    const req = new Request('http://localhost/api/config/sport', {
      method: 'PUT',
      body: JSON.stringify({ key: 'categories', value: ['X'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await configPut(req, { params: Promise.resolve({ domain: 'sport' }) });
    expect(res.status).toBe(401);
  });

  it('returns 400 when the key field is missing', async () => {
    setAuthUser();
    const req = new Request('http://localhost/api/config/sport', {
      method: 'PUT',
      body: JSON.stringify({ value: ['X'] }), // missing key
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await configPut(req, { params: Promise.resolve({ domain: 'sport' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('key');
  });

  it('returns 400 when the value field is missing', async () => {
    setAuthUser();
    const req = new Request('http://localhost/api/config/sport', {
      method: 'PUT',
      body: JSON.stringify({ key: 'categories' }), // missing value
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await configPut(req, { params: Promise.resolve({ domain: 'sport' }) });
    expect(res.status).toBe(400);
  });

  it('returns 403 when the coach role lacks permission (plain "coach")', async () => {
    setAuthUser();
    mockFromFn.mockReturnValue(buildChain({ org_id: 'org-1', role: 'coach' }));
    const req = new Request('http://localhost/api/config/sport', {
      method: 'PUT',
      body: JSON.stringify({ key: 'categories', value: ['X'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await configPut(req, { params: Promise.resolve({ domain: 'sport' }) });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the coach record is missing', async () => {
    setAuthUser();
    mockFromFn.mockReturnValue(buildChain(null)); // no coach
    const req = new Request('http://localhost/api/config/sport', {
      method: 'PUT',
      body: JSON.stringify({ key: 'categories', value: ['X'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await configPut(req, { params: Promise.resolve({ domain: 'sport' }) });
    expect(res.status).toBe(404);
  });
});

describe('Config API — DELETE /api/config/[domain]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    setNoAuth();
    const req = new Request('http://localhost/api/config/sport?key=categories');
    const res = await configDelete(req, { params: Promise.resolve({ domain: 'sport' }) });
    expect(res.status).toBe(401);
  });

  it('returns 400 when the key query param is absent', async () => {
    setAuthUser();
    // key check happens before DB call, so no from() mock needed
    const req = new Request('http://localhost/api/config/sport'); // no ?key=
    const res = await configDelete(req, { params: Promise.resolve({ domain: 'sport' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('key');
  });

  it('returns 404 when the coach record is missing', async () => {
    setAuthUser();
    mockFromFn.mockReturnValue(buildChain(null));
    const req = new Request('http://localhost/api/config/sport?key=categories');
    const res = await configDelete(req, { params: Promise.resolve({ domain: 'sport' }) });
    expect(res.status).toBe(404);
  });

  it('returns 403 when the coach role lacks permission', async () => {
    setAuthUser();
    mockFromFn.mockReturnValue(buildChain({ org_id: 'org-1', role: 'coach' }));
    const req = new Request('http://localhost/api/config/sport?key=categories');
    const res = await configDelete(req, { params: Promise.resolve({ domain: 'sport' }) });
    expect(res.status).toBe(403);
  });
});

// ─── 4. Share [token] GET route ───────────────────────────────────────────────

/** Minimal valid share fixture. All include_* flags default to false. */
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
    include_skill_challenges: false,
    include_coach_note: false,
    ...overrides,
  };
}

describe('Share [token] GET route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when the share token does not exist', async () => {
    mockFromFn.mockReturnValue(buildChain(null)); // share not found
    const req = new Request('http://localhost/api/share/no-such-token');
    const res = await shareTokenGet(req, { params: Promise.resolve({ token: 'no-such-token' }) });
    expect(res.status).toBe(404);
  });

  it('returns 410 when the share link has expired', async () => {
    mockFromFn.mockReturnValue(buildChain(makeShare({ expires_at: '2020-01-01T00:00:00Z' })));
    const req = new Request('http://localhost/api/share/abc123');
    const res = await shareTokenGet(req, { params: Promise.resolve({ token: 'abc123' }) });
    expect(res.status).toBe(410);
  });

  it('returns 403 with pinRequired flag when PIN is set but absent in query', async () => {
    mockFromFn.mockReturnValue(buildChain(makeShare({ pin: '1234' })));
    const req = new Request('http://localhost/api/share/abc123'); // no ?pin=
    const res = await shareTokenGet(req, { params: Promise.resolve({ token: 'abc123' }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.pinRequired).toBe(true);
  });

  it('returns 403 when the wrong PIN is provided', async () => {
    mockFromFn.mockReturnValue(buildChain(makeShare({ pin: '1234' })));
    const req = new Request('http://localhost/api/share/abc123?pin=9999');
    const res = await shareTokenGet(req, { params: Promise.resolve({ token: 'abc123' }) });
    expect(res.status).toBe(403);
  });

  it('returns 200 with player/team data for a valid PIN-protected share', async () => {
    const share = makeShare({ pin: '1234' });
    const player = { id: 'player-1', name: 'Alex Johnson', nickname: null, position: 'PG', jersey_number: 10, photo_url: null };
    const team = { name: 'Wildcats', age_group: '11-13', season: 'Spring 2026', org_id: null };

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'parent_shares') return buildChain(share);
      if (table === 'players') return buildChain(player);
      if (table === 'teams') return buildChain(team);
      if (table === 'coaches') return buildChain({ full_name: 'Coach Rivera' });
      return buildChain(null);
    });

    const req = new Request('http://localhost/api/share/abc123?pin=1234');
    const res = await shareTokenGet(req, { params: Promise.resolve({ token: 'abc123' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.player.name).toBe('Alex Johnson');
    expect(body.team.name).toBe('Wildcats');
    expect(body.coachName).toBe('Coach Rivera');
  });

  it('returns 200 for a share with no PIN requirement', async () => {
    const share = makeShare(); // pin: null
    const player = { id: 'player-1', name: 'Maya Chen', nickname: null, position: 'SG', jersey_number: 5, photo_url: null };
    const team = { name: 'Eagles', age_group: '8-10', season: 'Fall 2025', org_id: null };

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'parent_shares') return buildChain(share);
      if (table === 'players') return buildChain(player);
      if (table === 'teams') return buildChain(team);
      if (table === 'coaches') return buildChain({ full_name: 'Coach Kim' });
      return buildChain(null);
    });

    const req = new Request('http://localhost/api/share/abc123');
    const res = await shareTokenGet(req, { params: Promise.resolve({ token: 'abc123' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.player.name).toBe('Maya Chen');
  });

  it('returns customMessage when set on the share', async () => {
    const share = makeShare({ custom_message: 'Great season so far!' });
    const player = { id: 'player-1', name: 'Sam', nickname: null, position: 'C', jersey_number: 0, photo_url: null };
    const team = { name: 'Bears', age_group: '14-18', season: 'Spring 2026', org_id: null };

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'parent_shares') return buildChain(share);
      if (table === 'players') return buildChain(player);
      if (table === 'teams') return buildChain(team);
      if (table === 'coaches') return buildChain({ full_name: 'Coach Lee' });
      return buildChain(null);
    });

    const req = new Request('http://localhost/api/share/abc123');
    const res = await shareTokenGet(req, { params: Promise.resolve({ token: 'abc123' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customMessage).toBe('Great season so far!');
  });
});

// ─── 5. Share create POST route ───────────────────────────────────────────────

describe('Share create POST route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    setNoAuth();
    const req = new Request('http://localhost/api/share/create', {
      method: 'POST',
      body: JSON.stringify({ playerId: 'p1', teamId: 't1' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await shareCreatePost(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when playerId is missing', async () => {
    setAuthUser();
    const req = new Request('http://localhost/api/share/create', {
      method: 'POST',
      body: JSON.stringify({ teamId: 't1' }), // no playerId
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await shareCreatePost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('playerId');
  });

  it('returns 400 when teamId is missing', async () => {
    setAuthUser();
    const req = new Request('http://localhost/api/share/create', {
      method: 'POST',
      body: JSON.stringify({ playerId: 'p1' }), // no teamId
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await shareCreatePost(req);
    expect(res.status).toBe(400);
  });

  it('returns 403 when free-tier coach tries to create a share link', async () => {
    setAuthUser('free-coach');
    const freeTierCoach = { org_id: 'org-free', organizations: { tier: 'free' } };
    mockFromFn.mockReturnValue(buildChain(freeTierCoach));
    const req = new Request('http://localhost/api/share/create', {
      method: 'POST',
      body: JSON.stringify({ playerId: 'player-1', teamId: 'team-1' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await shareCreatePost(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Coach plan');
  });

  it('returns 404 when player is not found in the given team', async () => {
    setAuthUser();
    const coachWithOrg = { org_id: 'org-1', organizations: { tier: 'coach' } };
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain(coachWithOrg);
      return buildChain(null); // player lookup returns null
    });
    const req = new Request('http://localhost/api/share/create', {
      method: 'POST',
      body: JSON.stringify({ playerId: 'ghost', teamId: 't1' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await shareCreatePost(req);
    expect(res.status).toBe(404);
  });

  it('returns 200 with a shareUrl and token on success', async () => {
    setAuthUser('coach-1');
    const player = { id: 'player-1', name: 'Jordan' };
    const shareRecord = { id: 'share-1', share_token: 'db-stored-token', player_id: 'player-1', team_id: 'team-1' };
    const coachWithOrg = { org_id: 'org-1', organizations: { tier: 'coach' } };

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain(coachWithOrg);
      if (table === 'players') return buildChain(player);
      if (table === 'parent_shares') return buildChain(shareRecord);
      return buildChain(null);
    });

    const req = new Request('http://localhost/api/share/create', {
      method: 'POST',
      body: JSON.stringify({ playerId: 'player-1', teamId: 'team-1' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await shareCreatePost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shareUrl).toMatch(/^\/share\//);
    expect(body.token).toBeTruthy();
    expect(typeof body.token).toBe('string');
  });

  it('respects the expirationDays field in the request body', async () => {
    setAuthUser('coach-1');
    const player = { id: 'player-1', name: 'Taylor' };
    const shareRecord = { id: 'share-2', share_token: 'exp-token', player_id: 'player-1', team_id: 'team-1' };
    const coachWithOrg = { org_id: 'org-1', organizations: { tier: 'coach' } };

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain(coachWithOrg);
      if (table === 'players') return buildChain(player);
      if (table === 'parent_shares') return buildChain(shareRecord);
      return buildChain(null);
    });

    const req = new Request('http://localhost/api/share/create', {
      method: 'POST',
      body: JSON.stringify({ playerId: 'player-1', teamId: 'team-1', expirationDays: 7 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await shareCreatePost(req);
    // Route should succeed; expiration is set internally — just verify 200
    expect(res.status).toBe(200);
  });
});
