/**
 * Payment-failure flow contract: failed payment → past_due → grace → recover/terminate.
 *
 * Implements: docs/backlog/0004-payment-failure-handling.md
 *
 * Card-decline is the single biggest *preventable* churn cause. The product already has
 * the primitives (`subscription_status: 'past_due'` read by `useTier()`, surfaced as a
 * banner in `DashboardShell`) but had zero coverage on the
 * webhook → status → grace-window → recover/terminate arc. One handler edit could
 * silently drop a paying coach to free-tier mid-season, or — worse — keep features
 * unlocked forever after Stripe gives up retrying. This spec locks the whole arc in.
 * Each test maps 1:1 to an acceptance-criteria checkbox in ticket 0004.
 *
 * Reconciliations between the ticket's groomer-shorthand and the real code (also recorded
 * in the ticket's Implementation log):
 *  - The canonical column is `organizations.tier`, NOT `plan`. The webhook writes `tier`;
 *    `/api/me` selects `tier` and returns it under `coach.organizations`, NOT `org`. We
 *    assert on `coach.organizations.tier` / `.subscription_status`.
 *  - `canAccess(tier, feature)` takes a Tier *string* and is status-agnostic. The grace
 *    window is therefore enforced by the WEBHOOK: it keeps `tier` at the priced value for
 *    non-terminal statuses (active/past_due/trialing) and flips `tier` to 'free' for
 *    terminal non-paying statuses (unpaid/canceled/incomplete_expired). `canAccess` then
 *    reads naturally — a coach in grace is still 'coach'; past the retry window, 'free'.
 *
 * NOTE on filename: vitest.config.ts excludes `**\/*.spec.ts` (reserved for Playwright),
 * so a `.spec.ts` here would be silently skipped and prove nothing. The ticket's
 * engineering note says `tests/stripe/payment-failure.spec.ts`; named `.test.ts` so it
 * actually gates. (See docs/LESSONS.md 2026-05-20.) Mirrors the 0002/0003 mock pattern.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────
// vi.mock() factories are hoisted, so everything they reference (the price-id
// constant used by the @/lib/stripe mock) must come from vi.hoisted().

const { mockGetUser, mockServiceFrom, COACH_PRICE_MONTHLY } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockServiceFrom: vi.fn(),
  COACH_PRICE_MONTHLY: 'price_coach_monthly_0004',
}));

// One Stripe instance: used by the route via webhooks.constructEvent (real signature
// verification) and in-test to mint valid signatures via generateTestHeaderString.
const STRIPE_KEY = 'sk_test_dummy_0004';
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
    // `actual.PRICE_IDS` is frozen from process.env AT MODULE LOAD (before vitest can set
    // env), so map tier↔price deterministically here. This keeps the webhook's real
    // tierFromPriceId logic exercised without the load-order race. (LESSONS 2026-05-20.)
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

// Routes/helpers under test — imported after the mocks are registered.
import { POST as webhook } from '@/app/api/stripe/webhook/route';
import { GET as me } from '@/app/api/me/route';
import { canAccess, type Tier } from '@/lib/tier';
import { memBust } from '@/lib/cache/memory';

// ─── Constants ───────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'whsec_test_secret_0004';
const ORG_ID = 'org_pastdue_0004';
const COACH_ID = 'coach_pastdue_0004';
const CUSTOMER_ID = 'cus_pastdue_0004';
const SUBSCRIPTION_ID = 'sub_pastdue_0004';
const USER_EMAIL = 'coach@example.com';
// A fixed UNIX seconds value for current_period_end so the ISO assertion is exact.
const PERIOD_END_UNIX = 1_900_000_000;
const PERIOD_END_ISO = new Date(PERIOD_END_UNIX * 1000).toISOString();

// ─── Stateful in-memory org store ──────────────────────────────────────────────
// The point of this spec is that the webhook's write is the SAME row the later
// /api/me read sees, AND that the grace window keeps features unlocked while past_due
// but locks them once Stripe gives up. We back the service-client mock with a real org
// object so the chain is genuinely end-to-end.

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
    name: 'Riverside Rockets',
    slug: 'riverside-rockets',
    tier: 'coach', // already paying — this ticket starts from an active Coach subscription
    sport_config: {},
    subscription_status: 'active',
    current_period_end: PERIOD_END_ISO,
    cancel_at_period_end: false,
    settings: {},
    stripe_customer_id: CUSTOMER_ID,
    stripe_subscription_id: SUBSCRIPTION_ID,
  };
}

/**
 * Chainable service-client `.from()` mock backed by the live `orgRow` store.
 * Supports the shapes the webhook + /api/me use:
 *  - webhook: organizations.select('id').eq('stripe_subscription_id', id).single()
 *             then organizations.update(payload).eq('id', orgId)
 *             plus the cache-bust coaches.select('id').eq('org_id', orgId)
 *  - /api/me: coaches.select(nested organizations).eq('id', user.id).single()
 *             team_coaches.select().eq('coach_id', id)  (resolves to a list)
 */
function makeServiceFrom() {
  return (table: string) => {
    if (table === 'coaches') {
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
      // eq() must be BOTH chainable (→ .single() for /api/me) AND awaitable (→ a list
      // for the webhook's cache-bust coaches.select('id').eq('org_id', orgId)).
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
            return Promise.resolve({ data: null, error: null });
          }
          chain._lookup = { col, val };
          return chain;
        }),
        single: vi.fn(() => {
          const lk = chain._lookup;
          // The webhook looks up the org by stripe_subscription_id (updated path) or by
          // stripe_customer_id (invoice.payment_failed path).
          if (lk && lk.col === 'stripe_subscription_id') {
            return Promise.resolve({
              data:
                orgRow.stripe_subscription_id != null &&
                orgRow.stripe_subscription_id === lk.val
                  ? { id: orgRow.id }
                  : null,
              error: null,
            });
          }
          if (lk && lk.col === 'stripe_customer_id') {
            return Promise.resolve({
              data:
                orgRow.stripe_customer_id != null &&
                orgRow.stripe_customer_id === lk.val
                  ? { id: orgRow.id }
                  : null,
              error: null,
            });
          }
          return Promise.resolve({ data: { id: orgRow.id }, error: null });
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

function sign(payload: string): string {
  return realStripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
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

/**
 * A `customer.subscription.updated` event at the given status. The price item is always
 * the Coach monthly price (Stripe keeps the item on the subscription through retries and
 * even when it lapses to unpaid/canceled), so the only thing that varies is `status`.
 */
function subscriptionUpdatedPayload(status: string, eventId = `evt_${status}_0004`): string {
  return JSON.stringify({
    id: eventId,
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: SUBSCRIPTION_ID,
        status,
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

function setAuth(user: { id: string; email: string } | null) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
}

/** Drive a `customer.subscription.updated` at `status` and assert it succeeds. */
async function fireUpdated(status: string) {
  const payload = subscriptionUpdatedPayload(status);
  const res = await webhook(webhookRequest(payload, sign(payload)));
  expect(res.status).toBe(200);
  return res;
}

/** Read /api/me and return the nested org. The cache is busted in beforeEach. */
async function readOrg() {
  const res = await me();
  return (await res.json()).coach.organizations;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('payment-failure flow — failed payment → past_due → grace → recover/terminate (ticket 0004)', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

    orgRow = freshOrg();
    mockServiceFrom.mockReset();
    mockServiceFrom.mockImplementation(makeServiceFrom());

    setAuth({ id: COACH_ID, email: USER_EMAIL });

    // The per-user /api/me memCache key would otherwise leak state between tests.
    memBust(`me:${COACH_ID}`);

    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // AC1: a customer.subscription.updated {status:'past_due'} sets
  // subscription_status='past_due' while keeping the paid tier (plan) unchanged.
  it('sets subscription_status=past_due and keeps the Coach tier on a past_due update', async () => {
    expect(orgRow.tier).toBe('coach'); // precondition: paying
    expect(orgRow.subscription_status).toBe('active');

    await fireUpdated('past_due');

    expect(orgRow.subscription_status).toBe('past_due');
    expect(orgRow.tier).toBe('coach'); // plan (tier) unchanged through the grace window
  });

  // AC2: after the past_due webhook, GET /api/me returns the past_due status on the org
  // (tier:'coach', subscription_status:'past_due'). The 2-min cache must not mask it.
  it('GET /api/me returns the past_due status (cache not masking)', async () => {
    // Warm the cache with the pre-failure read, as a coach hitting the dashboard would.
    const before = await readOrg();
    expect(before.subscription_status).toBe('active');

    await fireUpdated('past_due');

    const after = await readOrg();
    expect(after.tier).toBe('coach');
    expect(after.subscription_status).toBe('past_due');
  });

  // AC3: canAccess(report_cards) STILL true while past_due + coach (grace window) —
  // paid features stay unlocked during Stripe's retry attempts.
  it('keeps report_cards unlocked while past_due + Coach (grace window)', async () => {
    await fireUpdated('past_due');

    const after = await readOrg();
    expect(after.subscription_status).toBe('past_due');
    const tier = after.tier as Tier;
    expect(tier).toBe('coach');
    expect(canAccess(tier, 'report_cards')).toBe(true);
  });

  // AC4a: canAccess(report_cards) === false after a subsequent update with status:'unpaid'
  // (Stripe's terminal state once retries exhaust) — the webhook flips tier→free.
  it('denies report_cards after the subscription goes unpaid (retries exhausted)', async () => {
    await fireUpdated('past_due');
    await fireUpdated('unpaid');

    const after = await readOrg();
    expect(after.subscription_status).toBe('unpaid');
    const tier = after.tier as Tier;
    expect(tier).toBe('free');
    expect(canAccess(tier, 'report_cards')).toBe(false);
  });

  // AC4b: same terminal behavior for status:'canceled' arriving via subscription.updated.
  it('denies report_cards after the subscription is canceled', async () => {
    await fireUpdated('past_due');
    await fireUpdated('canceled');

    const after = await readOrg();
    expect(after.subscription_status).toBe('canceled');
    const tier = after.tier as Tier;
    expect(tier).toBe('free');
    expect(canAccess(tier, 'report_cards')).toBe(false);
  });

  // AC7: the coach updates their card → Stripe successfully retries → a subsequent
  // customer.subscription.updated {status:'active'} clears the past-due state
  // (subscription_status='active' again, tier still 'coach', gates remain unlocked).
  it('clears past_due back to active when the card is fixed and Stripe retries', async () => {
    await fireUpdated('past_due');
    expect(orgRow.subscription_status).toBe('past_due');

    await fireUpdated('active');

    const after = await readOrg();
    expect(after.subscription_status).toBe('active');
    const tier = after.tier as Tier;
    expect(tier).toBe('coach');
    expect(canAccess(tier, 'report_cards')).toBe(true);
  });

  // Supporting: invoice.payment_failed (Stripe's first decline signal) also sets
  // past_due by customer id, keeping the paid tier — same grace-window contract.
  it('sets past_due via invoice.payment_failed without dropping the tier', async () => {
    const payload = JSON.stringify({
      id: 'evt_invoice_failed_0004',
      type: 'invoice.payment_failed',
      data: { object: { customer: CUSTOMER_ID } },
    });
    const res = await webhook(webhookRequest(payload, sign(payload)));
    expect(res.status).toBe(200);

    expect(orgRow.subscription_status).toBe('past_due');
    expect(orgRow.tier).toBe('coach');
  });
});
