/**
 * Ticket 0087 — additive widening of POST /api/ai/program-pulse with a
 * `programTierState` field on the response.
 *
 * Schema-wins-over-prose deviation (LESSONS#0096): the ticket prose names
 * the route `src/app/api/director/program-pulse/route.ts`; the actual route
 * (shipped by 0028 / 0077) is `src/app/api/ai/program-pulse/route.ts`.
 *
 * The widening: when the caller's org is free-tier AND 3+ of its coaches
 * are on Coach-tier-or-above AND have shipped at least one structured
 * artifact (parent_report / practice_plan / weekly_pulse / game_recap) in
 * the last 30 days, the route returns `programTierState.eligibleForOrgUpgrade
 * = true`, the first names, the monthly spend, and the savings math.
 *
 * Mirrors the existing program-pulse test posture (chainable in-memory
 * mock for Supabase; mocked callAIWithJSON). The new tests assert the
 * additive widening AND that planted email/phone/DOB on coaches are
 * never read (COPPA per LESSONS#0036).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn, mockCallAIWithJSON } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
  mockCallAIWithJSON: vi.fn(),
}));

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

vi.mock('@/lib/ai/client', () => ({
  callAIWithJSON: mockCallAIWithJSON,
}));

import { POST as programPulsePost } from '@/app/api/ai/program-pulse/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

function makeRequest(orgId: unknown = 'org-1') {
  return new Request('http://localhost/api/ai/program-pulse', {
    method: 'POST',
    body: JSON.stringify({ orgId }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Wire mockFromFn for the program-org-tier widening: caller is admin of
 * a FREE-tier org, several coaches in the org are on `coach` tier
 * (resolved via the org membership join), and each has at least one
 * shipped artifact in the last 30 days.
 */
function wireOrgWithProgramTier(opts: {
  callerRole?: string;
  callerOrgTier?: 'free' | 'coach' | 'pro_coach' | 'organization';
  // Coach rows by id → metadata
  paidCoachFirstNames?: string[];
  shippedArtifactCountPerCoach?: number;
  snoozeRow?: { snoozed_until: string } | null;
  callerOrgId?: string;
} = {}) {
  const callerRole = opts.callerRole ?? 'admin';
  const callerOrgTier = opts.callerOrgTier ?? 'free';
  const paidNames = opts.paidCoachFirstNames ?? ['Maya', 'James', 'Lin'];
  const shippedCount = opts.shippedArtifactCountPerCoach ?? 1;
  const snoozeRow = opts.snoozeRow ?? null;
  const callerOrgId = opts.callerOrgId ?? 'org-1';

  // Construct coach rows. The first is the caller (director); the rest
  // are the paid coaches — each on her OWN org (the individual-paying-
  // coach shape; the route resolves tier via coaches.org_id →
  // organizations.tier).
  const coachRows: Array<Record<string, unknown>> = [
    {
      id: 'coach-1',
      org_id: callerOrgId,
      full_name: 'Pat Director',
      role: 'admin',
      // COPPA-trap planted fields: the route MUST NOT read these.
      email: 'pat-director@trap.example',
      phone: '+1-555-0000',
      date_of_birth: '1980-01-01',
    },
  ];
  for (let i = 0; i < paidNames.length; i++) {
    coachRows.push({
      id: `paid-coach-${i + 1}`,
      org_id: `coach-org-${i + 1}`,
      full_name: `${paidNames[i]} Surname${i + 1}`,
      role: 'coach',
      email: `trap-${i}@trap.example`,
      phone: '+1-555-0000',
      date_of_birth: '1990-01-01',
    });
  }

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      const callerRow = {
        id: 'coach-1',
        org_id: callerOrgId,
        role: callerRole,
        full_name: 'Pat Director',
        organizations: { tier: callerOrgTier },
      };
      const chain = buildChain(coachRows) as any;
      chain.single = vi.fn().mockResolvedValue({ data: callerRow, error: null });
      return chain;
    }
    if (table === 'teams') {
      return buildChain([
        { id: 'team-u10', org_id: callerOrgId, name: 'U10s' },
        { id: 'team-u12', org_id: callerOrgId, name: 'U12s' },
      ]);
    }
    if (table === 'team_coaches') {
      // Each paying-coach candidate is on team_coaches for one team. The
      // route dedupes by coach_id and excludes the caller (director).
      return buildChain(
        paidNames.map((_, i) => ({
          team_id: i % 2 === 0 ? 'team-u10' : 'team-u12',
          coach_id: `paid-coach-${i + 1}`,
        })),
      );
    }
    if (table === 'sessions') {
      return buildChain([
        { id: 's1', team_id: 'team-u10', coach_id: 'coach-1', created_at: new Date(now - 4 * day).toISOString() },
        { id: 's2', team_id: 'team-u10', coach_id: 'coach-1', created_at: new Date(now - 2 * day).toISOString() },
      ]);
    }
    if (table === 'observations') {
      return buildChain([
        { id: 'o1', team_id: 'team-u10', coach_id: 'coach-1', sentiment: 'positive', created_at: new Date(now - 4 * day).toISOString() },
        { id: 'o2', team_id: 'team-u10', coach_id: 'coach-1', sentiment: 'positive', created_at: new Date(now - 2 * day).toISOString() },
        { id: 'o3', team_id: 'team-u10', coach_id: 'coach-1', sentiment: 'positive', created_at: new Date(now - 1 * day).toISOString() },
      ]);
    }
    if (table === 'organizations') {
      // The route asks for the caller's organization name (.single() —
      // existing 0028) AND the per-candidate-coach org tier rows (the
      // 0087 widening — keyed by each candidate's `org_id`). Each
      // candidate's org_id is `coach-org-N` (the individual-paying-
      // coach shape; one organizations row per coach).
      const perCoachOrgTiers = paidNames.map((_, i) => ({
        id: `coach-org-${i + 1}`,
        tier: 'coach',
      }));
      const chain = buildChain(perCoachOrgTiers) as any;
      chain.single = vi.fn().mockResolvedValue({
        data: { name: 'E2E Program Org', tier: callerOrgTier },
        error: null,
      });
      return chain;
    }
    if (table === 'plans') {
      // Per-coach shipped-artifact count read. The route counts rows per
      // coach_id where type IN QUALIFYING_ARTIFACT_TYPES and created_at
      // >= now() - 30 days. Mock returns the same fixture for every
      // .in() filter — the count derives from .length, not from the
      // filter args (the route is responsible for the filter; the test
      // pins behaviour given the returned data shape).
      const rows = Array.from({ length: shippedCount * paidNames.length }, (_, i) => ({
        id: `plan-${i}`,
        coach_id: `paid-coach-${(i % paidNames.length) + 1}`,
        type: 'parent_report',
        created_at: new Date(now - 5 * day).toISOString(),
      }));
      return buildChain(rows);
    }
    if (table === 'org_card_snoozes') {
      return buildChain(snoozeRow ? [snoozeRow] : []);
    }
    return buildChain(null);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCallAIWithJSON.mockResolvedValue({
    parsed: {
      week_summary: 'Last week — 1 of 4 coaches logged notes, 2 practices.',
      active_coaches: 1,
      total_coaches: 4,
      teams_to_watch: [],
      next_action: {
        label: 'Open program analytics',
        kind: 'view_analytics',
        rationale: 'See the team-level detail behind this week\'s numbers.',
      },
    },
    interactionId: 'ai-int-pulse-1',
  });
});

describe('POST /api/ai/program-pulse — programTierState widening (ticket 0087)', () => {
  it('returns eligibleForOrgUpgrade: false when no paid coaches are active', async () => {
    setAuthUser('coach-1');
    wireOrgWithProgramTier({
      callerOrgTier: 'free',
      paidCoachFirstNames: [],
    });

    const res = await programPulsePost(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.programTierState).toBeDefined();
    expect(body.programTierState.eligibleForOrgUpgrade).toBe(false);
    expect(body.programTierState.paidCoachCount).toBe(0);
  });

  it('returns eligibleForOrgUpgrade: true with first names when 3 paid coaches are active on a free org', async () => {
    setAuthUser('coach-1');
    wireOrgWithProgramTier({
      callerOrgTier: 'free',
      paidCoachFirstNames: ['Maya', 'James', 'Lin'],
    });

    const res = await programPulsePost(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.programTierState.eligibleForOrgUpgrade).toBe(true);
    expect(body.programTierState.paidCoachCount).toBe(3);
    expect(body.programTierState.paidCoachFirstNames).toEqual(['Maya', 'James', 'Lin']);
    // Cost math: 3 * 999 = 2997 cents
    expect(body.programTierState.monthlySpendCents).toBe(2997);
    // 2997 - 4999 = -2002 (Org is still a step up at 3 coaches; the card
    // surfaces this honestly as "the difference is the program rails").
    expect(body.programTierState.orgUpgradeSavingsCents).toBe(-2002);
  });

  it('returns the existing pulse response fields byte-identical on an Organization-tier org (additive widening)', async () => {
    setAuthUser('coach-1');
    // The existing 0028 happy path requires Organization-tier; the
    // additive widening rides on the same shape.
    wireOrgWithProgramTier({ callerOrgTier: 'organization' });

    const res = await programPulsePost(makeRequest());
    const body = await res.json();
    expect(body.pulse).toBeDefined();
    // The existing fields still resolve.
    expect(body.pulse.week_summary).toContain('coaches');
    expect(typeof body.pulse.active_coaches).toBe('number');
    expect(typeof body.pulse.total_coaches).toBe('number');
    expect(body.interactionId).toBe('ai-int-pulse-1');
    // The new field rides additively.
    expect(body.programTierState).toBeDefined();
    // Org-tier org → eligibility flag is false (it's already on the right tier).
    expect(body.programTierState.eligibleForOrgUpgrade).toBe(false);
  });

  it('returns eligibleForOrgUpgrade: false when the org is already on the organization tier', async () => {
    setAuthUser('coach-1');
    wireOrgWithProgramTier({
      callerOrgTier: 'organization',
      paidCoachFirstNames: ['Maya', 'James', 'Lin'],
    });

    const res = await programPulsePost(makeRequest());
    const body = await res.json();
    expect(body.programTierState.eligibleForOrgUpgrade).toBe(false);
  });

  it('returns 401 unauthed (existing 0028 contract; the widening rides under the auth gate)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await programPulsePost(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin caller (existing 0028 contract)', async () => {
    setAuthUser('coach-2');
    wireOrgWithProgramTier({ callerRole: 'coach', callerOrgTier: 'organization' });
    const res = await programPulsePost(makeRequest());
    expect(res.status).toBe(403);
  });

  it('COPPA: planted email / phone / DOB on coaches are NEVER returned in programTierState', async () => {
    setAuthUser('coach-1');
    wireOrgWithProgramTier({
      callerOrgTier: 'free',
      paidCoachFirstNames: ['Maya', 'James', 'Lin'],
    });

    const res = await programPulsePost(makeRequest());
    const body = await res.json();
    const json = JSON.stringify(body.programTierState);
    expect(json).not.toContain('trap.example');
    expect(json).not.toContain('555-0000');
    expect(json).not.toContain('1980-01-01');
    expect(json).not.toContain('1990-01-01');
    // No surname leakage — only first names ride.
    expect(json).not.toContain('Surname1');
    expect(json).not.toContain('Surname2');
    expect(json).not.toContain('Surname3');
  });

  it('returns eligibleForOrgUpgrade: false when an active snooze row exists', async () => {
    setAuthUser('coach-1');
    const future = new Date(now + 5 * day).toISOString();
    wireOrgWithProgramTier({
      callerOrgTier: 'free',
      paidCoachFirstNames: ['Maya', 'James', 'Lin'],
      snoozeRow: { snoozed_until: future },
    });

    const res = await programPulsePost(makeRequest());
    const body = await res.json();
    // Even with 3 paid coaches, an active snooze suppresses the card.
    expect(body.programTierState.eligibleForOrgUpgrade).toBe(false);
  });
});
