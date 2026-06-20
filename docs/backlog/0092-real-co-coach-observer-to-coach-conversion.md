---
id: 0092
title: When the same observer-link from 0029 has been opened by 2+ different helpers across 2+ practices for the SAME team, surface ONE quiet card on the regular coach's /home naming "you have a real co-coach now — Aisha opened your observer link 3 times and ran a drill on Tuesday — bring her on as a Coach-tier teammate, free until your next renewal" so the observer-to-coach conversion finally fires on STRUCTURAL evidence of a recurring helper rather than the cold one-tap upgrade prompt the 0029 primitive currently leaves at the door
status: shipped
priority: P1
area: growth
created: 2026-06-20
owner: product-groomer
---

## User story

As a volunteer basketball coach who has been running the U12 alone since
August — except for two Tuesdays when my friend Aisha covered for me because
my kid had a fever, and one Thursday when she took the warm-up because I
ran late — and who has been mailing her the 0029 observer link every time
without thinking of her as "on SportsIQ" — I want, the next time I open
/home, ONE quiet zinc-500 card that says: "Aisha has opened your U12
observer link 3 times across the last 14 days and ran one drill on
Tuesday's practice. She's been co-coaching with you. Bring her on as a
Coach-tier teammate — free until your next renewal." with ONE primary
button that triggers the existing 0015 referral-invite path pre-filled
with her name and her observer-link opens as the warm-context line in the
invite copy, and ONE secondary "Not yet" dismiss button, so the platform
finally names the RELATIONSHIP I already have — Aisha is not a
hypothetical referral target, she is the person who ran my warm-up — and
the upgrade prompt lands on structural evidence (3 opens, 1 drill run)
rather than the cold one-tap "invite an assistant" CTA the 0015 surface
fires at coaches who have nobody to invite.

## Why now (four lenses)

### Product Owner

Ticket 0029 shipped the observer-link primitive — a regular coach can
generate a short-lived signed URL for a parent who is covering practice,
and that URL lets the helper see "what we're working on this week"
without an account. The conversion path 0029 promised — observer
becomes coach — was wired but never optimized. The product currently
fires the 0015 "invite an assistant coach" CTA on a calendar trigger
(week 4 of the season), which is cold for the 80% of coaches who do
not actually have an assistant. What the product does NOT have is a
surface that fires when the observer-link telemetry already names a
RECURRING helper — the same observer-link opened by the same device /
email-hashed-identifier 2+ times across 2+ distinct practices,
optionally with a "they ran a drill" signal from the existing 0067
sub-coach posture. The smallest meaningful unit of value is: (a) a new
pure helper `findRecurringObserverHelpers({ observerOpenRows,
practiceRows, minOpens, minDistinctPractices, lookbackDays })` that
groups observer-open events by `helper_identifier` (the existing
`observer_link_opens` table from 0029 — read at pickup per
LESSONS#0096; the actual table name MAY be different — verify) and
returns helpers who meet the threshold; (b) a new authed
`GET /api/coach/recurring-observers` route that returns
`{ eligible: boolean; helpers: Array<{ helperIdentifier: string;
displayName: string | null; openCount: number; distinctPracticeCount:
number; ranDrill: boolean; lastOpenAt: string; teamId: string;
teamName: string }>; eligibilityReason?: 'no_observer_opens' |
'no_helpers_meeting_threshold' | 'all_helpers_already_invited' }`;
(c) a new client component `<RealCoCoachCard />` mounted on /home
that renders ONLY when the route returns at least one qualifying
helper AND the helper has not been invited via 0015 in the last 30
days AND the coach has not dismissed for this helper-team pair; (d)
the primary button reuses the existing 0015 referral-invite flow
PRE-FILLED with the helper's name (when known — observer links can
carry a `display_name` query param per the 0029 ship; if no name is
known, the card falls back to "the helper who opened your link 3
times" with no name surfaced); (e) the invite copy carries a NEW
warm-context line — "Aisha opened your U12 link 3 times and ran one
drill on Tuesday" — that the existing 0021 / 0015 invite-email
template renders ABOVE the existing copy. NO new AI call. NO change
to the observer-link primitive itself. NO change to the referral-credit
schema (0074). NO new tier feature key.

### Stakeholder

This is the ACQUISITION primitive that finally turns the
observer-to-coach conversion path the 0029 ticket promised into a
COMPOUNDING surface — the named acquisition lever the strategy log
keeps surfacing: "0029 shipped the primitive, but the loop isn't
optimized." Three compoundings, each structurally hard for a
forms-app competitor to replicate. (1) The structural-evidence
compound — the prompt fires on REAL relational data (3 opens, 2
practices, 1 drill run) that competitors cannot collect because they
do not have an observer-link primitive at all. TeamSnap has roster
sharing but no "what we're working on" link; GameChanger has scoring
but no practice context. SportsIQ has the only telemetry surface
that says "this person is your co-coach by behavior." (2) The
warm-invite compound — the invite that goes to Aisha is warm not
because the inviting coach knows what to say, but because the
product knows what she did (opened the link 3 times, ran the
warm-up). The existing 0021 named-referral landing already pays off
warm invites with structurally-higher signup conversion; this
surface generates the WARMEST possible invites because the recipient
already touched the product. The conversion rate on these invites
should exceed both 0015's cold-list invites and 0029's anonymous
observer-link signups by structural multiples. (3) The free-team-
expansion compound — every Aisha-shaped helper who converts via
this card brings a 2-coach team onto SportsIQ. The 0015 / 0024 /
0029 cohorts collectively shipped the surfaces that turn ONE coach
into MANY; this ticket closes the loop on the smallest-but-most-
common case (the coach who is alone but has ONE recurring helper).
On the moat axis, this primitive widens the observer-link surface
into a load-bearing acquisition channel competitors cannot copy
without first building the observer-link primitive — a 6-month
engineering lift even if they wanted to. Per the strategy log —
"the OBSERVER → COACH conversion at scale (0029 shipped the
primitive, but the loop isn't optimized)" — this is exactly that
optimization, and the surface compounds with every observer-link
generated.

### User (Marco, the U12 coach, opens /home on a Sunday afternoon)

He opens /home. The daily focus is at the top as usual. Under it,
the 0088 first-cross-coach-signal card (if it fired this week, gone
by now), under that, ONE new card with a quiet zinc-500 stroke:
"Aisha has opened your U12 observer link 3 times across the last
14 days and ran one drill on Tuesday's practice. She's been
co-coaching with you." Underneath: ONE primary orange button —
"Bring Aisha on as a Coach-tier teammate (free until your next
renewal)." Underneath: ONE secondary "Not yet" button that
dismisses for this helper-team pair for 30 days. He taps the
primary button. A small modal opens — the existing 0015 invite
modal, pre-filled with Aisha's name (from the observer-link
display_name) and Marco's referral code (carried per 0011). The
email-or-phone field is empty (he fills in her email or phone).
He taps Send. The existing 0015 / 0021 referral-invite flow
fires; Aisha receives a warm-context email — "Marco invited you
to coach the U12 with him on SportsIQ. You opened his observer
link 3 times across the last 14 days and ran one drill on
Tuesday. Want to coach alongside him?" — and the 0021 landing
names Marco. She signs up. The platform converts an observer
into a coach on the strongest possible warm signal. On a flaky
gym wifi, the card renders from the /home feed payload (no
second round-trip). The invite POST is one write the coach can
retry if it fails.

### Growth

The "show me" moment is the card ITSELF — the screenshot that
says "Aisha has opened your link 3 times and ran one drill on
Tuesday." That is a screenshot Marco sends to Aisha BEFORE the
formal invite email, in his own text — "lol the app called you
out, you're my co-coach now, here's the screenshot." That is a
viral artifact only SportsIQ can produce because only SportsIQ
has the observer-link telemetry that names the relationship.
Three compoundings. (1) The screenshot-precedes-invite compound
— the coach sends the screenshot in his own voice first; the
formal invite lands second; the conversion stacks because the
recipient is already-primed when the email arrives. (2) The
warm-multi-team compound — once Aisha is a Coach-tier coach,
the existing 0086 multi-team upgrade surface fires for her on
HER kid's team (if she has one), expanding the SportsIQ
footprint from one team to two. (3) The director-pulse
compound — the 0077 director peer pulse and the 0087 / 0090
Org-tier surfaces already named the cross-program / cross-
coach signals; this surface adds the CROSS-HELPER signal that
turns one-coach teams into two-coach teams, which is the unit
of structural growth a program needs to reach the 3+ Coach-
tier threshold for the 0087 Org-tier upgrade. Each new helper-
to-coach conversion is a step closer to the program's
director-tier surface firing. Per the strategy log — this is
the OBSERVER → COACH conversion at scale, and the card is the
optimization the loop has been missing.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper `src/lib/recurring-observer-helpers.ts`
  exports `findRecurringObserverHelpers(args: {
  observerOpenRows: Array<{ helper_identifier: string;
  display_name: string | null; team_id: string; opened_at:
  string; practice_id: string | null; ran_drill: boolean }>;
  invitesAlreadySent: Array<{ helper_identifier: string;
  team_id: string; sent_at: string }>; minOpens?: number;
  minDistinctPractices?: number; lookbackDays?: number;
  nowMs: number }): Array<{ helperIdentifier: string;
  displayName: string | null; openCount: number;
  distinctPracticeCount: number; ranDrill: boolean;
  lastOpenAt: string; teamId: string }>`. The helper:
  (a) filters `observerOpenRows` to opens within
  `lookbackDays` (default 14) of `nowMs`; (b) groups by
  `(helper_identifier, team_id)`; (c) keeps groups with
  `openCount >= minOpens` (default 2) AND
  `distinctPracticeCount >= minDistinctPractices`
  (default 2 — the distinct count is over non-null
  `practice_id`s); (d) excludes any helper-team pair
  that appears in `invitesAlreadySent` within the last
  30 days (defense against re-prompting after the coach
  already invited the helper via 0015); (e) sets
  `ranDrill: true` when ANY open row for the
  helper-team pair has `ran_drill: true` (the 0067
  sub-coach posture surfaces this); (f) sorts by
  `openCount` descending, then by `lastOpenAt`
  descending for determinism; (g) caps at 5 entries
  per call (one coach can't have 100 helpers; if they
  do, the top 5 are surfaced). Pure function, reads no
  DB. Per LESSONS#0023 — instruct positively in jsdoc.
  Per LESSONS#0061 — literal-space defensive surname
  scan on `displayName`. Per LESSONS#0070 — never
  mutate the input arrays. Per LESSONS#0115 — UTC
  posture on `opened_at` / `nowMs`. (vitest under
  `tests/lib/recurring-observer-helpers.test.ts` —
  new): (i) empty rows → empty array; (ii) 1 open by
  1 helper → excluded (below threshold); (iii) 3
  opens by 1 helper across 1 practice → excluded
  (distinct-practice threshold not met); (iv) 3 opens
  by 1 helper across 2 practices → INCLUDED with
  `openCount: 3`, `distinctPracticeCount: 2`; (v)
  helper meeting threshold but invited via 0015 5
  days ago → EXCLUDED; (vi) helper meeting threshold
  invited 45 days ago → INCLUDED (window past);
  (vii) `ran_drill: true` on any open row → result
  has `ranDrill: true`; (viii) opens older than
  `lookbackDays` ignored; (ix) tied openCounts
  sorted by lastOpenAt for determinism; (x) planted
  surname-shaped strings in `display_name` are
  surface-clean (the helper preserves the raw
  string; the COMPONENT does the literal-space scan);
  (xi) no banned word in any rendered string; (xii)
  capped at 5 entries when 6+ qualify.

- [ ] A new authed `GET /api/coach/recurring-observers`
  route. The route: (a) reads the caller's `coach_id`
  and the caller's team_ids via the existing
  `team_coaches` join (per LESSONS#0057); (b) reads
  `observer_link_opens` rows (the actual table name
  may differ — read the 0029 ship at pickup per
  LESSONS#0096) for the caller's team_ids in the
  last 14 days with a narrow `.select()` allow-list
  (`helper_identifier`, `display_name`, `team_id`,
  `opened_at`, `practice_id`, `ran_drill`); (c)
  reads the existing referral-invite history for the
  caller (the 0015 / 0021 / 0074 referral schema —
  verify the actual table at pickup; likely
  `referral_invites` keyed on the coach's referral
  code) to derive `invitesAlreadySent`; (d) calls
  `findRecurringObserverHelpers`; (e) joins each
  qualifying helper-team pair to `teams.name` for
  the rendered team name; (f) if zero qualifying
  helpers, returns `{ eligible: false,
  eligibilityReason: 'no_helpers_meeting_threshold' }`;
  (g) otherwise returns
  `{ eligible: true, helpers, total }`. Per
  AGENTS.md rule 3 — `createServiceSupabase()`. Per
  LESSONS#0036 — narrow `.select()` allow-lists;
  NEVER reads `coaches.email`, `coaches.phone`,
  `coaches.full_name` surname, `players.*`. Per
  LESSONS#0044 — the auth check is load-bearing.
  Per LESSONS#0049 / #0092 / #0100 / #0110 — at
  pickup Glob `tests/api/coach*.test.ts` AND
  extend every `mockReturnValueOnce` queue (per
  LESSONS#0116 — document empty-Glob no-op).
  Per LESSONS#0078 — verify the actual
  `observer_link_opens` table shape; the ticket
  prose is a sketch — the 0029 ship is the schema's
  truth. Per LESSONS#0080 — filter-aware fixtures
  on chain mocks for `.in()` reads on team_ids.
  Per LESSONS#0118 — broaden strict-whitelist
  sibling mocks for the new
  `observer_link_opens` + `referral_invites`
  reads. (vitest under
  `tests/api/coach-recurring-observers.test.ts` —
  new): (i) unauthed → 401; (ii) coach with 0
  observer opens → `eligible: false,
  eligibilityReason:
  'no_helpers_meeting_threshold'`; (iii) coach
  with 1 helper at threshold → eligible payload
  with 1 entry; (iv) coach with helper at
  threshold but already invited 5 days ago →
  eligible: false; (v) cross-team helper that
  spans two teams the coach owns → ONE entry
  per team (helper-team is the join key); (vi)
  helper with `display_name: null` →
  `displayName: null` in payload; (vii) planted
  email / phone / DOB / parent-message on every
  joined coach row are NEVER read; (viii)
  response shape is BYTE-IDENTICAL across the
  matrix (additive only).

- [ ] A new client component
  `src/components/home/real-co-coach-card.tsx`.
  Renders on /home (the existing card-stack mount
  point — read at pickup per LESSONS#0096; the
  0088 `<FirstCrossCoachSignalCard />` and the 0089
  `<PaidCoachReceiptsCard />` are the closest
  references). The card: (a) renders ONLY when the
  route returns `eligible: true` AND at least one
  qualifying helper; (b) has a quiet zinc-500
  stroke for the body with the primary button in
  orange (#F97316) — the orange is the action
  signal per the AGENTS.md voice; (c) headline:
  "<HelperFirstName>'s been co-coaching with you"
  when `displayName` is set, else "Someone's been
  co-coaching with you"; (d) body: one tight line
  per helper — "<HelperFirstName> opened your
  <TeamName> observer link <N> times across the
  last 14 days" + a second line "and ran a drill
  on Tuesday's practice" only when
  `ranDrill: true`; (e) ONE primary button —
  "Bring <HelperFirstName> on as a Coach-tier
  teammate" — that opens the existing 0015
  invite modal pre-filled with the
  `displayName` and the caller's referral code
  (per 0011); (f) ONE secondary "Not yet"
  button that POSTs the dismiss route;
  (g) `data-testid="real-co-coach-card"` for
  scoped e2e per LESSONS#0029 / #0082;
  (h) when the route returns multiple helpers,
  render up to 3 stacked sub-rows inside the
  one card (silence beats nag — more than 3
  becomes a list to scroll); (i) the
  `displayName` is surname-stripped on render
  per LESSONS#0061 (literal-space defensive
  scan). Per AGENTS.md voice — NO banned word
  in any rendered string. Per LESSONS#0023 —
  instruct positively in jsdoc; never embed a
  verbatim ban-list. Per LESSONS#0065 / #0066
  / #0162 — smallest possible touch on /home.
  (vitest under
  `tests/components/real-co-coach-card.test.tsx`
  — new): (i) `eligible: false` → card
  ABSENT; (ii) eligible with 1 helper named
  → renders headline + line + primary button
  with helper's first name; (iii) eligible
  with 1 helper unnamed (displayName: null)
  → renders fallback "Someone" copy; (iv)
  `ranDrill: true` → renders the second
  "and ran a drill" line; (v)
  `ranDrill: false` → does NOT render the
  drill line (silence on the unearned
  counter); (vi) primary button tap fires the
  existing 0015 invite-modal open event
  (mock the modal-open call and assert
  `prefilledName === helperDisplayName`);
  (vii) secondary "Not yet" tap POSTs the
  dismiss route; (viii) NO banned word
  across every fixture variant; (ix) the
  rendered text passes the surname /
  minor-field regex sweep per
  LESSONS#0061 / #0063.

- [ ] A new authed
  `POST /api/coach/recurring-observers/dismiss`
  route. Body: `{ helperIdentifier: string;
  teamId: string }`. Writes an UPSERT into a
  small new dedup table (or reuses 0088's
  `coach_first_signal_celebrations` with
  `kind: 'recurring_observer_dismissed'` and the
  composite key encoded — verify the actual
  dedup posture at pickup per LESSONS#0096). The
  preferred posture is REUSE: extend the 0088
  `coach_first_signal_celebrations` CHECK enum
  to add `'recurring_observer_dismissed'` and
  encode the helper-team composite into the
  existing `fired_at` jsonb (or a small
  additive `context` column — see migration AC
  below). Per LESSONS#0044 — auth check
  load-bearing. Per LESSONS#0072 — never mutate
  a DB-read row. (vitest under
  `tests/api/coach-recurring-observers-dismiss.test.ts`
  — new): (i) authed dismiss succeeds; (ii)
  re-dismiss is idempotent (UPSERT on the
  composite key); (iii) unauthed → 401;
  (iv) post-dismiss GET excludes the dismissed
  helper-team pair for 30 days.

- [ ] A migration
  `supabase/migrations/077_recurring_observer_dedup.sql`
  widens the 0088
  `coach_first_signal_celebrations` CHECK enum
  to include `'recurring_observer_dismissed'`.
  Per LESSONS#0006 — confirm `077` is the next
  free integer at pickup (0091 ships `076`).
  Per LESSONS#0009 / #0054 — DROP + ADD the
  CHECK constraint widening the enum from the
  current state (whatever was last shipped by
  0089 / 0090's widens) to a SUPERSET that adds
  exactly one literal. Per LESSONS#0088 — strip
  `--` comments before banned-token sweep. Per
  LESSONS#0094 — service-role GRANTs in the
  same migration. If a composite-key encoding
  (helper_identifier + team_id) is needed beyond
  the existing fired_at column, this migration
  adds a single additive JSONB `context` column
  on `coach_first_signal_celebrations` with
  `DEFAULT '{}'::jsonb` per LESSONS#0085 — but
  verify at pickup whether the existing fired_at
  jsonb suffices first per LESSONS#0066 (widen
  existing select before adding new columns).
  (vitest under
  `tests/migrations/077-recurring-observer-dedup.test.ts`
  — new): scan migration body with `--`
  stripped; the new CHECK enum is a strict
  SUPERSET of the prior enum;
  service-role GRANT block present; NO new
  column on any sacred table (`organizations`,
  `coaches`, `teams`, `players`,
  `observations`).

- [ ] Pre-fill the existing 0015 invite modal's
  warm-context line when opened from this card.
  The invite modal (`src/components/team/
  invite-coach-modal.tsx` — verify exact path
  at pickup per LESSONS#0096) accepts a new
  optional prop
  `warmContextSummary?: { helperOpens: number;
  helperRanDrill: boolean; teamName: string;
  lastOpenAt: string }`. When set, the modal
  renders one extra line above the existing
  invite copy: "<HelperFirstName> opened your
  <TeamName> link <N> times across the last 14
  days" (the existing 0015 / 0021 invite
  template carries the same line into the
  outgoing email body via an additive widening
  of the email template's data payload). Per
  LESSONS#0103 — additive widening only; when
  the prop is absent, the modal and the email
  template are BYTE-IDENTICAL. Per AGENTS.md
  voice — no banned word. (vitest under
  `tests/components/invite-coach-modal-warm-context.test.tsx`
  — new): (i) modal opens without
  `warmContextSummary` → BYTE-IDENTICAL to
  today's render; (ii) modal opens with the
  prop set → renders the named warm-context
  line above the existing copy; (iii) the
  outgoing invite POST body carries the warm
  context summary keys (assertion against the
  mocked invite POST handler); (iv) NO banned
  word in the warm-context line across every
  fixture.

- [ ] Tier / feature gating: the card surfaces
  for FREE and PAID coaches alike — this is an
  acquisition surface, not a feature gate. The
  primary button's "free until your next
  renewal" copy ONLY appears for PAID coaches
  (Coach / Pro / Org tier with
  `subscription_status IN ('active',
  'past_due', 'trialing')`); free coaches see
  the primary button without the free-until-
  renewal sub-line. The actual referral-credit
  posture for invited helpers who sign up
  follows the existing 0074 / 0085
  referral-credit schema BYTE-IDENTICALLY —
  this ticket does NOT touch credit math.
  The `TIER_LIMITS` numbers are
  BYTE-IDENTICAL. The `<UpgradeGate>`
  placements are BYTE-IDENTICAL. NO new
  tier feature key. (vitest: free coach with
  eligible helpers → card renders without the
  free-until-renewal sub-line; Coach-tier
  active → card renders WITH the
  sub-line; Coach-tier canceled → card
  renders without the sub-line; the
  referral-credit POST is BYTE-IDENTICAL to
  the 0074 path.)

- [ ] Privacy / COPPA contract: the route
  reads ONLY `coaches.id`, `coaches.org_id`,
  the existing `team_coaches` join, the
  existing `teams.id` + `.name`, the existing
  `observer_link_opens` (`helper_identifier`,
  `display_name`, `team_id`, `opened_at`,
  `practice_id`, `ran_drill`), the existing
  referral-invite history rows
  (`referral_code`, `helper_identifier`,
  `sent_at`), and the existing
  `organizations.subscription_status` /
  `.tier` for the free-until-renewal sub-line
  decision. NEVER reads `coaches.email`,
  `coaches.phone`, `coaches.full_name`
  surname, `players.*`, `players.parent_email`,
  `players.dob`. The rendered card NEVER
  shows a surname (first name only), NEVER
  shows a player's name, NEVER shows the
  helper's email or phone (the helper is
  identified by `helper_identifier` which is
  an opaque hash per the 0029 ship — verify
  at pickup), NEVER shows a raw
  `helper_identifier` string in the rendered
  text. The card NEVER shows an underage
  helper (the existing 0029 observer-link age
  gate is the load-bearing guard). Per
  LESSONS#0036 / #0070 — `.select()`
  allow-lists; never mutate the DB row. Per
  LESSONS#0061 / #0063 — literal-space +
  shape-scoped defensive scans on rendered
  fixtures. (vitest: planted email / phone /
  DOB / parent message / minor name on every
  joined row are NEVER read; the rendered
  text passes the surname / minor-field /
  jersey-shape / raw-identifier-shape regex
  sweep.)

- [ ] Voice contract: every rendered
  user-facing string (the headline, the per-
  helper line, the drill-ran line, the primary
  button, the secondary button, the warm-
  context line in the invite modal AND in the
  outgoing invite email body) contains NO
  AGENTS.md banned word per LESSONS#0023.
  Instruct positively in every helper /
  component / template jsdoc; never embed a
  verbatim ban-list per LESSONS#0023 / #0034 /
  #0088. Anti-AI-slop defensive list specific
  to this surface: ["co-coaching journey",
  "amazing helper", "incredible teammate",
  "level up your coaching", "your coaching
  squad"]. (vitest: render every helper /
  count / team / ranDrill / paid-state fixture
  variant and scan.)

- [ ] Regression: the existing /home page
  render is BYTE-IDENTICAL when the route
  returns `eligible: false` (the new card is
  absent). The existing 0029 observer-link
  generation, signed-URL lifetime, and
  observer-side rendering are BYTE-IDENTICAL
  (this ticket only READS the open telemetry,
  never writes). The existing 0015
  invite-coach modal render and POST are
  BYTE-IDENTICAL when opened WITHOUT
  `warmContextSummary`. The existing 0021
  referral-landing copy is BYTE-IDENTICAL.
  The existing 0074 / 0085 referral-credit
  math is BYTE-IDENTICAL. The 0088 / 0089 /
  0090 cards continue to render as before
  (the dedup table widen is additive). The
  0091 sport-wide convergence card is
  BYTE-IDENTICAL. (vitest: snapshot the
  /home render pre- and post-change with
  planted fixtures; snapshot the
  invite-coach modal default render; snapshot
  the referral-credit POST handler.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — pre-mint observer-link rows
  for the existing E2E coach's primary team
  with two distinct `helper_identifier`
  values, one with `display_name: 'Aisha'`
  meeting the 3-open / 2-practice threshold
  AND `ran_drill: true` on one row, the other
  with 1 open (excluded). UUIDs in the next
  free range per LESSONS#0101; jsonb values
  quoted per LESSONS#0085;
  deterministic first names per LESSONS#0079.
  Per LESSONS#0094 — service-role GRANTs in
  the new migration cover the dedup widen.
  Playwright spec: (a) sign in as the seeded
  E2E coach, (b) navigate to /home, (c)
  assert the real-co-coach card renders
  scoped by `data-testid="real-co-coach-card"`
  AND contains the name "Aisha" AND the
  count "3 times" AND the "ran a drill" line,
  (d) assert the second helper (1 open) is
  NOT surfaced, (e) tap the primary button
  and assert the invite-coach modal opens
  pre-filled with "Aisha" as the name AND the
  warm-context line is rendered above the
  existing copy, (f) close the modal and tap
  "Not yet" on the card and assert the card
  dismisses, (g) re-load and assert the card
  no longer renders, (h) assert NO seeded
  player name / email / phone / parent
  message appears in the rendered card or
  modal per LESSONS#0029 / #0082. Scope
  every assertion by data-testid. Skip when
  E2E creds are unset.

## Out of scope

- A bulk "invite all my recurring observers"
  button. v1 is one-helper-at-a-time per the
  per-row primary button.
- An EMAIL nudge to the coach when a helper
  crosses the threshold. v1 is passive — the
  coach discovers the card the next time they
  open /home.
- A surface on the HELPER's side (e.g. a card
  in the observer-link view that says "ask
  Marco to bring you on"). v1 is coach-side
  only; the helper-side push is a separate
  ticket with higher consent review.
- A REFERRAL-CREDIT bonus specific to
  observer-converted helpers. v1 uses the
  existing 0074 / 0085 credit math
  BYTE-IDENTICALLY; tuning the credit by
  source is a separate ticket.
- A PUSH NOTIFICATION when a helper crosses
  threshold. v1 is passive.
- An AI-generated invite copy specific to the
  warm-context. v1 ships ONE deterministic
  warm-context line; an AI variant is a
  separate ticket.
- A LEADERBOARD of "coaches with the most
  recurring helpers." v1 surfaces only the
  caller's own state.
- A CHANGE to the observer-link expiration,
  display_name capture, or signed-URL
  posture. v1 reads existing data only.
- A retroactive notification to coaches
  whose helpers already crossed the
  threshold before this ticket shipped. v1
  fires forward only.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/recurring-observer-helpers.ts`
  (new) — pure helper. Mirrors the shape of
  `src/lib/program-drill-canon.ts` (0090),
  `src/lib/paid-coach-receipts.ts` (0089).
  Per LESSONS#0061 — literal-space defensive
  scan; per LESSONS#0023 — positive voice.
- `src/app/api/coach/recurring-observers/route.ts`
  (new) — `GET()` authed. Per LESSONS#0008 /
  #0055 — no-arg GET handler; invoke with
  no args in tests. Per LESSONS#0096 — at
  pickup verify the actual
  `observer_link_opens` table shape from the
  0029 ship; verify the referral-invite
  history table shape from 0015 / 0021 /
  0074.
- `src/app/api/coach/recurring-observers/dismiss/route.ts`
  (new) — `POST(request)` authed.
- `src/components/home/real-co-coach-card.tsx`
  (new). Per LESSONS#0029 / #0082 —
  `data-testid` scoping. Per LESSONS#0065 /
  #0066 / #0162 — smallest possible touch on
  /home.
- `src/app/(dashboard)/home/page.tsx`
  (existing — read first per LESSONS#0096) —
  ONE import + ONE JSX mount of the new card.
  The card mounts UNDER the daily-focus card
  and the 0088 first-signal card, ABOVE the
  rest of the feed; verify the exact mount
  position at pickup.
- `src/components/team/invite-coach-modal.tsx`
  (existing — read first per LESSONS#0096;
  the actual file name may differ — Glob
  `src/components/**/invite*coach*.tsx`) —
  additive `warmContextSummary?` prop per
  LESSONS#0103. NO change to the existing
  modal behavior when the prop is absent.
- The 0015 / 0021 invite-email template
  (verify exact path at pickup; likely
  `src/lib/email/templates/coach-invite.ts`
  or sibling) — additive widening on the
  template's data payload to render the
  warm-context line when present.
- `supabase/migrations/077_recurring_observer_dedup.sql`
  (new). Per LESSONS#0006 — confirm `077` is
  the next free integer at pickup (0091
  ships `076`). DROP + ADD the CHECK
  constraint on
  `coach_first_signal_celebrations` to add
  `'recurring_observer_dismissed'`. Per
  LESSONS#0088 — strip `--` comments before
  banned-token sweep. Per LESSONS#0094 —
  service-role GRANTs in the same
  migration. Per LESSONS#0085 — if a new
  `context` JSONB column is required for the
  composite key encoding, default to
  `'{}'::jsonb`.
- `src/types/database.ts` — no new types if
  the CHECK enum widen does not change the
  TS type (typed as `string`); verify at
  pickup.
- `src/lib/tier.ts` — NO change. NO new
  feature key.
- `tests/lib/recurring-observer-helpers.test.ts`
  (new).
- `tests/api/coach-recurring-observers.test.ts`
  (new).
- `tests/api/coach-recurring-observers-dismiss.test.ts`
  (new).
- `tests/components/real-co-coach-card.test.tsx`
  (new).
- `tests/components/invite-coach-modal-warm-context.test.tsx`
  (new).
- `tests/migrations/077-recurring-observer-dedup.test.ts`
  (new).
- `tests/e2e/real-co-coach-flow.spec.ts` (new).
  Seed extension per the AC. UUIDs in the next
  free range per LESSONS#0101. Skip when E2E
  creds are unset.
- New deps: NO. Migration: YES (077 or bump
  per LESSONS#0006). Env vars: NO. AI prompt
  change: NO. Tier feature key: NO new key.
- LESSONS to anchor: #0006 (migration prefix),
  #0008 / #0055 (no-arg GET), #0009 / #0054
  (CHECK-enum widen), #0021 / #0023 (positive
  voice), #0029 / #0082 (data-testid scoping
  + privacy fixture scans), #0034 / #0088
  (strip `--` comments on banned-word scan),
  #0036 (`.select()` allow-lists), #0044
  (auth gate load-bearing), #0049 / #0092 /
  #0100 / #0110 (mock queue sweeps), #0057
  (team_coaches join), #0061 / #0063
  (defensive scans, literal-space surname
  posture), #0065 / #0066 / #0162 (smallest
  touch on /home), #0066 (widen existing
  select before adding new columns), #0070 /
  #0072 (no DB-row mutate), #0078 (verify
  actual observer-link table shape), #0079
  (deterministic seeded first names), #0080
  (filter-aware chain mocks), #0084 / #0101
  (seed posture, UUIDs in next free range),
  #0085 (jsonb defaults), #0094 (service-role
  GRANTs), #0096 (schema wins over prose — at
  pickup read the actual observer-link table,
  the actual referral-invite history table,
  the actual invite-coach modal, the actual
  /home mount point), #0103 (additive
  widening — the modal and email template
  are BYTE-IDENTICAL when the new prop is
  absent), #0115 (UTC posture on `opened_at`
  / `nowMs`), #0116 (empty-Glob no-op),
  #0118 (broaden strict-whitelist mocks),
  STRATEGY_LOG_2026-06 (the observer-to-
  coach conversion at scale is the named
  unoptimized acquisition lever).

Depends on: 0011 (shipped — referral code
carries through the invite flow), 0015
(shipped — the invite-coach modal this
ticket pre-fills), 0021 (shipped — named
referral landing), 0029 (shipped — the
observer-link primitive whose open
telemetry this ticket reads), 0067
(shipped — sub-coach posture surfaces
`ran_drill: true`), 0074 (shipped —
referral-credit schema), 0085 (shipped —
referral-credit stack copy), 0088 (this
batch — the `coach_first_signal_
celebrations` table whose CHECK enum is
widened; reuse the existing dedup
primitive per LESSONS#0066), 0089 / 0090
/ 0091 (shipped — sibling /home cards;
this card mounts alongside them).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-06-20 — branch `feat/0092-real-co-coach-conversion` opened. Frontmatter + README index flipped to `in-progress` in lockstep per LESSONS#0042/#0074.
- 2026-06-20 — Schema-wins-over-prose (LESSONS#0096): the ticket prose names `observer_link_opens` (helper_identifier + display_name + ran_drill). No such table exists on disk. The 0029 ship is a stateless HMAC token primitive (`src/lib/observer-utils.ts` + `/api/observer-link` + `/api/observe/[token]`) with NO open-event telemetry persisted. The recurring-helper signal we DO have is `sub_handoffs` (migration 061, ticket 0067): each row carries `session_id`, `coach_id`, `sub_first_name` (the helper's name as the regular coach typed it when issuing the handoff), `sub_note_text` / `sub_note_at` (presence = "the helper actually ran the practice and sent a note back" — the `ran_drill: true` analog), `created_at`. A regular coach who issued 2+ distinct handoffs naming the same `sub_first_name` for the same team = the recurring helper the card names. The dismiss dedup posture uses a SEPARATE small table (`recurring_observer_dismissals`) because the existing `coach_first_signal_celebrations.UNIQUE (coach_id, kind)` cannot encode the helper-team composite key without breaking the 0088 dedup contract. Per LESSONS#0066 — widen-existing-select beat add-new-column on the field side; per LESSONS#0103 — the small new table is the smallest-blast-radius dedup primitive. Also: the ticket prose says "reuses the existing 0015 invite-coach modal pre-filled with the helper's name" but the 0015 ship is the `InviteCoachCard` (a share-the-referral-URL card on /home), NOT a modal — the primary button on this card therefore opens the same share path with the helper's first name carried through the share message.
- 2026-06-20 — Failing tests added; minimum code shipped; full local gate green.
