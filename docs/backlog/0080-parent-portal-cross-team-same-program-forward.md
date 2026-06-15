---
id: 0080
title: When a parent opens their kid's report on the portal and another team in the SAME program is also on SportsIQ, give them one tap to forward this week's report to one parent on the neighboring team — "send this to Liam's mom on the U10 Hornets too" — so the parent → parent edge crosses the team boundary
status: in-progress
priority: P1
area: parent-portal
created: 2026-06-11
owner: product-groomer
---

## User story

As a parent of a U10 girl on the Hawks Basketball team in the
Riverside program who just read this week's parent report (0009 /
0013 / 0016 / 0034 / 0041 / 0070) on the parent portal and would
normally text it to Liam's mom — whose son is on the U10 BOYS Hornets
team in the SAME Riverside program because Liam and my daughter Maya
ride to the same gym every Tuesday — I want the same in-product
forward 0079 shipped for SAME-team parents to ALSO work for parents
on a DIFFERENT team in the same program when the other team's coach
is on SportsIQ, so the parent-to-parent acquisition edge crosses
the team boundary at the program scope and the receiving parent
lands on her OWN kid's report under her OWN coach (not mine).

## Why now (four lenses)

### Product Owner

0079 shipped the in-team parent → parent forward — a parent on the
Hawks U10 team can send the week's report to another Hawks U10
parent. That is the highest-frequency parent forward case, and it
landed. What is MISSING is the next-highest-frequency case: parents
on DIFFERENT teams in the SAME PROGRAM (siblings on different age-
group teams, friends in the same youth league, the kid down the
street whose mom is on the same school district sideline circuit).
Today that forward also happens — as a screenshot — and the
receiving parent lands nowhere. The smallest meaningful unit of
value is: (a) widen the existing parent-portal GET shape (real path
read at pickup per LESSONS#0096) so that beyond `teamMates` it ALSO
returns a small `programMates: Array<{ player_id, first_name,
team_name }>` list — players on OTHER teams in the SAME `org_id`
whose `parent_email` exists AND whose team has a head coach on
SportsIQ (any tier — the receiving parent's experience must work
even when the neighbor coach is on Free); (b) widen the existing
`/api/share/parent-forward` route shipped by 0079 so that
`recipientPlayerId` MAY be on a different team in the SAME `org_id`
(the cross-team contract — not cross-PROGRAM, not cross-region), and
the route mints the recipient's portal token against the RECIPIENT'S
OWN coach (NOT the sender's coach), so the receiving parent lands on
HER OWN kid's portal under the neighbor coach's voice (0070); (c)
the existing in-team `<ParentForwardOnTeamButton />` is extended
(or a sibling `<ParentForwardInProgramButton />` mounted alongside
it — confirm at pickup per LESSONS#0022 for multi-CTA strict-mode
safety) with a SECOND tab "Send to one parent in your program," a
team-name labelled candidate list (first names + team name only, no
surnames), and the same 200-char sanitized note; (d) the existing
0079 `parent_forward_signals` row carries an additional
`cross_team` boolean (per LESSONS#0103 OPTIONAL widening to keep
every 0079 caller byte-identical) so the downstream attribution
surfaces (0050 / 0072 director-side analytics) can distinguish
in-team from cross-team forwards. NO new tier feature key (the
forward is free, mirrors 0079), NO new AI generation, ZERO
migrations if `parent_forward_signals` is widened via a single
ALTER TABLE column — see Engineering notes for the safer-path
posture. ONE new email template variant ("Sarah on a neighboring
team in your program sent you this week's SportsIQ report").

### Stakeholder

This is the moat-deepening primitive that turns 0079's same-team
parent → parent edge into a PROGRAM-SCOPE parent → parent edge —
the next-largest viral graph the product can ship without crossing
a consent boundary the existing roster contract does not already
satisfy. Three compoundings, all structurally hard for a forms-
app competitor because they require BOTH a program-scoped roster
graph AND a parent-portal share-token mint per recipient AND a
per-team coach-on-SportsIQ presence check. (1) The program-graph
completion compound — every parent who reads a portal report has
3-8 other parents in the SAME program their kid does not play with
but they know from car-pool / school / sideline; opening even
1-in-20 of those forwards is multiplying portal adoption per
program without ANY coach action and without crossing the
program boundary's consent posture (the sender's roster consent
covers their team; the recipient's `parent_email` was given to
their OWN team's coach — the forward is mediated by the in-
product email, not a contact-share). (2) The cross-coach
acquisition compound — the receiving parent lands on her OWN
kid's portal session under HER coach's voice (0070), which gives
the neighbor coach a fresh weekly-report opener AND a parent-
side viewer they did not have before — the cross-coach
referral surface that 0050 / 0060 hint at but did not close at
the per-parent scope. (3) The director-side compound — every
cross-team forward is the strongest possible signal to the
existing 0028 / 0071 / 0077 director surfaces that the program's
parents are actually consuming the portal across teams, which
gives the director the next-quarter rationale to keep paying for
the Org tier. Distinct from 0079 (same-team only), 0050 (parent
→ director), 0060 (parent → other-kid's coach via a multi-kid
parent), 0072 (returning parent → dormant coach). THIS is the
program-scope parent → parent edge — the next-step expansion of
0079 that 0079 deliberately deferred to its Out-of-scope.

### User (the sending parent, Maya's mom, Saturday 10:18am after
practice in the same parking lot from 0079)

She is in the parking lot. She just sent the on-team forward to
Liam's mom (0079) and clicked "Sent." Below the toast, a small
zinc-500 line appears: "Want to send this to a parent on
another team in your program?" She taps. A second sheet slides
up titled "Send to one parent in your program." The candidate
list is first-name-only with the team name labelled (e.g.
"Liam — U10 Hornets," "Devon — U12 Bears," "Sarah — U8
Cardinals") — never surnames, never parent contact. She
recognizes "Devon — U12 Bears" (the kid down the street). She
taps. The textarea pre-loads "I thought you'd want to read this
— Maya's on Hawks U10 and Devon's on U12 Bears, both in the
Riverside program, and the coaches' reports have been really
helpful. — Sarah." She taps Send. A small confirmation:
"Sent to one parent in your program." Total interaction: 11
seconds. The receiving parent (Devon's mom) gets an email three
minutes later that deep-links her to DEVON'S portal under the
U12 Bears coach's voice (NOT Maya's Hawks U10 coach). Devon's
mom has never opened SportsIQ; this is her first session and
it is under the right coach for her kid.

### User (the receiving parent, Devon's mom, Saturday 10:21am)

She gets an email. Subject: "Sarah on a neighboring team in
your program sent you this week's SportsIQ report." Body: "Hi
— Sarah's daughter is on the U10 Hawks in the Riverside
program. She thought you'd want to read this week's report
about Devon. Your coach (U12 Bears) writes them on SportsIQ."
One button: "Read Devon's report." She taps. She lands on her
OWN kid's portal session under her OWN coach's voice (0070).
She reads the existing 0009 weekly star, the 0034 returning-
player context, the 0041 reactions strip. Three weeks later
SHE forwards to a parent on a U10 girls team in the SAME
program — the loop compounds at program scale.

### Growth

The "show me" moment is the second-sheet candidate list with
team names labelled next to first names — the screenshot a
parent forwards to ANOTHER parent on the cross-program car-
pool text thread WITH the in-product CTA visible ("the app
lets you send this to me directly — no screenshot needed").
The screenshot is the highest-shape acquisition surface for
the program-scope parent → parent edge because every parent
in the program has 5-10 candidates and each opening fires
the receiving parent into the existing parent-portal viral
graph (0019 / 0050 / 0060 / 0072) under the right coach.
Compounds three ways. (1) The program-graph completion
compound — every cross-team forward opens the receiving
parent's first portal session under HER coach, which fires
that coach's parent-report engagement signal (the existing
0041 / 0056 rollup) and pulls the neighbor coach back into
the app. (2) The director-tier conversion compound — every
cross-team forward written into `parent_forward_signals.cross_team
= true` is a signal the existing 0028 / 0071 / 0077 director
surfaces can surface as "your program's parents are sharing
across teams" — the strongest possible Org-tier retention
signal. (3) The cross-program leapfrog compound — when the
receiving parent (Devon's mom) sees the portal under her own
coach's voice, she is structurally more likely to forward to
a parent in a DIFFERENT program three weeks later (the
existing 0050 forward-to-director path), which opens the
program → program acquisition edge 0077 already opened on
the director side. Distinct from every shipped parent-portal
surface because every shipped surface is single-team or
multi-kid-same-parent; THIS is the in-program cross-team
parent → parent edge — the next-largest viral wedge after
0079.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `070_parent_forward_signals_cross_team.sql`
  ALTERS `parent_forward_signals` (shipped by 0079, migration
  `069`) to add `cross_team BOOLEAN NOT NULL DEFAULT FALSE`. Per
  LESSONS#0103 — OPTIONAL widening on a shared type keeps every
  0079 caller byte-identical (default false; in-team forwards
  inherit the existing meaning). Index unchanged. Per
  LESSONS#0006 — confirm `070` is the next free integer at pickup
  (069 is reserved by 0079). Per LESSONS#0088 / #0114 — strip
  `--` comments AND the structural identifier names
  (`parent_forward_signals`, `cross_team`) before the banned-
  token sweep. NO column on any sacred table; the ADDed column
  is a flag, not minor data, and the migration's `--` header
  comment explicitly says so as the COPPA approval trail. (vitest
  under `tests/migrations/070-parent-forward-signals-cross-
  team.test.ts`: scan migration body with `--` stripped +
  identifier strip; asserts only `cross_team BOOLEAN NOT NULL
  DEFAULT FALSE`; no other column changes; the 0079 UNIQUE +
  index untouched.) Per LESSONS#0074 — bump the next-prefix
  sentinel test.

- [ ] The existing parent-portal `GET /api/share/[token]/route.ts`
  (real path read at pickup per LESSONS#0096; 0079 widened it
  to return `teamMates`) is EXTENDED to also return
  `programMates: Array<{ player_id: string; first_name: string;
  team_name: string }>` — the OTHER players in the same
  `players.team_id`'s `teams.org_id` whose `parent_email` exists
  AND whose team has at least one row in `team_coaches` (the
  team has a head coach on SportsIQ — per LESSONS#0057 NEVER
  read `teams.coach_id`; team-coach lives in `team_coaches`).
  Per LESSONS#0036 — explicit `.select()` allow-list: the read
  returns ONLY `players.id, players.first_name, teams.id,
  teams.name`; NEVER DOB, NEVER jersey, NEVER medical_notes,
  NEVER photo URLs, NEVER `parent_email`, NEVER any sender-side
  contact info. The candidate list is capped at the smallest
  reasonable scale (50 entries per program — confirm at pickup,
  but keep the response small so a 600-player program does not
  inflate the portal-page server-render). Per LESSONS#0112 —
  prefer WIDENING the existing `from('players')` select over a
  new `from('teams')` call (lower blast radius); thread the
  team join through a single read with the existing parent-
  portal GET's join shape. Per LESSONS#0049 / #0092 / #0100 /
  #0110 / #0118 — Glob `tests/api/share*` AND
  `tests/api/parent*` at pickup; extend every
  `mockReturnValueOnce` queue AND broaden every
  `mockImplementation((table) => ...)` whitelist (the 0079
  ship surfaced the EXACT same sweep — mirror it at the team-
  coaches table widening too). The widened GET is on the
  same publicPaths entry the 0079 widening already covered
  (LESSONS#0058 — `/api/share/*` is already public; no new
  publicPaths entry needed). (vitest under
  `tests/api/share-token-program-mates.test.ts` — new): (i)
  a token for a player whose program has TWO other teams each
  with a head coach AND each with parent_emails → returns
  programMates with two team names labelled; (ii) a program
  with a team whose coach is NOT on SportsIQ → that team's
  players are EXCLUDED; (iii) a program with a team whose
  players have NO parent_email → that team's players are
  EXCLUDED; (iv) the sender's OWN team is excluded from
  programMates (it appears in teamMates per 0079); (v) the
  response payload contains no surname, no parent_email, no
  DOB, no jersey number, no medical_notes, no photo URLs;
  (vi) planted COPPA-sensitive fields on the underlying rows
  are NEVER read; (vii) the response is capped at 50 entries
  per program; (viii) a free-tier neighbor coach's team's
  parent-portal player is in the candidate list (tier-agnostic
  per the parent-portal contract — LESSONS#0096). Per
  LESSONS#0072 — never `delete` fields on the read row; spread
  to a new object instead.

- [ ] The existing `POST /api/share/parent-forward/route.ts`
  (shipped by 0079 — read at pickup per LESSONS#0096) is
  EXTENDED to accept a `recipientPlayerId` that is on a
  DIFFERENT team in the SAME `org_id` (the cross-team
  contract). The route: (a) keeps the 0079 same-team happy
  path BYTE-IDENTICAL; (b) when the recipient is on a
  different team, asserts the recipient's `teams.org_id`
  equals the sender's `teams.org_id` (the cross-team-same-
  program contract); (c) mints the recipient's portal token
  against the RECIPIENT'S OWN coach (NOT the sender's coach
  — per the existing share-mint helper read at pickup); (d)
  writes the `parent_forward_signals` row with `cross_team =
  true` when the team_ids differ AND `cross_team = false`
  when they match (preserves 0079 attribution); (e) returns
  `400 { error: 'not_in_same_program' }` when the recipient
  player is in a DIFFERENT org_id (NOT the cross-program
  contract — v1 caps at same program); (f) keeps the 0079
  anti-spam UNIQUE-based 429 / silent-no-op idempotency
  contract (sender_player_id + recipient_player_id UNIQUE);
  (g) keeps every other 0079 contract byte-identical
  (sanitized note, sanitized senderFirstName, best-effort
  on mail failure, allow-list selects). Per LESSONS#0049 /
  #0092 / #0100 / #0110 / #0118 — Glob
  `tests/api/share-parent-forward*` AND every
  `tests/api/parent*` at pickup; extend each queue AND
  broaden every `mockImplementation((table) => ...)`
  whitelist (the 0079 spec shows the exact sweep). Per
  LESSONS#0072 — strip the recipient's `parent_email` from
  any forwarded payload via spread, not delete. Per
  LESSONS#0058 — the path is already public via the
  `/api/share/*` allow-list (no publicPaths change). (vitest
  under `tests/api/share-parent-forward-cross-team.test.ts`
  — new): (i) recipient on a different team in the SAME
  org_id → 200 + signal row with `cross_team = true`; (ii)
  recipient on the same team → 200 + `cross_team = false`
  (0079 happy path byte-identical); (iii) recipient in a
  DIFFERENT org_id → 400 `{ error: 'not_in_same_program' }`;
  (iv) the minted portal URL is for the recipient's OWN
  coach (NOT the sender's coach — assert the returned
  `data-share-url` exposes the recipient's team token);
  (v) the response payload NEVER contains the recipient's
  `parent_email`, NEVER contains the recipient's
  surname, NEVER contains the recipient coach's name or
  email; (vi) idempotency: re-tap on the same edge
  within 7 days → 429 / silent no-op AND only ONE signal
  row; (vii) every existing 0079 case passes
  byte-identical (regression).

- [ ] A new pure helper extension
  `src/lib/parent-forward-email.ts` (extends the 0079
  helper or sibling — confirm at pickup per LESSONS#0096).
  Adds a CROSS-TEAM template variant that the route
  selects when `cross_team === true`. The variant's
  subject: "Sarah on a neighboring team in your program
  sent you this week's SportsIQ report." Body: two
  sentences in the existing 0079 cardboard voice (read
  at pickup), the sender's sanitized note rendered in a
  blockquote, the sender's team name labelled
  ("Sarah's daughter is on the U10 Hawks in the
  <program_name> program"), ONE button "Read
  <recipientKidFirstName>'s report" deep-linking to the
  recipient's OWN portal URL under HER coach. Per
  LESSONS#0023 — every copy variant positively
  instructed; banned-word matrix scan over a matrix of
  sender / sender_team / sender_program / recipient
  first names / recipient team names / sport fixtures.
  Per LESSONS#0061 — defensive scans use literal spaces,
  not `\s+`. Per LESSONS#0063 — scope leak assertions
  to rendered shapes (`/jersey:\s+\d+\b/i`,
  `/parent_email:.+@/`) NOT bare digits that could
  collide with sport date numbers in body copy. (vitest
  under `tests/lib/parent-forward-email-cross-team.test
  .ts` — new): (i) cross-team build → subject + body
  contain the sender's team name + program name +
  recipient kid first name + the note in a blockquote;
  (ii) the deep-link URL is the RECIPIENT's own portal
  URL (NEVER the sender's); (iii) the body never
  contains the sender's coach's name, never the
  recipient's coach's email, never any surname; (iv)
  matrix banned-word scan covers every combination;
  (v) the 0079 same-team template variant is BYTE-
  IDENTICAL (regression); (vi) the helper rejects a
  cross-team payload missing the sender's
  `senderTeamName` (template precondition).

- [ ] The existing parent-portal report-page component
  for the forward sheet (real path at pickup —
  `src/components/parent-portal/parent-forward-on-team-
  button.tsx` per the 0079 ship) is EXTENDED with a
  SECOND tab "In your program" alongside the existing
  "On your team" tab. The second tab's candidate list
  renders `programMates` (first_name + team_name
  labelled, e.g. "Liam — U10 Hornets"); NEVER surnames;
  NEVER parent contact. On Send, the route's payload
  includes the same `recipientPlayerId` but for a
  DIFFERENT team in the same program. Per LESSONS#0022
  — multi-CTA strict-mode safety: the second tab gets
  its own `data-testid="parent-forward-in-program-
  tab"` AND the candidate row gets `data-testid="parent-
  forward-in-program-candidate"`, AND the sheet gets a
  separate `data-testid="parent-forward-in-program-
  sheet"` (the 0079 sheet keeps its existing
  `parent-forward-on-team-sheet`). Per LESSONS#0011 —
  expose `data-share-url={recipientPortalUrl}` on the
  sheet AFTER a successful send so the test asserts
  the exact forwarded URL. Per LESSONS#0029 / #0082 —
  every assertion scoped to a data-testid; no page-
  wide `getByText(/Liam/)` that could collide with
  other surfaces. Per LESSONS#0065 / #0066 / #0162 —
  smallest possible touch (one new tab + one new
  candidate-row component reused with a team-name
  badge). (vitest component test): (i) the second tab
  renders alongside the on-team tab; (ii) the
  candidate list shows first names AND team names
  labelled; (iii) the candidate list excludes the
  sender's OWN team's players; (iv) the candidate
  list excludes players whose team has no head coach;
  (v) on Send, the POST payload is correctly shaped;
  (vi) a 200 response renders the cross-team toast
  ("Sent to one parent in your program"); (vii) a
  429 response renders the already-sent toast; (viii)
  every existing 0079 same-team render case is
  BYTE-IDENTICAL.

- [ ] Tier / feature gating: the forward action is
  available on EVERY parent-portal surface regardless
  of EITHER the sender's coach's OR the recipient's
  coach's tier — the portal is the only surface in
  the product not gated by tier (read at pickup per
  LESSONS#0096); mirror that posture exactly. NO new
  feature key. The receiving parent's portal session
  is the same parent-portal surface (NOT a paid Coach
  surface). (vitest: a free-tier neighbor coach's
  team's player IS in the candidate list; the email
  dispatches; the receiving parent's portal session
  renders.)

- [ ] Privacy / COPPA contract: THIS is the load-
  bearing contract for this ticket. (a) The
  `programMates` read returns ONLY first names + team
  names + opaque ids — NEVER surname, NEVER DOB,
  NEVER parent_email, NEVER parent_phone, NEVER
  jersey, NEVER medical_notes, NEVER photo URLs. (b)
  The `/api/share/parent-forward` POST NEVER returns
  the recipient's `parent_email` in the response
  payload (the 0079 contract; preserved). (c) The
  `parent_forward_signals` row stores ONLY player-id
  edges + team scope + the new `cross_team` flag —
  NO names, NO emails, NO note text. (d) The
  recipient's portal URL is the SAME parent-portal
  token shape every other surface uses (read at
  pickup) — no special cross-team format. (e) The
  sender's first name + the note are the ONLY PII
  the sender provides; both are sanitized; neither
  is stored (the note is rendered in the email body
  and is gone after dispatch). (f) The receiving
  parent lands on HER OWN kid's portal under HER
  OWN coach (NEVER the sender's coach) — the consent
  is the SAME consent the recipient's coach already
  granted. (g) The sender is NEVER told the
  recipient's full name, email, phone, recipient
  coach's name, or recipient coach's email — only
  the recipient kid's first name + team name. (h)
  The cross-team forward NEVER crosses the program
  boundary (v1 caps at same `org_id`). Per
  LESSONS#0036 — every `.select()` is an explicit
  allow-list. Per LESSONS#0088 / #0114 — the
  migration's COPPA scan strips `--` comments AND
  structural identifiers. (vitest: planted COPPA-
  sensitive fields on player rows are NEVER read by
  the GET, the POST, or the email helper; the
  response payloads contain no parent contact info;
  the candidate list renders no surnames; the email
  body contains no email address, phone, or
  surname.)

- [ ] Voice contract: every new user-facing string
  (the second-tab label, the candidate-row label
  with team name, the pre-filled textarea template,
  the cross-team toast copy, the email subject and
  body across the matrix) contains NO AGENTS.md
  banned word per LESSONS#0023. Mirror the existing
  0079 / 0050 / 0072 parent-side cardboard voice
  exactly. Per LESSONS#0061 — defensive scans use
  literal spaces. The variable substitution NEVER
  produces a banned token for any sender /
  recipient / team-name / program-name / sport-name
  matrix. Per LESSONS#0033 — multi-line email
  bodies committed via HEREDOC, never bare `-m`.
  (vitest: render each component variant and scan
  rendered text; scan the email-template matrix;
  scan the pre-filled textarea variants; scan the
  toast copy.)

- [ ] Regression: the existing 0079 same-team
  forward flow is BYTE-IDENTICAL (every existing
  case passes unchanged — same-team is the default
  tab, `cross_team = false` is the default flag).
  The existing parent-portal page `/share/[token]`
  is BYTE-IDENTICAL on every other surface (the
  new tab is added inside the existing 0079 sheet
  primitive). The existing 0009 / 0019 / 0034 /
  0041 / 0050 / 0060 / 0070 / 0072 parent-portal
  surfaces are BYTE-IDENTICAL. The existing
  `parent_forward_signals` writes for in-team
  forwards (the 0079 flow) write
  `cross_team = false` by default and the existing
  attribution surfaces (the 0050 / 0072 reads)
  see the same shape. (vitest: snapshot the
  named routes / components against seeded
  fixtures pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — pre-mint a SECOND TEAM in the
  E2E org (the existing E2E team is the sender's
  team) with TWO new players, each carrying a
  `parent_email` like `bears-mom-1@e2e.test` and
  `bears-mom-2@e2e.test`, AND the second team
  having a head coach row in `team_coaches`
  (per LESSONS#0057 — NEVER `teams.coach_id`).
  Pre-mint a `parent_shares` token for the
  sender's player (the existing 0079 / 0009
  share-mint contract — confirm at pickup). Per
  LESSONS#0084 — seed in the idempotent
  DELETE-then-INSERT block; every new `coaches`
  row has a matching `auth.users` row (the 0079
  ship lessons surfaced this; same posture
  applies to the second-team head coach). Per
  LESSONS#0101 — UUIDs in the next free range
  (after 0079's reservations — confirm at
  pickup). Per LESSONS#0121 — `grep -n
  "first-name" tests/e2e/fixtures/seed.sql`
  before writing the assertion; assert on
  names that ARE seeded (the spec writes one
  fresh second-team player named e.g. "Bear"
  + one named "Cub" — read the actual seed at
  assertion-write time). Per LESSONS#0009 —
  the parent-portal page is a SERVER component;
  every assertion MUST be backed by a real
  seeded row. Playwright spec: (a) navigate
  to the sender's parent-portal URL, tap the
  forward button, switch to the new "In your
  program" tab, assert the candidate list shows
  two first-name + team-name entries; (b) tap
  the first candidate (e.g. "Bear — Bears
  U12"), type a sender first name and a
  custom note, tap Send; (c) assert the POST
  to `/api/share/parent-forward` returns 200
  AND a `parent_forward_signals` row with
  `cross_team = true` exists in the seeded
  DB; (d) parse the dispatched email from
  the mail-pipeline test harness (existing
  0042 / 0050 / 0072 / 0079 pattern), assert
  the subject contains the sender's
  program name AND the body contains the
  sender's note AND the body contains a
  portal link for the second-team player;
  (e) navigate to the recipient portal URL,
  assert it renders the second-team coach's
  voice surface for that player (NOT the
  sender's coach); (f) navigate back to the
  sender's URL, tap the button again, assert
  the candidate list shows the already-sent
  state OR the 429 toast on a re-Send
  attempt. Scope every assertion by
  data-testid per LESSONS#0022 / #0029 /
  #0082. Skip when E2E creds are unset.

## Out of scope

- A "Send to one parent in a DIFFERENT
  PROGRAM" surface (cross-program parent →
  parent). v1 caps at same `org_id` — the
  cross-program edge requires its own
  consent-collection posture and an
  invitation primitive that v1 deliberately
  defers.
- A "Send to MULTIPLE parents across
  multiple teams" one-tap bulk action. v1
  is point-to-point per the 0079 contract;
  bulk is a separate ticket.
- A REPLY-TO-FORWARD surface for the
  receiving parent (a back-channel to the
  sender). v1 ends at the receive + portal-
  open action.
- A COACH-side notification ("a parent on
  team A forwarded the report to a parent
  on YOUR team B"). v1 is silent on the
  receiving coach's side beyond the
  attribution row; a dedicated coach-side
  surface is a separate ticket.
- A SETTINGS toggle for the receiving
  parent ("don't forward me cross-team
  reports"). v1 routes through the existing
  unsubscribe footer; per-edge opt-out is a
  separate ticket.
- A RATE-LIMIT per receiving parent across
  teams ("don't receive more than N cross-
  team forwards per week"). v1's UNIQUE
  constraint on `(sender_player_id,
  recipient_player_id)` enforces one edge
  per pair; a per-recipient global cap is a
  separate ticket.
- AN AI-WRITTEN cross-team note. v1 is the
  same deterministic template fill 0079
  shipped; AI generation is a separate
  ticket with its own voice-anchoring
  contract.

## Engineering notes

Files / patterns the dev should touch.

- `supabase/migrations/070_parent_forward_signals_cross_team.sql`
  (new). Per LESSONS#0006 — confirm `070` is the next free
  integer at pickup (069 is reserved by 0079; this ticket's
  sibling 0081 / 0082 / 0083 reserves 071 / 072 / 073).
  ALTER TABLE adds `cross_team BOOLEAN NOT NULL DEFAULT
  FALSE`.
- `src/types/database.ts` — extend `ParentForwardSignal`
  with `cross_team: boolean`. Per LESSONS#0103 — optional
  widening keeps the 0079 callers byte-identical.
- The existing `/api/share/[token]/route.ts` (real path at
  pickup per LESSONS#0096; 0079 widened this with
  `teamMates`). Extend the same `.select()` allow-list to
  also derive `programMates` via the existing team-coaches
  join (LESSONS#0057 — `team_coaches`, NEVER
  `teams.coach_id`). Per LESSONS#0112 — widen the existing
  read; do NOT add a new `from()` call (lower blast
  radius).
- `src/app/api/share/parent-forward/route.ts` (existing —
  shipped by 0079). Extend with the cross-team branch.
  Per LESSONS#0036 — best-effort posture on mail failure.
  Per LESSONS#0049 / #0092 / #0100 / #0110 — Glob
  `tests/api/share*` AND `tests/api/parent*` at pickup;
  extend every queue. Per LESSONS#0118 — broaden every
  sibling `mockImplementation((table) => ...)` whitelist
  for the new `team_coaches` read.
- `src/lib/parent-forward-email.ts` (existing — shipped by
  0079). Add the cross-team template variant.
- `src/components/parent-portal/parent-forward-on-team-
  button.tsx` (existing — shipped by 0079). Add the
  "In your program" tab + the new candidate-row component.
  `data-testid="parent-forward-in-program-tab"`,
  `data-testid="parent-forward-in-program-sheet"`,
  `data-testid="parent-forward-in-program-candidate"`.
- The existing parent-portal report page (the page that
  mounts the 0079 button — real path at pickup). One JSX
  prop addition (passing `programMates` from the server-
  side fetch to the existing button).
- `src/lib/supabase/middleware.ts` — NO change.
  `/api/share/*` is already in publicPaths from the 0079
  contract.
- `src/lib/tier.ts` — NO new feature key.
- `src/components/ui/upgrade-gate.tsx` — NO new
  registration.
- `tests/migrations/070-parent-forward-signals-cross-team
  .test.ts` (new).
- `tests/migrations/no-new-migration-XX.test.ts` — bump
  the next-prefix sentinel.
- `tests/api/share-token-program-mates.test.ts` (new) —
  every GET extension case.
- `tests/api/share-parent-forward-cross-team.test.ts`
  (new) — every cross-team route case.
- `tests/lib/parent-forward-email-cross-team.test.ts`
  (new) — every email-template cross-team case.
- `tests/components/parent-forward-on-team-button-cross-
  team.test.tsx` (new) — every render case for the
  second tab.
- `tests/api/share*.test.ts` AND `tests/api/parent*.test
  .ts` (existing — Glob at pickup per LESSONS#0110) —
  extend every `mockReturnValueOnce` queue AND broaden
  every `mockImplementation((table) => ...)` whitelist.
  Per LESSONS#0116 — empty Glob is a no-op.
- `tests/e2e/parent-forward-cross-team-flow.spec.ts`
  (new). Seed extension per the AC. UUIDs in the next
  free range per LESSONS#0101. Skip when E2E creds are
  unset.
- New deps: NO. Migration: YES (070 or bump). Env vars:
  NO new. AI prompt change: NO. Tier feature key: NO
  new key.
- LESSONS to anchor: #0006 (prefix uniqueness), #0009
  (server-component parent portal — every assertion
  backed by seeded row), #0011 (data-share-url pattern
  for the post-send URL assertion), #0022 / #0029 /
  #0082 (multi-CTA + multi-tab page strict-mode safety
  — every tab and candidate row needs a data-testid),
  #0023 (positive voice; numbers spelled out; mirror
  existing 0079 / 0050 / 0072 parent voice), #0033
  (commit multi-line / special-char strings via
  heredoc), #0034 / #0088 / #0114 (strip `--` comments
  AND structural identifiers on COPPA sweep), #0036
  (best-effort `.select()` allow-lists), #0049 /
  #0092 / #0100 / #0110 / #0118 (mock queue +
  whitelist spillover — Glob every share / parent
  test and broaden every mockImplementation
  whitelist), #0055 (route handler call posture),
  #0057 (team-coach ownership lives in
  `team_coaches`, NEVER `teams.coach_id`), #0061
  (literal space on defensive scans), #0063 (scope
  leak assertions to rendered shapes, not bare
  digits), #0065 / #0066 / #0162 (parent-portal
  hotspot — smallest possible touch), #0072 (never
  `delete` a field on a DB-read object — spread to
  a new object; applies to stripping
  `parent_email` from any returned payload), #0084
  / #0101 (seed posture; UUID range), #0096
  (schema wins over prose — at pickup read the
  actual 0079 share-token GET shape, the actual
  share-mint helper, the actual `team_coaches`
  schema, the actual `parent_forward_signals`
  schema, the actual mail pipeline, the actual
  parent-portal page mount point), #0103 (optional
  widening on the shared `ParentForwardSignal`
  type), #0112 (widen the existing parent-portal
  GET to include `programMates` rather than a new
  from() call), #0116 (Glob sweep that returns
  empty is a no-op), #0118 (broaden sibling
  whitelists for the new `team_coaches` read),
  #0121 (grep the seed for the assertion name
  BEFORE writing the e2e spec).

## Implementation log

- 2026-06-14 [implementation-dev] Picked up at the top of the queue
  (only groomed P1 with no in-flight PR). Branch
  `feat/0080-parent-portal-cross-team-same-program-forward`.
  Schema-wins-over-prose reconciliation (LESSONS#0096): the ticket
  prose said the new migration prefix is `070`, but at pickup `ls
  supabase/migrations/` shows 070 is already taken by
  `070_coach_thank_messages.sql` (ticket 0081, shipped 2026-06-14)
  — so the next free prefix is `071`. The migration filename
  becomes `071_parent_forward_signals_cross_team.sql` and the
  no-new-migration sentinel pins file count at 72.
