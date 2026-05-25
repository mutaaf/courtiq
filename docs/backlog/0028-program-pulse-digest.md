---
id: 0028
title: Give the program director a weekly "program pulse" they actually read instead of a dashboard they don't
status: shipped
priority: P2
area: analytics
created: 2026-05-23
owner: product-groomer
---

## User story

As a program director who oversees a dozen volunteer coaches across the league, I want a
short weekly "program pulse" the moment I open the app — how many of my coaches were active
this week, which teams are humming, and which one or two need a nudge — so that I can run the
program in one glance instead of clicking through an analytics dashboard I never have time
to read.

## Why now (four lenses)

> Groom 2026-05-25: held at P2 (not bumped to P1). It is a genuine org-tier retention moat-
> deepener, but it reaches only the Organization-tier director — the smallest audience — so it
> is not the *next* lever for a product still growing its coach base. The game-recap card (0027,
> raised to P1) reaches every family of every coach who plays a game and is the higher-leverage
> next ship. Revisit this to P1 once org-tier acquisition is the active growth front.

### Product Owner
We already built the org-analytics *dashboard* (`/admin/org-analytics`, org-tier admins only)
— team stats, coach engagement, skill health. But it is exactly the surface a director won't
use: a dense, multi-section page they have to read. The retention lesson we already learned
for the individual coach is the weekly digest (0023): a single glanceable card with a summary
and ONE next action beats a dashboard every time. The director has no equivalent. The
smallest meaningful unit of value is a "program pulse" card at the top of the director's home/
admin surface: a one-line week summary across the program, the count of active vs quiet
coaches, the one or two teams worth attention, and ONE next action (e.g. "nudge {coach} — no
notes logged in 2 weeks") with a one-tap path (the existing staff-invite link from 0024, or a
deep-link into the org-analytics detail). It is generated from data the org already collects,
and it turns "I should check the dashboard sometime" into "here's my program, here's the one
thing to do."

### Stakeholder
This deepens the moat at its highest-value, stickiest edge: the program director on the
Organization tier ($49.99). Today the director's dependence on SportsIQ is a dashboard they
rarely open; this makes the product the weekly instrument through which they actually *run*
the program — the off-day pull (0023's lesson) applied to the org owner, who is the hardest
account to acquire and the most expensive to lose. It routes through `callAIWithJSON()` exactly
like every other artifact, inheriting multi-provider routing, quota counting, and failover
(0012) for free, and it compounds the org-tier surfaces already built (it deep-links into the
0024 staff-invite and the org-analytics detail rather than forking them). A director who runs
their league through the weekly pulse has switching costs no forms app can manufacture.

### User (the director, Monday morning, coffee, between two jobs)
The director opens the app out of habit. At the top: "Last week — 9 of 12 coaches logged
notes, 38 practices across the program. The U10s and U12s are humming. Coach Rivera hasn't
logged in 2 weeks — want to nudge them?" One glance, one button. If the program had a quiet
week with little activity, the card is simply absent — no empty-state nag, no "engagement is
down" guilt-trip (banned tone). The read is best-effort: if it can't load on a flaky
connection, the surface renders exactly as today and nothing waits on it.

### Growth
This is the org-tier retention lever the product is missing — and org accounts are the
revenue and the moat. A director reminded weekly that the app holds the state of their whole
program is a director who keeps paying for the Organization tier and keeps their coaches on
it. The "show me" moment is quieter but lands with the most valuable persona: a director
showing a league board or a fellow director "this is how I run the program now — it tells me
my week and who needs a nudge." It deepens the named moat (org roll-up + structured artifact)
at the account most expensive to win, and it pulls the highest-value user back on a day with
no games — the exact retention shape 0023 proved for individual coaches, now at the org grain.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `POST /api/ai/program-pulse` with an authenticated org admin and `{ orgId }` returns `200` with a structured pulse (`week_summary` string, `active_coaches` int, `total_coaches` int, `teams_to_watch` array of `{ team_name, note }`, `next_action` `{ label, kind, rationale }` where `kind` is a fixed enum e.g. `nudge_coach | invite_staff | view_analytics`) built from the org's last 7 days of activity (coaches' `observations`/`sessions`); the call goes through `callAIWithJSON()` with `orgId` so quota + provider routing apply (vitest asserts the route invokes `callAIWithJSON` with the resolved `orgId`).
- [ ] `POST /api/ai/program-pulse` returns `200 { pulse: null }` (not an error) and makes NO AI call when the org has activity below a small threshold in the last 7 days (vitest: a quiet org short-circuits before `callAIWithJSON`).
- [ ] `POST /api/ai/program-pulse` with no auth returns `401` and performs no DB read (vitest).
- [ ] Authorization is server-side and role+tier scoped: the route requires the caller to be an admin of the org (`coaches.role === 'admin'` for that `org_id`) AND the org tier to satisfy `canAccess(tier, 'feature_program_pulse')`; a non-admin coach of the org returns `403`, a coach of a different org returns `403`/`404`, and a free/coach/pro-tier org returns `403` (vitest asserts BOTH the role check and the tier check happen in the route, not only in the UI).
- [ ] The pulse never exposes per-minor data: `teams_to_watch` and the summary reference team-level and coach-level aggregates only — no player names, jerseys, or observation text — and nothing new is collected on `players` (vitest asserts the prompt block is fed only aggregate counts + team/coach names, and the response carries no player-scoped fields).
- [ ] Playwright: an org-admin on an Organization-tier org sees the program-pulse card with the week summary and a next-action button on their home/admin surface; a non-admin org coach and a non-org coach do NOT see the card (and any direct fetch is rejected server-side per the auth criteria).
- [ ] Playwright/component: when `POST /api/ai/program-pulse` fails or times out, the surface renders normally and the pulse card is absent (best-effort — the pulse never blocks the page, mirroring the 0023 digest degrade-silently behavior).
- [ ] AI contract test: the `programPulse` prompt produces structurally-valid pulse JSON (parses against the new `programPulseSchema`) under at least Anthropic AND one fallback provider, mirroring `tests/ai/provider-failover.test.ts` — the pulse must not be Anthropic-specific.

## Out of scope

- Emailing or push-notifying the pulse. v1 is an in-app card on a surface the director already
  opens; a delivered digest (email/push) is a separate ticket needing an explicit channel-
  approval line per AGENTS.md (no new sender/tracker here).
- A public or coach-facing version of the pulse. This is a director-private org surface only;
  it is never placed on `/share/[token]`, `/org/[slug]`, or any no-auth route.
- Per-coach drill-down screens or new charts. v1 is one glanceable card with one next action;
  the existing `/admin/org-analytics` dashboard remains the detail view the pulse deep-links
  into. Do NOT rebuild the dashboard here.
- Surfacing or scoring individual players across the program. The pulse is coach/team
  aggregate only — no per-minor roll-up (COPPA / data-minimization).
- Persisting a new `program_pulse` artifact type to `plans`. v1 generates on demand for the
  card; do NOT add a new `plans.type` value or touch `plans_type_check`.
- Auto-nudging or messaging coaches. The `next_action` deep-links the director to the EXISTING
  staff-invite (0024) or the org-analytics detail; it does not send a coach a message (that
  would need a new sender + approval line).
- A streak / gamification mechanic for the org. The pulse is a factual weekly recap with one
  next action, not a points system.
- A new analytics SDK or tracker. PostHog already exists; do not add new event types.

## Engineering notes

- `src/lib/ai/prompts.ts` — add `PROMPT_REGISTRY.programPulse(params)` taking org-level
  aggregates (active/total coach counts, per-team activity summaries with positive/needs-work
  counts, the quiet-team/quiet-coach candidates) and the candidate next actions. Output
  instruction produces `week_summary` / `active_coaches` / `total_coaches` / `teams_to_watch` /
  `next_action`. Voice: clipboard, factual, encouraging-not-breathless — instruct the model
  POSITIVELY ("write like a program director's clipboard, not a marketing landing page; avoid
  breathless hype words"); do NOT enumerate the banned tokens verbatim in the prompt string, or
  a banned-words contract test will catch its own list (LESSONS.md 2026-05-23).
- `src/lib/ai/schemas.ts` — add `programPulseSchema` (`week_summary: z.string()`,
  `active_coaches: z.number().int()`, `total_coaches: z.number().int()`,
  `teams_to_watch: z.array(z.object({ team_name: z.string(), note: z.string() }))`,
  `next_action: z.object({ label: z.string(), kind: z.enum([...]), rationale: z.string() })`).
  The `kind` enum is a closed set so the client maps it to a known route.
- `src/app/api/ai/program-pulse/route.ts` (new) — `POST`. Auth via
  `createServerSupabase().auth.getUser()` → 401; then `createServiceSupabase()`. Resolve the
  caller's `coaches.org_id` + `role` + the org `tier`. Enforce BOTH: `role === 'admin'` for the
  requested `orgId` (mirror the `isAdminUser` gate the `/admin/org-analytics` surface and its
  API already use) → 403 for non-admin; AND `canAccess(tier, 'feature_program_pulse')` → 403
  for non-org tiers. A different-org `orgId` → 403/404 (whichever the existing org-scoped routes
  use). Aggregate the org's last 7 days from `coaches`/`sessions`/`observations` — reuse the
  aggregation the org-analytics endpoint already does (look at `/api/org/org-analytics` and the
  `/admin/org-analytics` page's stat shape) rather than re-deriving. Short-circuit to
  `{ pulse: null }` below the activity threshold WITHOUT calling AI. Otherwise call
  `callAIWithJSON<ProgramPulse>` with `interactionType: 'custom'`, `orgId`, parsed against
  `programPulseSchema`. Do NOT bypass `callAIWithJSON` (AGENTS.md rule 4).
- `src/lib/tier.ts` — add `'feature_program_pulse'` to the `features` array for `organization`
  ONLY (NOT free/coach/pro_coach — this is an org-roll-up surface for the org tier). Add a
  vitest asserting `canAccess('organization', 'feature_program_pulse') === true` and
  `canAccess('pro_coach', …) === false`.
- `src/components/ui/upgrade-gate.tsx` — register the `feature_program_pulse` feature key +
  benefit copy. Per LESSONS.md 2026-05-23 (#0023): the `<UpgradeGate feature=…>` prop MUST be
  the exact tier key string (`feature_program_pulse`), because `UpgradeGate` resolves via
  `canAccess(tier, feature)` — it is the lookup key, not a free label.
- Director surface — render a `ProgramPulseCard` near the top of the director's home/admin
  surface (the org-admin sees `/admin` and `/admin/org-analytics`; place the card on the admin
  landing or home). Prefer a presentational `src/components/admin/program-pulse-card.tsx` plus a
  container that owns a fire-and-forget TanStack `useQuery` POST to `/api/ai/program-pulse` and
  the `<UpgradeGate feature="feature_program_pulse" …>` wrap (the split mirrors the 0023
  `WeeklyDigestCard` + section container). Do NOT call Supabase from the client (AGENTS.md rule
  3). The card renders `null` while loading, on failure, or when `pulse` is null (best-effort).
  The next-action button maps `next_action.kind` to the existing route (the 0024 staff-invite
  link or the org-analytics detail). Dark zinc/orange aesthetic; 44px touch targets; no
  emoji-decorated headings; no banned words.
- `tests/ai/program-pulse.test.ts` (new, `.test.ts` NOT `.spec.ts`; LESSONS.md 2026-05-20).
  Mock `@/lib/supabase/server` (chainable in-memory, as in `tests/ai/weekly-digest.test.ts`)
  and `@/lib/ai/client`'s `callAIWithJSON`. Cover: 401 no-auth; admin+org → 200; non-admin org
  coach → 403; non-org tier → 403; cross-org orgId → 403/404; below-threshold → `{ pulse: null }`
  with no AI call; happy-path shape; `callAIWithJSON` invoked with resolved `orgId` +
  `interactionType:'custom'`; no player-scoped fields in the prompt block or response. Run under
  Node 20.19.0 via PATH (LESSONS.md 2026-05-21).
- AI contract test under `tests/ai/` — reuse the hoisted Anthropic/OpenAI/Gemini SDK mock
  strategy from `tests/ai/provider-failover.test.ts` so the `programPulse` prompt is exercised
  through at least two providers and parsed against `programPulseSchema`. Include a banned-words
  scan of `${system}\n${user}` — and ensure the prompt instruction is phrased positively so it
  doesn't fail on its own forbidden list (LESSONS.md 2026-05-23).
- `tests/e2e/program-pulse-flow.spec.ts` (new Playwright spec) against the 0006-seeded local
  Supabase. Seed an Organization-tier org with an admin coach + several coaches + a week of
  `observations`/`sessions` so the pulse resolves deterministically (the endpoint is server-
  backed, so data must come from the seed — LESSONS.md 2026-05-21). Assert the admin sees the
  pulse card and a non-admin/non-org path does not. Skip when `E2E_TEST_EMAIL`/
  `E2E_TEST_PASSWORD` are unset, per convention.
- New deps: no. Migration: no (reads existing `coaches`/`sessions`/`observations`; no new
  artifact persisted). Env vars: no. AI prompt change: YES — `programPulse` in
  `src/lib/ai/prompts.ts`. Tier feature key: YES — `feature_program_pulse` in `src/lib/tier.ts`
  (Organization only).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-25 — branch `feat/0028-program-pulse-digest` opened; status → in-progress.
- 2026-05-25 — Reconciliation (per LESSONS 2026-05-20 #0002 — assert the REAL schema):
  the ticket says "reuse the org-analytics aggregation", but the existing
  `/api/admin/org-analytics` route selects `observations.created_by` /
  `observations.skill` and `sessions.created_by`, which DO NOT exist — the real
  columns are `observations.coach_id` / `observations.skill_id` / `observations.category`
  and `sessions.coach_id` (`supabase/migrations/001_schema.sql`). Program-pulse
  aggregates by the REAL `coach_id` column (active = a coach with ≥1 obs or session
  in the last 7 days). The org-analytics aggregation SHAPE (per-team / per-coach
  counts in the last N days) is reused; the wrong column names are not.
- 2026-05-25 — `<UpgradeGate feature="feature_program_pulse">` uses the exact tier
  key (LESSONS 2026-05-23 #0023); the key is registered in `TIER_LIMITS.organization`
  ONLY and in `FEATURE_CONFIG` for the benefit copy.
- 2026-05-25 — failing tests added: `tests/ai/program-pulse.test.ts` (route),
  `tests/ai/program-pulse-contract.test.ts` (provider-agnostic JSON),
  `src/lib/tier.test.ts` (tier key), `tests/components/program-pulse-card.test.tsx`
  (best-effort card states), `tests/e2e/program-pulse-flow.spec.ts` (authed, skips
  without E2E creds; seed adds an Organization-tier org + admin + coaches + a week
  of activity).
- 2026-05-25 — local gate green under Node 20.19.0: lint 0 errors, `tsc --noEmit`
  0 errors, vitest 4502/4503 (the lone fail is the documented TZ artifact in
  `player-of-match-utils.test.ts`, passes under `TZ=UTC` as CI runs — LESSONS
  2026-05-20).
- 2026-05-25 — PR #287 opened with auto-merge (squash) armed. First CI run: lint +
  unit-tests green; e2e-tests RED at the `Seed test data` step (psql exit 3,
  `coaches_id_fkey` — the two added program coaches lacked `auth.users` rows).
  Fixed by seeding their `auth.users` rows (new LESSONS entry 2026-05-25 [ship/0028]).
- 2026-05-25 — second CI run all green (lint, unit-tests, e2e-tests 3m36s); PR #287
  auto-merged to main. Status flipped to `shipped` (file + README index) on
  `chore/0028-mark-shipped` per LESSONS 2026-05-22 [ship/0020].
