/**
 * Ticket 0086 — post-Stripe resume into /api/auth/create-team.
 *
 * After the contextual `<TeamLimitUpgradeSheet />` routes the coach to
 * /settings/upgrade?resume=join_team:<teamId> and Stripe flips the org's
 * tier, the settings/upgrade resume handler re-fires the originally-blocked
 * create-team POST. This spec asserts the route's BEHAVIOR across the two
 * race outcomes:
 *
 *   (i)  the webhook fired first → org.tier === 'coach' → the same POST that
 *        returned 403 now succeeds with the standard `{ success, teamId }`.
 *   (ii) the webhook hasn't landed yet → org.tier === 'free' → the route
 *        returns the SAME structured 403 body so the surface can re-render
 *        the sheet (no silent free-tier write).
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
      return state.filters.every(([k, v]) => row[k] === v);
    }

    const chain: Record<string, unknown> = {
      select: vi.fn((_select?: string, opts?: { count?: string; head?: boolean }) => {
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
          const inserted = { id: 'inserted-team', ...(state.insertPayload || {}) };
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

describe('/api/auth/create-team — post-Stripe resume into join_team (ticket 0086)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'caller-1' } }, error: null });
    db.coaches = [
      { id: 'caller-1', org_id: 'org-1', full_name: 'Sarah Caller' },
      { id: 'mike-inviter-1', org_id: 'org-1', full_name: 'Mike Coach' },
    ];
    db.organizations = [
      { id: 'org-1', tier: 'free', sport_config: { default_sport_slug: 'basketball' } },
    ];
    db.sports = [{ id: 'sport-basketball', slug: 'basketball' }];
    db.curricula = [];
    // The coach already has their U10 (the wall fired on the U12 attempt).
    db.teams = [{ id: 'team-live-0', org_id: 'org-1', archived_at: null }];
  });

  it('(i) after the webhook flipped the org to Coach tier, the resume POST succeeds', async () => {
    // Simulate the webhook's tier flip having landed before the resume POST.
    db.organizations = [
      { id: 'org-1', tier: 'coach', sport_config: { default_sport_slug: 'basketball' } },
    ];
    const res = await createTeam(
      makeReq({ teamName: 'Hawks U12', inviteCoachId: 'mike-inviter-1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, teamId: expect.any(String) });
    // No tier_limit_max_teams code on the success path.
    expect(body.code).toBeUndefined();
  });

  it('(ii) when the webhook race lost (still free), the same structured 403 fires — no silent free-tier write', async () => {
    // Tier is still free (webhook hasn't landed yet).
    const res = await createTeam(
      makeReq({ teamName: 'Hawks U12', inviteCoachId: 'mike-inviter-1' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('tier_limit_max_teams');
    expect(body.currentCount).toBe(1);
    expect(body.maxCount).toBe(1);
    // The coach can re-render the sheet and try again.
  });
});
