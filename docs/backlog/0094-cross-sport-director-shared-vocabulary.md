---
id: 0094
title: When an Org-tier program director runs TWO sports in the same season (basketball + volleyball, soccer + flag football) and 2+ of their coaches across the two sports have thumbed up drills that share the same underlying SKILL TAG (closeout, transition, spacing, ball control), surface ONE quiet line on /admin naming the shared cross-sport vocabulary — "your basketball U10 and your volleyball U12 are both working on spacing this week — Coach Aisha and Coach Marco have thumbed up 4 spacing drills between them" — so the cross-sport director moat (a primitive only SportsIQ can produce because only SportsIQ has the structured skill graph that crosses sport boundaries) becomes visible and the multi-sport director's renewal is anchored to an insight no single-sport tool can match
status: groomed
priority: P1
area: analytics
created: 2026-06-20
owner: product-groomer
---

## User story

As a program director who runs Hawks Athletic — a small multi-sport program
with a U10 basketball team in winter, a U12 volleyball team that overlaps
in late fall, and a U8 soccer team in spring — and who took the
Organization-tier upgrade via 0087 four months ago because SportsIQ's
director surface finally named what was happening across my coaches — I
want, the next time I open /admin during a stretch where two of my sports
are live at the same time, ONE quiet card under the existing program pulse
that says: "Your basketball U10 and your volleyball U12 are both working
on spacing this week — Coach Aisha (basketball) and Coach Marco
(volleyball) have thumbed up 4 spacing drills between them: 'Three-line
spacing on baseline,' 'Cone gap holds,' '2-3 zone gap reads,' 'Wall
spacing on serve receive.' Both of your sports share a vocabulary your
coaches are converging on." — with NO upgrade CTA, NO published artifact,
NO push to publish — just the receipt that the cross-sport vocabulary the
program has been quietly building is visible to me, the director who runs
both sports, so I can name it to Aisha and Marco the next time I see them
in the gym ("you and Marco are on the same page this week — both on
spacing"), and so I can show my program board the screenshot at the next
quarterly meeting as proof that the SportsIQ subscription is producing
the cross-sport coaching intelligence no single-sport tool can.

## Why now (four lenses)

### Product Owner

Tickets 0071 / 0075 / 0077 / 0091 shipped the cross-coach / cross-program
/ cross-sport convergence surfaces — but every one of them lives WITHIN a
single sport. The 0091 ship explicitly named "sport-wide convergence" as
the next-axis moat. What the product does NOT have is the CROSS-SPORT
edge — the surface that fires when a single director's TWO sports are
converging on a shared skill vocabulary. The smallest meaningful unit of
value is: (a) a new pure helper
`findCrossSportSkillConvergence({ programCoaches, drillThumbs, drills,
skillTagMap, minThumbsPerSport, lookbackDays })` that takes the program's
coach roster split by sport, the thumb signals filtered to the lookback
window, the drill metadata with the existing `drills.skill_tags` array
(read at pickup per LESSONS#0096 — verify the actual column name from
the seeded drill schema), and the underlying skill-tag map (a small
seeded normalization table that says "closeout" in basketball maps to
the same SKILL TAG as "closeout" in volleyball; "spacing" in basketball
maps to "spacing" in volleyball; the map is hand-curated and small —
roughly 12 skill tags — and ships as a seeded JSON in
`src/data/cross-sport-skill-tags.json` per LESSONS#0066's posture of
"data file over new table when the cardinality is < 50"); the helper
returns the cross-sport skills where 2+ thumbs from 2+ DIFFERENT
SPORTS exist; (b) a new authed
`GET /api/admin/cross-sport-convergence?orgId=<uuid>` route returning
`{ eligible: boolean; convergences: Array<{ skillTag: string;
skillLabel: string; sports: Array<{ sport_id: string; sport_name:
string; coachFirstName: string; teamName: string; ageGroup: string;
thumbCount: number; drillNames: string[] }>; totalDrills: number }>;
eligibilityReason?: 'not_org_tier' | 'single_sport_program' |
'no_cross_sport_convergence' }`; (c) a new client component
`<CrossSportConvergenceCard />` mounted on /admin (the existing director
surface — the same mount point as the 0087 program-org-tier card and
the 0090 program-drill-canon card) that renders ONLY when the route
returns at least one convergence; (d) the card surfaces ONE convergence
at a time (the top one by total thumbs across sports); if more than
one convergence exists, a small "View 2 more convergences" link
expands to a list. NO new AI call. NO new persistence (the helper is
deterministic aggregation over existing tables + a small seeded JSON
map). NO change to the existing `drills.skill_tags` schema. NO new
tier feature key.

### Stakeholder

This is the moat-deepening primitive that finally activates the
CROSS-SPORT director axis the strategy log keeps surfacing as the
next-notch beyond 0091's cross-program / cross-region convergence:
"the CROSS-SPORT director who runs basketball AND volleyball
programs and the moat at that boundary." Three compoundings, each
structurally impossible for a single-sport competitor to replicate
even if they wanted to. (1) The cross-sport-vocabulary compound — the
surface that names "spacing" as the shared skill across basketball
and volleyball requires (a) a normalized skill-tag map across sports,
(b) the program-scoped roster split by sport (via `teams.sport_id`
and the existing 0024 staff-invite), and (c) the cross-team drill-thumb
persistence (via the 0039 / 0090 reconciled `coach_drill_signals`).
Hudl is volleyball OR basketball, never both with a unified vocabulary.
TeamSnap has no skill primitive at all. GameChanger is baseball-
centric. The cross-sport convergence is a screenshot only SportsIQ
can produce because only SportsIQ has the structured skill-tag graph
that spans sports. (2) The multi-sport-director-retention compound —
a director who runs two sports on SportsIQ has structurally higher
LTV than a single-sport director because their Org subscription
covers MORE coaches AND because the cross-sport insight is a unique
deliverable to their program board. The expected Org-tier churn on
multi-sport programs that have seen this surface is structurally
lower than on multi-sport programs that have not. (3) The cross-
sport-cross-program compound — once a multi-sport program has this
surface live, the 0077 director peer-pulse surface naturally
extends to "another multi-sport director in your region is working
the same shared vocabulary," widening the moat one more notch. Per
the strategy log — "the CROSS-SPORT director who runs basketball
AND volleyball programs and the moat at that boundary" — this is
exactly that axis, and the card is its load-bearing artifact.

### User (Priya, the Hawks Athletic director, opens /admin on a
Friday afternoon in late November)

She opens /admin. The 0028 program pulse loads at the top as
usual. Under it, the 0091 sport-wide convergence card (basketball
only — fired this week). Under that, the 0090 program-drill-canon
card (Hawks Basketball canon — published). Under that, ONE new
card with a quiet orange dot in the corner. The headline: "Your
basketball and volleyball are converging on spacing." Underneath:
two short blocks, one per sport — "Basketball U10 (Coach Aisha) —
2 thumbs on 'Three-line spacing on baseline' and '2-3 zone gap
reads.'" / "Volleyball U12 (Coach Marco) — 2 thumbs on 'Cone gap
holds' and 'Wall spacing on serve receive.'" Underneath: one
short line: "Both of your sports share a vocabulary your coaches
are converging on this week." NO primary CTA. NO publish button.
She reads it once. She closes the app. The next time she sees
Aisha in the gym, she says — "did you know Marco and his
volleyball kids are working on spacing this week too?" Aisha
laughs. Marco hears it from Aisha. The director's two coaching
silos become one conversation. Two months later, at the
quarterly program-board meeting, Priya shows the screenshot:
"SportsIQ named what we did this fall — our basketball and
volleyball teams were converging on shared skills. No other
tool tells us that." On a flaky board-room wifi, the card
renders from the /admin server payload (no second round-trip);
the computation is over the existing thumb signals plus the
small seeded JSON.

### Growth

The "show me" moment is the SPECIFIC named convergence — "your
basketball U10 and your volleyball U12 are both on spacing this
week." That is a screenshot Priya sends to her assistant
directors, to the multi-sport director at the neighboring
program she met at a regional director meeting, to the
program-board chair before the quarterly meeting, AND to the
volleyball-coaching forum she lurks on. Three compoundings.
(1) The cross-sport-director-to-cross-sport-director compound —
every multi-sport program is a high-leverage acquisition target
because they bring 2x the coaches AND 2x the parent footprint
of a single-sport program. The screenshot that lands in
another multi-sport director's inbox is a load-bearing
acquisition asset. (2) The single-sport-director-aspiration
compound — a single-sport director who sees this screenshot
on a forum or in a director meeting wonders: "what would this
look like if we added volleyball next year?" — the screenshot
becomes the structural argument for a single-sport program to
expand into multi-sport AND keep both on SportsIQ. (3) The
0091-sport-wide-extends-to-cross-sport compound — the 0091 ship
established the sport-wide convergence vocabulary; this card is
the cross-sport extension. Together they constitute the
"SportsIQ sees patterns no other tool sees" narrative the
strategy log has been building. Each cross-sport convergence is
a load-bearing testimonial for the multi-sport director cohort.
Per the strategy log — "the CROSS-SPORT director who runs
basketball AND volleyball programs and the moat at that
boundary" — this card is the load-bearing surface, and the
named convergence is its public artifact.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new seeded data file
  `src/data/cross-sport-skill-tags.json` (new) — a small
  hand-curated normalization map from per-sport drill skill tags
  to a unified cross-sport skill tag. Shape: `{ skillTag:
  string; skillLabel: string; sportTagAliases: Record<string,
  string[]> }[]`. Example entries: `{ skillTag: 'spacing',
  skillLabel: 'Spacing', sportTagAliases: { 'basketball':
  ['spacing', 'gap-reads', 'baseline-drift'], 'volleyball':
  ['serve-receive-spacing', 'gap-holds'], 'soccer':
  ['midfield-spacing', 'shape-holds'] } }`. The file ships
  with 10-15 entries covering the core shared skills across the
  4 supported sports (basketball, volleyball, soccer, flag
  football). Per LESSONS#0023 — instruct positively in the
  file header comment. Per LESSONS#0066 — data file beats new
  table when cardinality is < 50. (vitest under
  `tests/data/cross-sport-skill-tags.test.ts` — new): (i) the
  file parses as valid JSON; (ii) every entry has a unique
  `skillTag`; (iii) every `sportTagAliases` key is in the
  supported-sports allow-list ('basketball', 'volleyball',
  'soccer', 'flag_football'); (iv) every `skillLabel` is
  rendered-safe (no banned word, no emoji); (v) at minimum
  the entries include 'spacing', 'transition', 'closeout',
  'ball-control'.

- [ ] A new pure helper
  `src/lib/cross-sport-convergence.ts` exports
  `findCrossSportSkillConvergence(args: { programCoaches:
  Array<{ coach_id: string; coach_first_name: string;
  team_id: string; team_name: string; age_group: string;
  sport_id: string; sport_name: string }>;
  drillThumbs: Array<{ coach_id: string; drill_id: string;
  thumbed_at: string }>; drills: Array<{ id: string; name:
  string; sport_id: string; skill_tags: string[] }>;
  skillTagMap: typeof import('@/data/cross-sport-skill-tags.json');
  minThumbsPerSport?: number; minSports?: number;
  lookbackDays?: number; nowMs: number }):
  { convergences: Array<{ skillTag: string; skillLabel:
  string; sports: Array<{ sport_id: string; sport_name:
  string; coachFirstName: string; teamName: string;
  age_group: string; thumbCount: number; drillNames:
  string[] }>; totalDrills: number; totalThumbs: number
  }> }`. The helper: (a) filters `drillThumbs` to the
  lookback window (default 14 days from `nowMs`);
  (b) joins each thumb to its `drill` and to the
  thumbing `coach` from `programCoaches`; (c) for each
  thumb, maps the drill's per-sport skill_tags to the
  unified cross-sport skillTag via `skillTagMap`'s
  `sportTagAliases` lookup; (d) groups by unified
  `skillTag`; (e) within each group, splits by
  `sport_id` (the COACH's sport, derived from the
  thumbing coach's team) and keeps only skillTags with
  thumbs from `minSports` distinct sports (default 2);
  (f) within each sport, requires `minThumbsPerSport`
  thumbs (default 2); (g) returns the convergences
  sorted by `totalThumbs` descending, then by
  `skillLabel` ascending for determinism; (h) caps
  `drillNames` per sport at 3 entries with oxford-comma
  join per LESSONS#0074 / #0087's posture. Pure
  function, reads no DB. Per LESSONS#0023 — instruct
  positively in jsdoc. Per LESSONS#0061 — literal-
  space defensive scan on `coachFirstName` and
  `teamName` arrays. Per LESSONS#0070 — never mutate
  the input arrays. Per LESSONS#0115 — UTC posture on
  `thumbed_at`. (vitest under
  `tests/lib/cross-sport-convergence.test.ts` — new):
  (i) empty arrays → empty convergences; (ii) all
  thumbs in single sport → empty convergences;
  (iii) 2 thumbs in basketball + 2 thumbs in
  volleyball on the same unified skillTag → 1
  convergence; (iv) 2 thumbs in basketball + 1
  thumb in volleyball → empty (volleyball below
  threshold); (v) `minThumbsPerSport: 3` tightens
  the threshold; (vi) `minSports: 3` requires 3
  distinct sports; (vii) thumbs older than
  `lookbackDays` are ignored; (viii) two distinct
  drills in basketball with matching skill_tag
  resolves to the unified skillTag; (ix) tied
  totalThumbs sorted by skillLabel for determinism;
  (x) `drillNames` deduped + capped at 3 per
  sport; (xi) planted surname-shaped strings in
  coachFirstName are NOT consumed (the helper
  preserves the raw string; the component does
  the literal-space scan); (xii) no banned word
  in any rendered field; (xiii) a thumb on a
  drill whose `skill_tags` has NO alias in the
  map is silently dropped (not a thrown error).

- [ ] A new authed
  `GET /api/admin/cross-sport-convergence` route.
  Query params: `orgId: string`. The route: (a)
  validates the caller is a director on the org
  (`coaches.role === 'admin'` per LESSONS#0087);
  (b) FAILS-CLOSED if the org is NOT on
  `tier: 'organization'` AND
  `subscription_status IN ('active', 'past_due',
  'trialing')` — returns `{ eligible: false,
  eligibilityReason: 'not_org_tier' }`; (c) reads
  the org's coaches with their teams' `sport_id`
  and `sports.name` via the existing
  `team_coaches` + `teams` + `sports` join (per
  LESSONS#0057; verify the `sports` reference
  table at pickup per LESSONS#0096); (d)
  FAILS-CLOSED if the org has only ONE distinct
  `sport_id` across its teams — returns
  `{ eligible: false, eligibilityReason:
  'single_sport_program' }`; (e) reads the
  `coach_drill_signals` rows (the cross-team
  drill-thumb persistence reconciled per the
  0090 ship — read at pickup per LESSONS#0096)
  filtered by `rating = 'up'` and
  `coach_id IN (program coaches)` and
  `thumbed_at >= now - 14 days`; (f) reads
  `drills.id`, `.name`, `.sport_id`,
  `.skill_tags` for the distinct drill_ids;
  (g) reads the seeded skill-tag map; (h)
  calls `findCrossSportSkillConvergence`;
  (i) if the convergences array is empty,
  returns `{ eligible: false,
  eligibilityReason: 'no_cross_sport_convergence' }`;
  (j) otherwise returns
  `{ eligible: true, convergences }`. Per
  AGENTS.md rule 3 — `createServiceSupabase()`.
  Per LESSONS#0036 — narrow `.select()`
  allow-lists; NEVER reads `coaches.email`,
  `coaches.phone`, `coaches.full_name` surname,
  `players.*`. Per LESSONS#0044 —
  subscription-status + role gate load-bearing.
  Per LESSONS#0049 / #0092 / #0100 / #0110 —
  at pickup Glob `tests/api/admin*.test.ts`
  AND extend every `mockReturnValueOnce`
  queue (per LESSONS#0116 — document empty-
  Glob no-op). Per LESSONS#0057 —
  `team_coaches`, not `teams.coach_id`. Per
  LESSONS#0080 — filter-aware fixtures on
  chain mocks for `.in()` reads on
  coach_ids. Per LESSONS#0083 — the
  membership check must mirror the REAL SQL
  filter semantics. Per LESSONS#0118 —
  broaden any strict-whitelist sibling
  mocks for the new `coach_drill_signals`
  / `drills` / `sports` reads. (vitest
  under
  `tests/api/admin-cross-sport-convergence.test.ts`
  — new): (i) free-tier org →
  `eligible: false, eligibilityReason:
  'not_org_tier'`; (ii) Coach-tier org →
  same; (iii) Org-tier single-sport
  program (only basketball teams) →
  `eligible: false, eligibilityReason:
  'single_sport_program'`; (iv) Org-tier
  multi-sport program with 0 cross-sport
  thumbs → `eligible: false,
  eligibilityReason: 'no_cross_sport_convergence'`;
  (v) Org-tier multi-sport program with
  basketball + volleyball thumbs
  converging on 'spacing' → eligible
  payload with 1 convergence, named
  coaches per sport, named drill names
  per sport; (vi) unauthed → 401;
  (vii) non-director caller → 403;
  (viii) cross-org caller → 403;
  (ix) planted email / phone / DOB on
  every joined coach row are NEVER read;
  (x) response shape is BYTE-IDENTICAL
  across the matrix (additive only).

- [ ] A new client component
  `src/components/admin/cross-sport-convergence-card.tsx`.
  Renders on /admin (the existing director
  surface — read at pickup per LESSONS#0096;
  the 0087 / 0090 / 0091 cards are the closest
  references). The card: (a) renders ONLY when
  the route returns `eligible: true` AND at
  least one convergence; (b) has a quiet
  orange dot accent in the corner — NOT a sales
  CTA; (c) headline: "Your <Sport1> and
  <Sport2> are converging on <skillLabel>"
  (the top-by-totalThumbs convergence is the
  one named in the headline); (d) body: ONE
  block per sport in the top convergence
  containing "<Sport name> <ageGroup> (Coach
  <FirstName>) — <N> thumbs on <oxford-comma
  drill names>"; (e) one short closing line:
  "Both of your sports share a vocabulary
  your coaches are converging on this week.";
  (f) when more than one convergence exists,
  a small zinc-500 expand link "View <N> more
  shared skills" that reveals the secondary
  convergences as a tight list (silence
  beats nag — primary is one convergence,
  more behind a tap); (g) NO primary CTA, NO
  publish button, NO upgrade prompt; (h)
  `data-testid="cross-sport-convergence-card"`
  for scoped e2e per LESSONS#0029 / #0082.
  Per AGENTS.md voice — NO banned word in
  any rendered string. Per LESSONS#0023 —
  instruct positively in jsdoc; never embed
  a verbatim ban-list. Per LESSONS#0065 /
  #0066 / #0162 — smallest possible touch
  on the director surface. (vitest under
  `tests/components/cross-sport-convergence-card.test.tsx`
  — new): (i) `eligible: false` → card
  ABSENT; (ii) eligible with 1 convergence
  (basketball + volleyball, spacing) →
  renders headline with named sports and
  skillLabel; (iii) renders one block per
  sport with named coach first name AND
  drill names; (iv) eligible with 3
  convergences → renders top one in
  primary view AND the expand link "View 2
  more"; (v) tap expand link → renders the
  secondary 2 convergences below; (vi) NO
  primary CTA / upgrade / publish button
  rendered (defensive querySelectorAll for
  `[data-cta="primary"]` returns 0); (vii)
  NO banned word across every convergence /
  skill / sport / coach fixture variant;
  (viii) the rendered text passes the
  surname / minor-field / jersey-shape
  regex sweep per LESSONS#0061 / #0063.

- [ ] Tier / feature gating: the cross-sport
  convergence card is SERVER-gated to
  `tier === 'organization'` AND
  `subscription_status IN ('active',
  'past_due', 'trialing')`. A free / Coach /
  Pro org gets `eligible: false`. A churned
  Org-tier org gets `eligible: false` even if
  their teams have qualifying thumbs. NO new
  tier feature key — the existing
  `organization` tier in `src/lib/tier.ts` is
  the load-bearing gate. The `TIER_LIMITS`
  numbers are BYTE-IDENTICAL. The
  `<UpgradeGate>` placements are BYTE-IDENTICAL.
  (vitest: free / Coach / Pro org → eligible:
  false; Org-tier active multi-sport program
  with qualifying thumbs → eligible: true;
  Org-tier canceled → eligible: false; Org-
  tier single-sport program → eligible:
  false with the single-sport reason.)

- [ ] Privacy / COPPA contract: the route
  reads ONLY `coaches.id`, `coaches.org_id`,
  `coaches.role`, `coaches.full_name`
  (first-name split-off per LESSONS#0061 /
  #0087), the existing `team_coaches` join,
  `teams.id` + `.name` + `.sport_id` +
  `.age_group`, the existing `sports.id` +
  `.name`, the existing `organizations.id`
  + `.name` + `.tier` + `.subscription_status`,
  the existing `coach_drill_signals.coach_id`
  + `.drill_id` + `.rating` + `.thumbed_at`,
  the existing `drills.id` + `.name` +
  `.sport_id` + `.skill_tags`, and the
  seeded `src/data/cross-sport-skill-tags.json`.
  NEVER reads `coaches.email`,
  `coaches.phone`, `coaches.full_name`
  surname, `players.*`, `players.parent_email`,
  `players.dob`. The rendered card NEVER
  shows a surname (first name only); NEVER
  shows a player's name; NEVER shows an
  email; NEVER shows raw drill ids; NEVER
  shows any of the program's internal
  billing data. The drill names rendered
  are the existing PUBLIC drill names from
  the seeded `drills` table — no kid-derived
  custom drill names ride along (a
  defensive scan in tests). Per LESSONS#0036
  / #0070 — `.select()` allow-lists; never
  mutate the DB row. Per LESSONS#0061 /
  #0063 — literal-space + shape-scoped
  defensive scans on rendered fixtures.
  (vitest: planted email / phone / DOB /
  parent message / minor name on every
  joined row are NEVER read; the rendered
  text passes the surname / minor-field /
  jersey-shape regex sweep; planted "Maya
  Walker - 2014 birthday" custom drill
  name fails the minor-name scan.)

- [ ] Voice contract: every rendered user-
  facing string (the headline, the per-sport
  block, the closing line, the expand link,
  the per-convergence sub-rows) contains NO
  AGENTS.md banned word per LESSONS#0023.
  Instruct positively in every helper /
  component / data-file jsdoc; never embed
  a verbatim ban-list per LESSONS#0023 /
  #0034 / #0088. Anti-AI-slop defensive
  list specific to this surface: ["unlock
  cross-sport insights", "synergy across
  sports", "your multi-sport coaching
  empire", "elevate your director surface",
  "amazing convergence", "powerful
  cross-sport vocabulary"]. (vitest: render
  every sport / skill / coach / convergence
  fixture variant and scan.)

- [ ] Regression: the existing /admin page
  render is BYTE-IDENTICAL when the route
  returns `eligible: false` (the new card
  is absent). The existing 0028 program
  pulse, 0077 director peer pulse, 0087
  program-org-tier card, 0090 program-drill-
  canon card, and 0091 sport-wide
  convergence card all continue to render
  BYTE-IDENTICALLY. The existing
  `coach_drill_signals` reads from sibling
  surfaces are BYTE-IDENTICAL — this ticket
  only READS, never writes. The seeded
  `drills` table is BYTE-IDENTICAL. The
  Stripe webhook (0001-0005) is BYTE-
  IDENTICAL. (vitest: snapshot the /admin
  director surface render pre- and post-
  change with planted fixtures; snapshot
  the 0091 sport-wide card render with the
  same fixtures.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — pre-mint the existing
  E2E Org-tier program (0087 already seeds
  this) with at least TWO sport-distinct
  teams in the same org — a basketball
  U10 team with Coach Aisha and a
  volleyball U12 team with Coach Marco
  (both already on the existing seeded
  org per 0090's posture; this adds the
  second sport). Pre-mint `drills` rows
  in both sports with `skill_tags` that
  alias to the unified 'spacing' tag per
  the seeded JSON: 2 basketball drills
  ('Three-line spacing on baseline',
  '2-3 zone gap reads') tagged
  `['spacing']` and 2 volleyball drills
  ('Cone gap holds', 'Wall spacing on
  serve receive') tagged
  `['serve-receive-spacing']`. Pre-mint
  `coach_drill_signals` rows: Aisha
  thumbs both basketball drills, Marco
  thumbs both volleyball drills, all in
  the last 7 days. UUIDs in next free
  range per LESSONS#0101; jsonb values
  quoted per LESSONS#0085; deterministic
  first names per LESSONS#0079
  ("Aisha", "Marco"); `auth.users` +
  `coaches` rows in the same idempotent
  block per LESSONS#0084. Per
  LESSONS#0094 — no new migration is
  required (this ticket has no schema
  change beyond the seeded JSON which
  is a code file, not a migration);
  document this absence in the
  Implementation log per LESSONS#0096.
  Playwright spec: (a) sign in as the
  seeded director, (b) navigate to
  /admin, (c) assert the cross-sport
  convergence card renders scoped by
  `data-testid="cross-sport-convergence-card"`
  AND contains the literal "spacing"
  AND the literal "basketball" AND
  "volleyball" AND the names "Aisha"
  AND "Marco" AND at least one drill
  name per sport, (d) assert NO
  primary CTA / publish / upgrade
  button is present (defensive
  selector assertion), (e) assert
  the existing 0090 program-drill-
  canon card from the same /admin
  surface continues to render
  BYTE-IDENTICALLY (regression
  snapshot scoped by data-testid),
  (f) assert NO seeded player name /
  email / phone appears anywhere in
  the rendered card per
  LESSONS#0029 / #0082. Scope every
  assertion by data-testid. Skip
  when E2E creds are unset.

## Out of scope

- A migration to NORMALIZE per-sport
  skill tags into a relational table.
  v1 is a seeded JSON; if the
  cardinality grows past 50 a separate
  ticket promotes to a table.
- An AI-derived skill-tag mapping
  (LLM picks aliases). v1 is hand-
  curated; AI mapping is a separate
  ticket with a higher correctness
  bar.
- A CROSS-SPORT canon (the 0090
  program-drill-canon equivalent
  across sports). v1 is a READ-ONLY
  insight; cross-sport canon is a
  separate ticket.
- A LEADERBOARD of "multi-sport
  programs by convergence count." v1
  surfaces only the caller's own
  state.
- A PUSH NOTIFICATION when a new
  convergence fires. v1 is passive —
  the director discovers the card the
  next time they open /admin.
- An EMAIL mirror of the card. v1 is
  in-product /admin only; email is
  higher-bar privacy review.
- A CROSS-PROGRAM cross-sport
  surface (e.g. "your basketball
  program AND another program's
  volleyball are both on spacing").
  v1 is single-program scope; the
  cross-program extension is a
  separate ticket on the 0077 axis.
- A surface for COACHES on the
  cross-sport convergence (e.g.
  the basketball coach sees "the
  volleyball coach in your program
  is on the same skill this week").
  v1 is director-only; coach-side
  is a separate ticket with
  different framing.
- A CHANGE to the existing
  `drills.skill_tags` schema or
  the seeded drill content. v1
  reads existing data only.

## Engineering notes

Files / patterns the dev should touch.

- `src/data/cross-sport-skill-tags.json`
  (new) — small seeded map. Per
  LESSONS#0066 — data file over new
  table when cardinality < 50. Per
  LESSONS#0023 — positive voice in
  the header comment.
- `src/lib/cross-sport-convergence.ts`
  (new) — pure helper. Mirrors the
  shape of
  `src/lib/program-drill-canon.ts`
  (0090),
  `src/lib/sport-wide-convergence.ts`
  (0091). Per LESSONS#0061 —
  literal-space defensive scan; per
  LESSONS#0023 — positive voice.
- `src/app/api/admin/cross-sport-convergence/route.ts`
  (new) — `GET(request)` authed;
  director-only. Per LESSONS#0096 —
  at pickup verify the actual
  `coach_drill_signals` table shape
  (the 0090 ship's reconciliation),
  the actual `drills.skill_tags`
  column shape, the actual
  `sports` reference table, the
  actual `teams.sport_id` column.
- `src/components/admin/cross-sport-convergence-card.tsx`
  (new). Per LESSONS#0029 / #0082 —
  `data-testid` scoping. Per
  LESSONS#0065 / #0066 / #0162 —
  smallest possible touch on the
  director surface.
- `src/app/(dashboard)/admin/page.tsx`
  (existing — read first per
  LESSONS#0096) — ONE import + ONE
  JSX mount of the new card UNDER
  the existing 0091 sport-wide
  convergence card and ABOVE the
  rest of the feed; verify the
  exact mount position at pickup.
- Migration: NONE. This ticket has
  NO schema change beyond the seeded
  JSON data file. Per LESSONS#0066
  — widen / read existing reads
  before creating a new table.
  Per LESSONS#0096 — document the
  absence of a migration in the
  Implementation log.
- `src/types/database.ts` — NO new
  types if the helper / route
  reuses existing
  `coach_drill_signals` /
  `drills` / `teams` / `sports`
  shapes (verify at pickup).
- `src/lib/tier.ts` — NO change.
  NO new feature key.
- `tests/data/cross-sport-skill-tags.test.ts`
  (new).
- `tests/lib/cross-sport-convergence.test.ts`
  (new).
- `tests/api/admin-cross-sport-convergence.test.ts`
  (new).
- `tests/components/cross-sport-convergence-card.test.tsx`
  (new).
- `tests/e2e/cross-sport-convergence-flow.spec.ts`
  (new). Seed extension per the
  AC. UUIDs in next free range per
  LESSONS#0101. Skip when E2E
  creds are unset.
- New deps: NO. Migration: NO.
  Env vars: NO. AI prompt change:
  NO. Tier feature key: NO new
  key.
- LESSONS to anchor: #0021 / #0023
  (positive voice), #0029 / #0082
  (data-testid scoping + privacy
  fixture scans), #0034 / #0088
  (strip `--` comments on
  banned-word scan), #0036
  (`.select()` allow-lists),
  #0039 (cross-team drill-thumb
  persistence is
  `coach_drill_signals` per the
  0090 reconciliation; verify at
  pickup), #0044 (subscription-
  status + role gate load-
  bearing), #0049 / #0092 /
  #0100 / #0110 (mock queue
  sweeps), #0057 (team_coaches
  join), #0061 / #0063
  (literal-space + shape-scoped
  defensive scans), #0065 /
  #0066 / #0162 (smallest touch
  on director surface), #0066
  (data file over new table when
  cardinality < 50; widen
  existing reads before adding
  new persistence), #0070 /
  #0072 (no DB-row mutate),
  #0074 / #0087 (named-list
  oxford-comma posture), #0078
  (verify actual cross-team
  join keys), #0079
  (deterministic seeded first
  names), #0080 (filter-aware
  chain mocks), #0083 (mock
  semantics mirror SQL filter
  for membership checks),
  #0084 / #0101 (seed posture),
  #0085 (jsonb seed values),
  #0087 (no WHERE NOW() partial
  index; director-role check is
  `role === 'admin'`),
  #0096 (schema wins over prose
  — at pickup read the actual
  coach_drill_signals shape,
  the actual drills.skill_tags
  shape, the actual sports
  table, the actual /admin
  mount point; document the
  absence of a migration in
  the Implementation log),
  #0103 (additive widening —
  the response shape evolves
  only by adding fields,
  never removing), #0115 (UTC
  posture on thumbed_at),
  #0116 (empty-Glob no-op),
  #0118 (broaden strict-
  whitelist mocks),
  STRATEGY_LOG_2026-06 (the
  CROSS-SPORT director who
  runs basketball AND
  volleyball programs and
  the moat at that boundary
  is the named next-axis
  primitive beyond 0091's
  sport-wide convergence).

Depends on: 0028 (shipped —
program pulse, the surface the
card mounts under), 0039
(shipped — the cross-team
drill-thumb persistence
reconciled to
`coach_drill_signals`), 0064
(shipped — drill share
publishing primitive), 0071 /
0075 (shipped — within-sport
convergence surfaces this
ticket extends across sport
boundaries), 0077 (shipped —
director peer-pulse; the
cross-program adjacency), 0087
(shipped — Org-tier upgrade
moment; the tier-gate this
ticket reuses), 0090 (shipped
— program-drill-canon; the
sibling director surface),
0091 (shipped — sport-wide
convergence; the within-sport
predecessor this ticket
extends across sports).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0094-cross-sport-convergence` opened
- YYYY-MM-DD — failing test added in `tests/lib/cross-sport-convergence.test.ts`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
