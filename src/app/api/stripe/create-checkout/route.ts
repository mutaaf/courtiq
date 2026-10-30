import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { getStripe, getPriceId, type PaidTier, type BillingInterval, CHALK_TALK_AI_PRICE, CHALK_TALK_AI_LAUNCH_COUPON } from '@/lib/stripe';
import { parseResumeTarget } from '@/lib/resume-target';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tier, interval, resume, product } = (await request.json()) as {
      tier: PaidTier;
      interval: BillingInterval;
      /** Optional opaque resume token describing the blocked action (ticket 0035). */
      resume?: string;
      /** 'chalk_talk_ai': the standalone Chalk Talk AI subscription instead of a CourtIQ tier. */
      product?: string;
    };

    if (product === 'chalk_talk_ai') return chalkTalkAICheckout(user);

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

    // Quota-wall resume round-trip (ticket 0035): if the coach was blocked mid-task,
    // the client passes an opaque `resume` token describing the blocked action. We
    // VALIDATE it server-side against the org's own teams/players before stamping it
    // onto the success_url so it survives the Stripe redirect — never trust the raw
    // value. A malformed, unknown-action, or cross-org token is dropped and the
    // success URL falls back to today's default. The validated value rides the
    // redirect URL (not session metadata) because the post-checkout landing reads it
    // off the URL to route the coach back to the exact artifact.
    let successUrl = `${APP_URL}/settings/upgrade?success=true`;
    if (typeof resume === 'string' && resume.trim()) {
      const { data: ownedTeams } = await admin
        .from('teams')
        .select('id')
        .eq('org_id', coach.org_id);
      const ownedTeamIds = (ownedTeams ?? []).map((t: { id: string }) => t.id);
      let ownedPlayerIds: string[] = [];
      if (ownedTeamIds.length > 0) {
        const { data: ownedPlayers } = await admin
          .from('players')
          .select('id, team_id')
          .in('team_id', ownedTeamIds);
        ownedPlayerIds = (ownedPlayers ?? []).map((p: { id: string }) => p.id);
      }
      const target = parseResumeTarget(resume, ownedTeamIds, ownedPlayerIds);
      if (target) {
        successUrl = `${APP_URL}/settings/upgrade?success=true&resume=${encodeURIComponent(resume)}`;
      }
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
      success_url: successUrl,
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

// Chalk Talk AI: a second subscription on the coach's org, never touching the main plan (the webhook routes
// its events by price id). The launch coupon, while it's configured, locks in $4.99.
async function chalkTalkAICheckout(user: { id: string; email?: string | null }) {
  const price = CHALK_TALK_AI_PRICE();
  if (!price) return NextResponse.json({ error: 'Chalk Talk AI isn’t on sale yet.' }, { status: 503 });
  const admin = await createServiceSupabase();
  const { data: coach } = await admin.from('coaches').select('org_id').eq('id', user.id).single();
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
  const { data: org } = await admin.from('organizations').select('id, stripe_customer_id, chalk_talk_ai_status').eq('id', coach.org_id).single();
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  if (org.chalk_talk_ai_status && ['active', 'trialing', 'past_due'].includes(org.chalk_talk_ai_status)) {
    return NextResponse.json({ error: 'You already have Chalk Talk AI. Manage it from billing.' }, { status: 409 });
  }
  const coupon = CHALK_TALK_AI_LAUNCH_COUPON();
  const meta = { org_id: org.id, product: 'chalk_talk_ai' };
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    ...(org.stripe_customer_id ? { customer: org.stripe_customer_id } : { customer_email: user.email || undefined }),
    line_items: [{ price, quantity: 1 }],
    ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true }),
    success_url: `${APP_URL}/labs/chalk-talk/ai?success=true`,
    cancel_url: `${APP_URL}/labs/chalk-talk/ai?canceled=true`,
    metadata: meta,
    subscription_data: { metadata: meta },
  });
  return NextResponse.json({ url: session.url });
}
