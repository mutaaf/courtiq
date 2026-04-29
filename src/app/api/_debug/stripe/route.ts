/**
 * Temporary debug endpoint — DELETE AFTER DIAGNOSING THE LIVE CHECKOUT BUG.
 *
 * Walks Stripe through three escalating calls (read-only balance, then
 * customer create, then checkout.session.create) and returns each step's
 * outcome with full error metadata. Lets us pinpoint exactly which call
 * fails on Vercel's runtime when local execution succeeds.
 *
 * Auth-gated by a simple shared secret in the URL so it isn't an open
 * key-leak vector. Set DEBUG_TOKEN in Vercel env, hit:
 *   /api/_debug/stripe?token=<DEBUG_TOKEN>
 */

import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token || token !== process.env.DEBUG_TOKEN) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const steps: any[] = [];
  const captureError = (e: any) => ({
    message: e?.message ?? String(e),
    type: e?.type ?? null,
    code: e?.code ?? null,
    statusCode: e?.statusCode ?? null,
    requestId: e?.requestId ?? null,
    cause: e?.cause?.message ?? null,
    detail: e?.detail ?? null,
    stack: (e?.stack ?? '').split('\n').slice(0, 5),
  });

  // Step 0: env sanity
  const skKey = process.env.STRIPE_SECRET_KEY ?? '';
  steps.push({
    step: 'env',
    secret_key_prefix: skKey.slice(0, 8),
    secret_key_is_live: skKey.startsWith('sk_live_'),
    secret_key_length: skKey.length,
    has_anon_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    coach_monthly: (process.env.STRIPE_PRICE_COACH_MONTHLY ?? '').slice(0, 10),
    pro_monthly: (process.env.STRIPE_PRICE_PRO_MONTHLY ?? '').slice(0, 10),
  });

  // Step 1: balance.retrieve (read-only, should always work)
  try {
    const t0 = Date.now();
    const balance = await getStripe().balance.retrieve();
    steps.push({
      step: 'balance.retrieve',
      ok: true,
      ms: Date.now() - t0,
      currencies: balance.available?.length ?? 0,
    });
  } catch (e) {
    steps.push({ step: 'balance.retrieve', ok: false, error: captureError(e) });
    return NextResponse.json({ steps }, { status: 200 });
  }

  // Step 2: customer create
  let customerId: string | null = null;
  try {
    const t0 = Date.now();
    const customer = await getStripe().customers.create({
      email: 'debug@youthsportsiq.com',
      metadata: { source: 'debug-endpoint', ts: String(Date.now()) },
    });
    customerId = customer.id;
    steps.push({ step: 'customer.create', ok: true, ms: Date.now() - t0, id: customer.id });
  } catch (e) {
    steps.push({ step: 'customer.create', ok: false, error: captureError(e) });
    return NextResponse.json({ steps }, { status: 200 });
  }

  // Step 3: checkout.sessions.create (the actual failing call in prod)
  try {
    const t0 = Date.now();
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_COACH_MONTHLY!,
          quantity: 1,
        },
      ],
      success_url: 'https://youthsportsiq.com/settings/upgrade?success=true',
      cancel_url: 'https://youthsportsiq.com/settings/upgrade?canceled=true',
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 14,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      },
      metadata: { org_id: 'debug-org', tier: 'coach' },
    });
    steps.push({
      step: 'checkout.sessions.create',
      ok: true,
      ms: Date.now() - t0,
      id: session.id,
    });
  } catch (e) {
    steps.push({ step: 'checkout.sessions.create', ok: false, error: captureError(e) });
  }

  // Cleanup the debug customer so we don't leak fixtures into the live data
  if (customerId) {
    try {
      await getStripe().customers.del(customerId);
    } catch {}
  }

  return NextResponse.json({ steps });
}
