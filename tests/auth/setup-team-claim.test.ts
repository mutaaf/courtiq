/**
 * Vitest — POST /api/auth/setup per-team claim (ticket 0033).
 *
 * The org landing page now carries a per-team "Coach this team — free" CTA that
 * deep-links to /signup?org=<slug>&team=<teamId>. The signup form forwards both
 * `org` and `team` to this setup route. This is the server side that:
 *  - resolves the slug → org and attaches the coach (the existing 0024 path), AND
 *  - when `team` is present AND the team belongs to the resolved org, associates
 *    the new coach with that team (inserts a team_coaches row, role 'coach').
 *  - a `team` that does NOT belong to the resolved org (or is unknown) is IGNORED
 *    — org_id only, no association. A foreign teamId can't be claimed.
 *
 * Maps 1:1 to the ticket's acceptance criteria:
 *  - AC4: org + valid team → org_id set AND a team_coaches row written; unknown
 *         team → org_id only.
 *  - AC4 (foreign): a team from a DIFFERENT org → ignored; only org_id set.
 *  - AC9 (regression): ref / org / team are independent and non-conflicting.
 *
 * File is `.test.ts` (NOT `.spec.ts`): vitest.config.ts excludes the spec glob.
 *
 * Pattern mirrors tests/auth/setup-org.test.ts (auth + chainable service mock),
 * extended with a `team_coaches` capture.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockServiceFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockServiceFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({
    from: mockServiceFromFn,
  })),
}));

import { POST } from '@/app/api/auth/setup/route';

// Chainable builder. `single()` resolves to the configured row; insert(...)
// captures its payload and supports both `insert(...).select().single()` and a
// bare awaited `insert(...)`.
function buildChain(opts: {
  single?: { data: unknown; error: unknown };
  insert?: { data: unknown; error: unknown };
  capture?: (payload: unknown) => void;
}) {
  const singleResolved = opts.single ?? { data: null, error: null };
  const insertResolved = opts.insert ?? { data: null, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn((payload: unknown) => {
      opts.capture?.(payload);
      return {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(insertResolved),
        then: (onFulfilled: (v: typeof insertResolved) => unknown) =>
          Promise.resolve(insertResolved).then(onFulfilled),
      };
    }),
    single: vi.fn().mockResolvedValue(singleResolved),
    maybeSingle: vi.fn().mockResolvedValue(singleResolved),
  };
  return chain;
}

function setAuthUser(id = 'claimer', email = 'claimer@example.com') {
  mockGetUser.mockResolvedValue({
    data: { user: { id, email, user_metadata: {} } },
    error: null,
  });
}

function call(body: Record<string, unknown>) {
  const request = new Request('http://localhost/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request);
}

/**
 * Wire a per-table mock. `teamRow` controls what the teams lookup returns
 * (its org_id is compared to the resolved org server-side).
 */
function wireMock(args: {
  orgRow: { id: string; slug?: string } | null;
  teamRow?: { id: string; org_id: string } | null;
  onCoachInsert: (payload: Record<string, unknown>) => void;
  onTeamCoachInsert?: (payload: Record<string, unknown>) => void;
  onOrgInsert?: () => void;
}) {
  mockServiceFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      return buildChain({
        single: { data: null, error: null }, // existence check → none
        insert: { data: { id: 'claimer' }, error: null },
        capture: (payload) => args.onCoachInsert(payload as Record<string, unknown>),
      });
    }
    if (table === 'organizations') {
      return buildChain({
        single: args.orgRow
          ? { data: args.orgRow, error: null }
          : { data: null, error: { message: 'not found' } },
        insert: { data: { id: 'org-fresh' }, error: null },
        capture: () => args.onOrgInsert?.(),
      });
    }
    if (table === 'teams') {
      return buildChain({
        single: args.teamRow
          ? { data: args.teamRow, error: null }
          : { data: null, error: { message: 'not found' } },
      });
    }
    if (table === 'team_coaches') {
      return buildChain({
        insert: { data: { team_id: 't', coach_id: 'claimer' }, error: null },
        capture: (payload) =>
          args.onTeamCoachInsert?.(payload as Record<string, unknown>),
      });
    }
    return buildChain({});
  });
}

describe('POST /api/auth/setup — per-team claim (ticket 0033)', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC4: org + a team that belongs to the org → org_id set AND team_coaches row.
  it('associates the coach with the team when team belongs to the resolved org', async () => {
    setAuthUser('claimer');
    let coachInsert: Record<string, unknown> | null = null;
    let teamCoachInsert: Record<string, unknown> | null = null;

    wireMock({
      orgRow: { id: 'org-7', slug: 'lincoln-rec-league' },
      teamRow: { id: 'team-42', org_id: 'org-7' }, // belongs to org-7
      onCoachInsert: (p) => (coachInsert = p),
      onTeamCoachInsert: (p) => (teamCoachInsert = p),
    });

    const res = await call({
      fullName: 'Claiming Coach',
      org: 'lincoln-rec-league',
      team: 'team-42',
    });
    expect(res.status).toBe(200);

    expect(coachInsert).not.toBeNull();
    expect(coachInsert!.org_id).toBe('org-7');

    // The team association was written for THIS coach + the claimed team.
    expect(teamCoachInsert).not.toBeNull();
    expect(teamCoachInsert!.team_id).toBe('team-42');
    expect(teamCoachInsert!.coach_id).toBe('claimer');
    expect(teamCoachInsert!.role).toBe('coach');
  });

  // AC4: an unknown team → org_id only, no association (no error).
  it('attaches org only and writes NO association when the team is unknown', async () => {
    setAuthUser('claimer');
    let coachInsert: Record<string, unknown> | null = null;
    let teamCoachInsert: Record<string, unknown> | null = null;

    wireMock({
      orgRow: { id: 'org-7', slug: 'lincoln-rec-league' },
      teamRow: null, // unknown team
      onCoachInsert: (p) => (coachInsert = p),
      onTeamCoachInsert: (p) => (teamCoachInsert = p),
    });

    const res = await call({
      fullName: 'No-Team Coach',
      org: 'lincoln-rec-league',
      team: 'team-does-not-exist',
    });
    expect(res.status).toBe(200);

    expect(coachInsert!.org_id).toBe('org-7');
    expect(teamCoachInsert).toBeNull();
  });

  // AC4 (foreign): a team belonging to a DIFFERENT org → ignored; only org_id set.
  it('IGNORES a team that belongs to a different org (no foreign-team claim)', async () => {
    setAuthUser('claimer');
    let coachInsert: Record<string, unknown> | null = null;
    let teamCoachInsert: Record<string, unknown> | null = null;

    wireMock({
      orgRow: { id: 'org-7', slug: 'lincoln-rec-league' },
      teamRow: { id: 'team-99', org_id: 'org-OTHER' }, // belongs to a DIFFERENT org
      onCoachInsert: (p) => (coachInsert = p),
      onTeamCoachInsert: (p) => (teamCoachInsert = p),
    });

    const res = await call({
      fullName: 'Sneaky Coach',
      org: 'lincoln-rec-league',
      team: 'team-99',
    });
    expect(res.status).toBe(200);

    expect(coachInsert!.org_id).toBe('org-7');
    // No association — a foreign teamId cannot be claimed.
    expect(teamCoachInsert).toBeNull();
  });

  // AC9 (regression): ref + org + team all present → all three handled, no conflict.
  it('honors ref AND org AND team together (independent params)', async () => {
    setAuthUser('claimer');
    let coachInsert: Record<string, unknown> | null = null;
    let teamCoachInsert: Record<string, unknown> | null = null;

    wireMock({
      orgRow: { id: 'org-7', slug: 'lincoln-rec-league' },
      teamRow: { id: 'team-42', org_id: 'org-7' },
      onCoachInsert: (p) => (coachInsert = p),
      onTeamCoachInsert: (p) => (teamCoachInsert = p),
    });

    const res = await call({
      fullName: 'Triple Coach',
      org: 'lincoln-rec-league',
      team: 'team-42',
      referredByCode: 'xyz789',
    });
    expect(res.status).toBe(200);

    expect(coachInsert!.org_id).toBe('org-7');
    const prefs = coachInsert!.preferences as Record<string, unknown>;
    expect(prefs.referred_by_code).toBe('XYZ789');
    expect(teamCoachInsert!.team_id).toBe('team-42');
  });

  // AC9 (regression): org alone (no team) keeps the 0024 path byte-for-byte —
  // no team lookup, no association.
  it('attaches org with NO team association when team is absent', async () => {
    setAuthUser('claimer');
    let coachInsert: Record<string, unknown> | null = null;
    let teamCoachInsert: Record<string, unknown> | null = null;

    wireMock({
      orgRow: { id: 'org-7', slug: 'lincoln-rec-league' },
      onCoachInsert: (p) => (coachInsert = p),
      onTeamCoachInsert: (p) => (teamCoachInsert = p),
    });

    const res = await call({ fullName: 'Org-Only Coach', org: 'lincoln-rec-league' });
    expect(res.status).toBe(200);

    expect(coachInsert!.org_id).toBe('org-7');
    expect(teamCoachInsert).toBeNull();
  });
});
