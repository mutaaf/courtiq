---
id: 0040
title: Turn an opponent scouting profile and this team's last 4 weeks into a one-tap pre-game brief
status: in-progress
priority: P2
area: ai
created: 2026-05-26
owner: product-groomer
---

## User story

As a coach the night before a game whose opponent I've already jotted scouting notes on, I
want one tap on the opponent profile to produce a short, specific pre-game brief — what they
do well, what we've been working on that fits, three things to remind the team Saturday
morning — so that I'm not at 11pm on a Friday turning four bullet points into a coach's
sermon by hand.

## Why now (four lenses)

### Product Owner
The two inputs to a good pre-game brief already exist as structured data in the product and
nothing synthesizes them. Coaches manually fill in opponent scouting profiles — name,
strengths, weaknesses, key players, notes — and they are persisted today as `plans` rows with
`type='opponent_profile'` and the `OpponentProfileData` shape (`src/lib/opponent-profile-
utils.ts`). The same coach has, on the same team, weeks of observations, a Practice Arc
(0018/0020) showing what we've been working on, and a coaching signature (0037) of how this
coach actually coaches. There is a `gamedayPrep` prompt in `src/lib/ai/prompts.ts` already
written from when the product imagined a full prep sheet — but it is HEAVY (pregame_message +
scouting_report + game_plan + lineup + substitution_plan + halftime + reminders) and is not
wired to any route. The smallest meaningful unit of value is a LIGHTER artifact: a pre-game
brief that pulls the two inputs together into four short sections a coach can read in 90
seconds and drop into the group chat. One new route, one new prompt registry entry alongside
the existing ones, one new `plans.type` ('pregame_brief'), and a "Generate brief" button on
the existing opponent-profile card on the plans page. No new public surface; no new tier
limit infrastructure; no new minor data.

### Stakeholder
The structured-coach-artifact moat is the set of plan types only SportsIQ can produce because
only SportsIQ has the structured inputs. A pre-game brief that fuses opponent notes + the
team's last 4 weeks of observations + the coach's signature is exactly that kind of artifact:
none of the inputs exist in a forms app, and the synthesis is invisible without `callAI()` +
the team context the product already builds. This adds one more plan type to the moat the
2026 product has been quietly accumulating (debrief, parent report, weekly star, season
recap, game recap, season letter, season storyline, season awards, huddle script, team talk,
coach reflection, practice arc, opponent profile — and now pre-game brief), each one of which
deepens the switching cost. It is tier-gated to `pro_coach` (the existing `tendencies` /
`analytics` tier) because the coach who runs scouted games — travel teams, tournament teams,
older age groups — is the coach already on Pro or about to be; the gate is honest, not
contrived. And it routes through `callAIWithJSON(orgId)` so multi-provider routing, quota,
failover (0012) and the quota-wall resume (0035) all apply unchanged.

### User (Friday night, the coach at the kitchen table, a paper notebook open, the kid asleep)
They open the team's plans page. The opponent profile they wrote on Wednesday is there. They
tap "Generate pre-game brief." 6-8 seconds later they have: a two-sentence read on what this
opponent does well; a two-sentence read on what we've been working on that fits; three
things to remind the team in the huddle Saturday morning; one line of coach-note for
themselves. They long-press, copy, drop it in the team group chat. Saturday morning they
re-open the artifact on the sideline. On a flaky connection (gym wifi) the existing AI quota
+ failover (0012) and the quota-wall resume after upgrade (0035) handle the network-rough
path; on a free coach who hits the quota wall, the existing 402 + upgrade gate (0035) just
works, because it's the same `callAIWithJSON` path.

### Growth
The "show me" moment is the brief itself, dropped in the team group chat at 8:30am Saturday:
four short sections, specific to this opponent, in coach voice — the kind of message a
parent who is also a coach for another team reads and asks "wait, who wrote that?". The
viral artifact is a copy-pasteable text block (no public token surface in v1 — keep it
coach-private, no minor data leaving the app), so this is retention-and-credibility, not
viral-via-link. It also pulls the existing dormant `opponent_profile` plan type into a
reason-to-use loop: today a coach writes a scouting note and nothing happens; with this they
get an artifact every time, which makes writing the next scouting note worth doing — a
feedback loop on a structured input we already have.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new `pregameBrief` entry in the `PROMPT_REGISTRY` of `src/lib/ai/prompts.ts` accepts
  the existing `OpponentProfileData` shape plus `observationInsights` (the same
  `ObservationInsightsParam` `parentReport` already takes) plus an optional `arcContext` and
  optional `coachingSignature` (the 0037 type). The output JSON has FOUR keys and only four:
  `opponent_read` (string, 2 sentences), `our_edge` (string, 2 sentences), `huddle_points`
  (string[] of 3), `coach_note` (string). No `lineup`, no `substitution_plan`, no
  `pregame_message` — that is what makes this brief LIGHTER than the dormant `gamedayPrep`
  prompt. (vitest: the rendered prompt contains the scouting fields and observation insights;
  the schema is the four-key allow-list and rejects any other key.)
- [ ] Voice contract: the rendered `pregameBrief` system+user prompt does NOT contain any
  AGENTS.md banned word (`journey`, `amazing`, `exciting`, `elevate`, `empower`, `synergy`).
  Per LESSONS#0023, the prompt instructs voice POSITIVELY ("write like a clipboard, not a
  marketing landing page") and never enumerates the banned tokens verbatim. (vitest scans the
  rendered prompt string and asserts none of those tokens appear in either `system` or
  `user`.)
- [ ] `POST /api/ai/pregame-brief` (new) accepts `{ teamId, opponentProfilePlanId }`:
  resolves the caller via `createServerSupabase().auth.getUser()` → 401; verifies the team
  belongs to the caller's `coaches.org_id` (mirror `/api/ai/weekly-star`,
  `/api/season/rollover`) → 404 for a foreign team; verifies the opponent-profile plan exists,
  belongs to the same team, and has `type='opponent_profile'` → 404 otherwise. Then calls
  `callAIWithJSON({ prompt: 'pregameBrief', orgId, … })` and persists the result as a new
  `plans` row with `type='pregame_brief'`, the team/coach/session linkage already used by
  game_recap, and `content_structured` matching the four-key schema. (vitest: 401 / cross-org
  → 404 / mismatched-team opponent → 404 / happy path writes a `pregame_brief` plan with the
  four-key body.)
- [ ] Tier gating is BOTH server AND client: a `feature_pregame_brief` key is added to
  `TIER_LIMITS` for `pro_coach` and `organization` (matching the existing pattern of
  `feature_weekly_digest`, `feature_program_focus`, `feature_season_momentum`). The route
  checks `canAccess(tier, 'feature_pregame_brief')` server-side and returns 402 `{ upgrade:
  true }` for a free/coach tier; the "Generate brief" button on the opponent-profile card is
  wrapped in `<UpgradeGate feature="feature_pregame_brief">` with benefit copy added to
  `FEATURE_CONFIG`. Per LESSONS#0023's reconciliation: the `feature` prop value MUST equal
  the tier-key string verbatim, NOT a shorthand. (vitest: free/coach tier 402s; pro_coach
  succeeds. Playwright: free coach sees the upgrade gate, pro coach sees the button.)
- [ ] The quota path is unchanged from the rest of the AI surface: a pro_coach is on
  unlimited monthly quota (`maxAICallsPerMonth: 999999` already), a free coach hits the same
  402-upgrade wall the other AI routes raise, and the route logs the call to `ai_interactions`
  through `callAIWithJSON` like every other route does. (vitest: `callAIWithJSON` invoked
  with the right `orgId` and `interactionType`; the existing failover wrapper from 0012 still
  applies — no provider hardcoding.)
- [ ] The `plans_type_check` constraint allow-list is extended in a NEW numbered migration
  to include `'pregame_brief'`. The migration uses a unique version prefix (next free after
  the existing tracked migrations — LESSONS#0006), balanced INSERT column/value counts (none
  in this migration, but assert no syntax errors against a fresh-DB CI seed). (vitest scans
  the new migration SQL — `--` comments stripped per LESSONS#0088 — and asserts only
  `'pregame_brief'` is added; no other type is touched.)
- [ ] AI contract test: the `pregameBrief` prompt produces structurally-valid JSON parsing
  against the four-key schema under at least Anthropic AND one fallback provider (mirror
  `tests/ai/provider-failover.test.ts` and `tests/ai/plan-coaching-signature-contract.test.ts`).
  The signature is not Anthropic-specific. (vitest contract test.)
- [ ] COPPA / privacy: the brief writes NO minor data outside what is already on the team's
  observations (no new player field, no new collection). The artifact is persisted as a
  coach-private `plans` row and is NEVER exposed on a public surface — there is no
  `/api/pregame-brief/create` public-token route in v1, the brief does not appear in the
  sitemap (0038), and `/share/[token]` does not render it. The four-key output schema
  carries NO player names by construction — `huddle_points` and `coach_note` are about the
  TEAM and the OPPONENT, not individual children. (vitest: the rendered output schema
  rejects per-player fields; Playwright on the seeded public surfaces asserts no
  pregame_brief content renders.)
- [ ] Regression: the existing `opponent_profile` write path, the dormant `gamedayPrep`
  prompt registry entry, and every other AI route stay byte-identical. The new route is
  purely additive. (vitest: a fixture of the existing `opponent_profile` save still passes;
  `gamedayPrep` prompt rendering is unchanged.)

## Out of scope

- A public, shareable pre-game brief token surface (e.g. `/pregame/<token>`). The brief is
  coach-private in v1; share-card surfaces are a separate ticket once we've validated the
  artifact actually gets used. A new public surface for game-time-sensitive content also
  needs its own COPPA review (minor names appear in `huddle_points` only if the AI fails the
  no-player-names instruction, and we'd rather catch that in coach-private review before
  publishing).
- An OG image renderer for the brief. The sitemap ticket (0038) is the SEO ticket; this one
  is an AI-artifact ticket. If a share surface ever ships, that ticket adds the OG renderer.
- Wiring the brief into the in-game halftime-adjustments route. Pre-game and mid-game are
  distinct moments and distinct artifacts; today's halftime route stays untouched.
- Auto-running the brief on every saved opponent profile. v1 is one tap, on the coach's
  explicit action — generating an artifact without the coach's intent burns quota
  unannounced (LESSONS-style "passive AI consumption" anti-pattern).
- A coach-editable "default brief template" preference. v1 is generated; a settings form
  would invert the value (the AI is the value, not the form).
- Cross-COACH learning ("coaches who scouted teams like this also said..."). v1 is strictly
  the coach's OWN scouting input and this team's OWN observations.
- Re-running or backfilling the brief against past opponent profiles. v1 only affects
  briefs generated AFTER this ships.
- Threading the brief into the program-pulse digest (0028) or the weekly digest (0023). The
  brief is a coach-individual artifact, not a director-level one.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- `src/lib/ai/prompts.ts` — add `pregameBrief: (params: PromptParams & { opponent:
  OpponentProfileData; observationInsights?: ObservationInsightsParam; arcContext?: …;
  coachingSignature?: CoachingSignature | null }) => ({ system, user })`. The `system`
  preamble reuses `buildSystemPreamble`. The instructions tell the model: write four short
  blocks; one read on the opponent (2 sentences); one read on what we've been working on
  that fits (2 sentences, drawn from observationInsights + arcContext); three huddle points
  the coach can read out Saturday morning; one coach-note to themselves. The output JSON
  schema declared in the prompt is `{ "opponent_read", "our_edge", "huddle_points": [],
  "coach_note" }` and ONLY those four keys (the schema check pins it). Voice instruction is
  POSITIVE — never enumerate the banned-word list verbatim (LESSONS#0023).
- `src/lib/ai/schemas.ts` — add the zod schema `pregame_brief` with exactly the four keys.
- `src/app/api/ai/pregame-brief/route.ts` (new) — `POST { teamId, opponentProfilePlanId }`.
  Auth → 401; team ownership check (`coaches.org_id`) → 404; opponent-profile plan check
  (belongs to team, type='opponent_profile') → 404. Build `observationInsights` from the
  team's last ~4 weeks of observations using the existing `src/lib/ai/context-builder.ts`
  helpers (already used by parent-report, weekly-star, etc.). Fetch the caller's coaching
  signature using the 0037 helper (`buildCoachingSignature` over `eq('coach_id', user.id)`
  plans). Call `callAIWithJSON({ prompt: 'pregameBrief', schema: pregame_brief, orgId,
  interactionType: 'custom' or a new value if appropriate, params })`. Persist the result as
  a new `plans` row with `type='pregame_brief'`, `coach_id`, `team_id`, `session_id` if a
  game session is tied (use the existing optional `session_id` column from migration 032 —
  not required for v1), and `content_structured` = the AI output. Service-role only; never
  a direct client Supabase write.
- `src/lib/tier.ts` — add `'feature_pregame_brief'` to `pro_coach.features` AND
  `organization.features`. Do NOT add to free / coach.
- `src/components/ui/upgrade-gate.tsx` — register `feature_pregame_brief` in `FEATURE_CONFIG`
  with benefit copy. The `feature` prop value MUST be the same string as the tier-key (the
  exact thing `canAccess` reads) — LESSONS#0023 caught this exact mismatch before.
- `src/app/(dashboard)/plans/page.tsx` — on the opponent-profile card (the surface that
  already renders `opponent_profile` plans), add a "Generate pre-game brief" button wrapped in
  `<UpgradeGate feature="feature_pregame_brief">`. POSTs to `/api/ai/pregame-brief` via
  `mutate()` (the existing client-helper, AGENTS.md rule 3). On success, render the brief
  inline (the existing plans-page card pattern). Dark zinc/orange, 44px targets, no banned
  words. Long-press / select-all friendly so the coach can paste the result into the team
  group chat.
- New migration `supabase/migrations/NNN_plans_type_pregame_brief.sql` — extend the
  `plans_type_check` constraint allow-list to include `'pregame_brief'`, drop-and-recreate
  the constraint exactly the way `034_plans_type_check_align.sql` does. Unique version
  prefix (next free integer after the latest tracked migration; check
  `ls supabase/migrations/` first — LESSONS#0006). No new column, no other constraint
  changes.
- `src/types/database.ts` — extend the `Plan.type` union with `'pregame_brief'`.
- `tests/ai/pregame-brief.test.ts` (new, `.test.ts` NOT `.spec.ts` — LESSONS#38) — the
  route's auth / ownership / opponent-mismatch / happy-path / 402-on-free cases. Run `tsc
  --noEmit` after route tests (LESSONS#0008). Run under Node 20.19.0 (LESSONS#0010).
- `tests/ai/pregame-brief-contract.test.ts` (new) — multi-provider contract test mirroring
  `tests/ai/plan-coaching-signature-contract.test.ts`; assert JSON parses against the
  four-key schema under at least Anthropic AND one fallback provider; assert no banned-word
  tokens in the rendered prompt; assert the output schema rejects unknown keys.
- `tests/migrations/plans-pregame-brief-coppa.test.ts` (new) — scan the new migration's
  executable DDL (strip `--` comments first, LESSONS#0088); assert only `'pregame_brief'` is
  added to the allow-list and no minor-data column is introduced.
- `tests/e2e/pregame-brief-flow.spec.ts` (new Playwright spec) against the 0006-seeded
  Supabase. Seed: a `pro_coach`-tier org coach + a team + one `opponent_profile` plan (raw
  SQL; `content_structured` is jsonb, so wrap the OpponentProfileData blob as a valid JSON
  literal — LESSONS#0085 / 0031). The spec navigates to the plans page, taps the new button,
  waits for the brief, and asserts the four output blocks render. Use a `data-testid` on
  the brief container to scope strict-mode locators (LESSONS#0081). Skip when E2E creds
  are unset; skip for tier-gated UI assertion when seed coach is not pro_coach.
- `src/lib/supabase/middleware.ts` — no change (the new route is dashboard-scoped, authed).
  `/api/ai/pregame-brief` is NOT public. The sitemap ticket (0038) does not include it.
- New deps: no. Migration: YES — one constraint-extension migration. Env vars: no. AI prompt
  change: YES — new `pregameBrief` entry in `PROMPT_REGISTRY`. Tier feature key: YES —
  `feature_pregame_brief` in `pro_coach` + `organization`.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-26 — branch `feat/0040-pregame-scouting-brief` opened off `origin/main`; status flipped to `in-progress`.
