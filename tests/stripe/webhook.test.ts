/**
 * Signature-verification + fail-closed contract for the live Stripe webhook.
 *
 * Implements: docs/backlog/0001-stripe-webhook-signature-verification.md
 *
 * The webhook is the entire trust boundary for billing state — every request must
 * prove it came from Stripe before any `organizations` row is touched. Each test
 * below maps 1:1 to an acceptance-criteria checkbox in ticket 0001.
 *
 * Strategy (mirrors tests/api-routes.test.ts):
 * - The whole `@/lib/supabase/server` module is replaced with a chainable in-memory
 *   mock so we can assert exactly when `.update()` on `organizations` is (not) called.
 * - A real `getStripe()` instance mints valid signatures via
 *   `webhooks.generateTestHeaderString({ payload, secret })`; reject cases pass an
 *   arbitrary signature string.
 *
 * NOTE on filename: the repo's vitest config excludes `**\/*.spec.ts` (those are
 * Playwright e2e files); every executable vitest file is `*.test.ts`. The ticket's
 * engineering note names this `tests/stripe/webhook.spec.ts`, but a `.spec.ts` here
 * would be silently skipped and prove nothing. Named `.test.ts` so it actually gates.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';

// ─── Hoisted Supabase mock ───────────────────────────────────────────────────
// vi.mock() is hoisted; the factory must reference vi.hoisted() values.

const { updateSpy, eqSpy, singleSpy, fromSpy } = vi.hoisted(() => ({
  updateSpy: vi.fn(),
  eqSpy: vi.fn(),
  singleSpy: vi.fn(),
  fromSpy: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(async () => ({ from: fromSpy })),
}));

import { POST } from '@/app/api/stripe/webhook/route';

// ─── Constants ───────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'whsec_test_secret_0001';
// getStripe() reads STRIPE_SECRET_KEY at call time; constructEvent only needs an
// instance, not a live key, so any test value works.
const STRIPE_KEY = 'sk_test_dummy_0001';

/** A real Stripe client used only to mint valid signatures in-test. */
const signer = new Stripe(STRIPE_KEY, { apiVersion: '2026-04-22.dahlia' });

/** Mint a valid `stripe-signature` header for `payload` against `secret`. */
function sign(payload: string, secret = WEBHOOK_SECRET): string {
  return signer.webhooks.generateTestHeaderString({ payload, secret });
}

/** Build a POST Request to the webhook with the given raw body + signature header. */
function makeRequest(body: string, signature?: string): Request {
  const headers: Record<string, string> = {};
  if (signature !== undefined) headers['stripe-signature'] = signature;
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers,
    body,
  });
}

/**
 * Configure the chainable `from()` mock.
 * `orgRow` is what the org lookup `.single()` resolves with (`null` ⇒ unknown).
 */
function setupSupabase(orgRow: { id: string } | null) {
  updateSpy.mockReset();
  eqSpy.mockReset();
  singleSpy.mockReset();
  fromSpy.mockReset();

  singleSpy.mockResolvedValue({ data: orgRow, error: null });

  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: updateSpy.mockReturnThis(),
    eq: eqSpy.mockReturnThis(),
    single: singleSpy,
  };
  fromSpy.mockReturnValue(chain);
}

/** A canonical `customer.subscription.updated` event payload string. */
function subscriptionUpdatedPayload(subId = 'sub_known_0001'): string {
  return JSON.stringify({
    id: 'evt_0001',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: subId,
        status: 'active',
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: { id: 'price_unknown_maps_to_free' },
              current_period_end: 1_900_000_000,
            },
          ],
        },
      },
    },
  });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('POST /api/stripe/webhook — signature verification', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    setupSupabase(null);
    vi.restoreAllMocks();
    // Silence the route's console.error noise on the reject paths.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // AC: missing stripe-signature → 400, no writes.
  it('returns 400 and writes nothing when stripe-signature is missing', async () => {
    const res = await POST(makeRequest(subscriptionUpdatedPayload()));
    expect(res.status).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  // AC: signature that does not validate against the secret → 400, no writes.
  it('returns 400 and writes nothing when the signature does not validate', async () => {
    const res = await POST(
      makeRequest(subscriptionUpdatedPayload(), 't=1,v1=deadbeef')
    );
    expect(res.status).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  // AC: valid signature, known subscription → writes the new tier/status to the row.
  it('updates the matching organizations row on a valid known event', async () => {
    setupSupabase({ id: 'org_known_0001' });
    const payload = subscriptionUpdatedPayload('sub_known_0001');
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const updatePayload = updateSpy.mock.calls[0][0];
    expect(updatePayload).toMatchObject({ subscription_status: 'active' });
  });

  // AC: valid signature, unknown customer/subscription → 200, no writes (idempotent).
  it('returns 200 and writes nothing when no organizations row matches', async () => {
    setupSupabase(null);
    const payload = subscriptionUpdatedPayload('sub_does_not_exist');
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(200);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  // AC: raw body bytes are used for verification — a body whose key order is
  // non-canonical still verifies because the signed bytes match exactly.
  it('verifies against the raw request body, not a re-serialized object', async () => {
    setupSupabase({ id: 'org_known_0001' });
    // Deliberately non-canonical key order; signature is computed over THESE bytes.
    const rawBody =
      '{"type":"customer.subscription.updated","id":"evt_0001",' +
      '"data":{"object":{"status":"active","id":"sub_known_0001",' +
      '"cancel_at_period_end":false,"items":{"data":[{"current_period_end":1900000000,' +
      '"price":{"id":"price_x"}}]}}}}';
    const res = await POST(makeRequest(rawBody, sign(rawBody)));
    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  // AC: STRIPE_WEBHOOK_SECRET unset → fail closed with 503 and exact body, no writes.
  it('returns 503 with the documented body and writes nothing when the secret is unset', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const payload = subscriptionUpdatedPayload();
    // Even a (would-be) valid signature must not be honored when fail-closed.
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: 'webhook secret not configured',
    });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  // AC: the secret is read at request time, not at module load — flipping the env
  // var between requests changes behavior without re-importing the module.
  it('reads STRIPE_WEBHOOK_SECRET at request time (not module-load time)', async () => {
    // First request: secret unset ⇒ 503.
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const unsetRes = await POST(makeRequest(subscriptionUpdatedPayload()));
    expect(unsetRes.status).toBe(503);

    // Second request, same module instance: secret now set ⇒ verification runs.
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    setupSupabase({ id: 'org_known_0001' });
    const payload = subscriptionUpdatedPayload('sub_known_0001');
    const setRes = await POST(makeRequest(payload, sign(payload)));
    expect(setRes.status).toBe(200);
  });
});
