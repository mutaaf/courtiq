/**
 * Chalk Talk AI is a SECOND subscription on the same org. Its Stripe events must update only the
 * chalk_talk_ai_* columns: the main plan's tier, subscription id and status are never touched (the old
 * webhook read an unknown price as 'free' and would have downgraded a paying coach). Real signatures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';

const { store, COACH_PRICE, AI_PRICE } = vi.hoisted(() => ({ store: { orgs: [] as any[] }, COACH_PRICE: 'price_coach_ct', AI_PRICE: 'price_chalk_talk_ai' }));
const realStripe = new Stripe('sk_test_dummy_ct', { apiVersion: '2026-04-22.dahlia' });

vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
  return {
    ...actual,
    getStripe: () => ({ webhooks: { constructEvent: realStripe.webhooks.constructEvent.bind(realStripe.webhooks) } }),
    tierFromPriceId: (p: string) => (p === COACH_PRICE ? 'coach' : null),
  };
});
// a tiny in-memory organizations table: select(...).eq(col, v).single() and update(patch).eq(col, v)
function table() {
  return {
    select: () => { const q: any = { f: null as any }; q.eq = (c: string, v: any) => { q.f = [c, v]; return q; }; q.single = async () => ({ data: store.orgs.find((o) => o[q.f[0]] === q.f[1]) || null }); return q; },
    update: (patch: any) => ({ eq: async (c: string, v: any) => { store.orgs.filter((o) => o[c] === v).forEach((o) => Object.assign(o, patch)); return { error: null }; } }),
  };
}
vi.mock('@/lib/supabase/server', () => ({ createServiceSupabase: vi.fn(async () => ({ from: () => table() })) }));
vi.mock('@/lib/cache/memory', () => ({ memBust: vi.fn() }));

import { POST as webhook } from '@/app/api/stripe/webhook/route';

const SECRET = 'whsec_ct_test';
function send(type: string, object: any) {
  const payload = JSON.stringify({ id: 'evt_' + Math.random().toString(36).slice(2), object: 'event', type, data: { object } });
  const sig = realStripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return webhook(new Request('http://x/api/stripe/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': sig } }));
}
const sub = (id: string, price: string, status: string, meta: any = {}) => ({ id, object: 'subscription', customer: 'cus_1', status, cancel_at_period_end: false, metadata: meta, items: { data: [{ price: { id: price }, current_period_end: 1_900_000_000 }] } });

describe('Stripe webhook: the Chalk Talk AI subscription stays apart from the main plan', () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET; process.env.STRIPE_PRICE_CHALK_TALK_AI = AI_PRICE;
    store.orgs = [{ id: 'org1', tier: 'pro_coach', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_main', subscription_status: 'active', chalk_talk_ai_status: null, chalk_talk_ai_subscription_id: null }];
  });

  it('a new AI subscription turns on the AI plan and leaves the tier and main subscription alone', async () => {
    expect((await send('customer.subscription.created', sub('sub_ai', AI_PRICE, 'active', { org_id: 'org1', product: 'chalk_talk_ai' }))).status).toBe(200);
    const o = store.orgs[0];
    expect(o.chalk_talk_ai_status).toBe('active'); expect(o.chalk_talk_ai_subscription_id).toBe('sub_ai');
    expect(o.tier).toBe('pro_coach'); expect(o.stripe_subscription_id).toBe('sub_main'); expect(o.subscription_status).toBe('active');
  });

  it('checkout for the AI product never sets a tier', async () => {
    await send('checkout.session.completed', { id: 'cs_1', object: 'checkout.session', customer: 'cus_1', subscription: 'sub_ai', metadata: { org_id: 'org1', product: 'chalk_talk_ai' } });
    expect(store.orgs[0].tier).toBe('pro_coach'); expect(store.orgs[0].chalk_talk_ai_status).toBe('active');
  });

  it('a failed AI payment marks only the AI plan past due', async () => {
    store.orgs[0].chalk_talk_ai_subscription_id = 'sub_ai'; store.orgs[0].chalk_talk_ai_status = 'active';
    await send('invoice.payment_failed', { id: 'in_1', object: 'invoice', customer: 'cus_1', subscription: 'sub_ai' });
    expect(store.orgs[0].chalk_talk_ai_status).toBe('past_due'); expect(store.orgs[0].subscription_status).toBe('active');
  });

  it('cancelling the AI plan ends only the AI plan', async () => {
    store.orgs[0].chalk_talk_ai_subscription_id = 'sub_ai'; store.orgs[0].chalk_talk_ai_status = 'active';
    await send('customer.subscription.deleted', sub('sub_ai', AI_PRICE, 'canceled'));
    expect(store.orgs[0].chalk_talk_ai_status).toBe('canceled'); expect(store.orgs[0].chalk_talk_ai_subscription_id).toBeNull();
    expect(store.orgs[0].tier).toBe('pro_coach'); expect(store.orgs[0].stripe_subscription_id).toBe('sub_main');
  });

  it('the main plan still works exactly as before', async () => {
    await send('customer.subscription.updated', sub('sub_main', COACH_PRICE, 'active'));
    expect(store.orgs[0].tier).toBe('coach'); expect(store.orgs[0].chalk_talk_ai_status).toBeNull();
  });
});
