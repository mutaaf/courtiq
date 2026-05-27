/**
 * Ticket 0052 — /api/data filters out released players by default on the
 * `players` table.
 *
 * `players.released_at` is the soft-state marker the new-season flow flips
 * for kids who aged up or left the program. Every active-roster surface
 * (capture, roster, observe, parent contact) reads `players` through this
 * generic /api/data endpoint, so the filter belongs here — once — rather
 * than each caller threading a `released_at IS NULL` predicate.
 *
 * Surfaces that legitimately need to see released players (season-archive
 * viewer, per-player observation history) opt back in via `includeReleased: true`.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const { db, mockGetUser, mockFromFn } = vi.hoisted(() => {
  const db: Record<string, Row[]> = {};
  return {
    db,
    mockGetUser: vi.fn(),
    mockFromFn: vi.fn((table: string) => buildChain(db, table)),
  };

  function buildChain(store: Record<string, Row[]>, table: string) {
    const state: {
      filters: Array<[string, unknown]>;
      nullFilters: Array<string>;
      orderBy?: { column: string; ascending: boolean };
      limit?: number;
    } = { filters: [], nullFilters: [] };

    function matches(row: Row) {
      if (!state.filters.every(([k, v]) => row[k] === v)) return false;
      if (!state.nullFilters.every((k) => row[k] === null || row[k] === undefined)) return false;
      return true;
    }

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn((k: string, v: unknown) => {
        state.filters.push([k, v]);
        return chain;
      }),
      is: vi.fn((k: string, v: unknown) => {
        if (v === null) state.nullFilters.push(k);
        return chain;
      }),
      not: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      in: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      order: vi.fn((column: string, opts?: { ascending?: boolean }) => {
        state.orderBy = { column, ascending: opts?.ascending ?? true };
        return chain;
      }),
      limit: vi.fn((n: number) => {
        state.limit = n;
        return chain;
      }),
      single: vi.fn(async () => {
        const rows = (store[table] || []).filter(matches);
        return { data: rows[0] ?? null, error: null };
      }),
      then: (resolve: (v: { data: unknown; error: unknown; count?: number }) => unknown) => {
        const rows = (store[table] || []).filter(matches);
        return Promise.resolve(resolve({ data: rows, error: null, count: rows.length }));
      },
    };
    return chain;
  }
});

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

// Bypass the in-memory cache so each test runs the underlying query path.
vi.mock('@/lib/cache/memory', () => ({
  memCached: async <T,>(_key: string, _ttl: number, fn: () => Promise<T>): Promise<T> => fn(),
  memBust: vi.fn(),
  memBustPrefix: vi.fn(),
  TTL: { SHORT: 1, MEDIUM: 1, LONG: 1, VERY_LONG: 1, HOUR: 1 },
}));

import { POST } from '@/app/api/data/route';

function resetDb() {
  for (const k of Object.keys(db)) delete db[k];
}

function setAuth(userId: string) {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

function seedRoster() {
  resetDb();
  db.players = [
    { id: 'p1', team_id: 'team-1', name: 'Alice', is_active: true, released_at: null },
    { id: 'p2', team_id: 'team-1', name: 'Ben', is_active: true, released_at: '2026-05-01T00:00:00Z' },
    { id: 'p3', team_id: 'team-1', name: 'Cory', is_active: true, released_at: null },
    { id: 'p4', team_id: 'team-1', name: 'Dani', is_active: false, released_at: null },
  ];
}

function call(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/data', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('/api/data POST — players released_at filter (ticket 0052)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuth('caller-1');
    seedRoster();
  });

  it('excludes released players by default for the `players` table', async () => {
    const res = await call({ table: 'players', filters: { team_id: 'team-1', is_active: true } });
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = (body.data as Row[]).map((r) => r.id);
    // Alice (active, not released) + Cory (active, not released)
    expect(ids).toContain('p1');
    expect(ids).toContain('p3');
    // Ben is released — must NOT appear
    expect(ids).not.toContain('p2');
  });

  it('opts back in to released players via includeReleased:true', async () => {
    const res = await call({
      table: 'players',
      filters: { team_id: 'team-1', is_active: true },
      includeReleased: true,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = (body.data as Row[]).map((r) => r.id);
    // With opt-in, Ben (released) is included.
    expect(ids).toContain('p2');
    expect(ids).toContain('p1');
    expect(ids).toContain('p3');
  });

  it('does NOT add the released_at filter for other tables', async () => {
    // Seed a sessions row with no released_at concept at all; the filter
    // would error if it were applied universally.
    db.sessions = [{ id: 's1', team_id: 'team-1', type: 'practice' }];
    const res = await call({ table: 'sessions', filters: { team_id: 'team-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect((body.data as Row[]).map((r) => r.id)).toEqual(['s1']);
  });
});
