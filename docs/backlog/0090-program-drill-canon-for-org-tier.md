---
id: 0090
title: When a program has gone Organization-tier (post-0087) and 3+ of its coaches have thumbed up the same drill across the season, surface the emergent "program drill canon" — the 5-10 drills the program's coaches keep coming back to — as a one-tap one-shared library every new coach in the program inherits on day one, so the institutional knowledge that today lives in 6 coaches' heads becomes the program's actual library and the Org-tier subscription is structurally churn-proof
status: groomed
priority: P1
area: plans
created: 2026-06-18
owner: product-groomer
---

## User story

As a program director who took the Organization-tier upgrade via 0087 four
weeks ago — Hawks Basketball, 6 coaches across U8 / U10 / U12 / U14, all of
whom have been on SportsIQ since the fall — I want, the next time I open
the /admin director surface, ONE quiet card under the existing program
pulse that says: "Your program's drill canon has emerged — 7 drills your
coaches have thumbed up across teams: 'Closeout to recovery' (4 coaches),
'2v1 transition trail' (3 coaches), 'Wall passing under pressure' (3
coaches), 'Cone closeout square' (3 coaches), 'Drive-and-kick rotation'
(3 coaches), 'Box-out wall' (3 coaches), 'Spacing on baseline drift' (3
coaches). Tap to publish these as the Hawks Basketball drill canon — every
new coach who joins the program gets them on day one." — with ONE primary
button to publish the canon and ONE secondary button to edit which drills
make the cut, so the institutional knowledge that currently lives in six
coaches' individual drill libraries (and gets lost the moment a coach
ages out with their kid) becomes the program's PERMANENT library — the
asset I can show the next new coach in October, the asset I can show the
parent who is about to write the year-end donation check, the asset that
makes "leaving SportsIQ" structurally impossible for the program because
the canon would walk out with the platform.

## Why now (four lenses)

### Product Owner

Ticket 0087 shipped the program-Org-tier conversion moment. The product
now has Org-tier programs whose individual coaches' drill libraries have
been quietly piling up via 0044 / 0064 / 0073's drill-thumb posture for
weeks. What the product does NOT have is the surface that AGGREGATES
those individual signals INTO a program-scoped artifact the director
can publish. The smallest meaningful unit of value is: (a) a new pure
helper `computeProgramDrillCanon({ coachThumbRows, drillRows, minCoaches,
maxDrills })` that takes the union of all in-program coaches' thumbed-up
drill_ids (the existing 0039 cross-team drill-thumb persistence — read at
pickup per LESSONS#0096) and returns the drills thumbed by AT LEAST 3
DIFFERENT COACHES in the program, sorted by coach-count descending, capped
at the top 10; (b) a new GET `/api/admin/program-drill-canon?orgId=<uuid>`
(authed; director-only — the existing 0087 / 0028 / 0077 director-role
check) that returns the canon shape `{ eligible: boolean; drills:
Array<{ drillId: string; drillName: string; coachCount: number;
coachFirstNames: string[]; sport_id: string; age_groups: string[] }>;
totalCoachesInProgram: number; eligibilityReason?: 'not_org_tier' |
'too_few_drills_meeting_threshold' }`; (c) a new client component
`<ProgramDrillCanonCard />` mounted on the existing /admin director
surface (the same mount point as the 0087 `<ProgramOrgTierCard />`)
that renders ONLY when `eligible: true` AND no current canon has been
published in the last 90 days (the canon is a once-a-season-ish
artifact, not a weekly nag); (d) a new authed
POST `/api/admin/program-drill-canon/publish` that writes a NEW
`program_drill_canon` row (new table — see migration AC below) with
the selected drill_ids + a publish timestamp + the publishing
director's coach_id; (e) extension of the existing first-time
onboarding flow for a NEW coach joining an Org-tier program (the 0024
director-staff-invite landing; verify the exact path at pickup per
LESSONS#0096) so that when their `team_coaches` row is created the
program's published canon's drill_ids are AUTOMATICALLY added to the
new coach's drill library (the same `drill_thumbs` row shape the 0039
ticket persists — minimal new persistence on the user, just an
inheritance edge from the canon to the personal thumb state). NO new
AI call. NO change to the existing drill persistence schema. NO change
to the tier price.

### Stakeholder

This is the moat-deepening primitive that finally turns the
Organization-tier subscription into an INSTITUTIONAL artifact the
program cannot leave without losing — the post-0087 deepening the
strategy audit named explicitly ("the second director-tier feature
that makes Org churn-proof"). Three compoundings, each structurally
hard for a forms-app competitor to replicate. (1) The institutional-
library compound — the program drill canon is an artifact ONLY
SportsIQ can produce because it requires (a) the cross-team
drill-thumb persistence (0039), (b) the program-scoped roster
(via the 0024 staff-invite + the existing `team_coaches` join), and
(c) the on-platform drill primitives (the seeded `drills` table +
the cross-coach drill_shares from 0064). TeamSnap and GameChanger
have no drill primitive; Hudl has a drill primitive but no cross-
team thumb signal. The canon is a screenshot only SportsIQ can
produce — and once published, the program's institutional knowledge
is on SportsIQ. (2) The new-coach-onboarding compound — every new
coach who joins the program post-canon-publish inherits the canon
on day one (the inheritance edge in the staff-invite flow). The
existing 0083 Practice Arc cross-coach memory is the ARC-shape
crossing; this is the DRILL-LIBRARY crossing. Together they
constitute the "every new coach in this program lands warm with the
program's accumulated knowledge" experience, which is the single
strongest activation moment for a second-year program coach. (3)
The churn-proof compound — an Org-tier program that has published a
canon AND has new coaches who have inherited it has STRUCTURAL
switching costs that did not exist pre-publish: leaving SportsIQ
would require manually re-creating the drill library in another tool
AND telling every new coach what the program runs (which the new
coach currently does not have because the canon LIVES on the
platform). The expected Org-tier churn delta on programs that have
published a canon is structurally orders of magnitude lower than on
Org-tier programs that have not — because the canon IS the
program's institutional memory, and switching tools would mean
forgetting it. Per the strategy audit — "the post-0087 director-
tier upgrade landed; what's the second director-tier feature that
makes Org churn-proof?" This is exactly that feature.

### User (Riya, the director who upgraded to Org four weeks ago,
opens /admin Tuesday morning)

She opens /admin. The 0028 program pulse loads as usual. Under it,
the 0087 program-org-tier-card is gone (she upgraded). Under that,
ONE new card with a quiet orange accent: "Your program's drill
canon has emerged — 7 drills your coaches have thumbed up across
teams." Underneath: a tight list of the 7 drills with the coach-
count next to each one ("Closeout to recovery — 4 coaches" /
"2v1 transition trail — 3 coaches" / etc.) and the coach first
names of who thumbed each. Underneath: ONE primary button "Publish
as Hawks Basketball drill canon." Underneath: ONE secondary
button "Edit before publishing" that opens the canon editor where
she can uncheck any drill she does not want published OR add a
drill her gut says belongs (the editor is scoped to drills any
in-program coach has run, not the open universe). She taps the
primary button. The canon publishes. The card transforms into a
small "Hawks Basketball drill canon published — 7 drills.
Every new coach who joins the program now gets these on day
one." She does NOT need to do anything else. Two weeks later,
a new coach named Aisha joins the U8 (the kid she runs aged
into the program); Aisha's onboarding has the canon
pre-populated in her drill library — she sees a small banner on
her first /plans page: "7 drills from your Hawks Basketball
program's canon are in your library." Riya does not need to
tell Aisha what the program runs — the canon told her. On a
flaky network, the canon render is from the read route's
payload (no second round-trip); the publish POST is a single
write the director can retry if it fails.

### Growth

The "show me" moment is the canon ITSELF — the list of 7 drills
with the coach-counts and the named first names. That is a
screenshot the director sends to her assistant directors, to the
next director-in-her-league she meets at a meeting, to the
parent-board member who asked "what is SportsIQ doing for our
program." Three compoundings. (1) The director-to-director
compound — every published canon is a screenshot the director
shares; the 0077 cross-program director peer pulse already seeded
this acquisition shape, and the canon is the highest-quality
artifact for that surface to carry. (2) The on-platform-permanent
compound — every canon publish is a structural lift in the
program's on-platform asset base; the canon is the artifact that
makes the Org subscription pay for itself even at zero per-coach
activity, because the canon ALONE is worth the $49.99/mo. (3) The
inheritance-conversion compound — every new coach who inherits the
canon on day one is a coach whose activation curve is structurally
flatter than a coach landing with an empty library. The expected
free-to-paid conversion of inheriting coaches (they are on an
Org-tier program so they are themselves on the Org-tier subscription
by virtue of staff invite — but their personal-paid conversion if
they later leave the program is structurally higher because they
have a relationship with the platform from day one). Per the
strategy audit — "director-tier deepening; what's the second
director-tier feature that makes Org churn-proof?" This card is
exactly that surface, and the published canon is its receipt.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper `src/lib/program-drill-canon.ts` exports
  `computeProgramDrillCanon(args: { coachThumbRows: Array<{
  coach_id: string; coach_first_name: string; drill_id: string }>;
  drillRows: Array<{ id: string; name: string; sport_id: string;
  age_groups: string[] }>; minCoaches?: number; maxDrills?: number
  }): { drills: Array<{ drillId: string; drillName: string;
  coachCount: number; coachFirstNames: string[]; sport_id: string;
  age_groups: string[] }>; totalCoachesContributing: number }`. The
  helper: (a) groups `coachThumbRows` by `drill_id` and counts
  DISTINCT `coach_id`s per drill; (b) filters to drills with
  `coachCount >= minCoaches` (default 3); (c) sorts by
  `coachCount` descending, then by `drillName` ascending for
  determinism; (d) caps at `maxDrills` entries (default 10);
  (e) joins each entry to `drillRows` by `drill_id` to attach
  `drillName`, `sport_id`, `age_groups`; (f) sets
  `coachFirstNames` to the DISTINCT first names of contributing
  coaches, capped at 4 entries with oxford-comma join per
  LESSONS#0074 / #0087's posture; (g) returns the result.
  Pure function, reads no DB. Per LESSONS#0023 — instruct
  positively in jsdoc; never embed a verbatim ban-list. Per
  LESSONS#0061 — literal-space defensive surname scan on the
  first-name array. Per LESSONS#0070 — never mutate the input
  arrays. (vitest under `tests/lib/program-drill-canon.test.ts`
  — new): (i) empty `coachThumbRows` → empty drills; (ii) 2
  coaches thumbing the same drill → drill EXCLUDED (below
  threshold); (iii) 3 distinct coaches thumbing the same
  drill → drill INCLUDED with `coachCount: 3` and 3
  first names; (iv) one coach thumbing 4 drills + 2 others
  thumbing 1 each → the 4 drills are excluded individually
  (each has count 1) — affirms the DISTINCT-coach
  requirement, not the thumb-count requirement; (v)
  `minCoaches: 4` argument tightens the threshold; (vi) 15
  qualifying drills → returns the top 10 by coach count;
  (vii) tied coach counts → sorted alphabetically by drill
  name for determinism; (viii) the rendered first names
  are surname-stripped (literal-space defensive scan); (ix)
  no banned word in any rendered field.

- [ ] A new authed `GET /api/admin/program-drill-canon` route.
  Query params: `orgId: string`. The route: (a) validates the
  caller is a DIRECTOR on the org (the existing `coaches.role
  === 'admin'` check per LESSONS#0096 from 0087 — verify the
  actual check at pickup); (b) FAILS-CLOSED if the org is
  NOT on `tier: 'organization'` — returns
  `{ eligible: false, eligibilityReason: 'not_org_tier' }`;
  (c) reads ALL the org's coaches via the existing
  `team_coaches` + `coaches` join (per LESSONS#0057);
  (d) reads the union of `drill_thumbs` rows (the existing
  0039 cross-team drill-thumb table — read at pickup per
  LESSONS#0096) for those coach_ids with a narrow `.select()`
  allow-list (`coach_id`, `drill_id` ONLY); (e) reads
  `drills.id`, `.name`, `.sport_id`, `.age_groups` for the
  distinct drill_ids; (f) calls `computeProgramDrillCanon`;
  (g) if the returned drills array is empty, returns
  `{ eligible: false, eligibilityReason:
  'too_few_drills_meeting_threshold' }`; (h) otherwise
  returns `{ eligible: true, drills,
  totalCoachesInProgram }`; (i) reads the existing
  `program_drill_canon` rows for the org and if the most
  recent publish is within 90 days, returns the existing
  publish state alongside (the card renders the "already
  published" variant rather than the "publish now" variant).
  Per AGENTS.md rule 3 — `createServiceSupabase()`. Per
  LESSONS#0036 — narrow `.select()` allow-lists; NEVER
  reads `coaches.email`, `coaches.phone`,
  `coaches.full_name` surname, `players.*`. Per
  LESSONS#0049 / #0092 / #0100 / #0110 — at pickup Glob
  `tests/api/admin*.test.ts` AND `tests/api/program*.test.ts`
  AND `tests/api/director*.test.ts` AND extend every
  `mockReturnValueOnce` queue (per LESSONS#0116 — document
  empty-Glob no-op if no matches; per LESSONS#0071 — verify
  the actual repo's test-file naming pattern before
  promising a sweep). Per LESSONS#0057 — `team_coaches`,
  not `teams.coach_id`. Per LESSONS#0080 — filter-aware
  fixtures on chain mocks for `.in()` reads. Per
  LESSONS#0083 — the membership check must mirror the
  REAL SQL filter semantics; a stale mock that returns a
  team object regardless of org_id filter is a false
  positive. Per LESSONS#0118 — broaden any strict-
  whitelist sibling mocks for the new
  `drill_thumbs` / `drills` / `program_drill_canon`
  reads. (vitest under
  `tests/api/admin-program-drill-canon.test.ts` — new):
  (i) free-tier org → `eligible: false,
  eligibilityReason: 'not_org_tier'`; (ii) Coach-tier
  org → same; (iii) Org-tier org with 0 thumbs →
  `eligible: false, eligibilityReason:
  'too_few_drills_meeting_threshold'`; (iv) Org-tier org
  with 7 qualifying drills → eligible with 7 entries,
  named first names per drill; (v) the response is
  BYTE-IDENTICAL across the matrix (additive only); (vi)
  an unauthed caller → 401; (vii) a non-director caller
  → 403; (viii) a cross-org caller (caller's org_id !=
  query orgId) → 403; (ix) planted email / phone / DOB
  on every joined coach row are NEVER read; (x) when a
  canon was published in the last 90 days, the response
  carries the existing publish state.

- [ ] A new authed `POST /api/admin/program-drill-canon/publish`
  route. Body: `{ orgId: string; drillIds: string[] }`. The
  route: (a) validates the caller is a director on the org
  (same check as the GET); (b) FAILS-CLOSED if the org is
  not on `tier: 'organization'` → 403; (c) validates every
  `drillId` resolves to a real drill the org's coaches
  have thumbed (i.e. each drill_id is in the GET's
  computed canon — defense against a director publishing
  a drill no one in the program ran); (d) writes ONE
  `program_drill_canon` row with `(org_id, published_by_
  coach_id, drill_ids: jsonb[], published_at: NOW(),
  superseded_at: null)`; (e) sets the
  `superseded_at` on any prior unsuperseded canon for
  the same org (a director can re-publish; the old
  canon is preserved for audit but no longer the
  active one). Per AGENTS.md rule 3 — service-role write.
  Per LESSONS#0044 — auth + director-role gate
  load-bearing. Per LESSONS#0072 — never mutate a
  DB-read row. (vitest under
  `tests/api/admin-program-drill-canon-publish.test.ts`
  — new): (i) director on Org-tier org → publish
  succeeds; (ii) re-publish supersedes prior canon
  (one active at a time); (iii) drillId not in the
  eligible canon set → 400 (defensive); (iv) non-
  director caller → 403; (v) Coach-tier org → 403;
  (vi) unauthed → 401; (vii) the inserted row
  carries the publishing coach_id correctly.

- [ ] A new migration
  `supabase/migrations/075_program_drill_canon.sql` adds
  the table. Per LESSONS#0006 — confirm `075` is the next
  free integer at pickup (0088 ships `073`, 0089 ships
  `074`). Schema: `(id UUID PRIMARY KEY DEFAULT
  gen_random_uuid(), org_id UUID NOT NULL REFERENCES
  organizations(id) ON DELETE CASCADE, published_by_coach_id
  UUID NOT NULL REFERENCES coaches(id) ON DELETE SET NULL,
  drill_ids JSONB NOT NULL, published_at TIMESTAMPTZ NOT
  NULL DEFAULT NOW(), superseded_at TIMESTAMPTZ)`. The
  `drill_ids` is JSONB carrying an array of UUID strings
  (jsonb-quoted per LESSONS#0085 if you ever seed it).
  Index: `(org_id, superseded_at)` for the
  "most-recent-active canon for this org" lookup. Per
  LESSONS#0087 — NO `WHERE NOW()` partial index. Per
  LESSONS#0088 — strip `--` comments before banned-token
  sweep. Per LESSONS#0094 — service-role GRANT block in
  the same migration. NO descriptive minor field. The
  table's header comment NAMES the COPPA boundary it does
  not cross ("no player data, only drill ids and
  organizational metadata"). (vitest under
  `tests/migrations/075-program-drill-canon.test.ts` —
  new): scan migration body with `--` stripped; column
  allow-list; foreign-key shape; index shape (no
  WHERE NOW() partial); service-role GRANT block
  present; NO new column on any sacred table.

- [ ] A new client component
  `src/components/admin/program-drill-canon-card.tsx`.
  Renders on /admin (the existing mount point — read at
  pickup per LESSONS#0096; the 0087
  `<ProgramOrgTierCard />` is the closest reference). The
  card: (a) renders ONLY when the route returns
  `eligible: true` (silence beats nag); (b) has a quiet
  orange accent matching the existing
  `<ProgramOrgTierCard />` aesthetic (zinc-950 +
  #F97316); (c) headline: "Your program's drill canon has
  emerged"; (d) body: a tight list of up to 10 drills
  with `drillName` + `coachCount` + first-name list per
  drill; (e) ONE primary button "Publish as <Org name>
  drill canon" that POSTs the publish route with all
  drill_ids checked by default; (f) ONE secondary
  button "Edit before publishing" that opens a small
  editor overlay (within the same card) where the
  director can uncheck individual drills; (g) when the
  route returns the already-published state, render
  the "Published — <N> drills in canon — every new
  coach inherits them" variant with a small "Re-
  evaluate next month" secondary button (no immediate
  re-publish CTA — the canon is once-a-season-ish);
  (h) `data-testid="program-drill-canon-card"` for
  scoped e2e per LESSONS#0029 / #0082. Per AGENTS.md
  voice — NO banned word; per LESSONS#0023 — instruct
  positively in jsdoc. Per LESSONS#0065 / #0066 /
  #0162 — smallest possible touch on the director
  surface. (vitest under
  `tests/components/program-drill-canon-card.test.tsx`
  — new): (i) `eligible: false` → card ABSENT;
  (ii) eligible with 7 drills → renders all 7 with
  named first names; (iii) tapping "Publish" POSTs
  to publish route with all drillIds; (iv) tapping
  "Edit before publishing" reveals the editor;
  (v) unchecking a drill removes it from the
  publish POST payload; (vi) already-published
  state renders the "Published — N drills"
  variant; (vii) NO banned word across every
  fixture variant.

- [ ] Extend the existing first-time onboarding flow
  for a NEW coach joining an Org-tier program (the
  staff-invite landing flow — verify the exact path
  at pickup per LESSONS#0096; the 0024 ticket's
  shipped flow is the reference; the actual route is
  likely `src/app/api/auth/configure-team/route.ts`
  per LESSONS#0086's reconciliation or a sibling
  `accept-invite` route). The extension: AFTER the
  new coach's `team_coaches` row is written, the
  route reads the org's most recent unsuperseded
  `program_drill_canon` row; for each `drill_id` in
  the canon, the route writes a `drill_thumbs` row
  for the new coach (the existing 0039 cross-team
  thumb persistence) — the inheritance edge. Per
  LESSONS#0072 — never mutate the DB-read canon row.
  Per LESSONS#0103 — additive widening; if the org
  has no canon, the existing onboarding behavior is
  BYTE-IDENTICAL. (vitest under
  `tests/api/auth-staff-invite-canon-inherit.test.ts`
  — new): (i) coach joining a non-Org-tier program
  → no canon inheritance (BYTE-IDENTICAL to today);
  (ii) coach joining an Org-tier program WITHOUT a
  published canon → no inheritance (the canon
  doesn't exist); (iii) coach joining an Org-tier
  program WITH a 7-drill canon → 7 `drill_thumbs`
  rows are written for the new coach; (iv) coach
  who ALREADY has a drill_thumbs row for a
  canon-included drill is NOT double-written (the
  insert uses ON CONFLICT DO NOTHING per the
  existing 0039 idempotent pattern); (v) the
  inheritance is SILENT — no email, no
  notification; the coach discovers the inherited
  drills the next time they open /plans.

- [ ] A small banner on /plans for any coach who has
  inherited from a canon in the LAST 14 days: "<N>
  drills from your <Org name> program's canon are in
  your library" with NO CTA — just a quiet
  zinc-500 line. The banner is dismissible (writes
  a `coach_first_signal_celebrations` row with
  `kind: 'program_canon_inherited'` per the 0088 /
  0089 dedup primitive — the dedup table's CHECK
  enum is widened in this migration to include the
  new kind). Per LESSONS#0009 / #0054 — widen the
  CHECK constraint on the 0088 table in this
  migration too (DROP + ADD pattern). Per AGENTS.md
  voice — no banned word. (vitest under
  `tests/components/program-canon-inherited-banner.test.tsx`
  — new): (i) coach with no inheritance → banner
  ABSENT; (ii) coach with inheritance in last 14
  days AND no dismissal → banner PRESENT with the
  named program AND drill count; (iii) tapping
  "Got it" POSTs the dismiss and hides the banner;
  (iv) coach with inheritance 30 days ago → banner
  ABSENT (window past); (v) NO banned word.

- [ ] Tier / feature gating: the canon SURFACES (GET,
  publish, inheritance, banner) are server-gated to
  `tier === 'organization'` AND
  `subscription_status IN ('active', 'past_due',
  'trialing')`. A free / Coach / Pro org gets
  `eligible: false`. A churned Org-tier org's
  PUBLISHED canon is preserved (existing
  `program_drill_canon` rows are not deleted) but
  the publish CTA is gated off. A new coach
  inheritance ONLY fires on a live Org-tier org
  (per the same status check). NO new tier feature
  key — the existing `organization` tier in
  `src/lib/tier.ts` is the load-bearing gate. The
  `TIER_LIMITS` numbers are BYTE-IDENTICAL. The
  `<UpgradeGate>` placements are BYTE-IDENTICAL.
  (vitest: matrix the GET / POST / inheritance /
  banner across {free, coach, pro_coach,
  organization-active, organization-canceled} ×
  {director, non-director} and assert the gate
  fires as documented.)

- [ ] Privacy / COPPA contract: the route reads ONLY
  `coaches.id`, `coaches.first_name` (split off
  `full_name`), `coaches.org_id`, `coaches.role`,
  `organizations.id` / `.name` / `.tier` /
  `.subscription_status`, the existing
  `team_coaches` join, the existing `drill_thumbs`
  table (`coach_id`, `drill_id`), the existing
  `drills` table (`id`, `name`, `sport_id`,
  `age_groups`). NEVER reads `coaches.email`,
  `coaches.phone`, `coaches.full_name` surname,
  `players.*`, `players.parent_email`,
  `players.dob`. The rendered card NEVER shows a
  surname (first name only); NEVER shows a player's
  name; NEVER shows a coach's email; NEVER shows
  any of the program's internal billing data
  (stripe_customer_id, stripe_subscription_id,
  invoice numbers). The drill names are the
  existing PUBLIC drill names from the seeded
  `drills` table — no kid-derived custom drill
  names ride along (a defensive scan in tests).
  Per LESSONS#0036 / #0070 — `.select()`
  allow-lists; never mutate the DB row. Per
  LESSONS#0061 / #0063 — literal-space + shape-
  scoped defensive scans on rendered fixtures.
  (vitest: planted email / phone / DOB / parent
  message / minor name on every joined row are
  NEVER read; the rendered text passes the
  surname / minor-field / jersey-shape regex
  sweep; planted "Maya Walker - 2014 birthday"
  custom drill name fails the minor-name scan.)

- [ ] Voice contract: every rendered user-facing
  string (the card headline, the per-drill line,
  the primary / secondary button labels, the
  editor overlay copy, the published-state
  variant, the inheritance banner) contains NO
  AGENTS.md banned word per LESSONS#0023.
  Instruct positively in every helper / component
  jsdoc; never embed a verbatim ban-list per
  LESSONS#0023 / #0034 / #0088. Anti-AI-slop
  defensive list specific to this surface:
  ["powered by AI", "smart canon", "intelligent
  library", "your coaches' brilliance",
  "incredible"]. (vitest: render every drill /
  count / inheritance fixture variant and scan.)

- [ ] Regression: the existing 0087 program-
  org-tier card render is BYTE-IDENTICAL (the
  director who has not yet seen the canon card
  sees the same UI as today). The existing
  `coach_first_signal_celebrations` table (0088)
  is BYTE-IDENTICAL apart from the widened CHECK
  enum (additive per LESSONS#0103 / #0054). The
  existing staff-invite onboarding flow is
  BYTE-IDENTICAL for non-Org-tier programs (the
  inheritance edge fires ONLY when an Org-tier
  canon exists). The existing /plans surface
  for a coach who has no inheritance is
  BYTE-IDENTICAL (the banner is absent). The
  Stripe webhook is BYTE-IDENTICAL. The 0035
  resume primitive is BYTE-IDENTICAL. (vitest:
  snapshot the director surface, the
  staff-invite route, the /plans page pre- and
  post-change with planted fixtures.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — pre-mint the existing E2E
  org-tier org (0087 already seeds this) with
  at least 3 ADDITIONAL coaches (`auth.users` +
  `coaches` rows in the same idempotent block
  per LESSONS#0084) all on the same org, each
  with deterministic first names per
  LESSONS#0079 ("Maya", "James", "Lin"); pre-mint
  `drill_thumbs` rows so that 3 distinct coaches
  thumbed the same 4 drills (qualifying canon).
  UUIDs in the next free range per LESSONS#0101;
  jsonb seed values quoted per LESSONS#0085. Per
  LESSONS#0094 — service-role GRANTs in the new
  migration cover the new table. Playwright
  spec: (a) sign in as the seeded director, (b)
  navigate to /admin, (c) assert the canon card
  renders scoped by data-testid AND lists the 4
  qualifying drills AND the named first names,
  (d) tap "Publish as <org name> drill canon",
  assert the publish POST succeeds AND the card
  transforms into the published state, (e) sign
  out and sign in as a NEW seeded coach who
  joined the Org via staff-invite (pre-mint the
  invite + acceptance per the 0024 / 0086 seed
  posture), (f) navigate to /plans, assert the
  inheritance banner renders scoped by
  data-testid AND names the 4 inherited drills
  AND the org name, (g) tap "Got it" and assert
  the banner dismisses, (h) assert NO seeded
  player name / email / phone appears anywhere
  in the rendered card or banner per
  LESSONS#0029 / #0082. Scope every assertion by
  data-testid. Skip when E2E creds are unset.

## Out of scope

- A SHARED canon edit flow where multiple directors
  collaboratively curate the canon. v1 is one
  director publishes; multi-director programs can
  have either director publish.
- A CANON for non-Org-tier programs. v1 is Org-
  tier only; the canon is the Org-tier deepening
  artifact specifically.
- A CROSS-PROGRAM canon (e.g. "drills the U10 at
  Hawks AND the U10 at Hornets both run"). v1 is
  single-program scope; cross-program canon is a
  separate ticket with a higher privacy bar.
- An AI-curated canon (LLM picks which drills
  belong). v1 is deterministic aggregation; the
  threshold is the structural truth.
- A LEADERBOARD of "programs with the biggest
  drill canon." v1 surfaces only the caller's
  own state.
- A push notification when the canon
  publishes. v1 is passive — the new coach
  discovers the inheritance on /plans.
- An EXPORT of the canon to a third-party
  format (PDF, CSV). v1 lives on-platform
  only; export would be a separate ticket.
- A CHANGE to the underlying `drill_thumbs`
  schema. v1 reads existing data only.
- A CHANGE to the drill primitives (drill
  description, video, etc.). v1 reuses the
  existing drill row shape exactly.
- A SUBSCRIPTION-IMPACT side effect — the canon
  publishing does NOT change the org's Stripe
  state. v1's "churn-proof" thesis is
  user-side switching cost, not platform-side
  billing change.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/program-drill-canon.ts` (new) — pure
  helper. Mirrors the shape of
  `src/lib/program-tier-state.ts` (0087),
  `src/lib/coach-reputation-utils.ts` (0073). Per
  LESSONS#0061 — literal-space defensive scan;
  per LESSONS#0023 — positive voice.
- `src/app/api/admin/program-drill-canon/route.ts`
  (new) — `GET(request)` authed; director-only.
  Per LESSONS#0096 — at pickup verify the actual
  `drill_thumbs` table shape (the 0039 ticket
  shipped the cross-team thumb persistence; the
  exact column names are the schema's truth).
- `src/app/api/admin/program-drill-canon/publish/route.ts`
  (new) — `POST(request)` authed; director-only.
- `src/components/admin/program-drill-canon-card.tsx`
  (new). Per LESSONS#0029 / #0082 — `data-testid`
  scoping. Per LESSONS#0065 / #0066 / #0162 —
  smallest possible touch on the director surface.
- `src/components/plans/program-canon-inherited-banner.tsx`
  (new). Mounted on the /plans surface.
- `src/app/(dashboard)/admin/page.tsx` (existing —
  read first per LESSONS#0096) — ONE import + ONE
  JSX mount of the new canon card UNDER the
  existing 0087 program-org-tier-card.
- `src/app/(dashboard)/plans/page.tsx` (existing —
  read first per LESSONS#0096) — ONE import + ONE
  JSX mount of the inheritance banner near the top.
- Existing staff-invite route (verify at pickup —
  candidates: `src/app/api/auth/accept-invite/route.ts`,
  `src/app/api/auth/configure-team/route.ts`,
  the existing 0024 shipped path) — extend to
  write `drill_thumbs` rows from the org's active
  canon on team-coach insertion. Per LESSONS#0086 —
  the actual create-team / configure-team flow is
  the reference. Per LESSONS#0103 — additive
  widening; the existing flow is BYTE-IDENTICAL
  for non-Org-tier programs.
- `supabase/migrations/075_program_drill_canon.sql`
  (new). Per LESSONS#0006 — confirm `075` at
  pickup. Per LESSONS#0085 — JSONB schema for
  drill_ids. Per LESSONS#0087 — no `WHERE NOW()`
  partial index. Per LESSONS#0088 — strip `--`
  comments before banned-token sweep. Per
  LESSONS#0094 — service-role GRANTs in the same
  migration. ALSO in this migration: DROP + ADD
  the CHECK constraint on
  `coach_first_signal_celebrations` (from 0088) to
  add `'program_canon_inherited'` to the kind enum
  per LESSONS#0054.
- `src/types/database.ts` — add `ProgramDrillCanon`
  type. NO field on existing types.
- `src/lib/tier.ts` — NO change. NO new feature
  key.
- `tests/lib/program-drill-canon.test.ts` (new).
- `tests/api/admin-program-drill-canon.test.ts` (new).
- `tests/api/admin-program-drill-canon-publish.test.ts`
  (new).
- `tests/components/program-drill-canon-card.test.tsx`
  (new).
- `tests/components/program-canon-inherited-banner.test.tsx`
  (new).
- `tests/api/auth-staff-invite-canon-inherit.test.ts`
  (new).
- `tests/migrations/075-program-drill-canon.test.ts`
  (new).
- `tests/e2e/program-drill-canon-flow.spec.ts` (new).
  Seed extension per the AC. UUIDs in the next
  free range per LESSONS#0101. Skip when E2E creds
  are unset.
- New deps: NO. Migration: YES (075 or bump per
  LESSONS#0006). Env vars: NO. AI prompt change:
  NO. Tier feature key: NO new key.
- LESSONS to anchor: #0006 (migration prefix
  uniqueness), #0009 / #0054 (CHECK-constraint
  widen on existing enum), #0021 / #0023 (positive
  voice, no embedded ban-lists), #0029 / #0082
  (data-testid scoping), #0034 / #0067 / #0088
  (strip `--` comments AND structural identifier
  whitelisting on banned-word scan), #0036
  (`.select()` allow-lists), #0039
  (organizations.tier not plan; drill_thumbs is
  the existing cross-team persistence — read the
  actual table shape), #0044 (subscription-status
  + role gate load-bearing), #0049 / #0064 /
  #0092 / #0100 / #0110 (mock queue sweeps
  including cross-file sweeps), #0057
  (team_coaches not teams.coach_id), #0061 /
  #0063 (literal-space + shape-scoped defensive
  scans), #0065 / #0066 / #0162 (smallest touch
  on director surface + plans page), #0066
  (widen existing select), #0070 / #0072 (no
  DB-row mutate), #0079 (deterministic seeded
  first names), #0080 (filter-aware chain
  mocks), #0083 (mock semantics must mirror SQL
  filter for membership checks), #0084 / #0101
  (seed posture), #0085 (jsonb seed values),
  #0086 (staff-invite + create-team / configure-
  team posture reference), #0087 (no WHERE
  NOW() partial index; the director-role
  check is `role === 'admin'`, not
  `is_admin`), #0094 (service-role GRANTs in
  migrations), #0096 (schema wins over prose —
  at pickup read the actual drill_thumbs table,
  the actual staff-invite route, the actual
  director-surface mount point, the actual
  director-role check), #0103 (additive widening),
  #0116 (empty-Glob no-op), #0118 (broaden
  strict-whitelist mocks),
  STRATEGY_AUDIT_2026-06-15.md (director-tier
  deepening — the second director-tier feature
  that makes Org churn-proof).

Depends on: 0024 (shipped — director staff invite,
the surface the new-coach inheritance hooks into),
0028 (shipped — program pulse, the surface the
canon card mounts on), 0039 (shipped — cross-team
drill thumbs, the underlying signal the canon
aggregates), 0044 (shipped — drill-sequence
network, sibling drill-discovery surface), 0064
(shipped — drill clone publishing, sibling
cross-coach drill artifact), 0073 / 0076 (shipped
— coach reputation milestones, the sibling
recognition surfaces), 0087 (shipped — the
Org-tier upgrade moment this surface follows),
0088 (this batch — the `coach_first_signal_
celebrations` table whose CHECK enum is
extended; if 0088 has not shipped by pickup, the
dev creates BOTH migrations and notes the
ordering in the Implementation log per
LESSONS#0096), 0089 (this batch — the dedup
table is the same, two ordering matters).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0090-...` opened
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
