---
id: 0046
title: Give the coach a one-tap sideline cheat sheet — one line per kid to say to that kid's parent
status: in-progress
priority: P1
area: ai
created: 2026-05-26
owner: product-groomer
---

## User story

As a volunteer coach who knows that on Saturday morning at the game half the parents will
come up at half-time wanting a word about their kid, I want one tap on the team page that
gives me a private cheat sheet — one specific, true line for each player I can say to that
kid's parent when they walk over — so that I stop saying "great practice today" twelve
times and start saying the one thing each parent actually came over to hear.

## Why now (four lenses)

### Product Owner
The single most-asked question in volunteer youth sports is the one we generate nothing
for: "Coach, how is my kid doing?" — asked on a sideline, with thirty seconds to answer,
twelve times in a morning. We have the per-player observation history that would answer it
(0025 already reads it for the in-app capture surface; the parent report 0016/0034 reads it
for a long-form artifact). We do NOT have the artifact a coach can hold in one hand,
GLANCE at, and TALK from — the per-player one-liner. The parent report is the wrong
artifact for the sideline (too long, sent over email, not glanceable); the per-player
capture memory (0025) is the wrong artifact too (it's for the coach AT capture time, not at
talk time). The smallest meaningful unit of value is one new AI artifact, one new
`plans.type='sideline_talking_points'`, that takes the team's recent per-player observations
and produces a single page of two-line entries — for each rostered player, a one-line
positive specific thing the coach can lead with, and a one-line "we're working on" thing
they can pivot to if the parent asks for more. One tap on the team page, ten seconds, a
page the coach pulls up on the sideline.

### Stakeholder
This is a moat-deepener in the irreplaceable category — the artifact that earns the product
the title "coaching assistant" instead of "notes app." A forms app can store notes; what it
cannot do is hand the coach a one-glance translation of those notes into the exact
sentence to say to each parent at half-time. It compounds the structured-artifact moat
along the per-player axis (the only axis where the artifact can be both specific AND
quotable), and it does so coach-PRIVATELY — there is no public surface, no minor name
crosses any token URL, no parent ever sees the sheet. That's deliberate: the artifact's
value is in the coach's hands, not in front of the parent. It's the kind of utility a coach
who has it doesn't switch away from, because no competitor's day-one product will produce
it. And it's tier-gated to Coach+ at the existing `report_cards` key — the coach who is
already paying for the parent report is the same coach who needs the sideline sheet, and
the gate is honest (the sheet is built from the same per-player observation history that
already powers the report).

### User (Saturday 9:15am, ten minutes before the U10 game, in the parking lot)
The coach opens the team page, taps "Sideline cheat sheet." Six seconds later they have
one page: a list of twelve players, each with two lines under the name. "Maya — closeouts
have come a long way (mention her hustle on Tuesday). We're working on her finishing with
contact." "Devon — first to dive for the loose ball this week. We're working on holding his
position on rebounds." They put the phone in their pocket. At half-time when Sarah's mom
walks over, they thumb-swipe to Sarah's row and say the line. They walk away from twelve
separate conversations that morning with each parent thinking the coach knows their kid.
The sheet never leaves the coach's phone; there is no public link, no parent surface, no
sharing surface — it is a coach-only artifact, by design.

### Growth
The "show me" moment is not viral in the link-share sense — it is conversational virality,
which is harder to measure but real in a youth-sports town. A coach who walks the sideline
saying specific, true things about each kid is the coach who gets asked at the school
parking lot "are you using something? you remember everything." That conversation converts
both the parent (who becomes a portal reader and may convert via 0019) and another coach
who hears about it (who converts via 0021/0026). The artifact itself is the demo: a coach
shows another coach the cheat sheet they keep on their phone, and the other coach asks for
the app's name. Retention is even stronger — the sheet is the kind of weekly utility a coach
opens before EVERY game, which is a recurring, high-intent open distinct from every other
shipped surface (digests are passive, recap cards are post-event, plans are pre-practice;
this is pre-game).

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new `sidelineTalkingPoints` entry in the `PROMPT_REGISTRY` of
  `src/lib/ai/prompts.ts` accepts `{ team, players, observationInsightsByPlayer }` (mirroring
  the shape the parent-report prompt already consumes). The output JSON schema has EXACTLY
  two top-level keys: `team_id` (string) and `entries` (array). Each entry has exactly
  four keys: `player_id` (string), `player_first_name` (string), `lead_line` (string, one
  sentence — the positive specific thing), `working_on_line` (string, one sentence — the
  pivot when the parent asks for more). No bullet lists, no markdown, no extra fields. The
  array length equals the active roster size. (vitest: the rendered prompt contains the
  per-player insights; the schema rejects any extra key; entries length matches input.)
- [ ] Voice contract: the rendered prompt contains NO AGENTS.md banned word (`journey`,
  `amazing`, `exciting`, `elevate`, `empower`, `synergy`) in either the system or user
  block. Per LESSONS#0023 the prompt instructs voice POSITIVELY ("write like a coach's
  sideline note to themselves — specific, one sentence, no marketing tone") and never
  enumerates the banned tokens verbatim. (vitest scans `${system}\n${user}` and asserts
  none of those tokens appear.)
- [ ] `POST /api/ai/sideline-talking-points` (new) accepts `{ teamId }`. Auth via
  `createServerSupabase().auth.getUser()` → 401; team belongs to the caller's
  `coaches.org_id` → 404 otherwise. Below a small threshold of total observations for the
  team in the last 2 weeks → `200 { sheet: null }` (mirrors the digest 0023 below-threshold
  short-circuit; gives no quota-cost on a too-cold team). Otherwise builds inputs via the
  existing `src/lib/ai/context-builder.ts` helpers, groups recent observations by player,
  calls `callAIWithJSON({ prompt: 'sidelineTalkingPoints', schema, orgId, interactionType:
  'custom' })`, persists the result as a new `plans` row with
  `type='sideline_talking_points'`, `coach_id`, `team_id`, and `content_structured`
  matching the schema, and returns `{ planId, content_structured }`. (vitest covers each
  branch.)
- [ ] Server-side tier gate uses the EXISTING `report_cards` feature key — `canAccess(tier,
  'report_cards')` returns true for Coach/Pro/Org and false for Free; the route returns
  `402 { upgrade: true, feature: 'report_cards' }` on free. Per LESSONS#0023 the
  `<UpgradeGate feature="report_cards">` prop value MUST equal the tier-key string
  verbatim. The team-page button is wrapped in the same gate. (vitest: free → 402; coach →
  200. Playwright: free coach sees the upgrade gate; coach sees the button.)
- [ ] The migration `04N_plans_type_sideline_talking_points.sql` extends the
  `plans_type_check` CHECK constraint allow-list by drop-and-recreate (mirror
  `034_plans_type_check_align.sql`'s pattern) to include `'sideline_talking_points'`. Pick
  the next free integer prefix AFTER 0045's column-add (so `04N_…` — verify with
  `ls supabase/migrations/`, LESSONS#0006). The migration only widens the allow-list; no
  new column, no new table. (vitest scans the executable DDL — strip `--` comments per
  LESSONS#0088 — and asserts only `'sideline_talking_points'` is added to the allow-list.)
- [ ] AI contract test: the `sidelineTalkingPoints` prompt produces structurally-valid
  JSON parsing against the schema under at least Anthropic AND one fallback provider
  (mirror `tests/ai/plan-coaching-signature-contract.test.ts`). The contract assertion
  iterates the returned `entries` and validates each four-key shape. No provider
  hardcoding. (vitest contract test.)
- [ ] COPPA / privacy: the artifact NEVER reaches a public surface. The new plan type is
  NOT added to any `/share/*` allow-list, NOT added to the sitemap from 0038, and the route
  has NO companion `/share/sideline/<token>` or token-create route. The route's response
  payload is consumed only by the authenticated team page and the plans page; a parent
  visiting any public token route cannot reach a sideline-talking-points plan. (vitest:
  scan every public-surface page renderer for imports of the new plan type and assert none
  reference it; Playwright on the seeded public pages — `/share/<token>`, `/team-card/<token>`,
  `/coach/<token>`, `/recap/<token>`, `/season-recap/<token>` — asserts no
  `sideline_talking_points` content renders.)
- [ ] COPPA: the prompt's instruction explicitly says the lines are private coach notes
  the coach will SAY (not write), so the AI may use player first names freely — but the
  artifact is stored in the same `plans` row as every other coach artifact and is governed
  by the existing parent-report-grade COPPA posture (no new minor field, no new table). The
  artifact's `content_structured` is stored as jsonb on `plans` and includes
  `player_first_name`, NOT `player_full_name` — first names only, mirroring the parent
  report's existing convention. (vitest: the schema enforces first-name-only; the prompt
  rendering test plants a planted full-name token in the input and asserts the rendered
  prompt never echoes the full surname out as a verbatim instruction to the model.)
- [ ] Regression: every existing `plans.type` write path stays byte-identical (the per-
  player parent report 0016/0034, the season recap 0017, the game recap 0027, the weekly
  star 0009, the 0040 pre-game brief, the 0043 mid-season newsletter if shipped). The
  `sideline_talking_points` write is purely additive. (vitest: a fixture save of each
  existing plan type still passes after the new migration; the sideline write is purely
  additive.)
- [ ] Quota: the route routes through `callAIWithJSON({ orgId })` so multi-provider
  failover (0012), quota counting, and quota-wall resume (0035) all apply. A Coach-tier
  coach at quota hits the same 402 + upgrade-resume path as every other AI artifact —
  no bypass. (vitest: the route is wrapped by `enforceAIQuota` like every other AI route;
  the existing quota path tests are not weakened.)

## Out of scope

- A public sideline cheat-sheet share surface. v1 is COACH-PRIVATE by design — putting
  per-kid talking points behind a public token would invert the artifact's value and
  trigger a COPPA review the simpler private surface skips. If a sharing pattern is ever
  wanted, that's a future ticket with its own privacy approval line.
- A parent-facing version ("here's what the coach plans to say about my kid"). Same reason
  — the artifact's value depends on the coach saying it out loud, not on the parent
  reading it first. v1 stays one-sided.
- A schedule / auto-generation cron. v1 is one-tap on the team page; the artifact is fresh
  when the coach generates it. Auto-firing it before every game would burn quota without
  the coach's intent (the "passive AI consumption" anti-pattern).
- A multi-language localization. v1 is English only.
- A coach-editable per-player override. The AI is the value; a form to edit each line
  would invert it. (The coach can re-tap to regenerate; that's the edit path.)
- A different tier gate or pricing experiment. v1 reuses the existing `report_cards`
  feature key exactly; a higher-tier "Pro-only sideline" split is a future discussion.
- An OG preview image for any future share surface. The sitemap (0038) is not touched —
  this artifact is not a SEO surface.
- Per-team weekly digest threading. The sideline sheet is a coach-individual game-day
  artifact, not a season digest signal.
- Cross-season memory in the sheet ("since last season Maya has come a long way"). v1 is
  scoped to recent observations only. Cross-season threading rides 0034's pointer in the
  parent report only; pulling it into the sheet is a separate refinement.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- `src/lib/ai/prompts.ts` — add `sidelineTalkingPoints: (params: PromptParams & { team,
  players: { id, first_name }[], observationInsightsByPlayer: Record<player_id,
  ObservationInsightsParam> }) => ({ system, user })`. The `system` preamble reuses
  `buildSystemPreamble`. The instructions tell the model: for each player, write ONE
  positive specific line and ONE "we're working on" line; one sentence each; coach voice;
  no marketing tone. The schema declared in the prompt is the two-key top-level shape with
  four-key entries. Voice instruction is POSITIVE — never enumerate banned tokens verbatim
  (LESSONS#0023).
- `src/lib/ai/schemas.ts` — add `sidelineTalkingPointsSchema` (zod): `{ team_id: z.string(),
  entries: z.array(z.object({ player_id: z.string(), player_first_name: z.string(),
  lead_line: z.string().min(1), working_on_line: z.string().min(1) })).min(1) }`.
- `src/app/api/ai/sideline-talking-points/route.ts` (new) — `POST({ teamId })`. Auth → 401;
  team-belongs-to-org → 404; below-threshold (< 8 observations across the team in the last
  2 weeks, mirror 0023's threshold philosophy and adjust per real data) → `{ sheet: null }`
  no AI call; happy path groups recent observations by player via the existing
  `context-builder` helpers and calls `callAIWithJSON({ prompt: 'sidelineTalkingPoints',
  schema: sidelineTalkingPointsSchema, orgId, interactionType: 'custom' })`, then writes a
  `plans` row. Service-role only; never a direct client write.
- `src/lib/tier.ts` — NO change. `report_cards` already exists on Coach / Pro / Org and
  does not on Free. Confirm in vitest.
- `src/components/ui/upgrade-gate.tsx` — NO new `FEATURE_CONFIG` entry; reuse the existing
  `report_cards` benefit copy.
- `src/app/(dashboard)/team/[teamId]/page.tsx` (or wherever the team page renders its
  artifact buttons; read the page first) — add a "Sideline cheat sheet" button wrapped in
  `<UpgradeGate feature="report_cards">`. POSTs to `/api/ai/sideline-talking-points` via
  `mutate()` (AGENTS.md rule 3). On success, render the artifact inline — a clean roster
  list, each row two lines. Dark zinc/orange, 44px targets, long-press-to-copy friendly so
  a coach can paste a single row into a parent text if they want to follow up after a
  conversation. No emoji-decorated headings.
- New migration `supabase/migrations/04N_plans_type_sideline_talking_points.sql` — drop and
  recreate `plans_type_check` to include `'sideline_talking_points'`. Pick the next free
  prefix AFTER 0045's column-add (LESSONS#0006). The migration only widens the allow-list;
  no new column, no new table.
- `src/types/database.ts` — extend the `Plan.type` union with `'sideline_talking_points'`.
- `src/app/api/data/route.ts` — the `plans` allow-list already includes the table; assert
  in a vitest that the new type round-trips via `query({ table: 'plans', where: { type:
  'sideline_talking_points' } })`.
- `tests/ai/sideline-talking-points.test.ts` (new, `.test.ts` NOT `.spec.ts` —
  LESSONS#0020/#38) — route auth / team ownership / below-threshold / happy path /
  402-on-free. Mock `@/lib/supabase/server` chainably and `@/lib/ai/client`'s
  `callAIWithJSON`. Run under Node 20.19.0 (LESSONS#0010).
- `tests/ai/sideline-talking-points-contract.test.ts` (new) — multi-provider contract test
  mirroring `tests/ai/plan-coaching-signature-contract.test.ts`; assert JSON parses against
  the schema under Anthropic + one fallback; assert no banned-word tokens in the rendered
  prompt; assert the schema enforces first-name-only on each entry; iterate the entries
  array and validate each four-key shape.
- `tests/migrations/plans-sideline-talking-points-coppa.test.ts` (new) — scan the
  migration's executable DDL (strip `--` comments per LESSONS#0088); assert only
  `'sideline_talking_points'` is added to the allow-list and no minor-data column is
  introduced.
- `tests/e2e/sideline-sheet-flow.spec.ts` (new Playwright spec) against the 0006-seeded
  Supabase. Seed: a Coach-tier coach + a team + 12 players + 15+ observations spread
  across the last 2 weeks + a pre-saved `plans` row of `type='sideline_talking_points'`
  with the four-key schema body (raw SQL; `content_structured` is jsonb so wrap as a
  valid JSON literal — LESSONS#0085/#0086). The spec navigates to the team page, taps
  the button, waits for the artifact, and asserts the page renders one row per seeded
  player with both lines visible. Use a `data-testid` on the sheet container
  (LESSONS#0081) and one per row to scope the strict-mode locators. Skip when E2E creds
  are unset (convention).
- `src/lib/supabase/middleware.ts` — NO change. The new route is authed and dashboard-only.
  No public surface, no token route.
- New deps: NO. Migration: YES — one constraint-extension. Env vars: NO. AI prompt change:
  YES — `sidelineTalkingPoints` in `PROMPT_REGISTRY`. Tier feature key: NO new key —
  reuses `report_cards`.
- LESSONS to anchor: #0023 (voice positively, `feature` prop equals the tier key verbatim),
  #0006/#0009 (migration prefix uniqueness; CHECK-constraint widening across a fresh-DB
  seed), #0081 (data-testid scoping in Playwright), #0085/#0086 (jsonb seeding in raw
  SQL), #0088 (strip `--` comments before scanning migration content), #0039 (if a
  sibling test currently uses `mockReturnValueOnce` chains on `from()` for `plans`, drain
  the queue in `beforeEach` so the new artifact's writes don't pollute).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-26 — branch `feat/0046-sideline-talking-points` opened; ticket flipped to in-progress.
