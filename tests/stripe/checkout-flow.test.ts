/**
 * End-to-end checkout flow contract: upgrade → pay → tier unlocks features.
 *
 * Implements: docs/backlog/0002-end-to-end-checkout-flow-test.md
 *
 * The checkout flow is the moment of revenue. This spec walks the whole sequence
 * with a stubbed Stripe and a stateful in-memory `organizations` store, so a deploy
 * that silently breaks any link in the chain (create-checkout route → signed webhook
 * → DB tier flip → /api/me cache → canAccess gating) fails CI loudly. Each test maps
 * 1:1 to an acceptance-criteria checkbox in ticket 0002.
 *
 * Reconciliations between the ticket's groomer-shorthand wording and the real code
 * (also recorded in the ticket's Implementation log):
 *  - The canonical column is `organizations.tier`, NOT `plan` — `/api/me` selects
 *    `tier` and the webhook writes `tier`. We assert on `tier === 'coach'`.
 *  - `canAccess(tier, feature)` takes a Tier *string*, not an orgId. We drive it with
 *    the tier produced by the live chain (the org row updated by the webhook, surfaced
 *    by /api/me), which honors the AC: "after the upgrade, coach grants report_cards
 *    and denies org_analytics."
 *  - The create-checkout route reads `interval` (not `billing`); a body missing it is
 *    a 400, consistent with the AC's intent that malformed bodies are rejected.
 *  - The AC names a `customer.subscription.created` event; the webhook handler is
 *    extended (minimum change) to map that event's price → tier and flip the org.
 *
 * NOTE on filename: vitest.config.ts excludes `**\/*.spec.ts` (reserved for Playwright),
 * so a `.spec.ts` here would be silently skipped and prove nothing. The ticket's
 * engineering note says `tests/stripe/checkout-flow.spec.ts`; named `.test.ts` so it
 * actually gates. (See docs/LESSONS.md 2026-05-20.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────
// vi.mock() factories are hoisted, so everything they reference (including the
// price-id constant used by the @/lib/stripe mock) must come from vi.hoisted().

const {
  mockGetUser,
  mockServiceFrom,
  mockCheckoutCreate,
  mockCustomerCreate,
  COACH_PRICE_MONTHLY,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockServiceFrom: vi.fn(),
  mockCheckoutCreate: vi.fn(),
  mockCustomerCreate: vi.fn(),
  COACH_PRICE_MONTHLY: 'price_coach_monthly_0002',
}));

// A single Stripe instance used both by the routes (checkout stub + customer stub)
// AND, via webhooks.constructEvent, for real signature verification.
const STRIPE_KEY = 'sk_test_dummy_0002';
const realStripe = new Stripe(STRIPE_KEY, { apiVersion: '2026-04-22.dahlia' });

vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
  return {
    ...actual,
    // Routes call getStripe().checkout.sessions.create / customers.create on the
    // create-checkout path, and getStripe().webhooks.constructEvent on the webhook
    // path. Stub the network calls; keep real signature verification.
    getStripe: () => ({
      checkout: { sessions: { create: mockCheckoutCreate } },
      customers: { create: mockCustomerCreate },
      webhooks: {
        constructEvent: realStripe.webhooks.constructEvent.bind(realStripe.webhooks),
      },
    }),
    // `actual.PRICE_IDS` is frozen from process.env AT MODULE LOAD, which (because
    // vitest hoists imports above any test setup) happens before we can set the env
    // var. Map tier↔price deterministically here so the route's real getPriceId /
    // tierFromPriceId logic is exercised without the load-order race.
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

// Routes under test — imported after the mocks are registered.
import { POST as createCheckout } from '@/app/api/stripe/create-checkout/route';
import { POST as webhook } from '@/app/api/stripe/webhook/route';
import { GET as me } from '@/app/api/me/route';
import { canAccess, type Tier } from '@/lib/tier';
import { memBust } from '@/lib/cache/memory';

// ─── Constants ───────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'whsec_test_secret_0002';
const ORG_ID = 'org_checkout_0002';
const COACH_ID = 'coach_checkout_0002';
const CUSTOMER_ID = 'cus_checkout_0002';
const SUBSCRIPTION_ID = 'sub_checkout_0002';
const USER_EMAIL = 'coach@example.com';

// ─── Stateful in-memory organizations store ────────────────────────────────────
// The whole point of this spec is that the webhook's write is the SAME row the
// later /api/me read sees. We back the service-client mock with a real object so
// the chain is genuinely end-to-end, not three independently-stubbed steps.

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

let orgRow: OrgRow;

function freshOrg(): OrgRow {
  return {
    id: ORG_ID,
    name: 'Eastside Eagles',
    slug: 'eastside-eagles',
    tier: 'free',
    sport_config: {},
    subscription_status: null,
    current_period_end: null,
    cancel_at_period_end: false,
    settings: {},
    stripe_customer_id: CUSTOMER_ID,
    stripe_subscription_id: null,
  };
}

/**
 * Chainable service-client `.from()` mock backed by the live `orgRow` store.
 * Supports the exact shapes the three routes use:
 *  - create-checkout: coaches.select().eq().single(); organizations.select().eq().single()
 *  - webhook: organizations.update().eq() (by id, customer, or subscription) and
 *             organizations.select().eq().single() (lookup by subscription)
 *  - /api/me: coaches.select(...nested organizations...).eq().single();
 *             team_coaches.select().eq()  (resolves to an array)
 */
function makeServiceFrom() {
  return (table: string) => {
    if (table === 'coaches') {
      // Three distinct shapes hit this table:
      //  - /api/me:            select(nested organizations).eq(id).single()
      //  - create-checkout:    select(org_id).eq(id).single()
      //  - webhook cache bust: select('id').eq('org_id', orgId)  ← awaited directly
      // So .eq() must be BOTH chainable (→ .single()) AND awaitable (→ {data:[...]}).
      const coachRow = {
        id: COACH_ID,
        org_id: ORG_ID,
        full_name: 'Coach Rivera',
        organizations: {
          id: orgRow.id,
          name: orgRow.name,
          slug: orgRow.slug,
          tier: orgRow.tier,
          sport_config: orgRow.sport_config,
          subscription_status: orgRow.subscription_status,
          current_period_end: orgRow.current_period_end,
          cancel_at_period_end: orgRow.cancel_at_period_end,
          settings: orgRow.settings,
        },
      };
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: coachRow, error: null }),
      };
      // A thenable eq(): resolves to the coach list (cache-bust path) when awaited,
      // and exposes .single() for the per-coach lookup path.
      chain.eq = vi.fn(() => {
        const list = Promise.resolve({ data: [{ id: COACH_ID }], error: null });
        (list as any).single = chain.single;
        return list;
      });
      return chain;
    }

    if (table === 'team_coaches') {
      // /api/me awaits this builder directly (no .single()); it resolves to a list.
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      return builder;
    }

    if (table === 'organizations') {
      // Track the predicate columns an update is filtered by so we only mutate the
      // store when the predicate actually matches our org.
      let pendingUpdate: Record<string, unknown> | null = null;

      const chain: any = {
        select: vi.fn().mockReturnThis(),
        update: vi.fn((payload: Record<string, unknown>) => {
          pendingUpdate = payload;
          return chain;
        }),
        eq: vi.fn((col: string, val: unknown) => {
          if (pendingUpdate) {
            const matches =
              (col === 'id' && val === orgRow.id) ||
              (col === 'stripe_customer_id' && val === orgRow.stripe_customer_id) ||
              (col === 'stripe_subscription_id' && val === orgRow.stripe_subscription_id);
            if (matches) {
              Object.assign(orgRow, pendingUpdate);
            }
            pendingUpdate = null;
            // .eq() terminates the update; resolve like supabase does.
            return Promise.resolve({ data: null, error: null });
          }
          // select(...).eq(...) path — store the lookup column for .single().
          chain._lookup = { col, val };
          return chain;
        }),
        single: vi.fn(() => {
          // Lookup by subscription id (customer.subscription.updated path).
          const lk = chain._lookup;
          if (lk && lk.col === 'stripe_subscription_id') {
            return Promise.resolve({
              data: orgRow.stripe_subscription_id === lk.val ? { id: orgRow.id } : null,
              error: null,
            });
          }
          return Promise.resolve({ data: { id: orgRow.id }, error: null });
        }),
      };
      return chain;
    }

    // Unknown table — empty chain.
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

/** A `customer.subscription.created` event for the coach monthly price. */
function subscriptionCreatedPayload(): string {
  return JSON.stringify({
    id: 'evt_created_0002',
    type: 'customer.subscription.created',
    data: {
      object: {
        id: SUBSCRIPTION_ID,
        status: 'active',
        customer: CUSTOMER_ID,
        cancel_at_period_end: false,
        items: {
          data: [
            { price: { id: COACH_PRICE_MONTHLY }, current_period_end: 1_900_000_000 },
          ],
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

describe('checkout flow — upgrade → pay → tier unlocks features (ticket 0002)', () => {
  const started = Date.now();

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

    orgRow = freshOrg();
    mockServiceFrom.mockReset();
    mockServiceFrom.mockImplementation(makeServiceFrom());

    mockCheckoutCreate.mockReset();
    mockCheckoutCreate.mockResolvedValue({
      id: 'cs_test_0002',
      url: 'https://checkout.stripe.com/c/pay/cs_test_0002',
    });
    mockCustomerCreate.mockReset();
    mockCustomerCreate.mockResolvedValue({ id: CUSTOMER_ID });

    setAuth({ id: COACH_ID, email: USER_EMAIL });

    // The per-user /api/me memCache key would otherwise leak state between tests.
    memBust(`me:${COACH_ID}`);

    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // AC1: authed coach POST {tier:'coach', interval:'monthly'} → 200 with a
  // checkout.stripe.com url.
  it('returns 200 with a checkout.stripe.com URL for an authed coach', async () => {
    const res = await createCheckout(checkoutRequest({ tier: 'coach', interval: 'monthly' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.url).toBe('string');
    expect(new URL(body.url).hostname).toBe('checkout.stripe.com');
    // The session was created against the coach monthly price.
    expect(mockCheckoutCreate).toHaveBeenCalledTimes(1);
    expect(mockCheckoutCreate.mock.calls[0][0]).toMatchObject({
      mode: 'subscription',
      line_items: [{ price: COACH_PRICE_MONTHLY, quantity: 1 }],
    });
  });

  // AC2: no auth → 401, no Stripe session created.
  it('returns 401 and creates no Stripe session when unauthenticated', async () => {
    setAuth(null);
    const res = await createCheckout(checkoutRequest({ tier: 'coach', interval: 'monthly' }));
    expect(res.status).toBe(401);
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  // AC3: unknown tier → 400.
  it('returns 400 for an unknown tier', async () => {
    const res = await createCheckout(checkoutRequest({ tier: 'unknown', interval: 'monthly' }));
    expect(res.status).toBe(400);
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  // AC4: a correctly-signed customer.subscription.created webhook flips the org
  // matching the event's customer to tier='coach' + subscription_status='active'.
  it('flips the org to coach/active on a signed customer.subscription.created event', async () => {
    expect(orgRow.tier).toBe('free'); // precondition

    const payload = subscriptionCreatedPayload();
    const res = await webhook(webhookRequest(payload, sign(payload)));
    expect(res.status).toBe(200);

    expect(orgRow.tier).toBe('coach');
    expect(orgRow.subscription_status).toBe('active');
    expect(orgRow.stripe_subscription_id).toBe(SUBSCRIPTION_ID);
  });

  // AC5: after the webhook fires, GET /api/me returns the new tier on the NEXT
  // call — the 2-minute memCache must not mask the upgrade.
  it('GET /api/me reflects the upgrade on the next call (cache not masking)', async () => {
    // Warm the cache with the pre-upgrade (free) read, exactly as a logged-in
    // coach hitting the dashboard before paying would.
    const before = await me();
    const beforeBody = await before.json();
    expect(beforeBody.coach.organizations.tier).toBe('free');

    // Pay → webhook fires.
    const payload = subscriptionCreatedPayload();
    await webhook(webhookRequest(payload, sign(payload)));

    // Next /api/me must NOT serve the stale free row from cache.
    const after = await me();
    const afterBody = await after.json();
    expect(afterBody.coach.organizations.tier).toBe('coach');
    expect(afterBody.coach.organizations.subscription_status).toBe('active');
  });

  // AC6: canAccess(tier, 'report_cards') === true after the upgrade.
  it('grants report_cards after the coach upgrade', async () => {
    const payload = subscriptionCreatedPayload();
    await webhook(webhookRequest(payload, sign(payload)));

    const after = await me();
    const tier = (await after.json()).coach.organizations.tier as Tier;
    expect(tier).toBe('coach');
    expect(canAccess(tier, 'report_cards')).toBe(true);
  });

  // AC7: canAccess(tier, 'org_analytics') === false after a coach upgrade (no over-grant).
  it('does NOT grant org_analytics after a coach upgrade', async () => {
    const payload = subscriptionCreatedPayload();
    await webhook(webhookRequest(payload, sign(payload)));

    const after = await me();
    const tier = (await after.json()).coach.organizations.tier as Tier;
    expect(canAccess(tier, 'org_analytics')).toBe(false);
  });

  // AC8: the whole fixture flow runs in under 5 seconds (mocked Stripe + Supabase).
  it('runs the whole spec in under 5 seconds', () => {
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
