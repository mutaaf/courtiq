---
id: 0003
title: Cancellation flow test — cancel → webhook → downgrade at period end
status: groomed
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

(Appended by the implementation-dev agent during execution.)
