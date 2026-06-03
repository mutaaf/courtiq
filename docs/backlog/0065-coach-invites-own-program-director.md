---
id: 0065
title: Right on the weekly-pulse share card, let a coach name their own program director and bring them onto SportsIQ with one tap and one email
status: shipped
priority: P1
area: growth
created: 2026-06-03
owner: product-groomer
---

## User story

As a volunteer YMCA soccer coach about to drop my weekly-pulse share card into the
league group chat (0057), I want a small "Send to my program director, Mike" line
right under the Copy-link button — pre-filled with Mike's name and email if I have
ever sent him a card before — so that in two taps I bring Mike onto SportsIQ with
MY team's name attached, with the card already loaded for him, and so the program
director hears about SportsIQ from one of his actual coaches instead of from a
cold marketing email he ignores.

## Why now (four lenses)

### Product Owner

The product has shipped two halves of the program-director acquisition flow but is
missing the third. (1) 0024 ships the DIRECTOR-INVITES-STAFF flow (the director
already on SportsIQ broadcasts one link to their staff). (2) 0050 ships the
PARENT-INVITES-DIRECTOR flow (the parent reading their kid's report taps "send to
our director" and the director gets a named, claim-able invite). Both are working
acquisition vectors. The third — the COACH inviting their OWN director — is the
biggest unguarded edge because the coach is the person with the most context on
WHY the director should pay attention (the coach is already publishing weekly
content the director wants to see). The smallest meaningful unit of value is ONE
new section on the existing 0057 weekly-pulse share sheet: under the Copy-link
button, two short fields (director first name + email), a "Send to my director"
button that POSTs `/api/program-director-invites/create`, an email to the
director carrying the same public `/week/<token>` URL the coach is sharing PLUS
a one-line "Coach Sarah Rodriguez on the Hawks invited you to see what their
team is working on this week" lead and a small "Claim this team's program on
SportsIQ — free" CTA that lands the director on `/programs?invite=director&
ref=<signed>` (the existing 0033 program-claim surface) with the coach's team
ALREADY ATTACHED to the org once they claim. Pre-fills the director's name +
email from the coach's previous invite (a tiny `coach_director_contacts`
table) so a second weekly invite is one tap. Reuses 0050's program-referrals
audit table where applicable for the invite-attribution analytics.

### Stakeholder

This is the moat-deepening edge that finally closes the three-sided program-
acquisition triangle (coach <-> parent <-> director) inside the product. Three
compoundings, all distinct from anything shipped. (1) The director-acquisition
moat — today a program director only learns about SportsIQ via 0024 (already
on-platform) or 0050 (parent forwards a report). The coach-initiated invite is
the THIRD acquisition lever and is structurally the HIGHEST-TRUST signal of
the three because the director has a working relationship with the coach
(unlike the parent who is one rung removed). The director-acquisition rate
compounds. (2) The director-stickiness moat — a director who lands via this
flow arrives WITH a real team's weekly pulse card already loaded. They are
NOT staring at an empty dashboard; they are reading actual content from a
coach in their own program. The new-director churn after first-session is the
biggest leak in the org-side funnel; landing them at a populated surface is
the structural fix. (3) The coach-retention moat — a coach whose director
joins SportsIQ has a STRUCTURAL reason to keep publishing weekly pulses
(their boss is reading them). The most common cause of coach churn after
month 2 is "no one's looking at this." This flow inverts that loop: by
inviting the director the coach manufactures an audience, and the loop
self-sustains. Distinct from 0024 (already-in director) and 0050 (parent
referral) — those are different actors with different trust shapes.

### User (the coach, Sunday 8:14pm, just published the week's pulse)

She has just tapped the existing 0057 "Share this week" button. The success
sheet is open showing the pulse preview, the Copy-link button, and the caption
textarea. NEW small section beneath the existing surface (a thin divider, then
a two-line block): "Send this to your program director?" Under it: two short
inputs — Director name (pre-filled from her last invite if she has one) and
Director email (same pre-fill). One button: "Send to Mike." She taps. The
button flips to "Sent. Mike will see this card in his inbox." Done. Total
interaction: under 25 seconds (two taps if the pre-fill was already there).
If she has no director yet, the section reads "Send this to your program
director?" with empty fields — the pre-fill only saves her time on weeks 2+.
If Mike has ALREADY been invited via this flow in the last 30 days (anyone's
invite, not just hers — the dedup is shared across the program), the button
reads "Already invited — Mike will see this in his /home" and the email is
short-circuited; the public URL is still sent in a single line so she can
choose to forward it herself if she wants.

### User (Mike, Monday 7:11am, opens email on the way to work)

Subject: "Coach Sarah Rodriguez invited you to see this week's Hawks pulse."
The email body is four short blocks: (1) the lead line ("Coach Sarah Rodriguez
on the Hawks invited you to see what her team is working on this week"); (2) a
preview embed of the pulse card content (session count, top categories, focus
line — same shape as the public `/week/<token>` page); (3) one button "See the
card on SportsIQ" deep-linking to `/week/<token>?ref=director-invite`; (4) a
small secondary line "Want this for your whole program? Claim Hawks's program
on SportsIQ — free" linking to `/programs?invite=director&ref=<signed>`.
If Mike taps the secondary link he lands on the existing 0033 program-claim
surface with Sarah's team's organization pre-selected (or the
unaffiliated-team org-creation flow if Sarah's team is currently solo). On
claim, Sarah's team auto-attaches to the new/claimed org (via the existing
`team_coaches` + `coaches.org_id` shape; LESSONS#0057 — `team_coaches` is the
join, not `teams.coach_id`).

### Growth

The "show me" moment is the inbound email itself — a NAMED coach the director
already knows, with a real team's real weekly content already loaded inside
the email preview, with a single tap to see more. That is the email a
program director actually opens because the sender is internal to their
program, not a cold marketing nudge. Compounds three ways. (1) Each coach-
sent invite is a soft acquisition vector — the director's claim flow brings
the WHOLE program onto SportsIQ (every other coach on the staff inherits
the org context immediately, mirroring 0024's broadcast surface in
reverse). (2) The invite re-fires WEEKLY (every Sunday after the pulse is
published, the same coach can send the same director a new card with new
content — the pre-fill makes this a 2-tap action), which structurally raises
the conversion rate over a one-shot invite. (3) The director landing on
`/programs?invite=director&ref=<signed>` flows through the existing 0033
attribution funnel, so the program-claim metric the org-side already tracks
captures these naturally — no new analytics surface to build. Distinct from
0024 (the director-already-on-platform broadcast) and 0050 (the parent-
forward) — this is the coach-initiated invite, the third edge of the
triangle.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `059_coach_director_contacts.sql` adds the table
  `coach_director_contacts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  director_first_name TEXT NOT NULL, director_email TEXT NOT NULL,
  director_email_hash TEXT NOT NULL, last_invited_at TIMESTAMPTZ NOT NULL
  DEFAULT NOW(), invite_count INT NOT NULL DEFAULT 1, UNIQUE(coach_id,
  director_email_hash))`. One index `(coach_id, last_invited_at DESC)`
  for the pre-fill lookup. The `director_email_hash` (sha256, hex) exists
  so the dedup query never puts a raw email into a WHERE clause —
  mirrors 0050's `program_referrals.director_email_hash` posture per
  migration 052 (read at pickup per LESSONS#0096). Mirror 052's header
  style + COPPA-posture comment block. Prefix `059` is the next free
  integer after `058_coach_follows.sql` (LESSONS#0006 — at pickup
  confirm; if 0064 / 0066 / 0067 claimed `059` first, bump to `060`).
  LESSONS#0088 — strip `--` comments before the no-banned-token scan.
  (vitest: scan migration SQL with `--` stripped, assert column allow-
  list, assert UNIQUE constraint, assert the index exists; assert NO
  new column on `coaches` / `teams`.)

- [ ] `POST /api/program-director-invites/create` (new, authed) accepts
  `{ teamId: UUID, weeklyPulseToken: string, directorFirstName: string,
  directorEmail: string }`. The route: (a) verifies the caller is a
  head coach on the team via `team_coaches` per LESSONS#0057; (b)
  verifies the weekly-pulse token belongs to a `weekly_pulse_shares`
  row owned by the same team (read its shape per migration 054 +
  LESSONS#0096); (c) validates the director email format + the name
  is 1–60 chars + voice-clean per LESSONS#0023 (`400 { reason: 'voice'
  | 'format' | 'length' }` on rejection); (d) hashes the email; (e)
  upserts a `coach_director_contacts` row on `(coach_id,
  director_email_hash)` (a re-invite of the same director increments
  `invite_count` + bumps `last_invited_at` on the SAME row); (f)
  reads the SHARED 30-day dedup across the program: if ANY coach in
  the same `org_id` has already invited this director in the last 30
  days OR the director already has a coach row attached to that
  org_id, return `200 { sent: false, reason: 'already-invited' | 'already-
  on-platform', dedupVia: 'coach' | 'org-membership' }`; (g) on a
  real send, fires the email via the existing email sender (mirror
  the 0050 program-referral sender at
  `src/app/api/share/[token]/program-referral/route.ts` —
  LESSONS#0096 read first) and returns `200 { sent: true,
  inviteCount }`. Server-side rate-limit: max 20 director invites per
  coach per 7 rolling days (429 on overflow). (vitest: 200 first send
  + contact row written; 200 second send same director increments
  invite_count, returns invite_count=2; 200 dedupVia=coach for a
  director invited by a sibling coach in the org within 30 days;
  200 dedupVia=org-membership for a director with a coach row in the
  org; 400 voice / format / length; 403 caller not a head coach;
  429 on 21st invite in 7 days; 401 unauthed.)

- [ ] `GET /api/program-director-invites/contact-prefill` (new, authed)
  returns the caller's most-recent `coach_director_contacts` row as
  `200 { directorFirstName, directorEmailMasked, hasContact: true }`,
  or `200 { hasContact: false }` when the caller has no contacts. The
  EMAIL is MASKED on read (`m***@example.com`) — the raw email is
  written ONLY in the POST body, not surfaced in any GET response.
  This is the pre-fill surface the share-sheet reads; the email is
  re-typed by the coach on the share-sheet (the masked value is a
  visual confirmation that "yes, I have a contact already" — not a
  hidden field). The route returns at most ONE contact (the most
  recent). (vitest: returns the most-recent contact with masked email;
  empty payload for no-contacts coach; 401 unauthed; raw email is
  NEVER in the response body for any path.)

- [ ] The existing 0057 `<WeeklyPulseShareCard>` (or the share sheet it
  opens — read `src/components/home/weekly-pulse-share-card.tsx` at
  pickup per LESSONS#0096) gains a new section beneath the existing
  Copy-link button: a thin divider, the prompt "Send this to your
  program director?", two `<input>`s (director first name + email,
  pre-filled from the contact-prefill GET on sheet open), one
  "Send to <first name>" button (label dynamically updates as the
  name input changes; default text "Send to your director" when the
  name field is empty), and a small dismiss-X icon ("Not now") that
  hides the section for the rest of this open-sheet session. On
  submit, POST to `/api/program-director-invites/create` with the
  team id + the weekly pulse token + the two fields. The button flips
  to a success state ("Sent. <Name> will see this card in his/her
  inbox.") on `sent:true` and to a quieter "Already invited recently
  — <Name> will see this in his/her /home" on `sent:false`. The
  section exposes `data-testid="director-invite-section"`; the
  Send button exposes `data-share-url={weeklyPulsePublicUrl}` per
  LESSONS#0056 / #0082 (the same URL we send the director, useful
  for the e2e to assert the right token is being threaded). (vitest:
  the section renders inside the share sheet; prefill GET fires on
  open; tapping Send POSTs the create endpoint; success state shows
  the named director; dismiss-X hides the section for the rest of
  the open-sheet lifetime; the existing Copy-link + caption surfaces
  are byte-identical.)

- [ ] The director-invite EMAIL has FIVE elements only: (a) the lead
  line naming the coach + the team ("Coach <First> <Last> on the
  <Team> invited you to see what their team is working on this
  week."), (b) a structured preview of the weekly-pulse content
  (week label, session count, top categories, focus line — same
  shape as the public `/week/<token>` page renders per migration 054
  + the existing share renderer), (c) one CTA button "See the card
  on SportsIQ" linking to `/week/<token>?ref=director-invite`, (d)
  one secondary line "Want this for your whole program? Claim
  <Team>'s program on SportsIQ — free" linking to `/programs?
  invite=director&ref=<signed>`, (e) the existing email footer with
  unsubscribe (mirror 0050's email layout at
  `src/lib/email/layout.ts` — LESSONS#0096 read first). Voice
  contract: NO AGENTS.md banned word in subject OR body per
  LESSONS#0023 (instruct positively in the template; this is a
  structured template — there is no AI call on this path). The
  coach's name is `coaches.full_name` (the full name IS the coach's
  own public identity, not a minor's) and the team name is
  `teams.name`. The director's first name is the field the coach
  typed (not pulled from any DB). (vitest:
  `buildDirectorInviteEmail({ coachFullName, teamName,
  directorFirstName, weeklyPulsePreview, deepLinkUrl,
  programClaimUrl, unsubscribeUrl })` for each fixture; banned-word
  scan on every output; the program-claim URL contains the signed
  ref; the deep-link URL contains the pulse token + `?ref=director-
  invite`.)

- [ ] The director-claim landing on `/programs?invite=director&ref=
  <signed>` already exists per ticket 0033; this ticket adds NO new
  page surface there. The existing `/programs` page reads the `ref`
  param and, on claim, attaches the inviting coach's team to the
  newly-claimed org via the existing `team_coaches` shape (read the
  0033 claim handler at pickup per LESSONS#0096 — the rewire is
  surgical: when `?invite=director` is present AND the `?ref=` is a
  valid signed coach+team payload, the claim handler resolves the
  inviting team's `coaches.org_id` to the claimed org id and the
  team's `team_coaches` row inherits the org context automatically
  via the existing coach.org_id read). If the team is currently
  attached to a different org, the claim handler returns `409 {
  reason: 'team-already-attached' }` and the director is shown a
  one-line "this team is already on a SportsIQ program — contact
  your other director" message (NO error toast; the existing 0033
  page handles 409 quietly per LESSONS#0036). (vitest: the existing
  /programs claim handler handles the new `invite=director` +
  `ref` combination; attaches the team's org_id to the claimed
  org when the team has no org; returns 409 when the team is
  already attached; the signed ref is validated server-side.)

- [ ] The signed `ref` payload uses the EXISTING signed-token
  pattern from 0050's program-referral signing (read
  `src/lib/program-referral-signing.ts` or wherever the existing
  signing lives at pickup per LESSONS#0096). The payload is
  `{ coachId: UUID, teamId: UUID, inviteId: UUID, sentAt: ISO }`,
  signed with the existing app secret. Expiration: 30 days from
  `sentAt`. Verification rejects an expired or mis-signed payload
  with `400 { reason: 'invalid-ref' | 'expired-ref' }`. (vitest:
  round-trip sign + verify; expired ref rejected; tampered ref
  rejected; 30-day window enforced.)

- [ ] Tier / feature gating: the COACH-side invite send is universal
  (free + paid). The director-side claim flow is universal (existing
  0033 surface is universal). NO new tier feature key is added —
  acquisition primitives stay open per the 0024 / 0050 / 0063
  posture. (vitest: a free-tier coach successfully POSTs the create
  endpoint; the route does NOT import `tier.ts`.)

- [ ] Privacy / COPPA contract: the `coach_director_contacts` table is
  COACH-TO-DIRECTOR only. It NEVER references a player, a parent, a
  session, or a minor's data. The email body contains the coach's
  full name (the coach's own public identity), the team name, the
  director's first name (typed by the coach), and the weekly-pulse
  preview (which by migration 054 contains NO player data — session
  counts + categories + focus line are team-level aggregates only).
  The route's `.select()` calls are EXPLICIT ALLOW-LISTS per
  LESSONS#0036 (the weekly-pulse-share read in particular MUST NOT
  widen its select-set). The pre-fill GET MASKS the director's email
  on read. The raw email is stored on the contacts row (so the
  next invite can re-send to the same address) but is NEVER
  returned to the client. (vitest: planted player / parent / DOB
  rows do NOT appear in any route response or the rendered email;
  the `.select()` keysets are explicit allow-lists; the pre-fill
  GET returns a masked email; the raw email never round-trips to
  the client.)

- [ ] Voice contract: every user-facing string the dev adds (the share-
  sheet section header + prompts + Send button label + success state,
  the email subject + body + CTAs + secondary line + alternate copies,
  the dismiss-X aria-label) contains NO AGENTS.md banned word per
  LESSONS#0023. Instruct POSITIVELY; never enumerate the banned
  tokens. (vitest: render the new section and scan rendered text for
  the banned list; scan `buildDirectorInviteEmail` output for the
  banned list.)

- [ ] Rate-limit + dedup posture: at most ONE invite per
  `(org_id, director_email_hash)` per 30 days (shared across all
  coaches in the same org — a sibling coach inviting the same
  director the same week short-circuits via dedupVia=coach). At
  most 20 sends per caller per 7 rolling days. The dedup query
  uses the existing 0050 `program_referrals` table where applicable
  (a director invited via 0050 in the last 30 days ALSO short-
  circuits via dedupVia=coach with a 'parent-referral-precedes'
  variant — read 0050's dedup posture at pickup per LESSONS#0096
  and mirror byte-for-byte). (vitest: org-shared 30-day dedup
  enforced; rate-limit enforced; the cross-flow dedup against
  `program_referrals` short-circuits when applicable.)

- [ ] Regression: the existing 0057 weekly-pulse-share-card render
  is BYTE-IDENTICAL on a coach who has not opened the share sheet
  (the new section lives INSIDE the sheet, not on the card body).
  The existing 0057 share-sheet's existing Copy-link, caption
  textarea, and preview are BYTE-IDENTICAL — the new section
  appears BELOW them with a clear divider. The existing 0024
  `/api/org/invite` route is BYTE-IDENTICAL. The existing 0050
  `/api/share/[token]/program-referral` is BYTE-IDENTICAL — this
  ticket only READS from the 0050 audit table for cross-flow
  dedup, never writes to it. The existing 0033 `/programs` page
  is functionally equivalent (the rewire is the new `?invite=
  director` handling, which is additive). (vitest: snapshot the
  named routes / components against the seeded fixtures pre- and
  post-change; assert no diff for the un-touched paths.)

- [ ] Seeded e2e on the 0006 fixture: seed extension is ONE new
  `weekly_pulse_shares` row owned by the E2E coach for the current
  ISO week (so the share sheet opens with a real token) +
  optionally ONE pre-seeded `coach_director_contacts` row for the
  E2E coach naming a fixture director ("Mike Director",
  "mike+seed@example.test") so the pre-fill GET returns data on the
  first sheet open. UUIDs in the next free `0000000000<XX>+` range
  per LESSONS#0101. Playwright spec: sign in as the E2E coach,
  open /home, tap "Share this week" on the existing 0057 card to
  open the share sheet, assert the new director-invite section
  renders with the pre-filled director name + masked email, type
  a director email (or accept the pre-fill via re-entry), tap
  Send, assert the success state ("Sent. <Name> will see this
  card."). Assert the email-send was invoked exactly once (mock
  the email sender at the test boundary per LESSONS#0036). Scope
  by `data-testid` per LESSONS#0081 / #0082 (the E2E coach's
  first name "E2E" overlaps with team strings per LESSONS#0029 —
  never use bare `getByText`). Skip when E2E creds are unset.

## Out of scope

- A bulk invite of multiple directors at once. v1 is one director at a
  time; a multi-director invite is a follow-up if revealed by usage
  (the typical coach has one director, not three).
- A director-side reply / acknowledge surface ("yes I see it" → the
  coach gets a /home notification). v1 has no two-way ack; the
  director's claim of the program IS the acknowledgement, and the
  /home program-claim attribution (existing 0033 path) is the
  signal the coach gets indirectly.
- An auto-send weekly invite to the director (cron). v1 is coach-
  initiated only; an auto-send would feel spammy and would invert
  the trust shape (the coach chooses to send each time). A future
  ticket can layer an opt-in weekly auto-send for the coach.
- A "send to all my parents" multi-recipient surface. v1 is
  director-only; parent-side sends are already covered by the
  existing parent-portal share flows (0011 / 0050).
- A director-side digest of "this week's weekly-pulses from all
  coaches who invited me" (a 0028-style program pulse). v1 lands
  the director on the /programs claim flow + one team's content;
  the multi-team director digest is a follow-up that lives in the
  0028 area.
- An in-app "share with director" surface on EVERY shareable
  artifact (parent report, season recap, game recap, etc.). v1
  surfaces this on the WEEKLY-PULSE share card only — the weekly
  pulse is the artifact that BY DESIGN is at the program level
  (categories + focus, no per-kid content), so it is the lowest-
  privacy artifact to send to a director. Per-kid artifacts
  going to a director would require a separate privacy review.
- A "remove this director from my contacts" surface. v1 has no
  contact-list management UI; a coach who mistypes once gets the
  prefill of the wrong contact the next week. A contact-management
  follow-up is fine but not v1.

## Engineering notes

Files / patterns the dev should touch.

- `supabase/migrations/059_coach_director_contacts.sql` (new) — the
  table + 1 index. NO column on `coaches` / `teams`. LESSONS#0006 —
  at pickup confirm `059` is free; if 0064 / 0066 / 0067 claimed it,
  bump to `060`. LESSONS#0088 — strip `--` comments before the
  no-banned-token scan. Mirror 052's COPPA-posture comment block.
- `src/types/database.ts` — add `CoachDirectorContact` type. NO
  field on `Coach` / `Team`.
- `src/app/api/program-director-invites/create/route.ts` (new) —
  `POST(request)`. Authed. Verifies head-coach on the team via
  `team_coaches` per LESSONS#0057. Reads the weekly-pulse-share row
  via the EXISTING `from('weekly_pulse_shares')` posture per
  migration 054 — LESSONS#0096 read first. Voice-scans the
  director name + email format. Upserts the contacts row. Reads
  the shared 30-day dedup against the new contacts table AND the
  existing 0050 `program_referrals` table. Fires the email via
  the EXISTING sender (mirror 0050's `program-referral` route at
  `src/app/api/share/[token]/program-referral/route.ts` —
  LESSONS#0096 read first).
- `src/app/api/program-director-invites/contact-prefill/route.ts`
  (new) — `GET()`. Authed. Returns the most-recent contact with
  the email MASKED. Per LESSONS#0036 — explicit `.select()` allow-
  list.
- `src/lib/director-invite-utils.ts` (new) — pure helpers:
  `hashDirectorEmail(raw): string`, `maskDirectorEmail(raw):
  string`, `buildDirectorInviteEmail({ ... }): { subject, html,
  text }`, `validateDirectorName(raw): { ok: boolean, reason?:
  'length' | 'voice' }`. NO DB access. Voice POSITIVELY per
  LESSONS#0023.
- `src/lib/program-referral-signing.ts` (existing — read first per
  LESSONS#0096; if the signing helper lives elsewhere, mirror it
  byte-for-byte) — reuse the existing signed-payload helper for
  the `ref` param.
- `src/components/home/weekly-pulse-share-card.tsx` (existing —
  read first) — add the new director-invite section BENEATH the
  existing Copy-link button inside the share sheet. Per
  LESSONS#0065 / #0066 / #0162 — the recurring DIRTY hotspot is
  `home/page.tsx`, NOT this card; the card edit is safe but
  still keep the touch minimal (one new section component +
  one wiring change).
- `src/components/home/director-invite-section.tsx` (new) — the
  inline section component. Exposes `data-testid="director-invite-
  section"`; the Send button exposes `data-share-url=
  {weeklyPulsePublicUrl}` per LESSONS#0056 / #0082.
- `src/app/programs/page.tsx` (existing — read first; per
  LESSONS#0091 the `/programs` route is in `publicPaths` per
  LESSONS#0033) — handle the new `?invite=director&ref=<signed>`
  combination. Verify the signed ref. On a logged-in director,
  attach their newly-claimed org to the inviting team's
  `coaches.org_id`. On 409 (team already attached), render the
  quiet one-line message per LESSONS#0036.
- `src/lib/supabase/middleware.ts` — NO new entry. The new
  `/api/program-director-invites/` routes are AUTHED (the
  create + the prefill); the `/programs` page already lives in
  `publicPaths`. Per LESSONS#0091 / #0104 — verify at pickup.
- `tests/migrations/059-coach-director-contacts.test.ts` (new,
  `.test.ts` per LESSONS#0020 / #38) — scan migration body with
  `--` stripped per LESSONS#0088; assert column allow-list,
  UNIQUE constraint, the index; assert NO new column on
  `coaches` / `teams`.
- `tests/api/program-director-invites-create.test.ts` (new) — the
  full matrix from the AC. Per LESSONS#0049 / #0092 / #0100 — if
  the existing 0050 `program-referral` test or the existing
  sitemap test shares a from-chain mock with this route, drain
  `mockReset()` in `beforeEach` and update the queues.
- `tests/api/program-director-invites-prefill.test.ts` (new) —
  masked email; empty payload; raw-email never in response;
  401 unauthed.
- `tests/lib/director-invite-utils.test.ts` (new) — every helper
  case including the voice scan; banned-word scan on every email
  rendering.
- `tests/components/director-invite-section.test.tsx` (new) —
  render the section; prefill GET fires; Send button POST; success
  + already-invited states; dismiss-X hides for the session.
- `tests/components/weekly-pulse-share-card.test.tsx` (EXISTING
  if present — read first; extend) — assert the new section is
  mounted in the share sheet; the existing Copy-link + caption
  surfaces are byte-identical.
- `tests/app/programs-page.test.tsx` (EXISTING if present —
  extend) — the `?invite=director&ref` combination is handled;
  the claim attaches the team's org_id; the 409 path is quiet.
- `tests/e2e/director-invite-flow.spec.ts` (new). Seed extension:
  ONE `weekly_pulse_shares` row owned by the E2E coach for the
  current ISO week. Optionally ONE `coach_director_contacts`
  row for the pre-fill. UUIDs in next free `0000000000<XX>+`
  range per LESSONS#0101. Spec per the AC. Scope by
  `data-testid` per LESSONS#0081 / #0082. Skip when E2E creds
  are unset.
- New deps: NO. Migration: YES (059 or bump). Env vars: NO new (the
  existing email-sender env + `NEXT_PUBLIC_APP_URL` + the existing
  signing secret are reused). AI prompt change: NO. Tier feature
  key: NO new key.
- LESSONS to anchor: #0006 (prefix uniqueness — coordinate at
  pickup), #0009 / #0036 (server vs client component fetch posture
  for the share sheet — the existing 0057 sheet is `'use client'`,
  the new section mounts inside it), #0020 / #38 (.test.ts),
  #0023 (positive voice for templates + voice scan on caption /
  email), #0029 / #0082 (strict-mode collisions in e2e — scope to
  data-testid; the E2E coach's first name overlaps team strings),
  #0036 (COPPA `.select()` allow-list; quiet error state on
  409), #0049 / #0092 / #0100 (mock queue spillover when
  extending shared from-chain mocks — likely sitemap if any new
  surface is added there, AND the 0050 program-referral test if
  it shares a from-chain with the dedup query), #0055 (no-arg
  handlers in tests; this route takes a request body), #0056 /
  #0082 (data-share-url + data-testid), #0057 (team_coaches not
  teams.coach_id), #0065 / #0066 / #0162 (`home/page.tsx` is the
  DIRTY hotspot — this ticket does NOT touch it; the share sheet
  is in a sibling component), #0084 / #0101 (seed posture; no
  new auth.users needed for the director — they are unattached
  until they claim), #0088 (strip `--` comments), #0091 /
  #0104 (publicPaths — no change; the new routes are authed and
  `/programs` is already public), #0096 (CRITICAL — schema wins
  over prose: at pickup, read the actual `weekly_pulse_shares`
  columns per migration 054, the actual `program_referrals`
  dedup posture per migration 052 + `src/app/api/share/[token]/
  program-referral/route.ts`, and the actual `coaches.org_id` +
  `team_coaches` shape before writing the routes).

## Implementation log

- 2026-06-03 [implementation-dev] Picked up. Migration prefix 059 is already
  taken by `059_drill_shares.sql` (ticket 0064), so this ticket lands as
  `060_coach_director_contacts.sql` per LESSONS#0006 — version prefixes
  must be unique. Branch `feat/0065-coach-invites-program-director` off
  freshly-pulled main.
