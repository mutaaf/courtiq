---
id: 0001
title: Stripe webhook signature verification on the live endpoint
status: in-progress
priority: P0
area: billing
created: 2026-05-20
owner: product-groomer
---

## User story

As the operator of SportsIQ in production, I want the `/api/stripe/webhook` route to reject every request whose `stripe-signature` header does not validate against `STRIPE_WEBHOOK_SECRET` (with a 400 response and zero side effects on the org's tier or subscription state), so that no attacker can forge a `customer.subscription.updated` event that flips a free org to Org-tier or downgrades a paying coach to free.

## Why now (four lenses)

### Product Owner
The webhook is the entire trust boundary for billing state. Without signature verification it's a publicly-reachable endpoint that mutates `organizations.subscription_status` and `organizations.plan` from whatever JSON body arrives. The smallest meaningful unit of value is a single guarded entry point: every event passes `stripe.webhooks.constructEvent(rawBody, signature, secret)` before any DB write, and any verification failure short-circuits to 400.

### Stakeholder
This is the billing-integrity moat. Stripe-as-source-of-truth only works if we can prove the events came from Stripe. Without it, the tier system's server-side `canAccess()` is meaningless — anyone can mint a "subscription_status: active, plan: org" record via curl. This ticket closes a P0 security hole, not a feature gap.

### User (at 5:45pm on a Tuesday)
The coach never sees this directly. They feel it when their tier doesn't change unexpectedly, when their Pro features stay unlocked through a subscription renewal, when nobody else gets free Org branding by forging a webhook.

### Growth
Trust-as-product. The first time we get reported to Stripe / a payment processor for "anyone can mint subscriptions," every existing coach receives a "your billing data may be compromised" email. There's no growth ROI on shipping anything else while this is open.

## Acceptance criteria

Each box maps 1:1 to a vitest test scenario.

- [ ] POST `/api/stripe/webhook` with a missing `stripe-signature` header returns 400 and writes nothing to `organizations`.
- [ ] POST `/api/stripe/webhook` with a `stripe-signature` header that does not validate against `STRIPE_WEBHOOK_SECRET` returns 400 and writes nothing to `organizations`.
- [ ] POST `/api/stripe/webhook` with a valid signature on a `customer.subscription.updated` event with a known `stripe_customer_id` writes the new tier / status to the matching `organizations` row (existing happy-path regression).
- [ ] POST `/api/stripe/webhook` with a valid signature on an event whose `stripe_customer_id` does not match any `organizations` row returns 200 and writes nothing (Stripe expects 200 on idempotent unknown-customer events).
- [ ] The raw request body used for signature construction is the unparsed string (Next.js App Router: `await req.text()`), not a JSON-parsed object. Asserted by sending a body with a non-canonical key order — verification still passes when the bytes match what Stripe signed.
- [ ] `STRIPE_WEBHOOK_SECRET` is read at request time (or via the lazy `getStripe()` factory), not at module top — so a missing env var at build time does not crash `next build`.
- [ ] If `STRIPE_WEBHOOK_SECRET` is unset in the runtime env, every webhook request returns 503 with body `{ error: "webhook secret not configured" }` (fail-closed) and writes nothing.

## Out of scope

- Stripe Billing Portal events beyond the existing subscription lifecycle. Adding new event types is a sibling ticket.
- Webhook signing on inbound Stripe Connect events (we don't use Connect).
- Replacing the existing tier-resolution logic. This ticket only adds the guard at the front of the existing handler.
- Multi-region webhook routing. The single Vercel function handles all events.

## Engineering notes

- `src/app/api/stripe/webhook/route.ts` — wrap the existing handler. The new top of the function: read `req.headers.get('stripe-signature')`, read `await req.text()` for the raw body, call `stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!)`. On throw → 400. On missing secret → 503. Only after success, branch on `event.type`.
- `src/lib/stripe.ts` (or equivalent — wherever `getStripe()` lives) — confirm `getStripe()` is lazy and reads `STRIPE_SECRET_KEY` at call time, not module load.
- `tests/stripe/webhook.spec.ts` (new) — vitest spec. Use `stripe.webhooks.generateTestHeaderString({ payload, secret })` to mint valid signatures for the happy-path tests; pass an arbitrary signature string for the reject tests. Mock the Supabase service client and assert on update calls.
- New deps: none. `stripe` package already in `package.json`.
- Migration needed: no.
- Env vars needed: `STRIPE_WEBHOOK_SECRET` must be set in Vercel preview and production (already documented in CONTRIBUTING; this ticket makes the route hard-fail when it's missing instead of silently accepting forged events).
- AI prompt change: no.
- Tier feature key: no.

## Implementation log

- 2026-05-20 [implementation-dev] Picked up ticket; status → in-progress. Branch `feat/0001-stripe-webhook-signature-verification`.
