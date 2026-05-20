---
id: 0002
title: End-to-end checkout flow test — upgrade → pay → tier unlocks features
status: shipped
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

### 2026-05-20 — implementation-dev — shipped the test + minimum code

**Test file:** `tests/stripe/checkout-flow.test.ts` (NOT `.spec.ts`). `vitest.config.ts` excludes
`**/*.spec.ts` (reserved for Playwright), so the ticket's `checkout-flow.spec.ts` wording would have made
the proof invisible to `npx vitest run`. Created as `.test.ts`. (LESSONS.md 2026-05-20.) All 8 acceptance
criteria map 1:1 to test cases; the whole spec runs in ~80ms (well under the 5s budget).

**Reconciliations between the ticket's groomer-shorthand and the real code** (the tests assert the real
contract, the AC intent is preserved):

- **`tier`, not `plan`.** There is no `organizations.plan` column. `/api/me` selects `organizations(... tier ...)`
  and the webhook writes `tier`. Tests assert `tier === 'coach'`.
- **`canAccess(tier, feature)` takes a `Tier` string, not an `orgId`.** The signature in `src/lib/tier.ts` is
  `canAccess(tier, feature)`. The tests drive it with the tier produced by the live chain (the org row the
  webhook flipped, surfaced by `/api/me`), honoring the AC: coach grants `report_cards`, denies `org_analytics`.
- **create-checkout reads `interval`, not `billing`.** Happy path posts `{ tier:'coach', interval:'monthly' }`;
  a body missing `interval` is a 400, consistent with the AC intent that malformed bodies are rejected.
- **`STRIPE_PRICE_*` load-order.** `src/lib/stripe.ts` freezes `PRICE_IDS` from `process.env` at module load,
  which (vitest hoists imports) happens before any test setup. The `@/lib/stripe` mock overrides `getPriceId`
  /`tierFromPriceId` deterministically so the route's real logic runs without the env-load race — no change to
  CI's `price_dummy` env was needed.

**Minimum code changes (a failing test revealed two genuine gaps):**

1. **`src/app/api/stripe/webhook/route.ts` — added a `customer.subscription.created` case.** The handler had
   `checkout.session.completed` + `customer.subscription.updated`/`deleted` + `invoice.payment_failed`, but no
   `created` case, so the AC's literal event (`customer.subscription.created`) flipped nothing. The new case
   resolves the org by the event's `stripe_customer_id` (stamped by create-checkout before redirect), maps the
   price → tier via `tierFromPriceId`, and sets `tier`/`subscription_status`/`current_period_end`/
   `cancel_at_period_end`/`stripe_subscription_id`. Signature verification is untouched (0001 stays intact;
   the 7 webhook tests still pass).

2. **`/api/me` cache invalidation — chosen pattern: BUST-ON-WEBHOOK (not a shorter TTL).** `/api/me` caches
   `{ coach, teams }` (incl. `organizations.tier`) under `me:${user.id}` for `TTL.MEDIUM` (2 min). After a paid
   webhook, that key would serve the stale free row for up to 2 minutes — the exact gap this ticket closes.
   Rather than weaken the TTL for everyone (which would re-add DB load on every dashboard hit), the webhook now
   busts the cache surgically: a `bustOrgMeCache(admin, orgId)` helper looks up the org's coaches and calls
   `memBust(me:${coach.id})` for each (the cache key is the auth user id, which equals `coaches.id`). It runs
   after every billing-state mutation (`created`, `session.completed`, `updated`, `deleted`, `payment_failed`),
   so any tier transition invalidates the cache immediately. `/api/me` itself is unchanged.
   - Rationale for bust-over-TTL: billing webhooks are rare; a per-event bust costs one extra `coaches` lookup
     on a low-frequency path, vs. a shorter TTL which would tax the high-frequency `/api/me` read continuously.

**Local gate:** `npm run lint` → 0 errors (129 pre-existing warnings, none in touched files); `npx tsc --noEmit`
→ 0 errors; `npx vitest run tests/stripe/` → 15/15 pass (8 new + 7 from 0001). Full `npx vitest run` shows only
the documented Node-25-environmental reds (`use-local-storage` `localStorage.clear is not a function`,
`player-of-match` `Apr 27` vs `Apr 28`, and jsdom 5s render timeouts in `command-palette`/`recording-button`/
`screen-reader-accessibility`/`weekly-wrap`); none touch Stripe/webhook/me/tier. CI (Node 20) arbitrates.

### 2026-05-20 — implementation-dev — shipped

- PR #213 merged to `main` (squash, auto-merge) with both gating checks green on CI Node 20:
  `lint` pass (1m17s), `unit-tests` pass (1m12s). The local Node-25 environmental reds did not appear on CI,
  exactly as LESSONS.md predicted. Status → `shipped` via the standard follow-up chore PR (mirrors 0001's #212).
