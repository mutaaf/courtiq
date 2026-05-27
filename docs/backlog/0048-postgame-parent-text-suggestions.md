---
id: 0048
title: Give the coach one short text per kid to paste into Messages after a game — the post-game complement to the sideline cheat sheet
status: shipped
priority: P1
area: ai
created: 2026-05-26
owner: product-groomer
---

## User story

As a volunteer coach who just finished a Saturday game and knows that by Sunday night seven of
twelve parents will have texted "how was Sarah today?", I want one tap on the just-finished
session to give me a private list of one short, specific text per player I can long-press,
copy, and paste into Messages — so that every parent who texts me tonight hears back something
specific about their kid in 10 seconds instead of getting "great game!" or going dark for two
days.

## Why now (four lenses)

### Product Owner
Ticket 0046 just shipped the PRE-game sideline cheat sheet — a roster sheet the coach glances
at at the field, one row per kid with a lead line + a working-on line. That artifact is right
for the half-time conversation that happens in person. It is the WRONG artifact for the
asynchronous follow-up that actually dominates a youth-sports week: the parent texts the
coach Sunday night, and the coach has 90 seconds across twelve players to send something
specific or send nothing. The game recap (0027) is team-wide and shareable; the parent report
(0016) is per-player but long and email-shaped; nothing in the product today is a
per-player TEXT-SHAPED artifact bound to a single just-played game. The smallest meaningful
unit of value is one new `plans.type='postgame_parent_texts'` AI artifact — one tap on the
session detail page right after the game, six to eight seconds, twelve message-shaped one-line
texts the coach taps to copy. One prompt registry entry, one route, one migration extending
`plans_type_check`, one section on the session page. Reuses the same `report_cards` tier gate
the sideline sheet and parent report already use — the same coach who pays for those needs
this one.

### Stakeholder
This deepens the structured-coach-artifact moat along an axis no shipped artifact has touched:
text-message-shape. A forms app can store notes; what it cannot do is hand a coach twelve
text messages, sized for the Messages app, specific to a single game, in the coach's voice,
in eight seconds. It compounds two existing systems: (1) the per-player observation history
that 0046 / 0016 / 0034 already read; (2) the session-level signal that 0027's game recap
already binds against (`session_id` on `plans`). The artifact is coach-private by
construction — no public token surface, no minor name crosses any public URL — but the
DOWNSTREAM artifact (the text the coach pastes into the parent's Messages thread) is real
external content that parents quote in their own group chats. That is conversational
virality, the same shape that made the parent report a moat: parents talking ABOUT what the
coach said. And every coach who uses it once will reach for it after the next game, because
the alternative is twelve unanswered texts. Retention by recurrence.

### User (Saturday 1:00pm, the coach's kid in the back seat eating goldfish, the game just over)
The coach taps into the just-finished session on /home. Below the game recap card they see a
new button: "Generate parent texts." Six seconds later they have twelve short rows — name +
one tap-to-copy line each. "Sarah — Sarah's defense in the second half was the difference;
she boxed out twice in a row, which is what we've been working on." "Devon — Devon was first
to dive for the loose ball today and held his position on the line all four quarters." They
long-press the row for Sarah's mom, copy, paste into the text thread, hit send. Repeat for
each parent who texts that night, or pre-emptively for the four parents who always text. The
sheet never leaves the coach's phone; no parent ever sees the SHEET, only the individual line
the coach chose to send them, in Messages, from the coach's own number. On a flaky cellular
connection the existing AI failover (0012) and quota-wall resume (0035) just work — the
artifact is persisted as a `plans` row so a re-open after the network blinks shows it
unchanged.

### Growth
The "show me" moment is one parent's screenshot of the text — pasted in their family group
chat with "look what the coach said about Sarah today" — that another parent in the group
chat asks "wait, how does your coach do that?". That conversation converts a parent (who
becomes a portal reader, possibly a 0019 self-signup coach) and, more powerfully, the
next-team-over coach whose practice the original parent's kid also goes to. Distinct from
every shipped surface: 0027 is the team's recap card (one artifact, twelve parents); this is
twelve micro-artifacts (one per parent, one game). Retention compounds at the game-cadence
level — every game produces twelve new use-the-app moments, and the highest-engagement
volunteer coaches play one game a week through a 10-week season = 120 micro-artifacts per
coach per season.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new `postgameParentTexts` entry in the `PROMPT_REGISTRY` of `src/lib/ai/prompts.ts`
  accepts `{ team, players, sessionMeta, observationInsightsByPlayer }` (the same per-player
  shape `sidelineTalkingPoints` from 0046 already consumes). The output JSON schema has
  EXACTLY two top-level keys: `session_id` (string) and `entries` (array). Each entry has
  exactly three keys: `player_id` (string), `player_first_name` (string), `text_message`
  (string, max 220 characters — fits comfortably in a single SMS without segmenting; one
  sentence; addresses the parent in second person ("Sarah …") not the player in first). NO
  bullet lists, no markdown, no extra fields, NO `subject` (this is a text, not an email).
  The array length equals the active roster size. (vitest: rendered prompt contains the
  per-player insights and the session date; schema rejects extra keys; per-entry length cap
  enforced; entries length matches input.)
- [ ] Voice contract: the rendered prompt contains NO AGENTS.md banned word (`journey`,
  `amazing`, `exciting`, `elevate`, `empower`, `synergy`) in either the system or user
  block. Per LESSONS#0023 the prompt instructs voice POSITIVELY ("write like a coach texting
  one specific parent — one sentence, specific to today's game, in the coach's own voice,
  not a marketing newsletter") and never enumerates the banned tokens verbatim. (vitest
  scans `${system}\n${user}` and asserts none of those tokens appear.)
- [ ] `POST /api/ai/postgame-parent-texts` (new) accepts `{ sessionId }`. Auth via
  `createServerSupabase().auth.getUser()` → 401; the session resolves to a team belonging to
  the caller's `coaches.org_id` → 404 otherwise; the session's `type` is `'game'` →
  `400 { error: 'not_a_game' }` if the session is a regular practice (this artifact is
  game-only by design; the sideline sheet is the practice-time analog). Below a small
  threshold of observations on the team in the 24 hours either side of the session start
  → `200 { sheet: null }` (mirrors the digest 0023 below-threshold short-circuit; gives no
  quota cost on a cold-just-finished game). Otherwise builds inputs via the existing
  `src/lib/ai/context-builder.ts` helpers, groups recent observations by player, calls
  `callAIWithJSON({ prompt: 'postgameParentTexts', schema, orgId, interactionType: 'custom'
  })`, persists the result as a new `plans` row with `type='postgame_parent_texts'`,
  `coach_id`, `team_id`, `session_id` (the in-progress session — same session_id binding
  pattern as `game_recap`), and `content_structured` matching the schema, and returns
  `{ planId, content_structured }`. (vitest covers each branch.)
- [ ] Server-side tier gate reuses the EXISTING `report_cards` feature key —
  `canAccess(tier, 'report_cards')` returns true for Coach/Pro/Org and false for Free; the
  route returns `402 { upgrade: true, feature: 'report_cards' }` on free. Per LESSONS#0023
  the `<UpgradeGate feature="report_cards">` prop value MUST equal the tier-key string
  verbatim. The session-page button is wrapped in the same gate. NO new `FEATURE_CONFIG`
  entry needed — the existing `report_cards` benefit copy is reused. (vitest: free → 402;
  coach → 200. Playwright: free coach sees the upgrade gate; coach sees the button.)
- [ ] The migration `045_plans_type_postgame_parent_texts.sql` extends the `plans_type_check`
  CHECK constraint allow-list by drop-and-recreate (mirror
  `044_plans_type_sideline_talking_points.sql`'s pattern) to include
  `'postgame_parent_texts'`. Pick the next free integer prefix after 0046's `044_…` (so
  `045_…`); verify with `ls supabase/migrations/`, LESSONS#0006. The migration only widens
  the allow-list; no new column, no new table. (vitest scans the executable DDL — strip `--`
  comments per LESSONS#0088 — and asserts only `'postgame_parent_texts'` is added.)
- [ ] AI contract test: the `postgameParentTexts` prompt produces structurally-valid JSON
  parsing against the schema under at least Anthropic AND one fallback provider (mirror
  `tests/ai/sideline-talking-points-contract.test.ts` from 0046). The contract assertion
  iterates the returned `entries` and validates each three-key shape AND the per-entry
  220-character cap. No provider hardcoding. (vitest contract test.)
- [ ] COPPA / privacy: the artifact NEVER reaches a public surface. The new plan type is
  NOT added to any `/share/*` allow-list, NOT added to the sitemap (0038), and the route
  has NO companion `/share/postgame/<token>` or token-create route. The artifact's
  `content_structured` includes `player_first_name`, NOT `player_full_name` — first names
  only, mirroring the parent report's existing convention and 0046's pattern. The
  `text_message` field is constrained to mention only the player's first name; the prompt
  rendering test plants a planted full-name token in the input and asserts the rendered
  prompt never echoes the full surname out as a verbatim instruction. (vitest: scan every
  public-surface page renderer for imports of the new plan type and assert none reference
  it; Playwright on the seeded public pages — `/share/<token>`, `/team-card/<token>`,
  `/coach/<token>`, `/recap/<token>`, `/season-recap/<token>` — asserts no
  `postgame_parent_texts` content renders.)
- [ ] Regression: every existing `plans.type` write path stays byte-identical (the
  per-player parent report 0016/0034, the season recap 0017, the game recap 0027, the
  weekly star 0009, the 0040 pre-game brief, the 0046 sideline talking points). The new
  write is purely additive. The 0027 game recap continues to bind `session_id` to the same
  session; both artifacts can coexist on the same session row. (vitest: a fixture save of
  each existing plan type still passes after the new migration; both `game_recap` and
  `postgame_parent_texts` rows can be queried for the same session_id without collision.)
- [ ] Quota: the route routes through `callAIWithJSON({ orgId })` so multi-provider failover
  (0012), quota counting, and quota-wall resume (0035) all apply. A Coach-tier coach at
  quota hits the same 402 + upgrade-resume path as every other AI artifact — no bypass.
  (vitest: the route is wrapped by `enforceAIQuota` like every other AI route; the existing
  quota path tests are not weakened.)
- [ ] The session page's "Generate parent texts" button only appears on a session whose
  `type === 'game'`. On a practice session the button is absent — the analog there is the
  shipped 0046 sideline cheat sheet on /home. (Playwright: a seeded practice session shows
  no button; a seeded game session shows the button gated by `<UpgradeGate
  feature="report_cards">`.)
- [ ] The rendered artifact UI has a per-row long-press / select-all-friendly affordance:
  each row is a single contiguous text block (no inline buttons interrupting the sentence),
  and a small "Copy" button next to each row writes the row's `text_message` to the
  clipboard via `navigator.clipboard.writeText`. Mobile-first 44px target, dark zinc/orange,
  no emoji-decorated headings. (Playwright: tap the Copy button on a seeded row; assert the
  clipboard contents equal the row's `text_message` exactly. vitest component test:
  rendering the artifact produces twelve rows with one Copy button each.)

## Out of scope

- A public, shareable post-game-text token surface. The artifact is coach-private by design;
  putting the per-kid texts behind a token would invert the artifact's value (the text is
  delivered through the coach's own Messages app, not a SportsIQ URL) and trigger a COPPA
  review the simpler private surface skips.
- An auto-send / bulk-text feature ("send these to every parent"). v1 is one-tap-to-COPY only;
  actually sending the SMS rides on the coach's own Messages app and their own phone. A bulk
  send would require Twilio / a paid SMS gateway and is a separate billing + privacy ticket.
- A schedule / auto-generation cron at game end. v1 is one-tap on the session page; the
  artifact is generated on the coach's intent, not by a backend timer. Auto-firing would burn
  quota without intent (the "passive AI consumption" anti-pattern).
- A parent-facing version ("here's what the coach plans to say"). Same reason — the artifact's
  value depends on the coach sending the text from their own phone in their own voice.
- Multi-language localization. v1 is English only.
- A coach-editable per-player override / "edit before copy." The AI is the value; the coach
  can re-tap to regenerate (the edit path is regeneration). A per-row edit field would
  invert the time-savings the artifact exists for.
- A different tier gate or pricing experiment. v1 reuses the existing `report_cards` feature
  key exactly; a higher-tier "Pro-only post-game" split is a future discussion.
- An OG preview image. The artifact is not a public surface; no OG renderer.
- Cross-game memory ("since last game Sarah has come a long way"). v1 is scoped to recent
  observations only. Cross-season threading rides 0034's pointer in the parent report.
- Threading the artifact into the program-pulse digest (0028) or the weekly parent rollup
  (0041). The post-game texts are a coach-individual game-day artifact, not a digest signal.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- `src/lib/ai/prompts.ts` — add `postgameParentTexts: (params: PromptParams & { team,
  players: { id, first_name }[], sessionMeta: { id, started_at, opponent_name? },
  observationInsightsByPlayer: Record<player_id, ObservationInsightsParam> }) => ({ system,
  user })`. The `system` preamble reuses `buildSystemPreamble`. The instructions tell the
  model: for each player, write ONE short text message; one sentence; addresses the PARENT
  in second person, refers to the player by first name; specific to today's game; 220
  characters maximum; coach voice (clipboard, not landing-page). The schema declared in the
  prompt is the two-key top-level shape with three-key entries. Voice instruction is
  POSITIVE — never enumerate banned tokens verbatim (LESSONS#0023).
- `src/lib/ai/schemas.ts` — add `postgameParentTextsSchema` (zod): `{ session_id:
  z.string(), entries: z.array(z.object({ player_id: z.string(), player_first_name:
  z.string(), text_message: z.string().min(1).max(220) })).min(1) }`.
- `src/app/api/ai/postgame-parent-texts/route.ts` (new) — `POST({ sessionId })`. Auth → 401;
  session-belongs-to-org → 404; session is not a game (`type !== 'game'`) → 400 with
  `{ error: 'not_a_game' }`; below-threshold (< 6 observations across the session window,
  mirror 0046's threshold philosophy and adjust per real data) → `{ sheet: null }` no AI
  call; happy path groups recent observations by player via the existing `context-builder`
  helpers and calls `callAIWithJSON({ prompt: 'postgameParentTexts', schema:
  postgameParentTextsSchema, orgId, interactionType: 'custom' })`, then writes a `plans`
  row. Service-role only; never a direct client write. Mirror the 0046 route's structure
  byte-for-byte where possible.
- `src/lib/tier.ts` — NO change. `report_cards` already exists on Coach / Pro / Org and
  does not on Free. Confirm in vitest.
- `src/components/ui/upgrade-gate.tsx` — NO new `FEATURE_CONFIG` entry; reuse the existing
  `report_cards` benefit copy.
- `src/app/(dashboard)/sessions/[sessionId]/page.tsx` (existing — read first to confirm the
  layout) — on a session whose `type === 'game'`, after the existing game-recap card,
  render a "Post-game parent texts" section with a single "Generate parent texts" button
  wrapped in `<UpgradeGate feature="report_cards">`. POSTs to
  `/api/ai/postgame-parent-texts` via `mutate()` (AGENTS.md rule 3). On success, render
  the artifact inline: a clean roster list, each row two parts — the player's first name
  bold + the one-line text in a slate row with a Copy button on the right. Long-press
  friendly. Dark zinc/orange, 44px targets, no emoji-decorated headings. On a practice
  session (`type !== 'game'`) the entire section is absent (the analog there is the 0046
  card on /home).
- New migration `supabase/migrations/045_plans_type_postgame_parent_texts.sql` — drop and
  recreate `plans_type_check` to include `'postgame_parent_texts'`. The next free prefix
  after 0046's `044_…` is `045_…` — confirm by `ls supabase/migrations/` (LESSONS#0006).
  The migration only widens the allow-list; no new column, no new table.
- `src/types/database.ts` — extend the `Plan.type` union with `'postgame_parent_texts'`.
- `src/app/api/data/route.ts` — the `plans` allow-list already includes the table; assert
  in a vitest that the new type round-trips via `query({ table: 'plans', where: { type:
  'postgame_parent_texts' } })`.
- `src/components/sessions/postgame-parent-texts-card.tsx` (new) — client component, the
  inline render of the artifact + the per-row Copy button. Imports `navigator.clipboard`
  inside the click handler (defensive — older browsers fall through to a text-select). Use
  a `data-testid="postgame-parent-texts"` on the container and `data-testid="row-{player_id}"`
  on each row to scope strict-mode Playwright locators (LESSONS#0081).
- `tests/ai/postgame-parent-texts.test.ts` (new, `.test.ts` NOT `.spec.ts` —
  LESSONS#0020/#38) — route auth / session ownership / not-a-game 400 /
  below-threshold / happy path / 402-on-free. Mock `@/lib/supabase/server` chainably and
  `@/lib/ai/client`'s `callAIWithJSON`. Run under Node 20.19.0 (LESSONS#0010). Run `tsc
  --noEmit` after route tests (LESSONS#0008/#0096).
- `tests/ai/postgame-parent-texts-contract.test.ts` (new) — multi-provider contract test
  mirroring `tests/ai/sideline-talking-points-contract.test.ts`; assert JSON parses against
  the schema under Anthropic + one fallback; assert no banned-word tokens in the rendered
  prompt; assert the schema enforces first-name-only on each entry and the 220-character
  cap on `text_message`; iterate the entries array and validate each three-key shape.
- `tests/migrations/plans-postgame-parent-texts-coppa.test.ts` (new) — scan the migration's
  executable DDL (strip `--` comments per LESSONS#0088); assert only `'postgame_parent_texts'`
  is added to the allow-list and no minor-data column is introduced.
- `tests/components/postgame-parent-texts-card.test.tsx` (new) — render the artifact with
  three seeded rows; assert each row's text renders; tap the Copy button on one row and
  assert `navigator.clipboard.writeText` was called with the row's exact `text_message`
  (mock `navigator.clipboard` in a setup file).
- `tests/e2e/postgame-parent-texts-flow.spec.ts` (new Playwright spec) against the
  0006-seeded Supabase. Seed: a Coach-tier coach + a team + 12 players + a session with
  `type='game'` that just finished + 8+ observations spread across the session window + a
  pre-saved `plans` row of `type='postgame_parent_texts'` with the two-key schema body
  (raw SQL; `content_structured` is jsonb so wrap as a valid JSON literal —
  LESSONS#0085/#0086). The spec navigates to the session page, asserts the section
  renders, asserts twelve rows visible; a parallel sub-test seeds a PRACTICE session and
  asserts the section is absent. Use `data-testid` scoping (LESSONS#0081). Skip when E2E
  creds are unset (convention).
- `src/lib/supabase/middleware.ts` — NO change. The new route is authed and dashboard-only.
  No public surface, no token route.
- New deps: NO. Migration: YES — one constraint-extension at `045_…`. Env vars: NO. AI
  prompt change: YES — `postgameParentTexts` in `PROMPT_REGISTRY`. Tier feature key: NO new
  key — reuses `report_cards`.
- LESSONS to anchor: #0023 (voice positively, `feature` prop equals the tier key verbatim),
  #0006/#0009 (migration prefix uniqueness; CHECK-constraint widening across a fresh-DB
  seed), #0081 (data-testid scoping in Playwright), #0085/#0086 (jsonb seeding in raw SQL),
  #0088 (strip `--` comments before scanning migration content), #0039 (if a sibling test
  currently uses `mockReturnValueOnce` chains on `from()` for `plans` or `sessions`, drain
  the queue in `beforeEach` so the new artifact's writes don't pollute), #0096 (run `tsc
  --noEmit` without piping into tail so its real exit status reaches you).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-27 — branch `feat/0048-postgame-parent-texts` opened; ticket flipped to in-progress.
- 2026-05-27 — failing tests added across `tests/ai/`, `tests/migrations/`, `tests/components/`, and `tests/e2e/`; backend (prompt + schema + route + migration + types) + UI (`/sessions/[sessionId]` session-page card + `<UpgradeGate feature="report_cards">`) landed under the test-first loop.
- 2026-05-27 — PR #335 opened with auto-merge armed; all three gating checks green (lint 1m36s, unit-tests 2m18s, e2e-tests 4m37s) and the squash merged at 12:27Z. Backlog index + ticket flipped to `shipped` via a separate `chore/0048-mark-shipped` branch (LESSONS#0020/#42/#74).
- 2026-05-27 — Deviation noted: the ticket prose said the card renders on game/scrimmage/tournament via `isGameType(session.type)`-style gating, but the AC text and the route both pin it to `session.type === 'game'` exactly (returning 400 `not_a_game` otherwise). The session-page card therefore renders only on a session of `type === 'game'`; scrimmage/tournament fall through to the existing GameRecapCard above it without a per-parent text. This matches the AC's spirit (post-game texts are for actual games, not practice-shape sessions).
