---
id: 0087
title: When a program director sees 3+ Coach-tier coaches actively shipping in their program this month, surface a contextual Organization-tier upgrade — "your program is on SportsIQ already; one upgrade unlocks the staff view"
status: groomed
priority: P1
area: tier
created: 2026-06-15
owner: product-groomer
---

## User story

As a program director who joined SportsIQ through 0024 (a coach on my staff
invited me) or 0050 (a parent forwarded their kid's report and I claimed
the program) or 0065 (a coach dropped me into the weekly-pulse share card),
who has been reading the 0028 / 0077 program-pulse cards for a few weeks, and
whose program now has 3 coaches on the Coach tier actively publishing
artifacts — I want a quiet card on my director surface that says "Your
program already has 3 paying coaches on SportsIQ this month (Maya, James,
Lin). Organization plan brings them under one shared roster, a program-wide
analytics view, and a 12% discount on what they're already paying — total
$59.97 today, $49.99 on Org. Want me to show you how it would look?" — so
the upgrade moment lands as an EARNED transition the data already
demonstrates instead of a cold "Upgrade to Organization" CTA the director
never trusts.

## Why now (four lenses)

### Product Owner

The product has shipped the director acquisition wave: 0024 (director
invites staff), 0028 / 0077 (program pulse / cross-program peer pulse),
0050 (parent → director referral), 0065 (coach → director invite), 0071
(emergent program focus), 0083 (program-scoped Practice Arc memory). Every
one of those acquisition vectors lands the director on SportsIQ as the
TOP-OF-ORG identity — but the ORG ROW itself sits at `tier: free` on the
default `organizations` row from `001_schema.sql`, even when 3 of its
coaches are individually paying Coach-tier ($9.99 each = $29.97/mo
flowing INTO the program with NO program-wide visibility). The smallest
meaningful unit of value is: (a) a new pure helper
`summarizeProgramTierState({ orgId, coachRows, recentArtifactRows,
nowMs })` that counts the distinct Coach-tier-or-above coaches in the
org who have shipped at least one structured artifact (parent_report /
practice_plan / weekly_pulse / game_recap) in the last 30 days; (b)
extend the existing 0028 / 0077 program-pulse data route (read at
pickup per LESSONS#0096) to ALSO return
`programTierState: { paidCoachCount, paidCoachFirstNames: string[],
monthlySpendCents, orgUpgradeSavingsCents, currentOrgTier }`; (c) a
NEW small card `<ProgramOrgTierCard />` mounted on the existing
director surface that renders when `paidCoachCount >= 3` AND
`currentOrgTier === 'free'` — the card names the three first names,
shows the monthly spend math ("$9.99 × 3 = $29.97 today; Organization
is $49.99 and unlocks shared roster, program analytics, custom
branding"), and routes to `/settings/upgrade?resume=adopt_org_tier:
<orgId>`. The resume primitive (0035) gains the new `adopt_org_tier`
kind. NO new tier feature key — the existing `organization` tier in
`src/lib/tier.ts` already gates `multi_coach`, `org_analytics`,
`custom_branding`, `feature_program_pulse`, `feature_program_focus`,
`feature_program_emergent_focus`. NO change to the tier prices. NO
new public surface.

### Stakeholder

This is the moat-deepening primitive that finally closes the program-
tier funnel — the most asymmetric LTV jump on the product (an Org
seat is 5x a Coach seat AND structurally unlikely to churn because
the director's whole staff is on it). Three compoundings, all
distinct from anything shipped. (1) The bottom-up org compound — the
director who upgrades here is upgrading on EARNED evidence: three of
their own coaches independently chose to pay for SportsIQ. The
conversion signal is the strongest possible — "your own people
already voted with their wallets." A forms-app competitor cannot
fabricate this signal because they do not have the underlying paid-
coach attribution graph. (2) The bottom-line-savings compound — the
director's mental model for an Org upgrade has historically been
"another expense." The math we surface inverts it: "your coaches
are ALREADY paying $29.97; consolidating onto Org is $49.99 with
shared roster + analytics + branding, which is what your coaches
SHOULD be on anyway." For 3 paying coaches, the org is 67% more
expensive than the status quo; for 5+ paying coaches, org is
CHEAPER ($49.99 vs $49.95 for 5 individual seats — and Org gives
the program-wide rails the individuals do not). The card surfaces
the live math, not a marketing pitch. (3) The post-upgrade
consolidation compound — when a director upgrades to Org, the
existing 0024 invite mechanic + the existing `team_coaches` join
lets her ABSORB the three paying coaches' subscriptions onto the
program billing (the existing Stripe customer-balance posture
from 0074 handles the proration credit-back as the individual
Coach subs cancel and the Org sub starts). The whole funnel —
3 individual subs collapsing into 1 Org sub — happens inside
Stripe; the directors' /home does NOT show three checkout
screens, it shows ONE Org checkout with the credit-back math
named explicitly. Per the strategy audit
(`docs/STRATEGY_AUDIT_2026-06-15.md`) — "the upgrade moment
hasn't kept pace with the viral surface area" — this is the
DIRECTOR-tier specialization of that thesis, applied at the
highest-ARR transition the product has.

### User (the director, Riya, has been on SportsIQ for 3 weeks via
0024, opens app Tuesday morning after the 0028 pulse email)

She opens /director. The 0028 program pulse loads as usual. UNDER
the pulse, a NEW small card with a quiet orange accent: "Your
program is on SportsIQ already — Maya, James, and Lin on Coach,
shipping real practices and reports this month. Organization plan
unlocks one shared roster, program-wide analytics, and your own
branding — and rolls those three subscriptions into one. $49.99
on Org; $29.97 today across the three coaches; the difference is
the program rails." Underneath: ONE primary button "Show me what
Organization looks like" — opens a preview overlay (read-only,
not a billing commitment) that walks her through the existing
shipped 0024 / 0028 / 0071 / 0083 program surfaces with HER
program's data already populated. ONE secondary button "Maybe
later" — closes the card, snoozes for 14 days. If she taps the
primary button, the preview overlay's final screen has the
upgrade CTA: "Upgrade to Organization — $49.99/mo. We'll
credit your coaches' next invoice for what they've already paid
this cycle. Total today: $49.99." She taps. Stripe. The webhook
fires the Org tier on her org. The 0024 staff-invite surface
flips into the "absorb coaches" branch (a separate ticket — see
out-of-scope). She does NOT have to ask Maya / James / Lin to
cancel their subs; the Stripe customer-balance mechanic credits
them back automatically. Done. Total interaction time: 4 minutes
if she does the preview tour, 90 seconds if she upgrades
straight. On a flaky network, the card itself renders from the
existing pulse data; the preview overlay is lazy-loaded.

### Growth

The "show me" moment is the LIVE MATH on the card — "$9.99 × 3 =
$29.97 today; Org is $49.99." That is a screenshot a director
sends to another director ("look what SportsIQ knew about my
program — and what they offered me"), which is the
director-to-director acquisition shape the 0077 cross-program
peer pulse already partially seeded. Three compoundings. (1)
The director-network compound — every Org-tier upgrade is also
a referral signal that fires through 0077's cross-program
director surface; the next director sees "the Riverside program
just went Org" as social proof. (2) The retention compound — an
Org-tier director who has consolidated three Coach-tier subs
onto her billing is structurally unlikely to churn because
churning would require re-fragmenting the coaches' subs, which
is a manual mess. (3) The ARR-step compound — the per-program
ARR jumps from $29.97/mo (3 individual Coach subs) to $49.99/mo
(1 Org sub) on the upgrade, a 67% lift PER PROGRAM that adopts.
And the ABSORB-coaches mechanic means the lift is durable; the
former individual coaches now have an Org-funded subscription
they did not commit to renew personally.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper `src/lib/program-tier-state.ts` exports
  `summarizeProgramTierState(args: { coachRows: Array<{ id:
  string; first_name: string; org_tier: 'free' | 'coach' |
  'pro_coach' | 'organization'; recent_shipped_artifact_count:
  number }>; currentOrgTier: 'free' | 'coach' | 'pro_coach' |
  'organization'; nowMs: number }): { paidCoachCount: number;
  paidCoachFirstNames: string[]; monthlySpendCents: number;
  orgUpgradeSavingsCents: number; eligibleForOrgUpgrade: boolean
  }`. The helper: (a) filters coachRows to those whose
  `org_tier` is `coach` OR `pro_coach` (not `organization` —
  those are already on the right tier) AND whose
  `recent_shipped_artifact_count >= 1`; (b) returns the count,
  the FIRST NAMES of up to 3 (oxford-comma join per LESSONS#0074),
  the monthly spend (9.99 cents-times-3 for 3 coaches, etc. —
  read the existing MONTHLY_PRICES const from
  `src/components/ui/upgrade-gate.tsx`); (c) computes
  `orgUpgradeSavingsCents` as `monthlySpendCents - 4999` (a
  POSITIVE number when consolidation saves money — i.e. 5+
  Coach-tier coaches; a NEGATIVE number when Org is a step
  up — the card renders both honestly); (d) sets
  `eligibleForOrgUpgrade` to `(paidCoachCount >= 3 AND
  currentOrgTier === 'free')` — the gating condition. Pure
  function, reads no DB. Per LESSONS#0023 — instruct
  positively in jsdoc; never embed a verbatim ban-list. Per
  LESSONS#0061 — first name only, literal-space defensive
  scan. (vitest under `tests/lib/program-tier-state.test.ts`
  — new): (i) empty coachRows → not eligible, paidCoachCount
  0; (ii) 2 paid + active → not eligible
  (`paidCoachCount: 2`); (iii) 3 paid + active + free org →
  eligible, names listed, spend = $29.97, savings = -$20.02;
  (iv) 5 paid + active + free org → eligible, savings =
  +$0.04; (v) 7 paid + active + free org → eligible,
  savings = +$20.06; (vi) 3 paid + active + org already
  `organization` → not eligible; (vii) 3 paid + 0 shipped
  → not eligible (the activity gate); (viii) names
  surname-stripped; (ix) deterministic across input order;
  (x) no banned word in the rendered names / dollar amounts.

- [ ] Extend the existing 0028 / 0077 program-pulse data
  route (read at pickup per LESSONS#0096 — likely
  `src/app/api/director/program-pulse/route.ts` or
  similar; verify the exact path) to return ADDITIONAL
  fields: `programTierState: ReturnType<typeof
  summarizeProgramTierState>`. The route: (a) reads the
  coaches in the caller's org via the existing
  `team_coaches` + `coaches` join the 0028 / 0077
  routes already use; (b) reads each coach's `org_tier`
  via `coaches.org_id → organizations.tier` (per
  LESSONS#0039 — `organizations.tier`, not `plan`);
  (c) reads each coach's `recent_shipped_artifact_count`
  via a count query against `plans` filtered to
  `QUALIFYING_ARTIFACT_TYPES` from the 0074 utils,
  `created_at >= now() - 30 days`, `coach_id =
  <coachId>`; (d) calls `summarizeProgramTierState`.
  Per AGENTS.md rule 3 — service-role reads. Per
  LESSONS#0036 — `.select()` allow-lists; NEVER reads
  email / phone / DOB on any coach. Per LESSONS#0049 /
  #0092 / #0100 / #0110 — at pickup Glob
  `tests/api/director*.test.ts` AND
  `tests/api/program*.test.ts` AND extend every
  `mockReturnValueOnce` queue. Per LESSONS#0066 —
  widen existing select rather than add a new from()
  call where possible. Per LESSONS#0057 — team_coaches
  for org membership. (vitest under
  `tests/api/director-program-tier-state.test.ts` —
  new): (i) 0 paid coaches → `eligibleForOrgUpgrade:
  false`; (ii) 3 paid + active + free org →
  `eligibleForOrgUpgrade: true`, first names returned;
  (iii) the existing pulse response fields are
  BYTE-IDENTICAL (additive widening); (iv) planted
  email / phone / DOB on coaches are NEVER read; (v)
  an unauthed caller → 401; (vi) a non-director
  caller (a coach without director role on the org)
  → 403; (vii) when the org is already on
  `organization` tier, the field returns
  `eligibleForOrgUpgrade: false`.

- [ ] A new client component
  `src/components/director/program-org-tier-card.tsx`.
  Renders on the director surface (read at pickup —
  the existing 0028 program-pulse mount point is
  the reference). The card: (a) renders ONLY when
  `programTierState.eligibleForOrgUpgrade === true`
  (silence beats nag); (b) has a quiet orange
  accent matching the existing 0028 / 0071 / 0073
  card aesthetic (zinc-950 + #F97316); (c)
  headline: "Your program is on SportsIQ already"
  with no banned word; (d) body line 1: "<First1>,
  <First2>, and <First3> on Coach, shipping real
  practices this month"; (e) body line 2: "$X.XX
  today across <N> coaches · $49.99 on Organization"
  with the savings framed honestly (when
  `orgUpgradeSavingsCents >= 0`, render "saves
  $Y.YY/mo"; when negative, render "the $Z.ZZ
  difference is the program rails"); (f) ONE
  primary button "Show me Organization" that
  navigates to a NEW preview page at
  `/director/preview-organization` (the preview
  overlay surface — see next AC); (g) ONE
  secondary button "Maybe later" that POSTs a
  small snooze (`POST /api/director/program-org-
  tier-card/snooze`) and hides the card for 14
  days; (h) `data-testid="program-org-tier-card"`.
  Per AGENTS.md voice — no banned word; per
  LESSONS#0023 — instruct positively in jsdoc.
  Per LESSONS#0065 / #0066 / #0162 — smallest
  possible touch on the director surface. (vitest
  under `tests/components/program-org-tier-
  card.test.tsx` — new): (i) `eligibleForOrgUpgrade:
  false` → card ABSENT; (ii) `eligibleForOrgUpgrade:
  true` with 3 names → renders with all three; (iii)
  savings positive (5+ paid coaches) → renders the
  saves-X line; (iv) savings negative (3 paid coaches)
  → renders the program-rails line; (v) "Maybe
  later" POSTs the snooze and hides the card; (vi)
  no banned word in any rendered fixture variant
  across the name / count / savings matrix.

- [ ] A new preview page at
  `src/app/(dashboard)/director/preview-organization/page.tsx`
  (or the closest existing director-route shape —
  read at pickup per LESSONS#0096). The page: (a)
  renders the EXISTING shipped program surfaces
  (0024 / 0028 / 0071 / 0077 / 0083) with the
  director's REAL program data already populated,
  but in READ-ONLY mode (a banner across the top
  reads "Preview — Organization plan"); (b) the
  final screen has the upgrade CTA "Upgrade to
  Organization" that navigates to
  `/settings/upgrade?resume=adopt_org_tier:<orgId>`
  (the 0035 resume primitive — the new
  `adopt_org_tier` kind is added to the allow-
  list). The page is gated to directors only
  (the org owner per the existing
  `coaches.is_admin` or equivalent — read at
  pickup). Per AGENTS.md voice — no banned word.
  Per LESSONS#0065 / #0066 / #0162 — smallest
  possible touch. (vitest + Playwright under
  `tests/e2e/program-org-tier-preview-flow.spec.ts`
  — new): (i) the preview page renders the
  existing program surfaces with the director's
  data; (ii) the page is read-only (no write
  surface fires); (iii) the upgrade CTA's href
  contains `resume=adopt_org_tier:<orgId>`;
  (iv) a non-director caller → 403 / redirect to
  /home.

- [ ] Extend the 0035 resume primitive
  (`src/lib/resume-target.ts` — existing, read
  first per LESSONS#0096) to add `adopt_org_tier`
  to the closed enum of kinds. The new
  `parseResumeTarget` branch validates that the
  `orgId` segment is a UUID owned by the caller
  (the caller is a director on that org via the
  existing role check). The post-checkout landing
  reads the resume target, confirms the tier has
  flipped to `organization`, and routes the
  director to the org's main dashboard with a
  small "Organization plan active — let's get
  your coaches under one roof" success banner.
  Per LESSONS#0044 — the webhook's tier-flip is
  the load-bearing guard. Per LESSONS#0103 —
  additive widening. (vitest under
  `tests/lib/resume-target-adopt-org-tier.test.ts`
  — new): (i) valid owned org → `{ kind:
  'adopt_org_tier', path: '/director' }`; (ii)
  cross-org / unowned → `null`; (iii) malformed
  UUID → `null`.

- [ ] A new `POST /api/director/program-org-tier-
  card/snooze` (new, authed). The route writes a
  small `org_card_snoozes` row keyed by
  `(org_id, card_kind: 'program_org_tier',
  snoozed_until: now() + interval '14 days')`.
  A new migration `072_org_card_snoozes.sql`
  adds the table (per LESSONS#0006 — confirm
  `072` is the next free integer at pickup;
  latest seen `071_parent_forward_signals_cross_team`).
  The table schema: `(id UUID PRIMARY KEY DEFAULT
  gen_random_uuid(), org_id UUID NOT NULL
  REFERENCES organizations(id) ON DELETE CASCADE,
  card_kind TEXT NOT NULL CHECK (card_kind IN
  ('program_org_tier')), snoozed_until TIMESTAMPTZ
  NOT NULL, snoozed_by_coach_id UUID NOT NULL
  REFERENCES coaches(id) ON DELETE CASCADE,
  snoozed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, card_kind))`. The CHECK enum
  is intentionally small (only the one card_kind
  this ticket needs); future cards can widen it.
  Indexes: `(org_id, card_kind) WHERE
  snoozed_until > NOW()`. Per LESSONS#0088 — strip
  `--` comments before banned-token sweep. Per
  LESSONS#0094 — service-role grants in the same
  migration. (vitest under
  `tests/migrations/072-org-card-snoozes.test.ts`
  — new): scan migration body with `--` stripped;
  column allow-list; CHECK constraints; index;
  UNIQUE constraint; NO new column on any sacred
  table; service-role GRANT block present. The
  snooze route reads the row in the
  program-pulse route and DOES NOT render the
  card while `snoozed_until > NOW()`. (vitest
  under `tests/api/director-program-org-tier-
  card-snooze.test.ts` — new): (i) snooze
  succeeds for a director; (ii) the card is
  ABSENT for the next 14 days; (iii) the snooze
  expires and the card returns; (iv) a non-
  director caller → 403.

- [ ] Tier / feature gating: the program-tier
  card is the SERVER's gate (the route only
  returns `eligibleForOrgUpgrade: true` for a
  free-tier org with 3+ active paid coaches
  AND no active snooze). The CLIENT-side
  rendering re-checks the same flag for
  defense-in-depth per AGENTS.md rule 5. NO
  new tier feature key — the existing
  `organization` tier in `src/lib/tier.ts`
  is the load-bearing gate; this surface is
  the CONVERSION moment that drives a free-
  tier org TO that gate. The TIER_LIMITS
  numbers are BYTE-IDENTICAL. The
  `<UpgradeGate>` placements are BYTE-
  IDENTICAL. (vitest: a free-tier org with 3
  paid coaches gets `eligibleForOrgUpgrade:
  true`; an `organization`-tier org gets
  false; a `coach`-tier org also gets false
  — only a free-org-with-paid-coaches matches
  the funnel shape this ticket targets.)

- [ ] Privacy / COPPA contract: the route
  reads ONLY `coaches.id`, `coaches.first_name`
  (split off `full_name`), `coaches.org_id`,
  `organizations.tier`, the existing
  `plans.coach_id` / `plans.type` / `plans.created_at`
  fields the 0074 route already reads. NEVER reads
  `coaches.email`, `coaches.phone`,
  `coaches.full_name` surname, `players.*`,
  `players.parent_email`, `players.dob`. The
  rendered card NEVER shows a surname (first name
  only); NEVER shows a player's name; NEVER shows
  a coach's email. Per LESSONS#0036 / #0070 —
  `.select()` allow-lists; never mutate the DB row.
  (vitest: planted email / phone / DOB on the
  scanned coaches are NEVER read; the rendered text
  passes the surname / minor-field regex sweep.)

- [ ] Voice contract: every rendered user-facing
  string (the card headline, body lines, button
  labels, the preview-page banner, the snooze
  confirmation, the success banner after Org
  upgrade) contains NO AGENTS.md banned word per
  LESSONS#0023. Instruct positively in every
  helper / component jsdoc; never embed a verbatim
  ban-list per LESSONS#0023 / #0034 / #0088. The
  dollar-amount formatting matches the 0074 card
  posture ($X.XX with cents; "and" oxford-comma
  on the names join). (vitest: render every
  variant across the count / savings / org-tier
  matrix and scan.)

- [ ] Regression: the existing 0028 / 0077
  program-pulse routes' response shape is a
  strict SUPERSET — every existing field is
  BYTE-IDENTICAL, the new `programTierState`
  field is additive. The existing director
  surface's render is BYTE-IDENTICAL when the
  org is NOT eligible (the new card is absent).
  The 0035 resume primitive's existing kinds
  are BYTE-IDENTICAL — only `adopt_org_tier`
  is additive. The
  `coach.is_admin`/director-role check is
  BYTE-IDENTICAL — this ticket adds no new
  role concept. (vitest: snapshot the 0028 /
  0077 routes pre- and post-change with planted
  fixtures; snapshot the director surface
  pre- and post-change when no card fires.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — confirm the existing seeded
  director coach belongs to a `free`-tier
  organizations row (the default per
  `001_schema.sql`); pre-mint THREE additional
  coaches in that org, each on `coach` tier
  (set `organizations.tier = 'coach'` on a
  NEW seeded org per LESSONS#0085 — jsonb-
  quoting where needed); pre-mint one
  qualifying `plans` row per coach in the
  last 30 days. Then the eligibility check
  becomes interesting: the director's org is
  `free`, and the test asserts the card
  renders. Pre-mint ONE seeded
  `coaches.full_name` per added coach with a
  deterministic first name ("Maya", "James",
  "Lin") for stable assertions per
  LESSONS#0079. Per LESSONS#0084 / #0101 —
  auth.users + coaches in the same
  idempotent block; UUIDs in the next free
  range; per LESSONS#0094 — service-role
  GRANTs in the new migration. Playwright
  spec: (a) sign in as the seeded director,
  (b) navigate to the director surface, (c)
  assert the program-org-tier-card renders
  scoped by data-testid AND contains the
  three first names AND the savings/cost
  math line, (d) tap "Show me Organization",
  assert the preview page loads, (e) tap
  "Upgrade to Organization", assert the
  resume URL contains `adopt_org_tier:`,
  (f) mock the Stripe round-trip per the
  0002 / 0035 pattern, assert the
  post-checkout landing routes to /director
  with the success banner; (g) on a SECOND
  test fixture, tap "Maybe later" and
  assert the card hides AND a re-load
  keeps it hidden. Scope every assertion
  by data-testid per LESSONS#0081 /
  #0082. Skip when E2E creds are unset.

## Out of scope

- The MECHANIC for absorbing the three Coach-tier
  individual subscriptions onto the Org's billing
  (the Stripe customer-balance credit-back). v1
  ships the conversion CTA + the Org upgrade; the
  consolidate-individual-subs mechanic is a
  separate ticket with its own Stripe-state
  reasoning (and the audit memo's privacy review on
  cross-coach billing visibility). The card's
  copy NAMES the consolidation as future state;
  the implementation lands separately.
- An email surface mirroring the card. v1 is
  in-product director-surface only.
- A PROACTIVE "your program is one paid coach
  away" surface (counting 2 paid + needing 1
  more). v1 fires only on 3+ paid AND active —
  silence beats nag.
- A LEADERBOARD of "programs that adopted Org
  this month." v1 surfaces only the caller's own
  state.
- A DISCOUNTED Org tier price for high-paid-
  coach programs. v1 uses the existing $49.99
  Org price; tier-economics changes are a
  separate ticket.
- A "claim a free Org month" surface. v1 keeps
  Stripe consideration honest — no free
  introductory month at this conversion
  surface.
- A POST-upgrade automated onboarding flow that
  asks the director to invite the rest of her
  staff. The 0024 staff-invite flow is the
  surface for that; v1 routes the director to
  the existing /director landing.
- A RETROACTIVE sweep of orgs that historically
  had 3+ paid coaches but no director on the
  product. The card fires forward only.
- An A/B test framework for the card copy. v1
  ships ONE copy from the helper; copy tests
  are a separate ticket.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/program-tier-state.ts` (new) — pure
  helper. Mirrors the shape of
  `src/lib/referral-credit-utils.ts` (0074),
  `src/lib/coach-reputation-utils.ts` (0073).
  Per LESSONS#0061 — literal-space defensive
  scan; per LESSONS#0023 — positive voice.
- `src/app/api/director/program-pulse/route.ts`
  (existing — read first per LESSONS#0096;
  verify the exact path that 0028 / 0077
  ship) — extend the response with the new
  `programTierState` field. Per LESSONS#0066 —
  widen existing select rather than add a new
  from() call where possible; per LESSONS#0049 /
  #0092 / #0100 / #0110 — at pickup Glob
  `tests/api/director*.test.ts` AND
  `tests/api/program*.test.ts` and extend every
  `mockReturnValueOnce` queue. Per LESSONS#0057
  — `team_coaches` for org membership. Per
  LESSONS#0039 — `organizations.tier`, not
  `plan`.
- `src/components/director/program-org-tier-card.tsx`
  (new). Per LESSONS#0029 / #0082 — `data-testid`
  scoping. Per LESSONS#0065 / #0066 / #0162 —
  smallest possible touch on the director
  surface.
- `src/app/(dashboard)/director/page.tsx` (or
  the closest existing director home; read at
  pickup) — ONE import + ONE JSX mount of the
  new card under the existing 0028 program-
  pulse card. Per LESSONS#0065 / #0066 / #0162.
- `src/app/(dashboard)/director/preview-organization/page.tsx`
  (new) — read-only preview wrapping the
  existing shipped director surfaces.
- `src/app/api/director/program-org-tier-card/snooze/route.ts`
  (new) — `POST(request)`. Authed; director-only.
- `src/lib/resume-target.ts` (existing — read
  first per LESSONS#0096) — add `adopt_org_tier`
  to the closed enum + `buildResumePath` branch.
  Per LESSONS#0103 — additive widening.
- `src/app/settings/upgrade/page.tsx` (existing
  — read first) — extend the post-checkout
  resume handler with the `adopt_org_tier` branch.
- `supabase/migrations/072_org_card_snoozes.sql`
  (new). Per LESSONS#0006 — confirm `072` at
  pickup. Per LESSONS#0088 — strip `--` comments
  before banned-token sweep. Per LESSONS#0094 —
  service-role GRANTs in the same migration.
- `src/types/database.ts` — add
  `OrgCardSnooze` type. NO field on existing
  types.
- `src/lib/tier.ts` — NO change. NO new
  feature key.
- `tests/lib/program-tier-state.test.ts` (new).
- `tests/api/director-program-tier-state.test.ts`
  (new).
- `tests/components/program-org-tier-card.test.tsx`
  (new).
- `tests/api/director-program-org-tier-card-snooze.test.ts`
  (new).
- `tests/lib/resume-target-adopt-org-tier.test.ts`
  (new).
- `tests/migrations/072-org-card-snoozes.test.ts`
  (new).
- `tests/e2e/program-org-tier-preview-flow.spec.ts`
  (new). Seed extension per the AC. UUIDs in the
  next free range per LESSONS#0101. Skip when E2E
  creds are unset.
- New deps: NO. Migration: YES (072 or bump per
  LESSONS#0006). Env vars: NO. AI prompt change:
  NO. Tier feature key: NO new key.
- LESSONS to anchor: #0006 (migration prefix
  uniqueness), #0023 (positive voice), #0029 /
  #0082 (data-testid scoping), #0034 / #0088
  (strip `--` comments on banned-word scan),
  #0036 (`.select()` allow-lists), #0039
  (organizations.tier not plan), #0044 (Stripe
  webhook tier-flip is the load-bearing guard),
  #0049 / #0092 / #0100 / #0110 (mock queue
  sweeps), #0057 (team_coaches not
  teams.coach_id), #0061 (literal space
  defensive scans), #0066 (widen existing
  select), #0070 (no DB-row mutate), #0079
  (deterministic seeded first names), #0084 /
  #0101 (seed posture), #0085 (jsonb seed
  values), #0094 (service-role GRANTs in
  migrations), #0096 (schema wins over prose —
  at pickup read the actual 0028 / 0077
  program-pulse route path and response shape,
  the actual director surface mount point, the
  actual is_admin role check, the actual
  `<UpgradeGate>` MONTHLY_PRICES export shape),
  #0103 (additive widening), #0116 (empty-Glob
  no-op), STRATEGY_AUDIT_2026-06-15.md
  (Free → Paid conversion friction at the
  director-tier surface — the highest-ARR
  step on the product).

Depends on: 0024 (shipped — director staff
invite, the acquisition vector this surface
closes), 0028 / 0077 (shipped — program pulse
where the card mounts), 0035 (shipped — the
resume primitive extended here), 0050 / 0065
(shipped — parent → director and coach → director
referral, alternative acquisition paths), 0071 /
0083 (shipped — program-scoped surfaces the
preview overlay walks through), 0074 (shipped —
the qualifying-artifact const reused for the
30-day activity check).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0087-organization-tier-upgrade-moment-for-active-program` opened
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
