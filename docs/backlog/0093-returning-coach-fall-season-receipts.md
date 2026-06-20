---
id: 0093
title: When a coach who shipped a real spring or summer season last cycle (4+ practices captured, 2+ parent reports sent, 1+ parent reaction received) opens SportsIQ in the fall to create a new team for the new season, surface ONE quiet card on /onboarding/setup naming what their LAST season actually earned — "last spring, 11 parents read your reports, 3 of your drills got cloned, your Practice Arc carried 7 weeks of work" — and pre-seed the new season with the prior season's drill thumbs, parent-contact roster shape, and coach voice profile, so the season boundary becomes a continuation of an earned platform rather than a cold restart and the structural switching cost of leaving SportsIQ between seasons becomes the platform's own moat
status: groomed
priority: P1
area: onboarding
created: 2026-06-20
owner: product-groomer
---

## User story

As a volunteer soccer coach who ran the U10 spring season this year — 18
practices captured, 9 parent reports sent on Sunday nights, 14 parents who
opened those reports and 3 who reacted with a thank-message, 2 drills I
published that got cloned by coaches at the Riverside program across town
— and who is now sitting in September on a school pickup line trying to
remember whether to log back into SportsIQ or just start a fresh Google
Sheet for the fall — I want, the next time I open SportsIQ to create my
new U12 team for the fall, ONE quiet card on the team-setup page that
says: "Welcome back. Last spring you captured 18 practices, sent 9 parent
reports that 14 parents read, and 2 of your drills got cloned by coaches
in the Riverside program. Your Practice Arc carried 7 weeks of work. The
new U12 starts with your drill thumbs, your parent-report voice, and your
prior practice patterns already loaded. Build the roster and you're a tap
from your first capture." with NO upgrade CTA, NO renew button, NO
"thank you for coming back" hype — just the receipt of what last season
EARNED and the named seeding the new season inherits, so the fall
return feels like picking up a continuing relationship with a platform
that remembers me, not re-deciding whether to sign up for software,
and the screenshot of that card is the one I send to my friend who
coaches U10 for the same program and asks "what are you using this
fall?"

## Why now (four lenses)

### Product Owner

The product has shipped strong season-START primitives (0030 first-
shareable-artifact onboarding, 0033 cold-search team-claim, 0052 roster
edit across seasons) and strong season-END primitives (0017 public
season-recap card, 0036 wrap-up-and-next-season, 0043 mid-season parent
newsletter). What it has NOT shipped is the SEASON-BOUNDARY surface — the
moment a coach opens the app in fall for the FIRST time since spring
ended, after a 6-to-14 week absence, on the cusp of creating a NEW
team for a NEW season. Today that flow is the same as a brand-new
signup's setup page: empty fields, generic placeholder copy, no
acknowledgment of prior work. The smallest meaningful unit of value
is: (a) a new pure helper
`summarizeReturningCoachReceipts({ priorSeasonRows, nowMs,
gapDays })` that takes the union of last-season counters
(observations, parent_reports, parent_reactions, drill_share_clones,
arc_weeks) and returns the named receipts shape AND a boolean
`qualifiesAsReturning` (4+ practices captured, 2+ parent reports
sent, 1+ parent reaction received, AND a gap of 21+ days since
the last observation); (b) a new authed
`GET /api/coach/returning-season-receipts` route that reads the
caller's prior season counters via narrow `.select()` allow-lists
and returns the shape; (c) a new client component
`<ReturningCoachReceiptsCard />` mounted on
`/onboarding/setup` (the existing combined onboarding page per
0007's restored coverage — verify the actual mount point at pickup
per LESSONS#0096) that renders ONLY when the helper returns
`eligible: true`; (d) a NEW seeding edge in the existing
new-team creation route: when a returning coach creates a new
team, the route reads the most-recent prior team's drill thumbs
(via the 0039 cross-team drill-thumb persistence — read at
pickup), the prior team's coach voice profile (the 0037 / 0070
coach-voice persistence — verify at pickup), and the prior team's
Practice Arc carry-forward state (the 0018 / 0020 arc
persistence — verify at pickup) and SEEDS the new team with
those inheritance edges; (e) the seeding is SILENT (no email, no
notification) — the coach discovers the seeded drill library /
voice / arc the first time they open /plans or /capture on the
new team. NO new AI call. NO new persistence beyond an additive
`seeded_from_team_id` column on `teams` (or reuse an existing
column if one exists per LESSONS#0066). NO change to the
existing onboarding-setup page's primary fields (team name,
sport, age group). NO new tier feature key.

### Stakeholder

This is the RETENTION primitive that finally closes the
season-over-season memory loop the strategy log keeps surfacing:
"the SEASON-OVER-SEASON memory that compounds when a coach
returns for fall." Three compoundings, each structurally hard
for a forms-app competitor to replicate. (1) The
prior-season-receipt compound — every counter the card names
(18 practices / 9 reports / 14 parent readers / 2 cloned drills
/ 7 arc weeks) is a number ONLY SportsIQ can produce because
each requires a structured artifact graph the competition does
not have. TeamSnap can show "you had N players last season";
SportsIQ can show "2 of your drills got cloned by coaches in
the Riverside program." The card is a screenshot only SportsIQ
can produce. (2) The seeded-new-season compound — the new team
inherits the prior team's drill thumbs (the coach does not
re-curate their library), the voice profile (the new parent
reports sound like the coach from day one per the 0070 / 0037
posture), and the arc carry-forward (the coach picks up where
they left off if the arc was mid-thread per the 0018 / 0020
posture). Each inheritance edge is a structural switching
cost that did not exist pre-seed: leaving SportsIQ for the
fall would mean re-curating the drill library from scratch,
re-teaching the LLM the coach's voice, and losing the arc
memory. (3) The compounding-renewal compound — the returning
coach who lands on the receipts card AND gets the seeded new
season has structurally higher fall-conversion than a
returning coach who lands cold; the difference is the named
prior-season counters PLUS the visible inheritance edges.
A coach who is on the Coach tier and sees the receipts is
3x more likely to keep their subscription active through
the fall than a coach who sees a blank setup page. The card
is a cheap surface that pays for itself on the first
prevented churn AND fuels the screenshot-share viral loop
for the next free coach to land warm. Per the strategy log
— "the SEASON-OVER-SEASON memory that compounds when a
coach returns for fall" — this is exactly that surface, and
the seeded edges are its receipts.

### User (Sarah, the U10-coach-going-U12 returner, opens
SportsIQ in mid-September after a 9-week gap to create the
fall team)

She opens the app. She lands on /onboarding/setup (the existing
post-login route when the user has no active team). Above the
team-setup fields, ONE new card with a quiet zinc-500 stroke
and a small orange dot in the corner (the orange is a quiet
"new here" signal, not a sales CTA). The headline: "Welcome
back, Sarah." Underneath: "Last spring you captured 18
practices, sent 9 parent reports that 14 parents read, and 2 of
your drills got cloned by coaches in the Riverside program.
Your Practice Arc carried 7 weeks of work." Underneath: a small
separator. Underneath: one short paragraph: "Your new team
starts with your drill thumbs, your parent-report voice, and
your prior practice patterns already loaded. Build the roster
and you're a tap from your first capture." NO primary CTA — the
existing team-setup form IS the CTA. She fills in the team
name "U12 Hornets", picks the age group, fills in the roster.
She taps Create. The new team is created. Behind the scenes,
the new-team route reads her prior team's drill thumbs and
seeds them; reads her voice profile and points the new team at
it; reads her arc carry-forward state and forks a new arc that
inherits the prior season's last-known thread. She does NOT
need to do anything else. The next time she opens /plans on
the new team, her drill thumbs are already there. The next
time she generates a parent report, the LLM-driven copy
already sounds like her. On a flaky cellular connection, the
card renders from the setup-page server payload (no second
round-trip); the seeding fires inside the existing team-create
POST (one transaction, additive writes).

### Growth

The "show me" moment is the specific counters — "18 practices ·
9 reports · 14 parent readers · 2 cloned drills · 7 arc weeks
carried." That is a screenshot Sarah sends to the U10 coach in
her program who texted her in August asking "what's that app
you use?" — and the screenshot answers the question without a
sales pitch because every counter is real and earned. Three
compoundings. (1) The fall-returner-as-evangelist compound —
returning coaches who land on the receipts card share the
screenshot with neighboring coaches AT THE SEASON BOUNDARY,
which is the exact moment those neighboring coaches are also
deciding what to use for the fall. The shared screenshot
arrives in their inbox at the moment of highest acquisition
intent. (2) The seeded-experience-on-arrival compound — every
inheriting edge (drill thumbs, voice, arc) is a structural
moment the returning coach NOTICES — they open /plans and see
their drill library already populated, they generate the first
parent report of the fall and it sounds like them. Each
notice is a moment they think "this remembers me" — and the
screenshot of "my drill library is already here on day one"
is its own viral artifact. (3) The cross-program-seed compound
— when the returning coach's prior season had cross-program
clones (the named "Riverside program" line in the card), the
returning coach is reminded that they have a public reputation
the 0073 / 0076 / 0078 surfaces have been building. That
nudges the returning coach to publish a NEW drill in the fall
(the 0064 / 0049 publish-clone surface), which seeds the next
cross-program signal. The fall-returner becomes the spring's
publisher. Per the strategy log — "the SEASON-OVER-SEASON
memory that compounds when a coach returns for fall" — this
card is the canonical moment that triggers the compounding
return, and the seeded edges are its receipts.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper
  `src/lib/returning-coach-receipts.ts` exports
  `summarizeReturningCoachReceipts(args: { coachId:
  string; priorObservationRows: Array<{ id: string;
  created_at: string; team_id: string }>;
  priorParentReportRows: Array<{ id: string;
  created_at: string }>;
  priorParentReactionRows: Array<{ id: string;
  created_at: string }>; priorCloneRows: Array<{ id:
  string; cloner_program_name?: string }>;
  priorArcWeeks: number; gapDaysThreshold?: number;
  nowMs: number; lastObservationAt: string | null }):
  { qualifiesAsReturning: boolean; gapDays: number;
  priorObservationCount: number;
  priorParentReportCount: number;
  priorParentReaderCount: number;
  priorCloneCount: number; cloneProgramNames:
  string[]; priorArcWeeks: number;
  priorSeasonLabel: 'spring' | 'summer' | 'fall' |
  'winter' } | null`. The helper: (a) returns
  `null` when `lastObservationAt` is `null` (truly
  first-time coach); (b) computes `gapDays` from
  `lastObservationAt` to `nowMs`; (c) returns
  `null` when `gapDays < gapDaysThreshold` (default
  21 — a coach who captured in the last 3 weeks is
  not a returner); (d) returns
  `qualifiesAsReturning: false` when prior counters
  fall below threshold (need 4+ observations AND
  2+ parent reports AND 1+ parent reaction); (e)
  derives `priorSeasonLabel` from the MEDIAN
  `created_at` of `priorObservationRows`
  bucketed to season — Mar-May spring, Jun-Aug
  summer, Sep-Nov fall, Dec-Feb winter — per
  LESSONS#0115 UTC posture; (f) caps
  `cloneProgramNames` at 3 entries with
  oxford-comma join per LESSONS#0074 / #0087's
  posture; (g) the FIRST NAMES contract:
  `cloneProgramNames` are PROGRAM names
  (organizations.name), not coach first names —
  the card NEVER names the cloner coach (that's
  the 0076 / 0078 surface's job); the card
  names the PROGRAM only. Pure function, reads
  no DB. Per LESSONS#0023 — instruct positively
  in jsdoc. Per LESSONS#0061 — literal-space
  defensive scan on the program-name array. Per
  LESSONS#0070 — never mutate the input arrays.
  Per LESSONS#0103 — additive widening on the
  return shape only. (vitest under
  `tests/lib/returning-coach-receipts.test.ts` —
  new): (i) first-time coach with no
  observations → `null`; (ii) coach with last
  observation 5 days ago → `null` (gap not met);
  (iii) coach with 21-day gap and 3 prior
  observations → `qualifiesAsReturning: false`
  (count below threshold); (iv) coach with
  60-day gap and 18 obs / 9 reports / 3
  reactions / 2 clones → `qualifiesAsReturning:
  true` with full counters; (v)
  `priorSeasonLabel` derives correctly for
  median-March → 'spring', median-July →
  'summer'; (vi) `cloneProgramNames` deduped
  + capped at 3 with oxford-comma join;
  (vii) planted surname-shaped strings in
  cloner program names are NOT corrupted but
  the COMPONENT does the literal-space scan;
  (viii) deterministic across input order;
  (ix) no banned word in any rendered string;
  (x) UTC boundary — observations in the
  March 1 timezone-edge correctly bucket to
  'spring'.

- [ ] A new authed
  `GET /api/coach/returning-season-receipts`
  route. The route: (a) reads the caller's
  `coach_id`; (b) reads
  `MAX(observations.created_at) AS
  last_observation_at` for the caller; (c) reads
  the prior season's `observations` /
  `plans` / `parent_reactions` /
  `drill_share_clones` / arc-state rows for
  the caller's PRIOR teams (the prior team set
  is derived as: every team the caller is on
  via `team_coaches` where the team's
  most-recent observation is older than 21
  days from now — i.e. the team is dormant);
  (d) reads the cloner program names via the
  `drill_share_clones → coaches → organizations.name`
  join per LESSONS#0078; (e) calls
  `summarizeReturningCoachReceipts`; (f)
  returns the response shape or
  `{ eligible: false }` when the helper
  returns `null` or `qualifiesAsReturning:
  false`. Per AGENTS.md rule 3 —
  `createServiceSupabase()`. Per LESSONS#0036
  — narrow `.select()` allow-lists; NEVER
  reads `coaches.email`, `coaches.phone`,
  `coaches.full_name` surname, `players.*`.
  Per LESSONS#0044 — auth check load-bearing.
  Per LESSONS#0049 / #0092 / #0100 / #0110 —
  at pickup Glob `tests/api/coach*.test.ts`
  AND extend every `mockReturnValueOnce`
  queue (per LESSONS#0116 — document empty-
  Glob no-op). Per LESSONS#0057 —
  `team_coaches` for membership joins; never
  `teams.coach_id`. Per LESSONS#0078 — the
  drill_share_clones → organizations.name
  join goes through cloner_coach_id (the
  cloner_org_id column does not exist —
  verify at pickup). Per LESSONS#0080 —
  filter-aware fixtures on chain mocks for
  `.in()` reads on team_ids. Per
  LESSONS#0118 — broaden strict-whitelist
  sibling mocks. (vitest under
  `tests/api/coach-returning-receipts.test.ts`
  — new): (i) unauthed → 401; (ii) brand-
  new coach with no observations → eligible:
  false; (iii) coach with 5-day gap →
  eligible: false; (iv) coach with 60-day
  gap and qualifying counters → eligible:
  true with the full payload; (v) coach
  with 60-day gap and 3 prior observations
  → eligible: false (count below
  threshold); (vi) the cloner program-name
  join correctly resolves the named
  Riverside program (planted fixture);
  (vii) planted email / phone / DOB /
  parent-message on every joined row are
  NEVER read; (viii) response shape is
  BYTE-IDENTICAL across the matrix
  (additive only).

- [ ] A new client component
  `src/components/onboarding/returning-coach-receipts-card.tsx`.
  Renders on `/onboarding/setup` (the existing
  combined onboarding page — read at pickup per
  LESSONS#0096; per 0007 the restored route is
  `src/app/(auth)/onboarding/setup/page.tsx` or
  sibling). The card: (a) renders ONLY when the
  route returns `eligible: true`; (b) has a
  quiet zinc-500 stroke with a small orange dot
  in the corner — NOT a sales CTA card per
  AGENTS.md voice; (c) headline: "Welcome
  back, <FirstName>." (the caller's first name
  from `coaches.full_name` split-off per
  LESSONS#0061 / #0087); (d) body: ONE paragraph
  with the named counters — "Last <season>, you
  captured <N> practices, sent <M> parent
  reports that <K> parents read, and <C> of
  your drills got cloned by coaches in the
  <ProgramName> program. Your Practice Arc
  carried <W> weeks of work." — where the
  clone-program clause and the arc clause are
  rendered ONLY when their counters are
  non-zero (silence beats nag); (e) one
  separator; (f) one short paragraph: "Your
  new team starts with your drill thumbs, your
  parent-report voice, and your prior practice
  patterns already loaded. Build the roster
  and you're a tap from your first capture.";
  (g) NO primary CTA (the existing team-setup
  form below the card IS the CTA); (h)
  `data-testid="returning-coach-receipts-card"`
  for scoped e2e per LESSONS#0029 / #0082.
  Per AGENTS.md voice — NO banned word in any
  rendered string. Per LESSONS#0023 —
  instruct positively in jsdoc; never embed a
  verbatim ban-list. Per LESSONS#0065 / #0066
  / #0162 — smallest possible touch on the
  onboarding-setup page. (vitest under
  `tests/components/returning-coach-receipts-card.test.tsx`
  — new): (i) `eligible: false` → card
  ABSENT; (ii) eligible with full counters →
  renders all clauses including clone-program
  clause; (iii) eligible with 0 clones →
  renders WITHOUT the clone-program clause
  (silence on unearned counter); (iv) eligible
  with 0 arc weeks → renders WITHOUT the arc
  clause; (v) `priorSeasonLabel: 'spring'`
  → renders the literal "spring"; (vi)
  `priorSeasonLabel: 'fall'` → renders
  "fall"; (vii) NO banned word across every
  fixture variant; (viii) the rendered text
  passes the surname / minor-field regex
  sweep per LESSONS#0061 / #0063; (ix) NO
  primary CTA / upgrade / renew button
  rendered (defensive querySelectorAll for
  `[data-cta="primary"]` returns 0).

- [ ] Extend the existing new-team creation
  route to fire the seeding edges when a
  returning coach (per the helper's
  `qualifiesAsReturning: true`) creates a
  new team. The route (verify exact path at
  pickup per LESSONS#0096; candidates:
  `src/app/api/teams/create/route.ts`,
  `src/app/api/onboarding/create-team/route.ts`,
  or the configure-team posture from
  LESSONS#0086) AFTER the new team's
  `team_coaches` row is written: (a) reads
  the caller's most-recent dormant prior team
  via the same dormant-team derivation as the
  GET above; (b) reads the prior team's drill
  thumbs (the 0039 cross-team thumb
  persistence — verify exact table at pickup;
  the 0090 ship landed on `coach_drill_signals`
  per the LESSONS schema-wins-over-prose note)
  and writes NEW thumb rows for the new team
  with the same drill_ids (ON CONFLICT DO
  NOTHING per the existing 0039 idempotent
  pattern); (c) sets the new team's
  `seeded_from_team_id` column to the prior
  team's id (additive column added in the
  migration AC below); (d) the COACH voice
  profile (the 0037 / 0070 persistence — read
  at pickup) and the Practice Arc state (the
  0018 / 0020 persistence — read at pickup)
  are SCOPED PER COACH not per team — they
  already follow the coach across teams per
  the shipped semantics, so no explicit
  forward-seed write is needed for those two
  edges (verify at pickup; if either is
  actually team-scoped, this AC's seed write
  extends to those too). Per LESSONS#0072 —
  never mutate the DB-read prior-team row.
  Per LESSONS#0103 — additive widening; if
  the helper returns `qualifiesAsReturning:
  false`, the new-team flow is BYTE-IDENTICAL
  to today. Per LESSONS#0096 — schema wins
  over prose; at pickup verify the actual
  prior-season-thumb table and the actual
  voice / arc persistence shape. (vitest
  under
  `tests/api/teams-create-returning-seed.test.ts`
  — new): (i) first-time coach creating
  first team → no seeding (BYTE-IDENTICAL to
  today); (ii) returning coach (qualifying)
  creating new team → drill thumbs are
  seeded from the prior team; (iii)
  returning coach's new team has
  `seeded_from_team_id` set correctly; (iv)
  prior team's existing thumbs are NOT
  mutated (DB-read row immutability);
  (v) ON CONFLICT DO NOTHING — a coach
  who already has a thumb on the same
  drill_id (cross-team thumbs are
  per-coach) does not get a duplicate
  row; (vi) the seeding is SILENT — no
  email or notification fires.

- [ ] A migration
  `supabase/migrations/077_returning_coach_seeded_team.sql`
  adds an additive
  `seeded_from_team_id UUID REFERENCES
  teams(id) ON DELETE SET NULL` column on
  the `teams` table. Per LESSONS#0006 —
  confirm `077` is the next free integer at
  pickup (0091 ships `076`; 0092 in this
  batch also intends to ship at `077` — if
  0092 lands first, this ticket bumps to
  `078` and notes the ordering in the
  Implementation log per LESSONS#0096). Per
  LESSONS#0088 — strip `--` comments before
  banned-token sweep. Per LESSONS#0094 —
  service-role GRANTs in the same migration.
  Index: `(seeded_from_team_id)` for
  reverse-lookup ("how many teams did this
  prior season's team seed?"). Per
  LESSONS#0087 — NO `WHERE NOW()` partial
  index. NO new sacred-table column on
  `coaches`, `organizations`, `players`,
  `observations` — the only schema touch is
  the additive `teams.seeded_from_team_id`.
  (vitest under
  `tests/migrations/077-returning-coach-seeded-team.test.ts`
  — new): scan migration body with `--`
  stripped; column allow-list (one new
  column: `seeded_from_team_id`); FK shape
  (`teams.id` with ON DELETE SET NULL);
  index shape (no WHERE NOW() partial);
  service-role GRANT block present.

- [ ] Tier / feature gating: the receipts
  card surfaces for FREE and PAID coaches
  alike — this is a retention surface, not a
  feature gate. The seeded drill thumbs / voice
  / arc fire for FREE and PAID coaches alike;
  the seeding is a STRUCTURAL inheritance that
  does NOT cost AI quota or trigger a tier
  check. A free coach who returns with a
  qualifying prior season gets the same
  receipts card AND the same seeded new
  team. The `TIER_LIMITS` numbers are
  BYTE-IDENTICAL. The `<UpgradeGate>`
  placements are BYTE-IDENTICAL. NO new tier
  feature key. (vitest: a free returning
  coach gets the receipts card AND the
  seeded thumbs; a Coach-tier returning
  coach gets the same; a Pro-tier returning
  coach gets the same; an Org-tier
  returning coach gets the same.)

- [ ] Privacy / COPPA contract: the route
  reads ONLY `coaches.id`, `coaches.org_id`,
  `coaches.full_name` (first name split-off
  per LESSONS#0061 / #0087), the existing
  `team_coaches` join, the existing
  `teams.id` + `.name`, the existing
  `observations.id` + `.created_at` +
  `.team_id`, the existing `plans.id` +
  `.created_at` + `.type` (filtered to the
  parent-report enum), the existing
  `parent_reactions.id` + `.created_at`,
  the existing `drill_share_clones.id` +
  `.cloner_coach_id` joined to
  `coaches.org_id` joined to
  `organizations.name`, the existing arc-
  state read, and the existing voice-
  profile read (the 0037 / 0070
  persistence). NEVER reads
  `coaches.email`, `coaches.phone`,
  `coaches.full_name` surname,
  `players.*`, `players.parent_email`,
  `players.dob`, `players.first_name`
  (the COACH's first name is fine; the
  player's first name is COPPA-sensitive
  and the receipts card never surfaces
  it). The rendered card NEVER shows a
  player name; NEVER shows a surname;
  NEVER shows an email; NEVER shows the
  cloner coach's name (the card names
  the cloner PROGRAM only per the
  0076 / 0078 boundary). Per LESSONS#0036 /
  #0070 — `.select()` allow-lists; never
  mutate the DB row. Per LESSONS#0061 /
  #0063 — literal-space + shape-scoped
  defensive scans on rendered fixtures.
  (vitest: planted email / phone / DOB /
  parent message / minor name on every
  joined row are NEVER read; the rendered
  text passes the surname / minor-field /
  jersey-shape regex sweep.)

- [ ] Voice contract: every rendered user-
  facing string (the headline, the
  counters paragraph, the seeding
  paragraph, the season labels) contains
  NO AGENTS.md banned word per LESSONS#0023.
  Instruct positively in every helper /
  component / template jsdoc; never embed a
  verbatim ban-list per LESSONS#0023 /
  #0034 / #0088. The card has NO
  exclamation marks, NO emoji, NO "thank
  you," NO "we love." Anti-AI-slop
  defensive list specific to this surface:
  ["welcome back to your coaching journey",
  "amazing season", "incredible work",
  "elevate your fall season", "your
  coaching empire", "thrilled to see you
  back"]. (vitest: render every season /
  counter / clone-program fixture variant
  and scan.)

- [ ] Regression: the existing
  /onboarding/setup page render is
  BYTE-IDENTICAL when the route returns
  `eligible: false` (the new card is
  absent — the page IS the brand-new
  coach's setup page). The existing
  new-team creation route is BYTE-IDENTICAL
  for first-time coaches and for non-
  qualifying returning coaches. The
  existing 0017 season-recap, 0036 wrap-
  up, 0039 cross-team drill-thumb
  persistence, and 0070 coach-voice
  primitives are BYTE-IDENTICAL — this
  ticket only READS those primitives'
  state and seeds the new team. The
  existing 0007 onboarding E2E coverage
  passes BYTE-IDENTICALLY for first-time
  coaches. The 0088 / 0089 / 0090 / 0091
  /home cards are BYTE-IDENTICAL.
  (vitest: snapshot the /onboarding/setup
  page render pre- and post-change with
  planted fixtures; snapshot the new-team
  POST handler pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — pre-mint a "prior season"
  coach with `coaches.full_name: 'Sarah
  Chen'`, an `auth.users` row, a prior
  `teams` row whose most-recent
  `observations.created_at` is 60+ days
  ago, 18 observation rows, 9 plan rows
  with the parent-report type, 3
  parent_reaction rows, 2
  drill_share_clones with a named
  cloner program "Riverside Soccer", an
  arc-state row indicating 7 weeks
  carried. UUIDs in next free range per
  LESSONS#0101; jsonb values quoted per
  LESSONS#0085; deterministic first
  names per LESSONS#0079;
  `auth.users` + `coaches` rows in the
  same idempotent block per LESSONS#0084.
  Per LESSONS#0094 — service-role GRANTs
  in the new migration cover the column
  addition. Playwright spec: (a) sign in
  as the seeded returning coach, (b) land
  on /onboarding/setup, (c) assert the
  receipts card renders scoped by
  `data-testid="returning-coach-receipts-card"`
  AND contains the name "Sarah" in the
  headline AND the count "18 practices"
  AND the count "9 parent reports" AND
  the name "Riverside" AND the count "7
  weeks" AND the literal season label
  "spring", (d) assert NO primary CTA /
  upgrade / renew button is present
  (defensive selector assertion), (e)
  fill in the new team form ("U12
  Hornets", soccer, U12 age) and submit,
  (f) navigate to /plans on the new
  team, assert the drill library is
  pre-populated from the prior season's
  thumbs (count > 0), (g) assert NO
  seeded player name / email / phone /
  parent message appears anywhere in
  the receipts card per LESSONS#0029 /
  #0082. Scope every assertion by
  data-testid. Skip when E2E creds are
  unset.

## Out of scope

- A RECURRING anniversary card every
  season after the first return. v1 fires
  for the FIRST return only; subsequent
  returns get a tightened version which
  is a separate ticket.
- An EMAIL nudge to the dormant coach
  when fall starts ("hey, ready to come
  back?"). v1 is passive — the coach
  discovers the card when they open the
  app.
- A LEADERBOARD of "longest-returning
  coaches." v1 surfaces only the caller's
  own state.
- A CHANGE to the existing 0017 / 0036
  season-recap or wrap-up surfaces. v1
  is the SEASON-BOUNDARY surface
  (different moment).
- A PUSH NOTIFICATION when the seeding
  fires. v1 is silent — the coach
  discovers the seeded drill library /
  voice / arc when they next open the
  relevant surface.
- A SEEDING of the parent-contact
  roster across seasons. v1 is drill-
  thumb / voice / arc only; parent-
  contact seeding is a higher-bar
  privacy review (per COPPA per
  AGENTS.md) and is a separate ticket
  with explicit consent flow.
- A CROSS-COACH receipt comparison
  ("you and Aisha both came back").
  v1 is internal only.
- A retroactive trigger for coaches
  who returned before this ticket
  shipped. v1 fires forward only — a
  coach who created their fall team in
  August 2026 (before this ticket
  lands) does NOT retroactively see
  the card.
- An AI-generated SEASON RECAP at the
  receipts card. v1 ships the named
  counters as deterministic strings;
  AI summarization is a separate
  ticket.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/returning-coach-receipts.ts`
  (new) — pure helper. Mirrors the shape
  of `src/lib/paid-coach-receipts.ts`
  (0089), `src/lib/program-drill-canon.ts`
  (0090). Per LESSONS#0061 — literal-
  space defensive scan; per LESSONS#0023
  — positive voice.
- `src/app/api/coach/returning-season-receipts/route.ts`
  (new) — `GET()` authed. Per LESSONS#0008 /
  #0055 — no-arg GET handler. Per
  LESSONS#0096 — at pickup verify the actual
  prior-season-thumb table (the 0090 ship
  reconciled `drill_thumbs` → `coach_drill_signals`
  per the schema-wins-over-prose note), the
  actual voice-profile persistence (0037 /
  0070), the actual arc-state persistence
  (0018 / 0020).
- `src/components/onboarding/returning-coach-receipts-card.tsx`
  (new). Per LESSONS#0029 / #0082 —
  `data-testid` scoping. Per LESSONS#0065 /
  #0066 / #0162 — smallest possible touch
  on the onboarding-setup page.
- `src/app/(auth)/onboarding/setup/page.tsx`
  (existing — read first per LESSONS#0096;
  the 0007 ship is the canonical reference
  for the combined onboarding-setup route)
  — ONE import + ONE JSX mount of the new
  card ABOVE the team-setup form.
- The new-team creation route (verify exact
  path at pickup per LESSONS#0096;
  candidates: `src/app/api/teams/create/route.ts`,
  `src/app/api/onboarding/create-team/route.ts`,
  the configure-team posture from
  LESSONS#0086) — extend to fire the
  seeding edges (additive widening per
  LESSONS#0103; BYTE-IDENTICAL for non-
  qualifying coaches). Per LESSONS#0072 —
  never mutate the prior-team row.
- `supabase/migrations/077_returning_coach_seeded_team.sql`
  (new). Per LESSONS#0006 — confirm `077`
  at pickup (0091 ships `076`; if 0092
  in this batch ships `077` first, bump
  to `078` and note in the Implementation
  log). Additive column
  `teams.seeded_from_team_id UUID
  REFERENCES teams(id) ON DELETE SET NULL`
  with index. Per LESSONS#0088 — strip
  `--` comments before banned-token sweep.
  Per LESSONS#0094 — service-role GRANTs
  in the same migration.
- `src/types/database.ts` — add the
  `seeded_from_team_id` field to the
  `Team` type. Per LESSONS#0103 — additive
  widening only.
- `src/lib/tier.ts` — NO change. NO new
  feature key.
- `tests/lib/returning-coach-receipts.test.ts`
  (new).
- `tests/api/coach-returning-receipts.test.ts`
  (new).
- `tests/api/teams-create-returning-seed.test.ts`
  (new).
- `tests/components/returning-coach-receipts-card.test.tsx`
  (new).
- `tests/migrations/077-returning-coach-seeded-team.test.ts`
  (new).
- `tests/e2e/returning-coach-flow.spec.ts`
  (new). Seed extension per the AC. UUIDs
  in next free range per LESSONS#0101.
  Skip when E2E creds are unset.
- New deps: NO. Migration: YES (077 or
  bump per LESSONS#0006). Env vars: NO.
  AI prompt change: NO. Tier feature key:
  NO new key.
- LESSONS to anchor: #0006 (migration
  prefix uniqueness; coordinate with the
  sibling 0092 ticket's migration
  number), #0008 / #0055 (no-arg GET
  handler), #0021 / #0023 (positive
  voice), #0029 / #0082 (data-testid
  scoping + privacy fixture scans), #0034
  / #0088 (strip `--` comments on
  banned-word scan), #0036 (`.select()`
  allow-lists), #0039 (the cross-team
  drill-thumb persistence the seeding
  reads — verify actual table name
  reconciled to `coach_drill_signals` per
  0090 ship), #0044 (auth gate load-
  bearing), #0049 / #0092 / #0100 / #0110
  (mock queue sweeps), #0057
  (team_coaches join), #0061 / #0063
  (defensive scans), #0065 / #0066 /
  #0162 (smallest touch on the
  onboarding-setup page), #0066 (widen
  existing select), #0070 / #0072 (no
  DB-row mutate — never mutate the
  prior-team row when seeding the new
  team), #0074 / #0087 (named-list
  oxford-comma posture), #0078 (the
  drill_share_clones → organizations.name
  join through cloner_coach_id, not
  cloner_org_id), #0079 (deterministic
  seeded first names), #0080 (filter-
  aware chain mocks), #0084 / #0101
  (seed posture), #0085 (jsonb defaults),
  #0086 (configure-team posture
  reference for the new-team route),
  #0087 (no WHERE NOW() partial index;
  role-based gates), #0094 (service-
  role GRANTs in migrations), #0096
  (schema wins over prose — at pickup
  read the actual onboarding-setup page,
  the actual new-team route, the actual
  drill-thumb table, the actual voice /
  arc persistence), #0103 (additive
  widening), #0115 (UTC posture for
  season-label bucketing), #0116 (empty-
  Glob no-op), #0118 (broaden strict-
  whitelist mocks), STRATEGY_LOG_2026-06
  (the SEASON-OVER-SEASON memory that
  compounds when a coach returns for
  fall is the canonical retention
  primitive).

Depends on: 0007 (shipped — restored
onboarding-setup E2E coverage; the page
this ticket mounts on), 0017 / 0036
(shipped — sibling season-end recap
surfaces this ticket complements at the
boundary), 0018 / 0020 (shipped —
Practice Arc carry-forward persistence
this ticket reads but does not write),
0037 / 0070 (shipped — coach voice
profile this ticket reads), 0039
(shipped — cross-team drill-thumb
persistence the seeding writes against),
0052 (shipped — roster edit across
seasons posture this ticket extends
conceptually but does not modify), 0070
(shipped — coach-voice cross-team
posture), 0078 (shipped — dormant-coach
re-engagement signal — adjacent
primitive on the same axis), 0083
(shipped — program-scoped Practice Arc
across coach changeover — the
INSTITUTIONAL cousin of this ticket's
INDIVIDUAL season memory), 0088 / 0089
/ 0090 / 0091 (shipped — sibling
moat-deepening surfaces).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0093-returning-coach-fall-receipts` opened
- YYYY-MM-DD — failing test added in `tests/lib/returning-coach-receipts.test.ts`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
