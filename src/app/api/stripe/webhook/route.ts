export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getStripe, tierFromPriceId } from '@/lib/stripe';
import { createServiceSupabase } from '@/lib/supabase/server';
import { memBust } from '@/lib/cache/memory';

type ServiceClient = Awaited<ReturnType<typeof createServiceSupabase>>;

/**
 * Stripe subscription statuses that mean the subscription is dead, not merely struggling.
 * Once a subscription reaches one of these, Stripe has stopped trying to collect, so the
 * org loses its paid tier (downgrade to free). `past_due` / `trialing` / `active` are
 * deliberately NOT here — they're the grace window where paid features stay unlocked
 * while Stripe retries the card. (ticket 0004)
 */
const TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  'unpaid',
  'canceled',
  'incomplete_expired',
]);

/**
 * Invalidate the per-coach `me:` cache for every coach in an org.
 *
 * `/api/me` caches `{ coach, teams }` (including `organizations.tier`) under
 * `me:${user.id}` for 2 minutes. A billing webhook that flips an org's tier must
 * bust those keys, or a coach who paid sees the stale free row until the TTL lapses
 * (the exact gap ticket 0002 closes). We bust by coach id because the cache key is
 * the auth user id, which equals `coaches.id`.
 */
async function bustOrgMeCache(admin: ServiceClient, orgId: string) {
  const { data: coaches } = await admin
    .from('coaches')
    .select('id')
    .eq('org_id', orgId);
  for (const c of coaches ?? []) {
    memBust(`me:${c.id}`);
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  // Fail closed: with no signing secret we cannot prove an event came from
  // Stripe, so we must refuse to act on ANY webhook rather than trust the body.
  // Read at request time (not module load) so a missing env var can't crash
  // `next build`, and so verification can never fall through to `undefined`.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json(
      { error: 'webhook secret not configured' },
      { status: 503 }
    );
  }

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orgId = session.metadata?.org_id;
        const tier = session.metadata?.tier;
        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;

        if (orgId && tier) {
          await admin
            .from('organizations')
            .update({
              tier,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_status: 'active',
            })
            .eq('id', orgId);
          await bustOrgMeCache(admin, orgId);
        }
        break;
      }

      case 'customer.subscription.created': {
        // The subscription's first event after checkout. Map the price to a tier and
        // flip the org so paid features unlock immediately.
        //
        // Resolving the org: the resubscription path already has the customer id on the
        // org row (it survived cancellation), so we look up by customer first. But a
        // FIRST-TIME upgrade goes through the `customer_email` checkout branch — Stripe
        // mints a brand-new customer that isn't on the org row yet, so the customer
        // lookup misses. For that case the create-checkout route stamps `org_id` into
        // the subscription metadata; we fall back to it, and persist the new customer id
        // back to the org so every later lookup (and the next resubscription) finds it.
        // (ticket 0005)
        const sub = event.data.object;
        const firstItem = sub.items.data[0];
        const tier = tierFromPriceId(firstItem.price.id) || 'free';
        const customerId = sub.customer as string;

        let org: { id: string } | null = null;
        const byCustomer = await admin
          .from('organizations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();
        org = byCustomer.data;

        if (!org && sub.metadata?.org_id) {
          const byMeta = await admin
            .from('organizations')
            .select('id')
            .eq('id', sub.metadata.org_id)
            .single();
          org = byMeta.data;
        }

        if (org) {
          await admin
            .from('organizations')
            .update({
              tier,
              // Persist the customer id (a no-op when it already matched the lookup;
              // the write that closes the first-time customer_email loop otherwise).
              stripe_customer_id: customerId,
              stripe_subscription_id: sub.id,
              subscription_status: sub.status,
              current_period_end: new Date(
                firstItem.current_period_end * 1000
              ).toISOString(),
              cancel_at_period_end: sub.cancel_at_period_end,
            })
            .eq('id', org.id);
          await bustOrgMeCache(admin, org.id);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const { data: org } = await admin
          .from('organizations')
          .select('id')
          .eq('stripe_subscription_id', sub.id)
          .single();

        if (org) {
          const firstItem = sub.items.data[0];
          // Resolve the priced tier from the line item, then enforce the grace window.
          // Stripe keeps the price item on the subscription through retries and even
          // after it lapses, so the price alone can't tell active from dead. We gate on
          // `sub.status`: while Stripe is still retrying (active/past_due/trialing) the
          // coach stays on the paid tier so features don't drop mid-season; once Stripe
          // gives up (unpaid/canceled/incomplete_expired) the subscription is dead, so we
          // downgrade to free — `canAccess(tier, …)` is status-agnostic, so the tier
          // value IS the grace decision. (ticket 0004)
          const pricedTier = tierFromPriceId(firstItem.price.id) || 'free';
          const tier = TERMINAL_SUBSCRIPTION_STATUSES.has(sub.status)
            ? 'free'
            : pricedTier;
          await admin
            .from('organizations')
            .update({
              tier,
              subscription_status: sub.status,
              current_period_end: new Date(
                firstItem.current_period_end * 1000
              ).toISOString(),
              cancel_at_period_end: sub.cancel_at_period_end,
            })
            .eq('id', org.id);
          await bustOrgMeCache(admin, org.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const { data: org } = await admin
          .from('organizations')
          .select('id')
          .eq('stripe_subscription_id', sub.id)
          .single();

        if (org) {
          await admin
            .from('organizations')
            .update({
              tier: 'free',
              subscription_status: 'canceled',
              stripe_subscription_id: null,
              cancel_at_period_end: false,
            })
            .eq('id', org.id);
          await bustOrgMeCache(admin, org.id);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;
        const { data: org } = await admin
          .from('organizations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (org) {
          await admin
            .from('organizations')
            .update({
              subscription_status: 'past_due',
            })
            .eq('id', org.id);
          await bustOrgMeCache(admin, org.id);
        }
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }
  } catch (err) {
    console.error(`[stripe/webhook] Error handling ${event.type}:`, err);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
