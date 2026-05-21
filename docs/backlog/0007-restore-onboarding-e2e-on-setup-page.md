---
id: 0007
title: Restore onboarding E2E coverage against the combined /onboarding/setup page
status: in-progress
priority: P1
area: infra
created: 2026-05-20
owner: implementation-dev
---

> Groom note (2026-05-21, product-groomer): moved `proposed → groomed`. The
> acceptance criteria are genuinely test-shaped — they name the exact describe
> blocks to un-skip, the real selectors on the live `/onboarding/setup` page
> (`SPORTS` incl. Basketball/Volleyball, `AGE_GROUPS`, the team-name + `season`
> inputs — all verified present), and require both blocks to pass against the
> 0006-seeded local Supabase. It is test-only and low-risk. Ready for a dev to
> pick up. Owner left as `implementation-dev` to preserve provenance (spawned
> from 0006 during the e2e hardening pass).

## User story

As the operator of the autonomous agent loop, I want the onboarding E2E specs
to assert against the live `/onboarding/setup` page (not the dead
`/onboarding/sport` and `/onboarding/team` routes), so that the sport-selection
and team-creation flows a new coach actually walks are protected by the
e2e-tests gate.

## Why now (four lenses)

### Product Owner
Ticket 0006 made e2e-tests a real gate. To get there it had to `test.skip()`
the two onboarding describe blocks in `signup-onboarding-capture.spec.ts`
because `/onboarding/sport` and `/onboarding/team` now `redirect()` to the
combined `/onboarding/setup` page — the old assertions (`choose your sport`,
exactly 3 sport cards, `create your team`, `Blue Tigers`/`Spring 2026`
placeholders, the `select` element) no longer match. The smallest unit of value:
re-point those specs at `/onboarding/setup` and un-skip them.

### Stakeholder
Onboarding is the activation funnel. A blank or broken setup page is a silent
churn driver, and right now it's the one major coach-facing surface the E2E gate
doesn't cover (it was skipped to land 0006 cleanly).

### User (at 5:45pm on a Tuesday, a new coach signing up)
A coach who can't pick a sport or name a team never gets to their first capture.
This protects that first-five-minutes experience.

### Growth
First-run completion is the top of every retention curve. Guarding it with E2E
keeps the funnel from regressing as the setup page evolves.

## Acceptance criteria

- [ ] The `Onboarding — sport selection` and `Onboarding — team creation`
  describe blocks in `tests/e2e/signup-onboarding-capture.spec.ts` are
  un-skipped and rewritten to navigate to `/onboarding/setup`.
- [ ] Assertions match the combined setup page's actual DOM: the `SPORTS` list
  (10 sports incl. Basketball/Soccer/Volleyball), the age-group control, the
  team-name + season inputs, and the enable/disable logic of its primary button.
- [ ] Both blocks pass in CI against the seeded local Supabase (the 0006 harness).
- [ ] No spec is left `test.skip()` for an obsolete-route reason after this lands.

## Out of scope

- Changing the `/onboarding/setup` page itself — this is test-only work unless a
  genuine bug is found.
- Re-adding `/onboarding/sport` and `/onboarding/team` as real pages; they are
  intentionally redirects.

## Engineering notes

- `tests/e2e/signup-onboarding-capture.spec.ts` — the two `test.describe.skip()`
  blocks (skipped by ticket 0006). Read `src/app/(auth)/onboarding/setup/page.tsx`
  for the real selectors (`SPORTS` array, `AGE_GROUPS`, season default helper).
- spawned-from: 0006 — the obsolete-route discovery was made while hardening
  e2e-tests for PR-gating.
- New deps: no. Migration: no. Env vars: no. AI prompt: no. Tier key: no.

## Implementation log

- 2026-05-21 (implementation-dev): Picked up; branch `feat/0007-onboarding-e2e-setup`,
  status → in-progress. Confirmed `/onboarding/sport` and `/onboarding/team` are
  `redirect('/onboarding/setup')` server pages and `/onboarding` is in middleware
  `publicPaths`, so the combined setup page is reachable unauthenticated — the two
  onboarding describe blocks stay in the "public pages" section (no auth/seed needed
  to render the page). Read `src/app/(auth)/onboarding/setup/page.tsx` for the real
  DOM: heading `Set up your team`; a `SPORTS` array of 10 `<button>` cards
  (Basketball/Soccer/Volleyball + 7 more); a team-name `<Input placeholder="Blue Tigers">`;
  the age-group `<select>` (AGE_GROUPS, 4 options, default `8-10`); a season
  `<Input placeholder="Spring 2026">` pre-filled by `defaultSeason()`; and a single
  primary `Continue` button gated by `canSubmit = !!sport && teamName.trim().length > 0`.
  Rewriting the two blocks to assert against that DOM and un-skipping them.
