---
id: 0085
title: When a paid coach is two qualified referrals away from another free month, show them the stack — "one more invited coach who ships and your next month is on us too"
status: groomed
priority: P1
area: billing
created: 2026-06-15
owner: product-groomer
---

## User story

As a paid Coach-tier volunteer who just got the 0074 celebration card naming
the three referred coaches who earned my first free month — and who has TWO
other coaches I invited last month who signed up but have not shipped a real
artifact yet — I want a SECOND quiet line on /home, between the credit-earned
card and the rest of the dashboard, that names the two not-yet-qualified
coaches by first name and tells me exactly what they need to ship for the
NEXT $9.99 free month to land — "Coach James and Coach Lin signed up but
haven't shipped a parent report or a practice plan yet. One more qualifying
coach and your next month is free too" — so the stacking-credit incentive
stops being invisible after the first milestone and starts being a forward-
looking lever I can act on with one nudge text to two specific people.

## Why now (four lenses)

### Product Owner

Ticket 0074 shipped the QUALIFIED-3 → free-month credit and the
`referral_credit_grants` table with milestone_kind enum
`qualified_3 / qualified_10 / qualified_25`. The CREDIT and the
celebration card both fire on the milestone CROSSING — i.e. retroactively,
once the third qualified coach ships. What 0074 does NOT ship is the
FORWARD-LOOKING progress view: the coach who has qualified 2 of 3 has no
in-product way to see "I'm at 2/3, here are the two SIGNED UP but not yet
qualified coaches, here is what they would need to ship." This is the
classic stacking-progress UX — the gauge that shows the next milestone is
close and names the levers to close it. The smallest meaningful unit of
value is: (a) extend the existing `/api/coach/referral-credit-status` GET
route from 0074 to also return `pendingReferrals: Array<{ firstName:
string; signedUpAt: string; shippedArtifactCount: number;
headCoachedObservationCount: number; needsToQualify: string }>` — the
already-converted-but-not-yet-qualifying coaches; (b) extend the existing
`<ReferralCreditCard />` to render a NEW SUB-SECTION underneath the
existing credit body when `qualifiedCount` is at least 1 BUT
`pendingReferrals` is non-empty AND the next milestone has not yet
fired; (c) the sub-section names the pending coaches by first name and
tells the inviter what each needs to ship ("Coach James needs to ship a
parent report or run 5 observed practices") and shows the dollar amount
the next milestone unlocks ($9.99 → $9.99 → $9.99 across the three
milestones). NO new tier feature key, NO AI generation, NO new public
surface. The new sub-section AUTO-HIDES when the next milestone fires
(the 0074 credit card replaces it for that visit).

### Stakeholder

This is the moat-deepening primitive that turns the 0074 single-shot credit
into a referral-engine flywheel. Three compoundings, all asymmetric. (1)
The referral-throughput compound — a coach at 2/3 with two pending
referrals named on /home is a coach who texts those two specific people
TODAY ("hey James, you signed up last week — try the parent report, it
only takes a minute"); without the named-progress card she does not have
the information to make that nudge specific. Specific nudges convert
materially better than generic ones. (2) The retention-anchor compound —
the paid coach who sees the stacking-progress card has a structural
reason to STAY on the paid tier through the next billing cycle (she has
two near-misses in flight; canceling forfeits them). The 0074 credit
locks in retention DURING a credited month; this ticket locks in
retention BETWEEN credited months, which is the harder retention seam.
(3) The anti-abuse-preservation compound — naming the QUALIFICATION
BAR ("needs to ship a parent report or run 5 observed practices") inside
the inviter's view is the cleanest way to communicate the
anti-grinding contract WITHOUT pinging the converted coach (whose UX
remains byte-identical per 0074's consent posture). The bar's
existence is now visible to the person who CAN act on it (the
inviter) and invisible to the person whose behavior must not be
changed (the converted coach). Per the strategy audit
(`docs/STRATEGY_AUDIT_2026-06-15.md`) — "the upgrade moment hasn't
kept pace with the viral surface area" — this is the inverse-flow
of that thesis: not the upgrade moment, but the STACKING moment for
the coach already converted, who is now the highest-leverage
acquisition channel for the next conversion.

### User (the inviting coach, Sarah, paid Coach-tier, Wednesday 8:24am
on the couch with coffee)

She opens SportsIQ. /home loads. The 0074 credit card from last week
is still there at top (until she taps Got-it). Underneath, a NEW small
section with a quiet orange accent, NO icon, NO celebration tone: "On
deck — Coach James and Coach Lin signed up but haven't shipped a parent
report or a practice plan yet. One more qualifying coach and your next
month is free too ($9.99)." Two short lines. One button: "Text them a
nudge" — opens her phone's native share sheet pre-filled with a
respectful template ("Hey James — saw you signed up last week.
Curious what you'd think of the parent report feature; it's the one
that pulled me in"). She taps. The share sheet opens. She sends. Done.
Total interaction: 22 seconds. No new app for James to learn (the
nudge goes through her existing texts channel — the loop's signature
posture). If she has zero pending referrals (everyone qualified or
nobody signed up yet), the card section is ABSENT — silence beats
nag. If she is on the FREE tier (saw the pending-credit-redeem-on-
upgrade variant from 0074), the same on-deck section renders but
the button leads to /settings/upgrade with the resume target set —
both stacking moments converge on Stripe.

### Growth

The viral re-fire is the nudge text. Every "text them a nudge"
delivery is a re-fire of the existing 0015 / 0017 / 0021 invite
loop, targeted at exactly the highest-conversion candidate (a
signed-up coach who has not yet shipped). Three compoundings. (1)
The named-target compound — generic "share SportsIQ" share-sheet
re-fires convert in low single digits; first-name-named, qualified-
state-specific nudges convert materially higher (the recipient
knows the sender knows they signed up). (2) The cross-cycle
compound — the stacking card fires every month between 0074
milestones; a coach who never crosses qualified_3 still sees the
on-deck card and can act on it at the start of each billing cycle.
(3) The "show me" screenshot — the same screenshot that sold the
0074 card (the dollar amount + the first-name list) now extends:
the on-deck names + the dollar amount on offer is the artifact a
coach friend looks at and says "wait, every signed-up coach you
poke is $9.99 toward your subscription?" The conversion
testimonial writes itself, in the inviter's own voice.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] Extend the existing pure helper
  `src/lib/referral-credit-utils.ts` (shipped by 0074 — read first
  per LESSONS#0096) with a NEW exported function
  `summarizePendingReferrals(args: { convertedCoachRows: Array<{
  id: string; first_name: string; signed_up_at: string;
  shipped_artifact_count: number;
  head_coached_observation_count: number }>; nowMs: number }):
  { pending: Array<{ firstName: string; signedUpAt: string;
  needsToQualify: string }>; nextMilestoneIn: number; nextMilestoneKind:
  'qualified_3' | 'qualified_10' | 'qualified_25' | null }`. The helper:
  (a) filters the convertedCoachRows to those whose
  `shipped_artifact_count < 1` AND
  `head_coached_observation_count < 5` (the inverse of the 0074
  qualification bar) — the ones who signed up but haven't crossed; (b)
  caps the returned list at 5 (defensive — the named card never
  scrolls); (c) returns a single rendered string per pending coach
  describing the QUALIFICATION BAR in clipboard voice ("needs to
  ship a parent report or run 5 observed practices") — the SAME bar
  the 0074 helper uses, expressed positively; (d) returns
  `nextMilestoneIn` as the count of MORE qualifying coaches needed
  to cross the next milestone (3 / 10 / 25 from the existing
  qualified count); (e) returns `nextMilestoneKind` as the
  literal milestone enum value or `null` if already past
  qualified_25. Per LESSONS#0103 — the existing
  `countQualifiedReferrals` export is BYTE-IDENTICAL; the new
  function is additive. Per LESSONS#0061 — first name only,
  literal-space defensive scan. (vitest under
  `tests/lib/referral-credit-pending.test.ts` — new): (i) no
  converted rows → empty pending, `nextMilestoneIn: 3`; (ii)
  2 converted, all qualified → empty pending, `nextMilestoneIn:
  1`; (iii) 2 converted, none qualified → 2 pending,
  `nextMilestoneIn: 3` (still need 3 to cross qualified_3,
  pending coaches do not count); (iv) 5 converted, 2 qualified +
  3 not yet → 3 pending capped at 5, `nextMilestoneIn: 1`;
  (v) 11 qualified → empty pending, `nextMilestoneIn: 9`,
  `nextMilestoneKind: qualified_25`; (vi) 25+ qualified →
  `nextMilestoneKind: null`; (vii) the rendered
  `needsToQualify` string contains no banned word; (viii)
  deterministic across input order; (ix) `firstName`
  surname-stripped per LESSONS#0061.

- [ ] Extend the existing `GET /api/coach/referral-credit-status`
  route (shipped by 0074 — read first per LESSONS#0096) to ALSO
  return the new fields: `pendingReferrals` (the up-to-5 capped
  list with first name + `signedUpAt` + `needsToQualify`),
  `nextMilestoneIn`, `nextMilestoneKind`. The route reads the
  converted-coach rows the SAME way 0074's route does (via
  `preferences->>referred_by_code`), runs the SAME shipped-
  artifact + observation counts, then calls
  `summarizePendingReferrals`. Per AGENTS.md rule 3 — service-
  role for the cross-coach reads. Per LESSONS#0036 — the
  `.select()` allow-list is extended ONLY to include
  `coaches.created_at` (for `signed_up_at`); NEVER reads
  email, phone, full_name (first_name only per the existing
  0074 / 0047 / 0021 first-name extraction posture). Per
  LESSONS#0049 / #0092 / #0100 / #0110 — at pickup Glob
  `tests/api/coach/referral*.test.ts` AND
  `tests/api/coach-referral*.test.ts` AND extend EVERY
  `mockReturnValueOnce` queue plus any sibling that imports
  the route's mock shape. Per LESSONS#0066 — favor extending
  the existing select rather than adding a new `from()` call
  (the route's plans + observations queries already exist;
  add the `created_at` column to the existing coaches read
  rather than a new one). Per LESSONS#0070 — never mutate
  the DB row; spread to a new object. (vitest under
  `tests/api/coach-referral-credit-status-pending.test.ts`
  — new): (i) the 0074-shipped fields (qualifiedCount,
  qualifiedCoachFirstNames, currentMilestone,
  pendingCreditCents) are BYTE-IDENTICAL for every existing
  fixture; (ii) a coach with 2 converted + 0 qualified
  returns `pendingReferrals` of length 2 with first names
  and `needsToQualify` strings; (iii) a coach with 3
  qualified + 2 pending returns `qualifiedCount: 3` AND
  `pendingReferrals` of length 2; (iv) a coach with 25
  qualified returns `nextMilestoneKind: null`; (v) the
  pending list is capped at 5; (vi) planted DOB /
  parent_phone / email on the converted-coach rows are
  NEVER read; (vii) the route's response shape is a
  strict superset of the 0074 shape — existing callers
  break nothing.

- [ ] Extend `<ReferralCreditCard />` (shipped by 0074 — read
  first per LESSONS#0096) to render a NEW SUB-SECTION under
  the existing credit body when `pendingReferrals.length > 0`
  AND `nextMilestoneKind !== null`. The sub-section:
  (a) has a thin divider above (`border-t border-zinc-800`);
  (b) headline reads "On deck" (zinc-400, small caps);
  (c) one short line listing the pending first names with
  oxford-comma join ("Coach James and Coach Lin" / "Coach
  James, Coach Lin, and Coach Riya"); (d) one short
  qualification line ("haven't shipped a parent report or
  a practice plan yet") sourced from the shared
  `needsToQualify` string; (e) one short progress line
  ("One more qualifying coach and your next month is free
  too — $9.99" / "Two more qualifying coaches and your next
  month is free — $9.99"); (f) ONE button: "Text them a
  nudge" which triggers a native share sheet (`navigator.share`
  with a clipboard-fallback per the existing 0015 / 0064
  share posture) pre-filled with a respectful template
  string from a NEW exported `buildPendingNudgeMessage` in
  the referral-credit-utils helper; (g) the sub-section
  has `data-testid="referral-credit-pending-section"` for
  scoped e2e per LESSONS#0029 / #0082; (h) when the FREE-
  tier copy variant of the card is showing (per 0074's
  variant TWO), the "Text them a nudge" button is also
  shown, but its share-sheet copy adjusts to "I'm working
  on three free months on SportsIQ — would love your
  reps to help me cross it" (the pending-credit
  amplification). The existing 0074 card body is
  BYTE-IDENTICAL when the new sub-section is absent
  (`pendingReferrals.length === 0` or
  `nextMilestoneKind === null`). Per LESSONS#0103 —
  optional sub-section, no widening of any existing
  field. (vitest under `tests/components/referral-
  credit-card-pending.test.tsx` — new): (i) `pendingReferrals:
  []` → sub-section ABSENT, card matches 0074-baseline
  snapshot; (ii) `pendingReferrals` of length 2 +
  `nextMilestoneKind: 'qualified_3'` → sub-section renders
  with two first names and the right progress line;
  (iii) `pendingReferrals` of length 5 + 11 qualified →
  sub-section renders with `nextMilestoneKind:
  'qualified_25'` progress line; (iv) tapping "Text them
  a nudge" fires the share sheet with the expected
  template string; (v) the free-tier card variant
  shows the on-deck section with the upgraded share
  template; (vi) no banned word in any rendered
  fixture variant.

- [ ] A new pure helper `buildPendingNudgeMessage(args: {
  pendingFirstNames: string[]; isFreeInviter: boolean }):
  string` exported from
  `src/lib/referral-credit-utils.ts`. Returns the
  respectful template ("Hey James and Lin — you signed up
  on SportsIQ last week, was curious what you thought.
  The parent report is the feature that pulled me in").
  Per AGENTS.md voice — no banned word; instruct
  positively in the jsdoc per LESSONS#0023. The free-
  tier variant is structurally distinct (per the
  acceptance criterion above) — both variants share the
  oxford-comma join + first-name posture. Pure
  function, no DB. (vitest under
  `tests/lib/referral-credit-pending-nudge.test.ts` —
  new): (i) one name → "Hey James — …"; (ii) two
  names → "Hey James and Lin — …"; (iii) three names →
  "Hey James, Lin, and Riya — …"; (iv) `isFreeInviter:
  true` → the upgraded template; (v) no banned word
  across the matrix; (vi) literal-space surname
  defense per LESSONS#0061.

- [ ] Tier / feature gating: the pending sub-section
  renders for BOTH paid (`coach` / `pro_coach` /
  `organization`) AND free-tier inviters — the free-
  tier variant routes the share template through the
  upgrade-aware copy (per the acceptance criterion).
  NO new tier feature key. The SUB-SECTION never
  appears for an inviter whose 0074 qualified count
  is already past qualified_25 (no next milestone to
  stack toward). (vitest: a paid inviter with 2
  pending → renders; a free inviter with 2 pending →
  renders the upgraded template; a 25+ inviter → no
  pending sub-section.)

- [ ] Privacy / COPPA contract: the route reads
  ONLY `coaches.id`, `coaches.first_name` (split off
  the existing `full_name` per the 0074 / 0021 /
  0047 posture), `coaches.created_at`,
  `plans.coach_id` / `plans.type`,
  `observations.coach_id` joined via team_coaches
  per LESSONS#0057. NEVER reads
  `coaches.email`, `coaches.phone`, `coaches.full_name`
  (full surname). The rendered card NEVER shows a
  surname (first name only); the share-sheet
  template uses ONLY first names. Per LESSONS#0036
  / #0070 — `.select()` allow-lists; never mutate
  the DB row. (vitest: planted email / phone / DOB
  on the converted-coach rows are NEVER read; the
  rendered text passes the surname-leak regex;
  the share template passes the same scan.)

- [ ] Voice contract: every rendered string (the on-
  deck headline, the qualification line, the
  progress line, the button label, the share-sheet
  template across both variants) contains NO
  AGENTS.md banned word per LESSONS#0023.
  Instruct positively (the helper jsdoc names the
  voice posture; the verbatim ban-list is NEVER
  embedded in any prompt or template per
  LESSONS#0023 / #0034 / #0061 / #0088). The
  share-template name-join uses the same oxford-
  comma posture as 0047 / 0074. (vitest: render
  every variant across the name / count /
  tier matrix and scan; render the share
  template via `buildPendingNudgeMessage` and
  scan its body.)

- [ ] Regression: the 0074-shipped flow is
  BYTE-IDENTICAL when `pendingReferrals` is empty
  — same celebration card, same Got-it consume
  POST, same Stripe customer-balance call from
  `/api/billing/apply-referral-credit`. The
  existing `/api/coach/referral-credit-status`
  response shape is a strict superset (the new
  fields are additive). The existing
  `/api/coach/referral-credit-status/consume` is
  BYTE-IDENTICAL. The
  `referral_credit_grants` migration (066) is
  BYTE-IDENTICAL — no schema change in this
  ticket. (vitest: snapshot the 0074 routes and
  the existing card under the pre- and post-
  change branches against seeded fixtures.)

- [ ] Seeded e2e on the 0006 fixture: extend the
  0074 seed (which already pre-mints THREE
  qualified referred coaches) with TWO ADDITIONAL
  referred coaches whose
  `preferences->>referred_by_code` equals the
  existing E2E coach's deterministic referral
  code, but who have ZERO shipped artifacts and
  ZERO head-coached observations (the pending
  shape). Per LESSONS#0084 / #0101 — same
  idempotent block, UUIDs in the next free
  range (`0000000000<XX>+`), auth.users +
  coaches in the same idempotent block per
  LESSONS#0084. Per LESSONS#0085 — jsonb
  `preferences` values seeded as quoted JSON.
  The seed extension keeps the 0074 E2E happy
  (still 3 qualified). Playwright spec: (a)
  sign in as the E2E coach, navigate to
  /home, assert the existing 0074 credit
  card renders AND the new pending sub-section
  is visible (scoped by data-testid) with the
  two pending first names; (b) assert the
  "Text them a nudge" button is present;
  (c) assert the rendered progress line names
  the $9.99 amount and the next milestone
  count; (d) skip tapping the share sheet
  (jsdom/Playwright share-sheet click is
  flaky; the data-share-url + invoked-handler
  pattern from LESSONS#0011 is the load-
  bearing surface). Scope every assertion by
  data-testid per LESSONS#0081 / #0082.
  Skip when E2E creds are unset.

## Out of scope

- A new "I shipped my first parent report — your
  inviter just got closer to a free month" email
  to the converted coach. v1 does NOT change the
  converted coach's UX (the 0074 consent posture
  stays intact). A surface that tells the
  converted coach they qualified is a separate
  consent ticket.
- A LEADERBOARD comparing inviters' progress
  across teams. v1 is per-coach private only.
- A "redeem early" surface — paying the credit
  forward before the milestone fires. v1 keeps
  the 0074 milestone-crossing → Stripe
  customer-balance pipeline intact.
- A TIME WINDOW on pending status ("pending
  for over 30 days — re-text?"). v1 does not
  differentiate by signup age; that's a v2.
- A new Stripe price or SKU. v1 reuses the
  0074 customer-balance credit; no new SKU.
- A PUSH notification when a pending coach
  finally qualifies. v1 surfaces the upgrade
  inline; a notification is its own surface.
- A retroactive sweep for already-converted-
  but-not-yet-celebrated inviters. v1 fires
  forward only.
- An email surface mirroring the on-deck
  card. v1 is in-product /home only.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/referral-credit-utils.ts` (existing — read
  first per LESSONS#0096) — extend with the new
  `summarizePendingReferrals` + `buildPendingNudgeMessage`
  exports. The existing `countQualifiedReferrals` +
  `QUALIFYING_ARTIFACT_TYPES` are BYTE-IDENTICAL. Per
  LESSONS#0103 — additive widening only.
- `src/app/api/coach/referral-credit-status/route.ts`
  (existing — read first per LESSONS#0096) — extend the
  response with the new fields. Per LESSONS#0066 —
  widen the existing converted-coach `.select()` to
  also pull `created_at`; do NOT add a new from() call.
  Per LESSONS#0049 / #0092 / #0100 / #0110 — at
  pickup Glob `tests/api/coach*referral*.test.ts` AND
  `tests/api/coach-referral*.test.ts` AND extend every
  `mockReturnValueOnce` queue.
- `src/components/home/referral-credit-card.tsx`
  (existing — read first per LESSONS#0096) — render the
  pending sub-section. Per LESSONS#0065 / #0066 /
  #0162 — smallest possible touch. Per LESSONS#0029 /
  #0082 — `data-testid` scoping for every new
  element.
- `src/app/(dashboard)/home/page.tsx` — NO change
  (the card is already mounted by 0074).
- `src/lib/tier.ts` — NO change. NO new feature
  key.
- `src/components/ui/upgrade-gate.tsx` — NO change.
- `tests/lib/referral-credit-pending.test.ts` (new).
- `tests/lib/referral-credit-pending-nudge.test.ts`
  (new).
- `tests/api/coach-referral-credit-status-pending.test.ts`
  (new) — exercises the new fields; the existing
  0074 tests stay BYTE-IDENTICAL.
- `tests/components/referral-credit-card-pending.test.tsx`
  (new).
- `tests/e2e/referral-credit-pending-flow.spec.ts`
  (new). Seed extension per the AC. UUIDs in the
  next free range per LESSONS#0101. Skip when E2E
  creds are unset.
- New deps: NO. Migration: NO (every row read
  already exists). Env vars: NO. AI prompt change:
  NO. Tier feature key: NO.
- LESSONS to anchor: #0023 (positive voice on
  templates), #0029 / #0082 (data-testid scoping),
  #0036 (`.select()` allow-lists), #0044 (Stripe
  customer balance preservation), #0049 / #0092 /
  #0100 / #0110 (mock queue sweeps), #0061
  (literal space defensive scans), #0066
  (widen existing select rather than add new
  from()), #0070 (no DB-row mutate), #0084 /
  #0101 (seed posture), #0085 (jsonb seed
  values), #0096 (schema wins over prose — at
  pickup read the actual 0074 route shape, the
  actual card shape, the actual referral-code
  helper shape, the actual `team_coaches` join
  shape), #0103 (additive widening), #0116
  (empty-Glob no-op), STRATEGY_AUDIT_2026-06-15.md
  (acquisition surface vs conversion surface
  asymmetry).

Depends on: 0074 (shipped — the credit-grant
mechanic + the celebration card; this builds the
forward-looking stacking layer on top), 0015 /
0017 / 0021 (shipped — the referral-code share
loop the nudge template reuses), 0047 (shipped —
the conversion-celebration card that fires per
conversion; this card stacks the forward-looking
view in parallel).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0085-referral-credit-stacking-progress` opened
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
