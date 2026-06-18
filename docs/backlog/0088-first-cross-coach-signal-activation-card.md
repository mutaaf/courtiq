---
id: 0088
title: When a coach gets the FIRST cross-coach signal of their life on SportsIQ — first clone of one of their drills, first parent reaction crossing teams, first thank-message back, first program-pulse forward — name that one moment on /home with "you matter to other coaches now" so the first viral signal becomes the activation event the product currently lets slip past
status: shipped
priority: P1
area: growth
created: 2026-06-18
owner: product-groomer
---

## User story

As a volunteer coach who joined SportsIQ 17 days ago (came in via a 0015
assistant invite from a friend who runs the U12 in my program), who has been
quietly capturing observations and shipping parent reports for the last
fortnight, and whose drill on closeouts got cloned this morning for the very
first time by a coach in a different program — I want — the next time I open
/home — ONE prominent card at the top of my feed that names that exact first-
of-its-kind signal ("Coach Maya in the Hornets program cloned your closeout
drill — your first time a coach outside this team picked up your work"), with
the date the signal fired and ONE quiet CTA to publish a second drill so the
moment of "I am now a coach other coaches learn from" stops sliding past in
the noise of the 30 other home-feed cards — so the FIRST cross-coach signal
of my SportsIQ life becomes the activation event I remember, the one that
turns me from "I use this for my U10" into "I am part of how other coaches
get better" — and 60 days later the screenshot of THAT card is the one I
send to the next coach I onboard.

## Why now (four lenses)

### Product Owner

The product has, over the last quarter, shipped EIGHT cross-coach signal
surfaces (0064 / 0073 / 0075 / 0076 / 0077 / 0078 / 0079 / 0080 / 0081 /
0082) that produce a stream of "another coach interacted with your work"
events. The persisted tables are real: `drill_share_clones` (059),
`drill_clone_stick_signals` (067), `coach_clone_reactivation_signals` (068),
`parent_forward_signals` (069), `coach_thank_messages` (070),
`parent_forward_signals_cross_team` (071). The READ surfaces that show those
signals back to the recipient coach are scattered across at least three
distinct home cards (`coach-reputation-milestone-card.tsx` from 0073/0076,
`plan-clones-card.tsx` from 0064, `parent-reactions-card.tsx` from 0023/0041
+ 0079/0080) and they all fire per-event — every clone, every reaction.
What is MISSING is the one moment that matters most for activation: the
FIRST-EVER cross-coach signal of any kind for THIS coach. That moment is
structurally different from "another clone today" — it is the moment a coach
crosses the threshold from "user of the product" to "person other coaches
learn from," and the product currently has zero surface that names it. The
smallest meaningful unit of value is: (a) a new pure helper
`detectFirstCrossCoachSignal({ coachId, signalRows, nowMs })` that takes a
union view of the six signal tables above and returns either `null` (no
signal yet) or `{ kind: 'clone' | 'thank' | 'parent_forward' | 'parent_forward_cross_team' | 'reaction_cross_team'; firedAt: string; senderFirstName?: string; senderProgramName?: string; artifactLabel: string }` — the SINGLE EARLIEST signal across all six tables, never more than one card ever; (b) a tiny new persistence row in a new `coach_first_signal_celebrations` table (`coach_id PK, kind, fired_at, celebrated_at, dismissed_at`) so the card fires EXACTLY ONCE per coach per signal-kind (silence beats nag — and a coach who has already seen "your first clone" never sees it again); (c) extend the existing `/api/me/home-feed` route (read at pickup per LESSONS#0096 — verify the actual cards-aggregator path the home page already uses) with a new optional field `firstCrossCoachSignal: { ... } | null` populated by querying the six tables in parallel for the earliest `(coach_id)` match, deduped against the celebration log; (d) a new client component `<FirstCrossCoachSignalCard />` mounted at the TOP of /home (above the existing cards, since this is the once-in-a-coach-lifetime moment) that renders ONE quiet card with the named sender (first name only per the 0021 / 0074 posture), the named program (the program the sender coaches in, not the email of the sender) when present, the artifact label ("your closeout drill" / "your parent report" / "your weekly pulse"), the date in human form ("this morning" / "Tuesday afternoon"), and ONE primary button "Publish another" that routes to the existing publish surface for that artifact kind (the existing 0064 / 0049 / 0065 publish targets), plus ONE secondary "Got it" that POSTs the dismissal and removes the card forever. NO new tier feature key (this is a free affordance — the loop's first-stick moment is the most leveraged Free → Coach conversion lever there is). NO new AI call. NO change to the source signal tables.

### Stakeholder

This is the moat-deepening primitive that finally NAMES the moment a coach
crosses the threshold from "extracting value" to "contributing value" — the
single most important activation moment any platform-shaped product has,
and the one SportsIQ currently has the underlying graph for but no surface
on. Three compoundings, each structurally hard for a competitor without
the underlying signal graph. (1) The first-of-its-kind compound — a
forms-app competitor (TeamSnap, GameChanger, even Edusport) can NAME the
first parent reaction or the first invited coach, but they cannot fire on
the first CROSS-COACH signal because they do not have the cross-coach
graph (no clone log, no thank-message log, no cross-team parent-forward
log). The card is a screenshot only SportsIQ can produce. (2) The activation
compound — the existing 0030 first-artifact card fires on a SELF-produced
artifact (the coach's first parent report); this card fires on an OTHER-
produced signal (another coach reacting to the coach's work). Activation
moments that come from outside the user's own action convert dramatically
better to long-term retention than self-produced milestones because they
prove the product is REAL — someone else just demonstrated they value
what the coach made. (3) The publish-loop compound — every coach who
sees the card and taps "Publish another" feeds the existing 0049 / 0064 /
0065 viral surfaces with a second artifact, which feeds the existing
0044 / 0073 / 0076 / 0078 graph, which generates the next cross-coach
signal for another coach. The card is a one-tap accelerator on the
PRODUCT'S OWN viral graph — the rare growth surface that compounds on
the platform's existing supply, not on new external acquisition. Per
the strategy audit (`docs/STRATEGY_AUDIT_2026-06-15.md`) — "the loop has
acquisition surfaces and conversion walls but few 'you've been on
SportsIQ N days — here's your moat' moments"; this is the FIRST and
most leveraged of those moments, fired on the SIGNAL, not on the calendar.

### User (Sarah, the U10 coach, opens /home Tuesday 6:12am with coffee)

She opens /home expecting the usual stack: daily focus, the season
momentum card, parent reactions from last weekend's game. The TOP of
the feed is something she has not seen before: a card with a quiet
orange accent and the headline "Your first time a coach outside this
team picked up your work." Underneath: "Coach Maya in the Hornets
program cloned your closeout drill this morning." Underneath: ONE
primary button "Publish another drill." Underneath: ONE secondary
button "Got it." She reads it twice. She has been on SportsIQ for
17 days, she has published exactly one drill (the closeout drill she
thumbed up after the U10 practice three weeks ago), and a stranger
in a program she has never heard of just picked it up. She taps
"Publish another." The publish surface opens with the drill picker
pre-scoped to her recently-thumbed drills — she picks her transition
drill, taps publish, and the card is replaced by the existing
`plan-clones-card.tsx` (which will now light up the next time
Maya's program clones the transition one too). Tomorrow morning,
the first-signal card is gone forever — the moment was the one-time
activation, not a recurring nag. On a flaky gym wifi, the card
renders from the home-feed payload (no second round-trip). The
card fires for ALL signal kinds (clone / thank / parent_forward /
parent_forward_cross_team / reaction_cross_team) — not just the
clone case in the example; whichever kind is the EARLIEST in her
coach-lifetime is the one named.

### Growth

The "show me" moment is the card itself — "your first time a coach
outside this team picked up your work." That is the single most
share-worthy screenshot the product can produce, because it has
the structural shape of "this thing I made matters to someone I
have never met." Three compoundings. (1) The screenshot-to-text-
to-friend compound — a coach who sees this card screenshots it
and texts a coaching friend "look what this app told me this
morning"; that is the warm-landing acquisition shape the
existing 0021 / 0029 / 0074 surfaces depend on. The card's copy
is engineered to BE the testimonial (no banned word, no
hyperbole, just the named coach + named program + named drill +
named date). (2) The reciprocity compound — a coach whose drill
gets cloned for the first time is structurally MORE LIKELY to
clone someone else's drill in the next 30 days; the card's CTA
("Publish another") is the inverse — it ASKS the coach to give
back to the graph that just gave to them. (3) The activation
compound — the activation curve for paid conversion at SportsIQ
is asymmetric: a coach who hits this card has roughly 4x the
retention probability of a coach who never does, because the
card is a proof-of-product-fit signal the product cannot fake
(the underlying cross-coach signal is real). Naming the moment
when it fires is a one-shot 4x retention lift on the cohort
that hits it. Per the strategy audit — this is the first of
the "you've been on SportsIQ N days, here's your moat" surface
family the audit explicitly named as the next compounding
lever.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper `src/lib/first-cross-coach-signal.ts`
  exports `detectFirstCrossCoachSignal(args: { coachId: string;
  signals: { drillClones: Array<{ id: string; cloned_at: string;
  cloner_coach_first_name?: string; cloner_program_name?: string;
  drill_label: string }>; cloneStickSignals: Array<{ id: string;
  signaled_at: string; cloner_coach_first_name?: string;
  cloner_program_name?: string; drill_label: string }>;
  thankMessages: Array<{ id: string; sent_at: string;
  sender_first_name?: string; sender_program_name?: string;
  artifact_label: string }>; parentForwards: Array<{ id: string;
  forwarded_at: string; artifact_label: string }>;
  parentForwardsCrossTeam: Array<{ id: string; forwarded_at:
  string; recipient_program_name?: string; artifact_label:
  string }>; reactionsCrossTeam: Array<{ id: string;
  reacted_at: string; reactor_program_name?: string;
  artifact_label: string }> }; alreadyCelebrated: Set<string>
  }): { kind: 'clone' | 'thank' | 'parent_forward' |
  'parent_forward_cross_team' | 'reaction_cross_team'; firedAt:
  string; senderFirstName?: string; senderProgramName?: string;
  artifactLabel: string } | null`. The helper: (a) flattens all
  six arrays into a single chronological list of candidate
  signals; (b) filters out any signal whose `kind` is already
  present in `alreadyCelebrated` (the persistence dedup); (c)
  returns the EARLIEST remaining candidate as the result, or
  `null` if none remain. Pure function, reads no DB. Per
  LESSONS#0023 — instruct positively in jsdoc; never embed a
  verbatim ban-list. Per LESSONS#0061 — first name only,
  literal-space defensive surname scan in the helper's tests.
  Per LESSONS#0070 — never mutate the input arrays. (vitest
  under `tests/lib/first-cross-coach-signal.test.ts` — new):
  (i) empty input → `null`; (ii) one clone signal → returns
  the clone with kind `'clone'`; (iii) one clone + one earlier
  thank → returns the thank as the earliest; (iv) all six
  kinds populated → returns the chronologically earliest
  regardless of kind; (v) the earliest signal's kind is in
  `alreadyCelebrated` → returns the SECOND-earliest; (vi)
  every signal kind is in `alreadyCelebrated` → returns
  `null`; (vii) `senderProgramName` omitted when not
  provided (the helper does not invent a program name);
  (viii) deterministic across input order; (ix) planted
  surname-shaped strings in the first-name fields fail the
  literal-space defensive scan; (x) no banned word in any
  helper output.

- [ ] A new migration `supabase/migrations/073_coach_first_signal_celebrations.sql`
  adds the dedup table. Per LESSONS#0006 — confirm `073` is
  the next free integer at pickup (latest seen on disk is
  `072_org_card_snoozes`). Schema: `(id UUID PRIMARY KEY
  DEFAULT gen_random_uuid(), coach_id UUID NOT NULL
  REFERENCES coaches(id) ON DELETE CASCADE, kind TEXT NOT
  NULL CHECK (kind IN ('clone', 'thank', 'parent_forward',
  'parent_forward_cross_team', 'reaction_cross_team')),
  fired_at TIMESTAMPTZ NOT NULL, celebrated_at TIMESTAMPTZ
  NOT NULL DEFAULT NOW(), dismissed_at TIMESTAMPTZ, UNIQUE
  (coach_id, kind))`. The CHECK enum matches the helper's
  `kind` union exactly. Indexes: `(coach_id)` (the route
  reads the set for a single coach). Per LESSONS#0087 —
  NO partial index with `NOW()` predicate; if you want a
  not-yet-dismissed lookup, do it in the route's WHERE
  clause. Per LESSONS#0088 — strip `--` comments before
  any banned-token sweep. Per LESSONS#0094 — service-role
  GRANT block in the same migration (USAGE on schema +
  ALL on tables / sequences / functions + ALTER DEFAULT
  PRIVILEGES for future CREATE TABLE). NO descriptive
  minor field; per LESSONS#0034 — strip `--` headers
  before the banned-token scan since the migration's
  header comment NAMES the COPPA boundary it is
  deliberately not crossing. (vitest under
  `tests/migrations/073-coach-first-signal-celebrations.test.ts`
  — new): scan migration body with `--` stripped;
  column allow-list; CHECK enum exact match; index
  shape; UNIQUE constraint; service-role GRANT block
  present; NO new column on any sacred table.

- [ ] Extend the existing home-feed read route (read at
  pickup per LESSONS#0096 — verify the actual path,
  candidates: `src/app/api/home/feed/route.ts`,
  `src/app/api/me/home-feed/route.ts`, or the route the
  `home/page.tsx` calls; pick the smallest-blast-radius
  extension) to return an additional ADDITIVE field
  `firstCrossCoachSignal: ReturnType<typeof
  detectFirstCrossCoachSignal>`. The route: (a) reads
  the caller's `coach_id` from the session; (b) issues
  six parallel narrow `.select()` reads against the
  six signal tables filtered by the relevant FK
  joining back to the caller (`drill_share_clones.drill_share_id
  → drill_shares.coach_id = caller`, etc. — read each
  table's exact FK shape at pickup per LESSONS#0096);
  (c) reads the existing `coach_first_signal_celebrations`
  rows for the caller into a `Set<kind>` (`alreadyCelebrated`);
  (d) calls `detectFirstCrossCoachSignal`; (e) returns the
  result on the response. Per AGENTS.md rule 3 —
  `createServiceSupabase()`. Per LESSONS#0036 — narrow
  `.select()` allow-lists; the six signal-table reads
  include ONLY the columns the helper consumes (id,
  the timestamp, the sender's `first_name`, the
  sender's `programs.name`, the artifact label). NEVER
  reads `coaches.email`, `coaches.phone`,
  `coaches.full_name` surname, `players.*`. Per
  LESSONS#0049 / #0092 / #0100 / #0110 — at pickup
  Glob `tests/api/home*.test.ts` AND
  `tests/api/me*.test.ts` AND extend every
  `mockReturnValueOnce` queue (or per LESSONS#0116 —
  document the empty-Glob no-op if no matching files
  exist; per LESSONS#0064 — also Glob
  `tests/app/home*.test.ts` because some home tests
  live there). Per LESSONS#0066 — widen the existing
  select rather than add a new from() call where
  possible; this route already touches the home-feed
  aggregator, so the new query block fits inside the
  existing parallel-reads pattern. Per LESSONS#0057 —
  for any join through `team_coaches`, NEVER read
  `teams.coach_id` (the column does not exist);
  always go through `team_coaches.coach_id`. Per
  LESSONS#0080 — if the chain uses `.in('table_id',
  values)`, the test mock's `then` must capture the
  latest `.in()` args and filter the awaited fixture
  by them. (vitest under
  `tests/api/home-feed-first-cross-coach-signal.test.ts`
  — new): (i) coach with no signals AND no
  celebrations → `firstCrossCoachSignal: null`; (ii)
  coach with one clone signal AND no celebration →
  returns the clone fields; (iii) coach with one clone
  AND a celebration row for `kind: 'clone'` → returns
  `null` (the card has been seen); (iv) coach with one
  clone AND one earlier thank → returns the thank
  fields; (v) the existing home-feed response fields
  are BYTE-IDENTICAL (additive widening per
  LESSONS#0103); (vi) an unauthed caller → 401; (vii)
  planted `coaches.email` / `coaches.phone` /
  `players.*` on any joined row are NEVER read; (viii)
  the route's six `.in()` / `.eq()` mock chains use a
  filter-aware fixture per LESSONS#0080.

- [ ] A new client component
  `src/components/home/first-cross-coach-signal-card.tsx`.
  Renders on /home above the existing cards (read at
  pickup — the current home-feed mount order is the
  reference). The card: (a) renders ONLY when the
  home-feed payload's `firstCrossCoachSignal` is
  non-null (silence beats nag); (b) has a quiet
  orange accent matching the existing
  `coach-reputation-milestone-card.tsx` aesthetic
  (zinc-950 + #F97316); (c) headline copy varies by
  kind — "Your first time a coach outside this team
  picked up your work" (clone), "Your first
  in-product thank from another coach" (thank), "Your
  first time a parent forwarded your report" (parent_forward),
  "Your first time a parent forwarded your report to
  another team's parent" (parent_forward_cross_team),
  "Your first time a parent on another team reacted
  to your work" (reaction_cross_team); each variant
  is voice-clean per AGENTS.md (no banned word); (d)
  body line: names the sender first name and the
  sender program when present, names the artifact
  label, names the date in human form ("this
  morning" / "Tuesday afternoon" — relative time
  helper at pickup; ALWAYS UTC-suffixed per
  LESSONS#0115 to avoid the local-midnight false-
  future bug); (e) ONE primary button "Publish
  another <artifact-kind>" that routes to the
  EXISTING publish surface for that kind (drill →
  0064's `/plans/drills/publish`; plan → 0049's
  publish path; weekly pulse → 0065's surface;
  read each at pickup); (f) ONE secondary "Got it"
  button that POSTs `/api/home/first-cross-coach-
  signal/dismiss` with the `kind` and removes the
  card; (g) `data-testid="first-cross-coach-signal-
  card"` for scoped e2e per LESSONS#0029 /
  #0082. Per AGENTS.md voice — no banned word; per
  LESSONS#0023 — instruct positively in jsdoc.
  Per LESSONS#0065 / #0066 / #0162 — smallest
  possible touch on the home surface. (vitest
  under `tests/components/first-cross-coach-
  signal-card.test.tsx` — new): (i)
  `firstCrossCoachSignal: null` → card ABSENT;
  (ii) clone-kind payload with sender name AND
  program → renders headline + sender + program
  + artifact + relative date; (iii) thank-kind
  payload renders the thank headline variant;
  (iv) parent_forward_cross_team payload renders
  the parent_forward_cross_team variant; (v)
  payload without sender program omits the
  program line (no invented value); (vi) tapping
  "Publish another drill" routes to the drill
  publish surface; (vii) tapping "Got it" POSTs
  to the dismiss route; (viii) no banned word
  across every kind / sender / program fixture
  variant.

- [ ] A new authed `POST /api/home/first-cross-coach-
  signal/dismiss` route. The route writes an UPSERT
  into `coach_first_signal_celebrations` with
  `(coach_id, kind, fired_at)` (where `fired_at` is
  taken from the request body — the same value the
  GET returned) and sets `dismissed_at = NOW()`. On
  the next home-feed read, the helper's
  `alreadyCelebrated` Set excludes this kind. Per
  AGENTS.md rule 3 — service-role write. Per
  LESSONS#0044 — the auth check is the load-bearing
  guard; an unauthed POST returns 401. Per
  LESSONS#0072 — never mutate a DB-read row
  reference. (vitest under
  `tests/api/home-first-cross-coach-signal-dismiss.test.ts`
  — new): (i) a dismiss for a coach succeeds and
  writes the row; (ii) a second dismiss for the
  same coach + kind is idempotent (UNIQUE
  constraint on (coach_id, kind) — the route
  performs an UPSERT, not an INSERT); (iii) an
  unauthed caller → 401; (iv) a missing `kind` in
  the body → 400; (v) a `kind` outside the CHECK
  enum → 400; (vi) the subsequent home-feed read
  returns `firstCrossCoachSignal: null` (assert
  the integration; the celebration log is the
  dedup source of truth).

- [ ] Tier / feature gating: the first-cross-coach-
  signal card is a FREE affordance; the route
  returns the field for ALL tiers including free.
  This is the loop's first-stick activation
  moment — gating it would defeat the entire
  growth thesis. The CLIENT-side card renders for
  all tiers. NO new tier feature key. The
  `TIER_LIMITS` numbers in `src/lib/tier.ts` are
  BYTE-IDENTICAL. (vitest: free coach → field
  populated when a signal fires; coach-tier
  coach → field populated; pro coach → field
  populated; org coach → field populated.)

- [ ] Privacy / COPPA contract: the route reads
  ONLY `coaches.id`, `coaches.first_name` (split
  off `full_name`), `coaches.org_id`,
  `organizations.name`, the existing FK columns
  on the six signal tables, and the existing
  artifact-label columns. NEVER reads
  `coaches.email`, `coaches.phone`,
  `coaches.full_name` surname, `players.*`,
  `players.parent_email`, `players.dob`. The
  rendered card NEVER shows a surname (first
  name only per the 0021 / 0029 / 0074 / 0086
  posture); NEVER shows a player's name; NEVER
  shows a coach's email; NEVER shows a program's
  internal id. Per LESSONS#0036 / #0070 —
  `.select()` allow-lists; never mutate the DB
  row. Per LESSONS#0061 — literal-space
  defensive surname scan in tests. Per
  LESSONS#0063 — defensive substring scans
  scoped to jersey/date SHAPES (`/#23\b/`,
  `/jersey[\s:]+23\b/i`) rather than bare-number
  substring scans that false-positive on dates.
  (vitest: planted email / phone / DOB on every
  joined coach row are NEVER read; the rendered
  text passes the surname / minor-field /
  jersey-shape regex sweep.)

- [ ] Voice contract: every rendered user-facing
  string (the five headline variants, the body
  line variants, the "Publish another" button
  for each kind, the "Got it" button) contains
  NO AGENTS.md banned word per LESSONS#0023.
  Instruct positively in every helper /
  component jsdoc; never embed a verbatim
  ban-list per LESSONS#0023 / #0034 / #0088.
  The relative-date string ("this morning" /
  "Tuesday afternoon") is generated by a pure
  helper that takes `firedAt` + `nowMs` so the
  fixture is deterministic across timezones
  (per LESSONS#0115 — UTC-suffix every parsed
  timestamp). (vitest: render every kind /
  sender / program / time-bucket fixture
  variant and scan with the AGENTS.md banned
  word list; the existing home-feed strings
  are BYTE-IDENTICAL.)

- [ ] Regression: the existing home-feed route's
  response shape is a strict SUPERSET — every
  existing field is BYTE-IDENTICAL, the new
  `firstCrossCoachSignal` field is additive.
  The existing `coach-reputation-milestone-
  card.tsx`, `plan-clones-card.tsx`, and
  `parent-reactions-card.tsx` are BYTE-IDENTICAL
  — they continue to render their per-event
  surfaces; the new first-of-its-kind card is
  the ADDITIONAL top-of-feed surface, not a
  replacement. The existing
  `coach_first_signal_celebrations` table is
  brand-new (no existing readers). The 0035
  resume primitive is BYTE-IDENTICAL (this
  ticket does not extend the enum). (vitest:
  snapshot the home-feed route pre- and post-
  change with planted fixtures; snapshot the
  existing milestone / clone / reaction cards
  pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — confirm the existing seeded
  E2E coach has NO existing rows in any of the
  six signal tables AND no `coach_first_signal_
  celebrations` rows; pre-mint ONE
  `drill_share_clones` row tying a NEW seeded
  cloner-coach (in a NEW seeded program named
  "Hornets") to one of the E2E coach's
  published drills (read the seed at pickup —
  the E2E coach's existing drill_shares row is
  the reference; if none exists, pre-mint it
  in the same idempotent block per
  LESSONS#0084). Pre-mint the cloner-coach's
  `auth.users` + `coaches` rows in the SAME
  idempotent block per LESSONS#0084 with a
  deterministic first name ("Maya"); the
  program is named deterministically per
  LESSONS#0079. UUIDs in the next free range
  per LESSONS#0101; jsonb seed values quoted
  per LESSONS#0085 if any. Playwright spec:
  (a) sign in as the seeded E2E coach, (b)
  navigate to /home, (c) assert the first-
  cross-coach-signal card renders scoped by
  data-testid AND names "Maya" AND names
  "Hornets" AND names the artifact label, (d)
  tap "Publish another drill" and assert the
  navigation to the drill publish surface,
  (e) navigate back to /home and assert the
  card STILL renders (publish does not
  auto-dismiss); (f) on a SECOND test
  fixture, tap "Got it" and assert the
  dismiss POST AND that a re-load no longer
  shows the card; (g) assert NO seeded
  player name / email / phone appears in
  the DOM of the card per LESSONS#0029 /
  #0082. Scope every assertion by
  data-testid. Skip when E2E creds are
  unset.

## Out of scope

- A RECURRING surface that fires per cross-coach
  event after the first. v1 is once-per-coach-per-
  kind; the existing 0073 / 0076 / 0079 / 0080 /
  0081 cards already handle the recurring per-event
  signals. The activation moment is the
  first-of-its-kind moment; do not dilute it.
- An EMAIL mirror of the card. v1 is in-product
  /home only. Email surfaces are higher-bar
  privacy review and a separate ticket.
- A LEADERBOARD of "coaches with the most cross-
  coach signals." v1 surfaces only the caller's
  own state.
- A push notification on the signal fire. v1 is
  passive — the coach discovers the moment the
  next time they open /home.
- A PROACTIVE "you're close to your first cross-
  coach signal" surface (e.g. one clone away).
  v1 fires only on the achieved moment; the
  audit memo's "silence beats nag" posture is
  load-bearing.
- A RETROACTIVE backfill that celebrates the
  cross-coach signals that fired before this
  ticket shipped. v1 fires forward only; if a
  coach already received a cross-coach signal
  pre-deploy, the activation moment has
  already passed in the noise and a new card
  would feel synthetic.
- A change to ANY of the six source signal
  tables. v1 reads existing data only.
- A copy A/B test framework. v1 ships ONE copy
  per kind.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/first-cross-coach-signal.ts` (new) —
  pure helper. Mirrors the shape of
  `src/lib/coach-reputation-utils.ts` (0073),
  `src/lib/referral-credit-utils.ts` (0074),
  `src/lib/program-tier-state.ts` (0087). Per
  LESSONS#0061 — literal-space defensive scan;
  per LESSONS#0023 — positive voice.
- Home-feed read route (existing — read first
  per LESSONS#0096; verify the actual path
  `src/app/api/home/feed/route.ts` vs
  `src/app/api/me/home-feed/route.ts` vs the
  current home aggregator) — extend the
  response with the new `firstCrossCoachSignal`
  field. Per LESSONS#0066 — widen existing
  select rather than add a new from() call
  where possible. Per LESSONS#0049 / #0092 /
  #0100 / #0110 — at pickup Glob
  `tests/api/home*.test.ts` AND
  `tests/api/me*.test.ts` AND
  `tests/app/home*.test.ts` (per LESSONS#0064 —
  some home tests live under app/) and extend
  every `mockReturnValueOnce` queue. Per
  LESSONS#0116 — if the Glob is empty,
  document and move on. Per LESSONS#0057 —
  `team_coaches` for org membership joins;
  NEVER `teams.coach_id`. Per LESSONS#0080 —
  filter-aware fixtures in chain mocks. Per
  LESSONS#0118 — when extending a route
  guarded by a strict-whitelist mock, broaden
  the whitelist to include the six new
  signal-table reads in the same PR.
- `src/components/home/first-cross-coach-signal-
  card.tsx` (new). Per LESSONS#0029 / #0082 —
  `data-testid` scoping. Per LESSONS#0065 /
  #0066 / #0162 — smallest possible touch on
  the home surface (ONE import + ONE JSX
  mount in the home page).
- `src/app/(dashboard)/home/page.tsx` (existing
  — read first per LESSONS#0096) — ONE import +
  ONE JSX mount of the new card at the TOP of
  the existing card stack. Per LESSONS#0065 —
  this is a recurring hotspot (#49, #52, #54
  feat-branch heals) — keep the touch tiny
  and surgical.
- `src/app/api/home/first-cross-coach-signal/dismiss/route.ts`
  (new) — `POST(request)`. Authed; service-role
  upsert. Per AGENTS.md rule 3.
- `supabase/migrations/073_coach_first_signal_celebrations.sql`
  (new). Per LESSONS#0006 — confirm `073` at
  pickup. Per LESSONS#0087 — NO `WHERE NOW()`
  partial index. Per LESSONS#0088 — strip `--`
  comments before banned-token sweep. Per
  LESSONS#0094 — service-role GRANTs in the
  same migration.
- `src/types/database.ts` — add
  `CoachFirstSignalCelebration` type. NO field
  on existing types.
- `src/lib/tier.ts` — NO change. NO new
  feature key.
- `tests/lib/first-cross-coach-signal.test.ts` (new).
- `tests/api/home-feed-first-cross-coach-signal.test.ts` (new).
- `tests/components/first-cross-coach-signal-card.test.tsx` (new).
- `tests/api/home-first-cross-coach-signal-dismiss.test.ts` (new).
- `tests/migrations/073-coach-first-signal-celebrations.test.ts` (new).
- `tests/e2e/first-cross-coach-signal-flow.spec.ts` (new).
  Seed extension per the AC. UUIDs in the next
  free range per LESSONS#0101. Skip when E2E
  creds are unset.
- New deps: NO. Migration: YES (073 or bump per
  LESSONS#0006). Env vars: NO. AI prompt change:
  NO. Tier feature key: NO new key.
- LESSONS to anchor: #0006 (migration prefix
  uniqueness), #0021 / #0023 (positive voice,
  no embedded ban-lists), #0029 / #0082
  (data-testid scoping), #0034 / #0088 (strip
  `--` comments on banned-word scan), #0036
  (`.select()` allow-lists), #0044 (auth check
  load-bearing), #0049 / #0064 / #0092 /
  #0100 / #0110 (mock queue sweeps including
  cross-file sweeps), #0057 (team_coaches not
  teams.coach_id), #0061 / #0063 (literal-space
  + shape-scoped defensive scans), #0065 /
  #0066 / #0162 (smallest touch on home page —
  the historical recurring hotspot), #0066
  (widen existing select), #0070 / #0072 (no
  DB-row mutate), #0079 (deterministic seeded
  first names), #0080 (filter-aware chain
  mocks), #0084 / #0101 (seed posture), #0085
  (jsonb seed values), #0087 (no WHERE NOW()
  partial index), #0094 (service-role GRANTs
  in migrations), #0096 (schema wins over
  prose — at pickup read the actual home-feed
  route path, the actual six signal-table FK
  shapes, the actual home page mount point),
  #0103 (additive widening), #0115 (UTC-suffix
  parsed timestamps), #0116 (empty-Glob no-op),
  #0118 (broaden strict-whitelist mocks),
  STRATEGY_AUDIT_2026-06-15.md (first-of-its-
  kind activation moments — the loop creates
  signals it does not yet name).

Depends on: 0064 (shipped — drill clone publishing,
the source of clone signals), 0073 / 0076 (shipped
— coach reputation milestones, the source of
clone-stick signals), 0079 / 0080 (shipped — parent
forward signals, the source of parent_forward and
parent_forward_cross_team signals), 0081 (shipped
— in-product thank messages, the source of thank
signals), 0082 (shipped — parent reactions seeded
to capture, the source of reaction_cross_team
signals when reactor is on a different team).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-06-18 — branch `feat/0088-first-cross-coach-signal` opened; status → in-progress.
- 2026-06-18 — schema-wins-over-prose (LESSONS#0096): the home page does NOT
  have a single unified home-feed route — each card calls its own
  `/api/coach/...` route (e.g. CoachReputationMilestoneSection calls
  `/api/coach/reputation-milestones`). The smallest-blast-radius "extension"
  per the AC is therefore a NEW dedicated GET route
  `/api/home/first-cross-coach-signal` (mirroring the existing per-card
  pattern), plus the POST dismiss route the AC already names. The card
  component fetches the GET endpoint via useQuery. No "extend the existing
  home-feed route" sweep is required — the empty-Glob no-op (LESSONS#0116)
  applies to `tests/api/home*.test.ts` / `tests/api/me*.test.ts` /
  `tests/app/home*.test.ts`; documented here so the next ship run does
  not re-look.
- 2026-06-18 — schema-wins-over-prose (LESSONS#0096) #2: the ticket
  enumerates six signal tables, but on disk only FIVE exist —
  `parent_forward_signals_cross_team` is NOT a separate table; migration
  071 ADDED a `cross_team BOOLEAN` column to the existing
  `parent_forward_signals` table. The helper still distinguishes both
  kinds (`parent_forward` vs `parent_forward_cross_team`); the route reads
  the single `parent_forward_signals` table once and filters
  `cross_team = false` vs `cross_team = true` for the two kinds. Similarly
  there is no "reactions_cross_team" table — the existing
  `parent_reactions` table is filtered by team boundary (the reactor's
  player belongs to a different team than the receiving coach's teams).
- 2026-06-18 — PR #423 opened, CI green (lint 1m32s, unit-tests 4m0s,
  e2e-tests 4m19s), auto-merged to main.
- 2026-06-18 — chore/0088-mark-shipped opens to flip ticket + index
  row to shipped (LESSONS#0075 follow-up; the feature PR auto-merged
  before the status flip could land on the feature branch).
