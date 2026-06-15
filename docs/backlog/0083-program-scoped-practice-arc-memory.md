---
id: 0083
title: When a brand-new fall coach takes over a U10 team in a program where LAST year's U10 coach ran the season on SportsIQ, surface "the arc that worked for last year's U10 in this same program" to the new coach on their first Practice Arc — "last year's U10 boys spent weeks 2-4 on closeouts and weeks 5-7 on transition; the program's arc carried" — so the Practice Arc cross-coach memory finally crosses the coach boundary at the program scope
status: shipped
priority: P1
area: plans
created: 2026-06-11
owner: product-groomer
---

## User story

As a volunteer coach who just took over the U10 boys team at Hawks
Basketball this fall — the same program a different coach ran the U10
boys for last year (she retired from coaching when her kid aged up) — I
want — the moment I land on the existing 0018 / 0020 Practice Arc
surface for my new team for the very first time and the arc is empty
because I have no history — ONE quiet zinc-500 line above the empty
state: "Last year's U10 Hawks boys spent weeks 2-4 on closeouts and
weeks 5-7 on transitions; that arc carried for them," with one tap to
adopt that arc shape as the starting point for MY season, so the
Practice Arc memory the product has been building (0018 / 0020 / 0037
/ 0066) finally crosses the COACH boundary at the program scope and a
new coach in October is not staring at an empty arc but at a real
shape another coach already ran in this gym for kids the same age.

## Why now (four lenses)

### Product Owner

The product has shipped a per-coach Practice Arc memory stack: 0018
remembers the arc within a coach's own season; 0020 carries the arc
onto Capture for the same coach; 0034 remembers a returning player
across the coach's own seasons; 0037 makes practice plans learn the
coach's own style across teams the coach has run; 0066 catches a thin-
week and falls back to "what carried forward" for the coach's own
artifact. EVERY one of those surfaces is SAME-COACH scope. What is
MISSING is the cross-coach-within-the-program surface — the moment a
NEW coach in the SAME program for the SAME age group lands on an empty
arc and the program's HISTORY has the answer for them. The smallest
meaningful unit of value is: (a) a new pure helper
`computeProgramArcShape(plans, opts)` that aggregates the plans of all
teams in the same `org_id + age_group + sport_id` last season (the
existing `plans.created_at + plans.skills_targeted` shape — read at
pickup per LESSONS#0096), computes the WEEK-by-WEEK top-2 skills
emphasis across all those teams, returns the arc shape as
`Array<{ week_index: number; top_skills: string[]; team_count: number;
practice_count: number }>`; (b) a new
`GET /api/program/arc-history?orgId=<uuid>&ageGroup=<string>&sportId
=<uuid>&seasonLookback=1` (authed; coach-only — the existing 0018 /
0020 arc surface owner check applies) that returns the arc shape +
a coverage flag (`coverage: 'sufficient' | 'thin'` based on team_count
>= 1 AND practice_count >= 12 in the last season — the scarcity bar);
(c) a small `<ProgramArcHistoryHint />` mounted at the TOP of the
existing 0018 / 0020 Practice Arc surface (real path at pickup per
LESSONS#0096) that renders ONE quiet zinc-500 line when the surface
is empty (no prior arc for THIS coach on THIS team) AND the program
arc-history has sufficient coverage; (d) ONE tap "Use this as my
starting arc" copies the program arc shape into the existing 0018 /
0020 arc data (the arc primitive that 0018 ships — confirm at pickup;
the copy is a one-shot seed, not a synced clone — the new coach can
edit the arc freely from here on; the program arc shape is the
SUGGESTION, not the constraint); (e) the hint is REMOVED from the
surface the moment the coach has built ANY arc data of their own (the
hint is a one-shot first-session affordance). NO new tier feature
key (the program arc-history is a free affordance for any coach in
the program; the existing 0018 / 0020 arc primitive's tier-gate is
preserved). NO AI generation (the arc shape is deterministic
aggregation). NO migration (every read is on existing tables —
`plans`, `teams`, `team_coaches`, `organizations`).

### Stakeholder

This is the moat-deepening primitive that turns the per-coach Practice
Arc memory into a PROGRAM-SCOPED memory — the structural unlock that
makes a brand-new coach in October land on a real shape rather than an
empty screen, and the second cross-coach-in-program signal SportsIQ
ships after 0071 (in-program emergent skill — current week) and 0077
(cross-program director peer pulse). Three compoundings, all
structurally hard for a forms-app competitor to replicate because they
require BOTH a cross-season plan archive AND a program-scoped age-
group join AND a per-team team-coaches ownership graph, ALL of which
the product has and competitors do not. (1) The new-coach activation
moat — the existing 0030 first-artifact activation surface is the
COACH-side onboarding solve; this is the COACH-side onboarding solve
for the SECOND-year coach who is NOT first-artifact (they may have
coached elsewhere) but IS first-arc-in-this-program. Their activation
moment is the moment they see the program's last year's arc shape and
recognize their own season's shape forming. The expected activation
delta on the new-coach-in-existing-program cohort is the strongest
the product can ship because no other surface gives them program
context on their FIRST arc-touch. (2) The director-tier conversion
compound — every program where a new coach adopts last year's arc
shape is a program where the program's institutional knowledge
carried across coaches; that is the EXACT pitch the existing 0028 /
0031 / 0071 / 0077 director surfaces depend on for Org-tier
retention, and this is the per-coach surface that makes the pitch
visible to the coaches. (3) The practice-arc moat compound — the
existing 0018 / 0020 / 0037 / 0066 same-coach arc surfaces feed a
PROGRAM-scope aggregate that 0083 surfaces back to a new coach;
every new coach who adopts the program arc shape FEEDS more plans
into the same per-program aggregate, which raises the coverage flag
for the next new coach in two years, which compounds the program's
arc memory geometrically. Distinct from 0018 (same-coach arc within
a season), 0020 (same-coach arc carryover onto Capture), 0034 (same-
coach cross-season returning player), 0037 (same-coach cross-team
style), 0066 (same-coach thin-week fallback to own artifact), 0049 /
0064 (cross-coach published plan / drill that's a single artifact,
not an arc), 0071 (cross-coach emergent skill for the CURRENT week
in the program), 0073 / 0075 (cross-program ranking of published
plans), 0077 (cross-program director peer pulse). THIS is the
first cross-COACH-in-PROGRAM arc-shape memory.

### User (the new coach, Coach Sam, Sunday 8:14pm opening SportsIQ
for the first time to plan Tuesday's first Hawks U10 practice)

He just signed up via the existing 0024 program-staff invite flow
(the director Tom invited him; the existing 0021 warm-referral
landing recognized him). He lands on his team page. He taps "Plan
Tuesday" or "Open Practice Arc" — confirm the surface at pickup per
LESSONS#0096. The Practice Arc page renders empty (he has no plans
yet for this team). At the top of the empty state, in zinc-500: "Last
year's U10 Hawks boys spent weeks 2-4 on closeouts and weeks 5-7 on
transitions; that arc carried for them. — from the Hawks program's
season last year." Below that line, ONE small orange-pill button:
"Use this as my starting arc." He reads it. He recognizes the shape
— that is what the league's U10 division actually emphasizes. He
taps. A small confirmation: "Starting arc loaded. You can edit any
week from here." The empty arc page now shows weeks 2-4 emphasizing
closeouts and weeks 5-7 emphasizing transitions, exactly the way
the previous U10 Hawks coach had it. He edits week 5 to add
"defensive rebounding" because that is what his roster needs. He
taps Save. Tuesday's practice is planned in 4 minutes instead of an
empty hour staring at "what should we work on."

### User (Coach Sam, three months into the season opening the same
Practice Arc page in November)

He has now built ten weeks of arc himself. The 0083 hint is GONE
(his arc has data; the hint was a one-shot first-session
affordance). The existing 0018 same-coach arc memory has taken over.
The program's arc shape is INVISIBLE to him at this point — it did
its job in week 1; from here the arc is HIS. When a third U10 Hawks
coach takes over in two seasons, the aggregate that fires for them
includes Sam's plans too (the program's memory geometrically
compounds).

### Growth

The "show me" moment is the empty Practice Arc page with the
program's arc shape rendered at the top — a one-line zinc-500
summary AND a one-tap adopt button. The screenshot a new coach DMs
to the director with "the app loaded last year's U10 arc as my
starting point — saved me an hour." That screenshot is the
director-tier acquisition surface because every director wants
this exact thing visible to their new coaches in October. Compounds
three ways. (1) The new-coach activation compound — every new coach
in a program with sufficient prior coverage adopts an arc shape on
their first session, which structurally improves their week-1
plan, which structurally raises the parent reaction rate, which
structurally feeds the existing 0041 rollup, which structurally
pulls the new coach back into the app on Monday. (2) The program-
arc moat compound — every program where the arc shape persists
across coaches is structurally harder for a competitor to
replicate because the competitor would need years of plan history
in the same program / age-group to surface the same shape; even a
copycat that ships the surface CANNOT ship the data. (3) The
director-tier conversion compound — every director who sees their
new coaches adopt the program's arc shape on their first session
gets the strongest possible Org-tier retention signal: "the
platform's institutional memory carried across coaches in MY
program." Distinct from every shipped surface because every
shipped surface is single-coach OR single-year; THIS is the first
program-scoped cross-coach arc-shape memory.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper `src/lib/program-arc-utils.ts`. Exports
  `computeProgramArcShape(args: { plans: Array<{ team_id: string;
  org_id: string; age_group: string; sport_id: string;
  skills_targeted: string[]; created_at: string; season_week:
  number | null }>; orgId: string; ageGroup: string; sportId:
  string; seasonLookback?: number; minTeamCount?: number;
  minPracticeCount?: number; nowMs: number }): { coverage:
  'sufficient' | 'thin'; weeks: Array<{ week_index: number;
  top_skills: string[]; team_count: number; practice_count: number
  }> }`. The helper: (a) filters `plans` to the matching
  `(org_id, age_group, sport_id)` AND `created_at` within the
  last `seasonLookback` seasons (default 1 — last season only);
  (b) groups plans by `season_week` (the existing 0032 season-
  momentum column OR a deterministic derivation from `created_at`
  + the team's season-start date — confirm at pickup per
  LESSONS#0096); (c) aggregates per week: counts distinct
  `team_id` (`team_count`), counts plans (`practice_count`),
  and ranks the top-2 `skills_targeted` by frequency
  (`top_skills`); (d) sets `coverage = 'sufficient'` when
  `team_count >= minTeamCount (default 1)` AND
  `practice_count >= minPracticeCount (default 12)` across
  the full season — the scarcity bar; (e) returns the weeks
  ordered by `week_index ASC`; (f) the caller's OWN team is
  EXCLUDED from the aggregate (the program memory comes from
  OTHER teams, not the caller's; if the caller is the only
  team, `coverage === 'thin'`). Pure function, reads no DB.
  Per LESSONS#0023 — numbers, not free text. (vitest under
  `tests/lib/program-arc-utils.test.ts` — new): (i) empty
  plans → coverage 'thin' + empty weeks; (ii) ONE other team
  with 14 plans in 8 weeks last season → coverage
  'sufficient' + week-by-week shape; (iii) ONE other team
  with 6 plans → coverage 'thin' (below practice_count
  bar); (iv) THREE other teams with 18 plans → coverage
  'sufficient' with team_count=3; (v) the caller's own
  team is excluded; (vi) plans for a DIFFERENT age_group
  are excluded; (vii) plans for a DIFFERENT org_id are
  excluded; (viii) plans for a DIFFERENT sport_id are
  excluded; (ix) `seasonLookback = 2` aggregates two
  seasons; (x) top_skills are ordered by frequency
  descending; (xi) deterministic across input order.

- [ ] A new `GET /api/program/arc-history/route.ts`. The
  route: (a) authed; 401 if no session; (b) accepts
  query params `orgId`, `ageGroup`, `sportId`,
  `seasonLookback?` (default 1); (c) verifies the caller
  owns a team in the named org (the existing 0028 / 0071
  director scope OR the 0024 program-staff scope — confirm
  at pickup; v1 is open to ANY coach in the program who
  has at least one team in the org_id, NOT director-only,
  because the surface's read is non-sensitive aggregate);
  (d) reads `plans` for the matching `(org_id, age_group,
  sport_id)` excluding the caller's team via the existing
  team-coaches join (LESSONS#0057 — `team_coaches`,
  NEVER `teams.coach_id`); (e) calls
  `computeProgramArcShape(...)` and returns the result;
  (f) returns `200` with the shape; (g) returns `404`
  when the caller owns no team in the named org; (h)
  returns `400` on missing or malformed params. Per
  LESSONS#0036 — explicit `.select()` allow-list on the
  plans read: `team_id, org_id, age_group, sport_id,
  skills_targeted, created_at, season_week` —
  NEVER reads `plans.content`, NEVER reads the plan's
  observations / players / parent_email / DOB.
  Per LESSONS#0049 / #0092 / #0100 / #0110 / #0118 —
  Glob `tests/api/program*` AND `tests/api/arc*` AND
  `tests/api/plans*` at pickup and extend every queue +
  broaden every whitelist. Per LESSONS#0058 — authed
  route; no publicPaths change. (vitest under
  `tests/api/program-arc-history.test.ts` — new): (i)
  authed coach with one team in the named org → 200
  + arc shape; (ii) unauthed → 401; (iii) coach with NO
  team in the named org → 404; (iv) the arc excludes
  the caller's own team; (v) the arc excludes plans
  outside the age_group; (vi) the arc excludes plans
  outside the sport_id; (vii) the arc returns
  `coverage: 'thin'` when below the scarcity bar; (viii)
  planted DOB / medical_notes / parent_email on player
  rows are NEVER read; (ix) the response payload
  contains no plan content beyond `top_skills` per
  week; (x) the response is deterministic across
  re-runs.

- [ ] A small `<ProgramArcHistoryHint />` component
  mounted at the TOP of the existing 0018 / 0020
  Practice Arc surface (real path at pickup per
  LESSONS#0096; the 0018 surface is the Practice Arc
  page; confirm whether it lives at `/plans/arc` or
  inside the existing `/plans` page). The component:
  (a) renders ONLY when the caller's Practice Arc is
  EMPTY (no prior arc data for THIS coach on THIS
  team — the existing 0018 empty-state condition; read
  at pickup) AND the new GET returns `coverage:
  'sufficient'`; (b) render shape: a small zinc-500
  card with one line summarizing the program's arc
  ("Last year's U10 Hawks boys spent weeks 2-4 on
  closeouts and weeks 5-7 on transitions; that arc
  carried for them"); (c) ONE small orange-pill
  button: "Use this as my starting arc."; (d) on tap,
  fires `POST /api/program/arc-history/adopt` which
  copies the program arc shape into the caller's own
  arc data (the existing 0018 arc primitive write —
  confirm at pickup; the copy is a one-shot seed, NOT
  a synced clone — the new coach owns the arc data
  from here on; the program's arc shape is a
  starting point, not a constraint); (e) the
  component is ABSENT once the caller's arc has any
  data (the hint is a one-shot first-session
  affordance — even if the coach later clears their
  arc, the hint NEVER returns; the existing 0018
  empty-state takes over for subsequent empty states).
  The summary line composer is a separate pure
  helper `composeProgramArcSummary(weeks, opts)` —
  deterministic; never AI-generated; picks the
  two contiguous week ranges with the strongest
  `top_skill` frequency to form a "weeks A-B on X
  and weeks C-D on Y" sentence; the helper has its
  own banned-word matrix scan per LESSONS#0023. Per
  LESSONS#0022 / #0029 / #0082 — every assertion
  scoped to `data-testid="program-arc-history-
  hint"`, `data-testid="program-arc-history-adopt"`,
  `data-testid="program-arc-history-summary"`. Per
  LESSONS#0065 / #0066 / #0162 — smallest possible
  touch on the Practice Arc hotspot (one component
  mounted above the empty state). Per LESSONS#0027
  — the visibility effect reads `coverage` AND
  arc-empty-state as a SNAPSHOT; never put a
  set-controlled state value into the deps. (vitest
  component test): (i) empty arc + sufficient
  coverage → hint renders with summary line; (ii)
  empty arc + thin coverage → hint absent; (iii)
  non-empty arc → hint absent regardless of
  coverage; (iv) tapping adopt fires the POST and
  the existing arc data is seeded; (v) the
  summary line contains no banned word for any
  matrix of program_name / age_group / skill /
  week_range; (vi) the summary line uses the
  program's name + age group label + skill names
  verbatim from the seeded plans; (vii) the
  rendered text never contains player surnames,
  emails, parent contact.

- [ ] A new `POST /api/program/arc-history/adopt
  /route.ts`. The route: (a) authed; 401 if no
  session; (b) accepts `{ teamId: string, orgId:
  string, ageGroup: string, sportId: string,
  seasonLookback?: number }`; (c) verifies the
  caller owns `teamId` via `team_coaches`
  (LESSONS#0057); (d) verifies the caller's team
  arc is currently EMPTY (the existing 0018 arc
  data read — confirm at pickup); (e) fetches
  the program arc shape via the SAME helper as
  the GET; (f) copies the arc shape into the
  caller's arc data (the existing 0018 arc write
  primitive — read at pickup; the call is the
  SAME write the coach would do by hand, so
  every regression on the 0018 write surface
  applies); (g) returns `200 { adopted: true,
  weeks: number }`; (h) returns `409 { error:
  'arc_already_populated' }` if the arc is not
  empty; (i) returns `404` if the caller does
  not own the team or owns no team in the org;
  (j) returns `400` on missing params. Per
  LESSONS#0036 — explicit `.select()` allow-
  lists. Per LESSONS#0049 / #0092 / #0100 /
  #0110 / #0118 — Glob `tests/api/program*` AND
  `tests/api/arc*` AND `tests/api/plans*` at
  pickup and extend every queue + broaden
  every whitelist for the new reads. Per
  LESSONS#0058 — authed route; no publicPaths
  change. (vitest under `tests/api/program-arc-
  history-adopt.test.ts` — new): (i) authed
  coach with empty arc → 200 + arc written;
  (ii) unauthed → 401; (iii) wrong team
  ownership → 404; (iv) already-populated arc
  → 409; (v) missing params → 400; (vi) planted
  COPPA-sensitive fields on player rows are
  NEVER read; (vii) the write call is
  byte-identical to a hand-built arc write
  (the existing 0018 surface's write contract
  is preserved); (viii) idempotency: re-firing
  the POST on a now-populated arc → 409 (no
  double-write).

- [ ] Tier / feature gating: NO new tier feature
  key. The program arc-history hint is available
  to any coach with at least one team in an org
  (the existing 0024 / 0028 program-staff scope
  — confirm at pickup). The arc-data write the
  adopt POST fires goes through the EXISTING
  0018 / 0020 arc primitive's tier-gate
  unchanged (BYTE-IDENTICAL). If the existing
  arc primitive is gated to a paid tier, the
  hint+adopt are still RENDERED for free-tier
  coaches but the adopt POST returns the
  existing tier-gate error (the user gets the
  existing upgrade-gate experience). (vitest:
  a free-tier coach with one team sees the
  hint; a paid-tier coach sees the same; the
  adopt POST's tier-gate is whatever the
  existing 0018 arc-write primitive enforces.)

- [ ] Privacy / COPPA contract: (a) The plans
  read returns ONLY `(team_id, org_id,
  age_group, sport_id, skills_targeted,
  created_at, season_week)` — NEVER plan
  content, NEVER observations, NEVER players,
  NEVER parent_email, NEVER DOB, NEVER
  jersey_number, NEVER medical_notes. (b)
  The arc-shape aggregate NEVER attributes a
  skill to a specific TEAM by name (the
  aggregate is program-scoped — `team_count`
  and `practice_count` are integers; no team
  names leak). (c) The summary line renders
  the PROGRAM name + the AGE GROUP label + the
  skill names; NEVER renders the previous
  coach's name (the previous coach's identity
  is invisible to the new coach — the
  attribution is "the program," not a named
  predecessor; this is the consent boundary
  the previous coach implicitly granted by
  contributing their plans to the program-
  scope aggregate). (d) The skill names
  come from the existing `plans.skills_targeted`
  taxonomy — never AI-generated. (e) The
  hint is REMOVED once the caller has built
  any arc data — the program-shape never
  re-asserts after the new coach has their
  own data. Per LESSONS#0036 — every
  `.select()` is an explicit allow-list. Per
  LESSONS#0072 — never `delete` a field on
  a DB-read object; spread to a new object.
  (vitest: planted DOB / medical_notes /
  parent_email on player rows are NEVER read
  by the GET, the adopt POST, or the helper;
  the summary line renders no previous coach
  name; the response payloads contain no
  plan content beyond `top_skills`.)

- [ ] Voice contract: every new user-facing
  string (the hint card, the summary line
  template, the "Use this as my starting
  arc" button label, the toast copy on
  adopt success, the 409 message on
  already-populated) contains NO AGENTS.md
  banned word per LESSONS#0023. Mirror the
  existing 0018 / 0020 / 0071 / 0077
  cardboard voice exactly. Per LESSONS#0061
  — defensive scans use literal spaces, not
  `\s+`. The summary line composer NEVER
  produces a banned token for any matrix of
  program_name / age_group / skill_name /
  week_range. Per LESSONS#0023 —
  instructions never enumerate the banned
  tokens verbatim (no AI prompt here; the
  banned-word scan applies to the rendered
  template only). (vitest: render each
  variant and scan rendered text; scan the
  summary-line matrix; scan the toast and
  409 copy.)

- [ ] Regression: the existing 0018 / 0020
  Practice Arc surface is BYTE-IDENTICAL
  on every NON-empty state (the hint
  appears ONLY in the empty state with
  sufficient coverage; every other arc-
  rendered surface is unchanged). The
  existing 0018 arc write primitive is
  BYTE-IDENTICAL (the adopt POST calls the
  same write path; the call sequence is
  the same as a hand-built arc). The
  existing 0030 first-artifact activation
  surface is BYTE-IDENTICAL (the
  activation flow is unchanged; the hint
  is a Practice Arc surface, not an
  activation surface). The existing 0034
  / 0037 / 0066 same-coach arc / artifact
  surfaces are BYTE-IDENTICAL. The
  existing 0071 / 0077 cross-program /
  cross-program-director surfaces are
  BYTE-IDENTICAL. (vitest: snapshot the
  named routes / components against
  seeded fixtures pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture:
  seed extension is — pre-mint a SECOND
  team in the E2E org with the SAME
  `age_group` and `sport_id` as the E2E
  sign-in coach's team but a DIFFERENT
  team_id (the "last year's U10 Hawks
  boys" analogue) AND a DIFFERENT coach
  owning it via `team_coaches`, AND 14
  PLANS for that second team across 8
  weeks last season with
  `skills_targeted` populated (weeks 2-4
  emphasize "closeouts," weeks 5-7
  emphasize "transitions"); per
  LESSONS#0057 — team-coach via
  `team_coaches`, NEVER `teams.coach_id`.
  Pre-clear any arc data on the E2E
  sign-in coach's team (the new-coach
  empty-state precondition). Per
  LESSONS#0084 — seed in the idempotent
  DELETE-then-INSERT block; every new
  coaches row has a matching
  `auth.users` row. Per LESSONS#0101 —
  UUIDs in the next free range (after
  0079 / 0080 / 0081 / 0082 reservations
  — confirm at pickup). Per
  LESSONS#0121 — `grep -n "U10\|U12"
  tests/e2e/fixtures/seed.sql` before
  writing the assertion; assert on
  age_group values that ARE seeded.
  Per LESSONS#0009 — the Practice Arc
  surface is likely a CLIENT component
  (confirm at pickup); the e2e mocks
  `/api/me` and lets the arc-history
  GET hit the seeded DB. Playwright
  spec: (a) sign in as the E2E coach;
  (b) navigate to the Practice Arc
  surface for the seeded team; (c)
  assert the arc renders the empty
  state; (d) assert the new
  `<ProgramArcHistoryHint />` renders
  with the summary line containing the
  program name + "closeouts" +
  "transitions" + week ranges; (e)
  assert the rendered text contains
  NO previous coach name (the
  attribution is program-scoped); (f)
  tap "Use this as my starting arc";
  (g) assert the POST returns 200 AND
  the arc surface now renders the
  seeded weeks; (h) re-navigate to
  the Practice Arc surface; assert
  the hint is GONE (the arc is no
  longer empty); (i) attempt the
  adopt POST again; assert the
  response is 409. Scope every
  assertion by `data-testid` per
  LESSONS#0022 / #0029 / #0082.
  Skip when E2E creds are unset.

## Out of scope

- A CROSS-PROGRAM arc-history surface
  (the program memory from a different
  program in the same region). v1
  caps at the SAME `org_id`; cross-
  program is a separate ticket with
  its own consent posture (the existing
  0075 / 0077 cross-program surfaces
  cap on the same boundary).
- A SHARED arc-write primitive (the
  new coach's edits SYNC back to the
  program's arc memory in real time).
  v1 is a one-shot SEED at adopt
  time; the new coach owns the arc
  data from there. Sync is a v2
  ticket with its own conflict
  posture.
- AN AI-WRITTEN arc rationale ("here's
  why weeks 2-4 emphasized closeouts").
  v1 is deterministic aggregation;
  AI-written rationale is a separate
  ticket with its own voice-anchoring
  contract.
- A SUMMARY of the PREVIOUS COACH's
  individual style (the existing 0037
  same-coach cross-team style). v1
  attributes the arc shape to "the
  program," NEVER to a named
  predecessor; the previous coach's
  identity is invisible by design.
- A NOTIFICATION to the previous
  coach ("your arc shape was adopted
  by this season's coach"). v1 is
  silent on the previous coach's
  side (the previous coach may be
  dormant; the existing 0072 / 0078
  dormant-coach surfaces handle
  reactivation; the arc-adopt does
  NOT fire a separate signal). A
  v2 ticket could close this loop.
- A MULTI-SEASON aggregate
  (`seasonLookback >= 2` is
  available via the param, but
  v1's surface defaults to 1 and
  the hint copy speaks in terms of
  "last year"). Multi-season
  surfaces are a v2 affordance.
- A SUGGESTION when the arc has
  DATA but is still in week 1
  ("here's how the program's arc
  shape compares to yours"). v1
  is empty-state only; mid-arc
  hints are a separate ticket.
- A DIRECTOR-side dashboard for
  arc adoption ("of your N new
  coaches, M adopted the program
  arc"). v1 surfaces the data;
  director analytics are a
  separate ticket.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/program-arc-utils.ts` (new) — pure helper.
  Mirror the shape of the existing 0071 in-program
  emergent-focus utils for shape cohesion (real
  path at pickup per LESSONS#0096).
- `src/lib/program-arc-summary.ts` (new) — pure
  helper for the deterministic summary-line
  composer. Per LESSONS#0023 — the helper has its
  own banned-word matrix scan.
- `src/app/api/program/arc-history/route.ts` (new)
  — `GET(request)`. Per LESSONS#0036 — `.select()`
  allow-lists. Per LESSONS#0049 / #0092 / #0100 /
  #0110 / #0118 — Glob `tests/api/program*` AND
  `tests/api/arc*` AND `tests/api/plans*` at pickup
  and extend every queue + broaden every
  whitelist for the new reads. Per LESSONS#0058 —
  authed route; no publicPaths change.
- `src/app/api/program/arc-history/adopt/route.ts`
  (new) — `POST(request)`. Calls the EXISTING 0018
  arc-write primitive (real path at pickup); the
  call is the same as a hand-built arc. Per
  LESSONS#0036 — `.select()` allow-lists. Per
  LESSONS#0057 — team-coach via `team_coaches`,
  NEVER `teams.coach_id`.
- `src/components/plans/program-arc-history-hint
  .tsx` (new). `data-testid="program-arc-history-
  hint"`, `data-testid="program-arc-history-
  adopt"`, `data-testid="program-arc-history-
  summary"`. Mounted on the existing 0018 / 0020
  Practice Arc empty state (real path at pickup).
  Per LESSONS#0065 / #0066 / #0162 — smallest
  possible touch.
- The existing 0018 / 0020 Practice Arc surface
  (real path at pickup per LESSONS#0096). One
  import + one JSX entry in the empty-state
  branch. Per LESSONS#0027 — no set-controlled
  state in the visibility effect dep list.
- `src/lib/tier.ts` — NO new feature key.
- `src/components/ui/upgrade-gate.tsx` — NO new
  registration.
- `src/lib/supabase/middleware.ts` — NO change
  (the new routes are authed).
- `tests/lib/program-arc-utils.test.ts` (new) —
  every helper case.
- `tests/lib/program-arc-summary.test.ts` (new) —
  every summary-line composer case.
- `tests/api/program-arc-history.test.ts` (new) —
  every GET case.
- `tests/api/program-arc-history-adopt.test.ts`
  (new) — every adopt POST case.
- `tests/components/program-arc-history-hint
  .test.tsx` (new) — every render case.
- `tests/api/program*.test.ts` AND
  `tests/api/arc*.test.ts` AND
  `tests/api/plans*.test.ts` (existing — Glob at
  pickup per LESSONS#0110) — extend every
  `mockReturnValueOnce` queue AND broaden every
  `mockImplementation((table) => ...)` whitelist
  for the new reads. Per LESSONS#0116 — empty
  Glob is a no-op.
- `tests/e2e/program-arc-history-flow.spec.ts`
  (new). Seed extension per the AC. UUIDs in
  the next free range per LESSONS#0101. Per
  LESSONS#0121 — grep the seed for the
  age_group / sport_id values BEFORE writing
  the assertion. Skip when E2E creds are
  unset.
- New deps: NO. Migration: NO. Env vars: NO
  new. AI prompt change: NO. Tier feature
  key: NO new key.
- LESSONS to anchor: #0009 (the Practice Arc
  surface is likely a CLIENT component per
  the 0036 lesson — confirm at pickup), #0020
  / #0038 (.test.ts), #0022 / #0029 / #0082
  (data-testid scoping), #0023 (positive
  voice; mirror existing 0018 / 0071 / 0077
  voice; the summary line composer asserts
  banned-word matrix), #0027 (no set-
  controlled state in the visibility effect
  dep list), #0033 (commit multi-line /
  special-char strings via heredoc), #0034 /
  #0088 / #0114 (strip `--` comments AND
  structural identifiers on COPPA sweep —
  applies only if a migration lands; v1 has
  none), #0036 (best-effort `.select()`
  allow-lists), #0049 / #0092 / #0100 /
  #0110 / #0118 (mock queue + whitelist
  spillover — Glob every program / arc /
  plans test), #0055 (route handler call
  posture), #0057 (team-coach via
  `team_coaches`, NEVER `teams.coach_id`),
  #0058 (authed route; no publicPaths
  change), #0061 (literal space on
  defensive scans), #0063 (scope leak
  assertions to rendered shapes, not bare
  digits), #0065 / #0066 / #0162 (Practice
  Arc hotspot — smallest possible touch;
  extend the existing empty-state, do not
  duplicate the surface), #0072 (never
  `delete` a field on a DB-read object —
  spread to a new object), #0084 / #0101
  (seed posture; UUID range), #0096 (schema
  wins over prose — at pickup read the
  actual 0018 / 0020 Practice Arc surface
  shape, the actual arc-write primitive,
  the actual `plans.skills_targeted` shape,
  the actual `season_week` column or its
  derivation, the actual 0024 program-
  staff scope), #0103 (additive widening
  on shared types), #0112 (widen an
  existing plans read over a new from()
  if possible), #0116 (Glob sweep that
  returns empty is a no-op), #0118
  (broaden sibling whitelists for the
  new `plans` reads), #0121 (grep the
  seed for the age_group / sport_id /
  named skills BEFORE writing the e2e
  assertion).

## Implementation log

- 2026-06-15 [implementation-dev] Picked up. Branch `feat/0083-program-arc-history`. Status → in-progress (file + index).

### Pickup-time schema reconciliation (LESSONS#0096 — schema wins over prose)

The ticket prose talks as if `plans` rows directly carry `org_id`, `age_group`,
`sport_id`, and `season_week`. Reading the real schema (`src/types/database.ts`):

- `plans` carries `team_id, coach_id, type, title, content, content_structured,
  curriculum_week, skills_targeted, is_shared, share_token, share_expires_at,
  completed_drill_ids, source_plan_id, created_at`. NO `org_id`, NO
  `age_group`, NO `sport_id`, NO `season_week`.
- `teams` carries `org_id, sport_id, age_group, season, season_weeks,
  current_week`. The aggregation join is `plans` → `teams` → (org_id,
  age_group, sport_id).
- Existing 0071 precedent (`src/app/api/org/emergent-focus/route.ts`,
  `src/lib/emergent-focus-utils.ts`): the pure helper takes a `PlanRow` whose
  shape is `{ team_id, skills_targeted, created_at }`, and the ROUTE is
  responsible for the team→org join.

Reconciliation:
- The helper `computeProgramArcShape` is shaped per the ticket but the input
  rows carry only `team_id, skills_targeted, created_at, curriculum_week`
  (curriculum_week is the real `season_week` equivalent on the plans table —
  the existing column name per the schema). The route is responsible for
  joining team→(org_id, age_group, sport_id) and pre-filtering before
  calling the helper. The opts struct still carries `orgId`, `ageGroup`,
  `sportId`, `seasonLookback`, etc. — the helper enforces every filter on
  the FILTERED ROW SET it's handed.
- Per LESSONS#0066 — favor widening over a new `from()`. The route does ONE
  `teams` read (id, org_id, age_group, sport_id) filtered by the program +
  age_group + sport_id, then ONE `plans` read (team_id, skills_targeted,
  created_at, curriculum_week) `.in('team_id', programTeamIds)`. Both reads
  use explicit allow-list selects per LESSONS#0036.

### Practice Arc surface reconciliation

The "0018 / 0020 Practice Arc surface" is the practice-arc generator card
inside `src/app/(dashboard)/plans/page.tsx`. The "empty state" the ticket
references is "this team has no `practice_arc` plans yet" — i.e. the coach
has not generated their own arc. The component renders only when:
- `activeTeam` is set
- the team has zero plans of type `practice_arc`
- the GET returns `coverage: 'sufficient'`

The "adopt arc" write is the SAME `plans.insert({ type: 'practice_arc',
content_structured: <arc> })` the existing 0018 generator route fires. The
adopt POST mirrors that insert deterministically (no AI call).

### Mock-queue + whitelist sweep (LESSONS#0049 / #0092 / #0110 / #0118)

Glob `tests/api/program*.test.ts` returns 3 files: the two
program-director-invites tests (don't touch plans) and
`tests/api/program-cross-program-pulse.test.ts` (a `mockImplementation`
table-keyed whitelist — extension is N/A since the new route is its own).
Glob `tests/api/arc*.test.ts` returns 0 files (LESSONS#0116 — empty Glob is
a no-op). Glob `tests/api/plans*.test.ts` returns 0 files. No mock-queue
extension required.
