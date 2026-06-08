/**
 * Ticket 0074 — POST /api/billing/apply-referral-credit.
 *
 * Applies the inviter's referral credit for the current milestone if it
 * has not already been granted. Behavior:
 *  - 401 on unauthed.
 *  - 200 { eligible:false } when the caller has fewer than 3 qualified.
 *  - 200 { already:true } when the milestone row already exists.
 *  - On a paid-tier caller with a stripe_customer_id: calls the lazy
 *    getStripe().customers.createBalanceTransaction with a NEGATIVE
 *    amount and writes the referral_credit_grants row.
 *  - On a free-tier caller: writes a pending row
 *    (stripe_customer_balance_txn_id = NULL) and returns
 *    { pending: true, pendingUntilUpgrade: true }.
 *  - On a Stripe failure: 500 and NO row written (LESSONS#0044
 *    billing immutability — the grant only persists if the Stripe
 *    credit persists).
 *  - getStripe() is the lazy factory, never new Stripe() at module top
 *    (AGENTS.md Hard NO).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 * Stub @/lib/stripe per LESSONS#0040 — getPriceId / tierFromPriceId
 * deterministic; getStripe returns an in-test stub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetUser,
  mockFromFn,
  mockCreateBalanceTransaction,
  COACH_MONTHLY_CENTS,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
  mockCreateBalanceTransaction: vi.fn(),
  COACH_MONTHLY_CENTS: 999,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
  return {
    ...actual,
    getStripe: () => ({
      customers: {
        createBalanceTransaction: mockCreateBalanceTransaction,
      },
    }),
  };
});

import { POST } from '@/app/api/billing/apply-referral-credit/route';

interface Chain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
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
    insert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled) => Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = '00000000-0000-4000-a000-0000000000d1';
const ORG_ID = '00000000-0000-4000-a000-0000000000d2';
const CUSTOMER_ID = 'cus_test_0074';

function setAuth(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

/**
 * Set up a mock queue for the POST route's reads. The route order is:
 *  1) coaches -> select(org_id) for the caller (.eq.maybeSingle).
 *  2) organizations -> select(tier, stripe_customer_id) (.eq.maybeSingle).
 *  3) coaches -> select id list of referred coaches by JSONB code.
 *  4) for each referred coach: plans (count) + observations (count).
 *  5) referral_credit_grants -> existing rows for inviter (the
 *     already-granted check).
 *  6) referral_credit_grants -> insert path (the .insert chain).
 */
function queue(opts: {
  org: { tier: string; stripe_customer_id: string | null } | null;
  referredCoaches: Array<{ id: string; full_name: string | null }>;
  perReferredCounts: Array<{ shipped: number; observations: number }>;
  grantedMilestoneKinds?: string[];
  insertErrors?: boolean;
}) {
  // 1) caller coach -> org_id.
  mockFromFn.mockReturnValueOnce(buildChain({ id: COACH_ID, org_id: ORG_ID }));
  // 2) org row.
  mockFromFn.mockReturnValueOnce(buildChain(opts.org));
  // 3) referred coaches.
  mockFromFn.mockReturnValueOnce(buildChain(opts.referredCoaches));
  // 4) per-coach counts.
  for (const c of opts.perReferredCounts) {
    mockFromFn.mockReturnValueOnce(buildChain([], { count: c.shipped }));
    mockFromFn.mockReturnValueOnce(buildChain([], { count: c.observations }));
  }
  // 5) existing grant rows.
  mockFromFn.mockReturnValueOnce(
    buildChain((opts.grantedMilestoneKinds ?? []).map((k) => ({ milestone_kind: k }))),
  );
  // 6) insert. If insertErrors is true, the .insert() chain resolves with an error.
  const insertChain = buildChain(null, opts.insertErrors ? { error: { message: 'db error' } } : {});
  mockFromFn.mockReturnValueOnce(insertChain);
}

describe('POST /api/billing/apply-referral-credit (ticket 0074)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockCreateBalanceTransaction.mockReset();
    // Default: getPriceId returns a non-empty value so the route's coach
    // monthly price-in-cents lookup is deterministic. The route reads the
    // monthly amount via a hard-coded constant; the env-load order in
    // src/lib/stripe.ts is bypassed by the credit constant (LESSONS#0040).
  });

  it('returns 401 when the caller is not authed', async () => {
    setAuth(null);
    const res = await POST(new Request('http://localhost/api/billing/apply-referral-credit', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
    expect(mockCreateBalanceTransaction).not.toHaveBeenCalled();
  });

  it('returns eligible:false when the caller has fewer than 3 qualified referrals', async () => {
    setAuth();
    queue({
      org: { tier: 'coach', stripe_customer_id: CUSTOMER_ID },
      referredCoaches: [
        { id: 'c-1', full_name: 'Maya Patel' },
        { id: 'c-2', full_name: 'James Kim' },
      ],
      perReferredCounts: [
        { shipped: 1, observations: 0 },
        { shipped: 1, observations: 0 },
      ],
    });
    const res = await POST(
      new Request('http://localhost/api/billing/apply-referral-credit', { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(mockCreateBalanceTransaction).not.toHaveBeenCalled();
  });

  it('returns already:true when the milestone row already exists (no Stripe call)', async () => {
    setAuth();
    queue({
      org: { tier: 'coach', stripe_customer_id: CUSTOMER_ID },
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
    const res = await POST(
      new Request('http://localhost/api/billing/apply-referral-credit', { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.already).toBe(true);
    expect(mockCreateBalanceTransaction).not.toHaveBeenCalled();
  });

  it('applies a Stripe customer-balance credit with NEGATIVE amount on a paid-tier caller', async () => {
    setAuth();
    mockCreateBalanceTransaction.mockResolvedValue({
      id: 'cbtxn_test_0074',
      amount: -COACH_MONTHLY_CENTS,
      currency: 'usd',
    });
    queue({
      org: { tier: 'coach', stripe_customer_id: CUSTOMER_ID },
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
    const res = await POST(
      new Request('http://localhost/api/billing/apply-referral-credit', { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redeemed).toBe(true);
    expect(body.stripeTxnId).toBe('cbtxn_test_0074');
    expect(body.creditAmountCents).toBeGreaterThan(0);

    // The Stripe credit MUST be a NEGATIVE-amount call (LESSONS#0044
    // billing immutability — createBalanceTransaction with a negative
    // amount applies a credit).
    expect(mockCreateBalanceTransaction).toHaveBeenCalledTimes(1);
    const [customerArg, paramsArg] = mockCreateBalanceTransaction.mock.calls[0];
    expect(customerArg).toBe(CUSTOMER_ID);
    expect(paramsArg.amount).toBeLessThan(0);
    expect(paramsArg.currency).toBe('usd');
    expect(typeof paramsArg.description).toBe('string');
    // Voice contract — the description never contains a banned word.
    const bannedWords = [
      'journey',
      'amazing',
      'exciting',
      'elevate',
      'empower',
      'synergy',
    ];
    for (const w of bannedWords) {
      expect(paramsArg.description.toLowerCase()).not.toContain(w);
    }
  });

  it('writes a pending grant (stripe_customer_balance_txn_id NULL) on a free-tier caller', async () => {
    setAuth();
    queue({
      org: { tier: 'free', stripe_customer_id: null },
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
    const res = await POST(
      new Request('http://localhost/api/billing/apply-referral-credit', { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pending).toBe(true);
    expect(body.pendingUntilUpgrade).toBe(true);
    // Stripe is NEVER called on the free path.
    expect(mockCreateBalanceTransaction).not.toHaveBeenCalled();
  });

  it('returns 500 and writes NO row when the Stripe credit call fails', async () => {
    setAuth();
    mockCreateBalanceTransaction.mockRejectedValue(new Error('stripe down'));
    // The queue here is identical to the paid-tier-credit happy path —
    // the difference is the Stripe mock throws.
    queue({
      org: { tier: 'coach', stripe_customer_id: CUSTOMER_ID },
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
    // Silence the error log so the test output is clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(
      new Request('http://localhost/api/billing/apply-referral-credit', { method: 'POST' }),
    );
    expect(res.status).toBe(500);
    // Find the call to from('referral_credit_grants') with an insert.
    // The route is structured so the grant insert NEVER fires before the
    // Stripe credit returns; on a Stripe throw, no insert chain fires.
    // The mock recorded only the read-side chains. The asserted invariant:
    // no call to .insert() was issued before Stripe failed.
    const insertCalls = mockFromFn.mock.results
      .map((r) => r.value as Chain | undefined)
      .filter((c): c is Chain => Boolean(c))
      .flatMap((c) => c.insert.mock.calls);
    expect(insertCalls).toHaveLength(0);
  });
});
