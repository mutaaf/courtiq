---
id: 0034
title: Let the parent report remember a returning player across seasons, not just within one
status: groomed
priority: P2
area: ai
created: 2026-05-25
owner: product-groomer
---

## User story

As a volunteer coach generating a parent report for a kid I also coached last spring, I want
the report to be able to say "since last season, Maya's gone from hesitating on closeouts to
leading them," when I've told the app this is the same player, so that the artifact reflects
the multi-season relationship I actually have with these families instead of resetting to zero
every time a new team is created.

## Why now (four lenses)

### Product Owner
All of our continuity memory lives *inside a single season*. The parent report's "since last
report" note (0016) compares to the prior report on the same `player_id`. The Practice Arc
(0018/0020) and per-player capture memory (0025) read observations on the current team. But a
`players` row is scoped to a `team_id`, and a team carries a single `season` string — so a kid
who returns next season is a brand-new `players` row with no memory of who they were. The one
thing a multi-season volunteer coach values most — "I've watched this kid grow for two years"
— is exactly what the product forgets. The smallest meaningful unit of value is a coach-
confirmed link between a returning player and their prior-season self, plus one optional
"since last season" line in the parent report drawn from that prior player's last report. The
link is the coach's explicit action (a "same player as last season?" confirm on the roster),
not an inferred guess — so it is opt-in, accurate, and carries no new data *about* the minor,
just a pointer between two rows the coach already created.

### Stakeholder
This is the single hardest-to-copy deepening of the structured-artifact / Practice Arc moat,
because it is built on *cross-season accumulated history* — the one asset that only compounds
the longer a coach stays and that a new entrant structurally cannot have. A forms app can show
this season's notes; what it cannot do is tell a parent "here's two years of your kid's
growth." Cross-season memory is the thing that makes leaving SportsIQ feel like deleting a
relationship, not switching a tool — the deepest switching cost we can build. It compounds the
existing artifacts rather than forking them: it reuses the exact 0016 "fetch the prior report,
thread it as continuity context" pattern, just resolved across the season boundary via the
coach-confirmed link, and it routes through `callAIWithJSON()` so multi-provider routing,
quota, and failover (0012) apply unchanged. The longer a program runs, the deeper this gets —
which is precisely the kind of moat that widens on its own.

### User (the coach, setting up a new season's roster in August)
The coach adds returning kids to the new season's team. Next to a name, one quiet prompt: "Did
you coach Maya last season?" — one tap to confirm the link, or ignore it. That's the entire
interaction; nothing else changes. Weeks later, when they generate a parent report, the report
can open with one true line about the longer arc — "Since last season, Maya's closeouts have
gone from hesitant to a strength" — grounded in the prior season's report, not invented. If
the coach never confirms a link, the report behaves exactly as it does today (single-season,
0016 in-season continuity only). On a flaky connection the cross-season read is best-effort:
if it can't resolve, the report generates as a single-season snapshot and never errors.

### Growth
This is a pure retention/moat deepener with a real "show me" moment for the parent audience: a
report that spans two seasons is a screenshot a parent forwards with "look how far she's
come" — and the existing parent-portal referral surfaces (0011/0019) ride on top of it
unchanged, so the deeper artifact strengthens the viral loop we already shipped without adding
a new one. For the coach, it is the reason to start every new season inside SportsIQ rather
than a fresh notebook: the app is the only place that remembers. There is no new viral artifact
here; this earns its P2 by deepening the named cross-season moat at the player grain, gated
behind the parent-report tier the coach already pays for, with no new model spend in the
common (single-season) path.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A `players` row gains exactly one new nullable self-referential field `prior_player_id` (FK to `players.id`, nullable, default null) that links a returning player to their prior-season `players` row; no other field is added, and the column collects NO new information *about* the minor — it is a pointer between two coach-created rows (vitest: the migration adds only `prior_player_id`; an existing player with `prior_player_id = null` behaves exactly as today).
- [ ] `POST /api/ai/parent-report`, when the target player has a `prior_player_id`, fetches the most recent prior `plans` row with `type='parent_report'` for that PRIOR player id (in addition to the existing same-player 0016 continuity) and threads it into the prompt as cross-season context; when `prior_player_id` is null, the route is byte-identical to today's 0016 behavior (vitest: a player with a linked prior player + a seeded prior-season report → the prompt builder receives the prior-season report; a player with no link → no cross-season block).
- [ ] The cross-season prior player MUST belong to a team in the SAME org as the current player — the route verifies `prior_player_id`'s team `org_id` matches before reading its reports, so a coach cannot thread another org's player history via a forged link (vitest: a `prior_player_id` pointing at a different org's player is ignored and reads no cross-org report).
- [ ] The parent-report schema gains exactly one new optional field (e.g. `since_last_season: string | null`) populated only when cross-season context was present; existing reports and the 0016 `since_last_report` field still validate (vitest: `parentReportSchema.parse()` accepts a report with and without `since_last_season`; existing fixtures still pass).
- [ ] A cross-season prior-report fetch failure does NOT 500 the route — it falls back to the single-season report with `since_last_season: null` (vitest: regression — the route stays 2xx when the cross-season read throws, mirroring the 0016 degrade-to-snapshot behavior).
- [ ] The roster surface lets a coach set/clear `prior_player_id` via the existing client `mutate()` path (NOT direct Supabase — AGENTS.md rule 3), and the candidate prior players offered are scoped to the coach's own org (vitest/component: the link control writes `prior_player_id`; the candidate list is server-scoped to the org and contains no other org's players).
- [ ] AI contract test: the `parentReport` prompt with a cross-season block produces structurally valid output (parses against `parentReportSchema`) under at least Anthropic AND one fallback provider (e.g. OpenAI or Gemini), mirroring the multi-provider mock strategy in `tests/ai/provider-failover.test.ts` — the cross-season feature must not be Anthropic-specific.
- [ ] Tier: the cross-season note rides the existing parent-report tier gate (`report_cards` / `parent_sharing`, Coach+) — a `free` coach cannot generate a parent report at all, so the cross-season path is server-side unreachable for free (vitest asserts the parent-report route's existing tier enforcement is unchanged and still blocks free server-side; no NEW `feature_*` key is added).
- [ ] COPPA/privacy: the cross-season context fed to the model is only the prior season's coach-authored report narrative for a player the coach already coached in their own org; the `prior_player_id` pointer adds no new descriptive data about the minor, and the cross-season note is never exposed on any public/no-auth surface beyond where the existing parent report already appears (vitest asserts the prompt's cross-season block carries no new minor-scoped data and the link is org-scoped).

## Out of scope

- AUTO-matching returning players across seasons by name/DOB/photo. v1 is COACH-CONFIRMED
  linking only (an explicit `prior_player_id` the coach sets) — no inference, no fuzzy match,
  no biometric/photo matching of a minor (that would be new minor-data processing and is
  explicitly NOT done here).
- A cross-season analytics dashboard, multi-season skill-trend charts, or a "career" view.
  v1 is one optional sentence inside the parent report; a multi-season visualization is a
  separate ticket.
- Threading cross-season memory into every artifact (capture memory, debriefs, season recap,
  weekly star). v1 enriches the PARENT REPORT only — the one artifact families read and where
  a two-season arc is most valued. Other surfaces stay single-season.
- Comparing against more than the single most recent prior-season report. One prior-season
  report in, one `since_last_season` note out — no averaging across multiple past seasons.
- A new public/parent-facing surface or a new share token. The cross-season note appears
  inside the existing parent report (and wherever that report already renders); it adds no new
  no-auth route and is NOT added to `publicPaths`.
- Backfilling `since_last_season` onto already-generated reports. New field is populated going
  forward only.
- A new tier gate. This changes the CONTENT of an artifact the tier already permits; it adds
  no `feature_*` key. (If the dev believes cross-season linking should itself be a paid feature,
  push back through this ticket; default is to ride the existing parent-report gate.)
- Any new analytics SDK or tracker. PostHog already exists; do not add new event types.

## Engineering notes

- Migration: YES — one new migration under `supabase/migrations/` (next free version after the
  current highest; use a UNIQUE version prefix and balanced insert column/value counts —
  LESSONS.md 2026-05-20 re: the 031 collisions and the fresh-CI-DB `ON_ERROR_STOP=1` seed)
  adding `players.prior_player_id uuid null references players(id)`. APPROVAL LINE (per
  AGENTS.md "widening what we collect on minors is a discussion, not a unilateral change"):
  this field is APPROVED in this ticket BECAUSE it collects no new information *about* a minor —
  it is a nullable self-referential pointer between two `players` rows the coach already created,
  used only to thread the coach's own prior-season report as continuity context. Do NOT add any
  descriptive field (DOB-match score, name-similarity, etc.); only the FK pointer. Add the field
  to the `Player` interface in `src/types/database.ts`. The migration is the dev's to write;
  this ticket only specifies the column.
- `src/lib/ai/prompts.ts` — extend `PROMPT_REGISTRY.parentReport(params)` (line ~288) to accept
  an optional `priorSeasonReport?` alongside the 0016 `priorReport`. When present, add a
  cross-season continuity block to the user prompt instructing the model to produce a short
  `since_last_season` note grounded in the difference between last season and now; when absent,
  the prompt is byte-identical to the current 0016 behavior (gate the block on presence, exactly
  as `practicePlan` and the 0016 `priorReport` block already gate). Keep the JSON schema
  instruction in sync. Voice = clipboard, factual, warm-not-breathless — instruct positively
  ("write like a coach who has watched this player grow; keep it plain and specific") rather than
  enumerating banned words (LESSONS.md 2026-05-23 re: a verbatim ban-list tripping the
  banned-words contract test).
- `src/lib/ai/schemas.ts` — add `since_last_season: z.string().nullable().optional()` to
  `parentReportSchema`. Optional so existing fixtures, the no-link path, and the 0016
  `since_last_report` path all still validate. Do not make any existing field stricter.
- `src/app/api/ai/parent-report/route.ts` — after resolving the target `player` and the 0016
  same-player prior report, if `player.prior_player_id` is set: verify the prior player's team
  `org_id` matches the caller's org (read the prior player → its team → `org_id`; a mismatch or
  unknown id is ignored — read nothing cross-org), then fetch its most recent
  `type='parent_report'` plan
  (`.eq('player_id', priorPlayerId).eq('type','parent_report').order('created_at',{ascending:false}).limit(1)`),
  wrapped in try/catch so a read failure degrades to single-season (never 500). Pass it as
  `priorSeasonReport` into the prompt. The route already routes through `callAIWithJSON()` with
  `interactionType: 'generate_parent_report'` and `orgId` — keep that exactly so quota +
  provider routing + failover (0012) apply unchanged. Persist as today. The route reads a JSON
  body — invoke it with its real signature in tests (LESSONS.md 2026-05-21) and run `tsc
  --noEmit` after route tests.
- Roster link control — on `src/app/(dashboard)/roster/` (player edit), add a "Did you coach
  this player last season?" control that sets/clears `prior_player_id` via the client
  `mutate()` path (NOT direct Supabase — AGENTS.md rule 3). The candidate prior players come
  from a small server-scoped read (org-scoped, the coach's own players from prior-season teams);
  do NOT expose any other org's players. Dark zinc/orange; 44px touch target; no banned words;
  no emoji-decorated headings.
- `players` is already in the `/api/data` allow-lists, so the `mutate()` write of
  `prior_player_id` works through the existing generic endpoint — confirm the field is
  permitted by the mutate route's column handling (it writes arbitrary columns on allow-listed
  tables today; no allow-list change expected).
- `tests/ai/parent-report-cross-season.test.ts` (new, `.test.ts` NOT `.spec.ts` —
  `vitest.config.ts` excludes the spec glob; LESSONS.md 2026-05-20). Mock `@/lib/supabase/server`
  (chainable in-memory, as in `tests/ai/parent-report-continuity.test.ts` from 0016),
  `@/lib/ai/context-builder`, and `@/lib/ai/client`'s `callAIWithJSON` so the prompt args are
  assertable. Cover: linked prior player + seeded prior-season report → cross-season block in
  prompt; `prior_player_id` null → no cross-season block (0016 behavior intact); cross-org
  `prior_player_id` → ignored, no cross-org read; prior-fetch-throws → 2xx single-season with
  `since_last_season: null`; persisted insert shape unchanged; existing tier enforcement
  unchanged (free still blocked server-side). Run under Node 20.19.0 via PATH (LESSONS.md
  2026-05-21).
- AI contract test under `tests/ai/` reusing the hoisted Anthropic/OpenAI/Gemini SDK mock
  strategy from `tests/ai/provider-failover.test.ts` so the cross-season `parentReport` prompt
  is exercised through at least two providers and parsed against `parentReportSchema`.
- `tests/components/` — a test for the roster link control: it writes `prior_player_id` via
  `mutate()` and offers only org-scoped candidates (mock the candidate read).
- `tests/e2e/` — extend the parent-report / roster e2e against the 0006-seeded local Supabase
  (`.spec.ts`, the Playwright convention). Seed two teams from different seasons in the same org
  with a linked `prior_player_id` and a prior-season `parent_report` plan, so the generated
  report can resolve the cross-season note deterministically; the seed/migration work is the
  dev's (this ticket only flags it — seed the `prior_player_id` link and the prior-season report
  row). Skip when E2E creds are unset, per convention.
- New deps: no. Migration: YES — one column `players.prior_player_id` (nullable FK, unique
  version prefix, balanced insert cols/values). Env vars: no. AI prompt change: YES —
  `parentReport` in `src/lib/ai/prompts.ts` (cross-season block, gated on presence). Tier
  feature key: NO — rides the existing `report_cards` / `parent_sharing` parent-report gate.

## Implementation log

(Appended by the implementation-dev agent during execution.)
