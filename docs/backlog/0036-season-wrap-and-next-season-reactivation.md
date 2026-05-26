---
id: 0036
title: Catch the coach at the season's end with a wrap-up and a one-tap way to start next season
status: shipped
priority: P1
area: onboarding
created: 2026-05-25
owner: product-groomer
---

## User story

As a volunteer coach whose 10-week season just ended, I want the app to recognize the season
is over, hand me a short wrap-up I'm proud of, and give me one tap to roll my team into the
next season — keeping the players who are coming back — so that I don't quietly stop opening
the app for three months and never come back when the next season starts.

## Why now (four lenses)

### Product Owner
Every retention surface we ship assumes a season *in progress*: the weekly digest (0023/cron)
needs a week with activity, the season-momentum card (0032) reads `teams.current_week` against
`teams.season_weeks` while the season is live, Capture carryover (0014) needs a last practice.
The moment `current_week` reaches `season_weeks` — the season is done — every one of those
surfaces goes quiet at exactly the moment the coach is most likely to churn for good. We have
end-of-season *artifacts* (season letter, awards, summary, public recap card 0017) but no
surface that (a) detects the season has ended and (b) gives the coach a single next step that
keeps them in the product into the next season. The smallest meaningful unit of value is one
home-screen card that appears only when the active team's season is complete: a short
"that's a wrap" line drawn from data we already have (weeks coached, practices, players
observed, the season's top growth story), and one button — "Start next season with this team"
— that creates the next season carrying the returning roster forward. One card, one tap, at
the one moment that decides whether the coach is a one-season user or a multi-season user.

### Stakeholder
Multi-season retention is the difference between a seasonal toy and a habit, and it is the
single biggest churn cliff a volunteer coach hits. This card converts the end of a season
from a silent exit into a continuation — and the "start next season" path deepens the
Practice-Arc / cross-season-memory moat we already built (0034's `prior_player_id` self-FK is
the exact mechanism the rollover writes, so next season's parent reports inherit the returning
player's growth story for free). No forms app re-engages a coach across the off-season because
no forms app holds the structured season arc to wrap up or the cross-season pointer to carry
forward. It reuses the existing season fields (`teams.season` / `season_weeks` / `current_week`),
the existing pure season-summary helpers, and — for the optional off-season nudge — the
existing Resend + cron + opt-out/dedup infrastructure (`src/lib/email.ts`, `CRON_SECRET`,
`coaches.preferences`), so it adds re-activation without adding a new sender or tracker.

### User (a quiet Sunday in the off-season, phone, on the couch)
The last practice is logged; the season hit its final week. The coach opens the app and sees:
"Spring season — done. 10 weeks, 18 practices, 12 players, biggest jump: Devon's defense."
Below it, one button: "Start next season — keep your 12 players." One tap, name the new season,
and the roster is already there, the returning players linked to who they were. No re-adding 12
kids by hand with cold fingers in a parking lot before the first new practice. If they're not
ready, the card just sits there; no guilt copy, no "you've been inactive" nag (banned tone).

### Growth
This is the retention lever with the longest half-life in the product: a coach who starts a
second season is dramatically more likely to upgrade, refer, and generate the viral artifacts
than a coach who finished one and left. The "show me" moment is the wrap-up line itself —
"10 weeks, 18 practices, Devon's defense was the biggest jump" — which is exactly the kind of
specific, earned summary a coach screenshots and sends to the program director or a parent
("here's how our season went"), and the same season-summary substance can flow into the public
recap card (0017) the coach already shares. Re-activation here feeds every loop we've already
shipped: a returning coach is a coach who keeps sending portal reports and recap cards.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A pure helper decides "season complete" from team fields alone: given a team with
  `season_weeks` set and `current_week >= season_weeks`, it returns `complete`; with no
  `season_weeks` (open-ended team) or `current_week < season_weeks` it returns `in_progress`;
  with zero practices logged it returns `not_started` (vitest on the pure helper across these
  cases — no DB, no AI).
- [ ] A "season wrap" card renders on `/home` ONLY when the active team's season is complete,
  showing factual totals (weeks coached, practice count, players observed) and a single growth
  highlight, all derived from already-collected `sessions` + `observations` — and is ABSENT for
  an in-progress or not-started season (Playwright/component: complete season → card shown with
  totals; in-progress season → card absent; the home screen renders normally either way).
- [ ] "Start next season with this team" creates the next season for the team via the existing
  authed `mutate()` helper: it advances the season label / resets `current_week`, and carries
  the returning roster forward — re-creating active players on the new season and setting each
  new player's `prior_player_id` to the corresponding finished-season player (vitest on the
  rollover server route: the new season's players exist, `current_week` reset, and each carried
  player's `prior_player_id` points at its prior row; inactive players are not carried).
- [ ] The rollover is team-scoped and ownership-checked server-side: a coach attempting to roll
  over a team their org does not own gets `403`/`404` and writes nothing (vitest with a cross-org
  teamId; assert no rows created for the foreign team).
- [ ] The rollover writes NO new field to `players` beyond the already-shipped `prior_player_id`
  pointer (0034); it carries forward only name/jersey/position the coach already entered and
  copies nothing about the minor that wasn't already there (vitest asserts the inserted player
  rows contain only existing columns and `prior_player_id`; no new minor-scoped data).
- [x] ~~If the optional off-season re-activation email is included…~~ DEFERRED (see
  Implementation log 2026-05-25): the email is the ticket's explicitly-optional add-on; this PR
  ships the card + rollover slice and drops this box.
- [x] AI is OPTIONAL for the growth-highlight sentence — PURE-HELPER PATH CHOSEN (the ticket's
  default): the highlight is computed deterministically from observation counts by
  `buildSeasonWrap()` in `src/lib/season-wrap-utils.ts`. No AI is used, so no `callAIWithJSON`
  call and no multi-provider contract test — a free coach's quota is never spent on a passive
  card. The unit tests assert the pure-helper path.
- [ ] COPPA/privacy: the season-wrap card and the rollover are coach-private and never placed on
  any public/no-auth surface (`/share/[token]`, share-card, OG routes untouched); totals use only
  the coach's own data (vitest/Playwright assert no public exposure).

## Out of scope

- A separate `seasons` table or any schema redesign of how a season is modeled. v1 uses the
  EXISTING `teams.season` / `teams.season_weeks` / `teams.current_week` fields and the existing
  `prior_player_id` self-FK; introducing a first-class seasons entity is a much larger separate
  ticket, not this one.
- Bulk multi-team rollover or an org-wide "roll the whole program into next season" action. v1
  is one team, the active team, one tap. Org-level rollover is a separate ticket.
- Re-deriving or regenerating the end-of-season letter / awards / public recap (0017 / season-letter
  / season-awards already exist). The wrap card may LINK to those, but it does not reimplement them.
- A new viral artifact. The wrap card is a coach-private retention surface; if its substance
  should become a shareable card, that reuses the EXISTING public-recap path (0017), not a new one.
- A new email sender, SDK, or tracker. If the off-season nudge ships, it uses the EXISTING Resend
  + Vercel cron + `coaches.preferences` dedup/opt-out path only — no new channel approval beyond
  what 0023's weekly-digest cron already established.
- Auto-advancing `current_week` (how a season progresses week to week is existing behavior owned
  elsewhere). This ticket only READS completion and, on the explicit button, RESETS for the next
  season.

## Engineering notes

- `src/lib/` — add `src/lib/season-wrap-utils.ts`: pure `getSeasonPhase(team)` →
  `not_started | in_progress | complete` from `season_weeks` + `current_week` + practice count,
  and `buildSeasonWrap(sessions, observations, players)` → factual totals + one growth highlight
  (mirror the pure-helper style of `src/lib/season-momentum-utils.ts` (0032) and
  `src/lib/season-summary-utils.ts`). This is the unit-testable core.
- `src/components/home/season-wrap-card.tsx` (new) — presentational card; renders `null` unless
  `getSeasonPhase === 'complete'`. Fetches via a fire-and-forget TanStack `useQuery` (the home
  page already composes ~25 such cards — see `src/app/(dashboard)/home/page.tsx` imports). Dark
  zinc/orange, 44px targets, no emoji headings, no banned words. The "Start next season" button
  POSTs to the rollover route. Best-effort: never blocks the home screen.
- `src/app/(dashboard)/home/page.tsx` — register `SeasonWrapCard` near the top of the feed,
  alongside `SeasonMomentumSection` / `WeeklyDigestSection`.
- `src/app/api/season/rollover/route.ts` (new) — `POST { teamId, newSeasonLabel }`. Auth via
  `createServerSupabase().auth.getUser()` → 401; then `createServiceSupabase()`. Verify the team
  belongs to the caller's `coaches.org_id` (mirror the ownership check in
  `/api/ai/weekly-star` / `/api/ai/practice-arc/active`) → 404 for a foreign team. Update the
  team's `season` label and reset `current_week`; for each ACTIVE player, insert a new player row
  for the new season with the same name/jersey/position and `prior_player_id` set to the source
  row (the 0034 mechanism). Service-role only; never a direct client Supabase write.
- `src/lib/api.ts` — the client "Start next season" action uses `mutate()` (AGENTS.md rule 3),
  not a direct Supabase client.
- `src/types/database.ts` — no new column needed (`prior_player_id` already exists from 0034).
- OPTIONAL email: `src/app/api/cron/season-reactivation/route.ts` (new) + a
  `seasonReactivationEmail` builder in `src/lib/email/templates.ts`, sent via `src/lib/email.ts`
  (Resend), gated by `CRON_SECRET`, deduped + opt-out via `coaches.preferences` (mirror
  `src/app/api/cron/weekly-digest/route.ts`). If deferred, omit this file set and ship the card.
- AI prompt (only if the growth highlight is AI-generated): add `seasonWrapHighlight` to
  `src/lib/ai/prompts.ts` + a schema in `src/lib/ai/schemas.ts`, called via `callAIWithJSON()`
  with `interactionType: 'custom'` (no new `ai_interactions` enum value, no new `plans.type`).
  DEFAULT to the pure-helper highlight to avoid spending a free coach's AI quota on a passive card.
- `tests/` — `tests/lib/season-wrap-utils.test.ts` (phase + wrap builder),
  `tests/api/season-rollover.test.ts` (rollover: roster carried, `prior_player_id` set,
  `current_week` reset, cross-org → 404, no new minor field). If the email ships,
  `tests/cron/season-reactivation.test.ts` (due/skip/dedup/opt-out). `.test.ts` NOT `.spec.ts`
  (LESSONS#38). If AI is used, an `tests/ai/season-wrap-contract.test.ts` multi-provider test.
  Run under Node 20.19.0 (LESSONS#0010).
- `tests/e2e/` — Playwright: a coach whose seeded team has a complete season (seed `season_weeks`
  and `current_week` so `current_week >= season_weeks`) sees the wrap card and the "Start next
  season" button; an in-progress team does not. Against the 0006-seeded Supabase; skip without
  E2E creds. Note: seed `current_week`/`season_weeks` directly (raw SQL, no JSON quoting needed
  for integer columns — cf. LESSONS#0031 which only applies to jsonb).
- New deps: no. Migration: no. Env vars: no new ones (reuses `CRON_SECRET`, `RESEND_API_KEY`,
  `NEXT_PUBLIC_APP_URL` if the email ships). AI prompt change: optional (`seasonWrapHighlight`).
  Tier feature key: no — the wrap card is available to every coach (a free coach should be
  re-activated too; the rollover writes no AI). If the AI highlight path is chosen, the free
  quota already governs it through `callAI`.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-25 — branch `feat/0036-season-wrap-rollover` opened; frontmatter → in-progress.
- 2026-05-25 — SCOPE DECISION: deferring the OPTIONAL off-season re-activation email
  (the ticket's AC box "If the optional off-season re-activation email is included…").
  Shipping the smaller, safer slice the ticket explicitly sanctions: the season-wrap
  card + the one-tap rollover route, with the pure-helper (no-AI) growth highlight so a
  free coach's quota is never spent on a passive card. That drops the email AC box and
  the AI-contract AC box (we take the pure-helper path the ticket defaults to). No sibling
  ticket spawned — the email is a clearly-optional add-on the ticket already frames as
  deferrable, not a separate unit of value left undone; a future /ideate pass can pick it
  up if re-engagement metrics warrant it.
- 2026-05-25 — failing tests added: `tests/lib/season-wrap-utils.test.ts` (phase + wrap
  builder), `tests/api/season-rollover.test.ts` (rollover: roster carried, prior_player_id
  set, current_week reset, cross-org → 404, no new minor field),
  `tests/components/season-wrap-card.test.tsx` (card render states), and
  `tests/e2e/season-wrap-flow.spec.ts` (seeded complete-season card).
- 2026-05-25 — PR #303 opened; lint + unit-tests + e2e-tests all green (e2e 3m51s); auto-merged
  to main. Shipped-flip (frontmatter + README index) landed via `chore/0036-mark-shipped`.
