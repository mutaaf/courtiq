import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { stripe, getPriceId, type PaidTier, type BillingInterval } from '@/lib/stripe';

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
      .select('id, stripe_customer_id, name')
      .eq('id', coach.org_id)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Create or reuse Stripe customer
    let stripeCustomerId = org.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
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

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: getPriceId(tier, interval), quantity: 1 }],
      success_url: `${APP_URL}/settings/upgrade?success=true`,
      cancel_url: `${APP_URL}/settings/upgrade?canceled=true`,
      allow_promotion_codes: true,
      metadata: { org_id: org.id, tier },
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
