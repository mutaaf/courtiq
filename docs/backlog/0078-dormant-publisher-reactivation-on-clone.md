---
id: 0078
title: When a dormant coach who published a drill last season gets cloned by a coach in a new program this week, send ONE honest email — "Sarah, your closeout drill was cloned by a coach in the Hornets program today" — that brings them back into SportsIQ on the strongest possible signal
status: shipped
priority: P1
area: onboarding
created: 2026-06-09
owner: product-groomer
---

## User story

As a volunteer coach who shipped twelve practice plans and published two
of them via 0049 / 0064 in the spring season, put SportsIQ down on May
14 when the season ended, and have not opened the app since, I want —
the first time a coach in a NEW program (one that did NOT clone my
plans in the spring) clones one of those published plans or drills in
the fall — to receive ONE honest email saying "Sarah, your closeout
drill was cloned by a coach in the Hornets program today — your work is
still travelling" with one button that deep-links me to my existing
0073 reputation milestone card on /home, so the moment that pulls me
back into SportsIQ in October is not a calendar nudge (0042) and not a
parent-driven signal (0072) but the strongest possible coach-side
reactivation signal: my work is being used in a real gym in a program I
have never been to.

## Why now (four lenses)

### Product Owner

The product has shipped three reactivation primitives — 0042 fires a
calendar nudge at 14 days quiet, 0036 fires a season-wrap card on the
coach's own calendar, 0072 fires a parent-driven signal when a returning
parent lands on the portal — and the 0073 reputation milestone card +
the 0076 stick signal both surface real reactivation moments INSIDE
the app. But the moment a publishing coach's drill OR plan is cloned by
a new program FIRES NO EMAIL — the milestone card waits for the
publishing coach to open the app, which a dormant coach by definition
will not. The smallest meaningful unit of value is: (a) extend the
existing 0042 dormant-coach cron pipeline (or add a sibling cron
`/api/cron/dormant-publisher-clone-nudge` — confirm naming at pickup
per LESSONS#0096) that reads every `coach_reputation_milestones` row
written in the last 24h where the published coach has been dormant
for >= 21 days (mirror the 0042 dormancy check), AND the milestone
fires only ONCE per dormant coach per 60-day window (anti-fatigue
contract — no daily ping); (b) send an email with the warm-cardboard
voice of 0042 / 0072 — the subject names the program ("Your closeout
drill was cloned by a coach in the Hornets program"), the body is
two short sentences, the SINGLE button deep-links to /home with a
`?milestone=<id>` query so the existing 0073 milestone card surfaces
on landing; (c) ONE write into a new `coach_clone_reactivation_signals`
table per dispatched email so the loop never re-fires the same
(coach, milestone) edge; (d) the email pull also fires when 0076
ships its first `stuck_1 / stuck_3 / stuck_8` milestone family —
which raises the bar to "a clone that stuck" not just "a clone"
once 0076 lands. NO new tier feature key (every published coach,
regardless of tier, gets reactivation pull on their published work),
NO public surface, NO AI generation.

### Stakeholder

This is the moat-deepening primitive that closes the dormant-
PUBLISHING-coach reactivation gap and turns the 0073 / 0076
clone-and-stick graph into a passive retention engine. Three
compoundings, all structurally hard for a forms-app competitor
because they require BOTH a cross-coach clone graph AND a dormancy
detector AND an honest email channel with anti-fatigue, all of which
the product has and competitors do not. (1) The dormant-publisher
retention moat — every published coach has already invested in
publishing a plan, which is the highest-effort act they take in the
product; the expected re-engagement delta from "your work was cloned
in a new program" is the strongest reactivation signal the product
can ship to the publishing-coach cohort because the signal is
strictly positive ("your work is travelling") and strictly verifiable
(a real clone happened in a real org). (2) The publish-loop self-
funding compound — every dormant publishing coach who comes back via
this signal is structurally more likely to publish another plan
within their first session back (the signal IS that publishing
works), which feeds 0073 / 0076 / 0075 with new published content,
which fires more clones, which fires more stick signals, which fires
more reactivations. (3) The acquisition compound when paired with
0073 — the existing 0073 publish-coach reputation milestone card
fires INSIDE the app; THIS surface fires the OUTSIDE-the-app channel
that brings the milestone-recipient back. Together they close the
publish-graph retention loop without any new content gate.
Distinct from 0042 (calendar-based dormancy nudge, no signal beyond
time), 0036 (season-wrap-up — the coach's OWN calendar), 0072
(returning-parent signal, a different edge type), 0073 / 0076 (the
in-app milestone surfaces). THIS is the EMAIL channel for the
publish-graph reactivation, the seam every other surface has left
open.

### User (the dormant publishing coach, Sarah, Thursday 7:42pm on her
phone, has not opened SportsIQ since May 14)

She is on the couch. Her phone buzzes. The subject line: "Sarah,
your closeout drill was cloned by a coach in the Hornets program."
She opens it. The body, in the existing 0042 cardboard-voice
posture: "You published your 'Live closeout 1-on-1' drill in
spring. A coach in the Hornets program just cloned it for their
team this week. Your work is still travelling." One button: "See
the details." She taps. She lands on /home with the existing 0073
milestone card already surfaced via the `?milestone=<id>` query.
She reads "Your closeout drill was cloned by a coach in the
Hornets program — that's the first time it travelled outside the
Hawks league." She closes the app feeling like the work she did in
spring did not end on May 14. Two weeks later, she opens SportsIQ
to start her fall season. The reactivation worked. She publishes
one more plan. The loop self-feeds. Email is rate-limited: the
next email fires no sooner than 60 days from this one (anti-
fatigue contract — even if her drill is cloned again next week,
she does not get a second email for 60 days; the in-app 0073
milestone card still fires as the in-product signal).

### Growth

The "show me" moment is the email inbox screenshot — a subject
line that names a specific program ("Hornets") and a specific
drill ("closeout") — the kind of email a coach FORWARDS to a
friend ("look — the app told me a coach in another program is
running my drill"). That forward is a fourth viral surface
(after 0050 / 0060 / 0065 parent-and-coach forwards and the
0010 / 0027 share cards). Compounds three ways. (1) The
dormant-publisher reactivation compound — every dormant
publishing coach is a high-LTV cohort the product has invested
in; the reactivation email's open-rate-and-conversion ceiling is
structurally higher than 0042's time-based nudge because the
signal is strictly positive AND strictly verifiable. (2) The
publish-loop compound — every reactivated publishing coach is
structurally more likely to publish again, which feeds the
0073 / 0076 / 0075 surfaces with new content. (3) The
referral-compound — a reactivated publishing coach who comes
back via this signal is structurally more likely to forward
the existing 0027 / 0049 / 0064 share card to a third
coach ("look what happened to my drill"), which fires more
acquisitions, which fires more clones, which fires more
emails like this. Distinct from every shipped surface because
every shipped reactivation surface either fires inside the
app (0073 / 0076) or fires on a generic calendar signal
(0042 / 0036). THIS is the first publish-graph-driven
email reactivation.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper
  `src/lib/dormant-publisher-clone-utils.ts`. Exports
  `selectDormantPublishersForClones(args: { milestones:
  Array<{ id: string; published_coach_id: string;
  milestone_kind: string; crossed_at: string;
  notified_at: string | null }>; coachLastSeen: Map<string,
  string>; reactivationSignals: Map<string, string>;
  dormancyDays?: number; cooldownDays?: number; nowMs:
  number }): Array<{ milestone_id: string;
  published_coach_id: string; milestone_kind: string }>`.
  The helper: (a) filters to milestones with
  `notified_at IS NULL` (the existing 0073 unconsumed
  contract); (b) filters to coaches whose
  `coachLastSeen[coach_id]` is `>= dormancyDays` days ago
  (default 21 — the dormancy floor; 0042 uses 14 but the
  publish-graph signal earns a higher bar to prevent
  over-firing); (c) filters to coaches whose
  `reactivationSignals[coach_id]` (the most recent
  reactivation email dispatch date) is `>= cooldownDays`
  days ago OR is absent (default 60 — the anti-fatigue
  bar); (d) returns the most-recent qualifying milestone
  per coach (one email per coach per cron run).
  Pure function, reads no DB. Per LESSONS#0023 — no
  free text; numbers. (vitest under `tests/lib/
  dormant-publisher-clone-utils.test.ts` — new): (i)
  empty inputs → empty result; (ii) an unconsumed
  milestone for a coach who logged in 2 days ago →
  excluded (NOT dormant); (iii) an unconsumed
  milestone for a coach dormant 30 days with NO prior
  reactivation signal → included; (iv) an unconsumed
  milestone for a coach dormant 30 days WITH a
  reactivation signal 10 days ago → excluded
  (cooldown); (v) two unconsumed milestones for one
  dormant coach → the MOST-RECENT crossed_at wins
  (one email per cron run); (vi) `notified_at != NULL`
  → excluded (the in-app card has already been seen);
  (vii) `dormancyDays` and `cooldownDays` overrides
  honored; (viii) deterministic across input order.

- [ ] A new migration
  `068_coach_clone_reactivation_signals.sql` adds
  `coach_clone_reactivation_signals (id UUID PRIMARY
  KEY DEFAULT gen_random_uuid(), published_coach_id
  UUID NOT NULL REFERENCES coaches(id) ON DELETE
  CASCADE, milestone_id UUID NOT NULL REFERENCES
  coach_reputation_milestones(id) ON DELETE CASCADE,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (published_coach_id, milestone_id))`. Index:
  `(published_coach_id, dispatched_at DESC)` for the
  cooldown lookup. Per LESSONS#0006 — confirm `068`
  is the next free integer at pickup; bump if a
  sibling claimed it (0076 reserves `067`). Per
  LESSONS#0088 / #0114 — strip `--` comments AND
  the structural identifier names
  (`coach_clone_reactivation_signals`,
  `published_coach_id`, `milestone_id`,
  `dispatched_at`) before the banned-token sweep. NO
  column on any sacred table. (vitest under
  `tests/migrations/068-coach-clone-reactivation-
  signals.test.ts`: scan migration body with `--`
  stripped + identifier strip; column allow-list;
  UNIQUE constraint; index; NO new column on sacred
  tables.) Per LESSONS#0074 — bump the next-prefix
  sentinel test.

- [ ] A new (OR extended) cron route
  `/api/cron/dormant-publisher-clone-nudge/route.ts`
  (confirm naming at pickup per LESSONS#0096 — if
  the existing 0042 cron path is the right
  consolidation point, extend it instead; per
  LESSONS#0036 prefer the lowest-blast-radius
  extension). The route: (a) Bearer-token gated
  with `CRON_SECRET`; (b) reads
  `coach_reputation_milestones` rows where
  `crossed_at >= now() - 24h` AND `notified_at IS
  NULL`; (c) reads `coaches.id, email, last_seen_at`
  for the published coaches in that batch; (d)
  reads `coach_clone_reactivation_signals` for the
  cooldown lookup; (e) reads the milestone's
  PROGRAM NAME via `coach_reputation_milestones →
  the existing 0073 milestone-kind context payload`
  (the existing 0073 ticket records the program
  name in the milestone row OR derives it from the
  most recent stick / clone row — confirm at
  pickup); (f) calls
  `selectDormantPublishersForClones(...)`; (g) for
  each selected milestone, sends an email via the
  existing 0042 / 0072 mail pipeline (real path at
  pickup) with the subject + body templated to the
  milestone kind AND writes a
  `coach_clone_reactivation_signals` row (best-
  effort: a mail failure does not block the
  signal write OR the next batch item per
  LESSONS#0036); (h) per LESSONS#0058 — add the
  cron path to `publicPaths` in `src/lib/supabase/
  middleware.ts` (the supabase proxy intercepts
  /api/* otherwise; the existing 0042 cron has the
  same problem solved — mirror its publicPaths
  entry at pickup). Per LESSONS#0049 / #0092 /
  #0100 / #0110 — Glob `tests/api/cron*` AND
  `tests/api/dormant*` at pickup and extend every
  queue. Per LESSONS#0118 — when a route is
  guarded by a strict-whitelist
  `mockImplementation((table) => ...)` mock in
  sibling tests, broaden the whitelist to include
  the new tables in the same PR. (vitest under
  `tests/api/cron-dormant-publisher-clone-nudge.test
  .ts` — new): (i) one dormant coach with one
  unconsumed milestone → one email sent + one
  `coach_clone_reactivation_signals` row written;
  (ii) a non-dormant coach with an unconsumed
  milestone → no email; (iii) a dormant coach who
  was emailed 10 days ago → no email (cooldown);
  (iv) a dormant coach with TWO unconsumed
  milestones → ONE email (the most-recent
  milestone); (v) un-Bearer-token request → 401;
  (vi) a mail failure on one batch item does NOT
  block the next item (per LESSONS#0036 best-
  effort); (vii) planted DOB / parent_phone on
  players are NEVER read; (viii) the
  reactivation-signal row is idempotent on
  re-runs of the same cron in the same window
  (the UNIQUE constraint).

- [ ] A new pure helper
  `src/lib/dormant-publisher-clone-email.ts` (or
  extended into the existing 0042 / 0072 email
  template module — confirm at pickup). Exports
  `buildDormantPublisherCloneEmail(args: {
  publisherFirstName: string; milestoneKind: string;
  programName: string; drillOrPlanTitle: string;
  appUrl: string; milestoneId: string }): {
  subject: string; html: string; text: string }`.
  Subject + body templates per milestone_kind
  (initial set covers the existing 0073 kinds:
  `clones_3 / clones_10 / programs_2 / programs_4`,
  and once 0076 lands, `stuck_1 / stuck_3 /
  stuck_8`). The email body is two short
  sentences in the existing 0042 cardboard voice
  (read the 0042 template at pickup per
  LESSONS#0096; mirror its tone exactly). ONE
  button deep-links to `<appUrl>/home?milestone=
  <milestone_id>` so the existing 0073 milestone
  card surfaces on landing. The email NEVER
  names the cloning coach (consent posture —
  same as 0073's in-app card). Per LESSONS#0023
  — every copy variant positively instructed;
  banned-word matrix scan over every
  milestone-kind. Per LESSONS#0061 — defensive
  scans use literal spaces, not `\s+`. Per
  LESSONS#0063 — defensive substring scans like
  "should not contain the cloning coach's
  jersey/personal data" must scope to rendered
  shapes (`#23\b`, `jersey:\s+23\b`) NOT bare
  digits that may collide with dates. (vitest
  under `tests/lib/dormant-publisher-clone-
  email.test.ts` — new): (i) build for each
  milestone kind → subject + body contain the
  program name + the drill/plan title; (ii) the
  body never contains the cloning coach's name
  (planted in the input is filtered defensively);
  (iii) the deep-link URL is
  `<appUrl>/home?milestone=<id>`; (iv) the
  rendered text contains no AGENTS.md banned
  word for any matrix of milestone_kind /
  program_name / drill_title; (v) per
  LESSONS#0033 — for a multi-line/special-char
  email body, the test asserts each line
  delimiter-correctly (no shell-string mangling
  in the test fixture).

- [ ] Extend the existing /home page (real path
  at pickup per LESSONS#0096) so that when
  the URL carries `?milestone=<id>`, the
  existing 0073 `<CoachReputationMilestoneCard
  />` is scroll-anchored and the named
  milestone (looked up by id) renders FIRST in
  the cycle. The behavior is purely a deep-
  link affordance — the card mechanic is
  byte-identical; only the initial render
  index respects the query param. Per
  LESSONS#0027 — the deep-link initialization
  reads the query param as a SNAPSHOT in a
  use-effect with `[]` deps (or via Next's
  router hooks, depending on how /home is
  written — confirm at pickup); never put
  `phase` or `milestoneIndex` into the effect
  dep list. (vitest component test): (i)
  /home rendered with `?milestone=<id>` →
  the named milestone is the first card; (ii)
  /home rendered without the param → cycle
  starts from the most-recent milestone
  (the existing 0073 default); (iii)
  invalid `milestone` id → default behavior
  (no error, no broken render); (iv) the
  query param is consumed (no re-firing on
  re-renders).

- [ ] Tier / feature gating: NO new tier
  feature key. The email is dispatched
  regardless of the publishing coach's
  current tier (a free-tier coach who
  published in spring deserves the
  reactivation pull as much as a paid-
  tier coach — the email is not a feature
  to gate; it is a publish-graph
  consequence). The reactivation row +
  the in-app /home deep-link surface
  honor the existing 0073 tier posture
  (BYTE-IDENTICAL). (vitest: a free-tier
  publishing coach receives the email
  AND the deep-link works; a paid-tier
  publishing coach has the same
  experience.)

- [ ] Privacy / COPPA contract: the cron
  reads ONLY
  `coach_reputation_milestones`,
  `coaches.id / email / last_seen_at`,
  `coach_clone_reactivation_signals`,
  and the program-name lookup
  (organizations.name). NEVER reads
  `players`, `observations`,
  `parent_email`, DOB,
  jersey_number, medical_notes,
  photo URLs. The email body
  contains ONLY the publisher's
  first name + the cloning
  PROGRAM name + the cloned drill
  / plan title; NEVER the cloning
  coach's name, NEVER the cloning
  team's name. The deep-link
  carries only the milestone id —
  no PII in the query string. Per
  LESSONS#0036 — `.select()`
  allow-lists on every read. Per
  LESSONS#0088 / #0114 — the
  migration's COPPA scan strips
  `--` comments AND the
  structural identifier names.
  Per LESSONS#0072 — never
  `delete` a field on a DB-read
  object; spread to a new object
  if filtering is needed.
  (vitest: planted DOB /
  medical_notes / parent_phone
  on player rows are NEVER read
  by the cron; the email body
  contains no cloning-coach
  name; the deep-link URL
  contains no PII; the
  `program_name` aggregate never
  leaks a specific cloning
  team's name.)

- [ ] Voice contract: every new
  user-facing string (the email
  subject + body for every
  milestone kind, the "See the
  details" button label) contains
  NO AGENTS.md banned word per
  LESSONS#0023. Mirror the
  existing 0042 / 0072 voice
  (cardboard, honest, two
  sentences — read at pickup).
  The matrix scan covers every
  milestone kind shipped today
  (0073's) AND every milestone
  kind 0076 will ship (the test
  asserts on a registry of
  kinds, so 0076's milestones
  inherit the voice contract
  without a separate ticket).
  Per LESSONS#0023 — instruct
  positively; never enumerate
  the banned list inside any
  template. (vitest: render
  each email variant; scan
  rendered text; scan the
  matrix.)

- [ ] Regression: the existing
  0042 dormant-coach cron
  pipeline is BYTE-IDENTICAL on
  its happy path (if this
  ticket extends the existing
  cron, the new branch is
  additive try/catch-wrapped;
  the time-based nudge fires
  unchanged). The existing
  0072 returning-parent
  pipeline is BYTE-IDENTICAL.
  The existing 0073 in-app
  milestone card is BYTE-
  IDENTICAL when the URL
  carries no `?milestone=`
  param (the deep-link is
  additive). The existing
  /home page is BYTE-
  IDENTICAL on every other
  surface. (vitest: snapshot
  the named routes /
  components against seeded
  fixtures pre- and post-
  change.)

- [ ] Seeded e2e on the 0006
  fixture: seed extension is —
  pre-mint ONE dormant
  publishing coach with
  `last_seen_at` = 35 days
  ago (NOT the E2E sign-in
  coach — a SECOND coach in
  the E2E org), ONE
  `coach_reputation_milestones`
  row with milestone_kind =
  `clones_3` and
  `crossed_at` = 1h ago AND
  `notified_at IS NULL`,
  ONE pre-existing
  `drill_share` published by
  that coach with a clear
  title (e.g. "Live closeout
  1-on-1"). Pre-mint ONE
  cloning org with a known
  name ("Hornets"). Per
  LESSONS#0084 — seed in the
  idempotent DELETE-then-
  INSERT block; every new
  coaches row has a matching
  `auth.users` row. Per
  LESSONS#0101 — UUIDs in
  the next free range
  (after 0076's and 0077's
  reservations — confirm at
  pickup). Playwright spec
  + vitest hybrid (cron
  routes are not typically
  Playwright-tested because
  they require a CRON_SECRET
  invocation — mirror the
  existing 0042 / 0072
  cron-test posture at
  pickup): (a) invoke the
  cron via vitest with
  bearer auth and the seeded
  fixture, assert one email
  is queued with the seeded
  subject containing the
  program name AND drill
  title; (b) assert one
  `coach_clone_reactivation_
  signals` row is written
  with the right milestone
  id; (c) invoke the cron
  AGAIN immediately, assert
  zero new emails AND zero
  new signal rows (idempotent
  per the UNIQUE constraint
  AND the cooldown helper);
  (d) IF the existing 0072
  e2e spec already covers
  the /home deep-link
  navigation pattern,
  extend it; else add a
  small Playwright case
  that navigates to
  /home?milestone=<id>
  signed in as the seeded
  publishing coach and
  asserts the named
  milestone is the first
  card. Skip when E2E creds
  are unset. Per
  LESSONS#0058 — the cron
  path is added to
  `publicPaths` so the e2e
  POST (if any) doesn't 401
  at the proxy.

## Out of scope

- A DAILY reactivation push
  (more than one email per
  60-day window per coach).
  v1's `cooldownDays = 60`
  is the load-bearing anti-
  fatigue contract; lowering
  it is a separate ticket
  with its own ramp-and-
  open-rate hypothesis.
- A PUSH notification (in
  addition to the email).
  v1 is email only; push is
  a v2 ticket with its own
  device-token surface.
- AN SMS channel for the
  reactivation. v1 is
  email only; SMS is a
  separate ticket with its
  own consent + carrier
  posture.
- A REACTIVATION email for
  the CLONING coach
  (instead of the publisher).
  v1 fires only on the
  publishing side; the
  cloning-coach reactivation
  on a different signal is
  a separate ticket if data
  shows the seam matters.
- A RETROACTIVE sweep of
  historical milestones at
  ship time. v1 fires on
  FORWARD milestones only
  (the cron pulls last
  24h of `crossed_at`); a
  back-fill of older
  milestones is a separate
  cron-route ticket.
- An AI-generated email
  body. v1 is a template
  per milestone-kind; AI
  generation is a separate
  ticket with its own
  voice-anchoring contract
  (the existing 0070 voice
  anchoring is the
  starting point if so).
- A REPLY-TO surface on
  the email (allowing the
  publishing coach to
  reply and have the reply
  reach the cloning coach).
  v1 is dispatch only; a
  reply surface is a
  separate ticket with its
  own privacy posture.
- A SETTINGS toggle for
  the reactivation email
  ("turn off these
  emails"). v1 routes
  through the existing
  unsubscribe footer the
  0042 / 0072 emails ship
  (read at pickup); a
  dedicated toggle is a
  separate ticket.

## Engineering notes

Files / patterns the dev should
touch.

- `src/lib/dormant-publisher-
  clone-utils.ts` (new) — pure
  helper. Mirror the shape of
  `src/lib/coach-reactivation-
  utils.ts` (0072 — read at
  pickup per LESSONS#0096).
- `supabase/migrations/068_
  coach_clone_reactivation_
  signals.sql` (new). Per
  LESSONS#0006 — confirm `068`
  is the next free integer at
  pickup (latest as of write-
  time is 066; 0076 reserves
  067). Per LESSONS#0088 /
  #0114 — strip `--` comments
  + structural identifiers on
  banned-token scan.
- `src/types/database.ts` —
  add
  `CoachCloneReactivationSignal`
  type. NO field on any
  sacred type.
- `src/app/api/cron/dormant-
  publisher-clone-nudge/route
  .ts` (new) OR extension to
  the existing 0042 cron
  (confirm consolidation
  point at pickup per
  LESSONS#0096 — prefer the
  lower-blast-radius
  extension per LESSONS#0036
  / #0066 / #0112 / #0162).
  `POST(request)`, Bearer
  CRON_SECRET. Per
  LESSONS#0058 — add the
  cron path to
  `publicPaths` in
  `src/lib/supabase/
  middleware.ts` (or
  proxy.ts depending on the
  Next 16 shape — confirm at
  pickup). Per
  LESSONS#0049 / #0092 /
  #0100 / #0110 — Glob
  `tests/api/cron*` AND
  `tests/api/dormant*` at
  pickup; extend every
  queue. Per LESSONS#0118
  — broaden any sibling
  cron test's
  `mockImplementation((table)
  => ...)` whitelist to
  include the new tables.
- `src/lib/dormant-
  publisher-clone-email.ts`
  (new) OR extension to the
  existing 0042 / 0072
  template module (confirm
  at pickup). Mirror the
  cardboard voice exactly.
- `src/app/(dashboard)/
  home/page.tsx` (existing
  — read first per
  LESSONS#0096). Add the
  `?milestone=<id>` deep-
  link affordance to the
  existing 0073 milestone
  card. Per LESSONS#0027
  — careful with the
  effect dep list; read
  the query param as a
  snapshot, never put a
  `set`-controlled state
  value into the deps.
  Per LESSONS#0065 /
  #0066 / #0162 —
  smallest possible touch.
- The existing 0042 /
  0072 mail-dispatch
  pipeline (real path at
  pickup) — the new
  template plugs in
  without changing the
  dispatch contract; the
  existing 0072 read-only
  mocking pattern
  (LESSONS#0118)
  applies.
- `src/lib/tier.ts` — NO
  new feature key.
- `src/components/ui/
  upgrade-gate.tsx` — NO
  new registration.
- `src/lib/supabase/
  middleware.ts` (or
  proxy.ts) — add the
  new cron path to
  `publicPaths` if a
  new path lands; if
  this ticket extends
  the existing 0042
  cron path, no
  publicPaths change is
  needed.
- `tests/lib/dormant-
  publisher-clone-utils
  .test.ts` (new) —
  every helper case.
- `tests/lib/dormant-
  publisher-clone-email
  .test.ts` (new) —
  every email-template
  case.
- `tests/migrations/
  068-coach-clone-
  reactivation-signals
  .test.ts` (new).
- `tests/migrations/no-
  new-migration-XX.test
  .ts` — bump the
  next-prefix sentinel.
- `tests/api/cron-
  dormant-publisher-
  clone-nudge.test.ts`
  (new) — every cron
  case.
- `tests/api/home-
  milestone-deep-link
  .test.tsx` (new) —
  the deep-link
  initialization case
  on /home.
- `tests/api/cron*.test
  .ts` AND
  `tests/api/dormant*
  .test.ts` (existing —
  Glob at pickup per
  LESSONS#0110) —
  extend every
  `mockReturnValueOnce`
  queue AND broaden
  every `mockImplementation
  ((table) => ...)`
  whitelist. Per
  LESSONS#0116 — empty
  Glob is a no-op.
- `tests/e2e/dormant-
  publisher-clone-flow
  .spec.ts` (new, if a
  Playwright surface
  is exposed) — or
  fold into the
  existing 0042 /
  0072 e2e if that
  is the
  consolidation point.
  UUIDs in the next
  free range per
  LESSONS#0101.
- New deps: NO.
  Migration: YES (068
  or bump). Env vars:
  NO new (CRON_SECRET
  already exists per
  the existing crons).
  AI prompt change:
  NO. Tier feature
  key: NO new key.
- LESSONS to anchor:
  #0006 (prefix
  uniqueness), #0020
  / #38 (.test.ts),
  #0023 (positive
  voice; numbers
  spelled out; mirror
  existing 0042 /
  0072 voice exactly),
  #0027 (no
  set-controlled state
  in effect dep list
  for the deep-link
  initialization),
  #0029 / #0082
  (data-testid
  scoping on /home),
  #0033 (commit
  multi-line / special-
  char strings via
  heredoc, never bare
  -m), #0034 / #0088
  / #0114 (strip `--`
  comments AND
  structural
  identifiers on COPPA
  sweep), #0036 (best-
  effort cron + email
  pipeline; failure
  on one batch item
  does not block the
  next), #0049 /
  #0092 / #0100 /
  #0110 / #0118 (mock
  queue + whitelist
  spillover — Glob
  every cron / dormant
  test and broaden
  every
  mockImplementation
  whitelist), #0055
  (route handler call
  posture), #0058
  (cron path must be
  in `publicPaths`),
  #0061 (literal
  space on defensive
  scans), #0063
  (scope jersey-
  number assertions
  to rendered
  shapes, not bare
  digits, to avoid
  date-boundary
  collisions), #0065
  / #0066 / #0162
  (existing 0042 /
  0072 / 0073 cron
  + /home hotspots —
  smallest possible
  touch; prefer
  extension over
  new route), #0072
  (never `delete` a
  field on a DB-read
  object — spread to
  a new object),
  #0084 / #0101
  (seed posture; UUID
  range), #0096
  (schema wins over
  prose — at pickup
  read the actual
  0042 / 0072 cron
  pipeline + email
  templates + voice,
  the actual
  `coach_reputation_
  milestones`
  schema, the actual
  /home component
  shape, the actual
  `last_seen_at`
  column on coaches),
  #0103 (additive
  widening if any
  shared type is
  touched), #0112
  (extend the
  existing 0042
  cron if that has
  lower blast
  radius), #0116
  (Glob sweep that
  returns empty is
  a no-op), #0118
  (broaden sibling
  cron test
  whitelists to
  include new
  tables).

## Implementation log

- 2026-06-10 [implementation-dev] Picked up ticket; flipping to `in-progress`
  on a fresh branch off `origin/main` (commit `b8842c90`). Confirmed at pickup:
  - Next free migration prefix IS `068` — latest on `main` is `067_drill_clone_stick_signals.sql`
    (per `ls supabase/migrations/`); the sentinel `tests/migrations/no-new-migration-0076.test.ts`
    is pinned to 68 files and needs bumping to 69.
  - The supabase auth proxy lives in `src/lib/supabase/middleware.ts` (NOT
    `proxy.ts` per LESSONS#0058) — the existing 0042 cron path
    `/api/cron/coach-quiet-check-in` is NOT currently in `publicPaths`,
    but no e2e POSTs it today, so it has worked in production via Vercel
    Cron. If we extend this route (preferred per LESSONS#0036 / #0066 /
    #0112), no `publicPaths` change is needed; if we add a brand-new
    sibling cron, we will need to mirror `/api/cron/sunday-plan-prompt`.
  - **Consolidation point** = the existing 0042 cron route
    `src/app/api/cron/coach-quiet-check-in/route.ts`. It ALREADY houses
    the 0072 reactivation-email branch (a second top-level `try` block
    after the 0042 quiet-check-in branch); adding the 0078 publisher-
    reactivation branch as a THIRD top-level `try` block mirrors the
    existing posture exactly (best-effort, table-keyed mock-friendly,
    no `publicPaths` change). LESSONS#0036 / #0066 / #0112 prefer this
    over a new sibling route.
  - The 0042 email module exports `buildQuietCheckInSubject` / `buildQuietCheckInHtml`
    from `src/lib/coach-quiet-check-in-utils.ts`; the 0072 email module is a
    standalone file at `src/lib/coach-reactivation-email.ts`. We will
    follow the 0072 pattern — a new standalone module at
    `src/lib/dormant-publisher-clone-email.ts` — for cohesion with the
    helper file at `src/lib/dormant-publisher-clone-utils.ts`.
  - The /home page is at `src/app/(dashboard)/home/page.tsx` and renders
    `<CoachReputationMilestoneSection />` at line 1461 (the 0073 card).
    The card's `useQuery` reads `/api/coach/reputation-milestones`; we
    extend the section to accept an initial `?milestone=<id>` snapshot
    and pin that milestone first.
  - Seed UUID family — used range stops at `0...032e` (after 0077); next
    free range is `0...032f`+. We will use `0...032f`-`0...0334` for the
    0078 fixture rows (dormant publishing coach reuse via 0072's
    `...0d2`, plus new milestone + drill_share + cloning-org rows).
  - Glob sweep (LESSONS#0049 / #0092 / #0100 / #0110 / #0116):
    `tests/api/cron*` returns `coach-quiet-check-in.test.ts`,
    `coach-quiet-check-in-reactivation.test.ts`,
    `cron-pause-skip.test.ts`, `refresh-drill-sequences.test.ts`,
    `silent-player-nudge.test.ts`, `sunday-plan-prompt.test.ts`,
    `weekly-parent-rollup.test.ts`. The 0042 + 0072 tests are
    table-keyed `mockImplementation((table) => ...)` whitelists —
    per LESSONS#0118 we extend the whitelist to return empty chains
    for the new tables (`coach_reputation_milestones`,
    `coach_clone_reactivation_signals`, `drill_shares`, `drills`,
    `organizations`, `team_coaches`, `teams`) so the existing
    happy-paths stay byte-identical. `tests/api/dormant*` returns
    EMPTY — documented as a no-op sweep per LESSONS#0116.
