/**
 * Ticket 0053 — Default team-list reads exclude archived teams.
 *
 * The active-team query path (`/api/me` → useActiveTeam → team switcher) must
 * default to `archived_at IS NULL`. Adding `archived_at` to the Team type
 * surfaces archived rows in /api/me unfiltered today; this test asserts the
 * post-fix behavior:
 *   - /api/me returns ONLY live teams in `teams`
 *   - archived teams remain queryable through other surfaces (see the
 *     settings/organization page using the opt-in includeArchived path)
 *
 * .test.ts NOT .spec.ts.
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
      filters: Array<[string, unknown, 'eq' | 'is' | 'not_is']>;
    } = { filters: [] };

    function matches(row: Row) {
      return state.filters.every(([k, v, mode]) => {
        if (mode === 'is') return row[k] === v;
        if (mode === 'not_is') return row[k] !== v;
        return row[k] === v;
      });
    }

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn((k: string, v: unknown) => {
        state.filters.push([k, v, 'eq']);
        return chain;
      }),
      is: vi.fn((k: string, v: unknown) => {
        state.filters.push([k, v, 'is']);
        return chain;
      }),
      not: vi.fn((k: string, _op: string, v: unknown) => {
        state.filters.push([k, v, 'not_is']);
        return chain;
      }),
      single: vi.fn(async () => {
        const rows = (store[table] || []).filter(matches);
        return { data: rows[0] ?? null, error: null };
      }),
      then: (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
        const rows = (store[table] || []).filter(matches);
        return Promise.resolve(resolve({ data: rows, error: null }));
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

// memCached short-circuits via the env-var path; for these tests we never want
// a stale cached value across cases.
vi.mock('@/lib/cache/memory', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cache/memory')>(
    '@/lib/cache/memory',
  );
  return {
    ...actual,
    memCached: async (_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher(),
  };
});

import { GET as meGET } from '@/app/api/me/route';

function resetDb() {
  for (const k of Object.keys(db)) delete db[k];
}

function seed(opts: {
  liveTeams: number;
  archivedTeams: number;
}) {
  resetDb();
  db.coaches = [
    {
      id: 'caller-1',
      org_id: 'org-1',
      organizations: { id: 'org-1', tier: 'pro_coach' },
    },
  ];
  db.teams = [];
  db.team_coaches = [];

  for (let i = 0; i < opts.liveTeams; i++) {
    const id = `team-live-${i}`;
    db.teams.push({ id, org_id: 'org-1', name: `Live ${i}`, archived_at: null });
    db.team_coaches.push({ team_id: id, coach_id: 'caller-1', role: 'head_coach', teams: db.teams[db.teams.length - 1] });
  }
  for (let i = 0; i < opts.archivedTeams; i++) {
    const id = `team-arch-${i}`;
    db.teams.push({ id, org_id: 'org-1', name: `Archived ${i}`, archived_at: '2026-01-01T00:00:00.000Z' });
    db.team_coaches.push({ team_id: id, coach_id: 'caller-1', role: 'head_coach', teams: db.teams[db.teams.length - 1] });
  }
}

describe('/api/me — default excludes archived teams (ticket 0053)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'caller-1' } }, error: null });
  });

  it('returns only live teams when the coach has a mix of live and archived', async () => {
    seed({ liveTeams: 2, archivedTeams: 3 });
    const res = await meGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.teams)).toBe(true);
    expect(body.teams).toHaveLength(2);
    for (const t of body.teams) {
      expect(t.archived_at).toBeNull();
    }
  });

  it('returns an empty teams array when ALL of the coach teams are archived', async () => {
    seed({ liveTeams: 0, archivedTeams: 2 });
    const res = await meGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.teams).toEqual([]);
  });

  it('returns every team unchanged when none are archived (regression)', async () => {
    seed({ liveTeams: 3, archivedTeams: 0 });
    const res = await meGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.teams).toHaveLength(3);
  });
});
