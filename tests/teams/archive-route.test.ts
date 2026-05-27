/**
 * Ticket 0053 — Archive + Unarchive a team.
 *
 * Tests the POST /api/teams/[teamId]/archive and
 * POST /api/teams/[teamId]/unarchive routes' role gating and the idempotent
 * archive/unarchive behavior.
 *
 * Strategy mirrors tests/sessions/delete-session-route.test.ts (the sibling
 * 0051 typed endpoint): @/lib/supabase/server is replaced with a chainable
 * in-memory mock so the route runs without a real DB connection. The mock
 * keeps a tiny key/value store of "tables" so we can assert on the rows the
 * route changed.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob (LESSONS.md
 * 2026-05-20).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted in-memory DB + mocks ─────────────────────────────────────────────

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
    const state: { filters: Array<[string, unknown]>; op: null | 'select' | 'update' | 'delete'; payload?: Row } = {
      filters: [],
      op: null,
    };

    function matches(row: Row) {
      return state.filters.every(([k, v]) => row[k] === v);
    }

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
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
      then: (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
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

vi.mock('@/lib/webhooks', () => ({
  fireWebhooks: fireWebhooksMock,
}));

vi.mock('@/lib/cache/memory', () => ({
  memBustPrefix: memBustMock,
  memBust: memBustMock,
}));

import { POST as archivePOST } from '@/app/api/teams/[teamId]/archive/route';
import { POST as unarchivePOST } from '@/app/api/teams/[teamId]/unarchive/route';

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

function makeReq(teamId: string) {
  return new Request(`http://localhost/api/teams/${teamId}/archive`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
}

async function callArchive(teamId: string) {
  return archivePOST(makeReq(teamId), { params: Promise.resolve({ teamId }) });
}

async function callUnarchive(teamId: string) {
  return unarchivePOST(
    new Request(`http://localhost/api/teams/${teamId}/unarchive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ teamId }) },
  );
}

/**
 * Baseline: one org with one team, the caller is an admin coach of that org,
 * AND the head_coach in team_coaches. Live (archived_at null) team.
 */
function seedBaseline(opts: {
  callerOrgRole?: 'admin' | 'head_coach' | 'coach' | 'assistant' | 'coordinator';
  callerTeamRole?: 'head_coach' | 'coach' | 'assistant' | null;
} = {}) {
  resetDb();
  db.organizations = [{ id: 'org-1', tier: 'organization' }];
  db.coaches = [
    { id: 'caller-1', org_id: 'org-1', role: opts.callerOrgRole ?? 'admin' },
  ];
  db.teams = [
    { id: 'team-1', org_id: 'org-1', name: 'Wildcats', archived_at: null },
  ];
  if (opts.callerTeamRole !== null) {
    db.team_coaches = [
      { team_id: 'team-1', coach_id: 'caller-1', role: opts.callerTeamRole ?? 'head_coach' },
    ];
  } else {
    db.team_coaches = [];
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/teams/[teamId]/archive (ticket 0053)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
  });

  it('returns 401 when not authenticated', async () => {
    setNoAuth();
    seedBaseline();
    const res = await callArchive('team-1');
    expect(res.status).toBe(401);
    expect(db.teams[0].archived_at).toBeNull();
  });

  it('returns 404 for an unknown team id', async () => {
    setAuth('caller-1');
    seedBaseline();
    const res = await callArchive('does-not-exist');
    expect(res.status).toBe(404);
    expect(db.teams[0].archived_at).toBeNull();
  });

  it('returns 404 (not 403) for a team in a different org — no existence leak', async () => {
    setAuth('caller-1');
    resetDb();
    db.coaches = [{ id: 'caller-1', org_id: 'org-mine', role: 'admin' }];
    db.teams = [{ id: 'team-other', org_id: 'org-other', name: 'Other Team', archived_at: null }];
    db.team_coaches = [];
    const res = await callArchive('team-other');
    expect(res.status).toBe(404);
    expect(db.teams[0].archived_at).toBeNull();
  });

  it('returns 200 when caller is an org admin (and not a team_coaches member)', async () => {
    setAuth('caller-1');
    seedBaseline({ callerOrgRole: 'admin', callerTeamRole: null });
    const res = await callArchive('team-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.archivedAt).toBeTruthy();
    expect(db.teams[0].archived_at).not.toBeNull();
  });

  it('returns 200 when caller is a head_coach of the team (even without org admin role)', async () => {
    setAuth('caller-1');
    seedBaseline({ callerOrgRole: 'coach', callerTeamRole: 'head_coach' });
    const res = await callArchive('team-1');
    expect(res.status).toBe(200);
    expect(db.teams[0].archived_at).not.toBeNull();
  });

  it('returns 403 when caller is neither org admin nor team head_coach (assistant on team)', async () => {
    setAuth('caller-1');
    seedBaseline({ callerOrgRole: 'coach', callerTeamRole: 'assistant' });
    const res = await callArchive('team-1');
    expect(res.status).toBe(403);
    expect(db.teams[0].archived_at).toBeNull();
  });

  it('is idempotent on a team that is already archived (returns the original archivedAt)', async () => {
    setAuth('caller-1');
    seedBaseline();
    // Pre-archive
    const firstArchived = '2026-01-01T00:00:00.000Z';
    db.teams[0].archived_at = firstArchived;
    const res = await callArchive('team-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // archivedAt unchanged on re-call
    expect(body.archivedAt).toBe(firstArchived);
    expect(db.teams[0].archived_at).toBe(firstArchived);
  });

  it('busts the /api/me cache for every coach on the team', async () => {
    setAuth('caller-1');
    seedBaseline();
    // Two coaches on the team — both should have their cache busted.
    db.team_coaches = [
      { team_id: 'team-1', coach_id: 'caller-1', role: 'head_coach' },
      { team_id: 'team-1', coach_id: 'other-coach', role: 'coach' },
    ];
    await callArchive('team-1');
    // memBust is called per coach id with the me:* key. Don't tie to the exact
    // prefix — just confirm we busted something for every team coach.
    expect(memBustMock).toHaveBeenCalled();
    const calls = memBustMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((k) => k.includes('caller-1'))).toBe(true);
    expect(calls.some((k) => k.includes('other-coach'))).toBe(true);
  });

  it('fires the team.archived webhook with the team id and orgId', async () => {
    setAuth('caller-1');
    seedBaseline();
    await callArchive('team-1');
    expect(fireWebhooksMock).toHaveBeenCalledTimes(1);
    const args = fireWebhooksMock.mock.calls[0] as unknown as [string, string, Row];
    expect(args[0]).toBe('org-1');
    expect(args[1]).toBe('team.archived');
    expect(args[2].team_id).toBe('team-1');
  });
});

describe('POST /api/teams/[teamId]/unarchive (ticket 0053)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
  });

  it('returns 401 when not authenticated', async () => {
    setNoAuth();
    seedBaseline();
    db.teams[0].archived_at = '2026-01-01T00:00:00.000Z';
    const res = await callUnarchive('team-1');
    expect(res.status).toBe(401);
    expect(db.teams[0].archived_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns 200 and clears archived_at for an org admin', async () => {
    setAuth('caller-1');
    seedBaseline();
    db.teams[0].archived_at = '2026-01-01T00:00:00.000Z';
    const res = await callUnarchive('team-1');
    expect(res.status).toBe(200);
    expect(db.teams[0].archived_at).toBeNull();
  });

  it('returns 200 and is a no-op for a team that is already live', async () => {
    setAuth('caller-1');
    seedBaseline();
    expect(db.teams[0].archived_at).toBeNull();
    const res = await callUnarchive('team-1');
    expect(res.status).toBe(200);
    expect(db.teams[0].archived_at).toBeNull();
  });

  it('returns 403 when caller is neither org admin nor team head_coach', async () => {
    setAuth('caller-1');
    seedBaseline({ callerOrgRole: 'coach', callerTeamRole: 'assistant' });
    db.teams[0].archived_at = '2026-01-01T00:00:00.000Z';
    const res = await callUnarchive('team-1');
    expect(res.status).toBe(403);
    expect(db.teams[0].archived_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns 404 for a team in a different org', async () => {
    setAuth('caller-1');
    resetDb();
    db.coaches = [{ id: 'caller-1', org_id: 'org-mine', role: 'admin' }];
    db.teams = [{ id: 'team-other', org_id: 'org-other', name: 'Other', archived_at: '2026-01-01T00:00:00.000Z' }];
    db.team_coaches = [];
    const res = await callUnarchive('team-other');
    expect(res.status).toBe(404);
    expect(db.teams[0].archived_at).toBe('2026-01-01T00:00:00.000Z');
  });
});
