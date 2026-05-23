---
id: 0025
title: When the coach starts observing a player, remind them what that player was working on
status: proposed
priority: P2
area: capture
created: 2026-05-23
owner: product-groomer
---

## User story

As a volunteer coach who tapped into Maya's name to capture a note about her, I want to see
the one thing I last noted she was working on — "last time: hesitated on closeouts" — right
there as I start observing her, so that I coach the same kid toward the same thing across
weeks instead of treating every practice as the first time I've watched her.

## Why now (four lenses)

### Product Owner
We surface cross-session memory at the team and arc level — the Capture carryover strip
(0014) shows the last debrief's `next_practice_focus` for the whole team, and the arc
continuity line (0018/0020) shows where the team's multi-session arc stands. But the unit a
coach actually thinks in is the *player*: "what was Devon working on? what did I say about
Maya last week?" Today, the moment a coach focuses Capture on a specific player, the app
shows nothing about that player's own history — the per-player observation record we have
been accumulating for weeks is invisible at the exact moment it would change what the coach
says into the mic. The smallest meaningful unit of value is a quiet per-player memory line at
the point of capture: when the coach selects/focuses a player, read that player's most recent
prior `needs-work` (and a recent positive) observation and show it. No new AI call, no new
data — read the observations the coach already entered and surface the right one at the right
moment.

### Stakeholder
This is the hardest-to-copy expression of the structured-artifact moat, because it is built
entirely on *accumulated per-player history*. A forms app can show a coach a blank note field
for any player; what it cannot do is stand next to the coach and say "remember, last time you
noted Maya hesitates on closeouts" — that requires weeks of per-player structured
observations and the logic to surface the right one in context. It deepens the Practice Arc
memory moat from team-level continuity (0014/0018/0020) down to the player level, which is
both more specific and more defensible: per-player development memory is the thing that makes
SportsIQ feel like a coach who knows each kid, not a database of notes. It compounds the
existing capture surfaces rather than forking them — same surface, finer-grained memory.

### User (at 5:45pm on a Tuesday, 12 kids on a court)
The coach taps Maya's name to log something about her. Above the mic, one line appears:
"Last time — needs work: hesitated on closeouts (2 weeks ago)." It primes the coach to look
for exactly that, in real time, with cold hands and no scrolling. It's a fact, not a nag, and
it's dismissible. When the coach switches focus to a different player, the line updates to
that player's history; when a player has no prior observations, the line is simply absent and
Capture looks exactly as it does today. On a flaky gym wifi the read is best-effort: if it
can't load, the line doesn't render and the record button works unchanged. Nothing about
capturing ever waits on the memory read.

### Growth
This is a pure retention/moat deepener at the single most-used path in the product. A coach
who is reminded of each kid's thread every time they observe that kid is a coach whose notes
visibly build on each other — which is exactly the compounding value that makes a coach keep
using the app instead of reverting to a notebook. The "show me" moment is subtle but
powerful: a coach showing another coach "look, it remembers what every kid was working on" is
the demo that separates SportsIQ from every notes app the rival coach already abandoned.
There is no new viral artifact here; this is a deep retention/moat ticket and it earns its
P2 by deepening the named moat at the player grain without any new model spend.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `GET /api/capture/player-memory?playerId=<id>&teamId=<id>` returns `200 { lastNeedsWork, lastPositive, observedAt }` for an authenticated coach, where `lastNeedsWork` is the text of that player's most recent prior `observations` row with `sentiment='needs-work'` and `lastPositive` the most recent `sentiment='positive'` (either may be `null`); `observedAt` is the relevant observation's date (vitest: a player with a needs-work and a positive prior observation returns both).
- [ ] `GET /api/capture/player-memory` returns `200 { lastNeedsWork: null, lastPositive: null }` (not an error) when the player has no prior observations (vitest: a player with zero observations returns nulls and a 200).
- [ ] `GET /api/capture/player-memory` with no auth returns `401` and performs no DB read (vitest).
- [ ] `GET /api/capture/player-memory` is org-scoped: a `playerId`/`teamId` belonging to a team the caller's org does not own returns `200 { lastNeedsWork: null, lastPositive: null }` (or 403, matching the existing team-scoped routes) and never leaks another team's observations (vitest with a cross-org player; assert server-side).
- [ ] The memory read excludes the in-progress observation: it returns the most recent observation strictly PRIOR to the current capture (e.g. by `created_at` ordering, limit 1 per sentiment), so a note the coach is mid-recording does not show as its own "last time" (vitest asserts ordering/limit selects the prior row).
- [ ] Playwright/component: when the coach focuses a player who has a prior needs-work observation, a per-player memory line is visible near the record control containing that observation's text; switching focus to a different player updates the line to that player's history.
- [ ] Playwright/component: a player with no prior observations shows NO memory line, and the record button stays operable; when `GET /api/capture/player-memory` fails or times out, the line is absent and the record button stays enabled (best-effort — the memory read never gates capture, mirroring the 0014 carryover and 0008 usage-meter degrade-silently behavior).
- [ ] Privacy/COPPA: the line renders only observation text the coach already authored for a player on their own team; no new field is collected on `players` and the memory is never exposed on any public/no-auth surface (vitest asserts the route reads only existing `observations` and is not added to `publicPaths`).

## Out of scope

- Generating an AI summary of the player's history. This reads the stored `observations`
  text directly and shows it — it makes no `callAI()` call and adds no model spend.
- A full per-player history timeline or proficiency-trend view inside Capture. v1 is one
  prior needs-work line (plus optionally one recent positive); a history view is a separate
  ticket.
- Auto-tagging the new observation against the surfaced prior, or scoring follow-through.
  v1 is a passive memory line, not an analytics linkage.
- Pulling from anything other than the player's own `observations` rows (e.g. parent
  reports, debrief extracts, proficiency). One source — the raw observations — only.
- The team-level carryover strip (0014) or the arc continuity line (0018/0020). Those are
  team/arc scoped and stay as-is; this ADDS a per-player line and coexists with them.
- Editing, "marking resolved," or dismissing-with-persistence across sessions. v1 is
  read-only display with at most a session-scoped in-memory dismiss; no new schema, no new
  `localStorage` contract.
- Any new analytics SDK or tracker. PostHog already exists; do not add new event types.
- A new tier gate. Per-player memory reads the coach's own observations on a surface they
  already use; it adds no `feature_*` key and no `<UpgradeGate>` (mirrors the ungated
  carryover strip, ticket 0014).

## Engineering notes

- `src/app/api/capture/player-memory/route.ts` (new) — `GET`. Auth via
  `createServerSupabase().auth.getUser()` → 401; then `createServiceSupabase()`. Read
  `playerId` + `teamId` from the query string (the handler reads `request.url`, so the test
  must invoke it with a `Request` — LESSONS.md 2026-05-21 re: handler signatures). Resolve the
  caller's `coaches.org_id` and confirm the team belongs to that org before reading (mirror the
  org-scoping in `src/app/api/capture/carryover/route.ts` and `/api/ai/weekly-star`). Query
  `observations` for the player: most recent `sentiment='needs-work'` (`order('created_at',
  { ascending: false }).limit(1)`) and, separately, most recent `sentiment='positive'`. Return
  `{ lastNeedsWork, lastPositive, observedAt }` with nulls when absent; a non-owned player
  returns nulls (never the data). The `observations` table is already in the `/api/data`
  allow-list and read by `weekly-star`/`session-debrief` — reuse those column names
  (`player_id, team_id, category, sentiment, text, created_at`).
- The capture surface is `src/app/(dashboard)/capture/page.tsx` (`'use client'`). When the
  coach focuses/selects a player for capture, fetch the memory via a small TanStack `useQuery`
  keyed on the focused `playerId` (the page already uses React Query; do NOT call Supabase from
  the client — AGENTS.md rule 3). The query is fire-and-forget: the record control's `disabled`
  state must NOT depend on it.
- Prefer a presentational component `src/components/capture/player-memory-line.tsx` carrying a
  stable `data-testid` (e.g. `player-memory-line`) so its render states are unit-testable in
  isolation — mirror exactly how 0008 extracted `ai-usage-meter.tsx` and 0014 extracted
  `carryover-strip.tsx`. The component renders `null` when both fields are null, while loading,
  or on fetch failure (best-effort). Place it near the record control alongside the existing
  team carryover strip (0014) and arc continuity line (0020) — confirm the three coexist
  without displacing one another. Dark zinc/orange aesthetic; 44px touch target for any
  dismiss control; no banned words; no emoji-decorated headings.
- `tests/capture/player-memory.test.ts` (new, `.test.ts` NOT `.spec.ts` — `vitest.config.ts`
  excludes `**/*.spec.ts`; LESSONS.md). Mock `@/lib/supabase/server` with a chainable in-memory
  Supabase (same approach as `tests/capture/carryover.test.ts` / `tests/ai/weekly-star.test.ts`)
  seeding `observations` rows; assert: needs-work + positive selection; nulls when no
  observations; 401 no-auth; cross-org nulls; the prior-row ordering/limit excludes the
  in-progress note. Run route tests under `tsc --noEmit` after writing them (LESSONS.md
  2026-05-21) and under the pinned Node 20.19.0 via PATH (LESSONS.md 2026-05-21).
- `tests/components/player-memory-line.test.tsx` (new, `.test.tsx`) — render the component
  directly (same approach as `tests/components/carryover-strip.test.tsx`): shows the needs-work
  text when present; renders nothing when both fields null; fetch failure → renders nothing and
  contributes nothing that disables capture.
- `tests/e2e/` — extend the authenticated-capture e2e (the 0014 `capture-carryover` / 0008
  `capture-usage-meter` convention: `test.skip` when `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` are
  unset). Seed `observations` for a seeded player so the line resolves deterministically; the
  page is a client surface but the endpoint is server-backed, so the memory data must come from
  the seed.
- New deps: no. Migration: no (reads existing `observations`). Env vars: no. AI prompt change:
  no. Tier feature key: no.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0025-per-player-capture-memory` opened
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
