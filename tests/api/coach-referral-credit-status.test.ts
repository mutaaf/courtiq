/**
 * Ticket 0074 — GET /api/coach/referral-credit-status.
 *
 * Returns the caller's referral credit state:
 *   { qualifiedCount, qualifiedCoachFirstNames, currentMilestone,
 *     pendingCreditCents, alreadyGranted }
 *
 * Asserts:
 *  - 401 on unauthed.
 *  - 200 with empty payload when the caller has no referred coaches.
 *  - 200 with qualifiedCount = 3 + qualified_3 + first names when three
 *    qualified referrals are present.
 *  - 200 with currentMilestone = 'qualified_10' when 12 qualified are
 *    present.
 *  - First-name list is capped at 3 and surname-stripped (LESSONS#0061 —
 *    a literal space, not \s+).
 *  - The response payload never reads or leaks parent_email / DOB /
 *    parent_phone planted on the referred coach rows (COPPA allow-list).
 *  - `alreadyGranted: true` when a referral_credit_grants row exists for
 *    the caller + the current milestone.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 * Hand-rolled supabase chain mocks reset per beforeEach (LESSONS#0039 /
 * #0092).
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

import { GET } from '@/app/api/coach/referral-credit-status/route';

interface Chain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (
    onFulfilled: (v: { data: unknown; error: unknown; count?: number }) => unknown,
  ) => Promise<unknown>;
}

function buildChain(
  data: unknown = null,
  { count, error }: { count?: number; error?: unknown } = {},
): Chain {
  const resolved = { data, error: error ?? null, count };
  const chain: Chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled) => Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = '00000000-0000-4000-a000-0000000000c1';

function setAuth(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

/**
 * Build the chain queue the route walks, in order:
 *  1) coaches (referred — list of converted coach rows by referred_by_code).
 *  2) For each referred coach: plans (count of QUALIFYING_ARTIFACT_TYPES).
 *     The route fans out via Promise.all, but the mockReturnValueOnce queue
 *     plays them sequentially per insertion order; the route's actual order
 *     is plans-then-observations per referred coach.
 *  3) For each referred coach: observations (count for that coach).
 *  4) referral_credit_grants (rows for the inviter — to flag alreadyGranted).
 */
function queueAll(opts: {
  referredCoaches: Array<{
    id: string;
    full_name: string | null;
    // Planted COPPA-poison fields — the route must NOT read these in its
    // .select() allow-list, but the chain still surfaces them so a test can
    // assert they never reach the response.
    parent_email?: string | null;
    date_of_birth?: string | null;
    parent_phone?: string | null;
  }>;
  // For each referred coach (matched by id order), the count of shipped
  // qualifying artifacts and the count of observations.
  perReferredCounts: Array<{ shipped: number; observations: number }>;
  // Optional already-granted milestone(s).
  grantedMilestoneKinds?: string[];
}) {
  // 1) referred coaches.
  mockFromFn.mockReturnValueOnce(buildChain(opts.referredCoaches));
  // 2/3) per-referred-coach plan + observation counts. The route loops in
  // referred-coach order and issues plans first, then observations.
  for (const c of opts.perReferredCounts) {
    mockFromFn.mockReturnValueOnce(buildChain([], { count: c.shipped }));
    mockFromFn.mockReturnValueOnce(buildChain([], { count: c.observations }));
  }
  // 4) referral_credit_grants for this inviter.
  const grantRows = (opts.grantedMilestoneKinds ?? []).map((k) => ({
    milestone_kind: k,
  }));
  mockFromFn.mockReturnValueOnce(buildChain(grantRows));
}

describe('GET /api/coach/referral-credit-status (ticket 0074)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when the caller is not authed', async () => {
    setAuth(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns an empty payload when the caller has no referrals', async () => {
    setAuth();
    queueAll({
      referredCoaches: [],
      perReferredCounts: [],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.qualifiedCount).toBe(0);
    expect(body.qualifiedCoachFirstNames).toEqual([]);
    expect(body.currentMilestone).toBeNull();
    expect(body.alreadyGranted).toBe(false);
  });

  it('returns 3 qualified + qualified_3 + the three first names when three pass the bar', async () => {
    setAuth();
    queueAll({
      referredCoaches: [
        { id: 'c-1', full_name: 'Maya Patel' },
        { id: 'c-2', full_name: 'James Kim' },
        { id: 'c-3', full_name: 'Lin Tran' },
      ],
      // c-1: 1 shipped artifact. c-2: 0 shipped + 5 head-coached obs.
      // c-3: 1 shipped artifact.
      perReferredCounts: [
        { shipped: 1, observations: 0 },
        { shipped: 0, observations: 5 },
        { shipped: 1, observations: 0 },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.qualifiedCount).toBe(3);
    expect(body.qualifiedCoachFirstNames).toEqual(['Maya', 'James', 'Lin']);
    expect(body.currentMilestone).toBe('qualified_3');
    expect(body.pendingCreditCents).toBeGreaterThan(0);
    expect(body.alreadyGranted).toBe(false);
  });

  it('returns currentMilestone qualified_10 at 12 qualified', async () => {
    setAuth();
    const referred = Array.from({ length: 12 }, (_, i) => ({
      id: `c-${i}`,
      full_name: `First${i} Last${i}`,
    }));
    const counts = Array.from({ length: 12 }, () => ({
      shipped: 1,
      observations: 0,
    }));
    queueAll({
      referredCoaches: referred,
      perReferredCounts: counts,
    });
    const res = await GET();
    const body = await res.json();
    expect(body.qualifiedCount).toBe(12);
    expect(body.currentMilestone).toBe('qualified_10');
    // First-name list still capped at 3 (consent posture).
    expect(body.qualifiedCoachFirstNames).toHaveLength(3);
  });

  it('caps the first-name list at 3 and strips the surname (LESSONS#0061 — literal space)', async () => {
    setAuth();
    queueAll({
      referredCoaches: [
        { id: 'c-1', full_name: 'Maya Patel' },
        { id: 'c-2', full_name: 'James Kim' },
        { id: 'c-3', full_name: 'Lin Tran' },
      ],
      perReferredCounts: [
        { shipped: 1, observations: 0 },
        { shipped: 1, observations: 0 },
        { shipped: 1, observations: 0 },
      ],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.qualifiedCoachFirstNames).toHaveLength(3);
    for (const name of body.qualifiedCoachFirstNames) {
      // No spaces — the surname is stripped (literal space split).
      expect(name).not.toContain(' ');
    }
    // Surnames must never leak.
    const flat = JSON.stringify(body).toLowerCase();
    expect(flat).not.toContain('patel');
    expect(flat).not.toContain('tran');
    expect(flat).not.toContain('kim');
  });

  it('never leaks parent_email / parent_phone / DOB planted on referred coach rows', async () => {
    setAuth();
    queueAll({
      referredCoaches: [
        {
          id: 'c-1',
          full_name: 'Maya Patel',
          parent_email: 'planted-parent@example.com',
          date_of_birth: '2014-04-01',
          parent_phone: '555-0001',
        },
        {
          id: 'c-2',
          full_name: 'James Kim',
          parent_email: 'planted-parent-2@example.com',
          date_of_birth: '2015-05-01',
          parent_phone: '555-0002',
        },
        {
          id: 'c-3',
          full_name: 'Lin Tran',
          parent_email: 'planted-parent-3@example.com',
          date_of_birth: '2016-06-01',
          parent_phone: '555-0003',
        },
      ],
      perReferredCounts: [
        { shipped: 1, observations: 0 },
        { shipped: 1, observations: 0 },
        { shipped: 1, observations: 0 },
      ],
    });
    const res = await GET();
    const body = await res.json();
    const flat = JSON.stringify(body).toLowerCase();
    expect(flat).not.toContain('planted-parent');
    expect(flat).not.toContain('2014-04-01');
    expect(flat).not.toContain('555-0001');
  });

  it('flags alreadyGranted:true when a referral_credit_grants row exists for the current milestone', async () => {
    setAuth();
    queueAll({
      referredCoaches: [
        { id: 'c-1', full_name: 'Maya Patel' },
        { id: 'c-2', full_name: 'James Kim' },
        { id: 'c-3', full_name: 'Lin Tran' },
      ],
      perReferredCounts: [
        { shipped: 1, observations: 0 },
        { shipped: 1, observations: 0 },
        { shipped: 1, observations: 0 },
      ],
      grantedMilestoneKinds: ['qualified_3'],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.currentMilestone).toBe('qualified_3');
    expect(body.alreadyGranted).toBe(true);
  });
});
