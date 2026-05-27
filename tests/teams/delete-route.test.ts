/**
 * Ticket 0053 — Hard-delete a team.
 *
 * Tests the DELETE /api/teams/[teamId] route's role gating, the
 * archived-first precondition, the typed-name confirm, and the per-child-table
 * cascade matrix (and the `ai_interactions.team_id = NULL` carve-out — that
 * row must survive at the org-audit level, just unscoped from the dead team).
 *
 * Strategy mirrors tests/sessions/delete-session-route.test.ts: an in-memory
 * "DB" keyed by table name, with a chainable mock that supports
 * select/update/delete + eq. We seed one row per child table the route is
 * documented to clean up, then assert each is gone (or NULLed, for
 * ai_interactions).
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob (LESSONS.md
 * 2026-05-20).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const { db, mockGetUser, mockFromFn, fireWebhooksMock, memBustMock } = vi.hoisted(() => {
  const db: Record<string, Row[]> = {};
  return {
    db,
    mockGetUser: vi.fn(),
    mockFromFn: vi.fn((table: string) => buildChain(db, table)),
    fireWebhooksMock: vi.fn(async () => undefined),
    memBustMock: vi.fn(),
  };

  function buildChain(store: Record<string, Row[]>, table: string) {
    const state: {
      filters: Array<[string, unknown]>;
      op: null | 'select' | 'update' | 'delete';
      payload?: Row;
      countMode: boolean;
    } = { filters: [], op: null, countMode: false };

    function matches(row: Row) {
      return state.filters.every(([k, v]) => row[k] === v);
    }

    const chain: Record<string, unknown> = {
      select: vi.fn((_select?: string, opts?: { count?: string; head?: boolean }) => {
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
      eq: vi.fn((k: string, v: unknown) => {
        state.filters.push([k, v]);
        return chain;
      }),
      maybeSingle: vi.fn(async () => {
        const rows = (store[table] || []).filter(matches);
        return { data: rows[0] ?? null, error: null };
      }),
      single: vi.fn(async () => {
        const rows = (store[table] || []).filter(matches);
        return { data: rows[0] ?? null, error: null };
      }),
      then: (resolve: (v: { data: unknown; error: unknown; count?: number }) => unknown) => {
        if (state.op === 'update') {
          const rows = store[table] || [];
          for (const r of rows) {
            if (matches(r)) Object.assign(r, state.payload || {});
          }
          return Promise.resolve(resolve({ data: rows.filter(matches), error: null }));
        }
        if (state.op === 'delete') {
          const rows = store[table] || [];
          const keep = rows.filter((r) => !matches(r));
          store[table] = keep;
          return Promise.resolve(resolve({ data: null, error: null }));
        }
        // SELECT: support head-count + filter (route counts pre-delete child rows).
        const rows = (store[table] || []).filter(matches);
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

vi.mock('@/lib/webhooks', () => ({
  fireWebhooks: fireWebhooksMock,
}));

vi.mock('@/lib/cache/memory', () => ({
  memBustPrefix: memBustMock,
  memBust: memBustMock,
}));

import { DELETE } from '@/app/api/teams/[teamId]/route';

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
  return new Request(`http://localhost/api/teams/${teamId}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function callDelete(teamId: string, body?: Record<string, unknown>) {
  return DELETE(makeReq(teamId, body), { params: Promise.resolve({ teamId }) });
}

/**
 * Seeds a baseline team with one row per cleaned-up table, all scoped to
 * team-1. The team is ARCHIVED (precondition for hard-delete).
 */
function seedTeamWithChildren(opts: {
  callerRole?: 'admin' | 'head_coach' | 'coach' | 'assistant';
  teamArchived?: boolean;
} = {}) {
  resetDb();
  db.organizations = [{ id: 'org-1', tier: 'organization' }];
  db.coaches = [
    { id: 'caller-1', org_id: 'org-1', role: opts.callerRole ?? 'admin' },
    { id: 'other-coach', org_id: 'org-1', role: 'coach' },
  ];
  db.teams = [
    {
      id: 'team-1',
      org_id: 'org-1',
      name: 'Wildcats',
      archived_at: opts.teamArchived === false ? null : '2026-04-01T00:00:00.000Z',
    },
  ];
  db.team_coaches = [
    { team_id: 'team-1', coach_id: 'caller-1', role: 'head_coach' },
    { team_id: 'team-1', coach_id: 'other-coach', role: 'coach' },
  ];
  db.players = [{ id: 'p1', team_id: 'team-1', name: 'Alice', is_active: true }];
  db.sessions = [{ id: 's1', team_id: 'team-1', type: 'practice' }];
  db.observations = [{ id: 'o1', team_id: 'team-1', player_id: 'p1', text: 'hustle' }];
  db.recordings = [{ id: 'r1', team_id: 'team-1' }];
  db.media = [{ id: 'm1', team_id: 'team-1' }];
  db.plans = [{ id: 'plan-1', team_id: 'team-1', type: 'practice' }];
  db.parent_shares = [{ id: 'ps1', team_id: 'team-1', share_token: 'tok' }];
  db.team_announcements = [{ id: 'ta1', team_id: 'team-1', body: 'hi' }];
  db.season_archives = [{ id: 'sa1', team_id: 'team-1' }];
  db.recurring_sessions = [{ id: 'rs1', team_id: 'team-1' }];
  db.config_overrides = [{ id: 'co1', team_id: 'team-1', scope: 'team' }];
  db.player_availability = [{ id: 'pa1', team_id: 'team-1', player_id: 'p1' }];
  db.player_achievements = [{ id: 'pach1', team_id: 'team-1', player_id: 'p1' }];
  db.player_goals = [{ id: 'pg1', team_id: 'team-1', player_id: 'p1' }];
  db.player_notes = [{ id: 'pn1', team_id: 'team-1', player_id: 'p1' }];
  db.team_custom_skills = [{ id: 'tcs1', team_id: 'team-1' }];
  // ai_interactions DOES NOT cascade — route must NULL out team_id but keep
  // the row for the org-level audit log.
  db.ai_interactions = [
    { id: 'ai1', team_id: 'team-1', org_id: 'org-1', coach_id: 'caller-1' },
  ];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DELETE /api/teams/[teamId] (ticket 0053)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
  });

  it('returns 401 when not authenticated', async () => {
    setNoAuth();
    seedTeamWithChildren();
    const res = await callDelete('team-1', { confirm: 'Wildcats' });
    expect(res.status).toBe(401);
    expect(db.teams).toHaveLength(1);
  });

  it('returns 404 for an unknown team id', async () => {
    setAuth('caller-1');
    seedTeamWithChildren();
    const res = await callDelete('nope', { confirm: 'Wildcats' });
    expect(res.status).toBe(404);
    expect(db.teams).toHaveLength(1);
  });

  it('returns 404 (not 403) for a team in a different org', async () => {
    setAuth('caller-1');
    resetDb();
    db.coaches = [{ id: 'caller-1', org_id: 'org-mine', role: 'admin' }];
    db.teams = [{ id: 'team-other', org_id: 'org-other', name: 'Other', archived_at: '2026-01-01' }];
    db.team_coaches = [];
    const res = await callDelete('team-other', { confirm: 'Other' });
    expect(res.status).toBe(404);
    expect(db.teams).toHaveLength(1);
  });

  it('returns 409 when the team is NOT archived (must archive first)', async () => {
    setAuth('caller-1');
    seedTeamWithChildren({ teamArchived: false });
    const res = await callDelete('team-1', { confirm: 'Wildcats' });
    expect(res.status).toBe(409);
    expect(db.teams).toHaveLength(1);
    expect(db.players).toHaveLength(1);
  });

  it('returns 403 when caller is a head_coach but NOT an org admin', async () => {
    setAuth('caller-1');
    seedTeamWithChildren({ callerRole: 'coach' });
    const res = await callDelete('team-1', { confirm: 'Wildcats' });
    expect(res.status).toBe(403);
    expect(db.teams).toHaveLength(1);
  });

  it('returns 400 when the confirm field is missing', async () => {
    setAuth('caller-1');
    seedTeamWithChildren();
    const res = await callDelete('team-1');
    expect(res.status).toBe(400);
    expect(db.teams).toHaveLength(1);
    expect(db.players).toHaveLength(1);
  });

  it('returns 400 when confirm does not match team name (case-insensitive, trimmed)', async () => {
    setAuth('caller-1');
    seedTeamWithChildren();
    const res = await callDelete('team-1', { confirm: 'Lakers' });
    expect(res.status).toBe(400);
    expect(db.teams).toHaveLength(1);
  });

  it('accepts confirm case-insensitively with surrounding whitespace', async () => {
    setAuth('caller-1');
    seedTeamWithChildren();
    const res = await callDelete('team-1', { confirm: '  wildcats  ' });
    expect(res.status).toBe(200);
    expect(db.teams).toHaveLength(0);
  });

  it('returns 200 and deletes the team plus every cascaded child row', async () => {
    setAuth('caller-1');
    seedTeamWithChildren();
    const res = await callDelete('team-1', { confirm: 'Wildcats' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.removedCounts).toBeDefined();

    // The team itself is gone.
    expect(db.teams).toHaveLength(0);

    // Every cascaded child row scoped to this team is gone.
    const allGone: Array<keyof typeof db> = [
      'players',
      'sessions',
      'observations',
      'recordings',
      'media',
      'plans',
      'parent_shares',
      'team_announcements',
      'season_archives',
      'recurring_sessions',
      'config_overrides',
      'player_availability',
      'player_achievements',
      'player_goals',
      'player_notes',
      'team_custom_skills',
      'team_coaches',
    ];
    for (const t of allGone) {
      const rows = (db[t] || []).filter((r) => r.team_id === 'team-1');
      expect(rows, `expected ${t}.team_id=team-1 to be empty after delete`).toHaveLength(0);
    }
  });

  it('NULLs out ai_interactions.team_id rather than deleting the row (org-level audit)', async () => {
    setAuth('caller-1');
    seedTeamWithChildren();
    const res = await callDelete('team-1', { confirm: 'Wildcats' });
    expect(res.status).toBe(200);
    // The ai_interactions row survives, but its team_id is now null.
    expect(db.ai_interactions).toHaveLength(1);
    expect(db.ai_interactions[0].team_id).toBeNull();
    // org_id (and coach_id) survive so the audit trail is intact.
    expect(db.ai_interactions[0].org_id).toBe('org-1');
    expect(db.ai_interactions[0].coach_id).toBe('caller-1');
  });

  it('returns removedCounts with per-table head counts of pre-delete rows', async () => {
    setAuth('caller-1');
    // Seed extras on some tables to confirm the counts reflect REAL pre-delete
    // numbers, not just 1-per-table.
    seedTeamWithChildren();
    db.players.push({ id: 'p2', team_id: 'team-1', name: 'Bob', is_active: true });
    db.observations.push({ id: 'o2', team_id: 'team-1', player_id: 'p1', text: 'more' });
    db.observations.push({ id: 'o3', team_id: 'team-1', player_id: 'p1', text: 'and more' });
    const res = await callDelete('team-1', { confirm: 'Wildcats' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removedCounts.players).toBe(2);
    expect(body.removedCounts.sessions).toBe(1);
    expect(body.removedCounts.observations).toBe(3);
    expect(body.removedCounts.parent_shares).toBe(1);
  });

  it('fires the team.deleted webhook with the removedCounts snapshot', async () => {
    setAuth('caller-1');
    seedTeamWithChildren();
    await callDelete('team-1', { confirm: 'Wildcats' });
    expect(fireWebhooksMock).toHaveBeenCalledTimes(1);
    const args = fireWebhooksMock.mock.calls[0];
    expect(args[0]).toBe('org-1');
    expect(args[1]).toBe('team.deleted');
    const payload = args[2] as Row;
    expect(payload.team_id).toBe('team-1');
    expect(payload.removed_counts).toBeDefined();
  });

  it('busts the /api/me cache for every coach who was on the team', async () => {
    setAuth('caller-1');
    seedTeamWithChildren();
    await callDelete('team-1', { confirm: 'Wildcats' });
    const keys = memBustMock.mock.calls.map((c) => String(c[0]));
    expect(keys.some((k) => k.includes('caller-1'))).toBe(true);
    expect(keys.some((k) => k.includes('other-coach'))).toBe(true);
  });
});
