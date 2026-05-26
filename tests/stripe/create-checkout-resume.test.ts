/**
 * Ticket 0035 — the quota-wall "resume after upgrade" value round-trips through
 * Stripe checkout on the create-checkout route.
 *
 * The coach is blocked mid-task (e.g. generating Maya's parent report), taps
 * upgrade, and the blocked action's identity must survive the Stripe redirect so
 * the post-checkout landing can drop them back on the exact artifact. The client
 * passes an opaque `resume` string in the create-checkout body; the route
 * VALIDATES it server-side (allow-list kind + UUID id segments + the coach's own
 * teams/players) and stamps only the validated value onto `success_url`.
 *
 * These specs map 1:1 to the ticket's create-checkout acceptance criteria:
 *  - a provided, VALID resume → its value appears in the generated `success_url`;
 *  - NO resume → the success URL is byte-identical to today's (regression guard);
 *  - an INVALID / cross-org resume → it is dropped; the success URL falls back to
 *    the default (the route never trusts the raw value, never leaks a foreign id).
 *
 * Mocking mirrors tests/stripe/checkout-flow.test.ts (stubbed Stripe + a service
 * client backed by an in-memory org/teams/players store). Filename is `.test.ts`
 * (vitest.config excludes the spec glob — docs/LESSONS.md 2026-05-20).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetUser,
  mockServiceFrom,
  mockCheckoutCreate,
  COACH_PRICE_MONTHLY,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockServiceFrom: vi.fn(),
  mockCheckoutCreate: vi.fn(),
  COACH_PRICE_MONTHLY: 'price_coach_monthly_0035',
}));

vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
  return {
    ...actual,
    getStripe: () => ({
      checkout: { sessions: { create: mockCheckoutCreate } },
    }),
    // PRICE_IDS freezes from env at module load before our setup runs; map
    // tier↔price deterministically so the route's real getPriceId is exercised.
    getPriceId: (tier: string, interval: string) =>
      tier === 'coach' && interval === 'monthly' ? COACH_PRICE_MONTHLY : '',
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockServiceFrom })),
}));

import { POST as createCheckout } from '@/app/api/stripe/create-checkout/route';

const ORG_ID = '00000000-0000-4000-a000-000000000010';
const COACH_ID = '00000000-0000-4000-a000-000000000001';
const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const PLAYER_ID = '00000000-0000-4000-a000-000000000030';
const FOREIGN_TEAM = '11111111-1111-4111-a111-111111111111';
const FOREIGN_PLAYER = '22222222-2222-4222-a222-222222222222';
const CUSTOMER_ID = 'cus_resume_0035';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * Service-client `.from()` mock. Supports the create-checkout reads:
 *  - coaches.select('org_id').eq('id').single()
 *  - organizations.select(...).eq('id').single()
 *  - teams.select('id').eq('org_id')           → the coach's owned teams (awaited)
 *  - players.select('id, team_id').in('team_id', [...]) → the coach's owned players
 */
function makeServiceFrom() {
  return (table: string) => {
    if (table === 'coaches') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { org_id: ORG_ID }, error: null }),
      };
    }
    if (table === 'organizations') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: ORG_ID,
            stripe_customer_id: CUSTOMER_ID,
            name: 'E2E Test Org',
            subscription_status: null,
          },
          error: null,
        }),
      };
    }
    if (table === 'teams') {
      // ownership read: select('id').eq('org_id', orgId) — awaited directly.
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [{ id: TEAM_ID }], error: null }),
      };
    }
    if (table === 'players') {
      // ownership read: select('id, team_id').in('team_id', [...]) — awaited directly.
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [{ id: PLAYER_ID, team_id: TEAM_ID }],
          error: null,
        }),
        eq: vi.fn().mockResolvedValue({
          data: [{ id: PLAYER_ID, team_id: TEAM_ID }],
          error: null,
        }),
      };
      return builder;
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  };
}

function checkoutRequest(body: unknown): Request {
  return new Request('http://localhost/api/stripe/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Pull the success_url passed to the stubbed checkout session create. */
function successUrlFromCall(): string {
  expect(mockCheckoutCreate).toHaveBeenCalledTimes(1);
  return mockCheckoutCreate.mock.calls[0][0].success_url as string;
}

describe('create-checkout resume round-trip (ticket 0035)', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_0035';
    mockServiceFrom.mockReset();
    mockServiceFrom.mockImplementation(makeServiceFrom());
    mockCheckoutCreate.mockReset();
    mockCheckoutCreate.mockResolvedValue({
      id: 'cs_test_0035',
      url: 'https://checkout.stripe.com/c/pay/cs_test_0035',
    });
    mockGetUser.mockResolvedValue({
      data: { user: { id: COACH_ID, email: 'e2e@test.com' } },
      error: null,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // AC: a provided, valid resume is stamped into success_url so it survives the redirect.
  it('stamps a VALID parent_report resume onto success_url', async () => {
    const resume = `parent_report:${TEAM_ID}:${PLAYER_ID}`;
    const res = await createCheckout(
      checkoutRequest({ tier: 'coach', interval: 'monthly', resume })
    );
    expect(res.status).toBe(200);
    const url = successUrlFromCall();
    const parsed = new URL(url);
    // The validated resume rides the redirect URL as a query param.
    expect(parsed.searchParams.get('resume')).toBe(resume);
    // The success marker the upgrade page already keys on is still present.
    expect(parsed.searchParams.get('success')).toBe('true');
  });

  it('stamps a VALID team-scoped practice_plan resume onto success_url', async () => {
    const resume = `practice_plan:${TEAM_ID}`;
    const res = await createCheckout(
      checkoutRequest({ tier: 'coach', interval: 'monthly', resume })
    );
    expect(res.status).toBe(200);
    expect(new URL(successUrlFromCall()).searchParams.get('resume')).toBe(resume);
  });

  // AC: absent resume → the success URL is byte-identical to today's behavior.
  it('leaves success_url unchanged from today when NO resume is provided', async () => {
    const res = await createCheckout(checkoutRequest({ tier: 'coach', interval: 'monthly' }));
    expect(res.status).toBe(200);
    const url = successUrlFromCall();
    // Today's exact success URL (no resume param), proving the round-trip is opt-in.
    expect(url).toBe(`${APP_URL}/settings/upgrade?success=true`);
    expect(new URL(url).searchParams.has('resume')).toBe(false);
  });

  // AC: an invalid resume is dropped — never trusted, never stamped.
  it('drops an UNKNOWN-kind resume and falls back to the default success_url', async () => {
    const res = await createCheckout(
      checkoutRequest({ tier: 'coach', interval: 'monthly', resume: `steal_data:${TEAM_ID}` })
    );
    expect(res.status).toBe(200);
    const url = successUrlFromCall();
    expect(url).toBe(`${APP_URL}/settings/upgrade?success=true`);
    expect(new URL(url).searchParams.has('resume')).toBe(false);
  });

  it('drops a cross-org resume (foreign teamId) and falls back to default', async () => {
    const res = await createCheckout(
      checkoutRequest({
        tier: 'coach',
        interval: 'monthly',
        resume: `practice_plan:${FOREIGN_TEAM}`,
      })
    );
    expect(res.status).toBe(200);
    expect(new URL(successUrlFromCall()).searchParams.has('resume')).toBe(false);
  });

  it('drops a cross-org resume (foreign playerId) and falls back to default', async () => {
    const res = await createCheckout(
      checkoutRequest({
        tier: 'coach',
        interval: 'monthly',
        resume: `parent_report:${TEAM_ID}:${FOREIGN_PLAYER}`,
      })
    );
    expect(res.status).toBe(200);
    expect(new URL(successUrlFromCall()).searchParams.has('resume')).toBe(false);
  });

  it('drops a malformed (non-UUID) resume and falls back to default', async () => {
    const res = await createCheckout(
      checkoutRequest({ tier: 'coach', interval: 'monthly', resume: 'parent_report:nope:nope' })
    );
    expect(res.status).toBe(200);
    expect(new URL(successUrlFromCall()).searchParams.has('resume')).toBe(false);
  });

  // The cancel_url is unaffected by resume in every case — the cancel path returns
  // the coach to the blocked surface unchanged (no resume leakage into cancel).
  it('never stamps resume onto cancel_url', async () => {
    await createCheckout(
      checkoutRequest({
        tier: 'coach',
        interval: 'monthly',
        resume: `parent_report:${TEAM_ID}:${PLAYER_ID}`,
      })
    );
    const cancelUrl = mockCheckoutCreate.mock.calls[0][0].cancel_url as string;
    expect(cancelUrl).toBe(`${APP_URL}/settings/upgrade?canceled=true`);
    expect(new URL(cancelUrl).searchParams.has('resume')).toBe(false);
  });
});
