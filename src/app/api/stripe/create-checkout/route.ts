import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { getStripe, getPriceId, type PaidTier, type BillingInterval } from '@/lib/stripe';

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
      .select('id, stripe_customer_id, name, subscription_status')
      .eq('id', coach.org_id)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Resubscription guard: a coach whose prior subscription is still `past_due` has an
    // unpaid balance Stripe must collect before opening a new subscription — Stripe
    // refuses to create a second sub on an unpaid customer, so fail fast with a clear
    // 409 toward the Billing Portal instead of bubbling a Stripe error. (ticket 0005)
    if (org.subscription_status === 'past_due') {
      return NextResponse.json(
        {
          error:
            'Your previous payment is still past due. Open the Billing Portal to update your card and settle the balance before resubscribing.',
        },
        { status: 409 }
      );
    }

    // Reuse the existing Stripe customer when the org already has one (the common
    // resubscription path — the customer id survives cancellation, so we never mint a
    // duplicate that would orphan billing history). When the org has no customer yet,
    // hand Stripe Checkout the email and let it create the customer; the
    // `customer.subscription.created` webhook persists the new id back to the org.
    // (ticket 0005)
    const stripeCustomerId = org.stripe_customer_id;
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      ...(stripeCustomerId
        ? { customer: stripeCustomerId }
        : { customer_email: user.email }),
      line_items: [{ price: getPriceId(tier, interval), quantity: 1 }],
      success_url: `${APP_URL}/settings/upgrade?success=true`,
      cancel_url: `${APP_URL}/settings/upgrade?canceled=true`,
      allow_promotion_codes: true,
      metadata: { org_id: org.id, tier },
      // Propagate org_id onto the SUBSCRIPTION too, not just the session. When the org
      // has no customer yet (first-time / customer_email path), the
      // `customer.subscription.created` webhook can't resolve the org by customer id
      // because the id isn't on the org row yet — it falls back to this metadata to find
      // the org and persist the freshly-minted customer id back. (ticket 0005)
      subscription_data: { metadata: { org_id: org.id, tier } },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[stripe/create-checkout] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
