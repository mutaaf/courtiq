---
id: 0067
title: When the regular coach can't make Tuesday's practice and a parent volunteers to run it, give them a one-tap "here's what we're working on" link for that sub
status: in-progress
priority: P1
area: capture
created: 2026-06-03
owner: product-groomer
---

## User story

As the regular coach who just texted my team group chat at 4:11pm "stuck at
work — can anyone run practice tonight?" and one of the dads said yes, I want
ONE tap from my phone to send that dad a 24-hour scoped link with the four
things he actually needs to run a 45-minute practice for my U10 team — the two
drills queued in the practice plan, the team's current focus arc, the two kids
whose parents already asked me what their kid is working on this week — so the
sub doesn't text me 7 questions between 5:30 and 6:00 and the kids don't get a
random practice that resets the arc I have been building for six weeks.

## Why now (four lenses)

### Product Owner

The product has shipped two adjacent surfaces that bracket but do not fill the
substitute-coach handoff seam. (1) 0046 ships the SIDELINE CHEAT SHEET — one
short line per kid to say to that kid's parent during the game. That is a
GAME-DAY artifact for the regular coach, not a practice handoff for a sub.
(2) 0029 ships the OBSERVER LINK — a 24-hour scoped read-only token a coach
gives to a helper (e.g. an assistant or a parent volunteer) so they can SEE
the team's roster + the practice they are observing without creating an
account. That is the substrate this ticket needs but doesn't yet carry the
COACHING CONTEXT a sub running practice would need (it only renders
roster + the active session — there is no "here's what we're working on,
here is what is queued, here are the two kids to watch"). What is missing —
and what causes the actual Tuesday-night text-cascade between the regular
coach and the sub — is the COACHING-CONTEXT WRAPPER on the observer link
specifically for a SUB-COACH use case. The smallest meaningful unit of value
is: (a) ONE new "Hand off practice to a sub" button on the existing session
detail page that opens a small sheet, (b) ONE textarea for the sub's first
name (optional, for personalisation), (c) ONE checkbox row for what to
include ("the queued drills" / "this week's focus" / "the two kids whose
parents asked" — all default on), (d) a "Generate link" button that POSTs to
a new `/api/sub-handoff/create` endpoint which mints an EXISTING observer
token (24h, single session) AND writes a small `sub_handoffs` row tying
the token to the included-context flags, and (e) a new SUB-FACING page at
`/sub/[token]` (PARENT-PORTAL aesthetic) that renders the four sections in
ONE scrollable view + a Copy-link / Text button for the regular coach to
forward. Reuses the existing 0029 observer infrastructure end-to-end
(token shape, 24h TTL, no account required); the new wrapper adds the
COACHING CONTEXT the bare observer link does not.

### Stakeholder

This is the moat-deepening primitive for a use case that exists EVERY WEEK in
EVERY VOLUNTEER YOUTH PROGRAM but that no rival forms-app addresses. Three
compoundings, all distinct from anything shipped. (1) The retention-through-
chaos moat — the most common coach-churn moment is NOT "the coach quit," it
is "the coach missed three practices in a row because life happened, the
team's arc reset, the kids stopped showing up." The substitute-coach
handoff converts a CANCELED practice into a STILL-ON-ARC practice; the
regular coach's six-week arc survives the bad-luck Tuesday. The arc-
continuity metric (which underlies every per-player artifact) is preserved
through what would otherwise be a complete loss. (2) The SOFT-acquisition
moat — the sub-coach lands on a SportsIQ-branded page WITHOUT signing up,
sees the coaching artifact end-to-end, and the page carries a small "this
is what your kid's coach uses" footer with the existing referral code per
the 0011 pattern. The sub-coach is structurally a HIGH-INTENT acquisition
target (they JUST proved they care enough to run practice) and the
existing 0029 "turn-the-helper-into-a-coach" conversion path is ready for
them. (3) The trust-with-the-program moat — a program director who learns
that one of their coaches handed off a practice cleanly via SportsIQ
becomes a stronger advocate for SportsIQ across the program (mirrors the
0065 coach-invites-director loop in reverse: this is the artifact that
makes the program director say "the coaches are using this"). Distinct
from 0046 (game-day, regular coach), 0029 (bare observer, no coaching
context), 0040 (pre-game opponent brief, regular coach).

### User (the regular coach, Sarah, Tuesday 4:14pm at her desk)

She just got Mark's text saying he can take practice tonight. She opens the
SportsIQ app, taps the upcoming session for 5:30pm, taps "Hand off to a sub"
(new button on the session detail page right above the existing observer-
link button). A sheet slides up. Three checkboxes (all on by default): the
queued drills for tonight, this week's focus, the two kids whose parents
have an open thread. One textarea: "Sub's first name (optional)" — she
types "Mark". One button: "Generate link." The button flips to "Copy link
for Mark." She taps Copy. She pastes into the group chat with one line of
her own: "Mark — here's everything for tonight, thanks again." Total
interaction: 22 seconds. No account creation, no email, no PDF, no app
install for Mark.

### User (the sub, Mark, on his phone in his car at 5:11pm)

He taps the link. A SportsIQ page loads in his phone browser (parent-portal
aesthetic: gray + orange, large readable type). H1: "Tuesday practice —
Hawks U10. Thanks for stepping in, Mark." Beneath it, three numbered
sections that scroll on one page: (1) "What we're working on this week —
finishing the closeout" (one line, this week's focus arc), (2) "Two drills
queued, 18 minutes each" — each drill with name + 3-line setup + the
single line of what the regular coach noted about it last time it was run
(e.g. "this is the one where the U10 girls finally chest-up before the
hands go up"), (3) "Two kids to give extra eyes to tonight — Maya (working
on left-hand finishes) and Caleb (working on calling out switches)" — JUST
the kid's first name + the one line. At the bottom: a Roster button (links
to the existing 0029 observer-roster page so Mark can see all the kids by
first name), a Capture-button-for-the-regular-coach link ("if you want to
send Sarah a one-line note on how it went, tap here" — POSTs ONE short
text observation back to the session as a sub-note, attributed to "sub:
Mark", no AI generation), and the small "Made with SportsIQ — start your
own free team" referral footer per the 0011 pattern. NO login. NO account.
The link expires in 24 hours.

### User (Sarah, Tuesday 9:08pm after the kids are in bed)

She opens /home. New small card: "Mark left you a note from tonight's
practice — 'all 12 showed, did both drills, Caleb did NOT call out a single
switch all night.'" One tap to read the full note (one paragraph max), one
tap to add it to the session as her own observation if she wants
(promoting the sub-note into a coach-authored observation via the existing
capture pipeline; the sub-note's text is preserved with the "sub: Mark"
attribution intact in the observation metadata). The /home card auto-
dismisses on tap; if the sub left no note, no card appears (silence beats
nag). The /home card carries no new UI weight on coaches who never use the
sub-handoff feature (the card only renders when there is an unread sub-
note from the last 7 days).

### Growth

The "show me" moment is MARK'S phone — a parent-volunteer who has never
heard of SportsIQ opens a link, sees a CRISP coaching brief that makes him
look competent to 12 kids and their parents in 45 minutes, and the bottom
of the page invites him to start his own free team. That is the moment a
parent-coach is born. Compounds three ways. (1) The arc-continuity
preservation — every preserved Tuesday is a downstream artifact that still
gets made (parent reports, weekly pulse, season recap all still anchor to
a real practice instead of a "session canceled" gap). (2) The high-intent
acquisition — the sub-coach is the highest-conversion-rate acquisition
target the product has (revealed preference + demonstrated context); the
0029 conversion path completes here. (3) The program-director signal —
a director who sees the coaches handing off practices via SportsIQ
internalises it as the operating system of their program. The 0065
coach-invites-director loop and this loop compound: the coaches use the
product more visibly, the director gets pulled in faster. Distinct from
every shipped surface: 0046 is game-day parent-talking-points; 0029 is
the bare observer; 0040 is the pre-game opponent brief; THIS is the
sub-coach practice handoff, the missing weekly-chaos primitive.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `059_sub_handoffs.sql` adds the table `sub_handoffs
  (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), session_id UUID NOT NULL
  REFERENCES sessions(id) ON DELETE CASCADE, coach_id UUID NOT NULL
  REFERENCES coaches(id) ON DELETE CASCADE, observer_token TEXT NOT NULL,
  sub_first_name TEXT NULL, include_queued_drills BOOLEAN NOT NULL DEFAULT
  TRUE, include_weekly_focus BOOLEAN NOT NULL DEFAULT TRUE,
  include_eyes_on_players BOOLEAN NOT NULL DEFAULT TRUE, sub_note_text
  TEXT NULL, sub_note_at TIMESTAMPTZ NULL, sub_note_seen_at TIMESTAMPTZ
  NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(session_id,
  coach_id))`. Two indexes: `(observer_token)` for the public page read +
  `(coach_id, sub_note_at DESC) WHERE sub_note_at IS NOT NULL` for the
  /home unread-sub-note card. The migration adds NO column to `sessions`,
  `coaches`, `players`, `teams`, `observations`. Mirror
  `048_practice_plan_shares.sql` header style. Prefix `059` is the next
  free integer after `058_coach_follows.sql` (LESSONS#0006 — at pickup
  confirm; if 0064 / 0065 / 0066 claimed `059` first, bump to `060`).
  LESSONS#0088 — strip `--` comments before the no-banned-token scan.
  (vitest: scan migration SQL with `--` stripped; assert column allow-
  list; assert the UNIQUE constraint; assert both indexes exist; assert
  NO new column on any sacred table.)

- [ ] `POST /api/sub-handoff/create` (new, authed) accepts `{ sessionId:
  UUID, subFirstName?: string, includeQueuedDrills?: boolean,
  includeWeeklyFocus?: boolean, includeEyesOnPlayers?: boolean }`.
  The route: (a) verifies the caller is a head coach on the session's
  team via `team_coaches` per LESSONS#0057; (b) validates the sub-name
  is 1–40 chars + voice-clean per LESSONS#0023 (when present); (c)
  mints an EXISTING observer token via the existing
  `generateObserverToken(sessionId, 24)` helper at
  `src/lib/observer-utils.ts` (LESSONS#0096 read first — do NOT
  re-inline the token logic); (d) upserts a `sub_handoffs` row on
  `(session_id, coach_id)` (a second invocation by the same coach for
  the same session UPDATES the include-flags + replaces the token);
  (e) returns `200 { token, url, expiresIn: '24 hours' }`. The URL
  is `${NEXT_PUBLIC_APP_URL}/sub/${token}`. (vitest: 200 + row
  written + observer token minted; 200 idempotent re-create with a
  different sub_first_name UPDATES the row in place; 400 voice on
  bad sub name; 400 length > 40; 403 caller not head coach; 404
  session not found; 401 unauthed.)

- [ ] `GET /api/sub-handoff/[token]` (new, PUBLIC) returns the sub-
  facing payload `200 { sessionDate, teamName, ageGroup, sportName,
  subFirstName, weeklyFocusLine?: string, queuedDrills?: Array<{
  drillName, setupLines: string[], coachNote?: string }>,
  eyesOnPlayers?: Array<{ firstName, oneLineWatch: string }>,
  expiresAt }`. Each section is OMITTED from the response when its
  include flag is false on the handoff row. The route validates the
  observer token (existing `verifyObserverToken` helper per 0029 —
  LESSONS#0096 read first); 410 on expired token; 404 on unknown
  token. The `eyesOnPlayers` section uses FIRST NAMES only and the
  oneLineWatch is a coach-authored existing observation (NEVER
  AI-derived; NEVER a quote that includes parent contact info) —
  sourced from the most-recent observation per the team's two
  players whose parents have an OPEN-thread on the existing parent-
  reactions surface (read 0053's `parent_reactions` shape at pickup
  per LESSONS#0096; if the open-thread query is too complex for v1,
  fall back to the two players with the LONGEST observation streak
  this week — pick at pickup the cleaner of the two for the v1
  implementation and document in the Implementation log per
  LESSONS#0096). NO email, NO phone, NO full name, NO DOB anywhere
  in the response. (vitest: 200 payload shape; the include-flag
  omission works; 410 on expired token; 404 on unknown token; the
  `eyesOnPlayers` first-names-only; planted parent_email / DOB /
  medical_notes rows do NOT appear; the route's `.select()` keysets
  are explicit allow-lists per LESSONS#0036.)

- [ ] `POST /api/sub-handoff/[token]/sub-note` (new, PUBLIC) accepts
  `{ text: string }` (1–500 chars, voice-scanned per LESSONS#0023).
  Validates the observer token; writes `sub_note_text` +
  `sub_note_at = now()` to the handoff row. Idempotent: a second
  POST UPDATES the existing note (the sub can correct it before the
  regular coach reads it). 410 on expired token; 404 on unknown.
  Server-side rate limit: max 3 notes per token (the sub doesn't
  spam the regular coach). (vitest: 200 + note written; 200
  idempotent update; 400 voice; 400 length; 410 expired; 404
  unknown; 429 on 4th post.)

- [ ] A new PUBLIC page at `src/app/sub/[token]/page.tsx` renders the
  sub-facing layout in the PARENT-PORTAL aesthetic (gray + orange,
  NOT dark). The page is a `'use client'` component fetching the
  payload from `/api/sub-handoff/[token]` per LESSONS#0036's e2e-
  friendly posture. The three sections render in scrollable order;
  any section whose data is empty renders NOTHING (silence beats an
  empty state). The Roster button links to the EXISTING 0029
  observer roster route at the same token (the observer routes
  accept the same token — read at pickup per LESSONS#0096; if the
  observer route uses a different token shape, mint BOTH in
  parallel). The "send Sarah a one-line note" surface is an inline
  textarea + a single button that POSTs to
  `/api/sub-handoff/[token]/sub-note`. The page exposes
  `data-testid="sub-handoff-page"` and the copy button on the
  regular-coach-side share sheet exposes `data-share-url={publicUrl}`
  per LESSONS#0056 / #0082. The page is added to `publicPaths` in
  `src/lib/supabase/middleware.ts` in the SAME PR per LESSONS#0091
  / #0104 (sub visitors hit the URL unauthed). The footer carries
  the existing "Made with SportsIQ — start your own free team"
  block per the 0011 pattern. (Playwright: navigate unauthed to a
  seeded `/sub/<token>`, assert the H1 + the three sections render
  per the seeded flags; tap the sub-note textarea, type a short
  note, tap Send, assert the success state.)

- [ ] A "Hand off to a sub" button on the EXISTING session detail page
  (read its path at pickup per LESSONS#0096 — likely
  `src/app/(dashboard)/sessions/[sessionId]/page.tsx` per the
  dashboard directory). The button sits ABOVE the existing 0029
  observer-link button (the sub-handoff is the more specific use
  case; the bare observer link remains for assistant-coaches who
  just want to see the roster mid-practice). Tapping opens a sheet
  with: the optional sub-name textarea, the three include
  checkboxes (default all on), a Generate-link button, and a
  Copy-link button on the success state. The sheet exposes
  `data-testid="sub-handoff-sheet"`. (vitest component test:
  render the session page with a mocked session, tap the button,
  assert the sheet opens; tap Generate, assert the POST; the
  success state shows the URL + Copy button. Playwright: scope
  every assertion to the new data-testid containers.)

- [ ] A new `<SubNoteCard />` on /home reads `GET /api/sub-handoff/
  recent-notes` (new, authed) which returns the caller's handoffs
  in the last 7 days where `sub_note_at IS NOT NULL AND
  sub_note_seen_at IS NULL`, ordered by `sub_note_at DESC`. The
  card renders ONE line per unread sub-note ("Mark left you a note
  from Tuesday's practice — '<truncated text 120 chars>'"), capped
  at 3; if more, the card adds "+ N more." A Got-it button POSTs
  to `/api/sub-handoff/recent-notes/seen` (new, authed) which sets
  `sub_note_seen_at = now()` on every row in the response so the
  card does not re-render the same notes tomorrow. Per LESSONS#0065
  / #0066 / #0162 — `home/page.tsx` is the DIRTY hotspot; add the
  new card with the SMALLEST POSSIBLE touch (one import + one JSX
  entry, mounted in the same area as the existing parent-reactions
  / new-followers cards). (vitest: a caller with two unread sub-
  notes sees the card with two lines; the Got-it POST marks them
  seen; an empty payload renders nothing; the card does NOT throw
  on a network failure per LESSONS#0036.)

- [ ] A "promote sub-note into an observation" surface on the sub-note
  detail expansion of the /home card (a single button next to the
  full-text view): "Add to my observations." Tapping POSTs to the
  EXISTING `/api/observations` create endpoint (read its shape at
  pickup per LESSONS#0096) with the sub-note text + the session_id
  + a `metadata: { sub_handoff_id: UUID, sub_first_name: string }`
  block on the observation row (extend the existing observations
  table's metadata jsonb — NO schema change required if the metadata
  field already exists; if it doesn't, this AC is REDUCED to "the
  promoted observation is written with the sub-note text + the
  session_id; the sub-attribution is preserved in the observation
  notes text as a 'Sub: Mark — <text>' prefix"). The promoted
  observation appears in the existing per-player observation list
  with the sub attribution. (vitest: the promote action POSTs the
  existing observations endpoint with the sub-note text + session_id;
  the sub-attribution is preserved in the resulting observation;
  the sub-note row's `sub_note_seen_at` is also set on promote.)

- [ ] Tier / feature gating: NEITHER the sub-handoff create NOR the
  public page NOR the sub-note submission is tier-gated. A free-tier
  coach can hand off practice to a sub. The sub-handoff is a
  fairness primitive (every coach needs to occasionally hand off);
  gating it would invert the moat. NO new tier feature key is
  added. (vitest: a free-tier coach successfully POSTs the create
  endpoint; the route does NOT import `tier.ts`.)

- [ ] Privacy / COPPA contract: the public `/sub/[token]` page renders
  player FIRST NAMES only in the `eyesOnPlayers` section. NEVER
  surfaces full names, DOB, jersey numbers, photo URLs, parent_email,
  parent_phone, medical_notes anywhere in the response. The
  `queuedDrills` section is static drill content (no minor data by
  design). The `weeklyFocusLine` is team-aggregate text (no minor
  data). The sub-note text is sub-authored AT THE TIME OF SUBMIT and
  is voice-scanned for the AGENTS.md banned words; the sub cannot
  upload audio, photos, or any media. The token expires in 24 hours
  via the existing `verifyObserverToken` helper. The route's
  `.select()` calls are EXPLICIT ALLOW-LISTS per LESSONS#0036. The
  sub-note write does NOT create an `auth.users` row for the sub
  (the sub never has an account from this flow; the 0029 conversion
  path is what makes them a coach if they later choose to). (vitest:
  planted DOB / medical_notes / parent_email / parent_phone rows do
  NOT appear in any sub-handoff route response; the `.select()`
  keysets are explicit allow-lists; the public page render contains
  only first names; the token-expiry posture is exercised; the sub-
  note submission never writes an auth.users row.)

- [ ] Voice contract: every user-facing string the dev adds (the sheet
  prompts + button labels, the public page H1 / section headers /
  empty-state messages / Send button label / footer, the /home
  sub-note card text + Got-it label, the promote-observation
  button label) contains NO AGENTS.md banned word per LESSONS#0023.
  Instruct POSITIVELY ("Thanks for stepping in, <Name>" not
  "amazing"; "what we're working on this week" not "elevate the
  team's journey"); never enumerate the banned tokens. The sub-
  note submission voice-scans the SUB-AUTHORED text on POST; on
  banned-word match returns `400 { reason: 'voice' }` with a
  one-line gentle nudge ("write the note like you'd text a friend
  — keep it short and concrete"). (vitest: render each new
  component and scan rendered text; scan the gentle-nudge text;
  test the route's voice-scan rejection.)

- [ ] Regression: the existing 0029 `/api/observer-link` route + the
  observer roster page are BYTE-IDENTICAL. The existing 0046
  sideline-cheat-sheet route + components are BYTE-IDENTICAL. The
  existing session detail page renders BYTE-IDENTICALLY for a
  coach who does not tap the new Hand-off button (the new button
  is the only addition). The existing /home renders BYTE-IDENTICAL
  for a coach with no sub-notes in the last 7 days. The existing
  observations endpoint is BYTE-IDENTICAL for the non-sub-promote
  path; the promote path uses the existing endpoint with the same
  POST body shape (only the metadata block widens, which the
  existing endpoint already accepts per its jsonb metadata field —
  verify at pickup). (vitest: snapshot the named routes /
  components against the seeded fixtures pre- and post-change;
  assert no diff for the un-touched paths.)

- [ ] Seeded e2e on the 0006 fixture: seed extension is ONE
  `sub_handoffs` row pre-minted by the E2E coach for an existing
  E2E session, with a deterministic observer token in the next
  free `0000000000<XX>+` range per LESSONS#0101, with all three
  include flags true. Also seed: ONE existing observation on the
  E2E player with the "left-hand finishes" lexical anchor so the
  `eyesOnPlayers` section has content. UUIDs reused where
  possible. Playwright spec: (a) sign in as the E2E coach,
  navigate to the seeded session, assert the Hand-off button
  renders, tap it, assert the sheet opens, tap Generate,
  assert the success state with the URL; (b) sign out, navigate
  unauthed to the seeded `/sub/<token>`, assert the H1 + the
  three sections render; (c) submit a short sub-note, assert the
  success state; (d) sign in as the E2E coach, navigate to
  /home, assert the SubNoteCard renders with the seeded sub-
  note text; tap Got-it; assert the next render does not show
  the same note. Scope by `data-testid` per LESSONS#0081 /
  #0082 (the E2E coach's first name "E2E" overlaps team
  strings per LESSONS#0029 — never use bare `getByText`). Skip
  when E2E creds are unset. Add `/sub/` and `/api/sub-handoff/`
  to `publicPaths` in the SAME PR per LESSONS#0091 / #0104.

## Out of scope

- A multi-session handoff ("the next 3 practices, not just tonight").
  v1 is one-session-at-a-time per the existing 24h observer-token
  shape. A persistent assistant-coach handoff is a different
  surface (effectively making the sub a co-coach, which has its
  own onboarding flow per the existing `team_coaches` join).
- An auto-fill of the queued drills from the team's HISTORY (vs the
  explicit practice plan). v1 reads the queued drills from the
  existing practice queue / plan for that session; if the regular
  coach has not planned the session, the queued-drills section is
  empty and the public page renders nothing for that section
  (silence beats invention).
- A live "the sub is on the page right now" presence indicator. v1
  is one-way: the regular coach generates, the sub reads, the sub
  optionally leaves one note at the end. No live presence.
- A sub-coach RATING or feedback surface ("how did Mark do?"). v1
  has no rating; the regular coach reads the sub-note and decides
  privately if they want Mark again.
- A "send the sub the parent contact list so they can text parents
  if a kid gets hurt." v1 does NOT expose parent contact info to
  the sub. The medical/emergency contact problem is real but is a
  separate ticket with its own privacy review — v1 is
  practice-coaching-context only.
- A "let the sub generate the parent reports for tonight's
  practice." v1 has no AI generation surface on the sub side. The
  regular coach is the only one who generates artifacts. The sub-
  note is a SEED for an observation, NEVER a generated artifact.
- A two-way chat between the regular coach and the sub. v1 is one
  outbound coaching brief + one inbound sub-note. The group-chat
  text the regular coach uses to share the link IS the two-way
  channel; the product does not need to replicate it.
- A bulk handoff ("share with all my assistant coaches in one
  tap"). v1 is one-link, one-sub. A bulk surface would invite
  account creation friction that defeats the no-account v1
  premise.

## Engineering notes

Files / patterns the dev should touch.

- `supabase/migrations/059_sub_handoffs.sql` (new) — the table + 2
  indexes only. NO column on any sacred table. LESSONS#0006 — at
  pickup confirm `059` is free; if 0064 / 0065 / 0066 claimed it,
  bump to `060`. LESSONS#0088 — strip `--` comments before the
  no-banned-token scan. Mirror 048's header style.
- `src/types/database.ts` — add `SubHandoff` type. NO field on any
  existing type.
- `src/app/api/sub-handoff/create/route.ts` (new) — `POST(request)`.
  Authed via `createServerSupabase()` for `auth.getUser()`, then
  `createServiceSupabase()` for the upsert. Head-coach check via
  `team_coaches` per LESSONS#0057. Token minted via the existing
  `generateObserverToken` per LESSONS#0096.
- `src/app/api/sub-handoff/[token]/route.ts` (new) — PUBLIC `GET`.
  Service-role read. 410 on expired; 404 on unknown. Per
  LESSONS#0036 — `.select()` as explicit allow-lists; the route
  NEVER returns minor data.
- `src/app/api/sub-handoff/[token]/sub-note/route.ts` (new) —
  PUBLIC `POST`. Voice-scanned. Rate-limited per token (3 max).
- `src/app/api/sub-handoff/recent-notes/route.ts` (new) — AUTHED
  `GET`. Returns the caller's unread sub-notes in the last 7
  days.
- `src/app/api/sub-handoff/recent-notes/seen/route.ts` (new) —
  AUTHED `POST`. Marks the sub-notes seen.
- `src/app/sub/[token]/page.tsx` (new) — PUBLIC parent-portal-
  aesthetic page. `'use client'` per LESSONS#0036's client-fetch
  posture so e2e `page.route()` is straightforward.
- `src/components/session/sub-handoff-sheet.tsx` (new) — the sheet
  on the session detail page. `data-testid="sub-handoff-sheet"`;
  copy button carries `data-share-url={publicUrl}` per
  LESSONS#0056 / #0082.
- `src/components/sub/sub-handoff-page-body.tsx` (new) — the
  rendered public page body (extracted for unit-testability per
  LESSONS#0060).
- `src/components/home/sub-note-card.tsx` (new) — the /home card.
  Mounted in `home/page.tsx` with the smallest possible touch
  per LESSONS#0065 / #0066 / #0162 (one import + one JSX entry,
  in the same area as the existing parent-reactions-card and
  new-followers-card).
- `src/app/(dashboard)/sessions/[sessionId]/page.tsx` (existing —
  read first per LESSONS#0096) — mount the new Hand-off button
  ABOVE the existing 0029 observer-link button. Per
  LESSONS#0096 — if the path is different at pickup (the
  dashboard layout may use a different sessions sub-route),
  mount on the actual session detail page.
- `src/lib/observer-utils.ts` (existing — read first per
  LESSONS#0096) — REUSE `generateObserverToken` +
  `verifyObserverToken`. Do NOT re-inline.
- `src/lib/supabase/middleware.ts` — add `'/sub/'` AND
  `'/api/sub-handoff/'` to `publicPaths` in the SAME PR per
  LESSONS#0091 / #0104. The `/api/sub-handoff/[token]` GET +
  the sub-note POST are public (the sub has no account); the
  `/create` + `/recent-notes` + `/recent-notes/seen` routes
  self-enforce auth in the handler (same posture as 0049's
  `/api/practice-plan-shares/create` per the existing middleware
  comments).
- `tests/migrations/059-sub-handoffs.test.ts` (new, `.test.ts` per
  LESSONS#0020 / #38) — scan migration body with `--` stripped
  per LESSONS#0088; assert column allow-list, UNIQUE constraint,
  both indexes; assert NO new column on any sacred table.
- `tests/api/sub-handoff-create.test.ts` (new) — every AC case.
  Per LESSONS#0055 — call no-arg handlers correctly; this
  route takes a request.
- `tests/api/sub-handoff-token-get.test.ts` (new) — every payload
  shape variant; the include-flag omission; expired / unknown;
  no minor data leaked.
- `tests/api/sub-handoff-sub-note.test.ts` (new) — voice; length;
  expired; rate-limit.
- `tests/api/sub-handoff-recent-notes.test.ts` (new) — unread-
  only filter; 7-day window; the seen POST.
- `tests/components/sub-handoff-sheet.test.tsx` (new) — render
  the sheet; tap Generate; assert POST + success state; Copy
  button has `data-share-url`.
- `tests/components/sub-handoff-page-body.test.tsx` (new) —
  every section's render + omission case; banned-word scan on
  rendered text per LESSONS#0023.
- `tests/components/sub-note-card.test.tsx` (new) — render with
  seeded unread; tap Got-it; assert the seen POST.
- `tests/app/sitemap.test.ts` (existing — DECIDE at pickup if
  `/sub/[token]` should be in the sitemap). The sub-handoff is
  scoped + 24h-expiring; per LESSONS#0091 / #0104 + the 0029
  observer precedent, the sub-handoff is NOT publicly
  discoverable — it should NOT be in the sitemap. The decision
  is to NOT extend the sitemap; document this in the
  Implementation log per LESSONS#0096. (vitest: assert the
  sitemap does NOT contain `/sub/` paths.)
- `tests/e2e/sub-handoff-flow.spec.ts` (new). Seed extension per
  the AC. UUIDs in next free `0000000000<XX>+` range per
  LESSONS#0101. Spec per the AC's four phases. Scope by
  `data-testid` per LESSONS#0081 / #0082. Skip when E2E creds
  are unset.
- New deps: NO. Migration: YES (059 or bump). Env vars: NO new.
  AI prompt change: NO (no AI call on this path; the public page
  renders existing coach-authored content only). Tier feature
  key: NO new key.
- LESSONS to anchor: #0006 (prefix uniqueness — coordinate at
  pickup), #0009 / #0036 (server vs client component fetch
  posture for the public sub page), #0020 / #38 (.test.ts),
  #0023 (positive voice for templates + voice scan on sub-note
  POST + the rejection-nudge text), #0029 / #0082 (strict-mode
  collisions in e2e — scope to data-testid; the E2E coach's
  first name overlaps team strings), #0036 (best-effort render
  + COPPA `.select()` allow-list on every public route),
  #0049 / #0092 / #0100 (mock queue spillover when extending
  shared from-chain mocks), #0055 (no-arg handler call
  posture in tests), #0056 / #0082 (data-share-url + data-
  testid), #0057 (team_coaches not teams.coach_id — head-coach
  check on the session's team uses this), #0065 / #0066 /
  #0162 (`home/page.tsx` is DIRTY — add the SubNoteCard with
  the smallest possible touch), #0084 / #0101 (seed posture;
  no new auth.users needed for the sub — they have no account
  by design), #0088 (strip `--` comments), #0091 / #0104
  (publicPaths for the new public page + public route prefix
  — must land in the same PR; the sub has no account and
  cannot pass middleware otherwise), #0096 (CRITICAL —
  schema wins over prose: at pickup, read the actual session
  detail page path + the existing `observer-utils.ts`
  signature + the actual practice-queue / plan shape +
  the existing `parent_reactions` open-thread shape per 0053
  + the existing `/api/observations` POST body shape before
  writing the routes).

## Implementation log

- 2026-06-04 [implementation-dev] Picked at pickup; status flipped to in-progress.
  Pickup discovery (LESSONS#0096 — schema wins over prose):
  - Migrations 059 (drill_shares) and 060 (coach_director_contacts) are taken;
    next free is 061. Bumped per LESSONS#0006.
  - Observer helpers: `src/lib/observer-utils.ts` exports
    `generateObserverToken(sessionId, ttlHours)` and `validateObserverToken`
    (NOT `verifyObserverToken` as the ticket prose said). Will use the real
    names. The observer page uses `/observe/[token]` per
    `buildObserverUrl()`; the sub page links Roster to that route at the
    SAME token so a sub can fall back to the roster view without a
    re-mint.
  - Session detail page at
    `src/app/(dashboard)/sessions/[sessionId]/page.tsx` confirmed. Existing
    Observer button at line ~3679 (`handleObserverLink`). Hand-off button
    mounts ABOVE that one.
  - `home/page.tsx` already mounts `<NewFollowersCard />` (line 1637) +
    `<ParentReactionsCard />` (line 1600) etc. — adding SubNoteCard with one
    import + one JSX entry next to them (LESSONS#0065 / #0066 / #0162).
  - `parent_reactions.coach_reply_at IS NULL` is the natural "open thread"
    proxy, but the schema and route shape make the eyes-on-players query
    cleaner if I read the two most-recent open-thread reactions, look up
    their player_id, and source the watch-line from the player's
    most-recent observation. Documented choice: use parent_reactions open
    threads (coach_reply_at IS NULL) → player_id → most-recent observation
    text. Fallback to "two players with the longest observation streak this
    week" only if zero open threads exist for the team.
  - `voice` scan: reusing `containsBannedWord` from `player-trajectory-utils.ts`
    (shared with director-invite per the existing pattern).
  - Sitemap decision: NOT extended (24h-scoped, no cold-search value).
    Negative assertion added.
  - publicPaths: adding `'/sub/'` AND `'/api/sub-handoff/'`. /create,
    /recent-notes, /recent-notes/seen self-enforce auth in the handler
    (same posture as `/api/practice-plan-shares/`).
  - Seed UUIDs: 0xfc/0xfd/0xfe range (last taken is 0xfb).
