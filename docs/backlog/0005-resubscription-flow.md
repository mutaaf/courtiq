---
id: 0005
title: Resubscription flow — free user re-upgrades after cancellation
status: shipped
priority: P0
area: billing
created: 2026-05-20
owner: product-groomer
---

## User story

As a coach who cancelled my Coach subscription mid-summer and is now starting a new season, I want to re-upgrade through the same `/settings/upgrade` flow — and have SportsIQ recognize me as an existing Stripe customer (no duplicate customer record), reactivate features the moment Stripe confirms the new subscription, and surface my old observations and players exactly as I left them — all covered by an automated test, so that the most natural re-revenue path can't silently double-charge or fail to unlock.

## Why now (four lenses)

### Product Owner
Resubscription is the most common revenue path after the initial upgrade. The user already has a `stripe_customer_id` on their `organizations` row from their prior subscription; the checkout flow must reuse it rather than minting a new customer (which would orphan their billing history and risk a duplicate charge if Stripe tries to reconcile). Today the code likely handles this correctly (`createSession` passes `customer: existing_id` when present) but there's no test that proves it.

### Stakeholder
Off-season cancellation and pre-season resubscription is the natural cadence for youth-sports coaching. Coaches go dormant for 3-6 months, then come back for the next sport season. The resubscription loop is where the LTV multiplier lives. Breaking it is breaking the entire seasonal business model.

### User (at 5:45pm on a Tuesday in late August, about to start fall season)
The coach signs back in. Their old roster is still there (ticket 0003 protected the data on cancellation). They tap Upgrade. Stripe Checkout opens, recognizes their saved card, charges $9.99, and within seconds report cards / parent sharing / Practice Arc work again — same data, same observations, same Practice Arc continuity. This is the high-trust moment. If anything stutters here, they churn permanently.

### Growth
Conservatively, 30-50% of cancellers within a youth-sports calendar cycle will re-upgrade for the next season if the UX is frictionless. This ticket is what makes "frictionless" provable.

## Acceptance criteria

Each box maps 1:1 to a vitest test scenario.

- [ ] POST `/api/stripe/create-checkout` for a coach whose `organizations.stripe_customer_id` is non-null calls `stripe.checkout.sessions.create()` with `customer: <existing_id>` (NOT `customer_email`, NOT undefined).
- [ ] POST `/api/stripe/create-checkout` for a coach whose `organizations.stripe_customer_id` is null calls `stripe.checkout.sessions.create()` with `customer_email: <coach.email>` (no customer id), and on a subsequent `customer.subscription.created` webhook the new `stripe_customer_id` is persisted back to `organizations`.
- [ ] After a resubscription's `customer.subscription.created` webhook fires for an org currently in `plan: 'free'` + `subscription_status: 'canceled'`, the org returns to `plan: 'coach'` + `subscription_status: 'active'`.
- [ ] Resubscription does NOT create a second `organizations` row, does NOT create a second `stripe_customer_id`, and does NOT clear or duplicate the org's existing `observations` / `players` / `teams` / `practice_sessions` rows.
- [ ] After resubscription, `canAccess(orgId, 'report_cards')` returns `true` immediately on the next `/api/me` call (cache invalidation must not mask the re-upgrade — same constraint as 0002).
- [ ] If the coach attempts to resubscribe while still `subscription_status: 'past_due'`, the checkout route returns 409 with a message directing them to the Billing Portal to settle the prior balance first (Stripe will not let us create a second sub on an unpaid customer anyway; we should fail fast with a clear error).
- [ ] Resubscription to a different tier than the cancelled one (e.g. cancelled Coach, re-upgrade to Pro) works: `plan = 'pro'` after the webhook, `canAccess(orgId, 'org_analytics')` is still false (Pro doesn't include Org features), `canAccess(orgId, 'analytics')` is now true.

## Out of scope

- Discount codes / promo for resubscribers. Separate growth ticket if we want to add a "welcome back" offer.
- Email outreach to lapsed coaches. Out of scope for this technical ticket; that's a marketing automation question.
- Migrating data from a different account (e.g. a coach who signed up with a different email). Cross-account merge is intentionally not supported.
- Annual-billing tier on resubscription. The same handler covers both billing periods; this ticket asserts monthly to keep the test surface bounded.

## Engineering notes

- `src/app/api/stripe/create-checkout/route.ts` — confirm the route reads `organizations.stripe_customer_id` for the caller's org, and branches `customer` vs `customer_email` accordingly. If today's code uses `customer_email` unconditionally, that's a bug — fix it as part of this ticket and call it out in the implementation log.
- `src/app/api/stripe/webhook/route.ts` — confirm the `customer.subscription.created` branch persists `stripe_customer_id` to `organizations` when the org previously had `null`. Should already work; verify.
- `tests/stripe/resubscription.spec.ts` (new) — vitest spec. Drive both the customer-already-exists and the customer-is-null paths. Drive the upgrade-to-different-tier path. Assert on the row-count invariants (no duplicate orgs, no duplicated observations).
- `tests/stripe/checkout-flow.spec.ts` (from ticket 0002) — extend with the past-due 409 case so we don't have to mock the same setup twice.
- `tests/db/data-preservation.spec.ts` (new or extend) — assert that the cancel → resubscribe cycle preserves at least one row in `observations`, `players`, `teams`, `practice_sessions` for the test org. This is the data-trust guarantee.
- New deps: none.
- Migration needed: no.
- Env vars needed: none beyond 0001.
- AI prompt change: no.
- Tier feature key: no.

## Implementation log

### 2026-05-20 — picked up, marked in-progress (implementation-dev)

Branch `feat/0005-resubscription-flow` off `origin/main`. Test-first, vitest-only
(billing/Stripe/tier change, no UI surface added).

**Schema / API reconciliations (ticket prose vs. real code).** The groomer
shorthand again names columns/signatures that don't exist; reconciled against
`src/types/database.ts`, `src/lib/tier.ts`, and the two Stripe routes:

- Column is `organizations.tier`, NOT `organizations.plan`. There is no `plan`
  column. Tests assert on `tier`.
- Subscription-status column IS `organizations.subscription_status` — the prose
  got this one right (verified in `src/types/database.ts`).
- `canAccess(tier: Tier, feature)` takes a Tier **string**, not an orgId. AC#5 /
  AC#7 are driven by the tier produced by the live chain (org row surfaced by
  `/api/me`), then `canAccess(tier, 'report_cards' | 'analytics' | 'org_analytics')`.
- The "Pro" tier value is `pro_coach`, NOT `pro`. The analytics feature key is
  `analytics` (granted at `pro_coach`); `org_analytics` is `organization`-only.
  AC#7 asserts `pro_coach` grants `analytics` and denies `org_analytics`.

**Behavior changes this ticket actually makes (the prose flagged AC#1/#2/#6 as
"likely already correct" — they were not):**

- `create-checkout` today *always* mints/reuses a Stripe customer and passes
  `customer: <id>`. AC#1/#2 require: pass `customer: <existing_id>` when the org
  already has one, but pass `customer_email: <coach.email>` (no customer id, no
  pre-created customer) when it's null — letting Stripe Checkout create the
  customer and the `customer.subscription.created` webhook persist the new
  `stripe_customer_id` back. Implemented as the minimum branch change.
- `create-checkout` has no past-due guard today. AC#6 requires a 409 + portal
  message when the caller's org is `subscription_status: 'past_due'`. Added a
  fail-fast guard before any Stripe call.

**Filenames.** `vitest.config.ts` excludes `**/*.spec.ts` (reserved for
Playwright). The ticket names `tests/stripe/resubscription.spec.ts` and
`tests/db/data-preservation.spec.ts`; created as `*.test.ts` so they actually
gate. The 0002 checkout spec is `tests/stripe/checkout-flow.test.ts` (extended
in place with the past-due 409 case). (See docs/LESSONS.md 2026-05-20.)

### 2026-05-21 — shipped (implementation-dev)

PR #220 merged to `main` via squash auto-merge with both gating checks green
(`lint`, `unit-tests`); the informational `e2e-tests` and Vercel checks also
passed. Full local gate before push: `npm run lint` (0 errors), `npx tsc
--noEmit` (0 errors), `npx vitest run --no-file-parallelism` (3970/3971 — the
single fail is the documented `Apr 27` vs `Apr 28` date-TZ artifact in the
untouched `player-of-match-utils.test.ts`, environmental on a non-UTC machine,
LESSONS 2026-05-20).

Code changes shipped:
- `src/app/api/stripe/create-checkout/route.ts` — branch `customer:<id>` (reuse)
  vs `customer_email` (first-time, let Stripe mint the customer); added the
  `past_due` → 409 Billing-Portal guard; stamp `org_id`/`tier` into
  `subscription_data.metadata`.
- `src/app/api/stripe/webhook/route.ts` — `customer.subscription.created` now
  resolves the org by customer id OR (fallback) `sub.metadata.org_id`, and
  persists `stripe_customer_id` back so the first-time `customer_email` loop
  closes and the next checkout takes the reuse path. Signature verification
  untouched.
- `tests/stripe/resubscription.test.ts` (new), `tests/db/data-preservation.test.ts`
  (new), `tests/stripe/checkout-flow.test.ts` (extended with the 409 case).

All 7 acceptance criteria are covered by tests and pass.
