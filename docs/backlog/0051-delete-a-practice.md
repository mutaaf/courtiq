---
id: 0051
title: Let the coach delete a practice that shouldn't be on the team's record
status: shipped
priority: P0
area: capture
created: 2026-05-25
owner: product-groomer
---

<!--
ID renumbered 0029 → 0051 on pickup: when this ticket was groomed (2026-05-25)
the next free id WAS 0029, but main moved ahead while it sat: ids 0029/0030/0031
were assigned to unrelated GTM tickets by the autonomous Groomer between then and
now. This ticket's substance (delete-a-practice + the shared delete-denial
primitive) is unchanged; only the id+filename were bumped to the next free
slot (0051, 0052, 0053 for the three siblings) to avoid colliding with main.
-->


## User story

As a volunteer coach who created a practice for the wrong date, or ran a session
that was rained out, or accidentally tapped "Start practice" while testing, I want to
delete that practice from my team in two taps, so that my session list reflects what
actually happened with my team and the parent portal / weekly digest / Practice Arc
don't carry forward observations from a session that never was.

This is a **coach-blocking gap** reported by a real user. They said "I need to be
able to delete a practice." Today there is no surface that lets them do it, and
the generic `/api/data/mutate` `operation: 'delete'` path against `sessions` is not
exposed in UI for good reason: a raw cascade-less delete leaves orphans (observations,
recordings, media still pointing at a deleted `session_id`) and a raw cascade-full
delete silently wipes coach-authored history with no warning.

## Why now (four lenses)

### Product Owner
The smallest meaningful unit of value is a one-screen, role-gated "delete this
practice" affordance on the session detail page that does the right thing about
the session's children — observations, recordings, media, plans — without
silently destroying coach-authored notes the coach didn't realise were tied to
this session. The right shape is a **two-mode** delete: the default ("Remove
this practice — keep my notes") detaches the observations/recordings/media from
the session (sets `session_id = NULL`) and hard-deletes only the session row +
its session-scoped artifacts (`cv_processing_jobs`, `session_attendance`,
`player_availability` for that session, the practice plan generated for that
session); the destructive mode ("Delete this practice AND the X notes I wrote
during it") is a separate confirm step that cascades through observations and
their children. Two taps in the common case (the typo / wrong-date / rained-out
session has zero observations and goes straight through); a typed confirm in
the destructive case. That removes more friction than it adds surface area —
no settings page, no admin trip, no support email.

### Stakeholder
This doesn't widen the moat — it closes a hole under it. The structured-coach-artifact
moat (debrief / weekly star / parent report / Practice Arc) is built on
`observations` and `sessions`; a coach who can't undo a bad session loses faith in
the artifact and eventually stops trusting the app's memory. Worse, the existing
`/api/data/mutate` generic delete is *callable today* by any authenticated user
against `sessions`/`teams`/`players` with no membership or role check beyond
"logged in" — so this is also a quiet privacy hardening: the proper, role-gated
endpoint becomes the only sanctioned path, and the generic-mutate delete for
team-scoped tables gets locked down to head-coach-only in the same PR. (See
LESSONS.md re: "real-rendered e2e gate exposes contract gaps that network-mock-only
specs never hit" — this is one of those.)

### User (at 5:45pm on a Tuesday, 12 kids on a court)
The coach opens the session that shouldn't exist. There's a small "Delete this
practice" link in the session detail page's overflow menu (not a primary CTA —
it's a tidy-up tool, not a coaching action). One tap. A short sheet appears:
"This practice has 0 observations. Remove it?" — one big orange button, one
ghost cancel. Done; back to /sessions; the row is gone. On a flaky gym wifi the
mutation either lands or shows "Couldn't delete — try again" and leaves the
session intact (no half-state). If the session has observations, the sheet says
"This practice has 12 observations from Maya, Devon, and 4 others. What should
happen to them?" with two options: "Keep the notes (move them off this practice)"
and a "Delete the notes too" toggle that requires typing the team name to confirm
— the destructive path is *possible* but not the easy path.

### Growth
Pure retention. A coach who hits a wall on basic CRUD ("I literally cannot delete
the thing I made by mistake") churns silently; we already know this user said the
words "I need to be able to" out loud. The "show me" moment is invisible — nobody
demos delete — but a coach who never hits this wall keeps showing the parent
portal / weekly star / arc memory to their friends. There is no viral artifact
here; this earns its P0 by being **the highest-leverage anti-churn fix** in the
backlog right now, and by being the wedge the next two tickets (0052, 0053 —
renumbered from 0030, 0031 on pickup) reuse: the per-session cascade primitive
becomes the per-team cascade primitive.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `DELETE /api/sessions/[sessionId]` returns `200 { ok: true }` for an
  authenticated coach who is the session's `coach_id` OR has `role='head_coach'`
  in `team_coaches` for the session's team, and removes the row from `sessions`
  (vitest: seed a session + team_coaches membership, call the route, assert
  the row is gone and the response is 200).
- [ ] `DELETE /api/sessions/[sessionId]` returns `401` with no auth and `403`
  for an authenticated coach who is neither the session creator nor a head
  coach on the team; in both cases the `sessions` row is unchanged (vitest
  asserts the row still exists after the rejected call).
- [ ] `DELETE /api/sessions/[sessionId]` returns `404` for a session id that
  does not exist or belongs to a team in a different org from the caller; the
  route never reveals the session's existence cross-org (vitest with a
  cross-org seed asserts 404 and no DB read of the foreign team).
- [ ] **Default mode (preserve notes):** `DELETE /api/sessions/[sessionId]`
  with no body, OR `?mode=preserve`, sets `session_id = NULL` on every
  `observations`, `recordings`, and `media` row that referenced this session;
  hard-deletes the `sessions` row itself, its `cv_processing_jobs` (cascade
  already in schema), `session_attendance`, `player_availability` rows for
  that session, and any `plans` row with `session_id = <id>` (cascade already
  in schema). After the call, `select count(*) from observations where session_id = <id>`
  is 0 AND `select count(*) from observations where text in (<the seeded texts>)`
  is unchanged (vitest with 3 seeded observations + 1 recording + 1 plan).
- [ ] **Destructive mode:** `DELETE /api/sessions/[sessionId]?mode=cascade`
  also hard-deletes every `observations` row for the session (and through
  `observations.media_id` / cv chain, any per-observation children — but stops
  at the player; players are never touched). After the call, `select count(*)
  from observations where session_id = <id>` is 0 AND the previously-seeded
  observation texts no longer exist anywhere (vitest).
- [ ] The destructive mode requires a `confirm` body field equal to the team's
  `name` (case-insensitive, trimmed); a mismatched or missing `confirm` with
  `mode=cascade` returns `400` and performs no deletes (vitest seeds a session
  with observations, posts `mode=cascade` without `confirm`, asserts 400 + all
  rows intact).
- [ ] The generic `/api/data/mutate` route REJECTS `operation: 'delete'` on
  `sessions`, `teams`, and `players` with a 403 + `{ error: 'use the typed
  endpoint' }` for every caller (vitest covers all three tables); no
  in-product caller relies on the generic delete for these tables today
  (`PlayerFocusEntry.tsx` and the observations page delete observations, not
  sessions/teams/players — regression-check those still work).
- [ ] The session detail page (`src/app/(dashboard)/sessions/[sessionId]/page.tsx`)
  renders a "Delete this practice" affordance ONLY for the session creator OR
  a head coach on the team; for other authenticated team_coaches the affordance
  is absent (Playwright + component test). Server-side gating is enforced
  independently of the UI gate — assert with a direct API call from a
  non-privileged coach that the response is 403.
- [ ] The confirm sheet shows the live observation count for the session and
  the default-mode summary ("Remove this practice — keep my N notes"); the
  destructive path requires the typed team-name confirm and is the *second*
  click, never the first (Playwright: seed a session with N=12 observations,
  click delete, assert default copy mentions "12 notes", click "Delete the
  notes too", assert the confirm field appears, assert that submitting without
  the team name keeps the dialog open).
- [ ] After a successful default-mode delete from the UI, the user lands on
  `/sessions` and the deleted row is no longer in the list; observations
  remain visible on the per-player observation history view, attributed to the
  player but with no session header (Playwright e2e against the seeded DB).
- [ ] Privacy/COPPA: no new field is added to `players`. No `publicPaths`
  change. The route returns a stable 404 (not "session in another org exists")
  to prevent existence-leak across orgs (vitest).

## Out of scope

Explicit anti-goals — the dev agent will not do these even if they seem related.

- A team-wide "delete all practices" bulk action. v1 is one session at a time.
  Bulk is a separate ticket and should ride on top of this primitive.
- A trash / undo / restore window. We get the in-tap-confirm pattern right
  instead. (If the destructive path is undoable, the typed confirm stops being
  the brake it needs to be.)
- Deleting individual observations from this surface — that already works in
  the per-player observation view. This ticket deletes the *session*; the
  observation question is "preserve or cascade", not "edit each one".
- Deleting a session that has a generated parent report already sent / shared.
  v1 simply *also* deletes the row in `plans` where `session_id = <id>` (which
  already cascades via 032); the public `/share/[token]` link 404s. We do NOT
  attempt to invalidate or rewrite already-sent report content; that is a
  separate ticket and conceptually awkward (a parent who received the URL
  saw what they saw).
- Soft-delete / archive on sessions. The session table has no `archived_at`
  today and we don't add one here. The two-mode hard-delete-with-detach is
  simpler than a third "archived" state and matches the user mental model
  ("delete the practice" — not "hide it"). The 0052 season-turnover ticket
  (renumbered from 0030) is where archive lives; sessions are leaves.
- Any tier gate. This is a basic CRUD primitive; gating it would be
  user-hostile. The route is role-gated (head coach OR creator), not tier-gated.
- AI involvement. No `callAI()`, no prompt change, no `ai_interactions` log
  entry for the delete itself. (If the cascade mode happens to remove rows
  that referenced an `ai_interactions.id`, those AI log rows stay — the AI
  interaction itself happened, that's just history.)
- New analytics SDK or tracker.

## Engineering notes

Files / patterns the dev should touch.

- `src/app/api/sessions/[sessionId]/route.ts` (new) — `DELETE` handler.
  Pattern mirrors `src/app/api/recurring-sessions/[id]/route.ts` exactly
  (which already implements creator-OR-head_coach gating against
  `team_coaches`). Auth via `createServerSupabase().auth.getUser()` → 401;
  then `createServiceSupabase()`. Resolve the session, confirm
  `sessions.team_id` belongs to the caller's `coaches.org_id` (else 404,
  never 403, to avoid existence-leak across orgs). Then assert
  `sessions.coach_id === user.id` OR `team_coaches.role === 'head_coach'`
  for this team — else 403.
- The DELETE handler reads `mode` from the URL search params and `confirm`
  from the JSON body (the handler must accept a `Request` because of the body
  read — LESSONS.md 2026-05-21 re: route-handler signatures, and the test
  must invoke it with a `Request`). Two modes:
  - **`mode=preserve` (default):** in a single transaction-ish sequence —
    `update observations set session_id = null where session_id = <id>`,
    `update recordings set session_id = null where session_id = <id>`,
    `update media set session_id = null where session_id = <id>`,
    `delete from session_attendance where session_id = <id>` (if the table
    exists — see migration `014_session_attendance.sql`),
    `delete from player_availability where session_id = <id>` (migration
    `016_player_availability.sql`), then
    `delete from sessions where id = <id>`. The `plans.session_id` FK already
    cascades (migration `032_plans_session_id.sql`) so the session-scoped
    practice plan goes with the session row. The `cv_processing_jobs.session_id`
    FK also already cascades. Verify there is no other live FK pointing at
    `sessions(id)` without a cascade strategy — if there is, add a NULL-out
    step here, not a migration.
  - **`mode=cascade`:** require `confirm` to case-insensitive-equal the
    team's `name` (trimmed both sides); 400 if missing/mismatched. Then
    `delete from observations where session_id = <id>` (which cascades into
    `observation_highlights`, `observation_source_types`, etc., per their
    existing migrations — re-read 020, 024 if in doubt), and proceed with
    the same session-scoped cleanup as preserve mode.
- `src/app/api/data/mutate/route.ts` — add a short denial branch at the top
  of the `operation === 'delete'` block: if `table` is one of `sessions`,
  `teams`, `players`, return `403 { error: 'use the typed endpoint' }`.
  Do NOT remove these tables from the `allowed` array (insert/update on them
  is still legitimate via this route — the existing roster soft-delete sets
  `players.is_active = false` via `operation: 'update'`, which must keep
  working). Add a vitest that asserts the rejection for each of the three
  table names AND that `operation: 'update'` on `players` to flip `is_active`
  still works.
- `src/app/(dashboard)/sessions/[sessionId]/page.tsx` — add a "Delete this
  practice" item in the existing overflow / actions cluster (not a primary
  CTA, not above the fold). Render only when the page's resolved viewer is
  either `sessions.coach_id === user.id` OR has `head_coach` membership in
  `team_coaches` for the session's team. The page already loads the session;
  add a small membership read alongside.
- New presentational component
  `src/components/sessions/delete-practice-sheet.tsx` carrying a stable
  `data-testid="delete-practice-sheet"` (LESSONS.md re: `data-testid` for
  e2e of components without a single canonical link/button). The sheet has
  two screens — default-mode confirm (one orange "Remove this practice"
  button + cancel), and an expand-to-destructive section with the typed
  team-name confirm input. Dark zinc/orange aesthetic; 44px touch targets;
  no banned words; no emoji-decorated headings. Loading + failure states
  never leave the UI in a half-deleted look.
- Test files (all `.test.ts(x)` NOT `.spec.ts` — LESSONS.md 2026-05-20 re:
  vitest exclude):
  - `tests/sessions/delete-session-route.test.ts` — chainable in-memory
    Supabase mock (same pattern as `tests/capture/carryover.test.ts` and
    `tests/ai/weekly-star.test.ts`); seed a session + team + team_coaches
    + 3 observations + 1 recording + 1 plan + 1 attendance row; assert all
    11 ACs in the route block. Include the rejection case for the generic
    mutate route alongside (`tests/data/mutate-delete-denial.test.ts`).
  - `tests/components/delete-practice-sheet.test.tsx` — render the sheet
    directly; assert default copy with N observations; assert destructive
    expand reveals the confirm input; assert mismatched team-name keeps
    the sheet open; assert match enables submit.
  - `tests/e2e/delete-practice.spec.ts` — `test.skip` when
    `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` are unset (LESSONS.md pattern).
    Seed: an extra session on the existing E2E team with 0 observations
    and a second session with N observations. Default-mode delete on the
    empty one; destructive on the populated one (assert the
    `data-testid="delete-practice-sheet"` flow). Confirm the seed file
    `tests/e2e/fixtures/seed.sql` already covers this — if not, add a
    minimal additional row set, NOT a new fixture file.
- Run `npx tsc --noEmit` after writing the route test (LESSONS.md
  2026-05-21 re: no-arg vs `Request`-arg handler signatures) and run the
  gate under pinned Node 20.19.0 via PATH (LESSONS.md 2026-05-21):
  `N20="$HOME/.nvm/versions/node/v20.19.0/bin"; PATH="$N20:$PATH" npm ci`
  then `./node_modules/.bin/vitest run ...`.
- New deps: no. Migration: **no** — every cascade we need is already in the
  existing schema (cascades on `plans.session_id`, `cv_processing_jobs.session_id`;
  the NULL-out columns on `observations`/`recordings`/`media` are nullable
  by the original 001 schema). If the dev discovers a missing FK behavior
  while writing the test, document it in the Implementation log and add a
  numbered migration in the SAME PR (the migration version follows 036 —
  pick 037 if needed, ensuring a unique prefix per LESSONS.md 2026-05-20
  re: dup `031_` prefixes).
- Env vars: no. AI prompt change: no. Tier feature key: no.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-25 — picked up by implementation-dev; ID renumbered 0029→0051 because
  ids 0029/0030/0031 were taken on main by unrelated GTM tickets between groom
  and pickup. Substance unchanged.
- 2026-05-25 — branch `feat/0051-delete-a-practice` opened.
- 2026-05-25 — failing tests added in `tests/sessions/delete-session-route.test.ts`,
  `tests/data/mutate-delete-denial.test.ts`,
  `tests/components/delete-practice-sheet.test.tsx`.
- 2026-05-25 — deviation from engineering notes: `player_availability` has NO
  `session_id` column (migration 016) so the preserve-mode handler does NOT
  delete from it. The ticket's prose said to; the schema disagrees, schema wins.
- 2026-05-25 — PR opened, CI [pending]
- 2026-05-25 — merged to main
