---
id: 0014
title: Show last practice's focus areas at the top of Capture so the coach picks up where they left off
status: in-progress
priority: P1
area: capture
created: 2026-05-21
owner: product-groomer
---

## User story

As a volunteer coach who ran a practice last Tuesday and is back on the court this
Tuesday, I want to see the two or three things I said I'd watch for last time the
moment I open Capture, so that I actually coach toward them today instead of starting
from a blank page and forgetting what we were working on.

## Why now (four lenses)

### Product Owner
The session-debrief artifact already produces a `next_practice_focus` list and stores
it on the session as `coach_debrief_extracts` (`src/app/api/ai/session-debrief/route.ts`,
the `sessions.coach_debrief_extracts` jsonb column). That intelligence is generated,
paid for in an AI call, and then shown exactly once — on the debrief screen right after
the session ends, when the coach is packing up cones and not reading it. By the next
practice it's invisible. The smallest meaningful unit of value is to surface that
existing list back at the coach at the one moment it's actionable: when they open
Capture for the next session. No new AI call, no new data, no new model spend — read the
most recent prior session's stored `next_practice_focus` and render it as a quiet
"Last time you wanted to watch:" strip above the record control. This *removes* the
blank-page problem; it doesn't add a feature the coach has to learn.

### Stakeholder
This deepens the Practice Arc memory moat by making cross-session memory *legible at the
point of action*. Today the memory exists in the data and inside the debrief prompt's
trend logic, but the coach never feels it — the app silently knows the arc and the user
doesn't. A competitor's "forms app" has no memory to surface; a carryover strip is a
visible, every-practice proof that SportsIQ remembers your team across sessions. It's the
cheapest possible way to make the Practice Arc moat tangible to the user, because it
reuses an artifact we already generate and store. No new backend, no schema change, no
new tier gate.

### User (at 5:45pm on a Tuesday, 12 kids on a court)
The coach taps into Capture between setting up drills. Before they record anything,
there's a short line at the top: "Last time you wanted to watch: closeouts, weak-hand
finishing." One glance, no taps, no modal. It primes what they say into the mic for the
next 45 minutes. If there's no prior session, or the prior session had no debrief, the
strip simply isn't there — Capture looks exactly as it does today. On a flaky gym wifi
the strip is best-effort: if the read fails or times out, it's absent and the record
button is fully operable. The carryover never blocks capture.

### Growth
This is a retention lever, not a viral one, and it's a strong one: it gives the coach a
concrete reason to open the app at the *start* of the next practice rather than only
after. A coach who opens Capture and sees the app remembered their plan feels like the
tool is on their side — that's the feeling that survives a busy week and brings them back
next Tuesday. It also lifts debrief usage in a virtuous loop: the carryover only appears
if you generated last session's debrief, so a coach who sees the value of the carryover
has a reason to debrief every session. Retention compounding on an artifact we already
ship, with zero new surface to build.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `GET /api/capture/carryover?teamId=<id>` returns `200 { focus: string[], sessionDate, sessionType }` for an authenticated coach, where `focus` is the `next_practice_focus[].focus` strings (max 3) from the most recent prior `sessions` row for that team whose `coach_debrief_extracts` is non-null and `date` is on or before today (vitest: seeded team with two debriefed sessions returns the focus list from the more recent one).
- [ ] `GET /api/capture/carryover` returns `200 { focus: [] }` (empty, not an error) when the team has no sessions, or no session with a non-null `coach_debrief_extracts` (vitest: seeded team with sessions but no debrief returns an empty focus list and a 200).
- [ ] `GET /api/capture/carryover` with no auth returns `401` and performs no DB read of another coach's sessions (vitest).
- [ ] `GET /api/capture/carryover` only returns sessions for a team the caller's org owns — a `teamId` belonging to another org returns `200 { focus: [] }` and never leaks that team's debrief (vitest: cross-org teamId yields an empty result, asserted server-side, not via UI).
- [ ] The carryover read is scoped to at most 3 focus strings even if the stored `next_practice_focus` has more (vitest asserts the slice).
- [ ] Playwright: a coach on `/capture` whose active team has a recent debrief sees a strip containing at least one of the stored focus phrases above/adjacent to the record control (assert by visible text matching a seeded focus phrase).
- [ ] Playwright: a coach on `/capture` whose active team has no prior debrief sees NO carryover strip (the element with the carryover test id is absent) and the record button is operable.
- [ ] Playwright/unit: when `GET /api/capture/carryover` fails or times out, the carryover strip is absent and the record button stays enabled (the strip degrades silently; it never gates capture).

## Out of scope

- Generating a fresh AI summary for the strip. This ticket reads the already-stored
  `next_practice_focus` from the last debrief; it makes no `callAI()` call.
- Editing, dismissing, or "marking done" the carryover items. v1 is read-only display.
- Pulling carryover from anything other than `coach_debrief_extracts.next_practice_focus`
  (e.g. raw observations, proficiency trends). One source, the stored debrief, only.
- Surfacing the full debrief on Capture. Only the focus phrases (max 3), not highlights,
  tone, or coaching tips.
- Any new analytics event or tracker. PostHog already exists via `src/lib/analytics.ts`;
  do not add new event types here.
- Widening what's collected on players or sessions. This reads an existing jsonb column.

## Engineering notes

- `src/app/api/capture/carryover/route.ts` (new) — `GET` handler. Auth via
  `createServerSupabase().auth.getUser()` → 401 if absent. Then `createServiceSupabase()`.
  Read `teamId` from the query string; resolve the caller's `coaches.org_id` and confirm
  the team belongs to that org before reading (mirror the org-scoping the other team-scoped
  routes use) — a non-owned team returns `{ focus: [] }`, never the data. Query
  `sessions` for the team where `coach_debrief_extracts` is not null and `date <= today`,
  `order('date', { ascending: false }).limit(1)`, and map `coach_debrief_extracts.next_practice_focus`
  to `focus.map(f => f.focus).slice(0, 3)`. The `next_practice_focus` shape is the
  `SessionDebriefResult` interface already exported from `src/app/api/ai/session-debrief/route.ts`.
- The capture surface is `src/app/(dashboard)/capture/page.tsx` (a `'use client'` page).
  Fetch the strip with a small TanStack `useQuery` (already imported there, same pattern
  as the 0008 usage meter) hitting `/api/capture/carryover?teamId=<activeTeamId>` from
  `useActiveTeam()`. Render a compact strip near the `RecordingButton` carrying a stable
  `data-testid` (e.g. `capture-carryover`). It renders nothing while loading, on fetch
  failure, or when `focus` is empty (best-effort, never blocks capture). Reuse zinc/orange
  styling; this is not a nag, it's a quiet label. Do NOT call Supabase directly from the
  client (AGENTS.md rule 3) — the strip data comes from the route.
- Consider extracting the strip into a small presentational component
  `src/components/capture/carryover-strip.tsx` (mirrors how 0008 extracted
  `ai-usage-meter.tsx`) so its render states are unit-testable in isolation.
- `tests/capture/carryover.test.ts` (new, `.test.ts` NOT `.spec.ts` —
  `vitest.config.ts` excludes `**/*.spec.ts`; LESSONS.md 2026-05-20). Mock
  `@/lib/supabase/server` with a chainable in-memory Supabase (same approach as
  `tests/ai/weekly-star.test.ts`) seeding `sessions` rows with `coach_debrief_extracts`
  and an org tier; assert the most-recent-debriefed selection, the empty-200 case, the
  401, the cross-org empty result, and the 3-item slice. Run route tests under
  `tsc --noEmit` after writing them — a no-body GET that reads `request.url` takes a
  `Request` param; assert the real handler signature (LESSONS.md 2026-05-21 re: no-arg
  handlers).
- A component test for `carryover-strip.tsx` (render directly, same approach as
  `tests/components/ai-usage-meter.test.tsx`): shows focus text when present, renders
  nothing when `focus` is empty, contributes nothing that disables capture.
- `tests/e2e/` — add the carryover-visibility specs against the 0006-seeded local
  Supabase. The seed already has a coach + team; seed (or assert generation of) a session
  with a `coach_debrief_extracts.next_practice_focus` so the asserted phrase is
  deterministic. Follow the existing authenticated-capture e2e convention (skip when
  `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` are unset), as 0008's capture spec does.
- New deps: no. Migration: no (`sessions.coach_debrief_extracts` already exists). Env
  vars: no. AI prompt change: no. Tier feature key: no — carryover is ungated; it just
  reads what the coach already generated.

## Implementation log

- 2026-05-22 — branch `feat/0014-capture-carryover` opened
- 2026-05-22 — failing tests added: `tests/capture/carryover.test.ts` (8 route tests) + `tests/components/carryover-strip.test.tsx` (7 component tests)
- 2026-05-22 — implemented `src/app/api/capture/carryover/route.ts`, `src/components/capture/carryover-strip.tsx`, wired into `src/app/(dashboard)/capture/page.tsx`; 15 unit tests pass; full suite 4326/4326; tsc 0 errors; lint 0 errors; e2e unit coverage only
- 2026-05-22 — blocking review: AC6+AC7 (Playwright specs) missing, capture/page.tsx wiring untested end-to-end
- 2026-05-22 — added `tests/e2e/capture-carryover.spec.ts` (AC6: strip visible with focus phrase, AC7: strip absent + record button operable, AC8: degrade on 500) + debriefed session seed row in `tests/e2e/fixtures/seed.sql` for deterministic phrase assertion
- 2026-05-22 — PR #250 opened, CI [state]
- YYYY-MM-DD — merged to main
