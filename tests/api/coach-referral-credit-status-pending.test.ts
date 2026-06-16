/**
 * Ticket 0085 — GET /api/coach/referral-credit-status, new pending fields.
 *
 * The route already returned (from 0074):
 *   { qualifiedCount, qualifiedCoachFirstNames, currentMilestone,
 *     pendingCreditCents, alreadyGranted }
 *
 * This ticket extends the same route to ALSO return:
 *   - pendingReferrals: Array<{ firstName: string; signedUpAt: string;
 *       needsToQualify: string }> (the signed-up-but-not-yet-qualifying
 *       coaches, capped at 5)
 *   - nextMilestoneIn: number  (the count of MORE qualifying coaches
 *       needed to cross the next milestone)
 *   - nextMilestoneKind: 'qualified_3' | 'qualified_10' | 'qualified_25' | null
 *
 * The existing 0074 select() already pulls `id, full_name, created_at`,
 * so this PR is a response-shape widening with ZERO new `from()` calls
 * (LESSONS#0066). Sibling test files using the same hand-rolled chain
 * queue stay byte-identical (LESSONS#0049 / #0092 / #0100 / #0110: no
 * queue-shape churn).
 *
 * Asserts:
 *  - The 0074-shipped fields are present + correct on every fixture
 *    (byte-identical superset contract per the AC).
 *  - A coach with 2 converted + 0 qualified returns pendingReferrals of
 *    length 2 with first names + needsToQualify strings.
 *  - A coach with 3 qualified + 2 pending returns qualifiedCount:3 AND
 *    pendingReferrals of length 2.
 *  - A coach with 25 qualified returns nextMilestoneKind:null.
 *  - The pending list is capped at 5.
 *  - Planted DOB / parent_phone / email on the converted-coach rows are
 *    NEVER read into the response (COPPA allow-list).
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
 *  2) For each referred coach: plans count (sequential, in input order).
 *  3) For each referred coach: observations count.
 *  4) referral_credit_grants (rows for the inviter — to flag alreadyGranted).
 *
 * Identical to the 0074 queue — this ticket adds no new from() call.
 */
function queueAll(opts: {
  referredCoaches: Array<{
    id: string;
    full_name: string | null;
    created_at?: string | null;
    parent_email?: string | null;
    date_of_birth?: string | null;
    parent_phone?: string | null;
  }>;
  perReferredCounts: Array<{ shipped: number; observations: number }>;
  grantedMilestoneKinds?: string[];
}) {
  mockFromFn.mockReturnValueOnce(buildChain(opts.referredCoaches));
  for (const c of opts.perReferredCounts) {
    mockFromFn.mockReturnValueOnce(buildChain([], { count: c.shipped }));
    mockFromFn.mockReturnValueOnce(buildChain([], { count: c.observations }));
  }
  const grantRows = (opts.grantedMilestoneKinds ?? []).map((k) => ({
    milestone_kind: k,
  }));
  mockFromFn.mockReturnValueOnce(buildChain(grantRows));
}

describe('GET /api/coach/referral-credit-status — pending fields (ticket 0085)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns pendingReferrals:[] and nextMilestoneIn:3 when the caller has no referrals (byte-identical superset)', async () => {
    setAuth();
    queueAll({ referredCoaches: [], perReferredCounts: [] });
    const res = await GET();
    const body = await res.json();
    // 0074-baseline fields still present.
    expect(body.qualifiedCount).toBe(0);
    expect(body.qualifiedCoachFirstNames).toEqual([]);
    expect(body.currentMilestone).toBeNull();
    expect(body.alreadyGranted).toBe(false);
    // New 0085 fields.
    expect(body.pendingReferrals).toEqual([]);
    expect(body.nextMilestoneIn).toBe(3);
    expect(body.nextMilestoneKind).toBe('qualified_3');
  });

  it('returns pendingReferrals of length 2 when 2 converted + 0 qualified', async () => {
    setAuth();
    queueAll({
      referredCoaches: [
        {
          id: 'c-1',
          full_name: 'Lin Tran',
          created_at: '2026-05-30T08:00:00Z',
        },
        {
          id: 'c-2',
          full_name: 'Riya Singh',
          created_at: '2026-05-28T09:00:00Z',
        },
      ],
      perReferredCounts: [
        { shipped: 0, observations: 0 },
        { shipped: 0, observations: 0 },
      ],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.qualifiedCount).toBe(0);
    expect(body.pendingReferrals.length).toBe(2);
    const firstNames = body.pendingReferrals.map(
      (p: { firstName: string }) => p.firstName,
    );
    expect(firstNames).toContain('Lin');
    expect(firstNames).toContain('Riya');
    // needsToQualify is the SAME clipboard-voice string for every row
    // (the bar is uniform across pending coaches).
    for (const p of body.pendingReferrals as Array<{
      needsToQualify: string;
    }>) {
      expect(typeof p.needsToQualify).toBe('string');
      expect(p.needsToQualify.length).toBeGreaterThan(0);
    }
    expect(body.nextMilestoneIn).toBe(3);
    expect(body.nextMilestoneKind).toBe('qualified_3');
  });

  it('returns 3 qualified + 2 pending in one payload (the stacking moment)', async () => {
    setAuth();
    queueAll({
      referredCoaches: [
        // Three qualified.
        { id: 'c-1', full_name: 'Maya Patel', created_at: '2026-05-31T08:00:00Z' },
        { id: 'c-2', full_name: 'James Kim', created_at: '2026-05-30T08:00:00Z' },
        { id: 'c-3', full_name: 'Sam Lee', created_at: '2026-05-29T08:00:00Z' },
        // Two pending.
        { id: 'c-4', full_name: 'Lin Tran', created_at: '2026-05-28T08:00:00Z' },
        { id: 'c-5', full_name: 'Riya Singh', created_at: '2026-05-27T08:00:00Z' },
      ],
      perReferredCounts: [
        { shipped: 1, observations: 0 },
        { shipped: 0, observations: 5 },
        { shipped: 2, observations: 0 },
        { shipped: 0, observations: 0 },
        { shipped: 0, observations: 0 },
      ],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.qualifiedCount).toBe(3);
    expect(body.currentMilestone).toBe('qualified_3');
    expect(body.pendingReferrals.length).toBe(2);
    expect(body.nextMilestoneIn).toBe(7); // 3 → 10
    expect(body.nextMilestoneKind).toBe('qualified_10');
  });

  it('returns nextMilestoneKind:null when 25 qualified', async () => {
    setAuth();
    const referred = Array.from({ length: 25 }, (_, i) => ({
      id: `c-${i}`,
      full_name: `First${i} Last${i}`,
      created_at: '2026-05-30T08:00:00Z',
    }));
    const counts = Array.from({ length: 25 }, () => ({
      shipped: 1,
      observations: 0,
    }));
    queueAll({ referredCoaches: referred, perReferredCounts: counts });
    const res = await GET();
    const body = await res.json();
    expect(body.qualifiedCount).toBe(25);
    expect(body.currentMilestone).toBe('qualified_25');
    expect(body.pendingReferrals).toEqual([]);
    expect(body.nextMilestoneKind).toBeNull();
  });

  it('caps pendingReferrals at 5 when 8 pending', async () => {
    setAuth();
    const referred = Array.from({ length: 8 }, (_, i) => ({
      id: `c-${i}`,
      full_name: `Pending${i} Tail${i}`,
      created_at: '2026-05-30T08:00:00Z',
    }));
    const counts = Array.from({ length: 8 }, () => ({
      shipped: 0,
      observations: 0,
    }));
    queueAll({ referredCoaches: referred, perReferredCounts: counts });
    const res = await GET();
    const body = await res.json();
    expect(body.pendingReferrals.length).toBe(5);
  });

  it('never leaks parent_email / parent_phone / DOB planted on the converted-coach rows even in the pending payload', async () => {
    setAuth();
    queueAll({
      referredCoaches: [
        {
          id: 'c-1',
          full_name: 'Lin Tran',
          created_at: '2026-05-30T08:00:00Z',
          parent_email: 'planted-parent-A@example.com',
          date_of_birth: '2014-04-01',
          parent_phone: '555-PENDING1',
        },
        {
          id: 'c-2',
          full_name: 'Riya Singh',
          created_at: '2026-05-28T09:00:00Z',
          parent_email: 'planted-parent-B@example.com',
          date_of_birth: '2015-05-01',
          parent_phone: '555-PENDING2',
        },
      ],
      perReferredCounts: [
        { shipped: 0, observations: 0 },
        { shipped: 0, observations: 0 },
      ],
    });
    const res = await GET();
    const body = await res.json();
    const flat = JSON.stringify(body).toLowerCase();
    expect(flat).not.toContain('planted-parent');
    expect(flat).not.toContain('2014-04-01');
    expect(flat).not.toContain('555-pending');
    // The pending firstNames are surname-stripped on a literal space
    // (LESSONS#0061 — the route's first-name extraction).
    for (const p of body.pendingReferrals as Array<{ firstName: string }>) {
      expect(p.firstName).not.toContain(' ');
    }
    // Surname must not leak.
    expect(flat).not.toContain('tran');
    expect(flat).not.toContain('singh');
  });

  it('passes signed_up_at through from coaches.created_at on every pending row', async () => {
    setAuth();
    queueAll({
      referredCoaches: [
        {
          id: 'c-1',
          full_name: 'Lin Tran',
          created_at: '2026-05-22T08:00:00Z',
        },
      ],
      perReferredCounts: [{ shipped: 0, observations: 0 }],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.pendingReferrals[0].signedUpAt).toBe('2026-05-22T08:00:00Z');
  });
});
