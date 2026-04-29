#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Stripe smoke test — exercises checkout → portal → cancel against test mode.
 *
 * Walks through:
 *   1. Resolves an existing org + Stripe customer (or creates a throwaway one)
 *   2. Opens a Checkout Session for the requested tier/interval
 *   3. Opens a Billing Portal session for the same customer
 *   4. Cancels the active subscription (immediate or at period end)
 *
 * Usage:
 *   node scripts/stripe-smoke.js                              # default: coach monthly, throwaway customer
 *   node scripts/stripe-smoke.js --tier=pro_coach --interval=annual
 *   node scripts/stripe-smoke.js --org=<uuid>                 # use an existing org's customer
 *   node scripts/stripe-smoke.js --cancel                     # also cancel any active subscription on the customer
 *   node scripts/stripe-smoke.js --cancel-now                 # cancel immediately (default: at period end)
 *
 * Requires .env.local with STRIPE_SECRET_KEY (sk_test_...) and STRIPE_PRICE_*.
 * Refuses to run against a live key.
 */

const fs = require('fs');
const path = require('path');

// Load env from .env.local (no dotenv dep — keep this script standalone)
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const Stripe = require('stripe');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const tier = args.tier || 'coach';
const interval = args.interval || 'monthly';
const orgId = args.org;
const doCancel = !!args.cancel || !!args['cancel-now'];
const cancelNow = !!args['cancel-now'];

const PRICE_ENV = {
  coach: { monthly: 'STRIPE_PRICE_COACH_MONTHLY', annual: 'STRIPE_PRICE_COACH_ANNUAL' },
  pro_coach: { monthly: 'STRIPE_PRICE_PRO_MONTHLY', annual: 'STRIPE_PRICE_PRO_ANNUAL' },
  organization: { monthly: 'STRIPE_PRICE_ORG_MONTHLY', annual: 'STRIPE_PRICE_ORG_ANNUAL' },
};

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const key = process.env.STRIPE_SECRET_KEY;
if (!key) die('STRIPE_SECRET_KEY missing from .env.local');
if (key.startsWith('sk_live_')) die('Refusing to run against a live key. Use a sk_test_... key.');
if (!key.startsWith('sk_test_')) die(`Unrecognized key prefix: ${key.slice(0, 7)}…`);

const priceEnvKey = PRICE_ENV[tier]?.[interval];
if (!priceEnvKey) die(`Invalid tier/interval: ${tier}/${interval}`);
const priceId = process.env[priceEnvKey];
if (!priceId) die(`${priceEnvKey} is not set in .env.local`);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia' });

async function resolveCustomer() {
  if (!orgId) {
    const customer = await stripe.customers.create({
      email: 'stripe-smoke@example.test',
      name: 'Smoke Test Customer',
      metadata: { source: 'stripe-smoke.js' },
    });
    console.log(`  → created throwaway customer ${customer.id}`);
    return customer.id;
  }

  // Look up via service-role Supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) die('--org requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  const res = await fetch(`${url}/rest/v1/organizations?id=eq.${orgId}&select=stripe_customer_id,name`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) die(`Supabase lookup failed: ${res.status} ${await res.text()}`);
  const [row] = await res.json();
  if (!row) die(`Org ${orgId} not found`);
  if (row.stripe_customer_id) {
    console.log(`  → using existing customer ${row.stripe_customer_id} (org "${row.name}")`);
    return row.stripe_customer_id;
  }
  const customer = await stripe.customers.create({
    email: `${orgId}@example.test`,
    name: row.name || 'Smoke Test',
    metadata: { org_id: orgId, source: 'stripe-smoke.js' },
  });
  await fetch(`${url}/rest/v1/organizations?id=eq.${orgId}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ stripe_customer_id: customer.id }),
  });
  console.log(`  → created customer ${customer.id} for org "${row.name}"`);
  return customer.id;
}

async function main() {
  console.log(`\n▶ Stripe smoke test (${tier} ${interval})`);
  console.log(`  key: ${key.slice(0, 12)}…  price: ${priceId}\n`);

  console.log('1. Resolving customer…');
  const customerId = await resolveCustomer();

  console.log('\n2. Creating Checkout Session…');
  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/settings/upgrade?success=true`,
    cancel_url: `${APP_URL}/settings/upgrade?canceled=true`,
    allow_promotion_codes: true,
    metadata: { tier, source: 'stripe-smoke.js' },
  });
  console.log(`  → ${checkout.url}`);
  console.log('  open this URL and pay with 4242 4242 4242 4242 to complete the flow.');

  console.log('\n3. Creating Billing Portal Session…');
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/settings/upgrade`,
    });
    console.log(`  → ${portal.url}`);
  } catch (err) {
    console.log(`  ✗ portal failed: ${err.message}`);
    console.log('    (configure the portal at https://dashboard.stripe.com/test/settings/billing/portal)');
  }

  if (doCancel) {
    console.log(`\n4. Canceling subscriptions for ${customerId}…`);
    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 10 });
    if (subs.data.length === 0) {
      console.log('  → no active subscriptions to cancel');
    } else {
      for (const sub of subs.data) {
        if (cancelNow) {
          const canceled = await stripe.subscriptions.cancel(sub.id);
          console.log(`  → ${sub.id} canceled immediately (status=${canceled.status})`);
        } else {
          const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
          console.log(`  → ${sub.id} marked cancel_at_period_end=${updated.cancel_at_period_end}`);
        }
      }
    }
  }

  console.log('\n✓ Done.\n');
}

main().catch((err) => {
  console.error('\n✗ Smoke test failed:', err.message);
  if (err.raw) console.error('  raw:', err.raw);
  process.exit(1);
});
