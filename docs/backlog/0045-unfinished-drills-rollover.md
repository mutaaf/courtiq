---
id: 0045
title: Carry the drills the coach didn't get to last practice into next week's plan
status: shipped
priority: P1
area: plans
created: 2026-05-26
owner: product-groomer
---

## User story

As a volunteer coach who wrote a six-drill plan for Tuesday, ran four of them, and ran out
of practice time before the last two, I want next week's plan to open with the two drills I
didn't get to — quietly, at the top, marked "rollover from last week" — so that the work I
already chose to do isn't lost in the gap between sessions and I don't have to remember
which two I skipped on a Sunday night at the kitchen table.

## Why now (four lenses)

### Product Owner
We already persist a practice plan as a `plans` row with `type='practice_plan'` and a
structured drill list inside `content_structured.drills` (the same shape the practice-arc
and signature 0037 reads). We already have a drill queue in `practice-queue` localStorage
that the in-practice timer reads from, and we already have a `drill_run_history` signal the
0039 server signals are merging from. What we do NOT have is the single most boring piece
of continuity any volunteer coach actually needs: "I didn't get to drill 5 or drill 6 last
time — start me there this time." Today the coach scrolls back through last Tuesday's plan,
remembers what fell off, and re-types it. The smallest meaningful unit of value is one
column on `plans` (`completed_drill_ids jsonb default '[]'`) that the timer's "end practice"
flow stamps with the actual drills that got run, plus one pure helper that diffs the last
plan's drill list against the completed set and surfaces the unfinished ones into the next
practice plan's prompt as a soft "carry forward" hint AND into the in-app drill queue when
the coach taps "make next practice." One column, one diff, two existing surfaces lit up.

### Stakeholder
This is a Practice-Arc moat deepener at the most-used surface in the product. The arc memory
(0018 / 0020 / 0014) already remembers what THE TEAM has been working on week to week; this
adds the drill-grain memory the coach actually plans against. It compounds three existing
shipped systems without forking any of them: (1) the practice-plan generator already accepts
soft prompt hints (program-focus 0031, coaching signature 0037, arc context 0018) — adding
a "carry these forward" hint is the exact same plumbing; (2) the drill queue already exists
and already syncs to localStorage — pre-seeding it with the rolled-over drills is one append;
(3) the coach-drill-signals 0039 already records run history per coach — the same stamp
that 0039 uses to count run_count tells us which drills actually ran. A competitor's day-1
clone cannot produce "the two drills you didn't get to" because they don't have the plan,
the run history, OR the arc memory the diff is computed against. The longer a coach stays,
the more accurate this gets.

### User (Sunday night, kid asleep, coach planning Tuesday)
They tap "Make next practice." At the top of the generated plan, two lines they recognize:
"Carrying from last week: corner shooting (didn't get to) and 3-on-3 to shot (didn't get
to)." The rest of the plan still gets generated fresh against the team's last weeks of
notes — the rollover is a SUGGESTION, not a lock — and the coach can swipe-dismiss either
rolled-over drill if they don't want it back. The drill queue (the thing the in-practice
timer reads from) already has those two drills slotted at the top of next Tuesday's
queue when they hit play. No new tap, no "did you finish your plan?" survey, no nag — the
fact that drill 5 and drill 6 were skipped is read off existing structure (the plan list
minus the run-history stamp).

### Growth
This is a retention-by-restraint ticket, not a viral one. The "show me" moment is small but
specific: a coach sits down to plan, sees "carrying from last week" at the top of the AI's
suggestion, and recognizes their own unfinished work — the kind of detail that makes a
volunteer feel the app is paying attention. It also lifts every downstream artifact:
practice plans the coach actually runs produce observations, which produce parent reports
and weekly stars, which produce the viral surfaces 0017/0027/0017 already ship. The
compounding is invisible per-session and dramatic over a season.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `04N_plans_completed_drills.sql` adds exactly one column
  `plans.completed_drill_ids jsonb NOT NULL DEFAULT '[]'::jsonb` and nothing else; the
  column collects NO new minor data — it records which drill IDs (or drill name slugs, see
  engineering notes) the coach actually ran in that plan. Pick the next free integer prefix
  AFTER 0044's `044_…` and document the prefix decision in the Implementation log per
  LESSONS#0006. (vitest scans the migration's executable DDL — strip `--` comments first
  per LESSONS#0088 — and asserts only the documented column is added; banned tokens
  `player`, `parent`, `observation`, `medical` are absent.)
- [ ] A pure helper `diffPracticeForRollover(plan, completedDrillIds): { rolloverDrills:
  Drill[], reason: 'time_ran_out' | 'all_completed' | 'no_prior_plan' }` lives in
  `src/lib/practice-rollover-utils.ts`. Given the previous plan's `content_structured.drills`
  array and the `completed_drill_ids` stamp, it returns the drill objects whose ID/slug was
  NOT in the completed set, capped at 3 (a coach who skipped half a plan needs help, not a
  full re-run). With an all-completed prior plan it returns `{ rolloverDrills: [], reason:
  'all_completed' }`; with no prior plan it returns `{ rolloverDrills: [], reason:
  'no_prior_plan' }`. (vitest: all four matrix cases — partial-completion, full-completion,
  no-prior-plan, cap-at-3.)
- [ ] The in-practice timer's "end practice" flow stamps the `completed_drill_ids` array on
  the plan row via the existing `mutate()` helper (AGENTS.md rule 3 — never a direct client
  Supabase write). The stamp records the IDs of drills the coach DID run; never the inverse.
  If the timer is force-closed without an explicit end, the array remains the default `[]`
  and the rollover helper treats that plan as if every drill was skipped — which is
  intentionally generous (the coach who got nowhere should get a strong rollover
  suggestion). (vitest: the end-practice handler calls `mutate({ table: 'plans', id, set: {
  completed_drill_ids: [...] } })` with the right payload; a force-close path leaves the
  array empty.)
- [ ] `POST /api/ai/plan` (existing) fetches the SAME coach + SAME team's most recent prior
  `plans` row of `type='practice_plan'`, runs `diffPracticeForRollover` against its
  `completed_drill_ids`, and threads the resulting `rolloverDrills` into the `practicePlan`
  prompt's existing soft-hint slot (alongside `programFocus` and `coachingSignature`). When
  the diff returns `rolloverDrills: []` for any reason, the prompt's "carry forward" block
  is OMITTED — the prompt is byte-identical to today's output for a coach with no prior
  plan or a fully-completed prior plan. (vitest: route-level test with a seeded prior plan
  + completed stamp; assert the prompt builder receives the rollover drills; a cold-start
  coach receives no rollover and the prompt is unchanged.)
- [ ] The generated practice plan's `content_structured` includes a top-level
  `rollover_from_last_week: { drill_id: string, drill_name: string, source_plan_id: uuid }[]`
  array — empty by default. The plans page renders a quiet "Carrying from last week: …"
  line above the drill list ONLY when this array is non-empty. The schema validator accepts
  the new field as optional. (vitest: the schema accepts and rejects correctly; a plan with
  rollover renders the line; a plan without renders nothing.)
- [ ] When the coach taps "Add to queue" on a freshly-generated plan with rollover drills,
  the rolled-over drills land at the TOP of the local `practice-queue` (the existing
  localStorage queue the timer reads from), in the order they were rolled over, BEFORE the
  newly-generated drills. (Playwright/component: a coach with a seeded prior plan +
  partial completion taps generate; the queue's first two entries are the rollover drills;
  the rest of the queue is the new plan's drills in order.)
- [ ] Voice contract: the prompt's "carry forward" instruction block contains NO AGENTS.md
  banned word in either the system or user block (`journey`, `amazing`, `exciting`,
  `elevate`, `empower`, `synergy`). Per LESSONS#0023 the instruction is POSITIVE ("if the
  coach didn't get to a drill last week, prefer carrying it forward") and never enumerates
  the banned tokens verbatim. (vitest scans the rendered prompt string and asserts none of
  those tokens appear.)
- [ ] Tier / privacy: NO new `feature_*` key. Rollover is universal — gating the most
  basic Practice-Arc continuity would invert the moat. The rolled-over drills are scoped
  to the coach's own plans on their own teams (the SELECT is `eq('coach_id', user.id).eq(
  'team_id', teamId)` server-side); a cross-org plan id is unreachable. The
  `completed_drill_ids` column carries NO minor data — drill IDs/slugs only. (vitest: a
  second coach's plan never appears in the diff for the first coach; the rollover prompt
  block contains no player names; the column's DDL is scanned for banned tokens.)
- [ ] Regression: the existing practice-plan generation path for a coach with no prior
  plans (or with `completed_drill_ids = []` everywhere) produces a plan that is
  byte-identical in shape and content to today's behavior. The `practiceArc` route's
  existing context-building (0018) is untouched. The 0039 `coach_drill_signals` write
  paths stay byte-identical. (vitest: pin the existing cold-start plan output via a
  fixture; assert the new diff helper is invoked but contributes nothing when the prior
  plan is absent.)

## Out of scope

- Auto-stamping `completed_drill_ids` based on TIME spent per drill rather than the coach's
  explicit "end practice" action. v1 is the coach's explicit signal only — auto-stamping
  by timer drift invites false negatives (a drill the coach actually ran but didn't tap
  through gets rolled over and feels wrong).
- A "you didn't finish your plan" email or push notification. The rollover is a pull-only
  surface — it appears when the coach taps "make next practice," nothing reaches out to
  them in between. Adding a cron would require its own ticket-level approval line.
- Rolling drills across coaches or teams. A drill the head coach skipped on team A does
  NOT roll into the assistant coach's team B. The rollover is strictly per-(coach, team).
- Rolling beyond the immediately-prior plan. v1 looks at the LAST practice plan only; a
  multi-week rollover ("you've skipped this drill for three weeks") is a separate ticket
  and a separate UX decision.
- Persisting a per-drill "why I skipped it" reason. v1 only stamps the completed IDs;
  inferring why a drill was skipped is a separate diary-style ticket that we're not adding.
- Threading the rollover hint into the `practiceArc` prompt as well as `practicePlan`. v1
  is plan-only; the arc generator is a different surface with different inputs and is left
  unchanged.
- A coach-facing "edit which drills got completed" UI. v1 trusts the timer's end-practice
  stamp; a manual edit screen is a separate ticket once we've seen real usage.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- New migration `supabase/migrations/04N_plans_completed_drills.sql` — adds the
  `completed_drill_ids jsonb NOT NULL DEFAULT '[]'::jsonb` column on `plans`. Pick the next
  free prefix AFTER `044_…` (drill-sequence aggregates from 0044). Document the chosen
  prefix in the Implementation log per LESSONS#0006. Confirm `plans` is already on the
  `mutate()` allow-list (it is — multiple shipped tickets touch it).
- `src/types/database.ts` — extend the `Plan` row type with `completed_drill_ids: string[]`.
  Update the type the `mutate()` helper consumes.
- `src/lib/practice-rollover-utils.ts` (new) — pure helper:
  `diffPracticeForRollover(plan: { content_structured: { drills: Drill[] } } | null,
  completedDrillIds: string[]): { rolloverDrills: Drill[], reason }`. The helper relies ONLY
  on the plan's existing drill IDs (or, if the existing plan content uses drill name slugs
  rather than UUIDs, normalize to slugs and document the choice). NO database access in this
  file; the route does the IO.
- `src/app/api/ai/plan/route.ts` (existing) — alongside the existing context fetches
  (program-focus, coaching-signature), fetch the LAST `plans` row for `(coach_id, team_id,
  type='practice_plan')` ordered by `created_at DESC LIMIT 1`. Run
  `diffPracticeForRollover(priorPlan, priorPlan.completed_drill_ids)`. Pass the resulting
  `rolloverDrills` into the `practicePlan` prompt params alongside the existing soft hints.
  The route's existing `callAIWithJSON({ orgId })` + quota + tier behavior is unchanged.
- `src/lib/ai/prompts.ts` — extend the `practicePlan` prompt's params shape to optionally
  accept `rolloverDrills: { name, focus, duration_minutes }[]`. When present, the prompt
  instruction tells the model to consider carrying these forward; when absent, the prompt
  block is omitted. Voice is POSITIVE — never enumerate banned words (LESSONS#0023).
- `src/lib/ai/schemas.ts` (or wherever `practicePlanSchema` lives) — extend the schema with
  optional `rollover_from_last_week: { drill_id, drill_name, source_plan_id }[]` (default
  `[]`). The output is the model's RECONCILIATION between the rolled-over drills and the
  team's current needs — the model may keep all rollovers, swap one out, or fold them into
  the regular drill list with the rollover annotation preserved.
- `src/components/plans/practice-plan-view.tsx` (or the existing plan render component) —
  render a quiet single-line "Carrying from last week: …" above the drills section ONLY
  when `content_structured.rollover_from_last_week` is non-empty. Dark zinc/orange, 44px
  targets, no banned words, no emoji-decorated headings. The line is purely informational —
  no upsell, no nag.
- `src/components/timer/end-practice-flow.tsx` (or wherever the timer's "end practice" UI
  lives — read `src/components/timer/` first) — on tap-to-end, gather the set of drill IDs
  the timer actually advanced through (the run-history hook already records these — read
  `src/lib/drill-run-history-utils.ts` first) and call `mutate({ table: 'plans', id:
  activePlanId, set: { completed_drill_ids: [...completed] } })`. Best-effort: a failure
  leaves the column empty and the next rollover treats it as "nothing completed."
- `src/components/plans/add-to-queue-button.tsx` (or wherever the "add to queue" handler
  lives — read `src/lib/practice-queue-utils.ts` and the plan page first) — when the active
  plan's `content_structured.rollover_from_last_week` is non-empty, prepend those drills to
  the local queue BEFORE the new plan's drills. Order matches the rollover array's order.
- `tests/lib/practice-rollover-utils.test.ts` (new, `.test.ts` NOT `.spec.ts` —
  LESSONS#0020/#38). Pure-helper cases: partial completion, full completion, no prior
  plan, cap-at-3, missing/empty `completed_drill_ids`.
- `tests/api/ai/plan-rollover.test.ts` (new) — route-level: seed a prior plan with 6 drills
  and `completed_drill_ids` containing 4 of them; assert `callAIWithJSON` is invoked with
  the prompt params containing the 2 rolled-over drills; assert a cold-start coach (no
  prior plan) calls the AI with no rollover block and the prompt rendered string is
  byte-identical to today's fixture. Run `tsc --noEmit` after (LESSONS#0008). Run under
  Node 20.19.0 (LESSONS#0010).
- `tests/components/practice-plan-rollover-line.test.tsx` (new) — render the plan view with
  + without `rollover_from_last_week`; assert the line renders only in the present case.
- `tests/migrations/plans-completed-drills.test.ts` (new) — scan the migration's
  executable DDL (strip `--` comments first per LESSONS#0088); assert the column allow-list
  matches exactly; banned-token absence as in AC8.
- `tests/e2e/practice-rollover-flow.spec.ts` (new Playwright spec) against the
  0006-seeded Supabase. Seed: one coach + one team + one prior `plans` row of
  `type='practice_plan'` with 4 drills in `content_structured.drills` and
  `completed_drill_ids` containing 2 of them. The spec navigates to the plans page, taps
  "Make next practice," asserts the rendered plan shows a "Carrying from last week"
  line referencing the two skipped drills (data-testid on the container, LESSONS#0081);
  then taps "Add to queue" and asserts (via a small inspection page or localStorage probe
  via `page.evaluate`) that the queue's first two entries are the rollovers. Skip when
  E2E creds are unset (convention).
- New deps: NO. Migration: YES — one nullable jsonb column on an existing table. Env vars:
  NO. AI prompt change: YES — extend the `practicePlan` prompt's params. Tier feature key:
  NO.
- LESSONS to anchor: #0006/#0009 (migration prefix uniqueness; coordinate with 0042/0043/
  0044). #0023 (instruct voice positively in the prompt's carry-forward block). #0039
  (when editing a shared route's `from()` calls, drain sibling test mocks with
  `mockFromFn.mockReset()` in `beforeEach`; the plan route now reads one more table). #0008
  (run `tsc --noEmit` after route tests). #0081 (data-testid scoping in Playwright).

## Implementation log

- 2026-05-26 — branch `feat/0045-unfinished-drills-rollover` opened, status flipped
  groomed → in-progress on a tiny first commit for a durable base (LESSONS#93).
  Migration prefix: 043_ — chosen as the next free integer after the last shipped
  migration prefix on main (`042_coaches_paused_until.sql`); the supabase CLI keys
  applied migrations on the leading `<version>_` token, so a unique prefix avoids
  the schema_migrations duplicate-key class of failure (LESSONS#6).
  Drill identity: the practicePlanSchema's `drills[]` array has only `name` (no
  `id`), so this ticket uses normalised name-SLUGS as the rollover key everywhere
  — `completed_drill_ids` stores slugs, the timer stamps slugs, and the
  `diffPracticeForRollover` helper compares slug-against-slug. This matches the
  engineering-notes hint ("drill IDs OR drill name slugs"). Slugs survive
  capitalisation/whitespace drift; the alternative (raw display name) would let
  trivial casing changes leak rollovers across plans.
