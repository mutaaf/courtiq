---
id: 0081
title: When the 0076 stick-signal fires and a cloner ran the publisher's drill at a real practice and thumbed it up, give the publishing coach one tap to send ONE in-product line back to that cloner — "thanks for running my closeout drill, glad it landed for your Hornets" — so the publish-to-clone-to-stick loop finally closes with a real coach-to-coach human exchange WITHOUT exposing either side's email
status: shipped
priority: P0
area: plans
created: 2026-06-11
owner: product-groomer
---

## User story

As a volunteer coach who published her closeout drill via 0064, watched
0073 reputation tick up to "12 coaches in 4 programs cloned this month,"
and just got the 0076 stick-signal milestone card on /home — "your
closeout drill landed for a coach in the Hornets program, they ran it
Tuesday and thumbed it up" — I want ONE tap directly on that milestone
card to send a single short in-product line back to that cloning coach
("thanks for running my closeout drill — glad it landed for your
Hornets; if it helps, I tweak it on the closeout angle when the kids get
quick at it"), where the line lands in the cloning coach's IN-PRODUCT
INBOX (no email surfaced to me, no email surfaced to her, no DM thread
that becomes a chat product) so the publish → clone → run → stick →
recognize loop finally CLOSES with a real coach-to-coach human signal
that turns an anonymous cloner into a named coaching contact AND turns
me into a coach whose work earned a thank-you the cloner can refer to
the next time her assistant asks who wrote that drill.

## Why now (four lenses)

### Product Owner

The product has shipped the full publish-clone-rank-stick stack: 0049
publishes a plan, 0064 publishes a drill, 0055 surfaces league plans on
discovery, 0073 ranks the publishing coach by `(distinct program count,
clone count, recency)`, 0076 detects the cloner's downstream thumbs-up
and fires the stick milestone card, 0078 brings dormant publishers back
on the strongest signal. What is MISSING is the LAST seam in the loop:
when the stick signal fires, the publishing coach reads "your drill
landed in the Hornets program" and has NO in-product way to ACKNOWLEDGE
the cloner. Today the loop ends in a one-way feed: the publisher reads
the milestone, closes the card, and the cloning coach NEVER learns the
publisher saw the stick. The smallest meaningful unit of value is: (a)
a NEW in-product inbox primitive — a `coach_thank_messages` table with
`(id, sender_coach_id, recipient_coach_id, drill_share_id |
plan_share_id, milestone_id, body TEXT, sent_at, read_at)` — a strictly
DM-shape primitive scoped to ONE message per `(sender, recipient,
drill_share_id)` (NO threads, NO replies, NO chat — the receiver
reading the message is the ENDPOINT of the loop, not the start of a
conversation); (b) a new `POST /api/coach/thank-cloner` route that
takes `{ milestoneId, body }` and writes one row to
`coach_thank_messages` after looking up the cloner via the existing
0076 `drill_clone_stick_signals` row + the existing
`drill_share_clones.cloner_coach_id` (the route NEVER reads either
coach's email; the recipient's identity is opaque to the sender beyond
their program name); (c) a tiny "Thank this coach" button rendered on
the existing 0076 stick milestone card on /home (the card mechanic is
already in 0073 / 0076 — adding one button per card); (d) a tiny
in-product inbox surface — `/home/inbox` for the receiving coach (NOT
a separate route, NOT an email channel) — that renders unread
`coach_thank_messages` rows as small zinc-500 cards with the sender's
PROGRAM NAME only (NOT the sender's full name; NOT the sender's email;
ONLY their first name + the drill / plan title they thanked you for);
(e) a small "1" badge on the existing /home navigation when an unread
message exists. NO new tier feature key (the surface is a publish-
graph consequence, not a paid feature; every coach who published or
cloned a drill participates regardless of tier — see Stakeholder lens
for why). NO new AI generation (the body is the publisher's free
text, max 280 chars, sanitized, deterministic template seed). NO new
email channel.

### Stakeholder

This is the moat-deepening primitive that finally CLOSES the
publish-graph loop with a real coach-to-coach human signal AND is the
first in-product DM primitive the platform ships — a structural unlock
that no other forms-app coaching product has. Three compoundings, all
structurally hard for a forms-app competitor to replicate because they
require BOTH the publish-graph + clone-graph + stick-signal stack AND a
DM-shape primitive with per-edge anti-spam, ALL of which the product has
or is shipping with this ticket. (1) The publish-loop closure moat —
every shipped publish surface (0049 / 0064 / 0073 / 0076 / 0078) is
ONE-WAY: the publisher publishes, the cloner clones, the publisher gets
told. THIS ticket adds the inverse edge: the publisher tells the cloner
back. The asymmetric ONE-WAY publish graph becomes a two-way
acknowledgment graph WITHOUT becoming a chat product (the
one-message-per-edge anti-spam preserves the loop's structural shape
— this is recognition, not conversation). (2) The cloner-side
retention compound — every cloning coach who receives a thank-you
message learns that ANOTHER coach in another program SAW their work
land. The expected retention delta on the cloning-coach cohort is the
strongest the product can ship because cloners by definition have
ALREADY paid the publish cost on the receiving side (they ran the
drill, they thumbed it up) — the missing signal is the human
acknowledgment for that act. (3) The DM-primitive long-game — once
`coach_thank_messages` exists with a strict anti-spam contract, the
SAME primitive can be reused by future tickets that need a one-shot
cross-coach signal (the existing 0063 follow-clone notification, the
existing 0050 cross-program reach surface, the future "your weekly
focus echoed in 3 other programs" signal) WITHOUT growing into a chat
product or a notification fan-out. The primitive is structurally
constrained at the schema level (UNIQUE on sender/recipient/share-id;
no thread; no reply) so the shape can never drift. Distinct from 0042
(time-based dormant nudge), 0072 (parent-driven reactivation), 0073
(in-app milestone card — a feed surface, not a DM), 0076 (the stick
signal that sparks THIS ticket), 0078 (the dormant-publisher email —
publisher → publisher channel, no recipient action). THIS is the
first publisher → cloner channel AND the first in-product DM
primitive.

### User (the publishing coach, Coach Maya, Wednesday 8:33pm reading
the 0076 stick milestone card)

She opens /home. At the top of /home, the existing 0076 milestone
card: "Your closeout drill landed for a coach in the Hornets program —
they ran it Tuesday and thumbed it up. That's the first program where
your drill stuck." Below the existing "Open my drill" button, a NEW
small orange-pill button: "Thank this coach." She taps. A small sheet
slides up with a pre-filled textarea: "Thanks for running my closeout
drill — glad it landed for your Hornets. — Maya." Below the textarea, a
small zinc-500 line: "This will land in their SportsIQ inbox. Your
email stays private; theirs does too." She edits one word, taps "Send."
A small toast: "Sent. They'll see it the next time they open SportsIQ."
Total interaction: 12 seconds. The card switches state — the "Thank
this coach" button is now disabled and the label reads "Thanked." She
will never see the cloning coach's email. The cloning coach will
never see HER email. The acknowledgment is the surface.

### User (the receiving coach, Coach Sarah at the Hornets program,
Thursday 6:42pm opening /home for Friday's practice plan)

She opens SportsIQ. A small "1" badge appears next to a new "Inbox"
nav item on /home. She taps. The inbox renders ONE small card:
"Coach Maya at the Hawks program thanked you for running her closeout
drill on Tuesday. 'Thanks for running my closeout drill — glad it
landed for your Hornets. — Maya.'" Below the message, a small
zinc-500 line: "Maya published this drill in spring; you cloned it in
fall (your reputation: clones helped land 1 cross-program drill this
season — see the 0073 surface)." ONE button: "Open the drill." She
taps. She lands on the existing 0044 drill detail surface for the
clone. She closes the app feeling like the work she did Tuesday — the
specific decision to choose Maya's drill out of 12 league plans on
0055 — was visible to a real human in another program. Three weeks
later she clones another of Maya's plans (the existing 0063 follow-
this-coach surface) because she now trusts Maya's library is real.
The loop self-feeds.

### Growth

The "show me" moment is TWO screens. (1) The publishing coach's stick
milestone card with the NEW "Thank this coach" button — the
screenshot a coach DMs to a friend with "the app let me send a
thank-you to a coach in another program who ran my closeout drill —
without surfacing either of our emails." That screenshot is the
publishing-coach retention pull because every published coach has
this moment available the next time the 0076 stick signal fires.
(2) The receiving coach's inbox card with the publisher's name and
the drill title — the screenshot a cloning coach forwards to an
assistant or a co-coach with "remember the closeout drill we ran
Tuesday? The coach who wrote it thanked us." That screenshot is the
receiving-coach acquisition pull because every cloning coach has
hand-picked the drill they thanked the publisher for — the
acknowledgment compounds their original cloning decision. Compounds
three ways. (1) The publish-loop closure compound — every thank-you
message fires the cloning coach back into SportsIQ on a real human
signal (they ran the drill, they thumbed it up, the publisher saw it,
the publisher said thank-you). The expected retention delta on the
cloning-coach cohort is the strongest the product can ship.
(2) The two-way publish-graph compound — the SAME primitive
structurally unlocks the next tier of publish-graph surfaces (the
0063 follow surface gets a "your follower thanked you" variant; the
0050 cross-program reach surface gets a "your cross-program reach
just gained a real exchange" surface) without growing into a chat
product. (3) The director-tier conversion compound — directors who
see their coaches exchanging in-product thank-you messages with
publishers in OTHER programs get the strongest Org-tier retention
signal: "the platform's coach-to-coach graph is alive in MY program."
Distinct from every shipped surface because every shipped publish-
graph surface is one-way OR the receiver-side surface is a generic
feed; THIS is the first publisher → cloner specific-coach signal
AND the first in-product DM primitive.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `071_coach_thank_messages.sql` adds
  `coach_thank_messages (id UUID PRIMARY KEY DEFAULT
  gen_random_uuid(), sender_coach_id UUID NOT NULL REFERENCES
  coaches(id) ON DELETE CASCADE, recipient_coach_id UUID NOT
  NULL REFERENCES coaches(id) ON DELETE CASCADE,
  drill_share_id UUID NULL REFERENCES drill_shares(id) ON
  DELETE CASCADE, plan_share_id UUID NULL REFERENCES
  practice_plan_shares(id) ON DELETE CASCADE, milestone_id
  UUID NULL REFERENCES coach_reputation_milestones(id) ON
  DELETE SET NULL, body TEXT NOT NULL, sent_at TIMESTAMPTZ
  NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ NULL, CHECK
  ((drill_share_id IS NOT NULL) OR (plan_share_id IS NOT
  NULL)), UNIQUE (sender_coach_id, recipient_coach_id,
  drill_share_id), UNIQUE (sender_coach_id,
  recipient_coach_id, plan_share_id))`. Index:
  `(recipient_coach_id, read_at NULLS FIRST, sent_at DESC)`
  for the inbox fetch. Per LESSONS#0006 — confirm `071` is
  the next free integer at pickup (069 reserves 0079, 070
  reserves 0080). Per LESSONS#0088 / #0114 — strip `--`
  comments AND the structural identifier names
  (`coach_thank_messages`, `sender_coach_id`,
  `recipient_coach_id`, `drill_share_id`, `plan_share_id`,
  `milestone_id`, `sent_at`, `read_at`) before the banned-
  token sweep. NO column on any sacred table; the new
  table joins to `coaches` and `drill_shares` /
  `practice_plan_shares` via FKs only. Per LESSONS#0034
  — the migration's `--` header comment NAMES the COPPA-
  sensitive fields this table deliberately does NOT
  contain (no email, no phone, no parent contact, no
  player id, no observation id) as the COPPA approval
  trail; the test strips comments first. The `body`
  column stores the publisher's free text (max 280 chars
  enforced at the route layer, not the DB — keep the
  DB column an unbounded TEXT to avoid future
  truncation surprises). NO RLS posture beyond the
  existing service-role pattern; the route is the
  gate. (vitest under `tests/migrations/071-coach-
  thank-messages.test.ts` — new): scan migration body
  with `--` stripped + identifier strip; column
  allow-list; UNIQUE constraints (BOTH); CHECK
  constraint (one of drill_share_id / plan_share_id);
  index; FK cascades; NO new column on sacred tables.
  Per LESSONS#0074 — bump the next-prefix sentinel.

- [ ] A new `POST /api/coach/thank-cloner/route.ts`. The
  route: (a) authed; 401 if no session; (b) accepts
  `{ milestoneId: string, body: string }`; (c) resolves
  the milestone via
  `coach_reputation_milestones.id`; (d) verifies the
  caller is the `published_coach_id` on the milestone
  (the publisher; only the publisher can thank back —
  404 if not); (e) resolves the cloner via the
  existing `drill_clone_stick_signals` row attached to
  the milestone (per the 0076 milestone-context payload
  — read at pickup per LESSONS#0096; the 0076 ticket
  records the cloner_coach_id on the milestone OR via
  the linked stick signal); (f) sanitizes the `body`
  (strip HTML; max 280 chars; reject if empty after
  sanitization; reject if the body contains an `@`
  sign followed by alphanumerics + `.` — defensive
  anti-email-leak per LESSONS#0061 use literal space
  in regex, NOT `\s+`); (g) writes ONE row into
  `coach_thank_messages` with `(sender_coach_id =
  caller, recipient_coach_id = cloner, drill_share_id
  OR plan_share_id, milestone_id, body)`; (h)
  idempotent on `(sender_coach_id, recipient_coach_id,
  drill_share_id)` per the UNIQUE constraint — a
  re-tap returns the EXISTING row's id without re-
  writing (silent success); (i) returns `200 { ok:
  true, message_id }` on success; (j) returns `404`
  if the milestone is not the caller's; (k) returns
  `400 { error: 'body_empty_or_too_long' }` on bad
  body; (l) returns `400 { error:
  'body_contains_email' }` if the defensive scan
  trips. Per LESSONS#0036 — every `.select()` is an
  explicit allow-list; never reads the recipient's
  email, NEVER reads the cloning team's name beyond
  what the 0076 milestone context already exposes,
  NEVER reads `players.parent_email`, DOB, jersey,
  medical_notes. Per LESSONS#0049 / #0092 / #0100 /
  #0110 / #0118 — Glob `tests/api/coach*` AND
  `tests/api/reputation*` at pickup and extend every
  `mockReturnValueOnce` queue AND broaden every
  `mockImplementation((table) => ...)` whitelist.
  Per LESSONS#0058 — the route is authed;
  `publicPaths` does NOT need a new entry (the
  authed-only middleware default applies). Per
  LESSONS#0072 — never `delete` a field on a DB-read
  object; spread to a new object. (vitest under
  `tests/api/coach-thank-cloner.test.ts` — new): (i)
  the publisher of a milestone thanks the cloner →
  200 + one row written; (ii) a coach who is NOT the
  publisher attempts to thank → 404; (iii) the body
  is empty → 400; (iv) the body is 281 chars → 400;
  (v) the body contains "coach@example.com" → 400
  (defensive anti-email-leak); (vi) re-tap on the
  same milestone → silent success, same row id, no
  second row written; (vii) the response payload
  NEVER contains the recipient's email; (viii)
  planted DOB / medical_notes / parent_email on
  player rows are NEVER read; (ix) the milestone
  attached to a plan_share (NOT a drill_share)
  routes through the plan_share_id branch
  successfully; (x) the route works for free-tier
  coaches AND paid-tier coaches identically (no
  feature gate).

- [ ] A new `GET /api/coach/inbox/route.ts`. The route:
  (a) authed; 401 if no session; (b) returns
  `Array<{ id: string; sender_first_name: string;
  sender_program_name: string; drill_or_plan_title:
  string; body: string; sent_at: string; read_at:
  string | null }>` for the caller's
  `recipient_coach_id` rows ordered by `(read_at
  NULLS FIRST, sent_at DESC)` capped at 50; (c) the
  response NEVER contains the sender's email,
  surname, phone, or team-name beyond program name;
  (d) the response NEVER contains the original
  observation id, player id, or any kid data. Per
  LESSONS#0036 — explicit `.select()` allow-list:
  `id, sender_coach_id, drill_share_id,
  plan_share_id, body, sent_at, read_at` + joined
  `coaches.first_name, coaches.org_id` +
  `organizations.name` + `drill_shares.drill_id`
  → `drills.title` (OR the plan analogue); never
  joins to `players`, `observations`,
  `parent_email`. Per LESSONS#0057 — never reads
  `teams.coach_id`; team identity is via
  `team_coaches` if a team-name surface is needed
  in v2 (NOT v1). Per LESSONS#0072 — spread the
  joined sender row when stripping email; never
  `delete`. (vitest under `tests/api/coach-inbox
  .test.ts` — new): (i) authed coach with TWO
  inbox rows → returns both, ordered correctly;
  (ii) unread rows appear before read rows; (iii)
  the response NEVER contains the sender's email
  or surname; (iv) the response NEVER contains
  any player_id or parent_email; (v) the
  response payload is capped at 50.

- [ ] A new `POST /api/coach/inbox/mark-read/route
  .ts`. The route: (a) authed; (b) accepts
  `{ messageIds: string[] }`; (c) updates
  `read_at` to NOW() for the rows where
  `recipient_coach_id = caller` AND `id IN
  (messageIds)` (the recipient-only update —
  the publisher can NEVER mark someone else's
  message read); (d) returns `200 { updated:
  number }`. Per LESSONS#0036 — explicit
  `.select()` allow-lists; per LESSONS#0072 —
  spread. (vitest): authed; only updates rows
  owned by the caller; foreign rows are
  silently ignored; returns the updated count.

- [ ] A small `<ThankClonerButton />` component
  mounted on the existing 0076 stick milestone
  card on /home (real path read at pickup per
  LESSONS#0096; the 0076 card lives inside
  `<CoachReputationMilestoneSection />` per the
  0078 implementation log). The button:
  (a) renders ONLY on milestones with
  `milestone_kind` in `{ stuck_1, stuck_3,
  stuck_8 }` AND only on milestones where the
  `recipient_coach_id` (the cloner) is
  resolvable from the linked stick signal;
  (b) on tap opens a small sheet with a
  pre-filled textarea ("Thanks for running my
  <drill_title> — glad it landed for your
  <cloner_program_name>. — <publisher_first_name>");
  (c) on Send, fires `POST /api/coach/thank-
  cloner`; (d) on 200, the button is
  disabled and the label switches to
  "Thanked"; (e) on a re-render where the
  message already exists, the button starts
  in the "Thanked" state. Per LESSONS#0022 /
  #0029 / #0082 — every assertion scoped to
  `data-testid="thank-cloner-button"`,
  `data-testid="thank-cloner-sheet"`,
  `data-testid="thank-cloner-textarea"`,
  `data-testid="thank-cloner-send"`,
  `data-testid="thank-cloner-thanked-state"`.
  Per LESSONS#0011 — for the post-send
  no-URL primitive: expose
  `data-message-id={messageId}` on the
  button AFTER a successful send so the
  test asserts the message was written.
  Per LESSONS#0065 / #0066 / #0162 —
  smallest possible touch on the 0073 /
  0076 hotspot (one prop + one button +
  one sheet). (vitest component test):
  (i) the button renders on a stuck
  milestone; (ii) the button is ABSENT on
  a clones_3 milestone (only stuck_*
  milestones get the thank surface);
  (iii) tapping opens the sheet with the
  pre-filled textarea containing the
  publisher's name, the drill title, and
  the cloner's program name; (iv) Send
  fires the POST with the right payload;
  (v) on 200 the button switches to
  Thanked; (vi) on a 200 response payload
  carrying an existing message_id, the
  button renders in the Thanked state on
  first paint; (vii) every rendered text
  contains no AGENTS.md banned word; (viii)
  the sheet's pre-fill never embeds a
  banned token from any matrix of
  publisher / drill_title /
  cloner_program_name / sport.

- [ ] A new `<CoachInbox />` component (and
  the supporting `<CoachInboxNavBadge />`)
  mounted on /home (real path at pickup per
  LESSONS#0096; the 0078 implementation log
  shows the /home page is at
  `src/app/(dashboard)/home/page.tsx`).
  Render shape: a small "Inbox" nav entry
  at the TOP of /home with a tiny zinc-500
  "1" badge when an unread message exists.
  Tapping "Inbox" reveals a small panel (NOT
  a separate route — v1 is a /home expansion)
  listing the unread + read messages from
  the new GET. Each message renders as a
  zinc-500 card: "Coach <sender_first_name>
  at the <sender_program_name> program
  thanked you for running their
  <drill_or_plan_title>." Below: the
  publisher's sanitized body in a
  blockquote. Below that: ONE button "Open
  the drill" (deep-links to the existing
  0044 drill-detail surface OR the 0049 /
  0064 plan / drill share-card surface,
  depending on which kind the
  `drill_share_id` / `plan_share_id`
  resolves to). On reveal, the new
  `POST /api/coach/inbox/mark-read` is
  fired for the rendered ids (mark-as-
  seen on view, NOT mark-as-replied —
  there is no reply primitive). Per
  LESSONS#0027 — the reveal effect reads
  the ids as a SNAPSHOT and uses a
  `[]` deps list; never put a
  `set`-controlled state value into the
  deps. Per LESSONS#0022 / #0029 / #0082
  — every assertion scoped to
  `data-testid="coach-inbox-panel"`,
  `data-testid="coach-inbox-message"`,
  `data-testid="coach-inbox-empty"`,
  `data-testid="coach-inbox-nav-badge"`.
  Per LESSONS#0065 / #0066 / #0162 —
  smallest possible touch on /home (one
  nav entry + one expandable panel + no
  new route file). (vitest component
  test): (i) /home renders the nav
  badge when an unread row exists;
  (ii) /home renders no badge when all
  messages are read or none exist;
  (iii) tapping the nav reveals the
  inbox panel with the unread cards
  first; (iv) every card renders the
  sender's first name + program name +
  drill title + the body; (v) the
  panel never renders the sender's
  email; (vi) the panel never renders
  the sender's surname; (vii) the
  mark-read POST fires once per render
  of the unread ids; (viii) every
  rendered text contains no AGENTS.md
  banned word.

- [ ] Tier / feature gating: NO new tier
  feature key. The thank-back action AND
  the inbox are available to every coach
  regardless of tier (the publish-graph
  is a free-tier-onward consequence; the
  cloning coach who received a thank-you
  may be on Free, the publishing coach
  who sent it may be on Pro — the
  product MUST work for both). The
  existing tier-paid surfaces (the
  publishing surface 0064 itself stays
  on Coach+ as it shipped) are
  untouched. (vitest: a free-tier
  publishing coach who triggers a
  stuck_1 milestone gets the
  thank-cloner surface; a free-tier
  cloning coach gets the inbox + the
  mark-read action.)

- [ ] Privacy / COPPA contract: THIS is
  the load-bearing contract for this
  ticket. (a) The publisher NEVER
  sees the cloner's email, surname,
  phone, team name, or kid data —
  only the cloner's first name + the
  cloner's program name (the
  existing 0076 milestone-context
  surface already exposes program-
  scope; this is the same scope).
  (b) The cloner NEVER sees the
  publisher's email, surname, phone —
  only the publisher's first name +
  the publisher's program name + the
  drill title they thanked them
  for. (c) The route NEVER reads
  `players`, `observations`,
  `parent_email`, DOB,
  jersey_number, medical_notes, or
  photo URLs on EITHER side. (d)
  The body's defensive anti-email-
  leak scan (`/[A-Za-z0-9._-]+@[A-
  Za-z0-9.-]+\.[A-Za-z]{2,}/`)
  rejects a body containing an
  email-shape; the route returns
  `400 { error:
  'body_contains_email' }` and
  writes nothing. (e) The
  `coach_thank_messages.body`
  column stores the publisher's
  FREE TEXT (sanitized) but NEVER
  any auto-injected PII from the
  publisher's account or the
  cloner's account. (f) The
  UNIQUE constraint on
  `(sender_coach_id,
  recipient_coach_id,
  drill_share_id)` is the load-
  bearing anti-spam contract; v1
  caps at ONE message per
  (sender, recipient, share)
  pair forever (NOT per 7 days,
  NOT per 60 days — FOREVER, so
  the surface never becomes a
  chat primitive). Per
  LESSONS#0036 — every
  `.select()` is an explicit
  allow-list. Per LESSONS#0088 /
  #0114 — the migration's COPPA
  scan strips `--` comments AND
  structural identifier names.
  Per LESSONS#0072 — never
  `delete` on a DB-read row;
  spread to a new object.
  (vitest: planted DOB /
  medical_notes /
  parent_email /
  jersey_number / photo URL on
  player rows are NEVER read by
  the thank route or the
  inbox route; the response
  payloads contain no email
  address; the body anti-leak
  scan rejects every common
  email shape; the inbox card
  renders no surname; the
  UNIQUE constraint is
  asserted on a re-tap.)

- [ ] Voice contract: every new user-
  facing string (the "Thank this
  coach" button label, the sheet's
  prompts, the pre-filled textarea
  template, the toast copy, the
  Inbox nav label, the inbox card
  copy, the "Open the drill"
  button label) contains NO
  AGENTS.md banned word per
  LESSONS#0023. Mirror the
  existing 0076 / 0073 / 0042 /
  0072 cardboard voice exactly.
  Per LESSONS#0061 — defensive
  scans use literal spaces, not
  `\s+`. The pre-fill template
  NEVER produces a banned token
  for any matrix of publisher
  first name / drill title /
  cloner program name / sport.
  (vitest: render each component
  variant and scan rendered
  text; scan the pre-fill matrix;
  scan the toast and inbox-card
  copy.)

- [ ] Regression: the existing 0073
  reputation card AND the existing
  0076 stick milestone card are
  BYTE-IDENTICAL on every other
  surface (the new button is
  mounted INSIDE the existing
  card; every existing surface
  above and below it is byte-
  identical). The existing 0042
  / 0072 / 0078 reactivation
  pipelines are BYTE-IDENTICAL.
  The existing /home page
  surfaces (the Practice Arc
  surface, the Today section,
  the existing nav) are BYTE-
  IDENTICAL (the new Inbox nav
  is added at the top of the
  nav stack — confirm at
  pickup; if the nav has no
  slot, add inside an existing
  grouping per LESSONS#0022).
  (vitest: snapshot the named
  routes / components against
  seeded fixtures pre- and
  post-change.)

- [ ] Seeded e2e on the 0006
  fixture: seed extension is
  — pre-mint a publisher coach
  (the existing E2E sign-in
  coach OR a new SECOND coach
  — confirm at pickup), ONE
  `drill_shares` row published
  by the publisher with a known
  title ("Live closeout 1-on-
  1"), ONE `drill_share_clones`
  row by a third coach (the
  cloner) in a known
  ORGANIZATION ("Hornets"), ONE
  `drill_clone_stick_signals`
  row (the 0076 stick signal),
  ONE `coach_reputation_milestones`
  row with `milestone_kind =
  stuck_1`. Per LESSONS#0084 —
  seed in the idempotent
  DELETE-then-INSERT block;
  every new coaches row has
  a matching `auth.users`
  row. Per LESSONS#0101 — UUIDs
  in the next free range
  (after 0079 / 0080
  reservations — confirm at
  pickup). Per LESSONS#0078 —
  thread `cloner_org_id` from
  `drill_clone_stick_signals`,
  NEVER `drill_share_clones`.
  Per LESSONS#0009 — /home is
  a CLIENT component (per the
  0036 lesson on TanStack
  query interceptability); the
  e2e can mock `/api/me` and
  let the inbox GET hit the
  seeded DB. Playwright spec:
  (a) sign in as the
  publisher, navigate to
  /home, assert the 0076
  stuck_1 milestone card
  renders AND the new "Thank
  this coach" button
  renders inside it; (b)
  tap the button, type a
  short note, tap Send;
  (c) assert the POST to
  `/api/coach/thank-cloner`
  returns 200 AND ONE
  `coach_thank_messages`
  row is written; (d) tap
  the button again, assert
  the Thanked state shows
  (no second row written
  per the UNIQUE
  constraint); (e) sign
  out, sign in as the
  cloner (a second sign-in
  flow per the 0073 e2e
  posture — confirm at
  pickup; if the e2e
  harness only supports
  one coach, fold this
  case into vitest +
  document the deviation
  in the Implementation
  log per LESSONS#0096),
  navigate to /home,
  assert the "1" badge
  renders on the new Inbox
  nav entry; (f) tap
  Inbox, assert the
  message renders with
  the publisher's first
  name + program name +
  drill title + body;
  (g) assert the mark-
  read POST fires AND the
  badge disappears on
  re-render. Scope every
  assertion by data-
  testid per LESSONS#0022
  / #0029 / #0082.
  Skip when E2E creds are
  unset.

## Out of scope

- A REPLY-TO-THANK surface for the
  receiving coach. v1 ends at receive
  + open-the-drill action; reply is
  what makes this a chat product.
  The UNIQUE constraint at the
  schema level is the load-bearing
  enforcement.
- A THREADED conversation primitive.
  v1 is point-to-point per the
  UNIQUE constraint; threading is a
  v2+ ticket with its own identity
  surface.
- A PUSH notification for the
  receiving coach (in addition to
  the inbox badge). v1 is in-
  product only; push is a separate
  ticket with device-token surface.
- AN EMAIL channel for the thank-
  you (a notification email when an
  inbox message arrives). v1 is
  in-product only — the inbox is
  the loop's ENDPOINT, not the
  start of an email channel.
- A MULTI-RECIPIENT thank-you (one
  message to multiple cloners on
  the same stick milestone). v1 is
  one-to-one per the UNIQUE
  constraint.
- AN AI-WRITTEN thank-you body.
  v1 is a deterministic template
  fill with publisher-typed text;
  AI generation is a separate
  ticket with its own voice-
  anchoring contract (the
  existing 0070 voice anchoring
  is the starting point if so).
- A SETTINGS toggle for the
  receiving coach ("turn off
  inbox messages"). v1 routes
  through the same in-product
  delivery; a dedicated toggle
  is a separate ticket.
- A SHIPPED dataset of the
  inbox-message-to-conversion
  funnel for the director-side
  /home surface. v1 writes the
  rows; a downstream director-
  side surface is a separate
  ticket.
- A THANK-YOU surface for
  CLONES that have NOT stuck
  (the cloner downloaded but
  never thumbed up). v1 caps
  at stuck_* milestones because
  the thank surface is the
  acknowledgment-of-real-use
  signal; a "thanks for
  cloning" surface for non-
  stuck clones is a separate
  ticket.

## Engineering notes

Files / patterns the dev should touch.

- `supabase/migrations/071_coach_thank_messages.sql`
  (new). Per LESSONS#0006 — confirm `071` is
  the next free integer at pickup (069 reserves
  0079, 070 reserves 0080).
- `src/types/database.ts` — add
  `CoachThankMessage` type. NO field on any
  sacred type.
- `src/app/api/coach/thank-cloner/route.ts`
  (new) — `POST(request)`. Per LESSONS#0036
  — `.select()` allow-lists. Per LESSONS#0049
  / #0092 / #0100 / #0110 / #0118 — Glob
  `tests/api/coach*` AND `tests/api/reputation*`
  at pickup and extend every queue + broaden
  every whitelist. Per LESSONS#0072 — spread,
  never delete. Per LESSONS#0058 — authed
  route; no publicPaths change.
- `src/app/api/coach/inbox/route.ts` (new) —
  `GET(request)`. Per LESSONS#0036 —
  `.select()` allow-list; never reads
  `players`, `observations`, `parent_email`.
- `src/app/api/coach/inbox/mark-read/route
  .ts` (new) — `POST(request)`. Recipient-
  only update.
- The existing 0073 / 0076 milestone-card
  component (real path at pickup —
  `<CoachReputationMilestoneSection />` per
  the 0078 log). Per LESSONS#0065 / #0066
  / #0162 — smallest possible touch (one
  prop + one button + one sheet inside the
  existing card).
- `src/components/coach/thank-cloner-
  button.tsx` (new).
  `data-testid="thank-cloner-button"`,
  `data-testid="thank-cloner-sheet"`,
  `data-testid="thank-cloner-textarea"`,
  `data-testid="thank-cloner-send"`,
  `data-testid="thank-cloner-thanked-
  state"`. After a successful send,
  exposes `data-message-id={messageId}`
  per LESSONS#0011.
- `src/components/coach/coach-inbox.tsx`
  (new). `data-testid="coach-inbox-
  panel"`, `data-testid="coach-inbox-
  message"`, `data-testid="coach-inbox-
  empty"`, `data-testid="coach-inbox-
  nav-badge"`. The reveal effect uses
  `[]` deps per LESSONS#0027.
- `src/app/(dashboard)/home/page.tsx`
  (existing — read first per
  LESSONS#0096). Add ONE Inbox nav
  entry at the top + mount the
  `<ThankClonerButton />` inside the
  milestone card via prop.
- `src/lib/tier.ts` — NO new feature
  key.
- `src/components/ui/upgrade-gate.tsx`
  — NO new registration.
- `src/lib/supabase/middleware.ts`
  (or proxy.ts depending on the Next
  16 shape — confirm at pickup) — NO
  change (the new routes are authed;
  `publicPaths` is for unauthed-only
  routes).
- `tests/migrations/071-coach-thank-
  messages.test.ts` (new).
- `tests/migrations/no-new-migration-
  XX.test.ts` — bump the next-prefix
  sentinel.
- `tests/api/coach-thank-cloner.test
  .ts` (new).
- `tests/api/coach-inbox.test.ts`
  (new).
- `tests/api/coach-inbox-mark-read
  .test.ts` (new).
- `tests/components/thank-cloner-
  button.test.tsx` (new).
- `tests/components/coach-inbox.test
  .tsx` (new).
- `tests/api/coach*.test.ts` AND
  `tests/api/reputation*.test.ts`
  (existing — Glob at pickup per
  LESSONS#0110) — extend every
  `mockReturnValueOnce` queue AND
  broaden every
  `mockImplementation((table) =>
  ...)` whitelist for the new
  `coach_thank_messages` reads. Per
  LESSONS#0116 — empty Glob is a
  no-op.
- `tests/e2e/thank-cloner-flow.spec
  .ts` (new) — the publisher →
  cloner full loop. Seed
  extension per the AC. UUIDs in
  the next free range per
  LESSONS#0101. Skip when E2E
  creds are unset.
- New deps: NO. Migration: YES
  (071 or bump). Env vars: NO
  new. AI prompt change: NO.
  Tier feature key: NO new key.
- LESSONS to anchor: #0006
  (prefix uniqueness), #0011
  (data-message-id pattern in
  place of data-share-url for
  the post-send assertion),
  #0020 / #0038 (.test.ts),
  #0022 / #0029 / #0082 (data-
  testid scoping), #0023
  (positive voice; mirror
  existing 0076 / 0078 voice),
  #0027 (no set-controlled
  state in the inbox reveal
  effect dep list), #0033
  (commit multi-line / special-
  char strings via heredoc),
  #0034 / #0088 / #0114
  (strip `--` comments AND
  structural identifiers on
  COPPA sweep), #0036 (best-
  effort `.select()` allow-
  lists), #0049 / #0092 /
  #0100 / #0110 / #0118 (mock
  queue + whitelist spillover
  — Glob every coach /
  reputation test), #0055
  (route handler call
  posture), #0057 (team-
  coach via `team_coaches`,
  NEVER `teams.coach_id` —
  applies if v2 surfaces
  team identity), #0058
  (authed route; no
  publicPaths change),
  #0061 (literal space on
  defensive scans —
  especially the body
  anti-email-leak regex),
  #0063 (scope leak
  assertions to rendered
  shapes), #0065 / #0066 /
  #0162 (milestone-card
  hotspot — smallest
  possible touch; extend
  the existing card, do
  not duplicate it), #0072
  (never `delete` a field
  on a DB-read object —
  spread to a new object),
  #0078 (thread
  `cloner_org_id` from
  `drill_clone_stick_signals`,
  NEVER `drill_share_clones`),
  #0084 / #0101 (seed
  posture; UUID range),
  #0096 (schema wins over
  prose — at pickup read
  the actual 0076 stick
  signal payload, the
  actual milestone-card
  component, the actual
  /home page nav shape,
  the actual /api/me
  posture, the actual e2e
  multi-coach sign-in
  posture), #0103
  (additive widening on
  any shared type),
  #0112 (widen an
  existing read over a
  new from() if possible
  — e.g. if the
  milestone-card already
  reads
  `drill_clone_stick_signals`,
  widen its select to
  carry the cloner_coach_id
  through), #0116 (Glob
  sweep that returns
  empty is a no-op),
  #0118 (broaden sibling
  whitelists for the new
  `coach_thank_messages`
  read).

## Implementation log

- 2026-06-11 [implementation-dev] Picked up on branch `feat/0081-publisher-thanks-cloner-in-product-dm`. Schema-vs-prose deviations confirmed at pickup (LESSONS#0096):
  - Migration prefix: ticket prose said `071`, but `ls supabase/migrations/` shows the last existing prefix is `069_parent_forward_signals.sql` (070 was never minted — the `no-new-migration-0079` sentinel counts 70 files but no prefix 070 exists on disk). So the next free prefix is **070**, not 071. Renaming the migration to `070_coach_thank_messages.sql` and bumping the sentinel test to `71`.
  - `/api/coach/reputation-milestones` currently surfaces only `{id, kind, crossedAt}`; the card's `drillTitle / programNames / drillId` are optional and not populated server-side today. To resolve the cloner for the 0076 stuck milestone the route looks them up SERVER-side from the linked `drill_clone_stick_signals` row by published_coach_id → drill_shares → drill_clone_stick_signals (the cloner_coach_id is the recipient). No new field needs to thread through the milestone GET — the thank-cloner route resolves the cloner from the milestone row + drill_share lookup.
  - Inbox surface: ticket prose says it can live as a /home expansion OR a separate route. Going with the /home expansion (one nav entry + one expandable panel) per the smallest-touch posture in the ticket itself.
