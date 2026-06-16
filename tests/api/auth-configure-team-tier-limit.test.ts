/**
 * Ticket 0086 — same structured tier-limit body on /api/auth/configure-team.
 *
 * The combined sport+team setup route shares the maxTeams gate with create-team
 * (cf. configure-team:48). After this ticket, the 4xx body carries the same
 * `code: 'tier_limit_max_teams'` + counts + attempted-team-name + optional
 * invitedBy block so the contextual sheet can render on the onboarding flow.
 *
 * The existing byte-identical error string + `upgrade: true` are preserved
 * (legacy clients keep working).
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
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
      op?: 'select' | 'insert' | 'update';
    } = { filters: [], countMode: false };

    function matches(row: Row) {
      return state.filters.every(([k, v, mode]) => {
        if (mode === 'is') return row[k] === v;
        return row[k] === v;
      });
    }

    const chain: Record<string, unknown> = {
      select: vi.fn((_select?: string, opts?: { count?: string; head?: boolean }) => {
        // Don't overwrite an in-flight insert op — the route chains
        // `.insert(...).select().single()` and `single()` needs to see 'insert'
        // to return the inserted row.
        if (state.op !== 'insert') state.op = 'select';
        if (opts?.count === 'exact' && opts?.head) state.countMode = true;
        return chain;
      }),
      insert: vi.fn((payload: Row) => {
        state.op = 'insert';
        state.insertPayload = payload;
        return chain;
      }),
      update: vi.fn((_payload: Row) => {
        state.op = 'update';
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
      maybeSingle: vi.fn(async () => {
        const rows = (store[table] || []).filter(matches);
        return { data: rows[0] ?? null, error: null };
      }),
      then: (resolve: (v: { data: unknown; error: unknown; count?: number }) => unknown) => {
        if (state.op === 'update') {
          return Promise.resolve(resolve({ data: null, error: null }));
        }
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

import { POST as configureTeam } from '@/app/api/auth/configure-team/route';

function resetDb() {
  for (const k of Object.keys(db)) delete db[k];
}

function makeReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/configure-team', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface SeedOpts {
  liveTeams: number;
  tier?: 'free' | 'coach' | 'pro_coach' | 'organization';
  inviter?: {
    id: string;
    full_name: string;
    org_id?: string;
    email?: string;
    teamId?: string;
    role?: 'head_coach' | 'assistant_coach';
  };
}

function seed(opts: SeedOpts) {
  resetDb();
  db.coaches = [{ id: 'caller-1', org_id: 'org-1', full_name: 'Sarah Caller' }];
  if (opts.inviter) {
    db.coaches.push({
      id: opts.inviter.id,
      org_id: opts.inviter.org_id ?? 'org-1',
      full_name: opts.inviter.full_name,
      email: opts.inviter.email ?? 'planted-email@must-not-leak.test',
    });
  }
  db.organizations = [{ id: 'org-1', tier: opts.tier ?? 'free' }];
  db.sports = [{ id: 'sport-basketball', slug: 'basketball' }];
  db.curricula = [];
  db.teams = [];
  for (let i = 0; i < opts.liveTeams; i++) {
    db.teams.push({ id: `team-live-${i}`, org_id: 'org-1' });
  }
  if (opts.inviter?.teamId) {
    db.team_coaches = [
      { team_id: opts.inviter.teamId, coach_id: opts.inviter.id, role: opts.inviter.role ?? 'head_coach' },
    ];
  }
}

describe('/api/auth/configure-team — structured tier-limit body (ticket 0086)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'caller-1' } }, error: null });
  });

  it('(i) free coach with 0 existing teams configures successfully — response is BYTE-IDENTICAL to today', async () => {
    seed({ liveTeams: 0, tier: 'free' });
    const res = await configureTeam(
      makeReq({ sportSlug: 'basketball', teamName: 'Hawks U10', ageGroup: '8-10', season: 'Spring 2026' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, teamId: expect.any(String) });
    expect(body.code).toBeUndefined();
  });

  it('(iii) free coach with 1 existing team is REJECTED with the structured body on configure-team', async () => {
    seed({ liveTeams: 1, tier: 'free' });
    const res = await configureTeam(
      makeReq({ sportSlug: 'basketball', teamName: 'Hawks U12', ageGroup: '8-10' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe(
      'Your free plan allows up to 1 team. Please upgrade to add more teams.',
    );
    expect(body.upgrade).toBe(true);
    expect(body.code).toBe('tier_limit_max_teams');
    expect(body.currentCount).toBe(1);
    expect(body.maxCount).toBe(1);
    expect(body.attemptedTeamName).toBe('Hawks U12');
  });

  it('(iv) populates invitedBy when a valid inviteCoachId resolves to a same-org coach', async () => {
    seed({
      liveTeams: 1,
      tier: 'free',
      inviter: {
        id: 'mike-inviter-1',
        full_name: 'Mike Coach',
        org_id: 'org-1',
        teamId: 'team-live-0',
        role: 'assistant_coach',
      },
    });
    const res = await configureTeam(
      makeReq({
        sportSlug: 'basketball',
        teamName: 'Hawks U12',
        inviteCoachId: 'mike-inviter-1',
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('tier_limit_max_teams');
    expect(body.invitedBy).toEqual({ firstName: 'Mike', role: 'assistant_coach' });
  });

  it('(v) OMITS invitedBy when no inviteCoachId is in the request', async () => {
    seed({ liveTeams: 1, tier: 'free' });
    const res = await configureTeam(
      makeReq({ sportSlug: 'basketball', teamName: 'Hawks U12' }),
    );
    const body = await res.json();
    expect(body.code).toBe('tier_limit_max_teams');
    expect('invitedBy' in body).toBe(false);
  });

  it('(viii) planted email NEVER leaks even with a valid same-org inviteCoachId', async () => {
    seed({
      liveTeams: 1,
      tier: 'free',
      inviter: {
        id: 'mike-inviter-2',
        full_name: 'Mike Privacy',
        org_id: 'org-1',
        email: 'leak-me@bad.test',
        teamId: 'team-live-0',
      },
    });
    const res = await configureTeam(
      makeReq({
        sportSlug: 'basketball',
        teamName: 'Hawks U12',
        inviteCoachId: 'mike-inviter-2',
      }),
    );
    const body = await res.json();
    const json = JSON.stringify(body);
    expect(json).not.toContain('leak-me');
    expect(body.invitedBy.firstName).toBe('Mike');
    expect(body.invitedBy.firstName).not.toContain('Privacy');
  });
});
