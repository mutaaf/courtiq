---
id: 0062
title: When the coach has been capturing all season but hasn't said a single word about Maya in 8 days, nudge them with her name — not the whole roster
status: groomed
priority: P1
area: capture
created: 2026-06-01
owner: product-groomer
---

## User story

As a volunteer coach who's been capturing notes on the loud kids and the kids whose parents
ask the most questions, but who has gone 8 days without writing a single observation about
Maya — the quiet kid in the corner who never gets the attention she deserves — I want one
short notification on Thursday evening naming JUST her ("you haven't said anything about
Maya in 8 days — 15-second voice note?") with a one-tap deep-link straight into Capture
focused on her, so that the silent half of my roster doesn't keep being silent and so the
moment I find 15 seconds between dinner and the kids' bedtime is the moment I actually use
them.

## Why now (four lenses)

### Product Owner
The product has shipped TWO coach-targeted retention surfaces today and both are too coarse.
0042 sends a "still coaching?" check-in at 14 days of TOTAL coach silence — it catches the
coach who has stopped using the product entirely. 0023 sends the Monday digest of the
PREVIOUS week of the coach's activity — it's a report, not a call to action. NOTHING in the
shipped backlog catches the much more common failure mode that destroys the per-player
value: the coach is ACTIVELY using the product, capturing 12 notes a week, but those 12
notes are all about the same 4 loud kids. By Week 6 the quiet half of the roster has
near-zero coverage and the per-player artifacts (parent report, spotlight, trajectory 0061)
have nothing to say. The smallest meaningful unit of value is a cron that fires once a week
(Thursday evening), for each ACTIVELY-CAPTURING coach (had any observation in the last 7
days), finds the SINGLE player on each active team with the longest gap since their last
observation (and at least 8 days of gap), and sends ONE short email naming THAT KID. ONE
notification per coach per week, ONE player named, ONE deep-link to Capture pre-focused on
that player. Reuses the existing `coaches.preferences` opt-out pattern (0058 / 0042).

### Stakeholder
This is the SINGLE retention surface most likely to move the per-player-coverage metric —
the metric that underpins every artifact moat the product has. Three moat compoundings,
all distinct from anything shipped. (1) The artifact-completeness moat — the parent
report (0016), the spotlight (0009), the per-player trajectory (0061 once it lands), the
season recap (0017): EVERY downstream artifact gets materially better when the silent
half of the roster has observations. The current "captures the loud kids" failure mode is
the bottleneck on every single downstream surface; this ticket attacks it directly.
(2) The fairness moat — a coach who consistently captures EVERY kid is the coach whose
parents trust the product, and the parent trust loop is the source of acquisition (0019,
0050) and retention. A coach who burns out by Week 6 because parents of quiet kids start
asking why their reports are thin is a coach the product loses. (3) The
non-creepy-precision moat — this is the product proving it knows the COACH'S OWN ROSTER
without ever surfacing minor data publicly. The notification body names Maya's first name
(coach-authored, on a coach's own team, in a coach-only email) — it is the kind of
specific knowledge a forms-app cannot replicate because it lacks the per-player
observation history to know who has been silent.

### User (the coach, Thursday 7:38pm, on the couch between dinner and bedtime)
She opens email. Subject: "You haven't said anything about Maya in 8 days." The body is
short: "Maya is on the Hawks. Last note about her — Apr 18 — was that she hesitated on
closeouts. 15-second voice note before tomorrow's practice?" One button: "Capture about
Maya." She taps. The app opens on `/capture?playerId=<maya>&via=silent-player-nudge`. The
Capture screen is already focused on Maya, the per-player capture memory (0025) renders
above the mic, the recorder is ready. She taps record, says one sentence about Maya's
shooting form she remembered from last practice, taps save. Total interaction: 22 seconds.
If she has the opt-out preference set, no email. If her account is paused (0042), no
email. If EVERY player on every team has been observed in the last 8 days (the goal
state), no email — silence beats a manufactured nudge. If the coach has TWO active teams,
the email picks the team where the most-silent-player gap is the LONGEST, and names ONE
player only.

### Growth
The "show me" moment is the email itself — short, specific, named for ONE quiet kid on
HER own roster. That is the screenshot a coach forwards to her assistant saying "look how
specific this is — it knew which kid I was missing." Compounds three ways. (1) The
Thursday-evening cadence locks in a SECOND coach-active moment beyond Sunday-night plan
(0058) and Monday-morning digest (0023) — three coach-active touchpoints a week without
any single one feeling spammy. (2) Every silent-player observation captured downstream of
this nudge is a NEW per-player data point that powers the artifact graph; the loop's
unique-data accumulation rate compounds. (3) The deep-link drops the coach into Capture
where the per-capture-memory-AI surface (0025) is the existing free-quota-consumer that
ramps into the AI-usage upgrade gate (0008 / 0035) — coaches who use Capture more often
are coaches who convert. Distinct from every shipped retention surface: 0023 is a report;
0042 is a pause-or-stay; 0058 is plan-finish; THIS is the per-PLAYER call to action, the
only one of its kind.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `POST /api/cron/silent-player-nudge` (new) protected by the existing `CRON_SECRET`
  env var (mirror `src/app/api/cron/practice-reminder/route.ts` auth header). Vercel Cron
  schedule: Thursdays 19:00 UTC (≈3pm Eastern, late afternoon Pacific — same posture as
  the existing crons; per-coach timezone resolution is out of scope for v1 — see Out of
  scope). Mirror the practice-reminder cron's batched pagination (`BATCH_SIZE = 50`).
  For each candidate coach: (a) the coach is not paused per 0042 (`coaches.paused_until`
  is NULL or in the past), (b) `coaches.preferences.disable_silent_player_nudge !== true`,
  (c) the coach has at least ONE observation in the last 7 days (the coach IS actively
  capturing — this is the WHOLE point; a totally-silent coach is handled by 0042 / 0058),
  (d) the coach has at least one ACTIVE team with at least ONE active player who has not
  been observed in 8+ days. On send, set a `coaches.preferences.silent_player_nudge_<ISO-
  week>` bookmark so the same coach is not re-emailed the same week. Reports
  `{ sent, skipped, errors }` (same response shape as the other crons). (vitest: 401 on
  missing secret; paused coach is SKIPPED; opted-out coach is SKIPPED; coach with no
  observations in 7 days is SKIPPED; coach where every player has been observed in the
  last 7 days is SKIPPED; happy path sends ONE email and writes the bookmark; second
  invocation the same week SKIPS the same coach.)
- [ ] Player selection logic: for each candidate coach, the route picks ONE player ONLY.
  Logic: (i) for each active team the coach is head coach of (via `team_coaches` —
  LESSONS#0057), find the player with the longest gap since their last observation
  (`max(observed_at) for each active player`, then pick the player whose max is oldest);
  (ii) if that player's gap is < 8 days, the team is excluded; (iii) across remaining
  teams, pick the team where the longest-silent-player's gap is LONGEST overall; (iv)
  name THAT player and THAT team in the email. If multiple teams tie, pick the team with
  the most recent coach-activity (the team the coach has been working on most). A player
  with ZERO prior observations counts as a gap equal to "since the player was added to
  the team," and qualifies if that's >= 8 days. (vitest: a 1-team coach with players gap
  ranks [11d, 5d, 12d] picks the 12d player; a 2-team coach with [team A: 9d, team B:
  20d] picks team B's 20d player; a coach whose longest-silent gap is 5 days is SKIPPED;
  a zero-observation player who was added 10 days ago qualifies.)
- [ ] The email subject names the player and the gap. Format:
  `"You haven't said anything about <First Name> in <N> days."` (where N is the
  player's gap rounded down). Plain text fallback included. Voice contract: NO AGENTS.md
  banned word in subject OR body per LESSONS#0023 (instruct positively in the template;
  there is no AI call here; this is a structured template). The first name is
  `players.name.split(' ')[0]` — never the full name. (vitest:
  `buildSilentPlayerNudgeEmail({ playerFirstName, gapDays, teamName, deepLinkUrl,
  referralCode, unsubscribeUrl })` for each fixture — gapDays=8, gapDays=20, full-name-
  has-no-space fallback; banned-word scan on every output.)
- [ ] The email body has FIVE elements ONLY: the player-and-team header, the player's
  most-recent prior observation (`"Last note about her — <date> — was that <text>"`,
  truncated to 120 chars with ellipsis if longer), a ONE-line nudge ("15-second voice
  note before tomorrow's practice?"), ONE CTA button "Capture about <First Name>" deep-
  linking to `/capture?playerId=<id>&via=silent-player-nudge`, the existing footer
  with referral code (0021 pattern) + unsubscribe (from `src/lib/email/layout.ts`).
  If the player has zero prior observations, the second line reads "First note about
  <First Name> — 15-second voice note before tomorrow's practice?" — never a hollow
  "(no prior observation)" string. (vitest: rendered HTML contains exactly the named
  elements; CTA href contains the playerId + `via` param; footer contains the coach's
  referral code; the zero-prior-observation case renders the alternate second line.)
- [ ] Deep-link landing: `/capture?playerId=<id>&via=silent-player-nudge` opens
  `/capture` with the named player as the focused-player and the recorder ready. If
  the player doesn't exist or doesn't belong to a team the caller is on, the page
  falls back to the default Capture state (no error toast — LESSONS#0036's quiet-state
  pattern). The `via=silent-player-nudge` param is read once and discarded; it is NOT
  persisted to observations. The page already renders the per-player capture memory
  (0025) — that surface picks up the player automatically; this ticket adds NO new UI
  on the Capture page. (vitest: `?playerId=<id>` on /capture focuses the named player;
  a player not on the caller's team falls back silently; the `via` param is read but
  not written to any observation.)
- [ ] Tier / feature gating: the EMAIL itself is universal (free + paid). The cron
  sends to every active-capture coach regardless of tier. The deep-link's Capture
  surface is universal. NO new tier feature key is added — this is a habit-formation
  surface, not a paid feature. The per-capture-memory load (0025) at the Capture
  surface respects the EXISTING free-tier AI quota wall (0035's `<UpgradeGate>` is the
  existing pattern); a free coach in their last AI call of the month sees the existing
  upgrade gate AT the capture-memory line, NOT at the email or the page open. (vitest:
  a free-tier coach receives the email; a paid-tier coach receives the email; both
  can tap the CTA; the existing 0025 quota wall fires as before; the new route does
  NOT import `tier.ts`.)
- [ ] Per-coach opt-out: a new key `disable_silent_player_nudge: boolean` on
  `coaches.preferences` (NO migration — the existing jsonb absorbs the key, same
  posture as 0058's `disable_planning_prompts`). Coaches can flip it from the existing
  settings page — add ONE toggle row mirroring 0058's "Sunday planning prompt" row.
  POST to the existing preferences-update endpoint with the new key. The cron reads
  the key and skips on `=== true`. (vitest: the cron skips an opted-out coach; the
  settings page renders the new toggle; tapping the toggle POSTs the new key to the
  existing endpoint.)
- [ ] Privacy / COPPA: the email body contains the player's FIRST NAME (coach-
  authored) and the previous observation's TEXT (coach-authored), plus the team name
  and the player's id in the deep-link URL. The body NEVER contains the player's
  full name, DOB, jersey number, parent_email, parent_phone, medical_notes, or any
  other field. The cron's `.select()` calls are asserted against an allow-list in the
  test (LESSONS#0036's COPPA-allow-list pattern from the 0036 wrap-card route). The
  email is sent ONLY to the COACH's email — never to the parent. (vitest: planted
  full-name / DOB / medical-notes rows do NOT appear in the rendered email; the
  cron's `.select()` keysets are explicit allow-lists; the From and To addresses
  are asserted.)
- [ ] Voice contract: every user-facing string the dev adds (the email subject + body
  + CTA + alternate-second-line, the new settings-toggle label) contains NO AGENTS.md
  banned word per LESSONS#0023. Instruct POSITIVELY in the template; never enumerate
  the banned tokens. (vitest: scan `buildSilentPlayerNudgeEmail` output for the
  banned list; scan the new settings-toggle component's rendered text.)
- [ ] Rate-limit: at most ONE email per `(coach_id, ISO-week)` enforced by the
  preferences bookmark. The cron is idempotent — a second invocation the same
  Thursday is a no-op for already-bookmarked coaches. Only ONE player is named per
  email even if multiple teams have multiple silent players. (vitest: a coach with
  3 silent players across 2 teams gets ONE email naming ONE player; a second
  invocation the same week sends zero new emails.)
- [ ] Failure handling: a send failure (SMTP error, missing email address) does NOT
  set the bookmark — the next invocation retries that coach. A coach with no email
  is counted as `skipped`, not `errors`. (vitest: a thrown sendEmail error leaves
  the bookmark unset; a coach without an email is counted as skipped.)
- [ ] Regression: the existing `/api/cron/practice-reminder`, `/api/cron/weekly-
  digest`, `/api/cron/weekly-parent-rollup`, `/api/cron/coach-quiet-check-in`,
  `/api/cron/sunday-plan-prompt` are byte-identical. The existing
  `coaches.preferences` jsonb consumers do NOT break on the new key. The existing
  /capture page rendering for a coach who navigates without `?via=silent-player-
  nudge` is byte-identical. (vitest: snapshot each existing cron's response shape
  against a fixture coach; assert no diff. /capture render without the new query
  param is byte-identical.)
- [ ] Seeded e2e on the 0006 fixture: seed extension is the EXISTING E2E player but
  with their LATEST observation timestamp backdated to `now() - interval '10 days'`
  (the seed already creates observations — re-stamp one row, do not add new players)
  AND a fresh observation for the seeded coach in the last 7 days (so the coach
  qualifies as "actively capturing"). UUIDs unchanged where possible (LESSONS#0101).
  Playwright spec: POST to the cron endpoint with the test CRON_SECRET, assert
  `sent: 1`; sign in as the E2E coach; navigate to `/capture?playerId=<seeded>&via=
  silent-player-nudge`; assert the focused player is the seeded one. Scope by
  `data-testid` per LESSONS#0081 / #0082. Add the new cron route to `publicPaths`
  in `src/lib/supabase/middleware.ts` in the SAME PR per LESSONS#0104 (Vercel Cron
  POSTs traverse the proxy). Skip when E2E creds are unset.

## Out of scope

- A nudge for EVERY silent player on every team (multi-player digest). v1 names ONE
  player per coach per week. A multi-player digest would over-fire and would not
  feel as specific; v1's tightness is the feature.
- SMS / push notifications. v1 is email-only. SMS / push need their own AGENTS.md
  approval line.
- Per-coach timezone resolution. v1 fires Thursday 19:00 UTC for all coaches.
  Per-coach timezone is a follow-up parallel to 0058's same out-of-scope item.
- A "snooze this player for 2 weeks" button. v1 has no per-player snooze; the
  coach can capture or not capture. A per-player snooze would surface as a soft
  signal the parent later learns about, which the trust model can't carry.
- Auto-generating an observation for the silent player. v1 requires the coach to
  capture; we do not invent a note in the coach's voice.
- A version that targets THE COACH's QUIETEST DAY of the week. v1 is Thursday-only
  for now (Thursday catches the gap before the weekend; Sunday is owned by 0058's
  plan-finish prompt).
- A program-director "your coaches' silent-player coverage" dashboard. v1 is
  coach-facing; a program-level rollup is a follow-up on top of this surface.
- A celebratory "you caught up — every kid has been observed in the last 7 days"
  email. The goal state is silence (no email when there are no silent kids); a
  celebration email would fire too often and dilute the cadence.

## Engineering notes

Files / patterns the dev should touch.

- NO new migration. Reuse `coaches.preferences` for the opt-out key + the per-week
  bookmark. No new tier feature key. Per LESSONS#0006 — if a parallel ticket lands
  a `056_*` migration first, this ticket adds none; the test asserts NO new migration
  files (`fs.readdirSync('supabase/migrations').length` is unchanged by this PR's
  diff).
- `src/lib/silent-player-utils.ts` (new) — pure helpers: `selectSilentPlayer(team,
  observations, today): { playerId, gapDays } | null`; `buildSilentPlayerNudgeEmail({
  playerFirstName, gapDays, teamName, lastObservationText, lastObservationDate,
  deepLinkUrl, referralCode, unsubscribeUrl }): { subject, html, text }`. NO DB
  access. Voice POSITIVELY per LESSONS#0023.
- `src/app/api/cron/silent-player-nudge/route.ts` (new) — `POST(request)`. Mirror
  `src/app/api/cron/practice-reminder/route.ts` byte-for-byte where applicable
  (auth header, batched pagination, error counting, bookmark pattern). Use
  `createServiceSupabase()`. The select-set on each `from()` is an explicit allow-
  list (LESSONS#0036 COPPA pattern).
- `vercel.json` — add the new cron entry under the existing crons array. Schedule:
  `'0 19 * * 4'` (Thursday 19:00 UTC). Coordinate with existing cron entries.
- `src/app/(dashboard)/account/page.tsx` or `src/app/(dashboard)/settings/profile/
  page.tsx` (existing — read first per 0058's note that the settings page lives at
  `/settings/profile`, not `/account`) — add ONE toggle row "Silent-player nudge"
  mirroring the existing 0058 "Sunday planning prompt" toggle. POST to the existing
  preferences-update endpoint with key `disable_silent_player_nudge`. NO new
  endpoint.
- `src/app/(dashboard)/capture/page.tsx` (existing — read first) — read
  `?playerId=<id>` from URL search params. If present AND the player belongs to a
  team the caller is on, focus that player on first render. The `?via=silent-
  player-nudge` param is read but not persisted to observations. Already-rendered
  per-player capture memory (0025) handles the rest — NO new UI on this page.
- `src/lib/supabase/middleware.ts` — add `'/api/cron/silent-player-nudge'` to
  `publicPaths` in the SAME PR per LESSONS#0104. Vercel Cron POSTs traverse the
  Supabase auth proxy; without the allow-list the cron 401s before the CRON_SECRET
  check runs.
- `tests/lib/silent-player-utils.test.ts` (new, `.test.ts` per LESSONS#0020 / #38)
  — selectSilentPlayer for the cases named in the AC; buildSilentPlayerNudgeEmail
  voice scan.
- `tests/api/cron-silent-player-nudge.test.ts` (new) — 401 missing secret; paused
  coach skipped; opted-out coach skipped; non-capturing coach skipped; happy path;
  idempotent re-invocation. Per LESSONS#0092 / #0100 — drain `mockReturnValueOnce`
  queues in `beforeEach` of any describe that extends shared from-chain mocks.
- `tests/components/account-preferences.test.tsx` (existing — read first) — extend
  to assert the new toggle row + its preferences-update dispatch.
- `tests/e2e/silent-player-nudge-flow.spec.ts` (new). Seed extension: backdate ONE
  existing observation; add ONE fresh observation in the last 7 days. UUIDs
  reused where possible per LESSONS#0101. Spec: POST to the cron endpoint with
  the test CRON_SECRET, assert `sent: 1`; sign in as the E2E coach; navigate to
  the deep-link; assert the focused player. Scope by `data-testid` per
  LESSONS#0081 / #0082. Skip when E2E creds are unset.
- New deps: NO. Migration: NO. Env vars: NO new (existing CRON_SECRET). AI prompt
  change: NO (no AI call on this path). Tier feature key: NO new key.
- LESSONS to anchor: #0006 (no parallel-prefix collision: this ticket has no
  migration), #0020 / #38 (.test.ts), #0023 (voice positively), #0036 (COPPA
  allow-list on .select()), #0042 (paused-coach filter via
  `coach-pause-utils.isCoachPaused` — reuse), #0049 / #0092 / #0100 (mock queue
  spillover when extending shared from-chains), #0055 (no-arg handler call
  posture in tests), #0057 (team_coaches not teams.coach_id), #0081 / #0082
  (data-testid + strict-mode collisions on shared substrings), #0084 / #0085 /
  #0086 / #0101 (seed posture), #0091 / #0104 (publicPaths for the new cron
  route — same family as 0058's `/api/cron/sunday-plan-prompt` allow-list add),
  #0096 (schema wins over prose — read the actual `observations` columns and
  `players.is_active` posture at pickup time).

## Implementation log

(Appended by the implementation-dev agent during execution.)
