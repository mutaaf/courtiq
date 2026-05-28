---
id: 0055
title: Show a coach the practice plans other coaches in their league have published, before generic AI suggestions
status: groomed
priority: P1
area: plans
created: 2026-05-28
owner: product-groomer
---

## User story

As a volunteer flag-football coach inside a 14-team rec league where another coach in the
same program just published a great Tuesday plan (via 0049), I want to see that coach's
plan — and the rest of my league's published plans — at the TOP of my plan-builder when I
sit down to plan Tuesday, so that the plans that already worked for kids in my own
league's age group land in front of me before a generic AI suggestion does.

## Why now (four lenses)

### Product Owner
0049 shipped the public practice-plan publish-and-clone surface: a coach can publish a
plan to a public `/plan/[token]` URL, another coach can tap "Save to my team" and clone
it. The receiver path is the parking-lot text thread — coach A tells coach B "yeah just
tap this." It works. What 0049 does NOT do is make published plans DISCOVERABLE inside
the product: if coach A publishes and coach B never gets the text, coach B never sees the
plan even though they coach in the same league for the same age group. Today there is no
in-product surface where one coach in a program can find another coach in the same program's
published plans. The smallest meaningful unit of value is one new section at the top of
the plans page — "From your league" — that lists the most recent `practice_plan_shares`
rows whose publishing coach belongs to the SAME `org_id` as the viewing coach, scoped to
the viewing coach's sport (and same age group if available), capped at five, with the
same "Save to my team" one-tap clone the public page already exposes. One new GET route
that does an org-scoped lookup, one new card on the plans page, zero new tables, zero new
AI calls, zero new sharing surface.

### Stakeholder
This is the moat ticket that turns 0049's content-graph edge into a NETWORK EFFECT inside
the existing org boundary. 0049 created the publish/clone edge type; this ticket makes
publishing INSIDE A PROGRAM compounding. Three moat deepenings, all structurally
invisible to a forms-app competitor. (1) The program-internal content moat: the more
coaches in a program publish, the more valuable SportsIQ is to every OTHER coach in that
program — a single-coach competitor cannot replicate this because they have no
program graph and no published-plan corpus. (2) The cross-coach habit moat: a coach who
clones a plan from a colleague this week is more likely to publish their own next week
(reciprocity), so the program's publish-rate compounds the more cloners there are. (3)
The org-tier value moat: programs on the `organization` tier ($49.99/mo) get a tangible
"why does the org tier matter" answer they don't have today — your coaches share their
work with each other. Today a program director can invite their staff (0024) but the
staff don't actually share anything inside the product. This is the missing edge.

Importantly: this is NOT a tier-gated PUBLISHING surface (publishing stays universal so
the loop stays open) — only the in-product discovery surface that shows OTHER coaches'
plans-in-your-league. The discovery is universal too (free coaches in a program see their
program's plans), because gating discovery would invert the loop the same way gating
publish would. The org/program-tier value is the underlying graph and the org-pulse
rollup (0028), not this discovery surface itself.

### User (the coach, Sunday night, planning Tuesday, 30 minutes between dinner and bedtime)
She opens /plan. At the top of the page, above her AI-suggested plan and above the drill
library, a small new section: "From your league (3)." Three lines: "Coach James — Tuesday
catch-up — flag football, age 8" / "Coach Sarah — closeout passing — flag football,
age 9" / "Coach Maya — 30-minute station rotation — flag football, age 8." Each line has
a "Save to my team" button and a small preview link. She taps "Save to my team" on
James's plan; a sheet confirms which team to clone onto; tap done. The cloned plan opens
as a fresh draft she can edit and run Tuesday. If her program has no other coaches who
have published, the section renders nothing (silence beats an empty "no plans yet" guilt
trip). If she's a SOLO coach not in a program (no `org_id`), the section also renders
nothing — there's no "league" to draw from. On a flaky connection the section is best-
effort; it never blocks the plans page from loading.

### Growth
The "show me" moment is the coach opening /plan on Sunday night and seeing three
colleagues' plans staring back at her, each clone-ready in one tap. That's the
screenshot another coach in the program sends to her own assistant when she
realizes "I have to publish next week or I'm the only one not contributing." It is the
single highest-leverage retention surface for the program-tier moat: the value of being
in a program on SportsIQ becomes a thing you can SEE in the product, not just a thing
the price page tells you. Concretely: every cloner is a recurring weekly visitor (the
section refreshes weekly with new plans). Every publisher gets a quiet "your plan was
cloned 4 times this week in your league" note already shipped by 0049's clone-count
surface, which now fires from a much warmer audience (program colleagues, not random
strangers). The compounding curve is asymmetric — the surface is built once, the program
grows its own internal library forever. Distinct from every shipped surface: 0024
invites the coaches; 0028 rolls up the program pulse to the director; 0044 suggests
the next drill from network signals; THIS lets the program's coaches see each other's
WORK on the planning page, which is the only surface where they actually do their
craft together.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] No migration. The data is already there: `practice_plan_shares (coach_id, plan_id,
  is_active, created_at)` exists from 0049, and `coaches.org_id` exists from 001_schema.
  This ticket only adds a new GET route, a new client card, and a small read pattern.
  (vitest: assert no new file under `supabase/migrations/` is added by this ticket;
  the AC scanner sees zero new migrations.)
- [ ] `GET /api/practice-plan-shares/league?teamId=<id>` (new) returns
  `{ plans: Array<{ token, planTitle, publishedAt, coachFirstName, sportSlug,
  ageGroup, sourcePlanId, note }>, eligible: boolean }`. The route is authed
  (`createServerSupabase().auth.getUser()` → 401). It resolves the caller's `coaches.org_id`;
  if NULL → returns `{ plans: [], eligible: false }` (the solo-coach case — they have no
  league). It resolves the active team's `sport` from the `teams` table. Then it queries
  `practice_plan_shares` joined with `plans` + `teams` + `coaches`, filtered by
  `coach.org_id = caller.org_id AND coach.id != caller.id AND practice_plan_shares.is_active = true
  AND team.sport = caller_team.sport`, ordered by `created_at DESC LIMIT 5`. The response
  contains ONLY the listed fields — never the publishing coach's email, full name (first
  name only), or any minor data. (vitest: 401 on missing auth; 200 with `eligible: false`
  when caller has no `org_id`; 200 with a populated list when caller's org has other
  coaches who've published in the same sport; the response keyset deep-equality matches
  the documented shape; the SQL filter never returns the caller's own published plans;
  the SQL filter never returns plans from a different sport.)
- [ ] The plans page (`src/app/(dashboard)/plan/page.tsx` — read first) renders a new
  `<LeaguePlansSection />` at the TOP of the page (above the AI-suggested plan card and
  above the existing drill library). The section uses `query()` to call the new GET
  endpoint and renders the returned plans as a small list, each with a "Save to my team"
  button that reuses the existing `/api/practice-plan-shares/clone` route shipped by
  0049 — passing the `token` and the caller's active `team.id`. On success the cloned
  plan opens on the same page as a fresh draft (same UX as the public clone path). When
  `eligible: false` or `plans.length === 0` the section renders nothing (no nag).
  (Playwright/component: render with `eligible: true` and 3 plans → 3 rows + 3 save
  buttons; render with `eligible: false` → no DOM; render with `eligible: true, plans:
  []` → no DOM. The save button POSTs the clone with the right token + teamId.)
- [ ] The `/api/practice-plan-shares/clone` route (existing — shipped by 0049, read
  first) is unchanged in its contract. The new league-discovery surface is a CONSUMER of
  the existing clone endpoint, never a re-implementation. The new `source_plan_id` set on
  the cloned plan is the SAME chain the public clone uses, so the analytics-free
  attribution stays unified across discovery paths. (vitest: the clone route's existing
  tests pass unchanged; a clone fired from the league section produces a `plans` row
  with `source_plan_id` set to the published plan's id; the publishing coach's clone-count
  surface (0049's `/clone-count`) sees this clone.)
- [ ] Tier / privacy: NO new `feature_*` key. The league-discovery surface is universal
  across tiers for any coach with an `org_id` — gating discovery would invert the loop
  (the program's value to a free coach is exactly seeing their colleagues' plans).
  Publishing remains universal (free coaches can publish per 0049). The org/program-tier
  value lives in 0024 (org-staff invite) + 0028 (program pulse), NOT this surface.
  (vitest: a `free`, `coach`, `pro_coach`, and `organization`-tier coach with an
  `org_id` all receive a populated list when one exists; the response is byte-identical
  across tiers.)
- [ ] Privacy / COPPA: the response NEVER includes minor-scoped data — no player names,
  no observations, no per-player stats. The publishing coach's full name, email, and
  avatar are NOT returned (only `coachFirstName` — same posture as 0047's celebration
  payload). The `practice_plan_shares` table from 0049 carries no minor data, and this
  ticket reads from it without joining `players`, `observations`, or `parent_shares`.
  (vitest: the response payload's keyset is exactly the seven documented fields; planted
  player-name / parent-name tokens in the publishing coach's seeded data do NOT appear
  in the response.)
- [ ] Cross-org isolation: a caller's org_id IS the entire access boundary. Two seeded
  orgs (`org_A` with two coaches, `org_B` with one coach) — coach in `org_A` calls the
  endpoint; receives ONLY the other `org_A` coach's plans, NEVER the `org_B` coach's
  plan even if both published. A null-org caller receives the empty `eligible: false`
  response and NEVER sees any plans from any org. (vitest: org_A coach + org_B coach
  matrix; null-org caller; assert zero leakage in each.)
- [ ] Voice contract: every new user-facing string ("From your league", the row format
  "Coach <first_name> — <plan_title> — <sport> age <age_group>", the empty state
  copy if shown anywhere, the save-button label "Save to my team") contains NO AGENTS.md
  banned word (`journey`, `amazing`, `exciting`, `elevate`, `empower`, `synergy`). Per
  LESSONS#0023 the copy is factual; never enumerates banned tokens. (vitest: scan every
  new component's rendered text for the banned tokens.)
- [ ] The endpoint is rate-limited at a sensible read-rate (the existing `query()`
  helper handles caching; the route itself does not need a per-IP limiter beyond what
  `/api/data` provides). The query is cached by `team_id` for 5 minutes server-side so
  the plans page doesn't re-hit the DB on every navigation; cache invalidates when a
  new `practice_plan_shares` row is inserted for a coach in the org (a simple per-org
  cache key + `bustLeagueCache(orgId)` helper called from the 0049 publish route — same
  pattern as LESSONS#0041 `bustOrgMeCache`). (vitest: the cache key is `org_id`-scoped;
  invalidation fires on a sibling coach's publish; a second read within 5 minutes
  returns the cached payload.)
- [ ] Regression: the existing `/api/practice-plan-shares/create`, `/clone`,
  `/clone-count`, `/clone-count/seen` routes are untouched. The existing 0049 e2e spec
  passes unchanged. The 0044 "next-drill from same-sport network" surface is untouched —
  these are complementary moat surfaces (drill-level vs plan-level), not overlapping.
  (vitest: snapshot the existing routes' top-level handler signatures; assert no
  changes.)

## Out of scope

- A search box / filter UI on the league section. v1 is "the 5 most recent plans from
  your league in your sport, period." Sort/filter/categorize is a future ticket once
  programs have enough volume to need it.
- A cross-org / cross-league directory ("see plans from other programs near you"). v1 is
  strictly intra-org. Cross-org discovery is a separate privacy decision and a
  separate ticket.
- A "thumbs up" / rating / comment thread on league plans. The clone count from 0049 IS
  the implicit signal; v1 does not add a second signal type.
- A weekly digest email of "new plans in your league this week." v1 is in-product only.
  A future ticket can add it once cadence and noise dynamics are known.
- Auto-suggesting one of the league plans as the AI's primary suggestion. v1 is a
  separate section ABOVE the AI suggestion. Threading the league corpus into the AI
  prompt itself is a future ticket (and a different conversation about provider
  context limits + COPPA on prompted plan content).
- Showing the league section on the home page or capture page. v1 is the plans page
  only — the surface where a coach is actively planning.
- A "claim contributor of the week" badge / leaderboard for top publishers in a league.
  v1 records nothing beyond what 0049 already records.
- Pagination / "see all 47 plans this league has published." v1 is top 5 by recency.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- NO new migration. All data lives in `practice_plan_shares` (from 0049) +
  `coaches.org_id` (from 001_schema) + `plans` + `teams`.
- `src/app/api/practice-plan-shares/league/route.ts` (new) — `GET(request)`. Auth →
  401. Read `?teamId=` (validate it belongs to the caller via `team.coach_id =
  caller.id`; if not → 404, same posture as LESSONS#0036's org-ownership 404). Resolve
  caller's `org_id` + the team's `sport`. Query `practice_plan_shares` joined to
  `plans` + `teams` + `coaches` with the filter described in the AC. Cap at 5. Return
  the documented shape via service-role read. NEVER include the publishing coach's
  email or `full_name` (split to first name).
- `src/lib/league-plans-utils.ts` (new) — pure helper `formatLeaguePlanRow({ planTitle,
  coachFirstName, sportSlug, ageGroup })` returns the human-readable line. NO database
  access.
- `src/lib/cache/league-plans-cache.ts` (new, OR extend the existing memory cache used
  by `bustOrgMeCache` — find it via `grep -rn "memBust" src/lib/`) — a 5-minute
  in-memory cache keyed by `league:${org_id}:${sport}`. Export a `bustLeagueCache(orgId,
  sport?)` helper.
- `src/app/api/practice-plan-shares/create/route.ts` (existing, shipped by 0049 —
  read first) — on a successful publish, call `bustLeagueCache(coach.org_id,
  team.sport)` so the next league-discovery read for the org reflects the new plan
  immediately. This is the SAME pattern as 0002's `bustOrgMeCache` after Stripe webhook
  (LESSONS#0041) — bust the rare path, don't tax the hot read.
- `src/components/plan/league-plans-section.tsx` (new) — client component. Uses
  `query()` to call the new GET endpoint. Renders nothing on `eligible: false` or empty
  list. Each row has a "Save to my team" button that uses `mutate()` to POST
  `/api/practice-plan-shares/clone`. Dark/zinc/orange aesthetic, 44px targets, no
  banned words.
- `src/app/(dashboard)/plan/page.tsx` (existing — read first; this is the hotspot file
  per LESSONS#0065/#0066, expect to merge carefully) — render
  `<LeaguePlansSection />` at the TOP of the page. The section's `useQuery` is enabled
  whenever there's an active team. It renders nothing on `eligible: false` so the page
  is byte-identical for solo-coaches.
- `src/lib/supabase/middleware.ts` — NO change. The new route is dashboard-only / authed.
- `tests/api/practice-plan-shares-league.test.ts` (new, `.test.ts` NOT `.spec.ts` —
  LESSONS#0020/#38) — 401 missing auth; 404 on wrong-team-id; the matrix of
  `eligible: false` (solo coach) / empty list (org with no other publishers) /
  populated list (org with 2+ publishers in same sport); cross-org isolation; same-sport
  filter; caller-exclusion filter; response keyset deep-equality. Run `tsc --noEmit`
  without piping (LESSONS#0095/#0096). Run under Node 20.19.0 (LESSONS#0010).
- `tests/lib/league-plans-utils.test.ts` (new) — pure-helper format cases.
- `tests/lib/league-plans-cache.test.ts` (new) — set/get/bust cycle; per-org key
  isolation; 5-minute TTL.
- `tests/components/league-plans-section.test.tsx` (new) — render with `eligible: true,
  plans: [3 rows]` → asserts the 3 rows render; render with `eligible: false` →
  asserts nothing renders; click "Save to my team" → asserts the clone route is POSTed
  with the right token + teamId.
- `tests/e2e/league-plans-discovery.spec.ts` (new Playwright spec) against the 0006-
  seeded Supabase. Seed: extend `tests/e2e/fixtures/seed.sql` to add a second coach in
  the SAME org as the E2E coach, with one `practice_plan_shares` row pointing at a
  seeded plan on a same-sport team. Per LESSONS#0084 — seed BOTH `auth.users` AND
  `coaches` rows with matching UUIDs for any new coach. Per LESSONS#0101 — pick the new
  seed-row UUIDs in a non-colliding range. Spec: sign in as the E2E coach, visit
  `/plan`, assert the league section renders with the second coach's first name and the
  plan title via a stable `data-testid` on the section container (LESSONS#0081). Tap the
  save button, assert the clone is created (the plans-list refreshes with a new draft).
  Skip when E2E creds are unset.
- `tests/integration/league-plans-cache-bust.test.ts` (new, smaller) — the publish
  route's `bustLeagueCache` hook fires on a successful insert; a second league-read
  call sees the new plan immediately.
- New deps: NO. Migration: NO. Env vars: NO. AI prompt change: NO. Tier feature key:
  NO.
- LESSONS to anchor: #0036 (org-ownership 404 pattern; the team belongs to the caller).
  #0041 (cache-bust on the rare-write path; the hot read stays cached).
  #0023 (voice positively; never enumerate banned tokens). #0039 (never trust a client-
  supplied teamId past validation; same posture as drill-signal coach_id). #0078
  (response keyset deep-equality). #0081 (data-testid scoping in Playwright). #0084
  (seed `auth.users` + `coaches` rows with matching UUIDs for any new e2e coach).
  #0092/#0100 (when extending a route that sibling tests mock, drain mock queues with
  `mockFromFn.mockReset()` in `beforeEach` and update every consumer's mock — but this
  ticket adds a NEW route, so existing mocks are untouched). #0101 (pick new seed-row
  UUIDs in a non-colliding range).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0055-...` opened
- YYYY-MM-DD — failing test added in `tests/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
