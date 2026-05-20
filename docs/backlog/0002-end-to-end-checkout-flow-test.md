---
id: 0002
title: End-to-end checkout flow test — upgrade → pay → tier unlocks features
status: in-progress
priority: P0
area: billing
created: 2026-05-20
owner: product-groomer
---

## User story

As a free-tier coach who clicked Upgrade, I want the flow from "/settings/upgrade tap" to "feature actually unlocked" to be covered by an automated test that fails loudly if any step breaks (Stripe checkout session creation, redirect, webhook event handling, `organizations.plan` update, `useTier()` re-read, `<UpgradeGate>` unlock), so that a deploy that silently breaks the upgrade path can't ship to production.

## Why now (four lenses)

### Product Owner
The checkout flow is the moment of revenue. Today the only proof it works is "I tried it once and it seemed fine." A single regression in any of the six steps — checkout-session route, Stripe redirect, webhook signature, plan update, `/api/me` cache, `<UpgradeGate>` re-resolution — silently turns free trials into permanent frustration. The smallest meaningful unit is one integration test that walks the whole sequence with a stubbed Stripe and asserts the tier flip.

### Stakeholder
The billing moat is only real if the conversion machinery is durable. We've shipped the surface (`<UpgradeGate>`, `/settings/upgrade`, `/api/stripe/create-checkout`, `/api/stripe/webhook`, the tier system in `src/lib/tier.ts`) but nothing wires it together as a contract. This ticket establishes that contract so future tier or AI-quota changes can't break upgrades without a red CI.

### User (at 5:45pm on a Tuesday)
The coach taps Upgrade, pays Stripe $9.99, and within seconds their Practice Arc + report cards work. If any step fails, they're charged with nothing unlocked, they email support, they churn. This test is the seatbelt.

### Growth
Conversion is the metric. Without an end-to-end test, every Stripe SDK bump, every Next.js version, every webhook handler edit silently risks the entire revenue line. The cost of one broken upgrade weekend exceeds the cost of this test by an order of magnitude.

## Acceptance criteria

Each box maps 1:1 to a vitest test scenario.

- [ ] POST `/api/stripe/create-checkout` with `{ tier: 'coach', billing: 'monthly' }` and an authenticated coach returns a 200 with `{ url: <stripe-checkout-url> }` whose URL is on `checkout.stripe.com`.
- [ ] The same POST with no auth returns 401 and creates no Stripe session.
- [ ] The same POST with `{ tier: 'unknown' }` returns 400.
- [ ] After a simulated checkout completion, a `customer.subscription.created` webhook event (signed correctly per ticket 0001) sets `organizations.plan = 'coach'` and `organizations.subscription_status = 'active'` for the org whose `stripe_customer_id` matches the event's customer.
- [ ] After the webhook fires, `GET /api/me` for that org returns `{ org: { plan: 'coach', subscription_status: 'active', ... } }` on the next call (the 2-minute memCache must not mask the upgrade).
- [ ] `canAccess(orgId, 'report_cards')` returns `true` after the upgrade (server-side gating is honored).
- [ ] `canAccess(orgId, 'org_analytics')` returns `false` after a coach-tier upgrade (no over-grant).
- [ ] The fixture flow runs in under 5 seconds (it's a vitest spec with mocked Stripe + Supabase, not a real network call).

## Out of scope

- Real Stripe API calls in CI. Use mocks / fixtures.
- Playwright UI walk-through of the Stripe Checkout page itself (Stripe's domain). Cover the redirect destination, not the iframe.
- Annual billing prices (separate ticket if needed; this one covers monthly).
- Pro and Org tier upgrades. Coach is the canonical path; the other tiers reuse the same handler and gain test coverage incrementally.

## Engineering notes

- `src/app/api/stripe/create-checkout/route.ts` — confirm it accepts `tier` + `billing` body, calls `stripe.checkout.sessions.create()` with the matching `STRIPE_PRICE_*` env var, returns `{ url }`. Should already work; this ticket adds tests, not a rewrite.
- `src/app/api/stripe/webhook/route.ts` — depends on 0001 (signature verification). This ticket's tests can use the same `generateTestHeaderString` pattern.
- `src/app/api/me/route.ts` — the 2-minute memCache must invalidate or be bypassed when a webhook just changed the org's plan. Either bust the cache on webhook handler, or set a short TTL on plan-related fields. Document the chosen pattern in the implementation log.
- `src/lib/tier.ts` — `canAccess()` reads the org's plan; ensure the test asserts on this directly, not on a UI render.
- `tests/stripe/checkout-flow.spec.ts` (new) — vitest spec. Mock Stripe (the session.create stub, the webhook event constructor). Mock Supabase service client. Assert on the chain: route → webhook → DB update → /api/me → canAccess.
- New deps: none.
- Migration needed: no.
- Env vars needed: STRIPE_PRICE_COACH_MONTHLY must resolve to a valid (test) price id in CI env. The existing ci.yml uses `price_dummy`; either teach the test to use a known mock id, or have the mock intercept the create call without needing a real id.
- AI prompt change: no.
- Tier feature key: no (this tests the gating system, doesn't change it).

## Implementation log

### 2026-05-20 — implementation-dev — picked up

- Branch `feat/0002-checkout-flow-test`. Status → `in-progress`.
- This is a test-addition ticket: the checkout/webhook/tier surface already exists. Goal is to wire the
  whole chain under one vitest spec and only make the minimum code change a failing test reveals.
