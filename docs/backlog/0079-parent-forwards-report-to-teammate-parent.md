---
id: 0079
title: When a parent opens their kid's report on the portal, give them one tap to forward this week's report to ONE other parent on the same team — "send this to Liam's mom too" — so the parent-portal acquisition graph finally has a parent → parent edge
status: in-progress
priority: P2
area: parent-portal
created: 2026-06-09
owner: product-groomer
---

## User story

As a parent of a kid on a U10 basketball team who just read this week's
parent report (0009 / 0013 / 0016 / 0034 / 0041 / 0070) on the portal,
loved it, and would normally text it to my friend on the team — Liam's
mom — with "look at what coach wrote about Maya this week, your kid is
on this team too you should read these," I want one quiet tap directly
on the parent-portal page that says "Send this to one other parent on
the team" with a tiny sheet to type the other parent's first name and a
single textarea pre-filled with my reason for sharing, so the moment I
forward this report to Liam's mom — which I would have done anyway by
screenshot and text — becomes a deliberate in-product action that opens
Liam's mom's first parent-portal session FOR HER OWN KID, and the
parent-side acquisition graph the product has been building (0019 /
0050 / 0060 / 0072) finally has the missing parent → parent edge.

## Why now (four lenses)

### Product Owner

The parent-portal acquisition surfaces shipped so far route parent
energy in three directions — parent → coach signup (0019), parent →
director (0050), parent → other-kid's-coach (0060), returning parent
→ dormant coach (0072). What is MISSING is the simplest, highest-
frequency parent action: a parent on the team forwarding the report to
ANOTHER PARENT ON THE SAME TEAM. Today that forward happens — but it
happens as a screenshot in a text message and the receiving parent
lands NOWHERE that opens her own portal session for HER own kid. The
smallest meaningful unit of value is: (a) a new
`POST /api/share/parent-forward` (the existing `/share/[token]`
parent-portal page is public — read at pickup per LESSONS#0096) that
accepts `{ shareToken, recipientFirstName, recipientParentEmail,
senderFirstName, note }` AND looks up the OTHER PLAYERS on the same
team via the existing `players.team_id` AND finds the
ONE matching player whose existing `players.parent_email` matches the
recipient (the consent posture: the receiving parent's email is
ALREADY on file because their kid is on the same team — the coach has
their email; we are not collecting any new contact); (b) the route
generates the existing
parent-portal token for the RECIPIENT'S OWN PLAYER (via the existing
parent-portal share-token mint — read at pickup) and dispatches one
email with the subject "Sarah at Hawks U10 sent you this week's
SportsIQ report" and a body that contains the SENDER's note (free
text typed by the sender, max 200 chars, sanitized) AND a link to the
RECIPIENT's own kid's portal token (NOT the sender's token — the
receiving parent lands on her OWN kid's report, not the sender's);
(c) a small `<ParentForwardOnTeamButton />` mounted on the existing
parent-portal report page that opens a sheet (read existing 0050 /
0056 share-sheet posture at pickup) with a typed search across the
team's OTHER families (FIRST NAMES ONLY, never full names — see
Privacy contract); (d) ONE new
`parent_forward_signals` row written per forward for downstream
attribution (so the existing 0072 returning-parent and the existing
0050 director-handoff surfaces can credit the originating parent).
NO new tier feature key (the action is free for the parent — the
parent is not a tier-paying entity), NO AI generation, ONE migration,
ONE new email template.

### Stakeholder

This is the moat-deepening primitive for the parent-side acquisition
graph and the structurally hardest viral edge a forms-app competitor
can replicate because it requires BOTH a team-roster parent-contact
graph AND a parent-portal share-token mint per recipient. Three
compoundings, all structurally invisible to a competitor. (1) The
parent-graph completion moat — every parent who reads a portal report
has 8-15 other parents on the team they sit next to on the sideline;
opening even 1-in-10 of those forwards is multiplying parent-portal
adoption per team without ANY coach action. (2) The portal-retention
compound — every receiving parent who lands on their OWN kid's
portal session via a forward enters the existing 0009 / 0034 / 0070
parent-portal surfaces, which the coach has already been writing for
that kid (the report exists; the parent just had not opened it yet).
The coach's existing investment in parent reports immediately re-
prices because the audience grew. (3) The cross-edge compound — a
receiving parent who lands on her own kid's portal session is the
EXACT entry point for the existing 0019 (start your own team) and
0050 (forward to director) and 0060 (forward to other-kid's coach)
surfaces — every parent who arrives via a forward becomes a new
candidate origin for every shipped parent-side viral edge. The
SAME compound that 0050 / 0060 enabled for receiving-parent → other-
program now fires inside the same team for adjacent parents.
Distinct from 0019 (parent → coach), 0050 (parent → director), 0060
(parent → other-kid's coach), 0072 (returning parent → dormant
coach). THIS is the missing parent → parent edge on the SAME team.

### User (the sending parent, Maya's mom, Saturday 10:18am after
practice)

She is in the parking lot. She just opened the link from the coach's
weekly report and read the two paragraphs about Maya. She wants to
send it to Liam's mom because Liam is Maya's best friend on the team
and Liam's mom is always asking how practice went. Today she would
screenshot it. Instead, at the BOTTOM of the report page (BELOW the
existing 0009 reaction strip, BELOW the existing 0019 "start your own
team" CTA, BELOW the existing 0050 "forward to director" — confirm
ordering at pickup), a new small zinc-500 line: "Want another
parent on the team to see this? Send it to one of them." Below it,
ONE small orange-pill button: "Send to one parent." She taps. A
small sheet opens. She types "Liam" in the first-name search; one
match appears (the team's OTHER family whose kid is named Liam) with
a small avatar circle (just initial, no photo). She taps. A
textarea pre-loads "I thought you'd want to read this — Maya and
Liam are on the same team, and the coach's reports have been really
helpful. — Sarah." She edits the last word, taps "Send." A
confirmation sheet shows "Sent to one parent on your team." The
total interaction was 9 seconds. She did NOT search the team
roster — she searched ONLY by Liam's first name. She did NOT see
Liam's mom's email or phone (it is server-only). She did NOT see
Liam's last name. The receiving parent gets an email three minutes
later.

### User (the receiving parent, Liam's mom, Saturday 10:21am on her
phone)

She gets an email. Subject: "Sarah at Hawks U10 sent you this week's
SportsIQ report." Body: "Hi — Sarah on your team sent you a note.
'I thought you'd want to read this — Maya and Liam are on the same
team and the coach's reports have been really helpful.' Want to read
this week's Hawks report about Liam?" One button: "Read Liam's
report." She taps. She lands on a parent-portal page with LIAM'S
WEEK in coach Sarah's voice — the existing 0070 cross-team coach-
voice posture. She is on her OWN kid's portal session. She reads
the existing 0009 weekly star, the existing 0034 returning-player
context, the existing 0041 reactions strip. Three days later she
opens the existing 0050 forward-to-director CTA and another edge
fires. The forward compounded.

### Growth

The "show me" moment is the parent-portal page with the small
"Send to one parent" CTA at the bottom — the screenshot a parent
DMs to another parent on the team WITH the in-product action ("the
app has a button to send this to you, so I'm using it"). That
screenshot is the highest-frequency parent action surface the
product can ship because every parent who reads a report has
parents-of-teammates they would naturally forward to. Compounds three
ways. (1) The parent-graph completion compound — the highest-
frequency forwarding behavior on the team becomes an in-product
edge, which surfaces every receiving parent into the existing
parent-portal viral graph (0019 / 0050 / 0060). (2) The coach-
retention compound — every receiving parent who opens the portal
fires a parent-side reaction (the existing 0041 / 0056 rollup),
which fires a coach-side "your parents are engaged" signal, which
pulls the coach back to write more reports (the existing 0023 /
0041 / 0066 retention pull). (3) The acquisition compound — when
the receiving parent eventually forwards to ANOTHER parent on the
SAME team, the loop compounds geometrically per team. Distinct from
every shipped parent-portal surface because every shipped surface
routes parent energy to a NEW surface (start-a-team, contact-a-
director, contact-another-coach); THIS is the in-team forward
that creates new parent-portal viewers WITHOUT a new coach action.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `069_parent_forward_signals.sql`
  adds `parent_forward_signals (id UUID PRIMARY KEY
  DEFAULT gen_random_uuid(), sender_player_id UUID NOT
  NULL REFERENCES players(id) ON DELETE CASCADE,
  recipient_player_id UUID NOT NULL REFERENCES
  players(id) ON DELETE CASCADE, team_id UUID NOT
  NULL REFERENCES teams(id) ON DELETE CASCADE,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at TIMESTAMPTZ NULL, UNIQUE
  (sender_player_id, recipient_player_id))`. Index:
  `(team_id, dispatched_at DESC)`. The table records
  ONLY player-id edges and a team scope — NO names,
  NO emails, NO phone numbers, NO note text (the
  note is sent in the email and never stored). Per
  LESSONS#0006 — confirm `069` is the next free
  integer at pickup (0078 reserves `068`); bump if a
  sibling claimed. Per LESSONS#0088 / #0114 — strip
  `--` comments AND the structural identifier names
  (`parent_forward_signals`, `sender_player_id`,
  `recipient_player_id`, `team_id`, `dispatched_at`,
  `opened_at`) before the banned-token sweep. Per
  LESSONS#0034 — the migration's `--` header
  comment explicitly NAMES the COPPA-sensitive fields
  this table deliberately does NOT contain (parent
  email / parent phone / sender name / note text) as
  the COPPA approval trail; the test strips
  comments first. NO column on any sacred table.
  (vitest under `tests/migrations/069-parent-
  forward-signals.test.ts`: scan migration body
  with `--` stripped + identifier strip; column
  allow-list; UNIQUE constraint; index; FK
  cascades; NO new column on sacred tables.) Per
  LESSONS#0074 — bump the next-prefix sentinel.

- [ ] A new `POST /api/share/parent-forward/route
  .ts`. The route: (a) accepts
  `{ shareToken: string, recipientPlayerId: string,
  senderFirstName: string, note: string }`; (b)
  resolves the sender's player + team via the
  existing parent-portal share-token contract (read
  at pickup per LESSONS#0096 — the
  `/api/share/[token]` GET shape); (c) verifies
  `recipientPlayerId` belongs to the SAME team_id
  (the in-team contract); (d) reads the
  recipient player's
  `parent_email` server-side (NEVER exposed in
  the request or response); (e) sanitizes
  `senderFirstName` (alpha, dash, apostrophe;
  max 30 chars); (f) sanitizes `note` (strip
  HTML, max 200 chars; reject if empty after
  sanitization); (g) mints a NEW parent-portal
  share token FOR THE RECIPIENT PLAYER via the
  existing share-mint helper (read the existing
  0009 / 0034 / 0041 / 0070 share-mint at
  pickup — confirm the path); (h) dispatches
  ONE email via the existing 0042 / 0072 /
  0050 mail pipeline (real path at pickup);
  (i) writes ONE `parent_forward_signals` row
  (idempotent on `(sender_player_id,
  recipient_player_id)` per the UNIQUE
  constraint — re-tap does NOT re-send the
  email); (j) returns `200 { ok: true }` on
  success; (k) returns `400 { error:
  'invalid_share_token' }` on bad token;
  (l) returns `400 { error:
  'not_on_same_team' }` if the recipient
  player is on a different team; (m) returns
  `400 { error: 'no_parent_email_on_file' }`
  if the recipient has no `parent_email`;
  (n) returns `429` (or silently swallows
  the second attempt) if the same sender →
  recipient edge has already fired in the
  last 7 days (anti-spam contract). The
  route is best-effort on mail failure
  (LESSONS#0036) — a mail failure still
  writes the signal row IF the
  precondition checks passed, but
  `dispatched_at` is set anyway so a retry
  uses the same idempotency. Per
  LESSONS#0036 — explicit `.select()`
  allow-lists; NEVER reads
  `medical_notes`, DOB, jersey number,
  photo URL beyond what the
  parent-portal token already exposes. Per
  LESSONS#0049 / #0092 / #0100 / #0110 —
  Glob `tests/api/share*` AND
  `tests/api/parent*` at pickup and
  extend every queue. Per
  LESSONS#0058 — `/api/share/parent-
  forward` MUST be added to
  `publicPaths` in `src/lib/supabase/
  middleware.ts` (or proxy.ts) per the
  existing parent-portal precedent.
  (vitest under
  `tests/api/share-parent-forward
  .test.ts` — new): (i) valid forward
  → 200 + signal row written + email
  queued; (ii) recipient on a
  DIFFERENT team → 400; (iii) invalid
  share token → 400; (iv) recipient
  has no parent_email → 400 (the UI
  pre-filters); (v) sanitized
  `senderFirstName` rejects
  non-alphas / oversize; (vi) note
  rejected if empty or oversize after
  sanitization; (vii) idempotency:
  same edge fired twice within 7
  days returns 429 / silent
  no-op AND writes only ONE signal
  row; (viii) the sender's
  `parent_email` is NEVER exposed in
  the response payload; (ix) the
  recipient's `parent_email` is
  NEVER exposed in the response
  payload; (x) planted DOB /
  medical_notes / jersey_number on
  player rows are NEVER read; (xi)
  the response payload contains no
  player name, no team name, no
  email, no phone.

- [ ] A new pure helper
  `src/lib/parent-forward-email.ts`.
  Exports
  `buildParentForwardEmail(args: {
  senderFirstName: string;
  recipientFirstName?: string; (NULL
  per privacy contract if not
  required by the team-roster
  read); teamName: string;
  recipientKidFirstName: string;
  note: string; recipientPortalUrl:
  string; teamSport: string }): {
  subject: string; html: string;
  text: string }`. The email subject:
  "<senderFirstName> at <teamName>
  sent you this week's SportsIQ
  report." The body: two short
  sentences in the existing 0042 /
  0050 cardboard voice (read at
  pickup); the sender's
  sanitized note is rendered in a
  blockquote; one button "Read
  <recipientKidFirstName>'s report"
  deep-links to
  `recipientPortalUrl`. Per
  LESSONS#0023 — every copy variant
  positively instructed; banned-word
  matrix scan over a matrix of
  sender / team / kid first names
  and sport / note fixtures. Per
  LESSONS#0061 — defensive scans use
  literal spaces, not `\s+`. Per
  LESSONS#0063 — the note is the
  parent's free text; the body
  defensive scan does NOT trip on
  natural content like dates and
  numbers (scope to actual leak
  shapes like
  `/parent_email:.+@/`,
  `/jersey:\s+\d+\b/i`). The
  sanitized note is HTML-stripped
  before rendering; the subject
  contains the team name and
  sender first name — never any
  player surname, never the
  recipient's email. (vitest
  under `tests/lib/parent-
  forward-email.test.ts` — new):
  (i) build with a normal note →
  subject + body contain
  sender name + team name +
  recipient kid first name +
  the rendered note in a
  blockquote; (ii) a note
  containing HTML tags is
  stripped; (iii) a note over 200
  chars is rejected before
  template-fill (the helper
  asserts pre-conditions or
  delegates to the route's
  sanitizer — confirm posture at
  pickup); (iv) rendered text
  contains no AGENTS.md banned
  word for the full matrix; (v)
  the deep-link URL is the
  recipient's own portal URL,
  NOT the sender's; (vi) no
  email address is rendered in
  the body (the sender's email
  is server-only).

- [ ] A new
  `<ParentForwardOnTeamButton />`
  component mounted on the
  existing parent-portal report
  page `/share/[token]` (real
  path read at pickup per
  LESSONS#0096). Mount BELOW
  the existing 0009 reaction
  strip, BELOW the existing 0019
  "start your own team" CTA,
  BELOW the existing 0050
  forward-to-director CTA;
  ORDERING confirm at pickup
  via LESSONS#0022 / #0081 /
  #0082 — every existing CTA on
  the page MUST stay visible
  AND a per-action data-testid
  is on every one to keep the
  multi-CTA page strict-mode-
  safe in Playwright. Render
  shape: a small zinc-500 line
  "Want another parent on the
  team to see this? Send it to
  one of them." + ONE button
  "Send to one parent." Tapping
  opens a sheet (mirror the
  existing 0050 / 0056 share-
  sheet shape at pickup): a
  first-name search input across
  the OTHER players on the team
  whose `parent_email` exists,
  rendered as a list of
  first-name-only candidates
  (consent posture — NEVER the
  full name, NEVER the parent's
  name, NEVER the parent's
  email — see Privacy contract).
  The list of candidates comes
  from extending the existing
  parent-portal GET endpoint to
  return `teamMates: Array<{
  player_id: string;
  first_name: string }>`
  for OTHER PLAYERS ON THE
  TEAM with a non-empty
  `parent_email` (allow-list
  per LESSONS#0036). On
  candidate select, a small
  textarea preloads with
  "I thought you'd want to read
  this — <recipient_first_name>
  and <my_kid_first_name> are
  on the same team, and the
  coach's reports have been
  really helpful. —
  <my_first_name>." The
  sender's first name is asked
  ONCE at the top of the
  sheet (not stored — the
  parent-portal page is auth-
  free; this is the only PII
  the sender provides). On
  Send, fire the
  `/api/share/parent-forward`
  POST. On 200, the sheet
  closes and a small toast
  "Sent to one parent on
  your team" renders. On
  429 (already-sent), the toast
  reads "You sent this to
  <recipient_first_name>
  already this week." Per
  LESSONS#0065 / #0066 / #0162
  — smallest possible touch on
  the parent-portal hotspot
  (one import + one JSX
  entry). Per LESSONS#0029 /
  #0082 — every assertion
  scoped to
  `data-testid="parent-
  forward-on-team-button"`
  AND
  `data-testid="parent-
  forward-on-team-sheet"`.
  Per LESSONS#0011 — for the
  sheet's `data-share-url`
  pattern: the sheet exposes
  `data-share-url={
  recipientPortalUrl }`
  AFTER a successful send,
  so the test can assert the
  exact forwarded URL even
  though the send mechanic is
  email, not clipboard.
  (vitest component test):
  (i) the button renders on
  the existing portal page;
  (ii) tapping opens the
  sheet with the first-name
  search; (iii) the candidate
  list contains only OTHER
  players on the team (the
  sender's own kid is
  excluded); (iv) the
  candidate list shows
  FIRST NAMES ONLY; (v) the
  candidate list excludes
  players with no
  `parent_email`; (vi)
  selecting a candidate
  pre-fills the textarea
  with the templated copy;
  (vii) Send fires the
  POST with the right
  payload; (viii) a 429
  response shows the
  already-sent toast; (ix)
  every rendered text
  contains no AGENTS.md
  banned word.

- [ ] Tier / feature gating: the
  forward action is available
  on EVERY parent-portal
  surface regardless of the
  coach's tier — the portal is
  the only surface in the
  product not gated by tier
  (read at pickup per
  LESSONS#0096); mirror that
  posture. NO new feature key.
  The receiving parent's
  portal session is the same
  parent-portal surface (NOT
  the paid Coach surface).
  (vitest: a free-tier coach's
  team's parent-portal page
  renders the forward
  button; a paid-tier coach's
  team's parent-portal page
  renders the same;
  identical to today.)

- [ ] Privacy / COPPA contract:
  THIS is the load-bearing
  contract for this ticket.
  (a) The team-roster read
  (the existing parent-portal
  GET extension that adds
  `teamMates: Array<{
  player_id, first_name }>`)
  RETURNS ONLY first names
  AND opaque ids — NEVER
  surname, NEVER DOB, NEVER
  parent_email, NEVER
  parent_phone, NEVER jersey
  number, NEVER medical_notes,
  NEVER photo URLs. (b) The
  `/api/share/parent-forward`
  POST NEVER returns the
  recipient's `parent_email`
  in the response payload —
  the email is read
  server-side and forwarded
  through the mail pipeline.
  (c) The
  `parent_forward_signals`
  row stores ONLY player-id
  edges and a team scope; it
  stores no names, no
  emails, no note text. (d)
  The recipient's portal URL
  the sender's UI gets back
  is the SAME parent-portal
  token shape every other
  surface uses (read at
  pickup) — no special
  format. (e) The sender's
  first name + the note are
  the ONLY PII the sender
  provides; both are
  sanitized and not stored
  (the note is rendered in
  the email body and is
  gone after dispatch). (f)
  The sender's own player /
  team / report content the
  recipient sees is what
  every parent-portal token
  already shows publicly —
  the consent is the SAME
  consent the coach already
  granted by sharing the
  report. (g) The
  receiving parent who
  clicks the link enters
  their OWN kid's portal —
  the recipient is shown
  their OWN kid's data (the
  coach's existing parent
  reports on their kid),
  not the sender's. (h) The
  sender is NOT told the
  recipient's full name,
  email, or phone — only
  the recipient kid's first
  name. Per LESSONS#0036 —
  every `.select()` is an
  explicit allow-list. Per
  LESSONS#0088 / #0114 —
  the migration's COPPA
  scan strips `--` comments
  AND the structural
  identifier names. (vitest:
  planted DOB / medical_notes
  / parent_phone /
  jersey_number / photo URL
  on player rows are NEVER
  read by the route or the
  sheet's GET; the response
  payload contains no
  parent contact info; the
  candidate list renders no
  surnames; the email body
  contains no email address
  or phone number.)

- [ ] Voice contract: every
  new user-facing string (the
  sheet's prompts, the
  pre-filled textarea
  template, the toast copy,
  the email subject and
  body across the matrix)
  contains NO AGENTS.md
  banned word per LESSONS#0023.
  Mirror the existing 0050 /
  0056 / 0072 parent-side
  cardboard voice exactly.
  Per LESSONS#0061 —
  defensive scans use
  literal spaces. The
  variable substitution
  NEVER produces a banned
  token for any sender /
  recipient / team / kid
  first-name / sport
  matrix. (vitest: render
  each component variant
  and scan rendered text;
  scan the email-template
  matrix; scan the
  pre-filled textarea
  variants.)

- [ ] Regression: the
  existing parent-portal
  page `/share/[token]` is
  BYTE-IDENTICAL on every
  other surface (the new
  button is mounted at the
  bottom; every existing
  surface above it is
  byte-identical). The
  existing parent-portal
  share-token mint is
  BYTE-IDENTICAL (this
  ticket calls it for the
  RECIPIENT's player but
  with the same shape).
  The existing 0019 /
  0050 / 0056 / 0060 CTAs
  remain visible AND
  strict-mode safe (per
  LESSONS#0022 — multiple
  CTAs on the same page
  need per-action
  data-testids). The
  existing 0009 / 0034 /
  0041 / 0070 reaction +
  recap surfaces are
  BYTE-IDENTICAL. The
  existing
  `parent_reactions`
  and `parent_initiated_
  invites` write paths are
  BYTE-IDENTICAL. (vitest:
  snapshot the named
  routes / components
  against seeded
  fixtures pre- and
  post-change.)

- [ ] Seeded e2e on the
  0006 fixture: seed
  extension is — pre-mint
  THREE players on the
  E2E team (one is the
  E2E sign-in coach's
  existing parent-portal
  player; two are NEW
  players with their own
  `parent_email` fields
  set to known fixture
  values like
  `liam-parent@e2e.test`
  and
  `kai-parent@e2e.test`).
  Pre-mint one
  parent-portal share
  token for the sender's
  player (existing 0009 /
  0070 share-mint
  contract — read at
  pickup). Per
  LESSONS#0084 — seed in
  the idempotent
  DELETE-then-INSERT
  block; new players +
  their team_id +
  parent_emails. Per
  LESSONS#0101 — UUIDs
  in the next free range
  (after 0076's, 0077's,
  0078's reservations).
  Playwright spec
  (parent-portal pages
  are SERVER components
  per LESSONS#0009;
  every assertion must
  be backed by a real
  seeded row — mocks
  don't intercept
  server-side fetches):
  (a) navigate to the
  sender's parent-portal
  URL (no auth — the
  portal is public per
  the existing
  publicPaths
  contract), assert the
  page renders the
  existing report AND
  the new
  `<ParentForwardOnTeamButton
  />`; (b) tap the
  button, assert the
  sheet opens and the
  candidate list renders
  TWO first-name-only
  entries (the OTHER
  team players); (c)
  select "Liam", type a
  sender first name and
  a custom note, tap
  Send; (d) assert the
  POST to
  `/api/share/parent-
  forward` returns 200
  and a
  `parent_forward_signals`
  row exists in the
  seeded DB; (e) parse
  the dispatched email
  fixture from the mail-
  pipeline test harness
  (real path at pickup —
  the existing 0042 /
  0050 / 0072 e2e specs
  show the pattern), assert
  the email subject
  contains "Hawks U10"
  (or the seeded team
  name) AND the body
  contains the sender's
  note AND the body
  contains a portal link
  for Liam's player_id
  (NOT Maya's); (f)
  navigate to that
  recipient portal URL,
  assert it renders the
  EXISTING parent-
  portal page for
  Liam (LESSONS#0009 —
  the server-side render
  pulls the seeded row);
  (g) navigate back to
  the sender's URL, tap
  the button again,
  assert the candidate
  list shows the
  already-sent state
  for Liam (or, on
  re-Send attempt, the
  429 / already-sent
  toast). Scope every
  assertion by
  data-testid per
  LESSONS#0022 / #0081
  / #0082. Skip when
  E2E creds are unset.

## Out of scope

- A "send to MULTIPLE
  parents on the team"
  one-tap action. v1 caps
  at ONE recipient per
  send — the second
  recipient is a second
  send. Bulk send is a
  separate ticket with
  its own spam-risk
  posture and consent
  cadence.
- A "Forward to a parent
  NOT on the team" surface.
  v1 enforces the same-team
  contract (the existing
  same-team graph
  guarantees the
  receiving parent's
  email is already known
  via the coach's roster
  consent). Out-of-team
  forwarding is a
  separate ticket with
  its own contact-
  collection consent
  posture.
- A "Reply to this
  forward" surface for
  the receiving parent.
  v1 ends at the receive
  + portal-open action;
  reply / chat is a
  separate ticket with
  its own multi-party
  consent posture.
- A SHARED conversation
  thread among multiple
  forwarders + receivers.
  v1 is point-to-point;
  threading is a v2
  ticket with its own
  identity surface.
- A COACH-side surface
  ("here's who forwarded
  this week's report").
  v1 is silent on the
  coach side (the
  signals row is for
  attribution only and
  feeds the existing 0050
  / 0072 surfaces
  passively); a
  dedicated coach-side
  surface is a separate
  ticket.
- An EMAIL-OPT-OUT
  toggle in the receiving
  parent's portal session
  ("don't forward me
  again"). v1 routes
  through the existing
  unsubscribe footer
  every parent-portal
  email carries (read at
  pickup); a per-edge
  opt-out is a separate
  ticket.
- A RATE-LIMIT per
  receiving parent
  ("don't receive more
  than N forwards per
  week from the same
  team"). v1's UNIQUE
  constraint enforces
  one edge per sender-
  recipient per 7 days
  (the silent 429); a
  per-recipient global
  cap is a separate
  ticket.
- A SHARE-IMAGE / open-
  graph card per forward.
  v1 reuses the existing
  0013 share preview;
  the recipient's portal
  surfaces the existing
  open-graph; no new
  graphic.
- An AI-WRITTEN
  pre-filled note. v1 is
  a deterministic
  template fill with
  parent-typed text;
  AI-written notes are a
  separate ticket with
  their own voice-
  anchoring contract.

## Engineering notes

Files / patterns the dev
should touch.

- `supabase/migrations/069_
  parent_forward_signals.sql`
  (new). Per LESSONS#0006
  — confirm `069` is the
  next free integer at
  pickup (0076 reserves
  `067`, 0078 reserves
  `068`).
- `src/types/database.ts`
  — add
  `ParentForwardSignal`
  type. NO field on any
  sacred type.
- `src/app/api/share/
  parent-forward/route.ts`
  (new) —
  `POST(request)`. Per
  LESSONS#0036 —
  `.select()` allow-lists;
  best-effort posture on
  mail failure. Per
  LESSONS#0049 / #0092 /
  #0100 / #0110 — Glob
  `tests/api/share*` AND
  `tests/api/parent*` at
  pickup; extend every
  queue. Per LESSONS#0072
  — never `delete` fields
  on a DB-read object
  (the
  `recipient.parent_email`
  strip from any forwarded
  payload uses spread,
  not delete). Per
  LESSONS#0058 — add to
  `publicPaths` (mirror
  the existing parent-
  portal contract).
- `src/lib/parent-
  forward-email.ts` (new)
  OR extension to the
  existing 0042 / 0050 /
  0072 template module
  (confirm at pickup).
- The existing
  parent-portal
  `/share/[token]` GET
  endpoint (real path
  read at pickup per
  LESSONS#0096) —
  EXTEND to return
  `teamMates: Array<{
  player_id: string;
  first_name: string }>`
  for other players on
  the team whose
  `parent_email` exists.
  Per LESSONS#0112 —
  prefer widening the
  existing read over a
  new from() call
  (lower blast radius).
  Per LESSONS#0036 —
  the allow-list MUST
  be `first_name`
  ONLY; explicit
  exclusion of every
  COPPA-sensitive
  column in the
  `.select()`
  argument.
- The existing parent-
  portal share-token
  mint helper (real
  path at pickup — the
  existing 0009 / 0034
  / 0041 / 0070 mint).
  Called by the new
  route to produce the
  recipient's portal
  URL.
- `src/components/
  parent-portal/parent-
  forward-on-team-
  button.tsx` (new).
  `data-testid="parent-
  forward-on-team-
  button"` +
  `data-testid="parent-
  forward-on-team-
  sheet"`.
- The existing
  parent-portal report
  page component (real
  path at pickup —
  likely
  `src/app/share/
  [token]/page.tsx`
  per the existing
  /share contract). One
  import + one JSX
  entry at the bottom
  of the CTA stack
  (per LESSONS#0022 —
  preserve every
  existing CTA AND add
  per-action data-testids
  on every one in the
  same PR if any are
  missing).
- `src/lib/supabase/
  middleware.ts` (or
  proxy.ts depending
  on Next 16 shape —
  confirm at pickup)
  — add
  `/api/share/parent-
  forward` to
  `publicPaths`. Per
  LESSONS#0058 — the
  proxy gates /api/*
  with a 401 by
  default; the
  publicPaths allow-
  list is the only
  override.
- The existing 0042
  / 0050 / 0072 mail-
  dispatch pipeline
  (real path at
  pickup) — the new
  template plugs in
  without changing
  the dispatch
  contract; existing
  whitelisting per
  LESSONS#0118
  applies.
- `src/lib/tier.ts`
  — NO new feature
  key.
- `src/components/ui/
  upgrade-gate.tsx` —
  NO new registration.
- `tests/migrations/
  069-parent-forward-
  signals.test.ts`
  (new).
- `tests/migrations/
  no-new-migration-
  XX.test.ts` — bump
  the next-prefix
  sentinel.
- `tests/api/share-
  parent-forward.test
  .ts` (new) — every
  route case.
- `tests/lib/parent-
  forward-email.test
  .ts` (new) — every
  email-template case.
- `tests/components/
  parent-forward-on-
  team-button.test
  .tsx` (new) — every
  render case.
- `tests/api/share*
  .test.ts` AND
  `tests/api/parent*
  .test.ts` (existing
  — Glob at pickup
  per LESSONS#0110)
  — extend every
  `mockReturnValueOnce`
  queue AND broaden
  every
  `mockImplementation
  ((table) => ...)`
  whitelist. Per
  LESSONS#0116 —
  empty Glob is a
  no-op.
- `tests/e2e/parent-
  forward-on-team-
  flow.spec.ts`
  (new). Seed
  extension per the
  AC. UUIDs in the
  next free range
  per LESSONS#0101.
  Skip when E2E
  creds are unset.
- New deps: NO.
  Migration: YES
  (069 or bump).
  Env vars: NO new.
  AI prompt change:
  NO. Tier feature
  key: NO new key.
- LESSONS to
  anchor: #0006
  (prefix
  uniqueness),
  #0009 (server-
  component parent
  portal — every
  assertion backed
  by seeded row),
  #0011 (data-
  share-url
  pattern for the
  post-send URL
  assertion), #0020
  / #38 (.test.ts),
  #0022 (multi-CTA
  page strict-mode
  safety — every
  CTA needs a
  data-testid),
  #0023 (positive
  voice; numbers
  spelled out;
  mirror existing
  0050 / 0072
  parent voice),
  #0029 / #0082
  (data-testid
  scoping on
  /share/[token]),
  #0033 (commit
  multi-line / special-
  char strings via
  heredoc), #0034
  / #0088 / #0114
  (strip `--`
  comments AND
  structural
  identifiers on
  COPPA sweep),
  #0036 (best-
  effort
  `.select()`
  allow-lists),
  #0049 / #0092 /
  #0100 / #0110 /
  #0118 (mock
  queue + whitelist
  spillover —
  Glob every
  share / parent
  test and broaden
  every
  mockImplementation
  whitelist),
  #0055 (route
  handler call
  posture), #0057
  (team-coach
  relationships
  via `team_coaches`
  if any role
  check; here NO
  role check is
  needed because
  the parent-
  portal token IS
  the contract),
  #0058
  (`/api/share/
  parent-forward`
  must be in
  `publicPaths`),
  #0061 (literal
  space on
  defensive
  scans), #0063
  (scope leak
  assertions to
  rendered shapes,
  not bare digits),
  #0065 / #0066
  / #0162
  (parent-portal
  hotspot —
  smallest
  possible touch),
  #0072 (never
  `delete` a
  field on a
  DB-read object —
  spread to a
  new object;
  applies to
  stripping the
  recipient's
  parent_email
  from any
  returned
  payload),
  #0084 / #0101
  (seed posture;
  UUID range),
  #0096 (schema
  wins over
  prose — at
  pickup read the
  actual
  parent-portal
  share-token
  mint, the
  actual
  /share/[token]
  page shape,
  the actual
  team-roster
  read, the
  actual 0050 /
  0056 share-
  sheet
  component, the
  actual mail
  pipeline),
  #0103 (additive
  widening if
  any shared
  type is
  touched),
  #0112 (widen
  the existing
  parent-portal
  GET to
  include
  teamMates
  rather than
  a new from()
  call), #0116
  (Glob sweep
  that returns
  empty is a
  no-op),
  #0118 (broaden
  sibling
  whitelists for
  the new
  tables).

## Implementation log

- 2026-06-10 [implementation-dev] Picked up. Confirmed migration prefix 069 is
  the next free integer (068 is taken by `coach_clone_reactivation_signals`
  from ticket 0078). Existing parent-portal share-token mint lives at
  `src/app/api/share/create/route.ts` (random 16-byte hex inserted into
  `parent_shares`) — the new route mints a recipient token the same way.
  The middleware `publicPaths` already lists `'/api/share/'` (the entire
  prefix is public), so the new `/api/share/parent-forward` is reachable
  without a separate allow-list entry; LESSONS#0058 still satisfied.
  Reconciled the ticket prose against the schema:
    * "the existing parent-portal GET" is `/api/share/[token]/route.ts`; we
      widen it to return `teamMates: Array<{ player_id, first_name }>` per
      LESSONS#0112 (no new from() call beyond the team-mates read).
    * "the existing 0050/0056 share-sheet shape" — the closest analog is
      the 0060 `SiblingInviteCard` / `SiblingInviteLoader`; we mirror that
      shape (a client loader + a card with a sheet, data-testid scoped).
    * "mail pipeline" is `src/lib/email.ts`'s `sendEmail({to, subject, html})`
      with `RESEND_API_KEY` gating; mirrors 0060's posture.
  No new dependency. No tier-feature key. Migration 069 added.
