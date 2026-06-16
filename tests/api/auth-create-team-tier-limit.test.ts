/**
 * Ticket 0086 — when a free coach hits the maxTeams limit on /api/auth/create-team,
 * the 4xx response now carries a STRUCTURED body the client can use to render a
 * contextual upgrade sheet instead of the flat error toast:
 *
 *   {
 *     error: '<existing byte-identical string>',
 *     upgrade: true,                                  // unchanged for back-compat
 *     code: 'tier_limit_max_teams',                   // NEW — load-bearing client switch
 *     currentCount: number,                            // NEW
 *     maxCount: number,                                // NEW
 *     attemptedTeamName: string | null,                // NEW (null when cross-org)
 *     invitedBy?: { firstName, role }                  // NEW — only when the request
 *                                                     //  carries a valid inviteCoachId
 *                                                     //  resolving to a coach in the
 *                                                     //  same org as the caller's org
 *                                                     //  for the attempted team scope.
 *   }
 *
 * Privacy: the inviter's `coaches` select narrows to `id, org_id, full_name` — never
 * `email / phone / DOB` (LESSONS#0036). `attemptedTeamName` is the team's name only;
 * a cross-org or missing posted name yields `null` to avoid leaking another org's
 * team name. `full_name` is split on a literal space (LESSONS#0061) — only the
 * first name leaves the route.
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

interface SeedOpts {
  liveTeams: number;
  tier?: 'free' | 'coach' | 'pro_coach' | 'organization';
  /** Add a second coach in the same org who can be named as the inviter. */
  inviter?: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
    date_of_birth?: string;
    org_id?: string;
    /** Optional team_coaches row tying the inviter to a team with this role. */
    role?: 'head_coach' | 'assistant_coach';
    teamId?: string;
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
      // The PLANTED fields — never read by the route.
      email: opts.inviter.email ?? 'planted-email@must-not-leak.test',
      phone: opts.inviter.phone ?? '+1-planted-phone',
      date_of_birth: opts.inviter.date_of_birth ?? '1990-01-01',
    });
  }
  db.organizations = [
    {
      id: 'org-1',
      tier: opts.tier ?? 'free',
      sport_config: { default_sport_slug: 'basketball' },
    },
  ];
  db.sports = [{ id: 'sport-basketball', slug: 'basketball' }];
  db.curricula = [];
  db.teams = [];
  for (let i = 0; i < opts.liveTeams; i++) {
    db.teams.push({ id: `team-live-${i}`, org_id: 'org-1', archived_at: null });
  }
  // Optional inviter team-coaches row.
  if (opts.inviter?.teamId) {
    db.team_coaches = [
      { team_id: opts.inviter.teamId, coach_id: opts.inviter.id, role: opts.inviter.role ?? 'head_coach' },
    ];
  }
}

describe('/api/auth/create-team — structured tier-limit body (ticket 0086)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'caller-1' } }, error: null });
  });

  it('(i) free coach with 0 existing teams creates the team — response is BYTE-IDENTICAL to today', async () => {
    seed({ liveTeams: 0, tier: 'free' });
    const res = await createTeam(makeReq({ teamName: 'Hawks U10' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, teamId: expect.any(String) });
    // No new fields leak into the success path.
    expect(body.code).toBeUndefined();
    expect(body.invitedBy).toBeUndefined();
  });

  it('(ii) free coach with 1 existing team is REJECTED with structured tier_limit_max_teams body', async () => {
    seed({ liveTeams: 1, tier: 'free' });
    const res = await createTeam(makeReq({ teamName: 'Hawks U12' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    // Existing byte-identical error string + upgrade marker.
    expect(body.error).toBe(
      'Your free plan allows up to 1 team. Please upgrade to add more teams.',
    );
    expect(body.upgrade).toBe(true);
    // NEW structured fields.
    expect(body.code).toBe('tier_limit_max_teams');
    expect(body.currentCount).toBe(1);
    expect(body.maxCount).toBe(1);
    expect(body.attemptedTeamName).toBe('Hawks U12');
    // No inviter context on this request.
    expect(body.invitedBy).toBeUndefined();
  });

  it('(iv) populates invitedBy with { firstName, role } when a valid inviteCoachId resolves to a coach in the same org', async () => {
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
    const res = await createTeam(
      makeReq({ teamName: 'Hawks U12', inviteCoachId: 'mike-inviter-1' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('tier_limit_max_teams');
    expect(body.invitedBy).toEqual({ firstName: 'Mike', role: 'assistant_coach' });
    // Surname never leaks. Planted email / phone / DOB never leak.
    const json = JSON.stringify(body);
    expect(json).not.toContain('Coach Mike');
    expect(json).not.toContain('planted-email');
    expect(json).not.toContain('planted-phone');
    expect(json).not.toContain('1990-01-01');
  });

  it('(v) OMITS invitedBy when no inviteCoachId is in the request', async () => {
    seed({ liveTeams: 1, tier: 'free' });
    const res = await createTeam(makeReq({ teamName: 'Hawks U12' }));
    const body = await res.json();
    expect(body.code).toBe('tier_limit_max_teams');
    expect(body.invitedBy).toBeUndefined();
    expect('invitedBy' in body).toBe(false);
  });

  it('(v.b) OMITS invitedBy when the inviteCoachId resolves to a coach in a DIFFERENT org (cross-org)', async () => {
    seed({
      liveTeams: 1,
      tier: 'free',
      inviter: {
        id: 'mike-other-org',
        full_name: 'Mike Other',
        org_id: 'org-OTHER',
        // No team_coaches row in caller's org.
      },
    });
    const res = await createTeam(
      makeReq({ teamName: 'Hawks U12', inviteCoachId: 'mike-other-org' }),
    );
    const body = await res.json();
    expect(body.code).toBe('tier_limit_max_teams');
    expect(body.invitedBy).toBeUndefined();
  });

  it('(vii) Coach-tier at maxTeams=3 also returns the structured body so the sheet can route to Organization', async () => {
    seed({ liveTeams: 3, tier: 'coach' });
    const res = await createTeam(makeReq({ teamName: '4th Team' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('tier_limit_max_teams');
    expect(body.currentCount).toBe(3);
    expect(body.maxCount).toBe(3);
    expect(body.attemptedTeamName).toBe('4th Team');
  });

  it('(viii) PLANTED email/phone/DOB on the inviting coach are NEVER read or returned', async () => {
    seed({
      liveTeams: 1,
      tier: 'free',
      inviter: {
        id: 'mike-inviter-2',
        full_name: 'Mike Privacy',
        org_id: 'org-1',
        email: 'leak-me@bad.test',
        phone: '+1-555-9999',
        date_of_birth: '1985-06-12',
        teamId: 'team-live-0',
        role: 'head_coach',
      },
    });
    const res = await createTeam(
      makeReq({ teamName: 'Hawks U12', inviteCoachId: 'mike-inviter-2' }),
    );
    const body = await res.json();
    const json = JSON.stringify(body);
    expect(json).not.toContain('leak-me');
    expect(json).not.toContain('555-9999');
    expect(json).not.toContain('1985-06-12');
    expect(body.invitedBy.firstName).toBe('Mike');
    // Surname stripped (literal space split per LESSONS#0061).
    expect(body.invitedBy.firstName).not.toContain('Privacy');
  });

  it('regression: validation 4xx (missing teamName) carries NO code field — unmodified clients still get the toast', async () => {
    seed({ liveTeams: 0, tier: 'free' });
    const res = await createTeam(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('teamName required');
    expect(body.code).toBeUndefined();
  });
});
