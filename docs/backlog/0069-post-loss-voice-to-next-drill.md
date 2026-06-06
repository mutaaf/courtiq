---
id: 0069
title: After a rough game, let the coach record 30 seconds of voice on the drive home and have it become the first drill of the next practice
status: shipped
priority: P1
area: capture
created: 2026-06-05
owner: product-groomer
---

## User story

As a volunteer youth-sports coach who just lost 4-12 on a Saturday morning
and is driving home with my own kid in the backseat who is quiet, I want
ONE tap to record 30 seconds of voice about what hurt — "we couldn't get a
single rebound, they outran us on every transition, three kids gave up by
the second quarter" — and have that turn into the FIRST drill of Tuesday's
practice with a one-line "why this is the first drill" note for me, so the
next practice STARTS from the loss instead of pretending it didn't happen,
and I don't open the app on Tuesday with a blank Sunday-built plan that
ignores Saturday.

## Why now (four lenses)

### Product Owner

The product has shipped two adjacent surfaces that bracket but do not fill
the post-loss seam. (1) 0048 ships the POST-GAME PER-KID TEXT — one short
text per kid to paste into Messages after the game, parent-facing. That is
the PARENT post-game artifact, not the COACH's. (2) 0027 ships the GAME
RECAP CARD — a public card the coach drops in the team group chat on the
drive home. That is the PARENT post-game artifact (different shape from
0048; same audience). What is MISSING is the COACH-FACING post-loss
primitive — the 30 seconds of voice the coach uses to process what
actually went wrong, captured in the parking lot, that becomes a concrete
input to Tuesday's practice plan. The smallest meaningful unit of value
is: (a) a new "Save my post-game voice note" surface on the existing
session detail page for any session whose type is `game` / `scrimmage` /
`tournament` AND whose `started_at` is within the last 24 hours, (b)
ONE big mic button that captures up to 60 seconds of voice via the
existing Web Speech API path AND uploads the audio for Gemini
transcription (the existing long-session-audio pipeline — voice-first
is the brand), (c) a save action that writes the transcript to a new
`game_decompressions` row tied to the session, (d) a single `callAI()`
through the new `gameDecompressionToDrill` prompt that emits ONE
drill recommendation (drill name + 3-line setup + a one-line "why this
is the first drill — what Saturday told us" note) anchored to the
team's existing drill library AND the coach's coaching-signature
drills per the 0037 shape, (e) the next time the coach taps "build
next practice" (the existing `/api/ai/plan` route), the recommended
drill is auto-inserted as drill #1 of the new plan with the one-line
"why" note rendered above it. The capture is voice; the drill is
concrete; the next practice carries the loss forward.

### Stakeholder

This is the moat-deepening primitive for the moment of HIGHEST coach
emotional intensity in a season — the drive home from a bad loss —
and the moment a forms app structurally cannot serve. Three
compoundings, all distinct from anything shipped. (1) The voice-
capture moat — the post-loss moment is the textbook voice-first
moment (the coach is in a car, holding a steering wheel, on
cellular). 0008 / the existing Web Speech path + the existing
long-session-audio pipeline both already exist; this surface is the
voice-first feature that competitors cannot easily replicate
because they don't have multi-provider audio routing through
Gemini. (2) The Practice-Arc continuity moat — 0014 / 0018 / 0020
all surface "what carried forward from last practice" on the next
Capture; this ticket carries forward what the LOSS told us, not
what the last practice's observations said, which is a structurally
different signal. (3) The retention-through-frustration moat — the
single highest churn moment for a volunteer coach is "we lost
badly and I don't know what to do Tuesday" (revealed in the 0042
quiet-coach pause data — losses are the strongest pause signal).
Converting that moment into a captured input plus a concrete drill
is the retention compound. The coach who shipped a decompression
voice-note on Saturday opens the app Tuesday because they want to
SEE what it became. Distinct from 0027 (parent recap), 0048
(parent text), 0040 (pre-game brief, before the game), 0014 / 0018
/ 0020 (practice-to-practice, not game-to-practice), 0058 (Sunday
plan finish, presumes the coach already started the plan).

### User (the coach, Saturday 11:42am, driving home from the gym)

She just put her own kid in the backseat. The kid is quiet. She is
quiet too. She opens SportsIQ at a red light, taps the today-game
session (which the existing /home surface already pulls up because
the game just ended), and there is a new orange button right under
the game-recap-card entry: "Quick voice note — what hurt?" She
taps it. ONE big mic button fills the screen. She holds the
steering wheel with one hand, taps with the other, and just
talks. "We couldn't get a single rebound. They outran us on every
transition. Three kids gave up by the second quarter — Maya and
Caleb stayed in but the rest checked out. Need to work on
rebounding and conditioning. The girls need to fight for the
ball." She taps stop at 28 seconds. The screen flips to a small
transcript ("we couldn't get a single rebound..." — readable but
imperfect, the way Gemini transcripts read). Two buttons: "Save
it" and "Re-record." She taps Save. A small green confirmation:
"Saved. Your next practice plan will start with the drill that
fits this." She closes the app. Total interaction: 38 seconds.
No typing. No form. No "rate the game out of 5."

### User (the coach, Sunday night at the kitchen table)

She opens /plans, taps "build next practice plan" (the existing
button on the existing 0058 path). The plan loads. Drill #1 is
"Live-ball rebound 2-on-2 — focus on boxing out and effort, 8
minutes." Above the drill, in italics: "Why this is first today —
Saturday's voice note said rebounding and effort. Starting here."
She reads it. She knows it's right. She does NOT regenerate. She
taps "Save plan." Tuesday she runs it. The kids start the
practice by talking about Saturday's loss in concrete drill terms
instead of pretending it didn't happen.

### Growth

The "show me" moment is the COACH'S phone two days after a
brutal loss — the next practice plan opens with a drill that
remembers what hurt. That is the single most viral coach-to-
coach screenshot the product has the potential to ship — a
volunteer coach will text another volunteer coach "look what
the app did" because no app has ever done that. Compounds
three ways. (1) The voice-first retention pull — every loss
captured is a return visit guaranteed two days later (the
coach WANTS to see what their voice note became; the
mechanism IS the retention hook). (2) The cross-coach
forward — a coach who shows the next-practice-starts-from-
the-loss screenshot to another coach in the same league
opens the existing 0015 / 0024 / 0044 invite-an-assistant
or share-a-drill paths. (3) The plan-quality compound — the
recommended drill draws from BOTH the team's existing drill
library AND the coach's coaching-signature drills (0037),
so the drill that surfaces on the SECOND post-loss
decompression is even more "this is how I coach" than the
first. Distinct from every shipped surface because every
shipped surface is parent-facing (0027 / 0048 / 0046) or
plan-only (0058 / 0044 / 0045) or pre-game (0040); THIS
surface is the coach's post-loss decompression that
becomes the next practice's first drill.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `063_game_decompressions.sql` adds the
  table `game_decompressions (id UUID PRIMARY KEY DEFAULT
  gen_random_uuid(), session_id UUID NOT NULL REFERENCES
  sessions(id) ON DELETE CASCADE, coach_id UUID NOT NULL
  REFERENCES coaches(id) ON DELETE CASCADE, team_id UUID NOT
  NULL REFERENCES teams(id) ON DELETE CASCADE, transcript
  TEXT NOT NULL, duration_seconds INT NOT NULL,
  recommended_drill_name TEXT NULL, recommended_drill_setup
  TEXT[] NULL, recommended_drill_why TEXT NULL,
  consumed_at TIMESTAMPTZ NULL, consumed_plan_id UUID NULL
  REFERENCES plans(id) ON DELETE SET NULL, created_at
  TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(session_id,
  coach_id))`. Indexes: `(coach_id, created_at DESC)` for
  the "carry into next plan" lookup; `(team_id, consumed_at)
  WHERE consumed_at IS NULL` for the next-plan auto-insert
  query. NO column on `sessions`, `coaches`, `players`,
  `teams`, `observations`, `plans`. Per LESSONS#0006 — at
  pickup confirm `063` is the next free integer; bump if a
  sibling claimed it. LESSONS#0088 — strip `--` comments
  before the no-banned-token scan. The migration's CHECK
  constraints: `duration_seconds BETWEEN 1 AND 60`,
  `length(transcript) BETWEEN 1 AND 1200`. (vitest: scan
  migration body with `--` stripped; column allow-list;
  CHECKs; both indexes; UNIQUE constraint; NO new column on
  any sacred table.)

- [ ] `POST /api/game-decompression/create` (new, authed)
  accepts `{ sessionId: UUID, transcript: string,
  durationSeconds: number }`. The route: (a) verifies the
  caller is a head coach on the session's team via
  `team_coaches` per LESSONS#0057; (b) verifies the
  session's `type IN ('game', 'scrimmage', 'tournament')`
  AND the session's `started_at` (or `created_at` if
  `started_at` is null — read at pickup per LESSONS#0096)
  is within the last 24 hours (reject `400 { reason:
  'window' }` outside the window); (c) validates the
  transcript is 1–1200 chars and the duration 1–60 sec;
  (d) voice-scans the transcript per LESSONS#0023 (reject
  `400 { reason: 'voice' }` on banned-word match — a
  decompression of a loss should still read like a
  clipboard, not breathless hype); (e) upserts the row on
  `(session_id, coach_id)` (a re-record REPLACES); (f)
  calls `callAIWithJSON()` through the new
  `gameDecompressionToDrill` prompt with the transcript +
  the team's existing drill library + the coach's
  coaching-signature (0037 helper); (g) writes the AI's
  drill recommendation back to the row
  (`recommended_drill_name`, `recommended_drill_setup`,
  `recommended_drill_why`); (h) returns `200 {
  transcript, recommendation: { drillName, setupLines,
  why } }`. (vitest: 200 + row written + AI called +
  recommendation persisted; 400 voice on banned-word;
  400 length; 400 window (session > 24h old); 400 type
  not game/scrimmage/tournament; 403 caller not head
  coach; 404 session unknown; 401 unauthed; 200
  idempotent re-record on `(session_id, coach_id)`
  REPLACES the transcript + the recommendation.)

- [ ] A new `gameDecompressionToDrill` prompt in
  `src/lib/ai/prompts.ts`. The prompt receives
  `{ transcript, drillLibrary: Array<{name, focus,
  setup_lines}>, coachingSignature?: CoachingSignature
  }`. The prompt's instruction is positive (LESSONS#0023):
  "you are picking the FIRST drill of the coach's next
  practice based on what hurt in this game; pick from the
  provided drill library where possible; if the
  coachingSignature names recurring drills, lean on them
  first; write the 'why' as one short line a coach would
  read on the drive to Tuesday's practice." Response JSON
  shape: `{ "drill_name": string, "setup_lines": string[]
  (3 max), "why": string (<= 160 chars) }`. The system
  preamble uses the existing `buildSystemPreamble(params)`
  pattern; no banned-token enumeration. The drill_name
  MUST be drawn from the provided drillLibrary if the
  library has ANY entry whose focus matches the
  transcript's anchor (rebound/conditioning/passing/etc.);
  the fallback to a coachingSignature drill is the second
  preference; an AI-invented drill is the LAST resort
  (the prompt instruction calls out the order). (vitest
  AI contract test under `tests/ai/`: scan
  `${system}\n${user}` for banned words per LESSONS#0023
  (positive-instruction only — no enumerated ban-list per
  the LESSONS#0023 trap); the prompt names the response
  JSON shape; the user block contains the transcript +
  the drill library; the system block names the COACH'S
  voice rule. Cross-provider contract test under
  Anthropic + one fallback per the AGENTS.md AI
  contract.)

- [ ] `GET /api/game-decompression/unconsumed-for-team?
  teamId=...` (new, authed) returns the caller's MOST-
  RECENT unconsumed (`consumed_at IS NULL`)
  decompression for the team in the last 14 days. The
  existing `/api/ai/plan` route (the practice-plan
  generator — read its current shape at pickup per
  LESSONS#0096) reads this endpoint at the START of plan
  generation; if a decompression is present, the
  generator INSERTS the recommended drill as drill #1 of
  the new plan AND writes the `why` line into the plan's
  `content_structured.first_drill_why` field (a new
  optional field on the existing structured content —
  no schema change). The plan generator then SETS
  `game_decompressions.consumed_at = now()` AND
  `consumed_plan_id = <new plan id>` so the same
  decompression does not re-fire on the next plan
  generation. Per LESSONS#0049 / #0092 / #0100 — the
  plan route's hand-rolled mocks must be extended with
  the new `from()` chain in EVERY sibling test that
  mocks it (Glob `tests/api/plan*.test.ts` at pickup;
  audit per LESSONS#0110). (vitest: the plan route
  with no unconsumed decompression renders BYTE-
  IDENTICAL to today's output; the plan route with an
  unconsumed decompression inserts the drill at index
  0 AND writes the `why`; the decompression row is
  marked consumed after; a second plan generation
  doesn't re-fire the same decompression.)

- [ ] A new `<GameDecompressionEntry />` on the EXISTING
  session detail page for sessions whose type is
  game/scrimmage/tournament AND whose `started_at` is
  within 24 hours. The entry mounts ABOVE the existing
  0027 game-recap-card. Tapping opens a sheet with: a
  big mic button (Web Speech API live transcript +
  background upload to the existing long-session-audio
  pipeline for Gemini transcription — read the existing
  pattern at pickup per LESSONS#0096; the live
  transcript is the user-feedback path, the Gemini
  transcript is the persisted ground truth), a stop
  button (auto-stops at 60s), a transcript preview, a
  Re-record button, and a Save button. The sheet
  exposes `data-testid="decompression-sheet"`. On
  Save, POST `/api/game-decompression/create`; the
  success state shows the AI drill recommendation +
  the "why" line + a single "Got it" button that
  closes the sheet. (vitest component test: render
  the session page with a mocked recent game session,
  assert the entry renders; render with a stale game,
  assert it does NOT render; render with a non-game
  session, assert it does NOT render; tap the entry,
  assert the sheet opens; mock the recorder, mock the
  POST, assert the success state shows the
  recommendation.)

- [ ] A small `<NextPracticeFirstDrillBanner />` on the
  practice-plan render (existing — read at pickup) that
  surfaces the `content_structured.first_drill_why`
  line above drill #1 when present. The banner reads:
  "Why this is first today — <why line>." The banner
  renders nothing when `first_drill_why` is absent
  (silence beats invention). The banner is byte-
  identical for every existing plan that doesn't
  carry the new field. (vitest component test: render
  the plan view with a plan that has
  `first_drill_why` set, assert the banner renders;
  render without the field, assert the banner does
  NOT render.)

- [ ] Tier / feature gating: the decompression CREATE +
  the AI-drill recommendation ARE tier-gated behind a
  new `feature_game_decompression` key. Free tier:
  the coach can record the voice note AND save the
  transcript, but the AI drill recommendation +
  auto-insert into the next plan are gated (the
  recommendation block on the success state is
  replaced by a `<UpgradeGate>` per the existing 0035
  shape — the gate lets the coach finish the EXACT
  artifact they were making by upgrading, the
  smoothest gate the product ships). The transcript
  itself is captured + persisted on free tier (the
  voice-first promise is not gated). The new key
  is registered in `TIER_LIMITS` under coach + pro +
  org (per the existing key pattern); free does
  NOT include it. The `<UpgradeGate>` component
  registers `feature_game_decompression` in
  `FEATURE_CONFIG`. Per LESSONS#0078 — the
  `feature` prop on `<UpgradeGate>` MUST equal the
  registered key exactly. Per AGENTS.md — server-
  AND-client gating: the route's
  `canAccess(tier, 'feature_game_decompression')`
  check is the load-bearing gate; the UI gate is
  the friendly surface. (vitest: a free-tier coach
  POSTing the create endpoint with the AI step
  gets `402 { reason: 'tier' }` (the transcript
  persists but no AI call fires); a coach-tier
  coach POSTing gets the AI step + persistence;
  the `<UpgradeGate>` renders for the free coach
  on the entry sheet's success state.)

- [ ] Privacy / COPPA contract: the decompression
  CAPTURE is coach-authored only — no player NAME,
  jersey, DOB, parent_email, parent_phone, photo
  URL, medical_notes is solicited or surfaced. The
  transcript MAY mention a player's first name (the
  coach said it on the recording — voice-first is
  free-form) but the AI prompt's instruction
  EXPLICITLY says "name SPECIFIC players ONLY by
  first name in the why line; never invent a
  surname or attach a jersey number." The route
  voice-scans the transcript on POST per
  LESSONS#0023. The route NEVER writes the
  transcript to any AI provider as a multi-turn
  context (single shot, no logging beyond the
  existing `ai_interactions` row per the AGENTS.md
  contract). The `.select()` calls are explicit
  allow-lists per LESSONS#0036. The recommended
  drill `why` line goes through a defensive last-
  name scan per the LESSONS#0061 fix (`/[A-Z][a-z]+
  [A-Z][a-z]+/` with a LITERAL space, not `\s+`);
  if the AI output contains a surname-shape, the
  route strips it before persistence. (vitest: a
  transcript that contains "Maya Walker" persists
  the transcript verbatim but the AI prompt's
  instruction is positive about first-names-only;
  the AI output is post-processed to strip
  surname-shapes from the why line; the planted
  DOB / parent_email / parent_phone columns are
  NEVER read by the route's `.select()`.)

- [ ] Voice contract: every new user-facing string
  (the mic-screen prompts, the stop label, the
  transcript preview header, the success-state
  copy, the next-practice banner copy, the tier-
  gate copy) contains NO AGENTS.md banned word per
  LESSONS#0023. Instruct positively ("what hurt?",
  "saved", "starting here", "why this is first
  today") — never the banned tokens, never the
  enumerated ban-list. The voice-rejection nudge
  reads as a single plain line ("write it like
  you're talking to your assistant — keep it
  short and concrete"). (vitest: render each new
  component and scan rendered text; scan the AI
  prompt body; scan the voice-rejection nudge.)

- [ ] Regression: the existing 0027 game-recap-card
  + the existing /api/recap-card/create are BYTE-
  IDENTICAL. The existing /api/ai/plan route is
  BYTE-IDENTICAL for plan generation that finds
  NO unconsumed decompression (the new read is a
  silent no-op when absent). The existing session
  detail page is BYTE-IDENTICAL for non-game
  sessions and for game sessions older than 24h.
  The existing practice-plan view is BYTE-
  IDENTICAL for plans whose `content_structured`
  lacks `first_drill_why`. (vitest: snapshot the
  named routes / components against seeded
  fixtures pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture: seed extension
  is ONE `game_decompressions` row pre-minted by
  the E2E coach for an existing E2E
  game/scrimmage session (the 0028 seed already
  has a recent game session — verify at pickup
  per LESSONS#0096; if not, seed a fresh game
  session with `started_at = now() - interval '2
  hours'` in the same DELETE-then-INSERT
  idempotent block per LESSONS#0084). The
  decompression row has a known transcript, a
  pre-canned recommendation, and `consumed_at IS
  NULL`. Playwright spec: (a) sign in as the
  E2E coach, navigate to the seeded game
  session, assert the decompression entry
  renders, tap it, assert the sheet opens (the
  E2E spec mocks the recorder + mocks the POST
  per LESSONS#0036's client-fetch posture —
  the persistence path is the unit-test load-
  bearing assertion); (b) navigate to /plans,
  trigger "build next practice plan" (mock the
  AI call to return a known plan; the read of
  the unconsumed decompression is real), assert
  the plan's drill #1 is the seeded
  recommendation AND the banner reads the
  seeded `why`; (c) assert a second plan
  generation does NOT re-insert the same
  drill. Scope every assertion to data-testid
  per LESSONS#0081 / #0082. Skip when E2E
  creds are unset. Add `/api/game-
  decompression/` to `publicPaths` only if the
  routes are public (they are NOT — all self-
  enforce auth — so the publicPaths list does
  NOT need extension per LESSONS#0091 /
  #0104).

## Out of scope

- A WIN decompression ("what went right?"). v1 is
  the loss surface only; the asymmetry is
  intentional — the post-win moment is already
  served by the existing 0027 game-recap-card.
- A multi-game decompression ("the LAST three
  games told us X"). v1 is one-game-at-a-time;
  a cross-game synthesis is a follow-on.
- A parent-facing version of the decompression. v1
  is COACH-FACING only. The parent-facing post-
  game artifacts are the existing 0027 / 0048.
- An auto-recording trigger ("start recording the
  moment the game session ends"). v1 is one-tap
  start, one-tap stop. An auto-trigger is a
  separate consent ticket.
- A multi-drill recommendation. v1 is the FIRST
  drill of the next practice only. The
  generator picks the rest of the plan as
  today.
- A "share my decompression with my assistant
  coach" surface. v1 is private to the head
  coach; the assistant-coach primitive is the
  existing 0067 sub-handoff path (which
  surfaces the queued drills, not the
  decompression).
- A video-clip decompression. v1 is voice only;
  video is a separate scope.

## Engineering notes

Files / patterns the dev should touch.

- `supabase/migrations/063_game_decompressions.sql`
  (new). LESSONS#0006 — at pickup confirm `063`
  is free; bump if a sibling claimed it.
  LESSONS#0088 — strip `--` comments before the
  banned-token scan. Header mirrors
  `048_practice_plan_shares.sql`.
- `src/types/database.ts` — add
  `GameDecompression` type. NO field on any
  existing type.
- `src/app/api/game-decompression/create/route.ts`
  (new) — `POST(request)`. Authed via
  `createServerSupabase()` for auth, service-role
  write. Head-coach check via `team_coaches` per
  LESSONS#0057. Window check on `sessions.type +
  started_at`. Voice-scan per LESSONS#0023.
  `callAIWithJSON()` per AGENTS.md. Per
  AGENTS.md — server-side `canAccess(tier,
  'feature_game_decompression')` check.
- `src/app/api/game-decompression/
  unconsumed-for-team/route.ts` (new) — `GET`
  request. Authed. Returns the caller's most-
  recent unconsumed decompression for the team
  in the last 14 days. Per LESSONS#0036 —
  `.select()` allow-lists.
- `src/lib/ai/prompts.ts` — new
  `gameDecompressionToDrill` prompt. Pure
  template factory matching the existing
  shape. Per LESSONS#0023 — positive
  instruction only, no enumerated ban-list.
- `src/app/api/ai/plan/route.ts` (existing —
  read first per LESSONS#0096) — at the START
  of plan generation, read the unconsumed-
  decompression endpoint for the team; if
  present, insert the recommended drill at
  index 0 + write the `why` to
  `content_structured.first_drill_why`; mark
  the decompression consumed in the same
  transaction. Per LESSONS#0049 / #0092 /
  #0100 / #0110 — Glob every
  `tests/api/plan*.test.ts` and extend every
  `mockReturnValueOnce` queue with the new
  from-chain.
- `src/components/session/
  game-decompression-entry.tsx` (new) — the
  sheet + the mic button. `data-testid=
  "decompression-sheet"`.
- `src/components/plans/
  next-practice-first-drill-banner.tsx` (new)
  — the small banner above drill #1.
- `src/app/(dashboard)/sessions/[sessionId]/
  page.tsx` (existing — read first per
  LESSONS#0096) — mount the new entry above
  the existing 0027 game-recap-card entry.
  Per LESSONS#0096 — if the session detail
  path differs at pickup, mount on the
  actual session detail page.
- `src/app/(dashboard)/plans/.../page.tsx`
  (existing — read first per LESSONS#0096)
  — mount the banner above drill #1 when
  `first_drill_why` is set.
- `src/lib/tier.ts` — add
  `feature_game_decompression` to coach +
  pro + org (NOT free). Per LESSONS#0078 —
  the key is the literal `feature_*` string.
- `src/components/ui/upgrade-gate.tsx` —
  register `feature_game_decompression` in
  `FEATURE_CONFIG` with the benefit copy.
- `src/lib/observer-utils.ts` (existing —
  read first per LESSONS#0096) — NOT used
  here (decompression is coach-authored
  only, no observer-token path).
- `src/lib/coaching-signature-utils.ts`
  (existing — read first per LESSONS#0096)
  — REUSE the existing `buildCoachingSignature`
  builder for the prompt's input.
- `tests/migrations/063-game-decompressions
  .test.ts` (new, `.test.ts` per
  LESSONS#0020 / #38).
- `tests/api/game-decompression-create
  .test.ts` (new) — every AC case.
- `tests/api/game-decompression-unconsumed
  .test.ts` (new).
- `tests/ai/game-decompression-to-drill
  .test.ts` (new) — banned-words scan per
  LESSONS#0023; response shape; cross-
  provider per the AGENTS.md AI contract.
- `tests/components/game-decompression-entry
  .test.tsx` (new).
- `tests/components/next-practice-first-
  drill-banner.test.tsx` (new).
- `tests/api/plan*.test.ts` (existing —
  Glob at pickup per LESSONS#0110) — extend
  EVERY `mockReturnValueOnce` queue with
  the new from-chain.
- `tests/e2e/game-decompression-flow.spec
  .ts` (new). Seed extension per the AC.
  UUIDs in next free `0000000000<XX>+`
  range per LESSONS#0101. Skip when E2E
  creds are unset.
- New deps: NO. Migration: YES (063 or
  bump). Env vars: NO new. AI prompt
  change: YES (new
  `gameDecompressionToDrill` prompt in
  `src/lib/ai/prompts.ts`). Tier feature
  key: YES (`feature_game_decompression`).
- LESSONS to anchor: #0006 (prefix
  uniqueness), #0020 / #38 (.test.ts),
  #0023 (positive voice on prompt +
  templates + voice scan on POST), #0036
  (best-effort render + COPPA
  `.select()` allow-list on every route),
  #0049 / #0092 / #0100 / #0110 (plan-
  route mock queue spillover — Glob
  every `plan*.test.ts`), #0055 (route
  handler call posture), #0057
  (team_coaches not teams.coach_id —
  head-coach check), #0061 (literal
  space, not `\s+`, in the last-name
  post-processor), #0078 (feature key
  literal), #0081 / #0082 (data-testid
  scoping in e2e), #0084 / #0101 (seed
  posture; UUID range), #0088 (strip
  `--` comments), #0091 / #0104
  (publicPaths — NOT needed here, all
  routes self-enforce auth), #0096
  (schema wins over prose — at pickup
  read the actual session detail page
  path, the actual `/api/ai/plan`
  shape, the actual practice-plan view
  path, the actual `started_at` vs
  `created_at` on sessions, the
  existing long-session-audio pipeline
  for Gemini transcription, the
  existing `<UpgradeGate>` usage on
  any tier-gated AI surface, the
  existing `coaching-signature-utils`
  signature).

## Implementation log

- 2026-06-05 [implementation-dev] Picked up on `feat/0069-post-loss-voice-to-next-drill`. Schema reconciliation (LESSONS#0096): `sessions` has NO `started_at` column — the table carries `date date NOT NULL` + `start_time time NULL` + `created_at timestamptz`. The 24-hour window check therefore composes `(date || ' ' || start_time)::timestamptz` when `start_time` is present, else `(date || ' 00:00')::timestamptz`, with a final fallback to `created_at`. The ticket prose's "started_at" stays as written (the groomer's intent is "when the game played"); the dev resolves to the real columns without inventing a new field.
- 2026-06-05 [implementation-dev] Migration prefix 063 confirmed free (next after 062). Will not bump.
- 2026-06-05 [implementation-dev] Plan-route mock sweep (LESSONS#0049/#0092/#0100/#0110): `Glob 'tests/api/plan*.test.ts'` returned no matches; `tests/api/ai/plan-rollover.test.ts` is the live plan-route mock site (under `tests/api/ai/` not `tests/api/`). The unconsumed-decompression read is added at the START of the `/api/ai/plan` POST so it appears BEFORE the existing five-promise `Promise.all`; existing test queues are extended with one extra `mockReturnValueOnce` at the head. The read is best-effort (failure resolves to null) so a coach with no decompression behaves byte-identically to today.
- 2026-06-05 [implementation-dev] Tier registration: `feature_game_decompression` added to `coach`, `pro_coach`, `organization` arrays in `TIER_LIMITS` and to `FEATURE_CONFIG` in `<UpgradeGate>` with the literal key (LESSONS#0078). The route's `canAccess(tier, 'feature_game_decompression')` is the load-bearing server check; the entry sheet wraps its AI-recommendation success block in `<UpgradeGate feature="feature_game_decompression">`.
- 2026-06-05 [implementation-dev] Surname post-processor uses literal space (LESSONS#0061): the AI `why` line is scanned with `/[A-Z][a-z]+ [A-Z][a-z]+/` (NOT `\s+`) so a labelled-key newline in the prompt body never false-positives.
- 2026-06-05 [implementation-dev] E2E seed UUID range picked: `0000000000d0`-`0000000000d3` is free (existing range `0000000000c0`-`0000000000c1` is sub-handoff observer tokens; `0000000000e0`-`0000000000e1` is drill-shares; `0000000000f0`-`0000000000fb` is player-trajectory). The decompression seed re-uses the existing E2E game session at `0000000000c1` (the 0067 sub-handoff seed already pins it) and pre-mints a decompression row at `0000000000d0` with a known transcript and pre-canned recommendation.
