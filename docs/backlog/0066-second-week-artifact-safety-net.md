---
id: 0066
title: When a coach asks for their second parent report and the notes are thinner than week one, make the report fall back to "what carried forward" instead of inventing
status: shipped
priority: P1
area: ai
created: 2026-06-03
owner: product-groomer
---

## User story

As a brand-new coach who had a great Week 1 (loaded notes, generated a parent
report for every kid, got reactions, felt seen) and is now sitting on Week 2's
much-thinner-than-week-1 notes (Tuesday practice got canceled, Saturday game
was a 35-minute scrimmage, I have 3 observations on the roster instead of 14),
when I tap "Generate parent report" for the second time I want the report to
say something REAL — anchored to what Week 1's report promised and what
actually carried forward — instead of either (a) padding the thin notes into
generic-sounding praise that destroys the trust I just built with parents OR
(b) refusing to generate and pushing me out of the habit on the exact week
the habit is most fragile, so that the parents who got the great Week 1
report get a credible Week 2 report and I get pulled into Week 3.

## Why now (four lenses)

### Product Owner

The product has shipped a STRONG activation moment (0030 walks the coach to
their FIRST shareable AI artifact the moment they have enough notes) and a
STRONG continuity primitive (0016 makes the parent report a continuity
artifact that tells the growth story since the last report). What is
unguarded is the WEEK-2 INTERSECTION of those two: the brand-new coach who
JUST generated their first artifact in Week 1 (so 0030's eligibility
function flips off, by design) but whose Week 2 observation count is too
thin for 0016's growth-story prompt to anchor cleanly. Today the parent-
report prompt at this moment does one of two failure modes: (a) it pads the
thin notes into generic praise that sounds AI-written ("Maya continues to
show great hustle and improvement") which destroys the trust the Week 1
report built; or (b) the AI returns a refusal-like one-paragraph stub
("there is limited new information this week to report on") which makes the
coach feel the product failed them and pushes them out of the habit on the
exact week the habit is most fragile. The smallest meaningful unit of value
is ONE prompt change in `src/lib/ai/prompts.ts` + ONE upstream branch in
the parent-report route: when the route detects "this is artifact #2+ AND
the new observations since the last report are < N (a tunable, default 4)",
it passes a SECOND continuity context block to the prompt naming the
PREVIOUS report's three specific commitments (what Week 1 promised the
parent the kid would be working on) AND any Week 2 observation that
touches those same skill families, AND it instructs the model POSITIVELY
to ANCHOR the new report to that continuity ("this week was lighter on
practice — here's what carried forward from what we told you last time")
instead of inventing growth that isn't there. The output is one short
honest paragraph + a one-line "what we're watching next" tied to the
existing focus arc.

### Stakeholder

This is the deepest expression of the structured-continuity moat the product
has, and the single most leveraged early-retention surface. Three
compoundings, all distinct from anything shipped. (1) The trust-preservation
moat — the parent report is the artifact most likely to be FORWARDED to
other parents (the 0050 / 0019 / 0011 viral surfaces all leverage it). A
thin Week 2 report that sounds AI-generic destroys the FORWARDING-grade
trust the Week 1 report earned; the loop's viral coefficient on the parent-
report artifact is structurally lower without this fix. (2) The 4-week-
retention moat — coach churn data (loop-known but not yet a public metric)
spikes between week 2 and week 4 because that is when the second-week
underwhelming artifact lands. A second artifact that sounds REAL (instead
of either AI-padded or refusing) is the structural fix on the retention
curve at the exact churn point. (3) The continuity-graph moat — every
downstream artifact the product ships (0016 parent report, 0034 cross-
season parent report, 0017 season recap, 0043 mid-season newsletter,
0061 player trajectory) reads the SAME parent-report continuity chain.
Today that chain can produce a "flat" Week 2 anchor that propagates
into every downstream surface. Anchoring Week 2 to Week 1's commitments
plus actual-carryforward makes EVERY downstream artifact more coherent
by default. Distinct from 0016 (which assumes enough new data to tell a
NEW growth story) and 0030 (which fires only before the first artifact);
this fills the exact seam between them.

### User (the coach, Friday 6:42pm, in the kitchen with a screaming toddler)

She has 8 minutes before dinner. She opens SportsIQ on her phone, taps the
roster, taps Maya, taps "Generate parent report." The existing report
preview slides in. Different from Week 1's report: a small honest opener
NAMES the situation ("Maya was at one of two practices this week and got
about 20 minutes of touches in Saturday's scrimmage — here is what carried
forward from last week"), then ONE short paragraph anchored to the
specific things Week 1's report named Maya would be working on, then ONE
line "what we're watching next" pointing to Week 3. If the AI couldn't
find any carry-forward at all (zero observations on the previous focus
areas, total practice silence) the report falls back further to ONE honest
sentence + a single line: "Maya didn't get much on-court time this week —
we'll watch how she comes back next practice." NEVER an empty / refusal
output, NEVER a generic-praise output, NEVER an "amazing improvement"
sentence the parent will see through. She taps Send to Maya's parent. Done.
She didn't have to think about WHY the output is shaped this way — the
product made the right call for her. Same on the next 8 kids: each report
is shorter than Week 1's was, anchored to what was promised, honest about
the week.

### Growth

The "show me" moment is the PARENT'S inbox on Week 2 — opening their kid's
report and seeing a SHORT honest paragraph that NAMES the lighter week
and STILL says something specific about their kid. That is the parent who
forwards Week 2's report to her sister-in-law saying "I told you this
coach is different." Compounds three ways. (1) The parent's reaction rate
on a thin-but-honest Week 2 report is structurally higher than on a
padded-praise Week 2 report (the parent's BS detector fires on padded
praise; an honest acknowledgement of a lighter week earns the reaction).
The existing 0041 reactions rollup will surface this directly. (2) The
coach's likelihood of generating a THIRD report goes up because Week 2's
output didn't make them feel ashamed of their thin notes — the artifact
absorbed the thinness gracefully, which trains the coach to keep
capturing through Weeks 3, 4, 5 even when life is messy. (3) The
forwarding rate on a Week 2 honest report is structurally the same as
on Week 1's (LOSS-prevention, not gain), which means every shipped viral
surface downstream of the parent report keeps its conversion rate
through the lighter weeks. Distinct from every shipped surface: 0030 is
pre-first-artifact; 0016 is the growth-story prompt assuming enough
data; 0042 is the 14-day silent coach; 0023 is the Monday digest; THIS
is the artifact-quality safety net on the second artifact, the one
that determines whether the coach is here in Week 4.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] The existing parent-report prompt at `src/lib/ai/prompts.ts` (the
  `parentReport` / `parentReportContinuity` builder per 0016 — read its
  current shape at pickup per LESSONS#0096; the prompt is the post-0034
  cross-season continuity version) gains a NEW CONDITIONAL CONTINUITY
  BLOCK that is appended ONLY when the route detects this is artifact
  `>= 2` for this player AND the new-observations-since-last-report count
  is `< 4` (the THIN-WEEK threshold; see next AC). The block has three
  parts: (a) the previous report's three specific commitments / focus
  areas (NAMED in the previous report and stored on the existing 0016
  continuity row — read its shape at pickup), (b) any current-window
  observations that touch the same skill families (parsed via the
  EXISTING skill-family taxonomy the prompts already use), (c) an
  EXPLICIT POSITIVE INSTRUCTION: "This week was lighter than the last
  report's window. Write a short honest opening that NAMES the lighter
  week (one sentence). Then ONE short paragraph anchored to what the
  previous report named as the focus and what actually carried forward
  this week. Then ONE line 'what we're watching next.' Write like a
  coach's clipboard, not a marketing landing page; never invent
  improvement that isn't in the observations." Per LESSONS#0023 — the
  instruction is POSITIVE and never enumerates the banned tokens. The
  block is APPENDED to the existing prompt context; it does NOT replace
  the existing 0016 / 0034 continuity logic — both fire when both
  apply. (vitest contract test: the prompt builder for the thin-week
  case includes the three sub-parts; the previous-commitment lines
  are quoted in the prompt; the instruction does NOT contain any
  AGENTS.md banned word; the prompt for a non-thin-week case is BYTE-
  IDENTICAL to the existing one.)

- [ ] The thin-week detection lives in a NEW pure helper at
  `src/lib/thin-week-utils.ts`: `isThinSecondPlusReport({
  artifactCount, newObservationCount, daysSinceLastReport }):
  boolean`. Default thresholds: `artifactCount >= 2`,
  `newObservationCount < 4`, `daysSinceLastReport <= 21` (so a
  6-month-gap report is NOT treated as a thin-week — it's a different
  scenario the existing 0034 cross-season continuity handles). The
  helper is PURE (no DB access); the parent-report route reads the
  three inputs and passes the boolean into the prompt builder.
  (vitest: every threshold edge case; the threshold defaults are
  exported so a future ticket can tune them without re-derivation;
  the helper returns false for artifactCount=1, true for the
  documented thin-week case, false for the 6-month-gap case.)

- [ ] The parent-report route at `src/app/api/ai/parent-report/route.ts`
  (or wherever the existing parent-report generator lives per 0016 —
  read at pickup per LESSONS#0096) is updated to: (a) read the
  caller's artifact count for THIS player via the existing
  continuity-row query (NO new query — extend the existing
  continuity read with `artifact_count` if not already present;
  otherwise compute from the existing `parent_reports` rows for the
  player); (b) read the new-observations count for the window since
  the last report (existing count is computed somewhere in 0016 per
  the continuity chain — reuse it); (c) call
  `isThinSecondPlusReport(...)`; (d) on true, pass an
  `isThinWeek: true` plus a `previousCommitments: string[]` block
  into the prompt builder; (e) on false, the prompt input is BYTE-
  IDENTICAL to the existing one. The route remains a SINGLE
  `callAIWithJSON()` call per AGENTS.md; no second AI call is added.
  The route NEVER refuses to generate — even at zero carry-forward,
  the prompt-builder path falls through to the "honest one-sentence
  + watching-next-line" output (the model is instructed positively
  to produce that shape, never an empty / refusal output). (vitest:
  the route emits a prompt with the thin-week block when the
  helper returns true; the route emits the existing prompt when the
  helper returns false; the route ALWAYS produces an output (never
  refuses); the route still calls `callAIWithJSON` exactly once
  per request.)

- [ ] Output validation: the route POST-VALIDATES the AI's output
  against a rendered-text scan. If the output contains any AGENTS.md
  banned word, the route falls back to a STRUCTURED-TEMPLATE
  rendering that takes the previous commitments + the carry-
  forward observations + the focus arc and renders the honest-
  short-paragraph shape WITHOUT an AI call (the template lives in
  `src/lib/thin-week-utils.ts` as `renderThinWeekFallback({
  playerFirstName, previousCommitments, carryForwardObservations,
  upcomingFocus }): string`). The template is rendered POSITIVELY
  per LESSONS#0023; the banned-word scan in tests covers the
  template body. The fallback is logged to the existing
  `ai_interactions` table with a marker so the loop can revisit
  the prompt if the fallback rate climbs above a threshold (the
  threshold review is a follow-up; v1 just logs). (vitest: a
  planted AI output containing "amazing" triggers the template
  fallback; the template output contains no banned word; the
  template output for the zero-carry-forward case renders the
  honest single-sentence shape; the `ai_interactions` log shows
  the marker on the fallback path.)

- [ ] AI contract test under `tests/ai/` per AGENTS.md: the
  thin-week prompt produces a STRUCTURALLY VALID parent-report
  output (the existing JSON shape: `{ greeting, paragraph,
  watchingNext }` per 0016 — read at pickup) across at least
  Anthropic AND ONE fallback provider (mirror the existing
  parent-report contract test). The test asserts the shape, NOT
  the specific words. The banned-word scan is asserted on the
  rendered output AND on the prompt instruction text per
  LESSONS#0023. (vitest: contract test passes on both providers;
  output shape is the existing JSON; banned-word scan passes on
  both the prompt and the rendered output.)

- [ ] Tier / feature gating: the thin-week branch is UNIVERSAL across
  tiers — a free-tier coach generating their second report also
  gets the safety net. NO new tier feature key. The existing
  parent-report tier gating (per 0016) is BYTE-IDENTICAL. The
  existing free-tier AI usage meter (0008) sees one AI call per
  generation as before; the template fallback path does NOT charge
  against the usage meter (no AI call was made). (vitest: a free-
  tier coach in their last AI call of the month still gets the
  thin-week prompt; the fallback path does NOT increment the
  usage meter; the route does NOT add a new `tier.ts` import.)

- [ ] Privacy / COPPA contract: the thin-week prompt input contains the
  player's FIRST NAME only (NOT the full name, DOB, jersey, medical
  notes, parent_email) — the existing 0016 input filter is
  REUSED, not re-derived. The previous-commitments source is the
  existing 0016 continuity row, which by 0016's spec contains no
  minor PII beyond first name. The carry-forward observations are
  coach-authored text (the existing observations pipeline already
  filters this). The route's `.select()` calls on `parent_reports`
  / `observations` / `players` are EXPLICIT ALLOW-LISTS per
  LESSONS#0036. (vitest: planted DOB / medical_notes / parent_email
  rows on the player do NOT appear in the prompt input; the
  `.select()` keysets are explicit allow-lists; the previous-
  commitments read does NOT widen its select-set.)

- [ ] Voice contract: every user-facing string the dev adds (the
  prompt-builder instruction lines for the thin-week block, the
  `renderThinWeekFallback` template body, the honest one-sentence
  zero-carry-forward fallback) contains NO AGENTS.md banned word per
  LESSONS#0023. The instruction is POSITIVE ("write like a coach's
  clipboard, not a marketing landing page; never invent improvement
  that isn't in the observations"); the banned tokens are NEVER
  enumerated in the prompt body — that would make the prompt fail
  its own scan per LESSONS#0023's well-documented trap. The
  rendered-output scan + template fallback path covers the case
  where the AI emits a banned word despite the positive
  instruction. (vitest: scan the prompt builder output for the
  banned list; scan `renderThinWeekFallback` output for every
  fixture; assert the prompt body NEVER literally writes the
  banned tokens.)

- [ ] Regression: the existing parent-report generation for the
  NON-thin-week case (artifactCount=1, OR artifactCount>=2 AND
  newObservationCount>=4) is BYTE-IDENTICAL — the prompt builder
  output for that case is unchanged, the existing 0016 / 0034
  continuity logic is unchanged, the existing JSON output shape is
  unchanged. The existing parent-report API response shape is BYTE-
  IDENTICAL (no new field added to the public response). The
  existing 0008 free-tier AI usage meter sees the same count of
  calls as before (one per generation on the AI path; zero on the
  template fallback path — the fallback path is new behavior that
  did not exist before this ticket, so it doesn't regress
  anything). The existing 0061 player trajectory route does NOT
  read parent_reports; this ticket does NOT touch the trajectory
  path. (vitest: snapshot the non-thin-week prompt against the
  seeded fixtures pre- and post-change; assert no diff; the public
  response shape is BYTE-IDENTICAL; the usage meter contract is
  preserved.)

- [ ] Seeded e2e on the 0006 fixture: seed extension is ONE
  `parent_reports` row for the existing E2E player (the "Week 1"
  report, dated `now() - interval '8 days'`, carrying three
  specific commitments — pick deterministic strings, e.g. "finish
  the closeout", "drive with the left hand", "communicate on
  switches" — that the prompt can quote) + EXACTLY THREE seeded
  observations on the player in the last 7 days (so the thin-week
  helper returns true: artifactCount=1, newObservationCount=3,
  daysSinceLastReport=8 — `>=2` is the route-derived count of
  parent_reports rows AFTER this new generation, so the seed
  represents artifactCount=1 going INTO the second-call, which the
  route correctly detects as the second-call thin-week case).
  UUIDs in next free `0000000000<XX>+` range per LESSONS#0101.
  Playwright spec: sign in as the E2E coach, navigate to the
  player's report page, tap Generate parent report, intercept the
  AI call at the test boundary per LESSONS#0036 (the e2e MUST NOT
  call a real AI provider — return a deterministic mocked
  payload), assert the rendered report contains the honest-opening
  shape ("lighter week" / "carried forward" lexical pattern) AND
  one of the three seeded commitments appears in the prompt the
  route sent to the AI (the test asserts the prompt the route
  POSTed via the mocked AI client, not the model output text).
  Scope by `data-testid` per LESSONS#0081 / #0082. Skip when E2E
  creds are unset.

## Out of scope

- A new UI surface on the coach side telling them "this is a thin
  week." v1 is invisible to the coach in the UI; the artifact-output
  IS the surface. A coach who is told "you have only 3 observations
  this week" will feel scolded; the product instead just produces a
  good artifact.
- A "skip this week — generate next week" deferral. v1 always
  produces an artifact when asked; deferral would push the coach
  out of the habit.
- A bulk "regenerate every kid's report with the new safety net"
  retroactive surface. v1 only fires forward; past reports stay as
  shipped. A retroactive surface would be confusing (parents would
  see the report change after they read it).
- A parent-facing disclosure that this week's report had thinner
  data. v1's honest opening sentence IS the disclosure (one
  sentence, in the coach's voice via the prompt); a separate
  product-level disclosure would feel apologetic and would
  undermine the trust.
- A tuning UI for the thin-week thresholds. v1 ships the defaults
  exported from `thin-week-utils.ts`; a tuning UI is a future ticket
  that depends on multi-coach data the loop does not yet have.
- A separate prompt for thin-week SPOTLIGHT, thin-week WEEKLY
  PULSE, thin-week SEASON RECAP. v1 covers PARENT REPORTS only —
  the parent report is the highest-value artifact and the one with
  the clearest 1-to-1 continuity row. Spotlight + pulse + season
  recap have their own continuity shapes and need their own
  tickets.
- A two-stage AI call ("first ask: is this a thin week? second
  ask: write the report"). v1 is ONE AI call per artifact (AGENTS.md
  preserves the multi-provider routing economics); the thin-week
  detection is a route-side helper, not an AI call.
- A new migration. v1 reuses the existing `parent_reports` /
  `observations` shapes. NO new column, NO new table. (LESSONS#0006
  — this ticket should assert NO new migration file count change
  in the test.)

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/thin-week-utils.ts` (new) — pure helpers:
  `isThinSecondPlusReport(...)`, `renderThinWeekFallback(...)`. NO
  DB access. Voice POSITIVELY per LESSONS#0023. Default thresholds
  exported as named constants.
- `src/lib/ai/prompts.ts` (existing — read first per LESSONS#0096) —
  extend the parent-report prompt builder with the conditional
  thin-week block. The block is APPENDED, NEVER replaces the
  existing 0016 / 0034 continuity logic. Per LESSONS#0023 — the
  instruction is positive; the banned tokens are never enumerated
  in the prompt body.
- `src/app/api/ai/parent-report/route.ts` (existing — read at pickup
  per LESSONS#0096; the route may live at a slightly different path
  if 0016 / 0034 moved it) — extend the route to compute the three
  inputs, call `isThinSecondPlusReport`, branch the prompt input,
  post-validate the AI output, fall back to
  `renderThinWeekFallback` on a banned-word match. The route remains
  a SINGLE `callAIWithJSON()` call per AGENTS.md; the fallback path
  is a pure template render (no AI call). Per LESSONS#0036 — the
  `.select()` calls remain explicit allow-lists.
- `src/lib/ai/client.ts` (existing) — NO change. The new branch is
  consumed via the existing `callAIWithJSON()` and the existing
  logging table.
- `tests/lib/thin-week-utils.test.ts` (new, `.test.ts` per
  LESSONS#0020 / #38) — every threshold edge case; every fallback
  rendering case; banned-word scan on every output.
- `tests/ai/parent-report-thin-week.test.ts` (new) — contract test
  under `tests/ai/`; asserts structural validity of the thin-week
  output across Anthropic + one fallback per AGENTS.md; banned-word
  scan on prompt + output.
- `tests/api/parent-report-route.test.ts` (existing — extend, OR
  new sibling `parent-report-route-thin-week.test.ts` if the
  existing one is already dense — read first per LESSONS#0096) —
  thin-week true → thin-week prompt block; thin-week false →
  byte-identical existing prompt; banned-word AI output →
  template fallback; the route still calls `callAIWithJSON`
  exactly once on the AI path. Per LESSONS#0049 / #0092 / #0100 —
  if extending shared from-chain mocks, drain `mockReset()` in
  `beforeEach`.
- `tests/migrations/no-new-migration-0066.test.ts` (new, OR add an
  assertion to an existing migration-count test — read at pickup) —
  assert that the count of migration files is UNCHANGED by this
  PR's diff. Per LESSONS#0006 — the ticket explicitly ships
  without a migration.
- `tests/e2e/parent-report-thin-week.spec.ts` (new). Seed extension
  per the AC. UUIDs in next free `0000000000<XX>+` range per
  LESSONS#0101. The AI client MUST be mocked at the test boundary
  (the e2e never calls a real AI provider — per the existing 0016
  parent-report e2e posture, mirror that mock setup at pickup).
  Spec per the AC. Scope by `data-testid` per LESSONS#0081 /
  #0082. Skip when E2E creds are unset.
- New deps: NO. Migration: NO. Env vars: NO new. AI prompt change:
  YES (extend the existing `parentReport` builder; do NOT add a
  new top-level prompt). Tier feature key: NO new key.
- LESSONS to anchor: #0006 (no new migration — the ticket asserts
  it), #0020 / #38 (.test.ts), #0023 (CRITICAL — positive prompt
  voice; the prompt body MUST NOT enumerate banned tokens, or the
  prompt's own scan fails per the well-documented trap), #0036
  (COPPA `.select()` allow-list; client-fetch posture for the
  e2e), #0049 / #0092 / #0100 (mock queue spillover when
  extending shared from-chain mocks on the parent-report route's
  test), #0055 (no-arg handlers in tests; this route takes a
  request), #0079 (canAccess contract — unchanged here, but
  verify the tier gating is not accidentally widened),
  #0084 / #0101 (seed posture — adding three observations + one
  parent_reports row), #0088 (strip `--` comments — irrelevant
  here since no migration), #0091 / #0104 (publicPaths — no
  change; the existing parent-report route is authed), #0096
  (CRITICAL — schema wins over prose: at pickup, read the actual
  `src/app/api/ai/parent-report/route.ts` path + the actual
  `parent_reports` continuity-row shape per 0016 + the actual
  `observations` column shape + the existing prompt builder
  signature in `src/lib/ai/prompts.ts` before writing the
  branch).

## Implementation log

- 2026-06-03 [implementation-dev] Picked up the ticket. Reconciled the spec
  against the real codebase:
  - Real route: `src/app/api/ai/parent-report/route.ts` (matches spec).
  - Real prompt builder: `PROMPT_REGISTRY.parentReport` in
    `src/lib/ai/prompts.ts` (matches spec; carries the 0016 `priorReport`
    and the 0034 `priorSeasonReport` blocks).
  - Real continuity row shape: `plans` rows with `type = 'parent_report'`
    whose `content_structured` is the rendered `parentReportSchema` object.
    The spec calls these "the 0016 continuity row" and "the previous
    report's three specific commitments". The schema today has no first-
    class `commitments` field; the closest grounded source the prompt can
    quote is the previous report's `coach_note` (always present) plus
    `skill_progress[].skill_name` (the focus areas the report already
    named). v1 derives the previous-report "commitments" lexically from
    those existing fields rather than inventing a new persisted shape — no
    new migration, no new column, per the ticket's "no new migration"
    constraint.
  - Real schema: `parentReportSchema` (`src/lib/ai/schemas.ts`) already
    accepts `since_last_report` / `since_last_season` as optional — the
    public response shape is unchanged.
  - Helper lives at `src/lib/thin-week-utils.ts` (per spec). PURE helpers
    only — no DB access. Voice POSITIVE (LESSONS#0023) — banned tokens
    are NEVER enumerated in the prompt body or the template.
  - The post-AI output rendered-text scan happens in the route; on a
    banned-word hit we render `renderThinWeekFallback` from the same
    `thin-week-utils.ts` module and log the fallback to `ai_interactions`
    with a `metadata.thin_week_fallback = true` marker (no new column).
  - The thin-week prompt branch is universal across tiers — no new tier
    feature key, no `tier.ts` import added.
