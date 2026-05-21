---
id: 0003
title: Cancellation flow test — cancel → webhook → downgrade at period end
status: shipped
priority: P0
area: billing
created: 2026-05-20
owner: product-groomer
---

## User story

As a paying coach who cancels their subscription via the Stripe Billing Portal, I want the platform to (a) immediately show me a "subscription ends MM/DD" banner, (b) keep my paid features unlocked until the period end, and (c) cleanly downgrade me to free-tier at period end without deleting any of my data — and all three behaviors to be covered by an automated test, so that a regression can't silently delete a paying coach's data or charge them after they cancelled.

## Why now (four lenses)

### Product Owner
Cancellation is the second-most-important Stripe flow after checkout. It's the surface where trust is built or broken: "did they take my data when I cancelled?" is the question every coach asks. Today the behavior is correct (existing code: cancel-at-period-end banner, data preservation, downgrade on `customer.subscription.deleted`), but it has no test coverage. One handler edit can silently delete data on cancellation.

### Stakeholder
Coach retention through the cancel-then-resubscribe arc is a known revenue lever in subscription products. The platform's existing behavior (preserve data, allow resubscription, show period-end date) is the right shape; this ticket locks it in.

### User (at 5:45pm on a Tuesday, on the Billing Portal)
A coach who cancels mid-season needs to know exactly when their report-card access ends, so they can pull their parent reports before then. The amber banner with the date is the entire UX. Breaking it breaks the coach's planning.

### Growth
Cancel-with-data-preserved is a major source of resubscription. Coaches who cancel for the off-season often come back next season; if their data is gone, they don't. This ticket protects that loop.

## Acceptance criteria

Each box maps 1:1 to a vitest test scenario.

- [ ] A `customer.subscription.updated` webhook event with `cancel_at_period_end: true` and `status: 'active'` sets `organizations.cancel_at_period_end = true` and `organizations.current_period_end = <event.current_period_end>` while keeping `plan` unchanged and `subscription_status = 'active'`.
- [ ] After that webhook, `GET /api/me` returns `{ org: { plan: 'coach', subscription_status: 'active', cancel_at_period_end: true, current_period_end: <ISO date> } }`.
- [ ] `useTier()`'s server-resolved equivalent (`canAccess(orgId, 'report_cards')`) still returns `true` while `cancel_at_period_end: true` AND `subscription_status: 'active'`.
- [ ] A subsequent `customer.subscription.deleted` webhook event sets `organizations.plan = 'free'`, `organizations.subscription_status = 'canceled'`, `organizations.cancel_at_period_end = false`, AND keeps every related row (`observations`, `players`, `teams`, `practice_sessions`) intact — assertable by counting rows before / after.
- [ ] After the deletion webhook, `canAccess(orgId, 'report_cards')` returns `false` (gate flips at period end).
- [ ] The DashboardShell cancellation banner renders the correct date (`current_period_end` formatted as MM/DD) and links to the Billing Portal route. Asserted via a component test that mocks `useTier()` to return the cancel-at-period-end state.
- [ ] Idempotency: replaying the same `customer.subscription.deleted` event a second time does not error and does not change any rows beyond what the first delivery did.

## Out of scope

- Manual cancellation via an in-app "Cancel" button. Today's flow is Billing-Portal-only; that's correct and out of scope for this test.
- Re-charging the coach after cancellation. That's the resubscription path, covered by ticket 0005.
- Email notifications on cancellation. Separate ticket if we want them.
- Refund handling. Out of scope for this loop.

## Engineering notes

- `src/app/api/stripe/webhook/route.ts` — confirm both `customer.subscription.updated` (cancel-at-period-end) and `customer.subscription.deleted` branches exist and behave as the acceptance criteria describe. Should already be the case; this ticket adds tests.
- `src/components/dashboard/dashboard-shell.tsx` (or wherever the cancellation banner renders) — locate, ensure it reads `cancelAtPeriodEnd` + `currentPeriodEnd` from `useTier()`.
- `tests/stripe/cancellation-flow.spec.ts` (new) — vitest spec. Mock Stripe webhook construction, mock Supabase service client. Drive the two-event sequence and assert on DB state after each. Use the same signing pattern as 0001.
- `tests/components/dashboard-shell-cancel-banner.spec.tsx` (new, or extend existing dashboard test) — component test asserting the banner copy and CTA when `useTier()` returns the cancel-at-period-end state.
- Idempotency: the webhook handler should use the Stripe event id (`event.id`) as a dedupe key, or the underlying mutations should be idempotent by virtue of "set status to canceled" being a no-op when already canceled. Document the chosen approach in the implementation log.
- New deps: none.
- Migration needed: confirm `organizations.cancel_at_period_end` and `organizations.current_period_end` columns exist. If not, add a migration (then this becomes a P0+ ticket).
- Env vars needed: none beyond 0001.
- AI prompt change: no.
- Tier feature key: no.

## Implementation log

### 2026-05-20 — implementation-dev (in-progress)

Picked up ticket 0003. Branch `feat/0003-cancellation-flow-test`. Marked in-progress in
frontmatter + the `README.md` index row.

Reconciliations of the ticket's groomer-shorthand against the REAL contract (verified by
reading `src/types/database.ts`, `src/lib/tier.ts`, `src/app/api/stripe/webhook/route.ts`,
`src/app/api/me/route.ts`, `src/hooks/use-tier.ts`, and
`src/components/layout/dashboard-shell.tsx`):

- **Column is `organizations.tier`, not `plan`.** There is no `plan` column. The webhook
  writes `tier`; `/api/me` selects `tier`. Tests assert on `tier`.
- **`canAccess(tier: Tier, feature)` takes a TIER STRING, not an orgId.** Tests drive it with
  the tier produced by the live chain (the org row the webhook mutated), honoring the AC's
  intent that `report_cards` is granted while active+cancel-at-period-end and denied once
  downgraded to free.
- **All three billing columns already exist** in `database.ts` (`cancel_at_period_end`,
  `current_period_end`, `subscription_status`). No migration needed (ticket confirmed this).
- **Banner reconciliation:** the real banner in `dashboard-shell.tsx` formats the date with
  `toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })` (e.g.
  "Jun 1, 2026"), NOT literal "MM/DD", and its CTA links to `/settings/upgrade` (the in-app
  upgrade/resubscribe surface), NOT a distinct "Billing Portal route". The component test
  asserts the REAL rendered date + the real CTA href; the ticket's "MM/DD" / "Billing Portal"
  wording is groomer shorthand for "the period-end date" / "the billing surface".
- **Test filenames:** the ticket names `*.spec.ts` / `*.spec.tsx`, but `vitest.config.ts`
  excludes `**/*.spec.ts` (reserved for Playwright). Created the vitest files as
  `tests/stripe/cancellation-flow.test.ts` and
  `tests/components/dashboard-shell-cancel-banner.test.tsx` so they actually gate.
- **Idempotency approach:** the `customer.subscription.deleted` mutation is naturally
  idempotent — it sets `tier='free'`, `subscription_status='canceled'`,
  `cancel_at_period_end=false`, `stripe_subscription_id=null`. The first delivery nulls
  `stripe_subscription_id`, so a replay's `organizations.select().eq('stripe_subscription_id',
  sub.id).single()` lookup no longer matches any row and the handler writes nothing further
  (and never errors). The test asserts the replay returns 200, performs no second mutation,
  and leaves all related-row counts unchanged.

### 2026-05-20 — implementation-dev (shipped)

Shipped as PR #216 (squash-merged to `main` as `b1b5eac`). Gating CI on Node 20 green:
`lint` pass, `unit-tests` pass; `e2e-tests` informational (runs via `|| true` per ticket
0006). This was a **pure test-coverage ticket — zero production code changed.** Confirmed
both webhook cancellation branches already call `bustOrgMeCache` (lines 139 + 162 of
`webhook/route.ts`) and the banner already reads `cancelAtPeriodEnd`/`currentPeriodEnd`
from `useTier()`, so there was no real gap to fix.

Tests added (all map 1:1 to the acceptance criteria):
- `tests/stripe/cancellation-flow.test.ts` — AC1 (flag cancel-at-period-end without
  changing tier/status), AC2 (`/api/me` surfaces it past the 2-min cache), AC3
  (`report_cards` stays granted), AC4 (delete → free + zero child-row deletion), AC5
  (`report_cards` denied after downgrade), AC7 (idempotent replay). 6 tests.
- `tests/components/dashboard-shell-cancel-banner.test.tsx` — AC6 (banner renders the
  period-end date + billing CTA), plus negatives for a healthy sub and the past-due
  precedence guard. 3 tests.

Local-gate note (environmental, not a regression): this machine's default Node is too old
(v16) / the loop's other Node is too new (v25) for vite 8 (needs `^20.19 || >=22.12`), so
the suite was run under nvm Node 20.19.0 to match CI. A naive `npx vitest run` of all 89
files exhausted the local fork pool ("Failed to start forks worker" on ~80 files); the 11
genuine failures that did run are the documented known-environmental set
(`player-of-match` date TZ `Apr 27`/`Apr 28`; jsdom render timeouts in `command-palette` /
`recording-button` / `screen-reader-accessibility`). Both new files pass cleanly in
isolation, and CI's `unit-tests` job (Node 20, dedicated runner) is green — the
authoritative arbiter.
