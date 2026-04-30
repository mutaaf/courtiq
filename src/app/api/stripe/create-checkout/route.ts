import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { getStripe, getPriceId, type PaidTier, type BillingInterval } from '@/lib/stripe';

// Bump the function timeout — Stripe's default SDK timeout is 80s and some
// cold-start round trips can take >10s.
export const maxDuration = 30;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tier, interval } = (await request.json()) as {
      tier: PaidTier;
      interval: BillingInterval;
    };

    if (!tier || !interval) {
      return NextResponse.json({ error: 'Missing tier or interval' }, { status: 400 });
    }

    const validTiers: PaidTier[] = ['coach', 'pro_coach', 'organization'];
    const validIntervals: BillingInterval[] = ['monthly', 'annual'];
    if (!validTiers.includes(tier) || !validIntervals.includes(interval)) {
      return NextResponse.json({ error: 'Invalid tier or interval' }, { status: 400 });
    }

    const admin = await createServiceSupabase();

    // Get coach and org
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!coach) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    const { data: org } = await admin
      .from('organizations')
      .select('id, stripe_customer_id, stripe_subscription_id, name')
      .eq('id', coach.org_id)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Create or reuse Stripe customer
    let stripeCustomerId = org.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        name: org.name || undefined,
        metadata: { org_id: org.id, user_id: user.id },
      });
      stripeCustomerId = customer.id;

      await admin
        .from('organizations')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', org.id);
    }

    // Trials disabled — issuer banks aggressively decline SetupIntents to
    // brand-new merchants, especially via Link saved cards. Immediate-charge
    // subscriptions use PaymentIntent instead, which goes through cleanly.
    // Re-enable by setting STRIPE_TRIAL_DAYS > 0 once we have transaction
    // history with real customers.
    const trialDays = Number(process.env.STRIPE_TRIAL_DAYS ?? 0);

    // Stripe Tax is opt-in via env. When the live account doesn't have Tax
    // registrations yet, passing automatic_tax / customer_update / tax_id
    // makes Stripe reject the call. Flip STRIPE_TAX_ENABLED=true once the
    // account is registered (see docs/OPS.md).
    const taxEnabled = process.env.STRIPE_TAX_ENABLED === 'true';

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      // Let Stripe Checkout auto-detect supported payment methods. With trials
      // disabled this routes through PaymentIntent (immediate charge) which
      // doesn't trigger the issuer-side SetupIntent decline pattern.
      line_items: [{ price: getPriceId(tier, interval), quantity: 1 }],
      success_url: `${APP_URL}/settings/upgrade?success=true`,
      cancel_url: `${APP_URL}/settings/upgrade?canceled=true`,
      allow_promotion_codes: true,
      ...(taxEnabled
        ? {
            automatic_tax: { enabled: true },
            // Stripe Tax requires an address; let the checkout collect it.
            customer_update: { address: 'auto', name: 'auto' },
            tax_id_collection: { enabled: true },
          }
        : {}),
      ...(trialDays > 0
        ? {
            subscription_data: {
              trial_period_days: trialDays,
              // Cancel the subscription instead of charging if the customer
              // never adds a payment method during the trial.
              trial_settings: {
                end_behavior: { missing_payment_method: 'cancel' },
              },
            },
          }
        : {}),
      metadata: { org_id: org.id, tier },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const e = error as any;
    const detail = {
      message: e?.message ?? 'Unknown error',
      type: e?.type ?? null,
      code: e?.code ?? null,
      statusCode: e?.statusCode ?? null,
      requestId: e?.requestId ?? null,
      cause: e?.cause?.message ?? null,
      detail: e?.detail ?? null,
    };
    console.error('[stripe/create-checkout] Error detail:', JSON.stringify(detail));
    return NextResponse.json(
      { error: detail.message, debug: detail },
      { status: 500 }
    );
  }
}
