---
id: 0072
title: When a parent whose kid's coach has been dark 30+ days lands on the parent portal for their NEW team in the fall, tell the dormant coach by name — "Liam's mom is back, she's looking at SportsIQ for fall"
status: groomed
priority: P1
area: onboarding
created: 2026-06-07
owner: product-groomer
---

## User story

As a volunteer coach who ran a U10 girls basketball team in the spring,
shipped twelve parent reports, then put SportsIQ down when the season
ended in May and have not opened the app since, I want to be told —
when one of MY old parents (Liam's mom, who got 12 reports from me in
spring) lands on the parent portal of her OTHER kid's NEW fall team and
sees that the fall coach is ALSO on SportsIQ — that SHE has come back
to the product, by name and by which of my old kids she's connected to,
so the moment that pulls me back into SportsIQ is not a generic "still
coaching?" email (the existing 0042 nudge) but a specific human signal:
"the parent who hugged you on the last day of spring season is back in
the product this week."

## Why now (four lenses)

### Product Owner

The product has shipped two adjacent surfaces that bracket but do not
fill the dormant-coach reactivation seam. (1) 0042 ships the EMAIL-
based "still coaching this season?" check-in for a coach who has been
quiet 14 days — a TIME-based nudge that fires on every dormant coach
regardless of whether there is any new signal about them. (2) 0036
ships the season-wrap-up card on `/home` that pulls the coach back at
season end with a one-tap "start next season" — a CALENDAR-based
nudge tied to the coach's OWN season cycle, not the parent's. What is
MISSING is the PARENT-DRIVEN reactivation primitive — the moment a
PARENT who lived the value of the coach's reports in season 1 shows up
on a season 2 surface, the coach who BUILT that parent's trust gets a
specific signal that their old work has a new audience. The smallest
meaningful unit of value is: (a) a new pure helper
`detectReturningParentForDormantCoach(parentEmail, currentTeamId)` that
walks `players` for any OTHER row carrying the same `parent_email` on
a DIFFERENT team whose head coach hasn't logged an action in `>= 30`
days (read `coaches.updated_at` as the freshness proxy, mirror the
existing 0042 quiet-coach detection at pickup per LESSONS#0096); (b)
a new `coach_reactivation_signals` row written by the existing
parent-portal token GET path when the parent who is opening the new
team's portal matches a dormant coach on an OLD team; (c) a tiny
notification surface on the dormant coach's `/home` the next time they
open the app (and an honest, low-frequency email through the existing
0042 cron pipeline) reading "Liam's mom (Liam, on your spring Hawks)
opened the parent portal of her other kid's team this week" with a
single button: "See how Liam did in spring" (deep-links to the
coach's existing 0061 player-trajectory surface for Liam). The signal
is COACH-AUTHORED data crossing seasons; it does not collect anything
new on the parent or the kid. NO new tier feature key, NO AI
generation, NO public surface. ONE migration, ONE pure helper, ONE
write inside the existing token GET, ONE `<ReturningParentCard />` on
the home surface.

### Stakeholder

This is the moat-deepening primitive for the dormant-coach
reactivation surface and the structurally hardest reactivation
signal a forms-app competitor can replicate because it requires
THREE cross-coach data accumulations the product has and competitors
do not. (1) The parent-email cross-roster graph — `players.parent_email`
exists across every team a coach has ever run, AND across teams the
coach has NEVER run (their old parents' OTHER kids). This is the
load-bearing edge that 0050 / 0060 use for parent-side acquisition;
this ticket uses it for the INVERSE flow — coach reactivation. (2)
The Practice-Arc cross-season memory — 0034 / 0061 / 0070 give the
returning coach an immediate artifact ("here's what Liam was working
on") the moment they tap the deep-link, so the reactivation is not
"open the app and find nothing" but "open the app and see the kid
you remember." (3) The dormant-coach retention compound — the 0042
14-day email nudge fires on the calendar; this fires on a HUMAN
signal that has already-revealed the product's value. The expected
re-engagement delta is the highest the product can ship on the
dormant-coach cohort because the signal is the highest-trust shape:
"your old parent is back." Distinct from 0042 (time-based, no parent
signal), 0036 (the coach's own calendar), 0050 (parent → director),
0060 (parent → other kid's coach), 0019 (parent → self-signup as
coach), 0029 (observer → coach), 0034 (parent report cross-season
for one kid), 0061 (returning player one-screen recap). THIS is the
DORMANT-coach reactivation triggered by a RETURNING-parent signal —
an edge the product has never used in this direction.

### User (the dormant coach, Sarah, Wednesday 8:12pm, three weeks
into fall, has not opened SportsIQ since May 14)

She gets a notification on her phone — not a daily nudge, not a
weekly digest, but a single email subject line: "Liam's mom is
back on SportsIQ this week." She opens it. The body is two short
sentences: "You coached Liam on the spring Hawks. His mom opened
the parent portal of his sister's fall team last night — they're
on a Hornets team that uses SportsIQ too. Want to see what Liam
was working on at the end of spring?" One button: "See Liam's
season." She taps. She lands on Liam's existing 0061 player-
trajectory surface — the one-screen "Liam in week 1 / Liam in
week 12" recap from the spring season she actually coached. She
remembers him. She thinks about whether she's going to coach in
spring next year. She does not open the app again that week —
but the seed is planted, by name. Two weeks later her fall
season starts and she comes back.

### User (the parent, Linda, Tuesday 9:14pm, just opened her
DAUGHTER Maya's fall parent portal for the first time)

She does not see anything. The reactivation signal is fired on
the BACKEND from her parent_email matching `players.parent_email`
on her son Liam's old spring team, and it is COMPLETELY INVISIBLE
to her — no "you triggered an alert" surface, no "we noticed
you" copy, no behavioral tracker on the parent side. She reads
Maya's report. She closes the tab. The parent surface is byte-
identical to today. The minor-data contract is unchanged: no
new collection on Linda, no new collection on Liam, no new
collection on Maya. Only the COACH-authored edge (her email
was on Liam's row because Coach Sarah typed it in last spring,
and her email is on Maya's row because Coach Hornets typed it
in last week) is read, and only by the coach who already had
that edge.

### Growth

The "show me" moment is the DORMANT COACH'S phone — the email
subject line "Liam's mom is back on SportsIQ this week" that
pulls them back into the app on the strongest re-engagement
signal a youth-sports product can ship. That subject line is
the screenshot a re-engaged coach forwards to another dormant
coach in the same league with "this is the only nudge I've
gotten from a coaching app that wasn't a calendar alert." It
compounds three ways. (1) The reactivation pull — every
returning parent recovers one dormant coach (rough hypothesis,
data TBD; the lever is the parent-side signal density, which
scales with every new team that adopts the parent portal). (2)
The cross-season Practice-Arc compound — every re-engaged coach
hits the existing 0061 trajectory surface, which is the
strongest "the product remembers things I forgot" artifact the
product ships; the cross-season memory is the reactivation
content. (3) The cross-program acquisition compound — when the
dormant coach comes back AND signs their new fall team up, the
parent-email graph picks up another edge for the next
reactivation. Distinct from every shipped surface because every
shipped reactivation surface is COACH-CALENDAR-based; THIS is
parent-driven. Distinct from every shipped parent-side surface
because every shipped parent-side surface points the parent
AWAY from their original coach; THIS points the parent's signal
back TOWARD their original coach without telling the parent it
did.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `064_coach_reactivation_signals.sql` adds
  the table `coach_reactivation_signals (id UUID PRIMARY KEY
  DEFAULT gen_random_uuid(), dormant_coach_id UUID NOT NULL
  REFERENCES coaches(id) ON DELETE CASCADE, prior_team_id UUID
  NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  prior_player_id UUID NOT NULL REFERENCES players(id) ON
  DELETE CASCADE, returning_parent_email_hash TEXT NOT NULL,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), notified_at
  TIMESTAMPTZ NULL, consumed_at TIMESTAMPTZ NULL, UNIQUE
  (dormant_coach_id, prior_player_id))`. Indexes:
  `(dormant_coach_id, fired_at DESC) WHERE consumed_at IS
  NULL` for the home-card lookup; `(notified_at) WHERE
  notified_at IS NULL` for the email cron lookup. The
  `returning_parent_email_hash` column stores a SHA-256 hash
  of the lowercased parent email, NEVER the plaintext (the
  edge is verified by re-hashing at read time; the COPPA
  contract is "no new readable PII on the dormant-coach
  reactivation surface"). NO column on `coaches`, `players`,
  `teams`, `observations`, `plans`. Per LESSONS#0006 — at
  pickup confirm `064` is the next free integer; bump if a
  sibling claimed it. Per LESSONS#0088 — strip `--` comment
  lines before the no-banned-token / no-minor-field scan.
  Per LESSONS#0114 — the migration's COPPA scan strips the
  structural identifier `returning_parent_email_hash` (its
  VALUE space is a hash, not minor data) before the banned-
  token sweep. (vitest under `tests/migrations/064-coach-
  reactivation-signals.test.ts`: scan migration body with
  `--` stripped + structural identifier stripped; column
  allow-list; both indexes; UNIQUE constraint; NO new
  column on any sacred table; the hash column type is
  TEXT, never the plaintext email.)

- [ ] A new pure helper `src/lib/coach-reactivation-utils.ts`.
  Exports `findDormantCoachesForReturningParent(args: {
  parentEmail: string; currentTeamId: string; coachRows:
  Array<{ id: string; updated_at: string }>; priorPlayerRows:
  Array<{ id: string; team_id: string; parent_email: string |
  null; team_coach_id: string }>; nowMs: number }):
  ReactivationCandidate[]`. The helper: (a) lowercases +
  trims the parent email; (b) walks the prior-player rows for
  any whose `parent_email` lowercased equals the input AND
  whose `team_id` does NOT equal the current team; (c) maps
  each match to its team's head coach via the
  `team_coach_id` field; (d) filters to coaches whose
  `updated_at` is `>= 30 * 86400 * 1000` ms before `nowMs`
  (the dormant threshold; mirrors the 0042 14-day threshold
  but with a longer window because the parent-signal is
  rarer than the time-signal and a 14-day coach is not
  necessarily "dormant in the off-season" sense); (e)
  returns `{ dormantCoachId, priorTeamId, priorPlayerId,
  priorPlayerFirstName, parentEmailHash }` per match. Pure
  function, reads no DB. Per LESSONS#0023 — does NOT scan
  the parent first name (the parent first name is never
  rendered in the dormant-coach surface — only the prior
  PLAYER's first name and the relationship "<player's
  first name>'s parent" is rendered). Per LESSONS#0061 —
  uses a literal space, not `\s+`, on any defensive scan.
  (vitest under `tests/lib/coach-reactivation-utils.test.ts`
  — new): (i) no prior players → empty; (ii) prior player
  but coach was active 5 days ago → empty (not dormant);
  (iii) prior player + coach dormant 35 days → one match;
  (iv) prior player on the CURRENT team → filtered (the
  parent has not crossed seasons; same coach); (v) prior
  player whose parent_email is null → filtered; (vi) two
  prior coaches dormant → two matches; (vii) case-
  insensitive email match; (viii) the returned
  parentEmailHash is a SHA-256 of the lowercased email,
  never the plaintext.

- [ ] Extend the existing parent-portal token GET path (read
  at pickup per LESSONS#0096 — likely
  `src/app/api/share/[token]/route.ts` per the existing
  parent-share surface; if the GET path is a server
  component at `src/app/share/[token]/page.tsx`, mount the
  detection there in the server-side `getShareData()`
  callsite). The extension: (a) on a SUCCESSFUL parent-
  portal token resolution, read the resolved player's
  `parent_email`; (b) if `parent_email` is non-null, fire a
  best-effort BACKGROUND call to the new helper
  `findDormantCoachesForReturningParent` (the parent's
  page render NEVER waits on the call — per LESSONS#0036
  best-effort, a failure is a silent no-op); (c) for each
  candidate, UPSERT a `coach_reactivation_signals` row on
  the UNIQUE `(dormant_coach_id, prior_player_id)` key
  with `fired_at = NOW()` (a re-visit by the same parent
  on the same other-team does NOT spam a new signal — the
  UPSERT is idempotent; a signal already consumed stays
  consumed). The parent page render is BYTE-IDENTICAL —
  no UI change, no new prop, no new copy. The extension
  is INVISIBLE to the parent. Per LESSONS#0049 / #0092 /
  #0100 / #0110 — the GET path gains a new `from()` chain
  (the prior-player read scoped by parent_email); Glob
  `tests/api/share*.test.ts` AND `tests/app/share*.test.ts`
  at pickup and extend every `mockReturnValueOnce` queue.
  Per LESSONS#0112 — if the existing token GET already
  does a `from('players').select(...)` read for the
  resolved player, check whether the EXISTING read can be
  widened to subsume the new prior-player read; if no
  (the new read is filtered by `parent_email`, not by
  `id`), a second from() call is the right shape.
  (vitest under `tests/api/share-returning-parent.test.ts`
  — new): (i) a parent whose email matches a prior player
  on another team with a dormant coach → one
  `coach_reactivation_signals` row inserted; (ii) the
  SAME parent re-visiting → no second row, the UPSERT is
  idempotent; (iii) a parent whose email matches nothing
  → no row inserted; (iv) the parent-page render's
  response payload is BYTE-IDENTICAL to today (no new
  field); (v) a query failure on the prior-player read
  → 200 on the page render, no signal row, no surfaced
  error (best-effort posture per LESSONS#0036); (vi)
  planted DOB / medical_notes / parent_phone on the
  prior-player row are NEVER read by the route's
  `.select()` allow-list per LESSONS#0036.

- [ ] A new `GET /api/coach/reactivation-signals` (new,
  authed) returns the caller coach's unconsumed
  reactivation signals from the last 14 days, joined with
  the prior player's first name AND the prior team's name.
  The route: (a) verifies the caller is authenticated;
  (b) reads
  `from('coach_reactivation_signals').select('id,
  prior_team_id, prior_player_id, fired_at').eq(
  'dormant_coach_id', user.id).is('consumed_at', null).gte(
  'fired_at', now - 14d)` (allow-list per LESSONS#0036);
  (c) reads `from('players').select('id, name').in('id',
  priorPlayerIds)` (allow-list — NEVER reads parent_email,
  DOB, medical_notes); (d) reads
  `from('teams').select('id, name').in('id',
  priorTeamIds)` (allow-list); (e) returns the joined
  shape `{ signals: Array<{ id, priorPlayerFirstName,
  priorTeamName, firedAt }> }`. The route NEVER returns
  the parent's email, hashed or not. (vitest under
  `tests/api/coach-reactivation-signals.test.ts` — new):
  (i) an authed coach with 2 unconsumed signals → 200
  with both, joined; (ii) consumed signals are
  excluded; (iii) signals older than 14 days are
  excluded; (iv) an unauthed caller → 401; (v) the
  response payload contains NO parent email (hashed
  or plaintext); (vi) planted DOB / parent_phone on
  the joined player row are NEVER read.

- [ ] A new `POST /api/coach/reactivation-signals/consume`
  (authed) takes `{ signalId: UUID }` and stamps
  `consumed_at = NOW()` after verifying the signal
  belongs to the caller. (vitest): (i) the caller's
  own signal → 200 + row consumed; (ii) someone else's
  signal → 403; (iii) unknown signalId → 404; (iv)
  unauthed → 401.

- [ ] A new `<ReturningParentCard />` mounted on
  `/home` (existing — read at pickup per LESSONS#0096)
  ABOVE the existing 0036 season-wrap card when one or
  more unconsumed signals are present. The card renders:
  "<priorPlayerFirstName>'s parent is back on SportsIQ
  this week — they opened a parent portal for their
  other kid's team. Want to see how <priorPlayerFirstName>
  finished the season with you?" plus ONE button: "See
  <priorPlayerFirstName>'s season" — which deep-links to
  the existing 0061 player-trajectory surface for that
  player (`/players/[priorPlayerId]/trajectory` — read
  the exact path at pickup per LESSONS#0096). The card
  also has a tiny "Got it" button that POSTs the consume
  endpoint and hides the card. When the signals list is
  empty, the card is ABSENT (silence beats nag per the
  existing 0023 / 0028 / 0042 norm). When there are 2+
  signals, the card cycles to the most-recent one and
  shows a small "+ N more" pill (a second tap of "Got
  it" advances to the next signal). Card exposes
  `data-testid="returning-parent-card"`. Per LESSONS#0029
  / #0082 — scope every Playwright assertion to the
  testid (the prior player's first name will often
  overlap other rendered strings). Per LESSONS#0065 /
  #0066 / #0162 — the home page is a hotspot; mount
  with the SMALLEST POSSIBLE touch (one import + one JSX
  entry). (vitest component test): (i) one unconsumed
  signal → card renders with the player first name + the
  team name; (ii) no signals → card is ABSENT; (iii) the
  See-season button's href contains the priorPlayerId;
  (iv) tapping Got-it fires the consume POST and hides
  the card; (v) two signals → card shows "+ 1 more"; (vi)
  the rendered text contains no AGENTS.md banned word.

- [ ] An extension to the existing 0042 dormant-coach
  email cron (read at pickup per LESSONS#0096 — likely
  `src/app/api/cron/quiet-coach-checkin/route.ts` or a
  sibling) — when the cron prepares the daily dormant-
  coach batch, it ALSO reads any unconsumed
  `coach_reactivation_signals` with `notified_at IS
  NULL` from the last 7 days; for each, the cron sends
  a SECOND, distinct email template (subject:
  "<priorPlayerFirstName>'s parent is back on SportsIQ
  this week") whose body deep-links to the player-
  trajectory surface. After sending, the cron stamps
  `notified_at = NOW()` so the signal is not re-sent.
  Per LESSONS#0058 — if the cron route is new, add
  `/api/cron/<name>/` to `publicPaths` in
  `src/lib/supabase/middleware.ts`; if it's an
  extension to the existing 0042 cron, the publicPaths
  entry is already there. Per LESSONS#0023 — the email
  body's copy is instructed positively, no banned
  tokens. Per LESSONS#0062 — if the cron's supabase
  chain uses two consecutive `.eq()` calls, the chain
  mock must be thenable. The email is sent through the
  existing transactional email pipeline used by 0042 /
  0023; no new provider. The cron also respects the
  EXISTING coach-side opt-out flag set by the 0042
  "pause for now" path (per the 0042 contract). Per
  LESSONS#0114 — if a new structural identifier
  contains a banned token, strip before sweep. (vitest
  under `tests/api/cron/quiet-coach-checkin-
  reactivation.test.ts` — new): (i) a dormant coach
  with one unconsumed signal → ONE email sent with the
  reactivation subject; (ii) the same signal already
  marked `notified_at` → no second email; (iii) a
  dormant coach who paused per 0042 → no email; (iv)
  a NON-dormant coach with a signal → no email (the
  coach is already engaged); (v) the email body
  contains the player first name + a deep-link with
  the priorPlayerId; (vi) the email body contains no
  AGENTS.md banned word.

- [ ] Tier / feature gating: NO new tier feature key.
  The reactivation card on `/home` and the email
  surface are available to EVERY tier including free —
  the reactivation is a retention surface and gating
  it would invert the loop (the dormant coach the
  product MOST wants to reactivate is often the free
  coach who churned). The deep-link target (the 0061
  player-trajectory surface) carries its EXISTING
  tier gate posture untouched. (vitest: a free-tier
  dormant coach receives the email AND sees the card;
  a paid-tier dormant coach receives both; the 0061
  trajectory target's existing tier gate posture is
  byte-identical.)

- [ ] Privacy / COPPA contract: the
  `returning_parent_email_hash` column stores a
  SHA-256 of the lowercased email, NEVER the
  plaintext. The dormant-coach surface NEVER reads
  the parent's email, the parent's first name, the
  parent's phone, the parent's relationship-label.
  ONLY the prior PLAYER'S first name is rendered to
  the coach (which is information the coach
  ALREADY HAS — they coached that kid). The
  parent-side surface is BYTE-IDENTICAL to today.
  The route's `.select()` calls are explicit allow-
  lists per LESSONS#0036 — NEVER `select('*')`,
  NEVER reads parent_phone, DOB, medical_notes,
  photo_url on the prior player. Per LESSONS#0034 /
  #0088 — the migration's COPPA scan strips `--`
  comments + the structural `_email_hash`
  identifier before the banned-token sweep. Per
  LESSONS#0036 — planted minor data on the prior-
  player row is NEVER read. (vitest: a planted DOB
  + medical_notes + parent_phone on the prior-
  player row are NEVER read by any of the route's
  `.select()` calls; the response payload contains
  no parent email (hashed or plaintext); the email
  body contains no parent name, no DOB, no jersey
  number; the
  `returning_parent_email_hash` column is a
  SHA-256, not the plaintext.)

- [ ] Voice contract: every new user-facing string
  (the card body, the See-season button label, the
  Got-it label, the email subject, the email body)
  contains NO AGENTS.md banned word per
  LESSONS#0023. Instruct positively ("is back on
  SportsIQ this week", "see how <name> finished
  the season with you", "got it") — never the
  banned ban-list. The "+ N more" pill copy
  contains no banned token for any fixture input.
  (vitest: render each new component and scan
  rendered text; render the email body across a
  matrix; scan the card across 0, 1, 2, 5 signal
  counts.)

- [ ] Regression: the existing parent-portal token
  GET path is BYTE-IDENTICAL on render — no new
  prop, no new copy, no new field on the response
  payload. The existing 0042 quiet-coach cron is
  BYTE-IDENTICAL when there are zero unconsumed
  signals (the new email branch is a silent no-op).
  The existing /home surface is BYTE-IDENTICAL when
  the caller coach has zero unconsumed signals (the
  card is absent). The existing 0061 player-
  trajectory surface is BYTE-IDENTICAL when reached
  via any other path (the new deep-link is a normal
  link to the existing route). (vitest: snapshot
  the named routes / components against seeded
  fixtures pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — pre-mint TWO `players` rows that
  share the same `parent_email` on TWO DIFFERENT
  teams whose head coaches are TWO DIFFERENT
  coaches, with the spring-season coach's
  `coaches.updated_at` set to `now() - interval
  '45 days'` (dormant). Pre-mint ONE
  `parent_shares` token tied to the FALL team's
  player (so the parent has a real token to
  open). Per LESSONS#0084 — seed in an idempotent
  DELETE-then-INSERT block; every new coaches row
  carries a matching `auth.users` row in the same
  block. Per LESSONS#0101 — UUIDs in the next free
  `0000000000<XX>+` range (verify at pickup; the
  range used by 0069 was `0000000000d0`-
  `0000000000d3`, by 0070 / 0071 different). Per
  LESSONS#0085 — a `jsonb`-column seed value goes
  in as a quoted JSON string. Playwright spec:
  (a) hit the parent-portal token URL for the
  fall team's player (no auth — the public
  parent surface); assert the page renders BYTE-
  IDENTICAL to today (no new copy, no new card);
  (b) sign in as the SPRING dormant coach,
  navigate to /home, assert the
  `<ReturningParentCard />` renders with the
  spring player's first name + the fall team's
  name; (c) tap See-season, assert the URL
  contains the spring player's id; (d) tap Got-
  it, assert the card hides; (e) reload, assert
  the card stays hidden. Scope every assertion to
  the data-testid per LESSONS#0081 / #0082. Skip
  when E2E creds are unset.

## Out of scope

- Telling the PARENT that a signal fired. v1 is
  COMPLETELY INVISIBLE to the parent; surfacing the
  signal to the parent would change the consent
  posture and is a separate ticket.
- A daily-digest variant of the reactivation
  email. v1 is one-email-per-signal; daily-digest
  batching is a v2 if signal density grows.
- A push notification (mobile). v1 is email + in-
  app card only; push is a separate channel ticket
  with its own consent shape.
- Telling the FALL-team coach (Coach Hornets in
  the user-story) that they have a parent with a
  prior SportsIQ history. v1 is dormant-coach-side
  only; the fall coach's signal would be a
  separate ticket if data shows it matters.
- An AI-generated email body. v1 is a template-
  fill matching the existing 0042 voice; the AI
  surface is a separate ticket.
- A cross-PROGRAM jump variant ("the parent
  changed programs entirely"). v1 fires across
  any team boundary; a program-jump distinction
  is a v2 analytics ticket.
- A retroactive sweep of parent-email matches at
  ticket-ship time. v1 fires on FORWARD parent-
  portal opens only; back-filling is a separate
  cron-route ticket.
- A `coaches.preferences.reactivation_paused`
  user-side opt-out. v1 RESPECTS the existing
  0042 pause flag (no new opt-out shape); a
  reactivation-specific opt-out is a separate
  ticket.

## Engineering notes

Files / patterns the dev should touch.

- `supabase/migrations/064_coach_reactivation_signals
  .sql` (new). Per LESSONS#0006 — confirm `064` at
  pickup; the last seen migration in the index is
  `063_game_decompressions.sql`. Per LESSONS#0088 —
  strip `--` comments before banned-token sweep. Per
  LESSONS#0114 — strip the structural
  `returning_parent_email_hash` identifier before
  the sweep.
- `src/types/database.ts` — add
  `CoachReactivationSignal` type. NO field on any
  existing type.
- `src/lib/coach-reactivation-utils.ts` (new) —
  pure helper. Mirror the shape of
  `src/lib/emergent-focus-utils.ts` (the 0071
  pure-helper pattern). Per LESSONS#0061 — literal
  space on any defensive scan.
- `src/app/api/share/[token]/route.ts` (existing —
  read first per LESSONS#0096; if the share path
  is a server component, mount in the page's
  server-side fetch instead). Add the best-effort
  background call to `findDormantCoachesForReturningParent`
  + the UPSERT into `coach_reactivation_signals`.
  Per LESSONS#0036 — best-effort posture; render
  never waits. Per LESSONS#0049 / #0092 / #0100 /
  #0110 — new from() call; Glob `tests/api/share*`
  AND `tests/app/share*` at pickup and extend
  every queue. Per LESSONS#0112 — check if the
  existing player read can be widened.
- `src/app/api/coach/reactivation-signals/route.ts`
  (new) — `GET(request)`. Authed via
  `createServerSupabase()` for auth, service-role
  read. Per LESSONS#0036 — `.select()` allow-lists.
- `src/app/api/coach/reactivation-signals/consume/route.ts`
  (new) — `POST(request)`. Authed. Per LESSONS#0036
  — `.select()` allow-list + ownership check.
- `src/app/api/cron/quiet-coach-checkin/route.ts`
  (existing — read first per LESSONS#0096; if the
  cron path differs at pickup, mount on the actual
  cron route). Per LESSONS#0058 — if the cron's
  publicPaths entry is missing, add it. Per
  LESSONS#0062 — if the chain uses two `.eq()`
  calls, the mock must be thenable. New
  `coach_reactivation_signals` read + second email
  branch. Per LESSONS#0049 / #0092 / #0100 /
  #0110 — Glob every `tests/api/cron/quiet*` and
  extend the queues.
- `src/components/home/returning-parent-card.tsx`
  (new) — the card.
  `data-testid="returning-parent-card"`.
- `src/app/(dashboard)/home/page.tsx` (existing —
  read first per LESSONS#0096). One import + one
  JSX entry. Per LESSONS#0065 / #0066 / #0162 —
  smallest possible touch on the hotspot page.
- `src/lib/email/templates/returning-parent-
  reactivation.ts` (new) — template-fill matching
  the existing 0042 voice. Per LESSONS#0023 —
  positive instruction.
- `src/lib/tier.ts` — NO new feature key.
- `src/components/ui/upgrade-gate.tsx` — NO new
  registration.
- `tests/migrations/064-coach-reactivation-signals
  .test.ts` (new, `.test.ts` per LESSONS#0020 /
  #38).
- `tests/lib/coach-reactivation-utils.test.ts`
  (new) — every helper case.
- `tests/api/share-returning-parent.test.ts`
  (new) — every share-extension case.
- `tests/api/coach-reactivation-signals.test.ts`
  (new) — GET route every case.
- `tests/api/coach-reactivation-signals-consume
  .test.ts` (new).
- `tests/api/cron/quiet-coach-checkin-
  reactivation.test.ts` (new) — cron extension
  every case.
- `tests/components/returning-parent-card.test.tsx`
  (new).
- `tests/api/share*.test.ts` AND `tests/app/share*
  .test.ts` (existing — Glob at pickup per
  LESSONS#0110) — extend every
  `mockReturnValueOnce` queue with the new
  from-chain.
- `tests/e2e/returning-parent-reactivation-flow.
  spec.ts` (new). Seed extension per the AC.
  UUIDs in the next free `0000000000<XX>+` range
  per LESSONS#0101. Skip when E2E creds are
  unset.
- New deps: NO. Migration: YES (064 or bump).
  Env vars: NO new. AI prompt change: NO (no
  AI on this path; the email is a template-fill,
  the signal is a pure aggregation). Tier
  feature key: NO new key.
- LESSONS to anchor: #0006 (prefix uniqueness),
  #0020 / #38 (.test.ts), #0023 (positive voice
  on card + email + button labels), #0029 /
  #0082 (data-testid scoping in e2e —
  player/team names overlap), #0034 / #0088
  (strip `--` comments + structural identifiers
  on the COPPA sweep), #0036 (best-effort
  render + `.select()` allow-lists), #0049 /
  #0092 / #0100 / #0110 (mock queue spillover —
  Glob every share / cron test), #0055 (route
  handler call posture), #0058 (publicPaths —
  if the cron route is new), #0061 (literal
  space on defensive scans), #0062 (thenable
  chain mock when two `.eq()` calls), #0065 /
  #0066 / #0162 (home page hotspot — smallest
  possible touch), #0084 / #0101 (seed
  posture; auth.users + coaches in same
  idempotent block; UUID range), #0085 (jsonb
  seed values as quoted JSON), #0096 (schema
  wins over prose — at pickup read the actual
  share token path, the actual home page
  surface, the actual 0042 cron path, the
  actual 0061 player-trajectory route, the
  actual `players.parent_email` shape, the
  actual `coaches.updated_at` freshness shape,
  whether the share path is a route handler or
  a server component), #0103 (optional
  widening on any shared type), #0112 (widen
  existing read to subsume new query if
  possible — lower blast radius), #0114
  (strip structural identifier when its name
  contains a banned token).

## Implementation log

(Appended by the implementation-dev agent during execution.)
