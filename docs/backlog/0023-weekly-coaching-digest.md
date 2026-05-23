---
id: 0023
title: Give the coach a Monday "your week in coaching" digest that pulls them back in
status: in-progress
priority: P1
area: analytics
created: 2026-05-23
owner: product-groomer
---

## User story

As a volunteer coach who ran two practices last week and hasn't opened the app since
Saturday, I want a short "your week in coaching" recap waiting for me when I open the
home screen — what I captured, who showed up in my notes, and the one thing worth doing
next — so that the app gives me a reason to come back on Monday instead of only when a
practice is about to start.

## Why now (four lenses)

### Product Owner
Every retention surface we ship today is anchored to a single moment in time: the
per-session debrief (`/api/ai/session-debrief`) fires once when a session ends, the
Capture carryover strip (ticket 0014) reads the last debrief, and the arc continuity line
(0018/0020) tracks where a multi-session arc stands. None of them answer the question that
decides whether a coach opens the app on a quiet Monday: "what happened across my whole
week, and what's worth my time next?" The smallest meaningful unit of value is a single
glanceable weekly card on the home screen that summarizes the last 7 days of captured
observations into three things — a one-line week summary, the players who showed up most in
the coach's notes, and one concrete next action with a one-tap path to do it (generate the
parent reports, run the weekly star, plan the next practice). It is one card, generated
from data we already collect, that turns "nothing happened this week" into "here's your
week — here's the one thing to do."

### Stakeholder
This widens the structured-artifact moat along a new axis: a *cross-session, week-scoped*
artifact that no per-session forms app produces, because it requires accumulated
observations across a week and the judgment to pick the single highest-value next action.
It compounds the surfaces we already built rather than forking them — the digest's "next
action" deep-links into the weekly-star, parent-report, and practice-plan artifacts that
already exist, so the digest becomes the hub that drives usage of everything downstream. It
routes through `callAIWithJSON()` exactly like every other artifact, inheriting
multi-provider routing, quota counting, and failover (0012) for free. And it earns its keep
on the retention metric that matters most for a volunteer coach: the off-day open.

### User (Monday morning, coffee, phone, between meetings)
The coach opens the home screen out of habit. At the top: "Last week — 2 practices, 23
notes. Maya, Devon, and Sam came up most. Next: send Maya's parents her report (it's been
3 weeks)." One glance tells them their week mattered and gives them one button. If they had
a quiet week with nothing captured, the card is simply absent — no empty-state nag, no
"you've been inactive" guilt-trip (banned tone). The read is best-effort: if it can't load
on a flaky connection, the home screen renders exactly as it does today and nothing waits
on it.

### Growth
This is the off-day retention lever the product is missing. A coach who is reminded, on a
day with no practice, that the app holds the story of their week is a coach who keeps the
app on their home screen instead of forgetting it between Tuesdays. The "show me" moment is
quieter than a viral card but real: a coach showing another coach "look, it tells me my
week and exactly what to do next" is the demo that separates a coaching companion from a
note-taking form. The digest also lifts every downstream artifact's usage by routing the
coach's one available minute toward the highest-value action — retention compounding into
artifact creation, which feeds the viral surfaces we already shipped.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `POST /api/ai/weekly-digest` with an authenticated coach and `{ teamId }` returns `200` with a structured digest (`week_summary` string, `top_players` array of `{ player_name, note }`, `next_action` `{ label, kind, rationale }` where `kind` is one of a fixed enum e.g. `parent_report | weekly_star | practice_plan | capture`) built from the last 7 days of that team's `observations`; the call goes through `callAIWithJSON()` with `orgId` so quota + provider routing apply (vitest asserts the route invokes `callAIWithJSON` with the resolved `orgId`).
- [ ] `POST /api/ai/weekly-digest` returns `200 { digest: null }` (not an error) when the team has fewer than a small threshold of observations in the last 7 days, and makes NO AI call in that case (vitest: a team with 0–2 weekly observations short-circuits before `callAIWithJSON` and returns a null digest).
- [ ] `POST /api/ai/weekly-digest` with no auth returns `401` and performs no DB read (vitest).
- [ ] `POST /api/ai/weekly-digest` is team-scoped: a `teamId` the caller's org does not own returns `403`/`404` (whichever the existing team-scoped routes use) and never reads that team's observations (vitest with a cross-org teamId; assert server-side).
- [ ] Tier enforcement is server-side: the route checks `canAccess(tier, 'feature_weekly_digest')` and returns `403` for a `free` coach, `200` for a `coach`/`pro_coach`/`organization` coach (vitest seeds an org tier and asserts the gate is enforced in the route, not only in the UI).
- [ ] Playwright: a `coach`-tier coach on `/home` whose active team has a week of seeded observations sees the digest card with the week summary text and a next-action button; a `free`-tier coach sees an `<UpgradeGate>` prompt for the digest, not the digest itself.
- [ ] Playwright/component: when `POST /api/ai/weekly-digest` fails or times out, the home screen renders normally and the digest card is absent (best-effort — the digest never blocks the home screen).
- [ ] AI contract test: the `weeklyDigest` prompt produces structurally-valid digest JSON (parses against the new `weeklyDigestSchema`) under at least Anthropic AND one fallback provider, mirroring the multi-provider mock strategy in `tests/ai/provider-failover.test.ts` — the digest must not be Anthropic-specific.
- [ ] COPPA/privacy: `top_players` carries first names already present in the coach's own observations and nothing new is collected on the `players` table; the prompt is fed only existing observation text + player names the coach already entered (vitest asserts the prompt block adds no new minor-scoped fields and the digest is never exposed on any public/no-auth surface).

## Out of scope

- Emailing or push-notifying the digest. v1 is an in-app card on the home screen the coach
  already opens; a delivered digest (email/push) is a separate ticket and would need an
  explicit channel-approval line per AGENTS.md (no new sender/tracker here).
- A public or parent-facing version of the digest. This is a coach-private retention
  surface only; it is never placed on `/share/[token]`, `/team-card`, or any no-auth route.
- Persisting a new `weekly_digest` artifact type to `plans`. v1 generates on demand for the
  home card; if persistence is wanted later (history, a shareable recap), that is a separate
  ticket — do NOT add a new `plans.type` value or touch `plans_type_check` for this.
- Building the downstream actions. The `next_action` deep-links into the EXISTING
  weekly-star / parent-report / plan / capture surfaces; this ticket does not modify those
  generators, it only routes the coach to them.
- A streak / gamification counter. The digest is a factual recap with one next action, not
  a points system; no "you're on a 4-week streak" mechanic in v1.
- Any new analytics SDK or tracker. PostHog already exists; do not add new event types.

## Engineering notes

- `src/lib/ai/prompts.ts` — add `PROMPT_REGISTRY.weeklyDigest(params)` taking the team
  context plus the week's observation summary (grouped by player, positive/needs-work
  counts — reuse the grouping helpers the `weekly-star` route already uses via
  `src/lib/player-spotlight-utils.ts`) and the candidate next actions. Output instruction
  must produce the `week_summary` / `top_players` / `next_action` JSON. Voice: clipboard,
  factual, encouraging-not-breathless; banned words apply ("journey", "amazing", etc.).
- `src/lib/ai/schemas.ts` — add `weeklyDigestSchema` (`week_summary: z.string()`,
  `top_players: z.array(z.object({ player_name: z.string(), note: z.string() }))`,
  `next_action: z.object({ label: z.string(), kind: z.enum([...]), rationale: z.string() })`).
  The `kind` enum is a closed set so the client can map it to a known route.
- `src/app/api/ai/weekly-digest/route.ts` (new) — `POST`. Auth via
  `createServerSupabase().auth.getUser()` → 401; then `createServiceSupabase()`. Resolve the
  caller's `coaches.org_id` and the org `tier`, and gate with
  `canAccess(tier, 'feature_weekly_digest')` → 403 for free (mirror how the gated AI routes
  resolve tier today). Verify the team belongs to the caller's org before reading (same
  ownership pattern as `/api/ai/weekly-star` + `/api/ai/practice-arc/active`). Fetch the last
  7 days of `observations` for the team (mirror the `since`/`gte('created_at', …)` query in
  `src/app/api/ai/weekly-star/route.ts`). Short-circuit to `{ digest: null }` below the
  observation threshold WITHOUT calling AI. Otherwise call `callAIWithJSON<WeeklyDigest>` with
  `interactionType: 'custom'`, `orgId`, and parse against `weeklyDigestSchema`. Do NOT bypass
  `callAIWithJSON` (AGENTS.md rule 4).
- `src/lib/tier.ts` — add `'feature_weekly_digest'` to the `features` array for `coach`,
  `pro_coach`, and `organization` (NOT `free`). Add a vitest asserting
  `canAccess('free', 'feature_weekly_digest') === false` and `canAccess('coach', …) === true`.
- `src/components/ui/upgrade-gate.tsx` — add the `feature_weekly_digest` feature key + benefit
  copy so the client gate surfaces the right prompt for a free coach.
- `src/app/(dashboard)/home/page.tsx` — render a new digest card near the top of the home
  feed (the page already composes cards like `ContinueArcCard` / `TodaySessionCard`). Prefer a
  presentational component `src/components/home/weekly-digest-card.tsx` that fetches via a
  fire-and-forget TanStack `useQuery` POST to `/api/ai/weekly-digest` (the page already uses
  React Query; do NOT call Supabase from the client — AGENTS.md rule 3). Wrap the card body in
  `<UpgradeGate feature="weekly_digest" …>` for free coaches. The card renders `null` while
  loading, on failure, or when `digest` is null (best-effort, never blocks the home screen).
  The next-action button maps `next_action.kind` to the existing route. Dark zinc/orange
  aesthetic; 44px touch targets; no emoji-decorated headings; no banned words.
- `tests/ai/weekly-digest.test.ts` (new, `.test.ts` NOT `.spec.ts` — `vitest.config.ts`
  excludes `**/*.spec.ts`; LESSONS.md 2026-05-20). Mock `@/lib/supabase/server` (chainable
  in-memory, as in `tests/ai/weekly-star.test.ts`) and `@/lib/ai/client`'s `callAIWithJSON`.
  Cover: 401 no-auth; tier gate (free → 403, coach → 200); below-threshold → `{ digest: null }`
  with no AI call; cross-org teamId → 403/404; happy-path digest shape. Run under Node 20.19.0
  by prepending the pinned bin to PATH (LESSONS.md 2026-05-21 — `nvm use` swallows output in
  the agent shell).
- AI contract test under `tests/ai/` — reuse the hoisted Anthropic/OpenAI/Gemini SDK mock
  strategy from `tests/ai/provider-failover.test.ts` so the `weeklyDigest` prompt is exercised
  through at least two providers and parsed against `weeklyDigestSchema`.
- `tests/e2e/` — a Playwright spec for the home digest card against the 0006-seeded local
  Supabase. Seed a week of `observations` for the seeded team so the digest resolves
  deterministically; assert the card renders for the seeded coach and the upgrade prompt
  renders for a free-tier path. Follow the authenticated-home e2e convention (skip when
  `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` are unset). The home page is a client surface but the
  endpoint is server-backed, so the digest data must come from the seed.
- New deps: no. Migration: no (reads existing `observations`; no new artifact persisted). Env
  vars: no. AI prompt change: YES — `weeklyDigest` in `src/lib/ai/prompts.ts`. Tier feature
  key: YES — `feature_weekly_digest` in `src/lib/tier.ts` (Coach+).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-23 — branch `feat/0023-weekly-coaching-digest` opened; ticket marked in-progress.
- 2026-05-23 — Interpretation notes: (a) "small threshold" for the null short-circuit
  is set to **3** observations in the last 7 days — a team with 0–2 weekly observations
  returns `{ digest: null }` with NO AI call (matches the AC wording "0–2 weekly
  observations short-circuits"). (b) The `next_action.kind` enum is the closed set
  `parent_report | weekly_star | practice_plan | capture`. (c) Cross-org team ownership
  returns **404** (the route reads the team's `org_id` and compares to the caller's
  `coaches.org_id`; an unowned team is treated as not-found so we never leak its
  existence), reading nothing from `observations` for that team. (d) `interactionType`
  is `'custom'` (no new `ai_interactions` enum value, no new `plans.type`).
- 2026-05-23 — Tests first (all failed for the right reason before implementation):
  `tests/ai/weekly-digest.test.ts` (route: 401, free→403, coach→200, cross-org→404 with
  no obs read, below-threshold→`{digest:null}` no-AI, happy-path shape, `callAIWithJSON`
  invoked with resolved `orgId`+`interactionType:'custom'`, COPPA prompt-content);
  `tests/ai/weekly-digest-contract.test.ts` (multi-provider: digest JSON parses against
  `weeklyDigestSchema` via mocked Anthropic primary AND OpenAI failover, mirrors
  `provider-failover.test.ts`); `tests/components/weekly-digest-card.test.tsx` (best-effort
  card: null/undefined→nothing, summary+next-action button, kind→route map, 44px touch,
  no banned words); `src/lib/tier.test.ts` (free→false, coach/pro/org→true);
  `tests/e2e/weekly-digest-flow.spec.ts` (home card for coach, UpgradeGate for free,
  absent on failure/quiet week — skips without E2E creds per convention).
- 2026-05-23 — Reconciliation (cf. LESSONS#0002): the ticket prose said
  `<UpgradeGate feature="weekly_digest" …>`, but `UpgradeGate` resolves entitlement via
  `useTier().canAccess(feature)` → `canAccess(tier, feature)`, so the `feature` prop MUST
  equal the tier key. Used `feature="feature_weekly_digest"` (the real key) so the gate
  actually functions; registered that key in `FEATURE_CONFIG`. The component split mirrors
  ArcContinuityLine (0020): a pure `WeeklyDigestCard` (testable) + a `WeeklyDigestSection`
  container that owns the `useQuery` POST and the `<UpgradeGate>` wrap.
- 2026-05-23 — Local gate: `npm run lint` 0 errors; `tsc --noEmit` 0 errors; full
  `vitest run` 4417 passed, 1 failed — the failure is the documented LESSONS#36 TZ artifact
  (`player-of-match-utils` `Apr 27`/`Apr 28`, unrelated to this change). Confirmed it passes
  47/47 under `TZ=UTC` (CI's TZ), so CI arbitrates green.
