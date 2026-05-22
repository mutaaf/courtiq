---
id: 0004
title: Payment-failure handling — failed payment → past_due → warning banner
status: shipped
priority: P0
area: billing
created: 2026-05-20
owner: product-groomer
---

## User story

As a paying coach whose card was just declined for the renewal charge, I want SportsIQ to (a) flip my `subscription_status` to `past_due` based on the Stripe webhook, (b) show me a clear warning banner on every coach surface with a one-tap link to the Billing Portal to update my card, and (c) keep my paid features unlocked for the configured grace window (Stripe's default 3-retry, ~3-week window) — and have all three behaviors covered by an automated test, so that an expired card doesn't silently drop a coach to free-tier mid-season.

## Why now (four lenses)

### Product Owner
Card-decline is the most common subscription failure mode and the single biggest preventable churn cause. Today the system has the right primitives — `subscription_status: past_due` is read by `useTier()` and surfaces a banner via `DashboardShell` — but there's zero test coverage on the webhook → status → banner → grace-window sequence.

### Stakeholder
Recoverable churn (failed payment → coach updates card → coach stays) is one of the highest-value retention loops in any subscription product. Mishandling it converts every expired-card incident into a permanent churn. This ticket protects that loop.

### User (at 5:45pm on a Tuesday, card just expired)
The coach gets a "your payment failed" email from Stripe. They open SportsIQ. They need to see, instantly, on the home dashboard: "your card was declined — update by MM/DD to keep your Coach features." One tap to the Billing Portal. That's the entire UX. If the banner doesn't render, or the wrong status fires, the coach loses Pro features mid-practice and panics.

### Growth
Every saved past-due incident is a Coach-tier-MRR save. Conservatively, half of card declines on monthly subscriptions are recoverable if the user sees a warning in-product. This ticket is the difference between recovering and not.

## Acceptance criteria

Each box maps 1:1 to a vitest test scenario.

- [ ] A `customer.subscription.updated` webhook event with `status: 'past_due'` sets `organizations.subscription_status = 'past_due'` while keeping `plan` unchanged.
- [ ] After that webhook, `GET /api/me` returns `{ org: { plan: 'coach', subscription_status: 'past_due', ... } }`.
- [ ] `canAccess(orgId, 'report_cards')` STILL returns `true` while `subscription_status: 'past_due'` AND `plan: 'coach'` (grace window — paid features stay unlocked during Stripe's retry attempts).
- [ ] `canAccess(orgId, 'report_cards')` returns `false` after a subsequent `customer.subscription.updated` with `status: 'unpaid'` or `status: 'canceled'` (Stripe's terminal state after retries exhaust).
- [ ] The DashboardShell past-due banner renders when `subscription_status === 'past_due'`, with copy that names the issue ("Your card was declined") and a CTA linking to the Billing Portal.
- [ ] The past-due banner does NOT render when `subscription_status === 'active'`.
- [ ] A subsequent `customer.subscription.updated` event with `status: 'active'` (after the coach updates their card and Stripe successfully retries) clears the past-due state: `subscription_status = 'active'` again, banner disappears, gates remain unlocked.
- [ ] The Billing Portal CTA in the banner POSTs to `/api/stripe/portal` and the route returns a `{ url }` to `billing.stripe.com` for the authenticated coach.

## Out of scope

- Email notifications to the coach (Stripe sends these natively; we don't duplicate).
- A custom retry schedule. We use Stripe's default.
- Showing the past-due state to org members other than the billing-email holder. Today every coach in the org sees the banner; that's fine for v1.
- Auto-downgrade at past_due. The flow is past_due → unpaid → canceled, and the downgrade fires on canceled (see 0003 + this ticket's "terminal state" criterion).

## Engineering notes

- `src/app/api/stripe/webhook/route.ts` — confirm the `customer.subscription.updated` branch handles `status` transitions correctly: any non-`active` status updates `subscription_status` in DB. Should already work.
- `src/components/dashboard/dashboard-shell.tsx` — locate the past-due banner. Confirm it reads `subscriptionStatus` from `useTier()` and matches against `'past_due'`. The CTA should call a small helper that POSTs to `/api/stripe/portal` and `window.location.assign(data.url)`.
- `src/app/api/stripe/portal/route.ts` — confirm it returns `{ url }` for authenticated coaches with a `stripe_customer_id`, and 400 if no customer id.
- `src/lib/tier.ts` — `canAccess()` logic: when `subscription_status: 'past_due'`, treat as `plan` value (so a Coach tier with past_due still gets Coach features). When `subscription_status: 'canceled'` or `'unpaid'`, treat as free.
- `tests/stripe/payment-failure.spec.ts` (new) — vitest spec. Drive the past_due → unpaid sequence and assert DB + tier behavior.
- `tests/components/dashboard-shell-past-due-banner.spec.tsx` (new, or extend existing) — banner render assertions.
- `tests/stripe/portal.spec.ts` (extend or new) — assert the portal route returns a valid `{ url }`.
- New deps: none.
- Migration needed: no.
- Env vars needed: none beyond 0001.
- AI prompt change: no.
- Tier feature key: no.

## Implementation log

### 2026-05-20 — implementation-dev — picked up

Moved `groomed → in-progress` on branch `feat/0004-payment-failure-handling`.

Reconciliations (groomer shorthand vs. real contract — same family as 0002/0003 lessons):
- The canonical column is `organizations.tier`, NOT `plan`. `/api/me` selects + the
  webhook writes `tier`; `/api/me` returns `{ coach: { organizations: { tier,
  subscription_status, ... } } }`, not `{ org: { plan } }`. Tests assert on the REAL shape.
- `canAccess(tier: Tier, feature)` takes a tier STRING, not an orgId, and is
  status-agnostic. The grace-window AC ("report_cards stays unlocked while past_due +
  coach; denied once unpaid/canceled") is therefore enforced by the *webhook*: it keeps
  `tier` at the priced value for non-terminal statuses (`active`/`past_due`/`trialing`)
  and flips `tier` to `free` for terminal non-paying statuses (`unpaid`/`canceled`/
  `incomplete_expired`) on `customer.subscription.updated`. `canAccess(tier, …)` then
  reads naturally: a coach in grace is still `coach`; a coach past the retry window is
  `free`. This matches the existing `customer.subscription.deleted` branch (which already
  sets `tier:'free'`) and the engineering-note intent in `src/lib/tier.ts`.
- Banner copy: the ticket asks for "your card was declined" + a Billing-Portal CTA. The
  pre-existing past-due banner said "Payment failed — update your payment method" and was
  a plain `<Link href="/settings/upgrade">`. Updated copy to name the decline and wired
  the CTA to POST `/api/stripe/portal` then `window.location.assign(data.url)` per the
  engineering note (server-side `canAccess`/billing already enforced; this is the surface).

Test-file naming deviation (LESSONS 2026-05-20): the ticket names `*.spec.ts` /
`*.spec.tsx`, but `vitest.config.ts` excludes `**/*.spec.ts` (reserved for Playwright),
so those would silently never run. Created as `*.test.ts` / `*.test.tsx` instead:
- `tests/stripe/payment-failure.test.ts`
- `tests/stripe/portal.test.ts`
- `tests/components/dashboard-shell-past-due-banner.test.tsx`

Gate run under `nvm use 20.19.0` to match CI's Node 20 (machine default is Node 25, which
breaks vitest/jsdom — LESSONS 2026-05-20).

### 2026-05-20 — implementation-dev — shipped

Merged via **PR #218** (squash, auto-merge). Gating CI green: `lint` pass (1m8s),
`unit-tests` pass (1m10s). `e2e-tests` is informational (does not gate until 0006) and
Vercel is non-gating — both ignored per AGENTS.md / LESSONS.

Code:
- `src/app/api/stripe/webhook/route.ts` — added `TERMINAL_SUBSCRIPTION_STATUSES`
  (`unpaid`/`canceled`/`incomplete_expired`); `customer.subscription.updated` now
  downgrades `tier→free` only for those, holding the priced tier for active/past_due/
  trialing (the grace window). `invoice.payment_failed`/past_due paths were already
  correct and are now covered by tests.
- `src/components/layout/dashboard-shell.tsx` — past-due banner copy names the card
  decline; CTA is now a `<button>` (`openBillingPortal`) that POSTs `/api/stripe/portal`
  and `window.location.assign(data.url)`, falling back to `/settings/upgrade` if there's
  no portal session.
- `tests/components/dashboard-shell-cancel-banner.test.tsx` — the 0003 past-due assertion
  moved link→button to match the new CTA (intent unchanged; documented inline). No passing
  test was disabled.

Tests added (all green under Node 20): `tests/stripe/payment-failure.test.ts`,
`tests/stripe/portal.test.ts`, `tests/components/dashboard-shell-past-due-banner.test.tsx`.

Full local suite: 3961 passed, 1 known-environmental fail (`player-of-match` date TZ
off-by-one — LESSONS 2026-05-20; CI's UTC Node 20 passes it).

No new deps, no migration, no env var, no AI prompt, no new tier feature key — as the
ticket specified.
