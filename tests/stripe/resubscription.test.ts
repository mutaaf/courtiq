/**
 * Resubscription flow contract: free user re-upgrades after cancellation.
 *
 * Implements: docs/backlog/0005-resubscription-flow.md
 *
 * Resubscription is the most common revenue path after the first upgrade — a coach
 * cancels off-season, comes back next season, and re-upgrades. The high-trust moment
 * is "did it recognize me, reuse my saved card, and unlock features without
 * double-charging?". This spec locks the whole arc in with a stubbed Stripe and a
 * stateful in-memory `organizations` store, so a deploy that mints a duplicate
 * customer, fails to persist a new one, or masks the re-upgrade behind the /api/me
 * cache fails CI loudly. Each test maps 1:1 to an acceptance-criteria checkbox in
 * ticket 0005.
 *
 * Reconciliations between the ticket's groomer-shorthand wording and the real code
 * (also recorded in the ticket's Implementation log):
 *  - The canonical column is `organizations.tier`, NOT `plan`. The webhook writes
 *    `tier`; `/api/me` selects `tier` under `coach.organizations`. We assert on `tier`.
 *  - `subscription_status` IS the real column name (the prose got that right).
 *  - `canAccess(tier, feature)` takes a Tier *string*, not an orgId. AC5/AC7 are driven
 *    by the tier produced by the live chain (the org row surfaced by /api/me).
 *  - "Pro" is the tier value `pro_coach`, not `pro`. The feature key for analytics is
 *    `analytics` (granted at pro_coach); `org_analytics` is organization-only.
 *  - The ticket flags AC1/AC2/AC6 as "likely already correct" — they were NOT. The
 *    create-checkout route today always pre-creates/reuses a customer and passes
 *    `customer: <id>`; AC1/AC2 require branching to `customer_email` when the org has
 *    no customer yet, and AC6 requires a 409 past-due guard that didn't exist. Both are
 *    implemented as the minimum change in this ticket.
 *
 * NOTE on filename: vitest.config.ts excludes `**\/*.spec.ts` (reserved for Playwright),
 * so a `.spec.ts` here would be silently skipped and prove nothing. The ticket's
 * engineering note says `tests/stripe/resubscription.spec.ts`; named `.test.ts` so it
 * actually gates. (See docs/LESSONS.md 2026-05-20.) Mirrors the 0002/0003/0004 pattern.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────
// vi.mock() factories are hoisted, so everything they reference (the price-id
// constants used by the @/lib/stripe mock) must come from vi.hoisted().

const {
  mockGetUser,
  mockServiceFrom,
  mockCheckoutCreate,
  mockCustomerCreate,
  COACH_PRICE_MONTHLY,
  PRO_PRICE_MONTHLY,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockServiceFrom: vi.fn(),
  mockCheckoutCreate: vi.fn(),
  mockCustomerCreate: vi.fn(),
  COACH_PRICE_MONTHLY: 'price_coach_monthly_0005',
  PRO_PRICE_MONTHLY: 'price_pro_monthly_0005',
}));

// One Stripe instance: used by the routes (checkout/customer stubs) AND, via
// webhooks.constructEvent, for real signature verification.
const STRIPE_KEY = 'sk_test_dummy_0005';
const realStripe = new Stripe(STRIPE_KEY, { apiVersion: '2026-04-22.dahlia' });

vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
  return {
    ...actual,
    getStripe: () => ({
      checkout: { sessions: { create: mockCheckoutCreate } },
      customers: { create: mockCustomerCreate },
      webhooks: {
        constructEvent: realStripe.webhooks.constructEvent.bind(realStripe.webhooks),
      },
    }),
    // `actual.PRICE_IDS` is frozen from process.env AT MODULE LOAD (before vitest can
    // set env), so map tier↔price deterministically here. This keeps the routes' real
    // getPriceId / tierFromPriceId logic exercised without the load-order race.
    // (LESSONS 2026-05-20.)
    getPriceId: (tier: string, interval: string) => {
      if (interval !== 'monthly') return '';
      if (tier === 'coach') return COACH_PRICE_MONTHLY;
      if (tier === 'pro_coach') return PRO_PRICE_MONTHLY;
      return '';
    },
    tierFromPriceId: (priceId: string) => {
      if (priceId === COACH_PRICE_MONTHLY) return 'coach';
      if (priceId === PRO_PRICE_MONTHLY) return 'pro_coach';
      return null;
    },
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockServiceFrom })),
}));

// Routes/helpers under test — imported after the mocks are registered.
import { POST as createCheckout } from '@/app/api/stripe/create-checkout/route';
import { POST as webhook } from '@/app/api/stripe/webhook/route';
import { GET as me } from '@/app/api/me/route';
import { canAccess, type Tier } from '@/lib/tier';
import { memBust } from '@/lib/cache/memory';

// ─── Constants ───────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'whsec_test_secret_0005';
const ORG_ID = 'org_resub_0005';
const COACH_ID = 'coach_resub_0005';
const EXISTING_CUSTOMER_ID = 'cus_resub_existing_0005';
const NEW_CUSTOMER_ID = 'cus_resub_new_0005';
const NEW_SUBSCRIPTION_ID = 'sub_resub_0005';
const USER_EMAIL = 'coach@example.com';
const PERIOD_END_UNIX = 1_900_000_000;
const PERIOD_END_ISO = new Date(PERIOD_END_UNIX * 1000).toISOString();

// ─── Stateful in-memory organizations store ────────────────────────────────────
// The webhook's write must be the SAME row the later /api/me read sees, and a
// resubscription must NOT create a second org row or a second customer. We back the
// service-client mock with a single real object so the chain is genuinely end-to-end.

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  tier: string;
  sport_config: Record<string, unknown>;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  settings: Record<string, unknown>;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

// Count how many distinct org rows exist; resubscription must never mint a second.
let orgRows: OrgRow[];

function orgById(id: string): OrgRow | undefined {
  return orgRows.find((o) => o.id === id);
}
function orgByCustomer(cus: string | null): OrgRow | undefined {
  return cus == null ? undefined : orgRows.find((o) => o.stripe_customer_id === cus);
}
function orgBySubscription(sub: string | null): OrgRow | undefined {
  return sub == null ? undefined : orgRows.find((o) => o.stripe_subscription_id === sub);
}

/**
 * A cancelled org: a coach who upgraded once (so they HAVE a stripe_customer_id from
 * the prior subscription), then cancelled — now `free` + `canceled`, subscription id
 * cleared by the prior `customer.subscription.deleted` (ticket 0003 behavior).
 */
function freshCancelledOrg(): OrgRow {
  return {
    id: ORG_ID,
    name: 'Eastside Eagles',
    slug: 'eastside-eagles',
    tier: 'free',
    sport_config: {},
    subscription_status: 'canceled',
    current_period_end: null,
    cancel_at_period_end: false,
    settings: {},
    stripe_customer_id: EXISTING_CUSTOMER_ID,
    stripe_subscription_id: null,
  };
}

/**
 * A brand-new org that never paid: no stripe_customer_id at all. Used for AC2's
 * first-time path (customer_email branch + persist-customer-on-webhook).
 */
function freshNeverPaidOrg(): OrgRow {
  return {
    id: ORG_ID,
    name: 'Westside Wolves',
    slug: 'westside-wolves',
    tier: 'free',
    sport_config: {},
    subscription_status: null,
    current_period_end: null,
    cancel_at_period_end: false,
    settings: {},
    stripe_customer_id: null,
    stripe_subscription_id: null,
  };
}

/**
 * Chainable service-client `.from()` mock backed by the live `orgRows` store.
 * Supports the exact shapes the three routes use:
 *  - create-checkout: coaches.select('org_id').eq('id').single();
 *                     organizations.select(...).eq('id').single();
 *                     organizations.update({stripe_customer_id}).eq('id') (customer-mint path)
 *  - webhook: organizations.select('id').eq('stripe_customer_id'|'stripe_subscription_id').single()
 *             organizations.update(payload).eq('id'|'stripe_customer_id'|'stripe_subscription_id')
 *             coaches.select('id').eq('org_id', orgId) (cache bust, awaited)
 *  - /api/me: coaches.select(nested organizations).eq('id', user.id).single();
 *             team_coaches.select().eq('coach_id', id) (resolves to a list)
 */
function makeServiceFrom() {
  return (table: string) => {
    if (table === 'coaches') {
      const org = orgById(ORG_ID)!;
      const coachRow = {
        id: COACH_ID,
        org_id: ORG_ID,
        full_name: 'Coach Rivera',
        organizations: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          tier: org.tier,
          sport_config: org.sport_config,
          subscription_status: org.subscription_status,
          current_period_end: org.current_period_end,
          cancel_at_period_end: org.cancel_at_period_end,
          settings: org.settings,
        },
      };
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: coachRow, error: null }),
      };
      // eq() must be BOTH chainable (→ .single() for /api/me + create-checkout) AND
      // awaitable (→ a coach list for the webhook's cache-bust path).
      chain.eq = vi.fn(() => {
        const list = Promise.resolve({ data: [{ id: COACH_ID }], error: null });
        (list as any).single = chain.single;
        return list;
      });
      return chain;
    }

    if (table === 'team_coaches') {
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      return builder;
    }

    if (table === 'organizations') {
      let pendingUpdate: Record<string, unknown> | null = null;
      let lookup: { col: string; val: unknown } | null = null;

      const chain: any = {
        select: vi.fn().mockReturnThis(),
        update: vi.fn((payload: Record<string, unknown>) => {
          pendingUpdate = payload;
          return chain;
        }),
        eq: vi.fn((col: string, val: unknown) => {
          if (pendingUpdate) {
            // Resolve the target row by whichever predicate the route used.
            let target: OrgRow | undefined;
            if (col === 'id') target = orgById(val as string);
            else if (col === 'stripe_customer_id') target = orgByCustomer(val as string);
            else if (col === 'stripe_subscription_id') target = orgBySubscription(val as string);
            if (target) Object.assign(target, pendingUpdate);
            pendingUpdate = null;
            return Promise.resolve({ data: null, error: null });
          }
          lookup = { col, val };
          return chain;
        }),
        single: vi.fn(() => {
          const lk = lookup;
          lookup = null;
          let row: OrgRow | undefined;
          if (lk?.col === 'id') row = orgById(lk.val as string);
          else if (lk?.col === 'stripe_customer_id') row = orgByCustomer(lk.val as string);
          else if (lk?.col === 'stripe_subscription_id') row = orgBySubscription(lk.val as string);
          if (!row) return Promise.resolve({ data: null, error: null });
          // create-checkout selects id, stripe_customer_id, name (+ status for the
          // past-due guard); the webhook selects only id. Return the full row; extra
          // fields are harmless.
          return Promise.resolve({ data: row, error: null });
        }),
      };
      return chain;
    }

    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  };
}

// ─── Request helpers ───────────────────────────────────────────────────────────

function checkoutRequest(body: unknown): Request {
  return new Request('http://localhost/api/stripe/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function sign(payload: string): string {
  return realStripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
}

/**
 * A `customer.subscription.created` event for a given price + customer. The
 * create-checkout route stamps `org_id` into `subscription_data.metadata`, which Stripe
 * propagates onto the subscription, so real events carry it; the webhook uses it to
 * resolve the org when the customer id isn't on the org row yet (first-time path).
 */
function subscriptionCreatedPayload(priceId: string, customerId: string): string {
  return JSON.stringify({
    id: 'evt_created_0005',
    type: 'customer.subscription.created',
    data: {
      object: {
        id: NEW_SUBSCRIPTION_ID,
        status: 'active',
        customer: customerId,
        cancel_at_period_end: false,
        metadata: { org_id: ORG_ID },
        items: {
          data: [{ price: { id: priceId }, current_period_end: PERIOD_END_UNIX }],
        },
      },
    },
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

function setAuth(user: { id: string; email: string } | null) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('resubscription flow — free user re-upgrades after cancellation (ticket 0005)', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

    orgRows = [freshCancelledOrg()];
    mockServiceFrom.mockReset();
    mockServiceFrom.mockImplementation(makeServiceFrom());

    mockCheckoutCreate.mockReset();
    mockCheckoutCreate.mockResolvedValue({
      id: 'cs_test_0005',
      url: 'https://checkout.stripe.com/c/pay/cs_test_0005',
    });
    mockCustomerCreate.mockReset();
    mockCustomerCreate.mockResolvedValue({ id: NEW_CUSTOMER_ID });

    setAuth({ id: COACH_ID, email: USER_EMAIL });

    // The per-user /api/me memCache key would otherwise leak state between tests.
    memBust(`me:${COACH_ID}`);

    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // AC1: a coach whose org HAS a stripe_customer_id re-checks-out with
  // `customer: <existing_id>` — NOT customer_email, NOT undefined — and never mints a
  // new customer.
  it('reuses the existing Stripe customer (customer: <id>) when the org has one', async () => {
    expect(orgById(ORG_ID)!.stripe_customer_id).toBe(EXISTING_CUSTOMER_ID); // precondition

    const res = await createCheckout(checkoutRequest({ tier: 'coach', interval: 'monthly' }));
    expect(res.status).toBe(200);

    expect(mockCheckoutCreate).toHaveBeenCalledTimes(1);
    const arg = mockCheckoutCreate.mock.calls[0][0];
    expect(arg.customer).toBe(EXISTING_CUSTOMER_ID);
    expect(arg.customer_email).toBeUndefined();
    // No duplicate customer minted, no duplicate org row.
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(orgRows).toHaveLength(1);
    expect(orgById(ORG_ID)!.stripe_customer_id).toBe(EXISTING_CUSTOMER_ID);
  });

  // AC2: a coach whose org has NO stripe_customer_id checks out with
  // `customer_email: <coach.email>` (no customer id), and a subsequent
  // customer.subscription.created persists the new customer id back to the org.
  it('uses customer_email when the org has no customer, then persists the new id on webhook', async () => {
    orgRows = [freshNeverPaidOrg()];
    expect(orgById(ORG_ID)!.stripe_customer_id).toBeNull(); // precondition

    const res = await createCheckout(checkoutRequest({ tier: 'coach', interval: 'monthly' }));
    expect(res.status).toBe(200);

    expect(mockCheckoutCreate).toHaveBeenCalledTimes(1);
    const arg = mockCheckoutCreate.mock.calls[0][0];
    expect(arg.customer_email).toBe(USER_EMAIL);
    expect(arg.customer).toBeUndefined();

    // Stripe Checkout creates the customer; the created webhook carries the new id and
    // must persist it back to the org (so future checkouts reuse it — the AC1 path).
    const payload = subscriptionCreatedPayload(COACH_PRICE_MONTHLY, NEW_CUSTOMER_ID);
    const hookRes = await webhook(webhookRequest(payload, sign(payload)));
    expect(hookRes.status).toBe(200);

    expect(orgById(ORG_ID)!.stripe_customer_id).toBe(NEW_CUSTOMER_ID);
    expect(orgRows).toHaveLength(1); // no duplicate org row
  });

  // AC3: a resubscription's customer.subscription.created for an org currently
  // free + canceled returns it to coach + active.
  it('returns a cancelled org to coach/active on the resubscription webhook', async () => {
    const org = orgById(ORG_ID)!;
    expect(org.tier).toBe('free');
    expect(org.subscription_status).toBe('canceled');

    const payload = subscriptionCreatedPayload(COACH_PRICE_MONTHLY, EXISTING_CUSTOMER_ID);
    const res = await webhook(webhookRequest(payload, sign(payload)));
    expect(res.status).toBe(200);

    expect(org.tier).toBe('coach');
    expect(org.subscription_status).toBe('active');
    expect(org.stripe_subscription_id).toBe(NEW_SUBSCRIPTION_ID);
    // Customer id unchanged (reused, not duplicated).
    expect(org.stripe_customer_id).toBe(EXISTING_CUSTOMER_ID);
    expect(orgRows).toHaveLength(1);
  });

  // AC5: after resubscription, canAccess(tier, 'report_cards') is true immediately on
  // the next /api/me call — the 2-minute memCache must not mask the re-upgrade.
  it('grants report_cards immediately on the next /api/me after resubscription (cache busted)', async () => {
    // Warm the cache with the pre-resub (free) read, as a returning coach would.
    const before = await me();
    expect((await before.json()).coach.organizations.tier).toBe('free');

    const payload = subscriptionCreatedPayload(COACH_PRICE_MONTHLY, EXISTING_CUSTOMER_ID);
    await webhook(webhookRequest(payload, sign(payload)));

    const after = await me();
    const org = (await after.json()).coach.organizations;
    expect(org.tier).toBe('coach');
    expect(canAccess(org.tier as Tier, 'report_cards')).toBe(true);
  });

  // AC6: resubscribing while still past_due returns 409 directing to the Billing Portal,
  // and never reaches Stripe checkout (fail fast — Stripe won't let us create a second
  // sub on an unpaid customer anyway).
  it('returns 409 directing to the Billing Portal when the org is past_due', async () => {
    const org = orgById(ORG_ID)!;
    org.subscription_status = 'past_due';
    org.tier = 'coach'; // grace window — still on the priced tier per ticket 0004

    const res = await createCheckout(checkoutRequest({ tier: 'coach', interval: 'monthly' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/billing portal/i);
    // No Stripe session created, no customer minted.
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
    expect(mockCustomerCreate).not.toHaveBeenCalled();
  });

  // AC7: resubscribing to a DIFFERENT tier than the cancelled one (cancelled Coach,
  // re-upgrade to Pro) lands on pro_coach. Pro grants `analytics` but NOT `org_analytics`.
  it('resubscribes to a different tier (Coach → Pro): pro_coach grants analytics, denies org_analytics', async () => {
    const org = orgById(ORG_ID)!;
    expect(org.tier).toBe('free'); // cancelled, was coach

    // Re-checkout to Pro reuses the existing customer (AC1 invariant still holds).
    const checkoutRes = await createCheckout(
      checkoutRequest({ tier: 'pro_coach', interval: 'monthly' })
    );
    expect(checkoutRes.status).toBe(200);
    expect(mockCheckoutCreate.mock.calls[0][0].customer).toBe(EXISTING_CUSTOMER_ID);
    expect(mockCheckoutCreate.mock.calls[0][0].line_items).toEqual([
      { price: PRO_PRICE_MONTHLY, quantity: 1 },
    ]);

    // The Pro subscription's created webhook flips the org to pro_coach.
    const payload = subscriptionCreatedPayload(PRO_PRICE_MONTHLY, EXISTING_CUSTOMER_ID);
    const hookRes = await webhook(webhookRequest(payload, sign(payload)));
    expect(hookRes.status).toBe(200);

    expect(org.tier).toBe('pro_coach');
    expect(org.subscription_status).toBe('active');

    const after = await me();
    const tier = (await after.json()).coach.organizations.tier as Tier;
    expect(tier).toBe('pro_coach');
    expect(canAccess(tier, 'analytics')).toBe(true);
    expect(canAccess(tier, 'org_analytics')).toBe(false);
  });
});
