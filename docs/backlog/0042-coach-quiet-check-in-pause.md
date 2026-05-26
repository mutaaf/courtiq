---
id: 0042
title: Send one honest "still coaching this season?" check-in to a coach who's been quiet 14 days, with a one-tap pause
status: groomed
priority: P1
area: onboarding
created: 2026-05-26
owner: product-groomer
---

## User story

As a volunteer coach who's gone quiet for two weeks — either because the season's in a break,
because life happened, or because I'm quietly drifting away — I want one honest email asking
"still coaching this season?" with a one-tap "pause my account for 30 days" button, so that
the app respects that I'm a human with a schedule instead of nagging me weekly into uninstall
territory, AND I want every other cron email to stop while I'm paused so the silence I asked
for is the silence I get.

## Why now (four lenses)

### Product Owner
We have three retention email surfaces shipping today (weekly digest 0023, program pulse 0028,
season wrap 0036) and one more landing with 0041. Every one of them assumes the coach wants to
hear from us this week. A coach who's gone dark for 14 days is sitting in a quiet category we
have no honest play for: keep emailing them (looks like spam, hurts deliverability) or stop
entirely (we silently churn them). The smallest meaningful unit of value is one new boolean on
`coaches.preferences` (well — one new `paused_until` column on `coaches`) and one polite email
that names the situation. The same column becomes the QUIET-HOURS predicate every other cron
already wishes it had: instead of each cron inventing its own opt-out, they all consult one
field. Big surface-area-reduction for the loop, single coach-visible action for the user.

### Stakeholder
This is the COPPA / trust posture lever — and a deliverability one. Email reputation is a
slow, expensive moat to build and a fast one to lose; the difference between a sending domain
with a 0.3% spam-complaint rate and one with a 0.05% rate is the difference between landing
in inbox and landing in tabs / promotions / spam. A pause flow is the cheapest way to drive
that number down: a coach who would otherwise mark our digest as spam instead taps "pause" and
both sides win. It also makes the existing crons (and the new 0041 rollup) safer to scale —
once `paused_until` is the shared predicate, ANY future automated touch we ship inherits the
politeness automatically. It widens the moat by lowering the marginal cost of every retention
email we ever add.

### User (the coach, the season's between two leagues, three weeks since the last practice)
They get one email subject-lined "Still coaching this season?". The body is short: "We
noticed you haven't logged a practice in two weeks. If the season's on a break, tap below to
pause us for 30 days — we'll stop the digest emails until you come back." Two buttons:
"Pause for 30 days" and "I'm still coaching — keep emails coming." One tap. The "pause" link
opens `/account/pause?token=...`, confirms, and sets the column. The next Monday, no digest,
no rollup, no pulse. When they're ready, they sign in at `/account` and tap unpause. Honest,
in coach voice, no banned words, no "we miss you!!" guilt.

### Growth
The visible-growth metric here is anti-churn: a paused coach is a coach who'll come back, a
churned coach is gone. The invisible growth metric is sender-reputation, which compounds for
every email we send going forward. The "show me" moment is small but real — the coach who
paused us last off-season comes back the next season and notices the app didn't pester them
all summer. That's the kind of detail that converts "an app I tried" into "the app I trust."
Distinct from every other growth ticket: this one's value is in restraint.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration adds `coaches.paused_until TIMESTAMPTZ NULL` with NO default and no
  index dependency on it (a partial index is fine if cheap). The migration also adds a
  `coaches.last_active_at TIMESTAMPTZ NULL` column if one does not already exist (read
  `supabase/migrations/` first — if a comparable column already exists, prefer it and skip
  this add). The migration prefix is `042_…` to claim the next free integer AFTER the
  parallel 0040 work's `041_plans_type_pregame_brief.sql` — note the parallel branch in the
  Implementation log per LESSONS#0006. (vitest scans the new migration SQL — `--` comments
  stripped per LESSONS#0088 — and asserts only the documented columns are added; the
  `paused_until` column is nullable, no NOT NULL.)
- [ ] `POST /api/cron/coach-quiet-check-in` (new, bearer-auth like other crons) finds every
  coach whose `last_active_at <= now() - interval '14 days'` AND whose `paused_until IS NULL
  OR paused_until <= now()`, sends one polite email with a `/account/pause?token=...` link,
  and writes a per-coach dedup key on `preferences.quiet_check_in_<YYYY-MM-DD>` so the same
  coach is not re-emailed within 30 days. (vitest: a coach 15 days quiet, no pause → gets
  one email; a coach 10 days quiet → no email; a coach 15 days quiet whose `paused_until` is
  20 days in the future → no email; a coach 15 days quiet whose dedup key was set 5 days ago
  → no email; a coach who was emailed 35 days ago is eligible again.)
- [ ] The email subject is `"Still coaching this season?"` (no breathless tone, no banned
  words — LESSONS#0023, instruct voice positively in the template) and the HTML body
  includes BOTH a "Pause for 30 days" button linking to `/account/pause?token=...` AND an
  "I'm still coaching" button linking to `/account` so the answer-yes path is symmetric.
  The token is a short-lived signed string (HMAC of `coach.id + paused_until_target_iso +
  CRON_SECRET`) — single-use, no DB table needed. (vitest renders the email, asserts both
  CTAs exist with correctly-formed URLs; asserts the token's HMAC validates and verifies the
  expected payload; asserts a tampered token is rejected by the verify helper.)
- [ ] `GET /account/pause?token=...` is a public page that verifies the token, sets
  `coaches.paused_until = now() + interval '30 days'`, and shows a one-line confirmation
  ("Paused until <date>. We'll stop the emails. See you when you come back."). A missing
  / expired / tampered token renders an error state and writes NOTHING. The route lives at
  `src/app/account/pause/page.tsx`. The path is added to `publicPaths` in
  `src/lib/supabase/middleware.ts` (LESSONS#0038 family — without this the auth proxy 30x's
  to `/login`). (Playwright: hit the page with a fresh valid token, assert the DB row
  updates and the confirmation renders; hit it with a tampered token, assert no DB write and
  the error renders.)
- [ ] `/account` (authed) shows a "Paused until <date> — Unpause" control whenever
  `paused_until > now()`. Tapping it clears `paused_until` to NULL via the existing
  `mutate()` path (AGENTS.md rule 3 — never a direct client Supabase call). (Playwright: a
  paused coach signs in, taps unpause, the indicator disappears; vitest on the API path the
  unpause goes through — asserts the route validates the caller owns the row and ignores any
  forged `coach_id` in the body, mirroring LESSONS#0039's drill-signals contract.)
- [ ] EVERY existing cron skips a paused coach: `weekly-digest`, `parent-digest`,
  `practice-reminder`, and the new 0041 `weekly-parent-rollup` each gain an
  `isCoachPaused(coach)` short-circuit BEFORE any send work. (vitest in each cron's test
  file: seed a coach with `paused_until = now() + 5 days`, run the cron, assert `sendEmail`
  is invoked ZERO times for that coach; assert `totalSkipped` increments; assert NO
  `preferences` write occurs because the dedup key wasn't earned.)
- [ ] A pure helper `isCoachPaused({ paused_until }: { paused_until: string | null }, now =
  new Date()): boolean` lives in `src/lib/coach-pause-utils.ts` and every cron + the new
  check-in cron imports the SAME helper. (vitest on the helper: null → false; future-dated →
  true; past-dated → false; epoch-zero → false.)
- [ ] COPPA / privacy: no minor data appears in the check-in email or on the pause page —
  the email greets the coach by `coaches.full_name` first name only, and the pause page
  shows no player or team info. The `paused_until` column is on `coaches`, not on `players`;
  no new field is added to any minor-scoped table. (vitest scans the rendered HTML of the
  email and the pause page output for planted player-name tokens — none should appear.)

## Out of scope

- An indefinite pause ("pause forever"). v1 is fixed 30 days; if the coach wants longer they
  re-pause when the period ends.
- A push notification. v1 is email + the in-app `/account` control only.
- Account deletion or COPPA-deletion flows from this surface. Deletion already has its own
  route under `/api/account/delete`; pause is a separate, lighter primitive.
- A self-serve admin "see who's paused" dashboard. v1 is coach-individual only; org-level
  visibility into paused coaches is a separate ticket (and a privacy discussion).
- A re-engagement campaign at unpause time ("welcome back — here's what's new"). v1 keeps
  unpause silent; turning re-engagement back on is the coach's own action.
- Migrating existing inactive coaches as paused on rollout. v1 starts everyone with
  `paused_until IS NULL` and only flips to paused on the coach's explicit tap.
- Threading `paused_until` into the in-app dashboard cards (hiding the home screen, etc.).
  v1's effect is OUTBOUND email only; the in-app surface stays open so the coach can come
  back any time without a friction wall.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- `supabase/migrations/042_coaches_paused_until.sql` (new) — `ALTER TABLE coaches ADD
  COLUMN paused_until TIMESTAMPTZ NULL;` plus a comment explaining the column's purpose.
  Pick the `042` prefix DELIBERATELY: the parallel `feat/0040-pregame-scouting-brief`
  branch's in-progress work has `041_plans_type_pregame_brief.sql` staged but not yet
  merged; once 0040 ships, this branch may need to be rebased and the prefix may shift to
  the next free integer — document the prefix decision in the Implementation log per
  LESSONS#0006. The migration touches NO minor-scoped column.
- `src/types/database.ts` — extend the `Coach` row type with `paused_until: string | null`.
  Add `coaches` to the `mutate()` allow-list if it isn't already (it IS, for the existing
  preferences update path — confirm by reading
  `src/app/api/data/mutate/route.ts`).
- `src/lib/coach-pause-utils.ts` (new) — `isCoachPaused(row, now?)` pure helper. Export a
  `signPauseToken({ coachId, pausedUntilIso, secret })` and
  `verifyPauseToken(token, secret): { ok, coachId, pausedUntilIso } | { ok: false }`
  helpers using `crypto.createHmac('sha256', secret).update(payload).digest('base64url')`
  (Node `crypto` is already in scope across other API routes — no new dep). The token
  payload is `coachId.pausedUntilIso.<hmac>`; the verify function rejects on length / shape
  / HMAC mismatch. The signing secret reuses `CRON_SECRET` (already a server-only env).
- `src/app/api/cron/coach-quiet-check-in/route.ts` (new) — `POST(request)`. Auth via
  `Bearer ${CRON_SECRET}` mirroring `weekly-digest`. Page coaches in batches of 50. Skip
  coaches where `isCoachPaused(row)` or the dedup key is set within 30 days. Filter to
  `last_active_at <= now() - interval '14 days'` — if `coaches.last_active_at` does not yet
  exist, fall back to a query of `sessions` (max `created_at`) per coach until the
  migration adds it. Build subject + HTML via a new
  `src/lib/coach-quiet-check-in-utils.ts` (mirror the digest utils file). Send via
  `sendEmail()`. On success, set the dedup key. Returns the same
  `{ week, sent, skipped, errors }` shape as the other crons.
- `src/app/account/pause/page.tsx` (new, server component) — reads `?token=...` from
  `searchParams`, calls `verifyPauseToken(token, CRON_SECRET)`, on `ok` uses
  `createServiceSupabase()` to write `paused_until = new Date(Date.now() + 30 *
  86400_000).toISOString()` for the resolved `coachId`, and renders a clipboard-voice
  confirmation. On `ok: false` renders the error state with NO DB write. Voice instruction:
  positive (LESSONS#0023). Dark zinc/orange aesthetic, 44px targets.
- `src/lib/supabase/middleware.ts` — add `/account/pause` to the `publicPaths` array so the
  auth proxy doesn't 30x to `/login` (LESSONS#0038). Do NOT add `/account` itself — that
  one stays behind auth.
- `src/app/(dashboard)/account/page.tsx` (existing) — render a "Paused until …" indicator
  + unpause button when the resolved `coach.paused_until > now()`. The button POSTs through
  the existing `mutate({ table: 'coaches', id: coach.id, set: { paused_until: null } })`
  helper. NEVER a direct client Supabase write (AGENTS.md rule 3).
- `src/app/api/cron/weekly-digest/route.ts` — add `if (isCoachPaused(coach)) { totalSkipped++;
  continue; }` BEFORE the existing opt-out / dedup checks. Keep the rest byte-identical.
- `src/app/api/cron/parent-digest/route.ts` — same short-circuit.
- `src/app/api/cron/practice-reminder/route.ts` — same short-circuit.
- `src/app/api/cron/weekly-parent-rollup/route.ts` (the 0041 ticket's new route) — same
  short-circuit. (Coordinate with 0041 in the Implementation log; if 0041 hasn't merged
  yet, this ticket adds it once 0041 lands.)
- `tests/api/cron/coach-quiet-check-in.test.ts` (new, `.test.ts`) — covers each AC case
  enumerated above, mocking `@/lib/supabase/server` chainably and `@/lib/email.ts`'s
  `sendEmail`. Tokens are tested via real HMAC (no mock) against a fixture secret.
- `tests/lib/coach-pause-utils.test.ts` (new) — the pure helper and token sign/verify
  matrix (null / future / past / tampered / wrong-secret / wrong-coach).
- `tests/api/cron/weekly-digest.test.ts` + `…/parent-digest.test.ts` +
  `…/practice-reminder.test.ts` (extend whichever exist; add if missing for the
  pause-skip case only) — assert each cron skips a paused coach.
- `tests/e2e/account-pause-flow.spec.ts` (new Playwright spec) against the 0006-seeded
  Supabase. Seed: one coach. The spec generates a valid token via the helper, hits
  `/account/pause?token=…`, asserts the confirmation, then signs in and asserts the
  `/account` page shows the paused indicator + unpause control; taps unpause; asserts the
  indicator goes away. Skip when E2E creds are unset (convention).
- New deps: NO (HMAC uses Node's built-in `crypto`). Migration: YES — `042_coaches_paused_until.sql`.
  Env vars: NO new ones — reuses `CRON_SECRET`. AI prompt change: NO. Tier feature key:
  NO (pause is universal, not paywalled).
- LESSONS to anchor: #0023 (instruct voice positively in the email template), #0038
  (add `/account/pause` to `publicPaths`), #0039 (route never trusts a client-supplied
  `coach_id`), #0084 (assert payload keyset), #0006 (unique migration prefix — coordinate
  with the parallel 0040 branch's `041_*`).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0042-…` opened
- YYYY-MM-DD — failing test added in `tests/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
