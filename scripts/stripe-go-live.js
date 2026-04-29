#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Stripe go-live cutover — mirrors the test-mode billing setup into live
 * mode in one shot, so we don't have to click through dashboards.
 *
 * What it does (all idempotent):
 *
 *   1. Reads test-mode prices from .env.local (STRIPE_PRICE_*) and looks up
 *      each one to copy its product name, description, amount, currency,
 *      and interval.
 *   2. Creates equivalent products + prices in live mode.
 *   3. Creates a live webhook endpoint pointing at PROD_URL/api/stripe/webhook
 *      with the four critical events. Returns the signing secret.
 *   4. Creates (or updates) a Customer Portal configuration with sensible
 *      defaults: cancel, switch plans, update payment, view invoices.
 *   5. Optionally pushes the resulting env vars to Vercel via the CLI when
 *      --push-vercel is passed.
 *
 * Usage:
 *   STRIPE_LIVE_KEY=sk_live_... node scripts/stripe-go-live.js
 *   STRIPE_LIVE_KEY=sk_live_... node scripts/stripe-go-live.js --push-vercel
 *   node scripts/stripe-go-live.js verify    # sanity-check existing live setup
 *
 * Refuses to run with anything other than sk_live_ for the live key.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Load .env.local ──────────────────────────────────────────────────────────

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

const command = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'cutover';

const PROD_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://youthsportsiq.com';
const TEST_KEY = process.env.STRIPE_SECRET_KEY;
const LIVE_KEY = process.env.STRIPE_LIVE_KEY;

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!TEST_KEY || !TEST_KEY.startsWith('sk_test_')) {
  die('STRIPE_SECRET_KEY in .env.local must be a sk_test_... key.');
}

if (command !== 'verify' && (!LIVE_KEY || !LIVE_KEY.startsWith('sk_live_'))) {
  die('STRIPE_LIVE_KEY env var must be set to a sk_live_... key. Run again like:\n   STRIPE_LIVE_KEY=sk_live_xxx node scripts/stripe-go-live.js');
}

const test = new Stripe(TEST_KEY, { apiVersion: '2026-04-22.dahlia' });
const live = LIVE_KEY ? new Stripe(LIVE_KEY, { apiVersion: '2026-04-22.dahlia' }) : null;

// ── Test-mode price IDs we expect to mirror ─────────────────────────────────

const PRICE_KEYS = [
  'STRIPE_PRICE_COACH_MONTHLY',
  'STRIPE_PRICE_COACH_ANNUAL',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_PRO_ANNUAL',
  'STRIPE_PRICE_ORG_MONTHLY',
  'STRIPE_PRICE_ORG_ANNUAL',
];

function shortKey(s) {
  return s.slice(0, 14) + '…';
}

// ── Cutover ──────────────────────────────────────────────────────────────────

async function cutover() {
  console.log(`\n▶ Stripe go-live cutover`);
  console.log(`  test key: ${shortKey(TEST_KEY)}`);
  console.log(`  live key: ${shortKey(LIVE_KEY)}`);
  console.log(`  webhook URL: ${PROD_URL}/api/stripe/webhook\n`);

  // 1. Mirror products + prices
  console.log('1. Mirroring products + prices test → live…');
  const liveEnvLines = [];

  for (const key of PRICE_KEYS) {
    const testPriceId = process.env[key];
    if (!testPriceId) {
      console.log(`   ⚠ ${key} missing from .env.local — skipping`);
      continue;
    }

    const tp = await test.prices.retrieve(testPriceId, { expand: ['product'] });
    const tProduct = tp.product;

    // Find or create the product in live mode by name match (idempotent)
    const livePrds = await live.products.list({ limit: 100, active: true });
    let liveProduct = livePrds.data.find((p) => p.name === tProduct.name);
    if (!liveProduct) {
      liveProduct = await live.products.create({
        name: tProduct.name,
        description: tProduct.description || undefined,
        metadata: { mirrored_from_test: tProduct.id },
      });
      console.log(`   ✓ created product ${liveProduct.id} ("${liveProduct.name}")`);
    } else {
      console.log(`   = product exists ${liveProduct.id} ("${liveProduct.name}")`);
    }

    // Find or create the price (idempotent on amount + interval)
    const livePrices = await live.prices.list({ product: liveProduct.id, active: true, limit: 100 });
    const matching = livePrices.data.find(
      (p) =>
        p.unit_amount === tp.unit_amount &&
        p.currency === tp.currency &&
        p.recurring?.interval === tp.recurring?.interval &&
        (p.recurring?.interval_count || 1) === (tp.recurring?.interval_count || 1),
    );
    const livePrice = matching
      ? matching
      : await live.prices.create({
          product: liveProduct.id,
          unit_amount: tp.unit_amount,
          currency: tp.currency,
          recurring: tp.recurring
            ? {
                interval: tp.recurring.interval,
                interval_count: tp.recurring.interval_count,
              }
            : undefined,
          metadata: { mirrored_from_test: testPriceId },
        });

    console.log(`   ${matching ? '=' : '✓'} ${key} → ${livePrice.id} ($${(tp.unit_amount / 100).toFixed(2)}/${tp.recurring?.interval})`);
    liveEnvLines.push(`${key}=${livePrice.id}`);
  }

  // 2. Webhook endpoint
  console.log('\n2. Creating live webhook endpoint…');
  const webhookEvents = [
    'checkout.session.completed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_failed',
  ];
  const webhookUrl = `${PROD_URL}/api/stripe/webhook`;
  const existingHooks = await live.webhookEndpoints.list({ limit: 100 });
  const existing = existingHooks.data.find((h) => h.url === webhookUrl);
  let webhookSecret;
  if (existing) {
    console.log(`   = endpoint exists (${existing.id}) — secret already issued; ${'\033[33m'}rotate via dashboard if you didn't capture it${'\033[0m'}`);
    webhookSecret = `<existing — see Stripe dashboard or rotate>`;
  } else {
    const hook = await live.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: webhookEvents,
      description: 'CourtIQ production webhook',
    });
    webhookSecret = hook.secret; // Only returned on creation.
    console.log(`   ✓ created ${hook.id} → secret captured`);
  }

  // 3. Customer Portal
  console.log('\n3. Configuring customer portal…');
  const portalConfigs = await live.billingPortal.configurations.list({ limit: 5, active: true });
  const portalDefault = portalConfigs.data.find((c) => c.is_default);
  if (portalDefault && portalDefault.features.subscription_cancel?.enabled) {
    console.log(`   = active default portal config exists (${portalDefault.id})`);
  } else {
    // Build the products feature for plan-switching (no-op if products empty)
    const allProducts = await live.products.list({ limit: 100, active: true });
    const productsList = [];
    for (const p of allProducts.data) {
      const prices = await live.prices.list({ product: p.id, active: true, limit: 10 });
      if (prices.data.length > 0) {
        productsList.push({ product: p.id, prices: prices.data.map((x) => x.id) });
      }
    }
    const cfg = await live.billingPortal.configurations.create({
      business_profile: {
        headline: 'Manage your SportsIQ subscription',
      },
      default_return_url: `${PROD_URL}/settings/upgrade`,
      features: {
        customer_update: { allowed_updates: ['email', 'address', 'tax_id', 'name'], enabled: true },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: {
          enabled: true,
          mode: 'at_period_end',
          cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'] },
        },
        subscription_update: {
          enabled: productsList.length > 0,
          default_allowed_updates: ['price'],
          proration_behavior: 'create_prorations',
          products: productsList.length > 0 ? productsList : undefined,
        },
      },
    });
    console.log(`   ✓ created portal config ${cfg.id}`);
  }

  // 4. Output the env block
  console.log('\n4. Live env vars to set in Vercel:');
  console.log('─'.repeat(60));
  console.log(`STRIPE_SECRET_KEY=${LIVE_KEY}`);
  console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
  for (const line of liveEnvLines) console.log(line);
  console.log(`# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...   ← grab from Stripe dashboard`);
  console.log('─'.repeat(60));

  // 5. Optional Vercel push
  if (args['push-vercel']) {
    console.log('\n5. Pushing env vars to Vercel production…');
    const set = (name, value) => {
      try {
        // Remove any existing value first (idempotent)
        execSync(`vercel env rm ${name} production -y 2>/dev/null`, { stdio: 'ignore' });
      } catch {}
      try {
        execSync(`echo "${value}" | vercel env add ${name} production`, { stdio: 'inherit' });
      } catch (e) {
        console.warn(`   ⚠ ${name} push failed: ${e.message}`);
      }
    };
    set('STRIPE_SECRET_KEY', LIVE_KEY);
    if (webhookSecret && webhookSecret.startsWith('whsec_')) {
      set('STRIPE_WEBHOOK_SECRET', webhookSecret);
    } else {
      console.warn('   ⚠ webhook secret not captured this run — set STRIPE_WEBHOOK_SECRET manually');
    }
    for (const line of liveEnvLines) {
      const [name, value] = line.split('=');
      set(name, value);
    }
    console.log('\n   ✓ Vercel env updated. Trigger a redeploy: vercel --prod');
  } else {
    console.log('\n   (Pass --push-vercel to also write these to Vercel automatically.)');
  }

  console.log('\n✓ Cutover prep complete.\n');
}

// ── Verify mode ──────────────────────────────────────────────────────────────

async function verify() {
  if (!LIVE_KEY) die('STRIPE_LIVE_KEY required for verify mode.');

  console.log(`\n▶ Verifying live setup`);
  console.log(`  live key: ${shortKey(LIVE_KEY)}\n`);

  let ok = true;
  const fail = (msg) => { ok = false; console.log(`  ✗ ${msg}`); };
  const pass = (msg) => console.log(`  ✓ ${msg}`);

  // Prices
  for (const key of PRICE_KEYS) {
    const id = process.env[key];
    if (!id) { fail(`${key} missing in env`); continue; }
    if (!id.startsWith('price_')) { fail(`${key} doesn't look like a price ID`); continue; }
    try {
      const p = await live.prices.retrieve(id);
      pass(`${key}: $${(p.unit_amount / 100).toFixed(2)}/${p.recurring?.interval}`);
    } catch {
      fail(`${key} (${id}) not found in live mode`);
    }
  }

  // Webhook
  const hooks = await live.webhookEndpoints.list({ limit: 100 });
  const url = `${PROD_URL}/api/stripe/webhook`;
  const wh = hooks.data.find((h) => h.url === url);
  if (!wh) fail(`webhook endpoint missing for ${url}`);
  else if (wh.status !== 'enabled') fail(`webhook ${wh.id} not enabled`);
  else pass(`webhook ${wh.id} enabled (${wh.enabled_events.length} events)`);

  // Portal
  const cfgs = await live.billingPortal.configurations.list({ limit: 5, active: true });
  if (cfgs.data.length === 0) fail('no active billing portal configuration');
  else pass(`portal config active (${cfgs.data[0].id})`);

  console.log(ok ? '\n✓ All checks passed.\n' : '\n✗ Some checks failed.\n');
  process.exit(ok ? 0 : 1);
}

// ── Dispatch ────────────────────────────────────────────────────────────────

(async () => {
  try {
    if (command === 'verify') await verify();
    else await cutover();
  } catch (e) {
    console.error('\n✗ Failed:', e.message);
    if (e.raw) console.error('  raw:', e.raw);
    process.exit(1);
  }
})();
