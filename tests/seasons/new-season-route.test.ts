/**
 * Ticket 0052 — POST /api/teams/[teamId]/new-season.
 *
 * The route applies a returning/released/new roster partition for a team in
 * one atomic submit:
 *   1. (optional) snapshot the closing season into season_archives
 *   2. mark released players: players.released_at = NOW()
 *   3. insert the new players (COPPA-narrow allow-list)
 *   4. update teams.season / current_week
 *   5. bust /api/me cache for the team's coaches
 *
 * Auth + role gate mirror the 0053 delete-team route shape — uses the shared
 * `resolveTeamAccess` helper. Head coach of the team is required; cross-org
 * → 404 (no existence leak).
 *
 * The in-memory chainable mock follows the delete-route test pattern (one
 * Row[] per table, .eq/.in/.is/.update/.delete/.insert/.then). LESSONS#92 —
 * keep mock methods consistent across the route's surface; if a future
 * sibling route calls a new builder method, this mock needs it too.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const { db, mockGetUser, mockFromFn, memBustMock } = vi.hoisted(() => {
  const db: Record<string, Row[]> = {};
  return {
    db,
    mockGetUser: vi.fn(),
    mockFromFn: vi.fn((table: string) => buildChain(table)),
    memBustMock: vi.fn(),
  };

  function buildChain(table: string) {
    const state: {
      filters: Array<[string, unknown]>;
      inFilters: Array<[string, unknown[]]>;
      nullFilters: Array<string>;
      op: null | 'select' | 'update' | 'delete' | 'insert';
      payload?: Row | Row[];
      countMode: boolean;
    } = { filters: [], inFilters: [], nullFilters: [], op: null, countMode: false };

    function matches(row: Row) {
      if (!state.filters.every(([k, v]) => row[k] === v)) return false;
      if (!state.inFilters.every(([k, vs]) => vs.includes(row[k]))) return false;
      if (!state.nullFilters.every((k) => row[k] === null || row[k] === undefined)) return false;
      return true;
    }

    function applyInsert() {
      const rows = Array.isArray(state.payload) ? state.payload : [state.payload!];
      if (!db[table]) db[table] = [];
      const seeded = rows.map((r) => ({ id: `gen-${Math.random().toString(36).slice(2, 9)}`, ...r }));
      db[table].push(...seeded);
      return seeded;
    }

    const chain: Record<string, unknown> = {
      select: vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' && opts?.head) state.countMode = true;
        return chain;
      }),
      update: vi.fn((payload: Row) => {
        state.op = 'update';
        state.payload = payload;
        return chain;
      }),
      delete: vi.fn(() => {
        state.op = 'delete';
        return chain;
      }),
      insert: vi.fn((payload: Row | Row[]) => {
        state.op = 'insert';
        state.payload = payload;
        return chain;
      }),
      eq: vi.fn((k: string, v: unknown) => {
        state.filters.push([k, v]);
        return chain;
      }),
      in: vi.fn((k: string, vs: unknown[]) => {
        state.inFilters.push([k, vs]);
        return chain;
      }),
      is: vi.fn((k: string, v: unknown) => {
        if (v === null) state.nullFilters.push(k);
        return chain;
      }),
      maybeSingle: vi.fn(async () => {
        if (state.op === 'insert') {
          const seeded = applyInsert();
          return { data: seeded[0] ?? null, error: null };
        }
        const rows = (db[table] || []).filter(matches);
        return { data: rows[0] ?? null, error: null };
      }),
      single: vi.fn(async () => {
        if (state.op === 'insert') {
          const seeded = applyInsert();
          return { data: seeded[0] ?? null, error: null };
        }
        const rows = (db[table] || []).filter(matches);
        return { data: rows[0] ?? null, error: null };
      }),
      then: (resolve: (v: { data: unknown; error: unknown; count?: number }) => unknown) => {
        if (state.op === 'update') {
          const rows = db[table] || [];
          for (const r of rows) {
            if (matches(r)) Object.assign(r, state.payload || {});
          }
          return Promise.resolve(resolve({ data: rows.filter(matches), error: null }));
        }
        if (state.op === 'delete') {
          const rows = db[table] || [];
          const keep = rows.filter((r) => !matches(r));
          db[table] = keep;
          return Promise.resolve(resolve({ data: null, error: null }));
        }
        if (state.op === 'insert') {
          const seeded = applyInsert();
          return Promise.resolve(resolve({ data: seeded, error: null }));
        }
        const rows = (db[table] || []).filter(matches);
        if (state.countMode) {
          return Promise.resolve(resolve({ data: null, error: null, count: rows.length }));
        }
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

vi.mock('@/lib/cache/memory', () => ({
  memBustPrefix: memBustMock,
  memBust: memBustMock,
}));

import { POST } from '@/app/api/teams/[teamId]/new-season/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetDb() {
  for (const k of Object.keys(db)) delete db[k];
}

function setAuth(userId: string) {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

function setNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

function makeReq(teamId: string, body?: Record<string, unknown>) {
  return new Request(`http://localhost/api/teams/${teamId}/new-season`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : '{}',
  });
}

async function callPost(teamId: string, body?: Record<string, unknown>) {
  return POST(makeReq(teamId, body), { params: Promise.resolve({ teamId }) });
}

function seedBaseTeam(opts: {
  callerOrgRole?: 'admin' | 'head_coach' | 'coach' | 'assistant';
  callerTeamRole?: 'head_coach' | 'coach' | 'assistant' | null;
  teamSeason?: string;
} = {}) {
  resetDb();
  db.organizations = [{ id: 'org-1', tier: 'free' }];
  db.coaches = [
    { id: 'caller-1', org_id: 'org-1', role: opts.callerOrgRole ?? 'head_coach' },
    { id: 'other-coach', org_id: 'org-1', role: 'coach' },
  ];
  db.teams = [
    {
      id: 'team-1',
      org_id: 'org-1',
      name: 'Wildcats',
      archived_at: null,
      season: opts.teamSeason ?? 'Spring 2026',
      season_weeks: 10,
      current_week: 9,
    },
  ];
  db.team_coaches = [
    ...(opts.callerTeamRole === null
      ? []
      : [{ team_id: 'team-1', coach_id: 'caller-1', role: opts.callerTeamRole ?? 'head_coach' }]),
    { team_id: 'team-1', coach_id: 'other-coach', role: 'coach' },
  ];
  db.players = [
    { id: 'p-returning', team_id: 'team-1', name: 'Alice', age_group: '11-13', is_active: true, released_at: null, position: 'Guard', jersey_number: 1 },
    { id: 'p-released', team_id: 'team-1', name: 'Ben', age_group: '11-13', is_active: true, released_at: null, position: 'Forward', jersey_number: 5 },
    { id: 'p-also-returning', team_id: 'team-1', name: 'Cory', age_group: '11-13', is_active: true, released_at: null, position: 'Guard', jersey_number: 8 },
  ];
  db.season_archives = [];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/teams/[teamId]/new-season (ticket 0052)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
  });

  it('returns 401 with no auth and NEVER writes', async () => {
    setNoAuth();
    seedBaseTeam();
    const before = JSON.stringify(db);
    const res = await callPost('team-1', {
      seasonName: 'Fall 2026',
      returningPlayerIds: ['p-returning'],
      releasePlayerIds: ['p-released'],
      newPlayers: [],
    });
    expect(res.status).toBe(401);
    expect(JSON.stringify(db)).toBe(before);
  });

  it('returns 404 for a team in a different org (no existence leak)', async () => {
    setAuth('caller-1');
    resetDb();
    db.organizations = [{ id: 'org-mine', tier: 'free' }];
    db.coaches = [{ id: 'caller-1', org_id: 'org-mine', role: 'head_coach' }];
    db.teams = [{ id: 'team-other', org_id: 'org-other', name: 'Other', season: 'X', season_weeks: 10, current_week: 1, archived_at: null }];
    db.team_coaches = [];
    db.players = [];
    const before = JSON.stringify(db);
    const res = await callPost('team-other', {
      seasonName: 'Fall 2026',
      returningPlayerIds: [],
      releasePlayerIds: [],
      newPlayers: [],
    });
    expect(res.status).toBe(404);
    expect(JSON.stringify(db)).toBe(before);
  });

  it('returns 403 when the caller is NOT a head_coach of this team', async () => {
    setAuth('caller-1');
    seedBaseTeam({ callerOrgRole: 'coach', callerTeamRole: 'coach' });
    const before = JSON.stringify(db);
    const res = await callPost('team-1', {
      seasonName: 'Fall 2026',
      returningPlayerIds: ['p-returning'],
      releasePlayerIds: ['p-released'],
      newPlayers: [],
    });
    expect(res.status).toBe(403);
    expect(JSON.stringify(db)).toBe(before);
  });

  it('returns 400 when seasonName is missing', async () => {
    setAuth('caller-1');
    seedBaseTeam();
    const res = await callPost('team-1', {
      returningPlayerIds: ['p-returning'],
      releasePlayerIds: ['p-released'],
      newPlayers: [],
    });
    expect(res.status).toBe(400);
  });

  it('atomically applies the partition: releases marked, new added, team season advanced', async () => {
    setAuth('caller-1');
    seedBaseTeam();
    const res = await callPost('team-1', {
      seasonName: 'Fall 2026',
      seasonWeeks: 12,
      returningPlayerIds: ['p-returning', 'p-also-returning'],
      releasePlayerIds: ['p-released'],
      newPlayers: [
        { name: 'Dani', ageGroup: '11-13', position: 'Center', jerseyNumber: 22 },
        { name: 'Ezra', ageGroup: '11-13' },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.teamId).toBe('team-1');
    expect(body.seasonName).toBe('Fall 2026');
    expect(body.returningCount).toBe(2);
    expect(body.releasedCount).toBe(1);
    expect(body.addedCount).toBe(2);

    // The released player has released_at set; the returning ones don't.
    const released = (db.players ?? []).find((p) => p.id === 'p-released')!;
    expect(released.released_at).toBeTruthy();
    const returning = (db.players ?? []).find((p) => p.id === 'p-returning')!;
    expect(returning.released_at).toBeNull();

    // Two new player rows exist on the team.
    const newRows = (db.players ?? []).filter(
      (p) => p.team_id === 'team-1' && (p.name === 'Dani' || p.name === 'Ezra')
    );
    expect(newRows).toHaveLength(2);
    // New players default to is_active=true.
    for (const r of newRows) {
      expect(r.is_active).toBe(true);
    }

    // Team's season advanced; current_week reset to 1.
    const team = (db.teams ?? []).find((t) => t.id === 'team-1')!;
    expect(team.season).toBe('Fall 2026');
    expect(team.current_week).toBe(1);
    expect(team.season_weeks).toBe(12);
  });

  it('busts the /api/me cache for every coach on the team', async () => {
    setAuth('caller-1');
    seedBaseTeam();
    await callPost('team-1', {
      seasonName: 'Fall 2026',
      returningPlayerIds: ['p-returning', 'p-also-returning'],
      releasePlayerIds: ['p-released'],
      newPlayers: [],
    });
    const keys = memBustMock.mock.calls.map((c) => String(c[0]));
    expect(keys.some((k) => k.includes('caller-1'))).toBe(true);
    expect(keys.some((k) => k.includes('other-coach'))).toBe(true);
  });

  it('writes ONLY allow-listed columns to new players (COPPA payload allowlist)', async () => {
    setAuth('caller-1');
    seedBaseTeam();
    // A forged body attempts to widen the insert with a free-text DOB and
    // a parent_email — the route MUST drop both rather than persisting them.
    const res = await callPost('team-1', {
      seasonName: 'Fall 2026',
      returningPlayerIds: [],
      releasePlayerIds: [],
      newPlayers: [
        {
          name: 'Forged',
          ageGroup: '11-13',
          // Attempt to widen with disallowed fields:
          date_of_birth: '2010-01-01',
          parent_email: 'leak@example.com',
          medical_notes: 'should never be stored',
        } as unknown as { name: string; ageGroup: string },
      ],
    });
    expect(res.status).toBe(200);
    const forged = (db.players ?? []).find((p) => p.name === 'Forged')!;
    expect(forged).toBeTruthy();
    expect(forged.date_of_birth).toBeUndefined();
    expect(forged.parent_email).toBeUndefined();
    expect(forged.medical_notes).toBeUndefined();
  });

  it('is idempotent: a second identical post does not double-release or duplicate players', async () => {
    setAuth('caller-1');
    seedBaseTeam();
    const body = {
      seasonName: 'Fall 2026',
      returningPlayerIds: ['p-returning'],
      releasePlayerIds: ['p-released'],
      newPlayers: [{ name: 'Dani', ageGroup: '11-13' }],
    };
    const first = await callPost('team-1', body);
    expect(first.status).toBe(200);

    const playersAfterFirst = JSON.stringify(db.players);
    const teamAfterFirst = JSON.stringify(db.teams);

    const second = await callPost('team-1', body);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.noop).toBe(true);

    // No second 'Dani' row was inserted; no second released_at was bumped.
    expect(JSON.stringify(db.players)).toBe(playersAfterFirst);
    expect(JSON.stringify(db.teams)).toBe(teamAfterFirst);
  });

  it('writes a season_archives row when archivePreviousSeason is true', async () => {
    setAuth('caller-1');
    seedBaseTeam();
    const res = await callPost('team-1', {
      seasonName: 'Fall 2026',
      archivePreviousSeason: true,
      archiveNotes: 'Spring closed strong',
      returningPlayerIds: ['p-returning'],
      releasePlayerIds: ['p-released'],
      newPlayers: [],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archiveId).toBeTruthy();
    expect((db.season_archives ?? []).length).toBe(1);
    const archive = (db.season_archives ?? [])[0];
    expect(archive.team_id).toBe('team-1');
    // The archive captures the PRIOR season name (the team's season at the
    // moment of the call), not the new one.
    expect(archive.season_name).toBe('Spring 2026');
  });

  it('does NOT write a season_archives row when archivePreviousSeason is false (default)', async () => {
    setAuth('caller-1');
    seedBaseTeam();
    const res = await callPost('team-1', {
      seasonName: 'Fall 2026',
      returningPlayerIds: ['p-returning'],
      releasePlayerIds: ['p-released'],
      newPlayers: [],
    });
    expect(res.status).toBe(200);
    expect((db.season_archives ?? []).length).toBe(0);
  });

  it('succeeds on a free-tier org (no tier gate — roster turnover is universal)', async () => {
    setAuth('caller-1');
    seedBaseTeam();
    const res = await callPost('team-1', {
      seasonName: 'Fall 2026',
      returningPlayerIds: ['p-returning'],
      releasePlayerIds: ['p-released'],
      newPlayers: [{ name: 'Newcomer', ageGroup: '11-13' }],
    });
    expect(res.status).toBe(200);
  });
});
