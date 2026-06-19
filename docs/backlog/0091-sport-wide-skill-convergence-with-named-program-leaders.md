---
id: 0091
title: When a coach opens Capture for a skill they're working this week and 25+ programs across the entire sport are converging on the same skill — beyond their own program and the 3-coach 0075 cross-program signal — surface ONE line naming the TWO most-shipped programs working it ("Hawks Basketball and Riverside U10 published 6 closeout plans this week") with the named program-director first names, so the cross-PROGRAM moat (0075 / 0077 / 0083) widens to a cross-LEAGUE / cross-REGION moat and "what's happening in my sport right now" becomes the line only SportsIQ can produce
status: in-progress
priority: P1
area: capture
created: 2026-06-18
owner: product-groomer
---

## User story

As a volunteer coach who opened Capture on Tuesday at 5:45pm to start
observing tonight's practice on closeouts — having seen the existing 0075
"three coaches in your sport are on closeouts too" line for the last
month — I want the line under the existing 0075 surface to widen by one
honest order of magnitude: instead of "three coaches in your sport are on
closeouts too," ONE additional line that says "Hawks Basketball (Director
Riya) and Riverside U10 (Director Ben) have published 6 closeout plans
this week — 25 programs across basketball are working closeouts right
now," with the same defensive scarcity bar so the line ONLY fires when
the convergence is real (25+ programs, not 3), and the named programs
are the TWO most-shipping programs on this skill in the last 7 days
named publicly by their PROGRAM NAME and their DIRECTOR FIRST NAME, so I
know who in the league is leaning into this work and the next time I
need a closeout drill I have somewhere to look — and a screenshot of
that line is the first one I send my coaching friend at Hornets U10
who asked me last week "is anything happening in basketball coaching
this fall."

## Why now (four lenses)

### Product Owner

The product has shipped THREE cross-program signal surfaces: 0073
(coach reputation on league discovery — names individual coaches by
cross-program clone count), 0075 (cross-program skill convergence on
Capture — counts 3+ coaches in OTHER programs in the same sport this
week), and 0077 (cross-program director peer pulse — names 2
neighboring programs on the director surface). Each crosses a real
boundary. What is MISSING — flagged by the strategy audit
(`docs/STRATEGY_AUDIT_2026-06-15.md`) — is the NEXT scale axis: the
SPORT-WIDE convergence signal across 25+ programs at the LEAGUE / REGION
scope, named not by "3 coaches" but by "25 programs and the 2 leading
programs by name." 0075's bar is 3 coaches in OTHER programs in the same
sport this week — useful but small. 0091's bar is 25 PROGRAMS shipping
the same skill this week across the entire sport — a structurally
different signal that requires the platform to have THAT MUCH supply
in a single sport, which it does (the sitemap, the program registry,
the existing 0044 / 0064 cross-program drill graph). The smallest
meaningful unit of value is: (a) a new pure helper
`computeSportWideConvergence({ skillId, sportId, planRows, programRows,
nowMs, minPrograms, maxNamedPrograms })` that takes the union of all
plans across the sport mentioning the target skill in the last 7 days,
groups by `org_id`, counts the DISTINCT programs, and returns the TOP-N
programs by plan-count (with director first name attached) when
`distinctProgramCount >= minPrograms` (default 25); (b) a new GET
`/api/sport-wide-convergence?skillId=<uuid>&sportId=<uuid>` (authed;
coach-only — every signed-in coach can read the cross-sport pulse for
ANY skill in their sport) that returns the shape `{ eligible: boolean;
distinctProgramCount: number; totalPlanCount: number; namedPrograms:
Array<{ orgId: string; programName: string; directorFirstName: string;
planCount: number; ageGroupsServed: string[] }>; eligibilityReason?:
'too_few_programs' | 'no_skill_match' }`; (c) extension of the
existing 0075 Capture surface (read at pickup per LESSONS#0096; the
0075 ticket shipped a small `<CrossProgramSkillConvergenceLine />`
or similar component — verify the exact mount point) to render ONE
ADDITIONAL line UNDER the existing 0075 line when the route returns
`eligible: true`; the new line names the program count + the top 2
programs by name + the director first names; (d) program-side OPT-OUT
hook in the existing 0026 / 0033 coach-profile / program-claim
settings surfaces so a director can OPT THEIR PROGRAM OUT of being
named on the sport-wide pulse (the convergence still COUNTS them in
the program-count aggregate — there is no anonymity for the
quantity signal, just for the named-program signal — but they are
not surfaced by name); the opt-out lives on the existing
`organizations` row (`opted_out_of_sport_pulse BOOLEAN DEFAULT
FALSE` — see migration AC). NO new AI call. NO change to the
existing plan or drill schema. NO change to the tier price.

### Stakeholder

This is the moat-deepening primitive that finally crosses the LEAGUE /
REGION boundary — the next axis the strategy audit named explicitly
("cross-program / cross-league moats — what's the next axis of 'you
can only get this on SportsIQ'"). Three compoundings, each structurally
hard for a forms-app competitor to replicate. (1) The
supply-density-required compound — a sport-wide convergence signal at
the 25-program bar requires 25 programs ACTIVELY USING the platform on
the same skill in the same week — a supply density only SportsIQ has
in the sports it has saturated (basketball, soccer, volleyball, flag
football per the shipped sport_seeds). The signal CANNOT exist on a
competitor until they have 25 programs deep in a sport, which is a
multi-year supply problem. (2) The named-leader compound — the line
NAMES the 2 most-shipping programs by their public program name and
their director's first name. This converts the abstract "your sport is
working on X" pulse into a concrete "Hawks Basketball is leading this
work" reference the coach can act on (tap to view the program's public
0026 / 0033 / 0038 surface; reach out to the director via the existing
0077 director-pulse posture). The leader-naming is a structural
endorsement of the leading programs by SportsIQ — a programmatic
signal the platform produces because it has the underlying graph; no
competitor can produce it without the same graph. (3) The director-tier
retention compound — every program NAMED on the sport-wide pulse for a
skill is a program whose director's churn risk drops structurally
(being named on the league-wide pulse is a positional good the
director would lose by leaving). The named-program signal is the
existence-proof that the platform recognizes a director's work at
LEAGUE scale, not just within their own program. Per the strategy
audit — "cross-program / cross-league moats — what's the next axis of
'you can only get this on SportsIQ'"; this is exactly that axis,
scoped to the SPORT and the WEEK so the signal is real-time and
specific.

### User (Sarah, the basketball U10 coach, opens Capture on a Tuesday
at 5:45pm to start observing tonight's closeout practice)

She opens Capture. She picks the closeout skill (the existing 0014 /
0018 practice-arc-driven skill picker). The Capture surface loads.
At the top, the existing 0075 line: "three coaches in your sport are
on closeouts too — Coach Maya in Hornets U10 is running the
recovery-tag variant." Underneath that, ONE NEW LINE: "Hawks
Basketball (Director Riya) and Riverside U10 (Director Ben) have
published 6 closeout plans this week — 25 programs across basketball
are working closeouts right now." The line is in zinc-500, matches
the existing 0075 visual treatment, has ONE tappable phrase ("25
programs across basketball") that opens a small overlay showing the
program names + age groups served + how many plans each shipped. She
reads the line. She does not need to click through. She has a new
piece of context: this week, the sport she coaches is leaning into
closeouts in a real-numbered way, and the two most-shipping
programs are named. She starts the practice with a different mental
weight on the work — it is not just her team's drill, it is the
sport's drill this week. After practice, she screenshots the line
and sends it to her friend at Hornets U10. On a flaky gym wifi, the
line renders from the route's payload bundled with the existing
0075 read (one round-trip, not two); the overlay lazy-loads on tap.
The line NEVER fires when the program count is below 25 (silence
beats nag — the bar is intentional).

### Growth

The "show me" moment is the LINE itself — "Hawks Basketball
(Director Riya) and Riverside U10 (Director Ben) have published 6
closeout plans this week — 25 programs across basketball are
working closeouts right now." That is a screenshot a coach sends
to a coaching friend at a different program with one line ("look
what SportsIQ told me my sport was working on this week"); the
screenshot is the highest-quality programmatic signal the
platform can produce because every named program / director /
count is real and earned by on-platform activity. Three
compoundings. (1) The screenshot-to-coach-network compound — the
line is the testimonial for SportsIQ's sport-density value
proposition; it is the answer to "what's happening in basketball
coaching" that no competitor can produce. (2) The director-
network compound — every NAMED director on the sport-wide pulse
is a director who hears about the named placement (the existing
0073 / 0076 reputation surface fires for individual coaches; this
ticket adds a sibling surface for the DIRECTOR — the 0091
director-side notification is in scope as a small adjacent
surface — see AC below). Named directors share their named
placement, recruiting other directors. (3) The supply-loop
compound — every coach who sees the line and acts on it (picks a
drill from one of the named programs via the existing 0044 /
0055 cross-program discovery) feeds the supply of sport-wide
plans for the next week's convergence; the line is a one-tap
accelerator on the existing supply graph, the rare growth surface
that compounds on the platform's existing supply, not on new
external acquisition. Per the strategy audit — "the next axis of
'you can only get this on SportsIQ'."

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper `src/lib/sport-wide-convergence.ts`
  exports `computeSportWideConvergence(args: { skillId: string;
  sportId: string; planRows: Array<{ id: string; org_id: string;
  created_at: string; skills_targeted: string[]; sport_id: string;
  age_groups: string[] }>; programRows: Array<{ id: string; name:
  string; director_first_name?: string; opted_out: boolean;
  age_groups_served: string[] }>; nowMs: number; minPrograms?:
  number; maxNamedPrograms?: number }): { eligible: boolean;
  distinctProgramCount: number; totalPlanCount: number;
  namedPrograms: Array<{ orgId: string; programName: string;
  directorFirstName: string; planCount: number; ageGroupsServed:
  string[] }>; eligibilityReason?: 'too_few_programs' |
  'no_skill_match' }`. The helper: (a) filters `planRows` to
  plans where `sport_id === sportId` AND `skills_targeted`
  includes `skillId` AND `created_at` is within the last 7 days
  of `nowMs`; (b) groups by `org_id` and counts distinct
  `org_id` (the program count) AND total plans; (c) returns
  `eligible: false, eligibilityReason: 'too_few_programs'` when
  `distinctProgramCount < minPrograms` (default 25); (d) joins
  `programRows` and EXCLUDES opted-out programs from the named
  list (but DOES count them in `distinctProgramCount` — the
  quantity is honest, just the names are private); (e) returns
  the top `maxNamedPrograms` (default 2) programs by
  `planCount` descending, with ties broken alphabetically by
  `programName` for determinism; (f) `directorFirstName` is
  taken from the program row when present, otherwise the entry
  is excluded from `namedPrograms` (no naming without a
  director). Pure function, reads no DB. Per LESSONS#0023 —
  instruct positively in jsdoc; never embed a verbatim
  ban-list. Per LESSONS#0061 — literal-space defensive surname
  scan on director first names. Per LESSONS#0070 — never
  mutate the input arrays. (vitest under
  `tests/lib/sport-wide-convergence.test.ts` — new): (i)
  empty input → `eligible: false`; (ii) 10 programs, 50
  plans → `eligible: false, eligibilityReason:
  'too_few_programs'`; (iii) 25 programs, 60 plans → eligible,
  top 2 named; (iv) 50 programs → eligible,
  `distinctProgramCount: 50`, still only top 2 named; (v) one
  named program is opted-out → excluded from `namedPrograms`
  but INCLUDED in `distinctProgramCount`; (vi) plan older
  than 7 days → not counted; (vii) plan in a different sport
  → not counted; (viii) plan without the target skill →
  not counted; (ix) ties broken alphabetically; (x)
  deterministic across input order; (xi) `directorFirstName`
  missing → program excluded from named list; (xii) planted
  surname-shaped strings fail the literal-space scan; (xiii)
  no banned word in any rendered field.

- [ ] A new authed `GET /api/sport-wide-convergence` route. Query
  params: `skillId: string; sportId: string`. The route: (a)
  reads the caller's `coach_id` from the session (any authed
  coach can read); (b) reads `plans` filtered by `sport_id`,
  the `skills_targeted` array contains, and `created_at >=
  now() - 7 days` via a narrow `.select()` allow-list
  (`id`, `org_id`, `created_at`, `skills_targeted`,
  `sport_id`, `age_groups` — never `content`, never
  `content_structured`, never `coach_id`); (c) reads the
  distinct `org_id` set's `organizations` rows
  (`id`, `name`, `opted_out_of_sport_pulse`, `age_groups`
  derived from the existing `team_coaches` + `teams` joins)
  AND the director's `coaches.first_name` (the existing
  `coaches.role === 'admin'` for the org per LESSONS#0087);
  (d) calls `computeSportWideConvergence`; (e) returns the
  result. Per AGENTS.md rule 3 — `createServiceSupabase()`.
  Per LESSONS#0036 — narrow `.select()` allow-lists; NEVER
  reads `coaches.email`, `coaches.phone`,
  `coaches.full_name` surname, `players.*`,
  `plans.content`, `plans.content_structured`. Per
  LESSONS#0044 — auth check load-bearing. Per LESSONS#0049
  / #0092 / #0100 / #0110 — at pickup Glob
  `tests/api/sport*.test.ts` AND
  `tests/api/program*.test.ts` AND extend every
  `mockReturnValueOnce` queue (per LESSONS#0116 —
  document empty-Glob no-op if no matches; per
  LESSONS#0071 — verify the actual test-file naming
  pattern before promising a sweep). Per LESSONS#0057 —
  `team_coaches` not `teams.coach_id`. Per LESSONS#0080
  — filter-aware fixtures on chain mocks for `.in()`
  reads. Per LESSONS#0083 — the mock semantics must
  mirror SQL filter for distinct-org counting. Per
  LESSONS#0118 — broaden any strict-whitelist sibling
  mocks. Per LESSONS#0078 — when reading
  `organizations.name` via a join, verify the actual
  cross-table column shape (the ticket prose is a
  sketch; the real `organizations` schema is the
  source of truth). (vitest under
  `tests/api/sport-wide-convergence.test.ts` — new):
  (i) unauthed caller → 401; (ii) 10 programs → 
  `eligible: false, eligibilityReason:
  'too_few_programs'`; (iii) 25 programs with 2 director-
  named → eligible with 2 named; (iv) 50 programs with 1
  opted-out → 50 in the count, opted-out excluded from
  named; (v) skillId not in the sport's curriculum → 
  `eligible: false, eligibilityReason: 'no_skill_match'`;
  (vi) the response is BYTE-IDENTICAL across the matrix
  (additive only); (vii) planted `coaches.email` /
  `coaches.phone` / `plans.content` /
  `plans.content_structured` / `players.*` on every
  joined row are NEVER read; (viii) the route's chain
  mocks are filter-aware per LESSONS#0080.

- [ ] A new migration
  `supabase/migrations/076_organizations_opt_out_sport_pulse.sql`
  adds the opt-out column. Per LESSONS#0006 — confirm
  `076` is the next free integer at pickup (0088 ships
  `073`, 0089 ships `074`, 0090 ships `075`). Schema:
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS
  opted_out_of_sport_pulse BOOLEAN NOT NULL DEFAULT
  FALSE`. NO descriptive minor field. Per LESSONS#0067 —
  the column NAME does not contain a banned token, but
  the migration's header comment should anchor the
  COPPA boundary explicitly ("opt-out is a program-
  scoped switch; no player data is involved"). Per
  LESSONS#0088 — strip `--` comments before banned-token
  sweep. Per LESSONS#0094 — service-role GRANTs in the
  same migration (re-grants for organizations table
  default-privilege). (vitest under
  `tests/migrations/076-organizations-opt-out-sport-pulse.test.ts`
  — new): scan migration body with `--` stripped;
  column allow-list; default value; service-role
  GRANT block present; NO new column on any sacred
  table apart from this one.

- [ ] A new authed `POST /api/admin/sport-pulse-opt-out` route.
  Body: `{ orgId: string; optedOut: boolean }`. The route:
  (a) validates the caller is a director on the org
  (per LESSONS#0087 — `coaches.role === 'admin'`); (b)
  writes `organizations.opted_out_of_sport_pulse =
  <optedOut>`. Per AGENTS.md rule 3 — service-role
  write. Per LESSONS#0044 — auth + role gate
  load-bearing. Per LESSONS#0072 — never mutate a
  DB-read row reference. (vitest under
  `tests/api/admin-sport-pulse-opt-out.test.ts` — new):
  (i) director toggles opt-out true → succeeds, row
  updated; (ii) director toggles back false → succeeds;
  (iii) non-director caller → 403; (iv) cross-org
  caller → 403; (v) unauthed → 401.

- [ ] Extend the existing 0075 Capture surface mount point
  to render the new sport-wide line UNDER the existing
  0075 line. Verify the exact path at pickup per
  LESSONS#0096 — the 0075 ticket shipped a small
  component on the Capture page; the closest reference
  is `src/components/capture/cross-program-skill-
  convergence-line.tsx` or similar. The extension: ONE
  ADDITIONAL line component
  `src/components/capture/sport-wide-convergence-line.tsx`
  rendered immediately under the 0075 line when the new
  route returns `eligible: true`. The line: (a) headline
  copy: "<P1> (Director <D1>) and <P2> (Director <D2>)
  have published <N> <skill_name> plans this week — <K>
  programs across <sport_name> are working <skill_name>
  right now"; (b) the tappable phrase ("<K> programs
  across <sport_name>") opens a small overlay listing
  the named programs + age-groups; (c) when only ONE
  program is director-named, render the singular
  variant ("<P1> (Director <D1>) has published <N>
  <skill_name> plans this week — <K> programs across
  <sport_name> are working <skill_name> right now");
  (d) when ZERO programs are director-named (every
  qualifying program is opted-out), render the
  ambient variant ("<K> programs across <sport_name>
  are working <skill_name> this week") — no names;
  (e) `data-testid="sport-wide-convergence-line"` for
  scoped e2e per LESSONS#0029 / #0082. Per AGENTS.md
  voice — NO banned word; per LESSONS#0023 —
  instruct positively in jsdoc. Per LESSONS#0065 /
  #0066 / #0162 — smallest possible touch on the
  Capture surface. (vitest under
  `tests/components/sport-wide-convergence-line.test.tsx`
  — new): (i) `eligible: false` → line ABSENT; (ii)
  eligible with 25 programs + 2 named → renders both
  director names + program names + counts; (iii)
  eligible with 25 programs + 1 named → renders
  singular variant; (iv) eligible with 25 programs +
  0 named → renders ambient variant (no names); (v)
  tapping the count phrase opens the overlay; (vi)
  the overlay lists the named programs; (vii) no
  banned word across every fixture variant; (viii)
  the existing 0075 line is BYTE-IDENTICAL
  (the new line is additive UNDER the 0075 line).

- [ ] A new optional notification surface for a NAMED
  director: when a director's program is named on the
  sport-wide pulse for the first time in a week, write
  a row to `coach_first_signal_celebrations` (REUSE
  the 0088 table per LESSONS#0066) with `kind:
  'sport_pulse_named'` (widen the CHECK enum in this
  ticket's migration per LESSONS#0054); the existing
  0088 first-cross-coach-signal card surfaces this as
  ONE more variant — "Your program was named on this
  week's basketball sport pulse — Hawks Basketball
  (Director Riya) and YOU led closeouts." (vitest
  under `tests/api/sport-pulse-name-notification.test.ts`
  — new): (i) director's program is in `namedPrograms`
  for the first time → celebration row written; (ii)
  same program named the next week → idempotent (one
  row per kind per coach per LESSONS#0088 schema);
  (iii) opted-out program is NEVER named in
  celebration (the opt-out is honored upstream); (iv)
  director surface renders the celebration through the
  existing 0088 card variant when 0088 has shipped;
  if 0088 has not shipped at pickup, the dev SKIPS
  this AC and documents in the Implementation log per
  LESSONS#0096 — the celebration write is harmless
  without a reader. The migration's CHECK-enum widen
  is conditional on 0088 having shipped; if not, the
  dev creates the row anyway with the kind enum
  including this kind from the start, in a single
  migration the dev coordinates.

- [ ] Tier / feature gating: the sport-wide convergence
  READ is a FREE affordance — every authed coach can
  read the pulse for any skill in their sport. This is
  load-bearing for the supply-loop compound: gating
  the signal behind a tier defeats the entire
  sport-wide moat thesis (a coach who has to upgrade
  to see the pulse never sees it, and the surface
  produces no acquisition signal). The DIRECTOR
  OPT-OUT POST is also FREE — every director can opt
  their program out regardless of tier; privacy
  trumps growth. NO new tier feature key. The
  `TIER_LIMITS` numbers are BYTE-IDENTICAL. (vitest:
  free coach → route returns eligible payload when
  bar is met; Coach-tier coach → same; Pro coach →
  same; Org coach → same.)

- [ ] Privacy / COPPA contract: the route reads ONLY
  `plans.id`, `plans.org_id`, `plans.created_at`,
  `plans.skills_targeted`, `plans.sport_id`,
  `plans.age_groups`, `organizations.id`,
  `organizations.name`, `organizations.opted_out_of_
  sport_pulse`, the `team_coaches` join for the
  director discovery, `coaches.first_name` (split off
  `full_name`), `coaches.role`. NEVER reads
  `coaches.email`, `coaches.phone`,
  `coaches.full_name` surname, `players.*`,
  `players.parent_email`, `players.dob`,
  `plans.content`, `plans.content_structured`. The
  rendered line NEVER shows a coach's surname (first
  name only per the 0021 / 0074 / 0086 / 0087
  posture); NEVER shows a player's name; NEVER
  shows a coach's email; NEVER shows the BODY of any
  plan — only the count and the program name and the
  director first name. Per LESSONS#0036 / #0070 —
  `.select()` allow-lists; never mutate the DB row.
  Per LESSONS#0061 / #0063 — literal-space + shape-
  scoped defensive scans on rendered fixtures. The
  ambient variant (no names) is the privacy floor
  for opted-out programs; the line ALWAYS has the
  ambient variant available so the count signal can
  fire without naming. (vitest: planted
  surname-shaped strings, planted player names,
  planted plan body content on every joined row are
  NEVER read; the rendered text passes the surname /
  minor-field / jersey-shape / plan-body regex
  sweep; an org with `opted_out_of_sport_pulse =
  true` is NEVER named in the rendered line.)

- [ ] Voice contract: every rendered user-facing
  string (the line variants — full, singular,
  ambient — and the overlay copy and the director-
  notification celebration) contains NO AGENTS.md
  banned word per LESSONS#0023. Instruct positively
  in every helper / component jsdoc; never embed a
  verbatim ban-list per LESSONS#0023 / #0034 / #0088.
  Anti-AI-slop defensive list specific to this
  surface: ["everyone is doing it", "trending",
  "viral", "hot right now", "popular this week"].
  The line voice is CLIPBOARD — counted facts and
  named programs, no superlatives. (vitest: render
  every variant across the program / count / opt-out
  / single-named / zero-named matrix and scan.)

- [ ] Regression: the existing 0075
  cross-program-skill-convergence line is
  BYTE-IDENTICAL (the new line renders BENEATH it
  when 0075 fires; when 0075 does NOT fire,
  this ticket's line may still fire independently —
  document the independence). The existing
  `organizations` table is BYTE-IDENTICAL apart
  from the additive boolean column (LESSONS#0103).
  The existing Capture surface is BYTE-IDENTICAL
  when the route returns `eligible: false` (the
  new line is absent). The existing
  `coach_first_signal_celebrations` table (0088)
  is BYTE-IDENTICAL apart from the widened CHECK
  enum (additive per LESSONS#0103 / #0054). The
  0035 resume primitive is BYTE-IDENTICAL. (vitest:
  snapshot the Capture surface, the
  `organizations` writes, the
  `coach_first_signal_celebrations` reads
  pre- and post-change with planted fixtures.)

- [ ] Seeded e2e on the 0006 fixture: seed extension
  is — pre-mint 25 seeded organizations + 25
  seeded directors (one per org, with deterministic
  first names per LESSONS#0079 — "Riya", "Ben",
  "Maya", "James", "Lin", "Tara", "Aisha", "Kai",
  "Sam", "Bo", "Eli", "Noah", "Ava", "Mia", "Zoe",
  "Owen", "Jude", "Cora", "Theo", "Iris", "Hugo",
  "Vera", "Leo", "Nico", "Anya"); pre-mint ONE
  plan per program in the last 7 days targeting
  the closeout skill in basketball; mark THREE
  of the 25 organizations as
  `opted_out_of_sport_pulse: TRUE` (so the named
  list excludes them; the count INCLUDES them).
  UUIDs in the next free range per LESSONS#0101;
  jsonb seed values (e.g. `skills_targeted`)
  quoted per LESSONS#0085. `auth.users` + `coaches`
  rows in the same idempotent block per
  LESSONS#0084. Per LESSONS#0094 — service-role
  GRANTs in the new migration cover the new column.
  Playwright spec: (a) sign in as the seeded E2E
  coach (basketball U10), (b) navigate to /capture
  for a session targeting closeouts, (c) assert the
  sport-wide-convergence line renders scoped by
  data-testid AND names 25 programs AND names the
  top 2 director-named programs (the TOP-2 by
  plan count, with ties broken alphabetically), (d)
  tap the count phrase and assert the overlay
  shows the named programs, (e) sign out and sign
  in as one of the OPTED-OUT directors, navigate
  to /admin, toggle opt-out OFF via the new POST
  route surface, (f) sign in back as the E2E
  coach, refresh /capture, assert the now-named
  program appears in the line (the named list
  reflects the toggle). Scope every assertion by
  data-testid. Skip when E2E creds are unset.

## Out of scope

- A SPORT-WIDE pulse at lower thresholds (5, 10 programs).
  v1 is 25+ only; below that 0075 already covers the
  3-coach scale and the bar is intentional.
- A CROSS-SPORT pulse (e.g. "basketball AND volleyball
  programs are both on closeouts"). v1 is single-sport.
- A REGIONAL pulse (e.g. "12 programs in the Pacific
  Northwest are on closeouts"). v1 is sport-wide;
  regional sharding is a future surface.
- An EMAIL mirror of the line. v1 is in-product
  /capture only.
- A LEADERBOARD of "top programs this season by
  sport-pulse appearances." v1 surfaces only the
  CURRENT WEEK's leaders.
- An AI-derived "what these leading programs are
  doing differently" summary. v1 is counted facts
  + named programs; no LLM rewrite.
- A PUSH NOTIFICATION when a director's program is
  named on the pulse. v1 surfaces the named-program
  celebration only through the existing 0088 card
  variant if 0088 has shipped.
- A CHANGE to the underlying plan or drill schema.
  v1 reads existing data only.
- An OPT-OUT for INDIVIDUAL COACHES from the
  count aggregate. v1's opt-out is program-scoped
  only (the director owns the program's appearance).
- A RETROACTIVE backfill of the sport-pulse named
  celebration for the historical weeks before this
  ticket shipped. v1 fires forward only.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/sport-wide-convergence.ts` (new) — pure
  helper. Mirrors the shape of
  `src/lib/program-tier-state.ts` (0087),
  `src/lib/program-drill-canon.ts` (0090). Per
  LESSONS#0061 — literal-space defensive scan;
  per LESSONS#0023 — positive voice.
- `src/app/api/sport-wide-convergence/route.ts`
  (new) — `GET(request)` authed. Reads query
  string. Per LESSONS#0055 — pass a `Request` when
  the route reads `request.url`.
- `src/app/api/admin/sport-pulse-opt-out/route.ts`
  (new) — `POST(request)` authed; director-only.
- `src/components/capture/sport-wide-convergence-line.tsx`
  (new). Per LESSONS#0029 / #0082 — `data-testid`
  scoping. Per LESSONS#0065 / #0066 / #0162 —
  smallest possible touch on the Capture surface.
- The existing 0075 Capture mount point (read at
  pickup per LESSONS#0096; verify the actual file
  path) — ONE additional JSX mount of the new line
  UNDER the existing 0075 line. Per LESSONS#0065 —
  Capture is a hotspot; keep the touch surgical.
- The existing /admin director surface (read at
  pickup per LESSONS#0096; the 0087 reference is
  `src/app/(dashboard)/admin/page.tsx`) — ONE
  toggle UI for the sport-pulse opt-out on the
  director's program settings card (a new small
  component
  `src/components/admin/sport-pulse-opt-out-toggle.tsx`).
- `supabase/migrations/076_organizations_opt_out_sport_pulse.sql`
  (new). Per LESSONS#0006 — confirm `076` at
  pickup. Per LESSONS#0087 — no `WHERE NOW()`
  partial index. Per LESSONS#0088 — strip `--`
  comments before banned-token sweep. Per
  LESSONS#0094 — service-role GRANTs in the same
  migration. If 0088 has shipped at pickup, ALSO
  in this migration: DROP + ADD the CHECK
  constraint on `coach_first_signal_celebrations`
  to widen the enum with `'sport_pulse_named'`
  (per LESSONS#0054); if 0088 has NOT shipped at
  pickup, document the deviation in the
  Implementation log per LESSONS#0096 and skip
  the CHECK widen (the celebration AC degrades
  gracefully).
- `src/types/database.ts` — add the new
  `opted_out_of_sport_pulse` field on the
  `Organization` type (additive per
  LESSONS#0103). NO new domain type.
- `src/lib/tier.ts` — NO change. NO new feature
  key.
- `tests/lib/sport-wide-convergence.test.ts` (new).
- `tests/api/sport-wide-convergence.test.ts` (new).
- `tests/api/admin-sport-pulse-opt-out.test.ts` (new).
- `tests/components/sport-wide-convergence-line.test.tsx`
  (new).
- `tests/api/sport-pulse-name-notification.test.ts`
  (new — conditional on 0088).
- `tests/migrations/076-organizations-opt-out-sport-pulse.test.ts`
  (new).
- `tests/e2e/sport-wide-convergence-flow.spec.ts`
  (new). Seed extension per the AC. UUIDs in the
  next free range per LESSONS#0101. Skip when E2E
  creds are unset.
- New deps: NO. Migration: YES (076 or bump per
  LESSONS#0006). Env vars: NO. AI prompt change:
  NO. Tier feature key: NO new key.
- LESSONS to anchor: #0006 (migration prefix
  uniqueness), #0009 / #0054 (CHECK-constraint
  widen on existing enum), #0021 / #0023 (positive
  voice, no embedded ban-lists), #0029 / #0082
  (data-testid scoping), #0034 / #0067 / #0088
  (strip `--` comments AND structural identifier
  whitelisting on banned-word scan), #0036
  (`.select()` allow-lists), #0044 (auth check
  load-bearing), #0049 / #0064 / #0092 / #0100 /
  #0110 (mock queue sweeps including cross-file
  sweeps), #0055 (route handler signature — pass
  Request when reading request.url), #0057
  (team_coaches not teams.coach_id), #0061 /
  #0063 (literal-space + shape-scoped defensive
  scans), #0065 / #0066 / #0162 (smallest touch
  on capture surface — the Capture surface is
  a hotspot), #0066 (widen existing select),
  #0070 / #0072 (no DB-row mutate), #0078
  (verify cross-table join columns at pickup —
  schema wins over prose), #0079 (deterministic
  seeded first names), #0080 (filter-aware chain
  mocks for `.in()` distinct-program reads),
  #0083 (mock semantics must mirror SQL filter
  for distinct-program counting), #0084 / #0101
  (seed posture), #0085 (jsonb seed values for
  `skills_targeted` arrays), #0086 (the
  staff-invite reference for any cross-org
  director role check), #0087 (no WHERE NOW()
  partial index; `coaches.role === 'admin'`,
  not `is_admin`), #0094 (service-role GRANTs
  in migrations), #0096 (schema wins over
  prose — at pickup read the actual 0075
  Capture mount point, the actual
  `plans.skills_targeted` shape, the actual
  director-role check), #0103 (additive
  widening on both the response shape and the
  `organizations` column), #0115 (UTC-suffix
  parsed timestamps for the 7-day window),
  #0116 (empty-Glob no-op), #0118 (broaden
  strict-whitelist mocks),
  STRATEGY_AUDIT_2026-06-15.md (cross-program /
  cross-league moats — the next axis of "you
  can only get this on SportsIQ").

Depends on: 0026 / 0033 / 0038 (shipped — public
program surfaces, the existence of which makes
naming programs on the pulse safe), 0044
(shipped — drill-sequence cross-program graph,
the supply foundation), 0064 (shipped — drill
clone publishing, the cross-coach drill artifact),
0073 (shipped — coach reputation, the sibling
named-coach surface), 0075 (shipped — the
existing 3-coach cross-program signal this
ticket extends), 0077 (shipped — cross-program
director peer pulse, the director-side sibling
surface), 0088 (this batch — OPTIONAL; the
celebration AC degrades when 0088 has not
shipped; the dev coordinates per the
Implementation log).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-06-19 — branch `feat/0091-sport-wide-skill-convergence` opened
- 2026-06-19 — schema-wins-over-prose (LESSONS#0096) at pickup: the
  `plans` table has NO `sport_id`, `org_id`, or `age_groups` column
  (migration 001_schema.sql:277). Sport / org / age_group ALL come from
  the `teams` row via `plans.team_id`. The helper signature in the
  ticket prose is preserved literally (`planRows: { id, org_id,
  created_at, skills_targeted, sport_id, age_groups }`) — the route is
  responsible for the team→{org_id, sport_id, age_groups} join and
  hands the pre-shaped rows to the pure helper. 0075's
  `/api/sport/emergent-focus/route.ts` uses the same posture.
- 2026-06-19 — 0088 has shipped (status:shipped on the celebrations
  table migration 073). The CHECK enum DROP+ADD widen for
  `sport_pulse_named` is included in this migration per LESSONS#0009 /
  #0054. The celebration write AC is in scope.
