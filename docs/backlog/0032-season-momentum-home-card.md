---
id: 0032
title: Show the coach where they are in the season so the arc itself pulls them back
status: groomed
priority: P2
area: analytics
created: 2026-05-25
owner: product-groomer
---

## User story

As a volunteer coach six weeks into a twelve-week season, I want the home screen to show me
where I am in the season — "Week 6 of 12" — alongside one honest line about how my team's
notes have trended since week one, so that the app gives me a sense of the whole arc I'm
building, not just what happened last Tuesday, and that arc is the reason I open it on a day
with no practice.

## Why now (four lenses)

### Product Owner
Every retention surface we ship is scoped to a *recent window*. The Monday digest (0023)
recaps the last 7 days. The Capture carryover strip (0014) reads the last debrief. The arc
continuity line (0018/0020) tracks where a single multi-session arc stands. The per-player
memory (0025) shows one player's last note. None of them answers the question that gives a
coach a reason to care across the whole season: "how far into this am I, and is it adding up
to something?" We already store the answer — `teams.current_week` and `teams.season_weeks`
exist on every team, and the observation history accumulates from week one. The smallest
meaningful unit of value is a single glanceable season-momentum card on the home screen: a
"Week N of M" position with a thin progress bar, plus one factual trend line drawn from the
season's accumulated observations (e.g. "23 of your last 30 notes were progress markers, up
from week one"). It is one card built from data we already collect — no new model spend in
the common path — that turns a single-week product into a season-long one.

### Stakeholder
This deepens the Practice Arc / structured-artifact moat along the one axis the shipped
surfaces miss: *season-scoped* memory. A forms app can show this week's notes; it cannot
stand next to a coach in week 6 and say "you're halfway, and here's how the season is
trending." That requires accumulated structured observations from week one plus the
season-position state we track. It compounds the surfaces we already built rather than
forking them — the card's one next-step deep-links into the existing weekly-star, parent
report, and season-recap (0017) artifacts, so the season card becomes the hub that drives
usage of everything downstream as the season closes. The optional one-line season-trend
sentence, if the dev generates it via AI, routes through `callAIWithJSON()` exactly like
every other artifact, inheriting multi-provider routing, quota counting, and failover (0012)
for free; the numeric position + progress bar never touch AI and always render.

### User (Monday morning, coffee, phone, no practice today)
The coach opens the home screen out of habit. Near the top: "Week 6 of 12" with a thin
orange progress bar, and one line — "Most of your recent notes are progress markers — the
season's building." One glance tells them the season is moving and that their notes are
adding up. If the team has no season set (`season_weeks` is null), the card simply shows the
weeks-active count instead, never an error or an empty nag. The read is best-effort: on a
flaky gym connection the home screen renders exactly as it does today and nothing waits on
it. No "you've been inactive" guilt-trip (banned tone); just a factual position in the arc.

### Growth
This is an off-day retention lever distinct from the Monday digest's week recap: the digest
says "here's your last week"; this says "here's where you are in the whole season." A coach
who is reminded, on a quiet day, that they're halfway through a season the app has been
holding the story of is a coach who keeps the app on their home screen through the off-weeks.
The "show me" moment is quiet but real — a coach showing another coach "look, it tracks my
whole season, not just today" is the demo that separates a season-long coaching companion
from a note-taking form. As the bar fills toward week M, the card's next-step nudges the
coach toward generating the season recap (0017), which is itself a viral surface — so the
retention lever feeds the acquisition loop we already shipped.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `GET /api/analytics/season-momentum?teamId=<id>` with an authenticated coach returns `200 { weekPosition, weekTotal, weeksActive, trend }` where `weekPosition` is `teams.current_week`, `weekTotal` is `teams.season_weeks` (may be `null`), `weeksActive` is derived from the team's earliest observation date to now, and `trend` is `{ positiveCount, totalCount }` over the team's recent observations (vitest: a team with a set `season_weeks` and a mix of `positive`/`needs-work` observations returns the position and the trend counts).
- [ ] `GET /api/analytics/season-momentum` returns `200 { weekTotal: null, ... }` (not an error) for a team with no `season_weeks` set, so the card can fall back to a weeks-active display without erroring (vitest: a team with `season_weeks = null` still returns a 200 with `weekTotal: null` and a valid `weeksActive`).
- [ ] `GET /api/analytics/season-momentum` with no auth returns `401` and performs no DB read (vitest).
- [ ] `GET /api/analytics/season-momentum` is org-scoped: a `teamId` the caller's org does not own returns the same not-found contract the existing team-scoped routes use (`404`, matching `/api/ai/weekly-star`) and never reads that team's observations (vitest with a cross-org `teamId`; assert server-side).
- [ ] Tier enforcement is server-side: the route checks `canAccess(tier, 'feature_season_momentum')` and returns `403` for a `free` coach, `200` for a `coach`/`pro_coach`/`organization` coach (vitest seeds an org tier and asserts the gate is enforced in the route, not only in the UI).
- [ ] Playwright: a `coach`-tier coach on `/home` whose active team has a set `season_weeks` and seeded observations sees the season-momentum card with a "Week N of M" label and a progress element; a `free`-tier coach sees an `<UpgradeGate>` prompt for the card, not the card itself.
- [ ] Playwright/component: when `GET /api/analytics/season-momentum` fails or times out, the home screen renders normally and the season-momentum card is absent (best-effort — the card never blocks the home screen, mirroring the 0023 digest and 0008 usage-meter degrade-silently behavior).
- [ ] If the optional one-line season-trend sentence is generated by AI: an AI contract test proves the `seasonMomentum` prompt produces a single structurally-valid trend sentence (parses against the new schema, no per-player names) under at least Anthropic AND one fallback provider, mirroring `tests/ai/provider-failover.test.ts`; if the dev instead derives the sentence from the numeric counts with no AI call, this box is satisfied by a vitest asserting the route makes no `callAI*` invocation and the sentence is built deterministically.
- [ ] COPPA/privacy: the route returns only aggregate counts and the team's own season position — no player name, jersey, or observation text is included, no new field is collected on `players`, and the momentum data is never exposed on any public/no-auth surface (vitest asserts the response body carries only aggregate integers + the team-level position and is not added to `publicPaths`).

## Out of scope

- A full season analytics dashboard, per-skill trend charts, or a category breakdown. v1 is
  one position-in-the-season card with a single trend line; the existing `/analytics` page
  (pro tier) is unchanged and untouched.
- A streak / gamification counter ("you're on a 4-week streak"). The card is a factual
  position in the season arc with one next step, not a points system — same product call as
  the 0023 digest's no-gamification line.
- Emailing or push-notifying the season position. v1 is an in-app card on the home screen the
  coach already opens; a delivered version would need an explicit channel-approval line per
  AGENTS.md (no new sender/tracker here).
- A public or parent-facing version. This is a coach-private retention surface only; it is
  never placed on `/share/[token]`, `/team-card`, `/org/[slug]`, or any no-auth route.
- Persisting a new `season_momentum` artifact to `plans`. v1 computes on demand for the home
  card; do NOT add a new `plans.type` value or touch `plans_type_check`.
- Building the downstream actions. The card's next step deep-links into the EXISTING
  weekly-star / parent-report / season-recap (0017) surfaces; this ticket does not modify
  those generators, it only routes the coach to them.
- Editing or recomputing `teams.current_week` / `teams.season_weeks`. The card READS those
  columns; advancing the week stays wherever it lives today (e.g. the sessions flow).
- Any new analytics SDK or tracker. PostHog already exists; do not add new event types.

## Engineering notes

- `src/app/api/analytics/season-momentum/route.ts` (new) — `GET`. Auth via
  `createServerSupabase().auth.getUser()` → 401; then `createServiceSupabase()`. Read
  `teamId` from the query string (the handler reads `request.url`, so the vitest must invoke
  it with a real `Request` — LESSONS.md 2026-05-21 re: handler signatures; run `tsc --noEmit`
  after the route test). Resolve the caller's `coaches.org_id` and confirm the team belongs to
  that org before reading (mirror the org-scoping in `/api/ai/weekly-star` and
  `/api/capture/player-memory`); a non-owned team returns 404 and reads no observations. Read
  `teams.current_week` + `teams.season_weeks` for `weekPosition`/`weekTotal`. Derive
  `weeksActive` from the team's earliest `observations.created_at` to now. Compute `trend` as
  `{ positiveCount, totalCount }` over the team's recent `observations` (reuse the `since`/
  `gte('created_at', …)` pattern in `src/app/api/ai/weekly-star/route.ts`; recent window e.g.
  last 30 observations or last N weeks — the dev picks a deterministic, documented window).
  Gate with `canAccess(tier, 'feature_season_momentum')` → 403 for free.
- AI is OPTIONAL here and only for the one trend sentence. If used: add
  `PROMPT_REGISTRY.seasonMomentum(params)` in `src/lib/ai/prompts.ts` taking the numeric
  trend + week position and producing ONE short factual sentence; voice = clipboard, factual,
  not breathless — instruct positively ("write like a coach's clipboard, not a marketing
  landing page; keep it factual and plain") rather than enumerating banned words (LESSONS.md
  2026-05-23 re: a verbatim ban-list trips the banned-words contract test). Add a
  `seasonMomentumSchema` to `src/lib/ai/schemas.ts` and route the call through
  `callAIWithJSON()` with `orgId` and `interactionType: 'custom'` (no new `ai_interactions`
  enum value). PREFERRED default: derive the sentence deterministically from the counts with
  NO AI call (cheaper, always renders, no quota cost) — if the dev does this, document it in
  the Implementation log and satisfy the contract AC via the no-AI-call vitest branch.
- `src/lib/tier.ts` — add `'feature_season_momentum'` to the `features` array for `coach`,
  `pro_coach`, and `organization` (NOT `free`). Add a vitest asserting
  `canAccess('free', 'feature_season_momentum') === false` and
  `canAccess('coach', …) === true`.
- `src/components/ui/upgrade-gate.tsx` — register the `feature_season_momentum` feature key +
  benefit copy. NOTE (LESSONS.md 2026-05-23): the `<UpgradeGate feature="…">` prop is the
  tier-lookup KEY, not a free label — it must equal `feature_season_momentum` exactly or the
  gate silently never unlocks for entitled coaches.
- `src/app/(dashboard)/home/page.tsx` — render a new season-momentum card near the top of the
  home feed (the page already composes cards like the 0023 `WeeklyDigestSection`,
  `ContinueArcCard`, and `TodaySessionCard`, and already reads `current_week`/`season_weeks`).
  Prefer a presentational component `src/components/home/season-momentum-card.tsx` that
  fetches via a fire-and-forget TanStack `useQuery` to `/api/analytics/season-momentum` (the
  page already uses React Query; do NOT call Supabase from the client — AGENTS.md rule 3).
  Wrap the card body in `<UpgradeGate feature="feature_season_momentum" …>` for free coaches.
  The card renders `null` while loading, on failure, or when the team has no observations yet
  (best-effort, never blocks the home screen). Use a thin progress element (not a heavy
  chart); dark zinc-950 + #F97316 orange; 44px touch targets; no emoji-decorated headings; no
  banned words.
- `tests/analytics/season-momentum.test.ts` (new, `.test.ts` NOT `.spec.ts` — `vitest.config.ts`
  excludes the spec glob; LESSONS.md 2026-05-20). Mock `@/lib/supabase/server` (chainable
  in-memory, as in `tests/ai/weekly-star.test.ts` / `tests/capture/carryover.test.ts`) seeding
  `teams` + `observations`. Cover: 401 no-auth; tier gate (free → 403, coach → 200); set vs
  null `season_weeks`; cross-org `teamId` → 404 with no observations read; trend-count
  computation; (if no-AI) assert no `callAI*` invocation. Run under Node 20.19.0 by prepending
  the pinned bin to PATH (LESSONS.md 2026-05-21).
- `tests/components/season-momentum-card.test.tsx` (new, `.test.tsx`) — render the component
  directly (same approach as `tests/components/weekly-digest-card.test.tsx`): shows "Week N of
  M" when `weekTotal` set; falls back to weeks-active when `weekTotal` is null; renders nothing
  on fetch failure and contributes nothing that blocks the home screen; no banned words; 44px
  touch target on any action.
- If AI is used: an AI contract test under `tests/ai/` reusing the hoisted
  Anthropic/OpenAI/Gemini SDK mock strategy from `tests/ai/provider-failover.test.ts` so the
  `seasonMomentum` sentence is exercised through at least two providers and parsed against
  `seasonMomentumSchema`.
- `tests/e2e/` — a Playwright spec for the home season-momentum card against the 0006-seeded
  local Supabase (`.spec.ts`, the Playwright convention). Seed a team with a `season_weeks`
  value + a set of `observations` so the card resolves deterministically; assert the card
  renders "Week N of M" for the seeded coach and the `<UpgradeGate>` prompt renders for a
  free-tier path. The home page is a client surface but the endpoint is server-backed, so the
  data must come from the seed (LESSONS.md 2026-05-21). The seed/migration work is the dev's;
  this ticket only flags it. Skip when `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` are unset, per
  convention.
- New deps: no. Migration: no (reads existing `teams` + `observations`; no new artifact
  persisted). Env vars: no. AI prompt change: OPTIONAL — `seasonMomentum` in
  `src/lib/ai/prompts.ts` only if the dev generates the trend sentence via AI; default is a
  deterministic no-AI sentence. Tier feature key: YES — `feature_season_momentum` in
  `src/lib/tier.ts` (Coach+).

## Implementation log

(Appended by the implementation-dev agent during execution.)
