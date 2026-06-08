/**
 * Ticket 0074 — webhook regression: `customer.subscription.deleted` is
 * BYTE-IDENTICAL when a `referral_credit_grants` row exists for the
 * inviter coach in the affected org. The Stripe customer balance is
 * preserved through a cancellation (Stripe behavior) so a coach who
 * cancels and re-subscribes within Stripe's balance-retention window
 * still has their credit. The webhook itself does NOT need to read or
 * write referral_credit_grants — this test asserts that contract.
 *
 * LESSONS#0044 — the tier value is gated on sub.status, not on credit-
 * balance presence; this ticket does not weaken that contract.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';

const { mockGetUser, mockServiceFrom, COACH_PRICE_MONTHLY } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockServiceFrom: vi.fn(),
  COACH_PRICE_MONTHLY: 'price_coach_monthly_0074',
}));

const STRIPE_KEY = 'sk_test_dummy_0074';
const realStripe = new Stripe(STRIPE_KEY, { apiVersion: '2026-04-22.dahlia' });

vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
  return {
    ...actual,
    getStripe: () => ({
      webhooks: {
        constructEvent: realStripe.webhooks.constructEvent.bind(realStripe.webhooks),
      },
    }),
    getPriceId: (tier: string, interval: string) =>
      tier === 'coach' && interval === 'monthly' ? COACH_PRICE_MONTHLY : '',
    tierFromPriceId: (priceId: string) =>
      priceId === COACH_PRICE_MONTHLY ? 'coach' : null,
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockServiceFrom })),
}));

import { POST as webhook } from '@/app/api/stripe/webhook/route';

const WEBHOOK_SECRET = 'whsec_test_secret_0074';
const ORG_ID = 'org_credit_preserve_0074';
const COACH_ID = 'coach_credit_preserve_0074';
const SUBSCRIPTION_ID = 'sub_credit_preserve_0074';
const CUSTOMER_ID = 'cus_credit_preserve_0074';
const PERIOD_END_UNIX = 1_900_000_000;
const PERIOD_END_ISO = new Date(PERIOD_END_UNIX * 1000).toISOString();

type OrgRow = {
  id: string;
  tier: string;
  subscription_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean;
};

type ReferralCreditGrantRow = {
  id: string;
  inviter_coach_id: string;
  milestone_kind: string;
  credit_amount_cents: number;
  stripe_customer_balance_txn_id: string | null;
};

let orgRow: OrgRow;
let referralCreditGrants: ReferralCreditGrantRow[];
let touchedReferralCreditGrants: boolean;

function freshOrg(): OrgRow {
  return {
    id: ORG_ID,
    tier: 'coach',
    subscription_status: 'active',
    stripe_customer_id: CUSTOMER_ID,
    stripe_subscription_id: SUBSCRIPTION_ID,
    cancel_at_period_end: false,
  };
}

function makeServiceFrom() {
  return (table: string) => {
    if (table === 'organizations') {
      let pendingUpdate: Record<string, unknown> | null = null;
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        update: vi.fn((payload: Record<string, unknown>) => {
          pendingUpdate = payload;
          return chain;
        }),
        eq: vi.fn((col: string, val: unknown) => {
          if (pendingUpdate) {
            const match = col === 'id' && val === orgRow.id;
            if (match) Object.assign(orgRow, pendingUpdate);
            pendingUpdate = null;
            return Promise.resolve({ data: null, error: null });
          }
          chain._lookup = { col, val };
          return chain;
        }),
        single: vi.fn(() =>
          Promise.resolve({ data: { id: orgRow.id }, error: null }),
        ),
      };
      return chain;
    }
    if (table === 'coaches') {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [{ id: COACH_ID }], error: null }),
      };
      return chain;
    }
    if (table === 'referral_credit_grants') {
      touchedReferralCreditGrants = true;
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: referralCreditGrants, error: null }),
      };
      return chain;
    }
    // Unknown table — return an empty chain (the webhook should never
    // hit anything else for this branch).
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  };
}

function sign(payload: string): string {
  return realStripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
}

function webhookRequest(body: string, signature?: string): Request {
  const headers: Record<string, string> = {};
  if (signature !== undefined) headers['stripe-signature'] = signature;
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers,
    body,
  });
}

function subscriptionDeletedPayload(): string {
  return JSON.stringify({
    id: 'evt_credit_preserve_0074',
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: SUBSCRIPTION_ID,
        status: 'canceled',
        customer: CUSTOMER_ID,
        cancel_at_period_end: false,
        items: {
          data: [
            { price: { id: COACH_PRICE_MONTHLY }, current_period_end: PERIOD_END_UNIX },
          ],
        },
      },
    },
  });
}

describe('Webhook preserves customer-balance credit (ticket 0074)', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    orgRow = freshOrg();
    referralCreditGrants = [
      {
        id: 'grant-1',
        inviter_coach_id: COACH_ID,
        milestone_kind: 'qualified_3',
        credit_amount_cents: 999,
        stripe_customer_balance_txn_id: 'cbtxn_existing',
      },
    ];
    touchedReferralCreditGrants = false;
    mockServiceFrom.mockReset();
    mockServiceFrom.mockImplementation(makeServiceFrom());
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } }, error: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('subscription.deleted downgrades to free WITHOUT touching referral_credit_grants', async () => {
    const payload = subscriptionDeletedPayload();
    const res = await webhook(webhookRequest(payload, sign(payload)));
    expect(res.status).toBe(200);

    // Tier flipped to free, status canceled — the BYTE-IDENTICAL 0003
    // behavior, asserted with a planted credit row to prove the credit
    // row does not change that path.
    expect(orgRow.tier).toBe('free');
    expect(orgRow.subscription_status).toBe('canceled');
    expect(orgRow.stripe_subscription_id).toBeNull();

    // The credit row is preserved (Stripe's customer balance lives at
    // Stripe; we mirror that in the local audit-trail row — the webhook
    // never reads or updates referral_credit_grants).
    expect(touchedReferralCreditGrants).toBe(false);
    expect(referralCreditGrants).toHaveLength(1);
    expect(referralCreditGrants[0].stripe_customer_balance_txn_id).toBe(
      'cbtxn_existing',
    );
  });
});
