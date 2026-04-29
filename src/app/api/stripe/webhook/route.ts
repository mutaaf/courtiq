export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getStripe, tierFromPriceId } from '@/lib/stripe';
import { createServiceSupabase } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // Idempotency — Stripe retries failed deliveries and can replay the same
  // event_id. Insert-with-conflict ensures we only process each event once.
  const { error: dedupErr } = await admin.from('stripe_webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
    livemode: event.livemode ?? false,
    status: 'received',
  });

  if (dedupErr) {
    // Unique-violation means we've already received this event — short-circuit
    // 200 OK so Stripe stops retrying. Any other error: log and continue (the
    // table may not exist yet on first deploy — degrade gracefully rather than
    // block real billing events).
    if ((dedupErr as any).code === '23505') {
      return NextResponse.json({ received: true, deduped: true });
    }
    console.warn('[stripe/webhook] dedup insert failed (continuing):', dedupErr.message);
  }

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
          const tier = tierFromPriceId(firstItem.price.id) || 'free';
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
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await admin
          .from('organizations')
          .update({
            tier: 'free',
            subscription_status: 'canceled',
            stripe_subscription_id: null,
            cancel_at_period_end: false,
          })
          .eq('stripe_subscription_id', sub.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await admin
          .from('organizations')
          .update({
            subscription_status: 'past_due',
          })
          .eq('stripe_customer_id', invoice.customer as string);
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }

    await admin
      .from('stripe_webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('event_id', event.id);
  } catch (err) {
    console.error(`[stripe/webhook] Error handling ${event.type}:`, err);
    await admin
      .from('stripe_webhook_events')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : String(err),
      })
      .eq('event_id', event.id);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
