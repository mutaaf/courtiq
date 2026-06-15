/**
 * Ticket 0082 — the Capture per-player data-fetch (the GET
 * /api/capture/player-memory route) widens to include the
 * most-recent qualifying parent_reactions seed for the focused
 * player.
 *
 * This file tests the ADDITIVE widening — the existing 0025
 * memory contract stays byte-identical and a new optional
 * `reaction_seed` field appears on the response when a
 * qualifying reaction exists in the 14-day lookback.
 *
 * Strategy mirrors the existing tests/capture/player-memory.test.ts —
 * @/lib/supabase/server is replaced with a chainable in-memory
 * mock whose `from(table)` whitelist is broadened to handle the
 * new `parent_reactions` table per LESSONS#0078 / #0118.
 *
 * .test.ts (NOT .spec.ts) per LESSONS#0020 / #0038.
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

import { GET } from '@/app/api/capture/player-memory/route';

// ─── Chainable mock helpers ─────────────────────────────────────────────────

/**
 * A chainable Supabase query mock. Builder methods return `this` so they can
 * be chained; the chain is itself awaitable (thenable) resolving to
 * {data,error}. Per LESSONS#0062 — `.gte()` and `.lte()` are also chainable.
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
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function makeRequest(playerId?: string, teamId?: string) {
  const params = new URLSearchParams();
  if (playerId) params.set('playerId', playerId);
  if (teamId) params.set('teamId', teamId);
  const qs = params.toString();
  return new Request(`http://localhost/api/capture/player-memory${qs ? `?${qs}` : ''}`);
}

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function setNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

interface WireOpts {
  coachOrg?: string | null;
  teamOrg?: string | null;
  needsWork?: unknown[];
  positive?: unknown[];
  reactions?: unknown[];
  /** Capture every `.select()` arg for assertions on the allow-list. */
  onSelect?: (table: string, cols: string) => void;
}

/**
 * Wire the route's table reads. The route reads `coaches` → `teams` → two
 * `observations` chains (needs-work / positive) → `parent_reactions` (this
 * ticket's new read). The `parent_reactions` chain is broadened into the
 * whitelist per LESSONS#0078 / #0118 — every sibling whose
 * mockImplementation((table) => …) is a strict whitelist must include the
 * new table; otherwise a noisy try/catch masks the read.
 */
function wireTables(opts: WireOpts = {}) {
  const {
    coachOrg = 'org-1',
    teamOrg = 'org-1',
    needsWork = [],
    positive = [],
    reactions = [],
    onSelect,
  } = opts;
  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      const chain = buildChain(coachOrg === null ? null : { org_id: coachOrg });
      (chain.select as ReturnType<typeof vi.fn>).mockImplementation((cols: string) => {
        onSelect?.(table, cols);
        return chain;
      });
      return chain;
    }
    if (table === 'teams') {
      const chain = buildChain(teamOrg === null ? null : { org_id: teamOrg });
      (chain.select as ReturnType<typeof vi.fn>).mockImplementation((cols: string) => {
        onSelect?.(table, cols);
        return chain;
      });
      return chain;
    }
    if (table === 'observations') {
      // One chain whose data depends on which sentiment is filtered.
      let sentiment: string | null = null;
      const chain = buildChain([]);
      (chain.select as ReturnType<typeof vi.fn>).mockImplementation((cols: string) => {
        onSelect?.(table, cols);
        return chain;
      });
      (chain.eq as ReturnType<typeof vi.fn>).mockImplementation((col: string, val: unknown) => {
        if (col === 'sentiment') sentiment = val as string;
        return chain;
      });
      (chain as Record<string, unknown>).then = (
        onFulfilled: (v: { data: unknown; error: null }) => unknown,
      ) => {
        const rows = sentiment === 'positive' ? positive : needsWork;
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
      };
      return chain;
    }
    if (table === 'parent_reactions') {
      const chain = buildChain(reactions);
      (chain.select as ReturnType<typeof vi.fn>).mockImplementation((cols: string) => {
        onSelect?.(table, cols);
        return chain;
      });
      return chain;
    }
    // Unknown table — return an empty chain so a stray read never throws.
    return buildChain(null);
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('GET /api/capture/player-memory + reaction seed (ticket 0082)', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC (i): a coach owning the team gets the seed reaction in the payload.
  it('returns reaction_seed when a qualifying reaction exists for the focused player', async () => {
    setAuthUser();
    const recent = {
      player_id: 'player-1',
      parent_name: 'Sarah',
      message: 'thank you for sticking with him on his shooting',
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    };
    wireTables({ reactions: [recent] });

    const res = await GET(makeRequest('player-1', 'team-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reaction_seed).not.toBeNull();
    expect(body.reaction_seed.parent_first_name).toBe('Sarah');
    expect(body.reaction_seed.note).toContain('shooting');
  });

  // AC (ii): a coach NOT owning the team gets no reaction read (the
  // existing org-scope is preserved); reaction_seed is null.
  it('returns reaction_seed: null when the team belongs to another org', async () => {
    setAuthUser('coach-x');
    let reactionsQueried = false;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-mine' });
      if (table === 'teams') return buildChain({ org_id: 'org-other' });
      if (table === 'parent_reactions') {
        reactionsQueried = true;
        return buildChain([]);
      }
      return buildChain([]);
    });

    const res = await GET(makeRequest('player-1', 'team-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reaction_seed ?? null).toBeNull();
    // Server-side proof: cross-org never even reads parent_reactions.
    expect(reactionsQueried).toBe(false);
  });

  // AC (iii): the explicit `.select()` allow-list is
  // `player_id, parent_name, message, created_at` ONLY — never parent_email,
  // never coach_reply_id, never the share_token / team_id / coach_id / the
  // reaction emoji / is_read. Per LESSONS#0036.
  it('reads parent_reactions with an explicit allow-list select', async () => {
    setAuthUser();
    const selects: Array<{ table: string; cols: string }> = [];
    wireTables({
      reactions: [],
      onSelect: (table, cols) => selects.push({ table, cols }),
    });

    await GET(makeRequest('player-1', 'team-1'));
    const rxSel = selects.find((s) => s.table === 'parent_reactions');
    expect(rxSel).toBeDefined();
    expect(rxSel!.cols).toContain('player_id');
    expect(rxSel!.cols).toContain('parent_name');
    expect(rxSel!.cols).toContain('message');
    expect(rxSel!.cols).toContain('created_at');
    // COPPA — these columns are NEVER read.
    expect(rxSel!.cols).not.toContain('parent_email');
    expect(rxSel!.cols).not.toContain('parent_phone');
    expect(rxSel!.cols).not.toContain('coach_reply_id');
    expect(rxSel!.cols).not.toContain('coach_reply_at');
    expect(rxSel!.cols).not.toContain('share_token');
    expect(rxSel!.cols).not.toContain('is_read');
  });

  // AC (iv): reactions older than 14 days are excluded — the helper drops
  // them when shaping the payload. Even if the DB read returns an older
  // row, the helper-derived seed is null.
  it('excludes reactions older than 14 days from the seed payload', async () => {
    setAuthUser();
    const old = {
      player_id: 'player-1',
      parent_name: 'Sarah',
      message: 'thank you for sticking with him on his shooting',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    };
    wireTables({ reactions: [old] });

    const res = await GET(makeRequest('player-1', 'team-1'));
    const body = await res.json();
    expect(body.reaction_seed ?? null).toBeNull();
  });

  // AC (v): reactions on OTHER players are excluded — the seed is keyed by
  // the focused playerId.
  it('excludes reactions on other players from the seed payload', async () => {
    setAuthUser();
    const other = {
      player_id: 'player-other',
      parent_name: 'Sarah',
      message: 'thank you for sticking with him on his shooting',
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    };
    wireTables({ reactions: [other] });

    const res = await GET(makeRequest('player-1', 'team-1'));
    const body = await res.json();
    expect(body.reaction_seed ?? null).toBeNull();
  });

  // AC (vi): heart-only reactions (message null) and too-short / too-long
  // notes are excluded.
  it('excludes heart-only reactions from the seed payload', async () => {
    setAuthUser();
    const heartOnly = {
      player_id: 'player-1',
      parent_name: 'Sarah',
      message: null,
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    };
    wireTables({ reactions: [heartOnly] });

    const res = await GET(makeRequest('player-1', 'team-1'));
    const body = await res.json();
    expect(body.reaction_seed ?? null).toBeNull();
  });

  // AC (vii): the existing 0025 memory contract is BYTE-IDENTICAL — the
  // response still carries lastNeedsWork / lastPositive / observedAt with
  // the same shape; reaction_seed is the only NEW field.
  it('preserves the existing 0025 lastNeedsWork / lastPositive / observedAt fields', async () => {
    setAuthUser();
    const nw = {
      text: 'hesitated on closeouts',
      created_at: '2026-05-09T10:00:00.000Z',
    };
    const pos = {
      text: 'first one back on defense',
      created_at: '2026-05-16T10:00:00.000Z',
    };
    wireTables({ needsWork: [nw], positive: [pos], reactions: [] });

    const res = await GET(makeRequest('player-1', 'team-1'));
    const body = await res.json();
    expect(body.lastNeedsWork).toBe('hesitated on closeouts');
    expect(body.lastPositive).toBe('first one back on defense');
    expect(body.observedAt).toBe('2026-05-09T10:00:00.000Z');
    // reaction_seed is additive — null when no qualifying reaction.
    expect(body.reaction_seed ?? null).toBeNull();
  });

  // AC (viii): a missing playerId still returns 200 nulls (best-effort) and
  // performs no parent_reactions read.
  it('returns 200 nulls and performs no parent_reactions read when playerId is missing', async () => {
    setAuthUser();
    let reactionsQueried = false;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'parent_reactions') reactionsQueried = true;
      return buildChain(table === 'coaches' ? { org_id: 'org-1' } : null);
    });

    const res = await GET(makeRequest(undefined, 'team-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastNeedsWork).toBeNull();
    expect(body.lastPositive).toBeNull();
    expect(body.reaction_seed ?? null).toBeNull();
    expect(reactionsQueried).toBe(false);
  });

  // Unauthenticated → still 401 (no DB reads at all).
  it('returns 401 when not authenticated', async () => {
    setNoAuth();
    const res = await GET(makeRequest('player-1', 'team-1'));
    expect(res.status).toBe(401);
  });

  // Voice contract: the helper substitutes "A parent" when parent_name is
  // null. The route's response carries that fallback through.
  it('substitutes "A parent" when the underlying reaction has no parent_name', async () => {
    setAuthUser();
    const noName = {
      player_id: 'player-1',
      parent_name: null,
      message: 'thank you for sticking with him on his shooting',
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    };
    wireTables({ reactions: [noName] });

    const res = await GET(makeRequest('player-1', 'team-1'));
    const body = await res.json();
    expect(body.reaction_seed.parent_first_name).toBe('A parent');
  });
});
