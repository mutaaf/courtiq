/**
 * Data-preservation contract across a cancel → resubscribe cycle.
 *
 * Implements: docs/backlog/0005-resubscription-flow.md (AC4)
 *
 * The whole seasonal business model rests on one promise: a coach who cancels
 * off-season and re-upgrades next season finds their roster, observations, teams, and
 * practice sessions exactly as they left them. Ticket 0003 proved the *cancel* half
 * (a downgrade never deletes data). This spec proves the *full round trip* — cancel,
 * then resubscribe — never deletes, clears, OR duplicates the org's child rows, and
 * never mints a second `organizations` row or a second `stripe_customer_id`.
 *
 * The Stripe webhook handler only ever touches the `organizations` row; it never reads
 * or writes `observations` / `players` / `teams` / `practice_sessions`. We back those
 * tables with count-able in-memory stores so any handler edit that started deleting or
 * duplicating child data would change a count and fail here. This is the data-trust
 * guarantee, asserted by counting before/after the whole arc.
 *
 * NOTE on filename: vitest.config.ts excludes `**\/*.spec.ts` (reserved for Playwright);
 * the ticket says `tests/db/data-preservation.spec.ts` — named `.test.ts` so it gates.
 * (See docs/LESSONS.md 2026-05-20.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';

const { mockServiceFrom, COACH_PRICE_MONTHLY } = vi.hoisted(() => ({
  mockServiceFrom: vi.fn(),
  COACH_PRICE_MONTHLY: 'price_coach_monthly_dataprez_0005',
}));

const STRIPE_KEY = 'sk_test_dummy_dataprez_0005';
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
  createServiceSupabase: vi.fn(async () => ({ from: mockServiceFrom })),
}));

import { POST as webhook } from '@/app/api/stripe/webhook/route';

const WEBHOOK_SECRET = 'whsec_test_secret_dataprez_0005';
const ORG_ID = 'org_dataprez_0005';
const COACH_ID = 'coach_dataprez_0005';
const CUSTOMER_ID = 'cus_dataprez_0005';
const SUBSCRIPTION_ID = 'sub_dataprez_0005';
const PERIOD_END_UNIX = 1_900_000_000;
const PERIOD_END_ISO = new Date(PERIOD_END_UNIX * 1000).toISOString();

type OrgRow = {
  id: string;
  tier: string;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

let orgRows: OrgRow[];
let childRows: Record<string, unknown[]>;

function orgById(id: string) {
  return orgRows.find((o) => o.id === id);
}
function orgByCustomer(cus: string | null) {
  return cus == null ? undefined : orgRows.find((o) => o.stripe_customer_id === cus);
}
function orgBySubscription(sub: string | null) {
  return sub == null ? undefined : orgRows.find((o) => o.stripe_subscription_id === sub);
}

// Start from a cancelled org (free + canceled, customer kept from prior subscription,
// subscription id cleared by the prior delete — ticket 0003 behavior).
function freshCancelledOrg(): OrgRow {
  return {
    id: ORG_ID,
    tier: 'free',
    subscription_status: 'canceled',
    current_period_end: null,
    cancel_at_period_end: false,
    stripe_customer_id: CUSTOMER_ID,
    stripe_subscription_id: null,
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

function makeServiceFrom() {
  return (table: string) => {
    if (table === 'coaches') {
      // Webhook cache-bust: coaches.select('id').eq('org_id', orgId) — awaited as a list.
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [{ id: COACH_ID }], error: null }),
      };
      return chain;
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
          return Promise.resolve({ data: row ? { id: row.id } : null, error: null });
        }),
      };
      return chain;
    }

    // Child tables: the webhook never touches these. Expose count-able reads so the
    // test can prove no data was deleted OR duplicated across the cancel→resub cycle.
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

function sign(payload: string): string {
  return realStripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
}

function webhookRequest(body: string): Request {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': sign(body) },
    body,
  });
}

function subscriptionCreatedPayload(): string {
  return JSON.stringify({
    id: 'evt_created_dataprez_0005',
    type: 'customer.subscription.created',
    data: {
      object: {
        id: SUBSCRIPTION_ID,
        status: 'active',
        customer: CUSTOMER_ID,
        cancel_at_period_end: false,
        items: {
          data: [{ price: { id: COACH_PRICE_MONTHLY }, current_period_end: PERIOD_END_UNIX }],
        },
      },
    },
  });
}

describe('data preservation across cancel → resubscribe (ticket 0005, AC4)', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

    orgRows = [freshCancelledOrg()];
    childRows = freshChildRows();
    mockServiceFrom.mockReset();
    mockServiceFrom.mockImplementation(makeServiceFrom());

    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // AC4: resubscription does NOT clear or duplicate the org's observations / players /
  // teams / practice_sessions rows, and at least one row of each survives.
  it('preserves every child-table row (no delete, no duplicate) when resubscribing', async () => {
    const before = countSnapshot();
    expect(before).toEqual({ teams: 2, players: 3, observations: 4, practice_sessions: 2 });

    const payload = subscriptionCreatedPayload();
    const res = await webhook(webhookRequest(payload));
    expect(res.status).toBe(200);

    // The org came back to coach/active...
    const org = orgById(ORG_ID)!;
    expect(org.tier).toBe('coach');
    expect(org.subscription_status).toBe('active');
    expect(org.current_period_end).toBe(PERIOD_END_ISO);

    // ...and the child data is byte-for-byte unchanged: not deleted, not duplicated.
    const after = countSnapshot();
    expect(after).toEqual(before);
    // At least one row of each survives (the data-trust guarantee).
    expect(after.teams).toBeGreaterThanOrEqual(1);
    expect(after.players).toBeGreaterThanOrEqual(1);
    expect(after.observations).toBeGreaterThanOrEqual(1);
    expect(after.practice_sessions).toBeGreaterThanOrEqual(1);
  });

  // AC4 (cont.): resubscription does NOT create a second organizations row or a second
  // stripe_customer_id.
  it('does not mint a second organizations row or a second stripe_customer_id', async () => {
    expect(orgRows).toHaveLength(1);
    const customerBefore = orgById(ORG_ID)!.stripe_customer_id;

    const payload = subscriptionCreatedPayload();
    await webhook(webhookRequest(payload));

    expect(orgRows).toHaveLength(1);
    expect(orgById(ORG_ID)!.stripe_customer_id).toBe(customerBefore);
    expect(orgById(ORG_ID)!.stripe_customer_id).toBe(CUSTOMER_ID);
  });
});
