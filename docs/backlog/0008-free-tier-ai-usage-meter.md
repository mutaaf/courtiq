---
id: 0008
title: Show free coaches their AI usage so the monthly wall stops being a surprise
status: proposed
priority: P1
area: tier
created: 2026-05-21
owner: product-groomer
---

## User story

As a volunteer coach on the Free plan, I want to see how many of my 5 monthly AI
observations I have left — before I run out, not after — so that I'm never blindsided
by a "monthly AI limit reached" wall in the middle of a Tuesday practice, and so I
can decide to upgrade on my own terms instead of feeling trapped.

## Why now (four lenses)

### Product Owner
The Free tier's monetization wedge is `maxAICallsPerMonth: 5` (`src/lib/tier.ts`),
enforced server-side inside `callAI()` (`src/lib/ai/client.ts`, lines ~430–459) and
surfaced only as a 402 `AIUpgradePrompt` *after* the cap is hit. The math is brutal:
a coach who captures twice in one practice burns 2 of 5 calls; by the second practice
of the week they hit the wall mid-session with zero warning. The function that knows
the truth — `getAIQuotaStatus()` in `src/lib/ai/quota.ts` — already exists and is
wired to *nothing*. The smallest meaningful unit of value is to expose that number on
the one surface where it matters (Capture) so the coach sees "3 of 5 AI notes left
this month" before they tap record. This *removes* a nasty surprise; it doesn't add a
new feature.

### Stakeholder
This deepens the tier-aware-quota moat by making the quota *legible*. A quota the user
can't see is a quota that converts through frustration; a quota the user can see
converts through a deliberate decision. Legible quotas are also the honest version of
freemium — they make the upgrade feel earned, not extracted, which protects the brand
the privacy page and the no-dark-patterns voice promise. No new backend, no schema
change: it reads `ai_interactions` counts that already exist.

### User (at 5:45pm on a Tuesday, 12 kids on a court)
The coach opens Capture between drills. Above the record button is a quiet line:
"2 of 5 AI notes left this month." No modal, no nag — just a fact, the same way a phone
shows battery. When they're down to their last one, the line turns amber. They are
never charged $9.99 and then walled; they decide before the wall. On a flaky gym wifi
the meter is best-effort: if the count can't load, the button still works (capture
must never be blocked by a status read).

### Growth
The retention story: a coach who knows they have "1 AI note left" comes back tomorrow
to use it — and that's the day they upgrade, calmly, instead of churning angry. The
conversion story: the upgrade prompt now has a *runway* ("you're almost out"), which
converts far better than a hard wall ("you're out"). There's no viral artifact here;
this is a retention-and-conversion ticket, and it's the highest-leverage one because it
touches the single most-used AI path (every capture) for the entire free base.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `GET /api/ai/usage` returns `200 { used, limit, tier, remaining }` for an authenticated free-tier coach, where `used` is the count of this-calendar-month `ai_interactions` rows with `status='success'` for that coach and `limit` is `5`.
- [ ] `GET /api/ai/usage` returns `200 { unlimited: true, tier }` (and no numeric `remaining`) for a `coach`, `pro_coach`, or `organization` tier coach — paid tiers must not see a meter.
- [ ] `GET /api/ai/usage` with no auth returns `401` and performs no DB read of another coach's interactions.
- [ ] The usage count is scoped to the calendar month: an `ai_interactions` row with `created_at` before the 1st of the current month is NOT counted toward `used` (vitest with a seeded prior-month row).
- [ ] Only `status='success'` interactions count: a seeded `status='error'` row does not increment `used` (mirrors the enforcement logic in `enforceAIQuota`/`callAI`).
- [ ] Playwright: a free-tier coach on `/capture` sees a usage line containing the remaining count (e.g. text matching `/\d+ of 5/`) rendered above or adjacent to the record control.
- [ ] Playwright: a paid-tier coach on `/capture` sees NO usage meter (the element with the meter test id is absent).
- [ ] Playwright/unit: when `GET /api/ai/usage` fails or times out, the capture record button is still enabled and operable (the meter degrades silently; it never gates capture).
- [ ] The meter applies an amber/warning visual state when `remaining <= 1` and a neutral state otherwise (assert by class or test-id state, observable in the component test).

## Out of scope

- Changing the Free tier limit itself (still 5). This ticket surfaces the existing cap, it doesn't re-tune it.
- A full usage dashboard or history chart. One line on Capture (and reuse on the existing 402 prompt) is the whole v1.
- Real-time/optimistic decrement after each capture. A best-effort read on Capture mount (and a re-read after returning from review) is enough; do not build a websocket or a live counter.
- Counting non-AI actions (player adds, plan saves) toward the meter. Only `ai_interactions` successes count.
- Touching the server-side enforcement path. `callAI()` already enforces the cap; this ticket is read-only reporting.
- Any new analytics event or tracker. (PostHog already exists via `src/lib/analytics.ts`; do not add new event types as part of this ticket.)

## Engineering notes

- `src/app/api/ai/usage/route.ts` (new) — `GET` handler. Auth via `createServerSupabase().auth.getUser()` → 401 if absent. Then `createServiceSupabase()` and call the existing `getAIQuotaStatus(admin, user.id)` from `src/lib/ai/quota.ts`. When it returns `null` (unlimited tier), respond `{ unlimited: true, tier }`; otherwise respond `{ used, limit, tier, remaining: Math.max(0, limit - used) }`.
- `src/lib/ai/quota.ts` — `getAIQuotaStatus()` already returns `{ used, limit, tier } | null`. No change expected; if a `remaining` field is convenient, compute it in the route, not the lib.
- The capture surface is `src/app/(dashboard)/capture/page.tsx` (a `'use client'` page). Fetch the meter with the existing client patterns — a small `useQuery` (TanStack is already imported there) hitting `/api/ai/usage`, or `query()` if it fits the allow-list; do NOT call Supabase directly from the client (AGENTS.md rule 3). Render a compact line near the `RecordingButton`; reuse zinc/orange styling, amber when `remaining <= 1`.
- Tier source of truth: `organizations.tier` (NOT a `plan` column). Paid tier values are `coach`, `pro_coach`, `organization`; free is `free`. `canAccess(tier, feature)` takes a tier STRING. (See LESSONS.md 2026-05-20.)
- `tests/ai/usage.test.ts` (new, NOT `.spec.ts` — `vitest.config.ts` excludes `**/*.spec.ts`; see LESSONS.md). Mock `createServiceSupabase` to return seeded `ai_interactions` counts and an org tier; assert the four count-scoping criteria.
- `tests/e2e/` — add the capture-meter visibility specs to the existing capture e2e (or a new spec) so they run against the seeded local Supabase from ticket 0006.
- New deps: no. Migration: no. Env vars: no. AI prompt change: no.
- Tier feature key: no new key. This reads the existing `maxAICallsPerMonth` limit, it doesn't add a `feature_*` gate.

## Implementation log

(Appended by the implementation-dev agent during execution.)
