/**
 * Ticket 0053 — maxTeams pre-check counts ACTIVE teams only.
 *
 * The Coach tier's `maxTeams = 3` is enforced in /api/auth/create-team via a
 * head-count on the teams table for the org. Today the count is the raw row
 * count, which means an archived mistake-team consumes a slot. After this
 * ticket, the count is gated on `archived_at IS NULL` so an admin can clean up
 * a roster and immediately add a new active team.
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
      filters: Array<[string, unknown, 'eq' | 'is']>;
      countMode: boolean;
      insertPayload?: Row;
      op?: 'select' | 'insert';
    } = { filters: [], countMode: false };

    function matches(row: Row) {
      return state.filters.every(([k, v, mode]) => {
        if (mode === 'is') return row[k] === v;
        return row[k] === v;
      });
    }

    const chain: Record<string, unknown> = {
      select: vi.fn((_select?: string, opts?: { count?: string; head?: boolean }) => {
        state.op = 'select';
        if (opts?.count === 'exact' && opts?.head) state.countMode = true;
        return chain;
      }),
      insert: vi.fn((payload: Row) => {
        state.op = 'insert';
        state.insertPayload = payload;
        return chain;
      }),
      eq: vi.fn((k: string, v: unknown) => {
        state.filters.push([k, v, 'eq']);
        return chain;
      }),
      is: vi.fn((k: string, v: unknown) => {
        state.filters.push([k, v, 'is']);
        return chain;
      }),
      single: vi.fn(async () => {
        if (state.op === 'insert') {
          const inserted = { id: 'new-team-id', ...(state.insertPayload || {}) };
          store[table] = [...(store[table] || []), inserted];
          return { data: inserted, error: null };
        }
        const rows = (store[table] || []).filter(matches);
        return { data: rows[0] ?? null, error: null };
      }),
      then: (resolve: (v: { data: unknown; error: unknown; count?: number }) => unknown) => {
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

import { POST as createTeam } from '@/app/api/auth/create-team/route';

function resetDb() {
  for (const k of Object.keys(db)) delete db[k];
}

function makeReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/create-team', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function seedCoachTier(opts: {
  liveTeams: number;
  archivedTeams: number;
  tier?: 'free' | 'coach' | 'pro_coach' | 'organization';
}) {
  resetDb();
  db.coaches = [{ id: 'caller-1', org_id: 'org-1' }];
  db.organizations = [
    {
      id: 'org-1',
      tier: opts.tier ?? 'coach',
      sport_config: { default_sport_slug: 'basketball' },
    },
  ];
  db.sports = [{ id: 'sport-basketball', slug: 'basketball' }];
  db.curricula = [];
  db.teams = [];
  for (let i = 0; i < opts.liveTeams; i++) {
    db.teams.push({ id: `team-live-${i}`, org_id: 'org-1', archived_at: null });
  }
  for (let i = 0; i < opts.archivedTeams; i++) {
    db.teams.push({ id: `team-arch-${i}`, org_id: 'org-1', archived_at: '2026-01-01T00:00:00.000Z' });
  }
}

describe('/api/auth/create-team — maxTeams excludes archived rows (ticket 0053)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'caller-1' } }, error: null });
  });

  it('blocks creation when 3 LIVE teams already exist on the coach tier', async () => {
    seedCoachTier({ liveTeams: 3, archivedTeams: 0, tier: 'coach' });
    const res = await createTeam(makeReq({ teamName: 'New Team' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.upgrade).toBe(true);
  });

  it('ALLOWS creation when 2 live + 1 archived team exist on the coach tier (archived does not consume a slot)', async () => {
    seedCoachTier({ liveTeams: 2, archivedTeams: 1, tier: 'coach' });
    const res = await createTeam(makeReq({ teamName: 'New Team' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('ALLOWS creation when 3 live + 5 archived exist on a higher tier (pro_coach maxTeams=999)', async () => {
    seedCoachTier({ liveTeams: 3, archivedTeams: 5, tier: 'pro_coach' });
    const res = await createTeam(makeReq({ teamName: 'New Team' }));
    expect(res.status).toBe(200);
  });

  it('still blocks the free tier at maxTeams=1 (regression)', async () => {
    seedCoachTier({ liveTeams: 1, archivedTeams: 0, tier: 'free' });
    const res = await createTeam(makeReq({ teamName: 'New Team' }));
    expect(res.status).toBe(403);
  });
});
