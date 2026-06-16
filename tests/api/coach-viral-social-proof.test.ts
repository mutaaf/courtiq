/**
 * Ticket 0084 — GET /api/coach/viral-social-proof.
 *
 * Returns ONE short factual line describing the strongest viral event
 * attributable to the calling coach in the last 14 days. Free-tier
 * coaches only; paid tiers always get `{ line: null }`.
 *
 * Reads (allow-listed, LESSONS#0036):
 *   coaches(id, org_id)                          — caller's org + tier resolution
 *   organizations(id, tier, name)                — caller's tier + own program name
 *   plans(id, team_id, coach_id, type, title)    — coach's own parent_report plans (14d)
 *   teams(id, name)                              — team name for the rendered line
 *   parent_forward_signals(sender_player_id, team_id, dispatched_at, cross_team)
 *   drill_shares(id, coach_id, drill_id)
 *   drills(id, name)
 *   drill_share_clones(drill_share_id, cloner_coach_id, cloned_at)
 *   drill_clone_stick_signals(drill_share_id, cloner_coach_id, cloner_org_id, stuck_at)
 *   coach_reputation_milestones(id, milestone_kind, crossed_at)
 *
 * Privacy: NEVER reads parent_email, parent_phone, players.date_of_birth,
 * players.medical_notes, players.jersey_number, players.name, or any
 * cloning-coach full_name (only org_id, then organizations.name).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { GET } from '@/app/api/coach/viral-social-proof/route';

const COACH_ID = '00000000-0000-4000-a000-0000000000c1';
const ORG_ID = '00000000-0000-4000-a000-0000000000c2';
const TEAM_ID = '00000000-0000-4000-a000-0000000000c3';
const PLAN_ID = '00000000-0000-4000-a000-0000000000c4';
const DRILL_SHARE_ID = '00000000-0000-4000-a000-0000000000c5';
const DRILL_ID = '00000000-0000-4000-a000-0000000000c6';
const CLONER_COACH_ID = '00000000-0000-4000-a000-0000000000c7';
const CLONER_ORG_ID = '00000000-0000-4000-a000-0000000000c8';

// Track every column allow-list the route asks for, so the COPPA test
// can scan it for banned column names (parent_email, DOB, etc.).
let selectAllowLists: string[] = [];

/**
 * Build a table-keyed mock implementation. The route reads several
 * tables in sequence; the easier read shape (vs. queue) makes the
 * per-test fixture explicit and survives queue-shape changes (the
 * inverse posture of LESSONS#0066). Each table's chain captures
 * the latest `.in()` args so a same-team-coach filter on
 * `team_coaches` for tier resolution would mirror real-DB behavior
 * (LESSONS#0080).
 */
function makeChain<T>(rows: T[]) {
  let inFilter: string[] | null = null;
  const chain: Record<string, unknown> = {
    select: vi.fn((sel: string) => {
      selectAllowLists.push(sel);
      return chain;
    }),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn((_col: string, vals: string[]) => {
      inFilter = vals;
      return chain;
    }),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
    maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
    then: (onFulfilled: (v: { data: T[]; error: null }) => unknown) => {
      // LESSONS#0080 — IN-filter aware: if a filter was applied, narrow
      // the returned rows so tests that exercise a subset-filter see
      // the real subset.
      const filtered =
        inFilter !== null
          ? rows.filter((r) =>
              inFilter!.some((v) => Object.values(r as object).includes(v)),
            )
          : rows;
      return Promise.resolve({ data: filtered, error: null }).then(
        onFulfilled,
      );
    },
  };
  return chain;
}

function emptyChain() {
  return makeChain([]);
}

interface FixtureTables {
  coaches?: Array<{ id: string; org_id: string }>;
  organizations?: Array<{ id: string; tier: string; name: string }>;
  plans?: Array<{
    id: string;
    team_id: string;
    coach_id: string;
    type: string;
  }>;
  teams?: Array<{ id: string; name: string }>;
  parent_forward_signals?: Array<{
    sender_player_id: string;
    team_id: string;
    dispatched_at: string;
    cross_team: boolean;
  }>;
  drill_shares?: Array<{ id: string; coach_id: string; drill_id: string }>;
  drills?: Array<{ id: string; name: string }>;
  drill_share_clones?: Array<{
    drill_share_id: string;
    cloner_coach_id: string;
    cloned_at: string;
  }>;
  drill_clone_stick_signals?: Array<{
    drill_share_id: string;
    cloner_coach_id: string;
    cloner_org_id: string | null;
    stuck_at: string;
  }>;
  coach_reputation_milestones?: Array<{
    id: string;
    milestone_kind: string;
    crossed_at: string;
  }>;
  cloner_coaches?: Array<{ id: string; org_id: string }>;
  cloner_orgs?: Array<{ id: string; name: string; tier?: string }>;
}

function wireTables(t: FixtureTables) {
  mockFromFn.mockImplementation((table: string) => {
    switch (table) {
      case 'coaches':
        // The route resolves the caller's coaches row first (for org_id +
        // tier), then optionally the cloner coach row to derive its org_id.
        return makeChain([...(t.coaches ?? []), ...(t.cloner_coaches ?? [])]);
      case 'organizations':
        return makeChain([
          ...(t.organizations ?? []),
          ...(t.cloner_orgs ?? []),
        ]);
      case 'plans':
        return makeChain(t.plans ?? []);
      case 'teams':
        return makeChain(t.teams ?? []);
      case 'parent_forward_signals':
        return makeChain(t.parent_forward_signals ?? []);
      case 'drill_shares':
        return makeChain(t.drill_shares ?? []);
      case 'drills':
        return makeChain(t.drills ?? []);
      case 'drill_share_clones':
        return makeChain(t.drill_share_clones ?? []);
      case 'drill_clone_stick_signals':
        return makeChain(t.drill_clone_stick_signals ?? []);
      case 'coach_reputation_milestones':
        return makeChain(t.coach_reputation_milestones ?? []);
      default:
        return emptyChain();
    }
  });
}

const FREE_COACH = {
  coaches: [{ id: COACH_ID, org_id: ORG_ID }],
  organizations: [{ id: ORG_ID, tier: 'free', name: 'E2E Test Org' }],
};

const PAID_COACH = {
  coaches: [{ id: COACH_ID, org_id: ORG_ID }],
  organizations: [{ id: ORG_ID, tier: 'coach', name: 'E2E Test Org' }],
};

describe('GET /api/coach/viral-social-proof (ticket 0084)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    selectAllowLists = [];
  });

  it('returns 401 when no user is authed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns { line: null, eventKind: null } for a free coach with no events in window', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    wireTables(FREE_COACH);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      line: string | null;
      eventKind: string | null;
    };
    expect(body.line).toBeNull();
    expect(body.eventKind).toBeNull();
  });

  it('returns null when only a 20-day-old clone is present (nothing fresher)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const oldIso = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    wireTables({
      ...FREE_COACH,
      drill_shares: [{ id: DRILL_SHARE_ID, coach_id: COACH_ID, drill_id: DRILL_ID }],
      drills: [{ id: DRILL_ID, name: 'closeout drill' }],
      drill_share_clones: [
        {
          drill_share_id: DRILL_SHARE_ID,
          cloner_coach_id: CLONER_COACH_ID,
          cloned_at: oldIso,
        },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { line: string | null };
    expect(body.line).toBeNull();
  });

  it('returns the on-team forward line when one fresh parent_forward_on_team is present', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const freshIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    wireTables({
      ...FREE_COACH,
      plans: [
        {
          id: PLAN_ID,
          team_id: TEAM_ID,
          coach_id: COACH_ID,
          type: 'parent_report',
        },
      ],
      teams: [{ id: TEAM_ID, name: 'Hawks' }],
      parent_forward_signals: [
        {
          sender_player_id: '00000000-0000-4000-a000-0000000000d1',
          team_id: TEAM_ID,
          dispatched_at: freshIso,
          cross_team: false,
        },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      line: string | null;
      eventKind: string | null;
    };
    expect(body.eventKind).toBe('parent_forward_on_team');
    expect(body.line).toContain('Hawks');
  });

  it('returns the stick_signal line when a clone AND a stick are both fresh', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const freshIso = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    wireTables({
      ...FREE_COACH,
      drill_shares: [{ id: DRILL_SHARE_ID, coach_id: COACH_ID, drill_id: DRILL_ID }],
      drills: [{ id: DRILL_ID, name: 'closeout drill' }],
      drill_share_clones: [
        {
          drill_share_id: DRILL_SHARE_ID,
          cloner_coach_id: CLONER_COACH_ID,
          cloned_at: freshIso,
        },
      ],
      drill_clone_stick_signals: [
        {
          drill_share_id: DRILL_SHARE_ID,
          cloner_coach_id: CLONER_COACH_ID,
          cloner_org_id: CLONER_ORG_ID,
          stuck_at: freshIso,
        },
      ],
      cloner_coaches: [{ id: CLONER_COACH_ID, org_id: CLONER_ORG_ID }],
      cloner_orgs: [{ id: CLONER_ORG_ID, tier: 'free', name: 'Hornets' }],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      line: string | null;
      eventKind: string | null;
    };
    expect(body.eventKind).toBe('drill_stick_signal');
    expect(body.line).toContain('closeout drill');
  });

  it('reputation_milestone beats everything else', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const freshIso = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    wireTables({
      ...FREE_COACH,
      plans: [
        {
          id: PLAN_ID,
          team_id: TEAM_ID,
          coach_id: COACH_ID,
          type: 'parent_report',
        },
      ],
      teams: [{ id: TEAM_ID, name: 'Hawks' }],
      parent_forward_signals: [
        {
          sender_player_id: '00000000-0000-4000-a000-0000000000d1',
          team_id: TEAM_ID,
          dispatched_at: freshIso,
          cross_team: false,
        },
      ],
      coach_reputation_milestones: [
        {
          id: 'm-1',
          milestone_kind: 'programs_4',
          crossed_at: freshIso,
        },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      line: string | null;
      eventKind: string | null;
    };
    expect(body.eventKind).toBe('reputation_milestone');
  });

  it('NEVER reads parent_email, parent_phone, DOB, medical_notes, jersey_number, or player full_name', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    wireTables(FREE_COACH);
    await GET();
    const allCols = selectAllowLists.join(' ').toLowerCase();
    expect(allCols).not.toContain('parent_email');
    expect(allCols).not.toContain('parent_phone');
    expect(allCols).not.toContain('date_of_birth');
    expect(allCols).not.toContain('medical_notes');
    expect(allCols).not.toContain('jersey_number');
    // The route never reads players.name. It joins via player ids only.
    expect(allCols).not.toMatch(/\bplayers\b[^,]*\bname\b/);
  });

  it("NEVER reads the cloning coach's full_name (only org_id, then organizations.name) — LESSONS#0073/#0078", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const freshIso = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    wireTables({
      ...FREE_COACH,
      drill_shares: [{ id: DRILL_SHARE_ID, coach_id: COACH_ID, drill_id: DRILL_ID }],
      drills: [{ id: DRILL_ID, name: 'closeout drill' }],
      drill_share_clones: [
        {
          drill_share_id: DRILL_SHARE_ID,
          cloner_coach_id: CLONER_COACH_ID,
          cloned_at: freshIso,
        },
      ],
      cloner_coaches: [{ id: CLONER_COACH_ID, org_id: CLONER_ORG_ID }],
      cloner_orgs: [{ id: CLONER_ORG_ID, tier: 'free', name: 'Hornets' }],
    });
    await GET();
    const allCols = selectAllowLists.join(' ').toLowerCase();
    expect(allCols).not.toContain('full_name');
    // The coaches select must be the minimal (id, org_id) shape.
    const coachesSel = selectAllowLists.find((s) => s.includes('org_id'));
    expect(coachesSel).toBeDefined();
    expect(coachesSel).not.toContain('full_name');
  });

  it('returns { line: null } for a paid-tier coach regardless of viral activity', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const freshIso = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    wireTables({
      ...PAID_COACH,
      coach_reputation_milestones: [
        {
          id: 'm-1',
          milestone_kind: 'programs_4',
          crossed_at: freshIso,
        },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      line: string | null;
      eventKind: string | null;
    };
    expect(body.line).toBeNull();
    expect(body.eventKind).toBeNull();
  });
});
