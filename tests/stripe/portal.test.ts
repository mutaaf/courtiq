/**
 * Billing Portal route contract: authed coach with a Stripe customer → { url }.
 *
 * Implements: docs/backlog/0004-payment-failure-handling.md (AC8)
 *
 * The past-due banner's only escape hatch is the Billing Portal: one tap to update the
 * declined card. The CTA POSTs to /api/stripe/portal and the route must return a
 * `{ url }` pointing at billing.stripe.com for the authenticated coach (and refuse
 * cleanly when there's no auth or no Stripe customer). A regression here strands every
 * past-due coach with no way to recover — the exact churn this ticket prevents.
 *
 * NOTE on filename: vitest.config.ts excludes `**\/*.spec.ts` (reserved for Playwright);
 * the ticket says `tests/stripe/portal.spec.ts`. Named `.test.ts` so it actually gates.
 * (See docs/LESSONS.md 2026-05-20.) Mirrors the 0002/0003 mock pattern.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockGetUser, mockServiceFrom, mockPortalCreate } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockServiceFrom: vi.fn(),
  mockPortalCreate: vi.fn(),
}));

vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
  return {
    ...actual,
    // The portal route calls getStripe().billingPortal.sessions.create — stub the
    // network call; everything else (auth + org lookup) runs for real against the mock.
    getStripe: () => ({
      billingPortal: { sessions: { create: mockPortalCreate } },
    }),
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockServiceFrom })),
}));

import { POST as portal } from '@/app/api/stripe/portal/route';

// ─── Constants ───────────────────────────────────────────────────────────────

const ORG_ID = 'org_portal_0004';
const COACH_ID = 'coach_portal_0004';
const CUSTOMER_ID = 'cus_portal_0004';
const USER_EMAIL = 'coach@example.com';
const PORTAL_URL = 'https://billing.stripe.com/p/session/test_0004';

// ─── In-memory store ───────────────────────────────────────────────────────────
// `customerId` null ⇒ the org has no Stripe customer (never paid), which the route must
// reject; otherwise the route resolves coach → org → customer and mints a portal session.

let customerId: string | null;

function makeServiceFrom() {
  return (table: string) => {
    if (table === 'coaches') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { org_id: ORG_ID },
          error: null,
        }),
      };
    }
    if (table === 'organizations') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { stripe_customer_id: customerId },
          error: null,
        }),
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  };
}

function setAuth(user: { id: string; email: string } | null) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('POST /api/stripe/portal — Billing Portal session (ticket 0004, AC8)', () => {
  beforeEach(() => {
    customerId = CUSTOMER_ID;
    mockServiceFrom.mockReset();
    mockServiceFrom.mockImplementation(makeServiceFrom());

    mockPortalCreate.mockReset();
    mockPortalCreate.mockResolvedValue({ url: PORTAL_URL });

    setAuth({ id: COACH_ID, email: USER_EMAIL });

    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // AC8: an authenticated coach with a stripe_customer_id gets a { url } pointing at
  // billing.stripe.com — exactly what the banner CTA needs to redirect to.
  it('returns { url } to billing.stripe.com for an authed coach with a customer id', async () => {
    const res = await portal();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.url).toBe('string');
    expect(new URL(body.url).hostname).toBe('billing.stripe.com');

    // The session was minted against the org's Stripe customer.
    expect(mockPortalCreate).toHaveBeenCalledTimes(1);
    expect(mockPortalCreate.mock.calls[0][0]).toMatchObject({ customer: CUSTOMER_ID });
  });

  // Auth boundary: no signed-in user → 401, no portal session minted.
  it('returns 401 and mints no portal session when unauthenticated', async () => {
    setAuth(null);
    const res = await portal();
    expect(res.status).toBe(401);
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  // No Stripe customer (org never paid) → the route refuses rather than 500ing, and no
  // portal session is created.
  it('refuses (4xx) and mints no portal session when the org has no Stripe customer', async () => {
    customerId = null;
    const res = await portal();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });
});
