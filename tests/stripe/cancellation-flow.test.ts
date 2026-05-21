/**
 * Cancellation flow contract: cancel → webhook → downgrade at period end.
 *
 * Implements: docs/backlog/0003-cancellation-flow-test.md
 *
 * Cancellation is the second-most-important Stripe flow after checkout, and the
 * one where trust is built or broken: "did they take my data when I cancelled?".
 * Today's behavior is correct (cancel-at-period-end keeps features unlocked + shows a
 * banner; `customer.subscription.deleted` downgrades to free WITHOUT deleting data),
 * but it had no test coverage — one handler edit could silently delete a paying
 * coach's data. This spec locks the two-event arc in. Each test maps 1:1 to an
 * acceptance-criteria checkbox in ticket 0003.
 *
 * Reconciliations between the ticket's groomer-shorthand and the real code (also in the
 * ticket's Implementation log):
 *  - The canonical column is `organizations.tier`, NOT `plan`. The webhook writes `tier`;
 *    `/api/me` selects `tier`. We assert on `tier`.
 *  - `canAccess(tier, feature)` takes a Tier *string*, not an orgId. We drive it with the
 *    tier produced by the live chain (the org row the webhook mutated, surfaced by
 *    /api/me), honoring the AC: report_cards stays granted while active+cancel-at-period-end
 *    and is denied once downgraded to free.
 *  - The `customer.subscription.deleted` branch also nulls `stripe_subscription_id` (the real
 *    handler does this) — which is what makes a replay idempotent: the second delivery's
 *    lookup by subscription id no longer matches, so it writes nothing.
 *
 * NOTE on filename: vitest.config.ts excludes `**\/*.spec.ts` (reserved for Playwright),
 * so a `.spec.ts` here would be silently skipped and prove nothing. The ticket's
 * engineering note says `tests/stripe/cancellation-flow.spec.ts`; named `.test.ts` so it
 * actually gates. (See docs/LESSONS.md 2026-05-20.) Mirrors the 0001/0002 mock pattern.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────
// vi.mock() factories are hoisted, so everything they reference (the price-id
// constant used by the @/lib/stripe mock) must come from vi.hoisted().

const { mockGetUser, mockServiceFrom, COACH_PRICE_MONTHLY } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockServiceFrom: vi.fn(),
  COACH_PRICE_MONTHLY: 'price_coach_monthly_0003',
}));

// One Stripe instance: used by the route via webhooks.constructEvent (real signature
// verification) and in-test to mint valid signatures via generateTestHeaderString.
const STRIPE_KEY = 'sk_test_dummy_0003';
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

const WEBHOOK_SECRET = 'whsec_test_secret_0003';
const ORG_ID = 'org_cancel_0003';
const COACH_ID = 'coach_cancel_0003';
const CUSTOMER_ID = 'cus_cancel_0003';
const SUBSCRIPTION_ID = 'sub_cancel_0003';
const USER_EMAIL = 'coach@example.com';
// A fixed UNIX seconds value for current_period_end so the ISO assertion is exact.
const PERIOD_END_UNIX = 1_900_000_000;
const PERIOD_END_ISO = new Date(PERIOD_END_UNIX * 1000).toISOString();

// ─── Stateful in-memory store ──────────────────────────────────────────────────
// The point of this spec is that the webhook's write is the SAME row the later
// /api/me read sees, AND that a downgrade never touches the child tables. We back the
// service-client mock with a real org object plus per-table row counts so data
// preservation is assertable by counting before/after.

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

// Child-table row stores keyed by org. The webhook never reads/writes these, so they
// stand in for "all the coach's data" — if a downgrade nuked anything, these counts
// would change. Seeded with representative rows.
let childRows: Record<string, unknown[]>;

function freshOrg(): OrgRow {
  return {
    id: ORG_ID,
    name: 'Eastside Eagles',
    slug: 'eastside-eagles',
    tier: 'coach', // already paying — this ticket starts from an active subscription
    sport_config: {},
    subscription_status: 'active',
    current_period_end: PERIOD_END_ISO,
    cancel_at_period_end: false,
    settings: {},
    stripe_customer_id: CUSTOMER_ID,
    stripe_subscription_id: SUBSCRIPTION_ID,
  };
}

function freshChildRows(): Record<string, unknown[]> {
  return {
    teams: [{ id: 't1', org_id: ORG_ID }, { id: 't2', org_id: ORG_ID }],
    players: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
    observations: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }, { id: 'o4' }],
    practice_sessions: [{ id: 's1' }, { id: 's2' }],
  };
}

function countSnapshot() {
  return {
    teams: childRows.teams.length,
    players: childRows.players.length,
    observations: childRows.observations.length,
    practice_sessions: childRows.practice_sessions.length,
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
          // The webhook looks up the org by stripe_subscription_id. After a delete
          // nulls that column, a replay's lookup must NOT match (idempotency).
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
          return Promise.resolve({ data: { id: orgRow.id }, error: null });
        }),
      };
      return chain;
    }

    // Child tables — the webhook never touches these; expose a count-able read so the
    // test can assert no data was deleted on downgrade.
    if (childRows[table]) {
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: childRows[table], error: null }),
      };
      return builder;
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

/** A `customer.subscription.updated` event flagged cancel-at-period-end (still active). */
function subscriptionUpdatedCancelAtPeriodEnd(): string {
  return JSON.stringify({
    id: 'evt_updated_cancel_0003',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: SUBSCRIPTION_ID,
        status: 'active',
        customer: CUSTOMER_ID,
        cancel_at_period_end: true,
        items: {
          data: [
            { price: { id: COACH_PRICE_MONTHLY }, current_period_end: PERIOD_END_UNIX },
          ],
        },
      },
    },
  });
}

/** A `customer.subscription.deleted` event — the period actually ended. */
function subscriptionDeletedPayload(eventId = 'evt_deleted_0003'): string {
  return JSON.stringify({
    id: eventId,
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

function setAuth(user: { id: string; email: string } | null) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
}

// Drive the cancel-at-period-end webhook and assert it succeeds.
async function fireCancelAtPeriodEnd() {
  const payload = subscriptionUpdatedCancelAtPeriodEnd();
  const res = await webhook(webhookRequest(payload, sign(payload)));
  expect(res.status).toBe(200);
  return res;
}

// Drive the deletion webhook and assert it succeeds.
async function fireDeletion(eventId?: string) {
  const payload = subscriptionDeletedPayload(eventId);
  const res = await webhook(webhookRequest(payload, sign(payload)));
  expect(res.status).toBe(200);
  return res;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('cancellation flow — cancel → webhook → downgrade at period end (ticket 0003)', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

    orgRow = freshOrg();
    childRows = freshChildRows();
    mockServiceFrom.mockReset();
    mockServiceFrom.mockImplementation(makeServiceFrom());

    setAuth({ id: COACH_ID, email: USER_EMAIL });

    // The per-user /api/me memCache key would otherwise leak state between tests.
    memBust(`me:${COACH_ID}`);

    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // AC1: customer.subscription.updated {cancel_at_period_end:true, status:'active'}
  // sets cancel_at_period_end=true + current_period_end=<event value>, keeps tier
  // unchanged and subscription_status='active'.
  it('flags cancel-at-period-end without changing tier or status on subscription.updated', async () => {
    expect(orgRow.tier).toBe('coach'); // precondition: paying
    expect(orgRow.cancel_at_period_end).toBe(false);

    await fireCancelAtPeriodEnd();

    expect(orgRow.cancel_at_period_end).toBe(true);
    expect(orgRow.current_period_end).toBe(PERIOD_END_ISO);
    expect(orgRow.tier).toBe('coach'); // tier unchanged
    expect(orgRow.subscription_status).toBe('active'); // still active
  });

  // AC2: after that webhook, GET /api/me surfaces the cancel-at-period-end state on the
  // org (tier:'coach', subscription_status:'active', cancel_at_period_end:true,
  // current_period_end:<ISO date>). The 2-min cache must not mask it.
  it('GET /api/me reflects the cancel-at-period-end state (cache not masking)', async () => {
    // Warm the cache with the pre-cancel read, as a coach hitting the dashboard would.
    const before = await me();
    expect((await before.json()).coach.organizations.cancel_at_period_end).toBe(false);

    await fireCancelAtPeriodEnd();

    const after = await me();
    const org = (await after.json()).coach.organizations;
    expect(org.tier).toBe('coach');
    expect(org.subscription_status).toBe('active');
    expect(org.cancel_at_period_end).toBe(true);
    expect(org.current_period_end).toBe(PERIOD_END_ISO);
  });

  // AC3: canAccess stays true for report_cards while cancel_at_period_end + active.
  it('keeps report_cards unlocked while cancel-at-period-end + active', async () => {
    await fireCancelAtPeriodEnd();

    const after = await me();
    const tier = (await after.json()).coach.organizations.tier as Tier;
    expect(tier).toBe('coach');
    expect(canAccess(tier, 'report_cards')).toBe(true);
  });

  // AC4: a subsequent customer.subscription.deleted downgrades to free
  // (tier='free', subscription_status='canceled', cancel_at_period_end=false) AND keeps
  // every related row intact (assertable by counting before/after).
  it('downgrades to free on subscription.deleted WITHOUT deleting any data', async () => {
    await fireCancelAtPeriodEnd();
    const countsBefore = countSnapshot();

    await fireDeletion();

    expect(orgRow.tier).toBe('free');
    expect(orgRow.subscription_status).toBe('canceled');
    expect(orgRow.cancel_at_period_end).toBe(false);

    // Data preservation: every child-table count is unchanged.
    expect(countSnapshot()).toEqual(countsBefore);
    expect(countsBefore).toEqual({
      teams: 2,
      players: 3,
      observations: 4,
      practice_sessions: 2,
    });
  });

  // AC5: after the deletion webhook, canAccess(report_cards) flips to false.
  it('denies report_cards after downgrade to free (gate flips at period end)', async () => {
    await fireCancelAtPeriodEnd();
    await fireDeletion();

    const after = await me();
    const tier = (await after.json()).coach.organizations.tier as Tier;
    expect(tier).toBe('free');
    expect(canAccess(tier, 'report_cards')).toBe(false);
  });

  // AC7: idempotency — replaying the same customer.subscription.deleted event does not
  // error and does not change any rows beyond what the first delivery did.
  it('is idempotent: replaying subscription.deleted does not error or re-mutate', async () => {
    await fireCancelAtPeriodEnd();
    await fireDeletion('evt_deleted_0003');

    // Snapshot the post-first-delivery state.
    const orgAfterFirst = { ...orgRow };
    const countsAfterFirst = countSnapshot();

    // Replay the EXACT same deletion event. The first delivery nulled
    // stripe_subscription_id, so the lookup no longer matches → no second mutation.
    const replay = await fireDeletion('evt_deleted_0003');
    expect(replay.status).toBe(200);

    expect(orgRow).toEqual(orgAfterFirst);
    expect(countSnapshot()).toEqual(countsAfterFirst);
    expect(orgRow.stripe_subscription_id).toBeNull();
  });
});
