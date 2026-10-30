#!/usr/bin/env node
// Creates (or finds) the Stripe objects for Chalk Talk AI and prints the env vars to set. Idempotent:
// run it again and it reuses what's there. Uses STRIPE_SECRET_KEY (test key first; live when you're ready).
//   STRIPE_SECRET_KEY=sk_test_… node scripts/stripe-chalk-talk-ai.mjs
//
//   Product  "Chalk Talk AI"
//   Price    $9.99 / month (lookup_key chalk_talk_ai_monthly)
//   Coupon   $5.00 off, forever, id chalk-talk-launch: the $4.99 launch price, kept as long as they stay
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('Set STRIPE_SECRET_KEY'); process.exit(1); }
const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia' });

const existing = await stripe.prices.list({ lookup_keys: ['chalk_talk_ai_monthly'], expand: ['data.product'] });
let price = existing.data[0];
if (!price) {
  const product = await stripe.products.create({ name: 'Chalk Talk AI', description: 'Plays drawn from your words, a brain for every position, the IQ tutor and the analyst voice.', metadata: { app: 'chalk_talk_ai' } });
  price = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: 999, recurring: { interval: 'month' }, lookup_key: 'chalk_talk_ai_monthly', nickname: 'Chalk Talk AI monthly' });
}
let coupon;
try { coupon = await stripe.coupons.retrieve('chalk-talk-launch'); }
catch { coupon = await stripe.coupons.create({ id: 'chalk-talk-launch', name: 'Launch price', amount_off: 500, currency: 'usd', duration: 'forever' }); }

console.log(`# ${key.startsWith('sk_live') ? 'LIVE' : 'TEST'} mode`);
console.log(`STRIPE_PRICE_CHALK_TALK_AI=${price.id}`);
console.log(`STRIPE_COUPON_CHALK_TALK_LAUNCH=${coupon.id}`);
console.log('# end the launch offer later by removing STRIPE_COUPON_CHALK_TALK_LAUNCH; existing subscribers keep it');
