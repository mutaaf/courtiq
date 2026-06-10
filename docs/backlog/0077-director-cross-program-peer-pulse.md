---
id: 0077
title: When a program director opens the weekly pulse, show ONE quiet line about what directors of two neighboring programs are working on this week — "Riverside and Westview are both on transitions" — and let them bring one of those directors onto SportsIQ with one tap
status: shipped
priority: P1
area: growth
created: 2026-06-09
owner: product-groomer
---

## User story

As a program director who has six volunteer coaches under me, has been
on SportsIQ for three weeks, and opens the Monday "program pulse" (0028)
to skim what my coaches did last week, I want — when two or more
NEIGHBORING programs in my sport (within my region, NOT my own program)
are converging on the same skill emphasis this week — one honest quiet
line under the existing pulse cards reading "Riverside Basketball and
Westview Hoops are both leaning into transitions this week (12 of their
coaches' practices touched it)" with a single one-tap action to email
the Riverside director a SportsIQ invite, so the surface that exists
today to tell me about MY program also gives me one quiet credible
reason to talk to the program two miles down the road — and so the
director-to-director peer signal becomes the second viral channel
SportsIQ has been missing (today every viral path goes coach → coach
or parent → coach; the director-to-director path is empty).

## Why now (four lenses)

### Product Owner

The product has shipped a director-side stack but every director-facing
surface stops at the program boundary. 0024 invites the director's own
staff; 0028 is the Monday in-program pulse; 0031 sets one weekly focus
across the director's own coaches; 0065 lets a coach bring their own
director on; 0071 surfaces in-program skill convergence to the
director. NONE of those tell the director what is happening in
NEIGHBORING programs in their sport — and the only cross-program signal
the product has shipped so far is COACH-SIDE (0075 cross-program
emergent focus on Capture). What is MISSING is the DIRECTOR-side
analogue of 0075 — the surface that turns the cross-program coach
graph into a director-to-director peer signal AND a director-to-
director viral channel. The smallest meaningful unit of value is:
(a) a new pure helper `computeCrossProgramDirectorPulse(programs,
plans, opts)` that aggregates plans per program over the last 14 days,
computes the top emphasis skill per program, and finds the OTHER
programs in the same sport whose top skill is the SAME as the caller's
program (the "we're both on this" signal — the inverse cut from
0071 / 0075, here keyed on PROGRAM-vs-PROGRAM, not coach-vs-coach);
(b) a new `GET /api/program/cross-program-pulse?orgId=<uuid>` (authed,
director-only — the existing 0028 / 0031 / 0071 role check, real path
read at pickup per LESSONS#0096) that returns up to TWO neighboring
programs (with `name`, `top_skill`, `coach_practice_count`,
`director_contact_email` if known, `director_first_name` if known)
where the convergence threshold is `>= 2 neighboring programs AND >= 6
practices touching the skill across those programs in the window`;
(c) a small `<CrossProgramDirectorPulseLine />` mounted on the existing
0028 program-pulse page (read at pickup) below the existing
in-program section; (d) the line renders ONE inline action: "Invite
the Riverside director to compare notes" which fires the existing
0024 / 0065 director-invite POST with the surfaced
`director_contact_email` pre-filled AND a referrer attribution to
the inviting director. NO new tier feature key (director-tier
already gates 0028 / 0071); the cross-program pulse is bundled with
the existing director-tier feature, not a new gate. NO AI
generation. NO migration.

### Stakeholder

This is the moat-deepening primitive that opens the second viral
channel — director-to-director — that the product has not yet shipped.
Three compoundings, all structurally hard for a forms-app competitor
because they require BOTH a cross-program plan graph AND a region-
scoped director-identity layer, both of which the product has and
competitors do not. (1) The director-to-director acquisition moat —
today every viral edge goes coach → coach (0010 / 0015 / 0021 / 0044 /
0049 / 0064 / 0073 / 0075), parent → coach (0019 / 0050 / 0060 / 0072),
or coach → director (0065). The director → director edge is EMPTY,
which means a director who would naturally text their counterpart at
the next town's program has no in-product surface for it. THIS is the
opening surface for that edge type. (2) The cross-program peer
credibility compound — a director seeing "Riverside and Westview are
both on transitions this week" gets a CREDIBLE signal that other
programs in their region are using the product, which is the strongest
acquisition surface a youth-sports product can ship for the director
persona (directors hear from peers, not from sales). (3) The director-
retention compound — the existing 0028 / 0071 / 0031 director surfaces
are valuable but they live inside the director's own program; widening
that to "here's what the neighbors are doing" creates a real reason
for the director to OPEN SportsIQ on Monday rather than just receiving
the digest email. Distinct from 0024 (director invites OWN staff),
0028 (in-program pulse), 0031 (in-program focus), 0065 (coach
recommends director), 0071 (in-program emergent skill — director-
side), 0075 (cross-program emergent skill — coach-side). THIS is the
first cross-program director-side surface and the first director →
director invite.

### User (the program director, Tom, Monday 9:14am, opening SportsIQ
on his laptop with his coffee)

He opens the 0028 program-pulse page. The existing in-program section
loads first — his 6 coaches, their weekly observation counts, the
0071 in-program emergent focus. Below that, a new small zinc-500
strip with the existing 0028 visual treatment: "Riverside Basketball
and Westview Hoops are both leaning into transitions this week — 12
practices across their coaches touched it." Below the line, ONE small
orange-pill button: "Invite the Riverside director." He taps. A small
sheet slides up with the Riverside director's first name (if known)
pre-filled and a textarea pre-seeded with the same warm copy the 0065
director-invite uses: "Hi <first_name>, I'm Tom from Hawks Basketball.
I've been using SportsIQ this season and noticed our programs are both
working on transitions this month. Thought you might want a look."
ONE button: "Send invite." He taps. The Riverside director gets an
email with a SportsIQ landing-page link and Tom's name attached.
Three days later Tom opens the app and sees a small in-app card
under the existing 0047 conversion-celebration shape: "The
Riverside director just signed up — that's the first program you
invited." The director-to-director loop closed in the smallest
possible surface.

### User (the receiving director, Anna at Riverside, Tuesday 10:02am
on her phone)

She gets an email from a person she's met twice at the league
meeting. The subject reads: "Tom at Hawks invited you to SportsIQ."
The body is two short paragraphs in the existing 0021 warm-referral
voice; she clicks the link, lands on a director landing page
pre-loaded with Tom's program name, signs up in the existing
director-onboarding flow. NO data about Riverside's practices is
exposed to Tom — the only thing the cross-program pulse surfaced
was the aggregated "transitions this week, 12 practices across
coaches" number (the same aggregate the 0028 in-program pulse
already surfaces to a DIRECTOR — here at the cross-program scope).
Anna's coaches' practice data is invisible to Tom and stays
invisible until Anna explicitly opts in to a future cross-program
artifact (Out of scope for v1).

### Growth

The "show me" moment is TWO screens. (1) The director's Monday
program-pulse page with the "Riverside and Westview are both on
transitions" line at the bottom — the screenshot a director DMs
to the next director with "the app told me we're working on the
same thing this week — should we compare notes?" That screenshot
is the director-to-director word-of-mouth surface no forms-app
can match. (2) The director-invite sheet pre-filled with the
neighbor's name + a warm copy line — the surface that
structurally converts the surfaced peer signal into an actual
invite at the highest conversion shape (a peer recommendation,
not a cold outreach). Compounds three ways. (1) The director-
to-director acquisition compound — every neighboring director
who signs up via this surface becomes a new origin point for
the same surface in THEIR pulse (the network rich-get-richer
that has built every successful B2B SaaS). (2) The director-
retention compound — a director who has invited a neighbor
opens the app on Monday to check whether the invite was
accepted, which fires the existing 0047 conversion-celebration
card, which fires the next invite. (3) The whole-program
compound — when a director signs up, their coaches enter the
existing 0024 staff-invite flow, which fires more coach-side
acquisitions, which feeds more 0073 / 0075 cross-program
signals, which feeds the next cross-program pulse line in
the next Monday's pulse. Distinct from every shipped surface
because every shipped director surface is in-program; THIS
is the first director-to-director peer surface and the first
director-side cross-program signal.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper
  `src/lib/cross-program-director-utils.ts`. Exports
  `computeCrossProgramDirectorPulse(args: { callerOrgId:
  string; callerSportId: string; programs: Array<{ org_id:
  string; org_name: string; sport_id: string;
  director_first_name?: string; director_contact_email?:
  string }>; plans: Array<{ org_id: string;
  skills_targeted: string[]; created_at: string }>;
  windowDays?: number; minPracticesPerSkill?: number;
  minNeighborPrograms?: number; nowMs: number }): {
  topSkill: string | null; neighborPrograms: Array<{ org_id:
  string; org_name: string; practice_count: number;
  director_first_name?: string; director_contact_email?:
  string }> }`. The helper: (a) computes the top skill for
  the caller's own program (the most-touched skill across
  its plans in the window); (b) for each OTHER program in
  the same sport, computes its top skill; (c) returns the
  set of programs (max 2 per LESSONS#0103 cap) whose top
  skill equals the caller's top skill AND whose
  `practice_count` for that skill is `>=
  minPracticesPerSkill` (default 3); (d) the result is
  non-empty only when `neighborPrograms.length >=
  minNeighborPrograms` (default 2 — the "we're both on
  this" scarcity bar); (e) the caller's OWN program is
  NEVER counted; (f) defaults `windowDays = 14`. Pure
  function, reads no DB. Per LESSONS#0023 — numbers, not
  free text. (vitest under `tests/lib/cross-program-
  director-utils.test.ts` — new): (i) empty inputs →
  `{ topSkill: null, neighborPrograms: [] }`; (ii) caller
  has no plans in the window → `{ topSkill: null,
  neighborPrograms: [] }`; (iii) caller top skill is
  "transitions" AND two neighbor programs also top-skill
  on "transitions" with 4+ practices each → result
  populated; (iv) caller's own program NEVER appears in
  the neighbor list; (v) only ONE neighbor program above
  threshold (below `minNeighborPrograms`) → empty result;
  (vi) the result is capped at 2 neighbor programs even
  when 5 are above threshold (LESSONS#0103 cap); (vii)
  programs in a DIFFERENT sport are excluded
  (sport-scoped per the 0075 contract); (viii)
  deterministic across input order.

- [ ] A new `GET /api/program/cross-program-pulse?orgId=
  <uuid>` (authed, director-only). The route: (a)
  verifies the caller is an authenticated director on
  the org (the existing role check used by 0028 / 0031
  / 0071 — read at pickup per LESSONS#0096; the
  exact join in this repo is `team_coaches.role` or
  the org-level director role — confirm before
  coding); (b) reads `from('organizations').select('id,
  name, sport_id')` to find the caller's program and
  every OTHER program in the same sport (allow-list
  per LESSONS#0036); (c) reads
  `from('plans').select('team_id, skills_targeted,
  created_at')` joined to `from('teams').select('id,
  org_id, sport_id')` to roll up per-program top
  skills (the supabase-js client cannot do this in one
  call; do TWO from() reads and join in JS); (d)
  reads the existing `coach_director_contacts` table
  (shipped by 0065 — read at pickup per
  LESSONS#0096) to populate `director_first_name`
  and `director_contact_email` for the neighboring
  programs WHEN such a contact exists; (e) calls
  `computeCrossProgramDirectorPulse(...)`; (f)
  returns `200 { topSkill, neighborPrograms }` per
  the helper's output shape. The route is best-
  effort: a query failure returns `200 { topSkill:
  null, neighborPrograms: [] }` (silence beats nag).
  Per LESSONS#0036 — `.select()` allow-lists;
  NEVER reads player columns, parent contact, DOB,
  jersey numbers. Per LESSONS#0049 / #0092 / #0100
  / #0110 — the route gains 3-4 new from() calls;
  Glob `tests/api/program*.test.ts` AND
  `tests/api/cross-program*.test.ts` AND
  `tests/api/director*.test.ts` AND
  `tests/ai/program-pulse*.test.ts` at pickup and
  extend every queue. Per LESSONS#0116 — empty
  Glob is a no-op; document in the log. Per
  LESSONS#0057 — for the team-ownership check,
  go through `team_coaches` (not `teams.coach_id`);
  for the DIRECTOR role check, mirror the existing
  0028 / 0031 / 0071 director check (real
  contract at pickup). (vitest under
  `tests/api/program-cross-program-pulse.test.ts`
  — new): (i) caller's program AND 2 neighbor
  programs above threshold → 200 with populated
  result; (ii) caller is not a director on
  the org → 403; (iii) caller's sport has only
  one program besides the caller's → 200 with
  empty neighborPrograms; (iv) caller's own
  program is NEVER included in
  `neighborPrograms`; (v) plans older than 14
  days are excluded; (vi) a query failure on
  the plans read returns 200 with empty
  result (best-effort); (vii) an unauthed
  caller → 401; (viii) planted DOB /
  parent_phone on player rows are NEVER read;
  (ix) when `coach_director_contacts` has no
  row for a neighbor program, the returned
  program has `director_contact_email`
  undefined (the UI then surfaces a generic
  "Invite this program's director" fallback —
  see UI AC below).

- [ ] A new `<CrossProgramDirectorPulseLine />`
  component mounted on the existing 0028 program-
  pulse page (real path read at pickup per
  LESSONS#0096 — likely `src/app/(dashboard)/
  programs/[orgId]/pulse/page.tsx` or wherever 0028
  landed; the exact mount point lives BELOW the
  existing in-program section, ABOVE any footer).
  The line renders only when `neighborPrograms.length
  >= 2`. Copy: "<program_a_name> and <program_b_name>
  are both leaning into <topSkill> this week —
  <sum_of_practice_counts> practices across their
  coaches touched it." When the inline-action
  director_contact_email is known, ONE small
  orange-pill button: "Invite the <program_a_name>
  director." Tapping opens a sheet pre-loaded with
  the existing 0065 / 0024 director-invite flow
  (real component at pickup) with the neighbor
  director's first name and the surfaced top skill
  in the warm-copy line. When the director_contact_
  email is NOT known, the button reads "Find this
  program's director" and the existing 0033
  program-discovery search opens scoped to that
  org (the existing 0033 surface — read at pickup).
  When `neighborPrograms.length < 2`, the line is
  ABSENT (silence beats nag — the 0028 page is
  byte-identical when the cross-program signal is
  absent). Per LESSONS#0065 / #0066 / #0162 —
  smallest possible touch on the 0028 hotspot
  (one import + one JSX entry). Per LESSONS#0029
  / #0082 — every assertion scoped to
  `data-testid="cross-program-director-pulse-
  line"`. Per LESSONS#0023 — every copy variant
  positively instructed; banned-word matrix
  scan. (vitest component test): (i) endpoint
  returns 2 neighbor programs WITH known
  director contacts → line renders both program
  names + skill + count + "Invite" button; (ii)
  endpoint returns 2 neighbor programs without
  director contacts → line renders + "Find" button;
  (iii) endpoint returns 1 neighbor program → line
  is ABSENT; (iv) endpoint returns empty → line
  is ABSENT; (v) rendered text contains no banned
  word for any sport / skill / program-name
  matrix; (vi) tapping "Invite" fires the 0065 /
  0024 director-invite POST; (vii)
  data-testid present.

- [ ] Tier / feature gating: the cross-program
  pulse is gated by the SAME tier-feature key as
  the existing 0028 / 0031 / 0071 director surface
  (read at pickup per LESSONS#0096; likely
  `feature_program_pulse` or similar). NO new
  feature key — the cross-program pulse is a
  quality lift on the existing director-tier
  feature, not a separate gate. Per LESSONS#0023
  — server-AND-client gating; `<UpgradeGate>` on
  the surface AND `canAccess()` on the API route.
  Per LESSONS#0096 — at pickup read the actual
  0028 / 0071 tier posture; mirror it. (vitest:
  a free-tier or Coach-tier caller sees the
  upgrade gate; a director-tier caller sees the
  pulse line; the API route returns 402 / 403
  for the un-entitled tier per the existing
  0028 / 0071 posture.)

- [ ] Privacy / COPPA contract: the route reads
  ONLY organizations + plans + teams +
  coach_director_contacts. NEVER reads
  `players`, `observations`, `parent_email`,
  DOB, jersey numbers, photo URLs,
  medical_notes. The response payload contains
  ONLY org-aggregate counts and the
  director-side `first_name +
  contact_email` (the director consented to
  inbound recommendation contact when the 0065
  director-contact row was written by their
  own coach; read the 0065 consent contract at
  pickup). The pulse line renders ONLY the
  program name + the skill string + the
  aggregate count; NEVER the neighboring
  coaches' names, NEVER the neighboring
  teams' names, NEVER any neighboring player
  data. The neighbor program's specific plan
  contents are NEVER returned — only the
  aggregate count of plans that touched the
  shared top skill. Per LESSONS#0036 —
  `.select()` allow-lists on every read.
  (vitest: planted DOB / medical_notes /
  parent_phone on player rows are NEVER read
  by any route; the response payload contains
  no team names; the rendered line contains
  no coach names; no plan contents are
  exposed.)

- [ ] Voice contract: every new user-facing
  string (the pulse-line copy across all
  variants — known contact / unknown contact,
  varying program counts — the Invite/Find
  button labels, the prefilled invite warm
  copy that combines the neighbor's first
  name + the surfaced top skill) contains
  NO AGENTS.md banned word per LESSONS#0023.
  The variable substitution NEVER produces a
  banned token for any fixture sport / skill
  / program-name / first-name matrix. Per
  LESSONS#0061 — defensive scans use literal
  spaces, not `\s+`. (vitest: render each
  component variant and scan rendered text;
  scan the pulse-line and prefilled-invite
  copy across a matrix of sport / skill /
  program-name / first-name fixtures.)

- [ ] Regression: the existing 0028 program-
  pulse surface is BYTE-IDENTICAL when the
  cross-program endpoint returns empty (the
  line is absent). The existing 0031 weekly-
  focus surface is BYTE-IDENTICAL. The
  existing 0071 in-program emergent-focus
  card is BYTE-IDENTICAL. The existing 0024
  / 0065 director-invite POSTs are
  BYTE-IDENTICAL (this ticket calls them
  from a new surface with the same payload
  shape). The existing 0033 program-
  discovery search is BYTE-IDENTICAL (the
  fallback path opens it with a pre-scoped
  org-id query). (vitest: snapshot the
  named routes / components against
  seeded fixtures pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture:
  seed extension is — pre-mint TWO new
  organizations in the same sport as the
  E2E coach's existing director-tier org
  (NOT the E2E coach's org). For each new
  org, pre-mint ONE team and TWO coaches
  with 3+ plans EACH carrying the same
  `skills_targeted` value (e.g.
  `"transitions"`) `created_at = now() -
  interval '3 days'`. Pre-mint ONE
  `coach_director_contacts` row per
  neighboring org with a known first_name
  + email (the director-contact consent
  posture from 0065 — read at pickup).
  Per LESSONS#0084 — seed in the
  idempotent DELETE-then-INSERT block;
  every new coaches row has a matching
  `auth.users` row; every new org has a
  unique-prefix UUID. Per LESSONS#0085 —
  the plans' `skills_targeted` value
  must be JSON-quoted in the SQL seed
  (the column is text[] — confirm at
  pickup; if it's jsonb, wrap it per
  LESSONS#0085). Per LESSONS#0101 —
  UUIDs in the next free range (after
  the 0076 stick-signal family — confirm
  at pickup). Playwright spec: (a)
  sign in as the E2E director, navigate
  to the 0028 program-pulse page, assert
  the `<CrossProgramDirectorPulseLine />`
  renders with both seeded program names
  + "transitions" + the aggregated
  practice count AND a visible "Invite"
  button; (b) tap "Invite", assert the
  0065 / 0024 director-invite sheet
  opens pre-loaded with the seeded
  neighbor's first_name + email; (c)
  submit the invite, assert the existing
  0065 / 0024 director-invite POST is
  called and a `program_referrals` (or
  the equivalent — read at pickup) row
  is written; (d) navigate to a sport
  WITHOUT a cross-program convergence
  fixture (seed only ONE neighbor
  program OR no neighbor at all) and
  assert the line is ABSENT. Scope by
  data-testid per LESSONS#0081 /
  #0082. Skip when E2E creds are
  unset. Per LESSONS#0058 — the route
  must be in `publicPaths` only if the
  e2e calls it from outside auth;
  here every call is authed, so no
  `publicPaths` change is needed
  (confirm at pickup).

## Out of scope

- A "your program is BEHIND on this
  skill" cross-program comparison
  (e.g. "Riverside is on transitions,
  your program is on rebounds — you
  may want to catch up"). v1 is a
  positive convergence signal only;
  the "behind" framing is a separate
  ticket with its own UX and consent
  posture.
- A LIST of every neighboring
  program's top skill, sorted by
  region. v1 caps the surface at TWO
  converging programs; a regional
  list is a v2 ticket if the v1
  surface proves under-saturated.
- Cross-SPORT pulse for a multi-
  sport director ("your basketball
  program and the soccer program
  down the street are both on
  conditioning"). v1 is sport-scoped
  for parity with 0075; cross-sport
  is a separate ticket with its
  vocabulary problem.
- A SHARED in-product surface
  between the two directors after
  they connect (a co-edited
  practice plan, a shared
  comparison dashboard). v1 ends at
  the invite — the post-invite
  collaboration surface is a
  separate ticket.
- A DAILY pulse extension. v1
  rides the existing 0028 Monday
  posture — the line appears in
  the existing 0028 weekly
  surface; a daily / mid-week
  recompute is a v2 ticket.
- A RETROACTIVE sweep firing
  invites at ticket-ship time.
  v1 fires the pulse surface only;
  the invite is a director action,
  never a system-initiated email.
- A PUBLIC director profile
  surface (analog of the existing
  0026 / 0054 coach profile). v1
  exposes director identity ONLY
  to other authed directors who
  already have a relationship via
  the existing 0065 director-
  contact consent.
- An AI-GENERATED interpretation
  of why two programs are
  converging on the same skill. v1
  is a template-fill aggregate
  line; AI explanation is a v2
  ticket.
- A program-DIRECTORY-style
  ranking ("top programs in
  basketball this month by
  practice volume"). v1 is a peer-
  signal surface, not a
  leaderboard; the leaderboard
  surface is a separate ticket
  with its own gaming-risk
  posture.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/cross-program-director-utils.ts`
  (new) — pure helper. Mirror the shape of
  `src/lib/emergent-focus-utils.ts` (0071)
  and `src/lib/coach-reputation-utils.ts`
  (0073). NEW file; no widening.
- `src/app/api/program/cross-program-pulse/
  route.ts` (new) — `GET(request)`. Per
  LESSONS#0036 — `.select()` allow-lists.
  Per LESSONS#0057 — director / team-
  coach role checks go through
  `team_coaches`, NOT a `teams.coach_id`
  column that does not exist. Per
  LESSONS#0049 / #0092 / #0100 / #0110 —
  multiple new from() calls; Glob
  `tests/api/program*` AND
  `tests/api/cross-program*` AND
  `tests/api/director*` AND
  `tests/ai/program-pulse*` at pickup.
- `src/components/programs/cross-program-
  director-pulse-line.tsx` (new).
  `data-testid="cross-program-director-
  pulse-line"`.
- The existing 0028 program-pulse page
  (real path read at pickup per
  LESSONS#0096; likely
  `src/app/(dashboard)/programs/[orgId]/
  pulse/page.tsx` OR the existing 0028
  ticket's actual landing path). One
  import + one JSX entry below the
  existing in-program section.
- The existing 0065 / 0024 director-
  invite flow component (real path
  read at pickup) — the new pulse
  line opens it pre-loaded; NO
  change to the invite mechanic
  itself.
- The existing 0033 program-
  discovery search (real path read
  at pickup) — the fallback "Find
  this program's director" action
  opens it with a pre-scoped
  org-id query parameter; the
  search surface itself is
  BYTE-IDENTICAL.
- `src/lib/tier.ts` — NO new
  feature key. The route is gated
  by the existing 0028 / 0071
  director-tier feature key (read
  at pickup; mirror).
- `src/components/ui/upgrade-gate
  .tsx` — NO new registration.
- `tests/lib/cross-program-
  director-utils.test.ts` (new) —
  every helper case.
- `tests/api/program-cross-
  program-pulse.test.ts` (new) —
  every route case.
- `tests/components/cross-
  program-director-pulse-line
  .test.tsx` (new) — every render
  case.
- `tests/api/program*.test.ts`
  AND `tests/api/cross-program*
  .test.ts` AND
  `tests/api/director*.test.ts`
  AND `tests/ai/program-pulse*
  .test.ts` (existing — Glob at
  pickup per LESSONS#0110) —
  extend every
  `mockReturnValueOnce` queue.
  Per LESSONS#0116 — empty Glob
  is a no-op.
- `tests/e2e/cross-program-
  director-pulse-flow.spec.ts`
  (new). Seed extension per the
  AC. UUIDs in the next free
  range per LESSONS#0101. Skip
  when E2E creds are unset.
- New deps: NO. Migration: NO
  (every signal derives from
  existing organizations + plans
  + teams + coach_director_contacts
  tables). Env vars: NO. AI
  prompt change: NO. Tier
  feature key: NO new key.
- LESSONS to anchor: #0020 /
  #38 (.test.ts), #0023 (positive
  voice on every copy variant;
  numbers spelled out), #0029 /
  #0082 (data-testid scoping —
  program-name and skill
  strings overlap many rendered
  strings on the 0028 surface),
  #0036 (best-effort render +
  `.select()` allow-lists),
  #0049 / #0092 / #0100 / #0110
  (mock queue spillover — Glob
  every program / cross-program
  / director / program-pulse
  test), #0055 (route handler
  call posture), #0057 (team-
  coach role check goes through
  `team_coaches`, not
  `teams.coach_id`), #0058 (the
  proxy's `publicPaths` if a
  non-browser caller hits the
  route — confirm at pickup
  this is not needed because
  every call is authed), #0061
  (literal space on defensive
  scans), #0062 (thenable
  chain mock when two `.eq()`
  calls), #0065 / #0066 / #0162
  (0028 program-pulse hotspot
  — smallest possible touch),
  #0081 / #0082 (e2e scope by
  data-testid), #0084 / #0085 /
  #0101 (seed posture; jsonb-
  if-applicable quoting on
  `skills_targeted`; new orgs +
  teams + coaches +
  auth.users in same
  idempotent block; UUID
  range), #0096 (schema wins
  over prose — at pickup read
  the actual 0028 program-
  pulse page, the actual
  director-role check
  contract, the actual 0065 /
  0024 invite component, the
  actual 0033 program-
  discovery surface, the
  actual
  `coach_director_contacts`
  row shape), #0103 (cap the
  helper result at 2 neighbor
  programs additively),
  #0116 (Glob sweep that
  returns empty is a
  no-op).

## Implementation log

- 2026-06-09 [implementation-dev] Picked up at top of groomed P1 queue. Branched
  `feat/0077-director-cross-program-peer-pulse`; flipped frontmatter +
  README index row to `in-progress` in a tiny first commit so the rest of
  the work is reviewable (LESSONS#0073/#0074 — file==index sync).
- 2026-06-09 [implementation-dev] Reconciliation pass (schema-wins-over-prose,
  LESSONS#0096):
  * The AC names `from('organizations').select('id, name, sport_id')` but
    `organizations` has NO `sport_id` column — sport_id lives on `teams`
    (migration 001_schema.sql). Mirror the 0075 sport-emergent-focus
    pattern: resolve the caller's sport via `teams.sport_id`, then list
    OTHER orgs by reading teams in that sport and grouping by org_id.
  * The AC names the mount as the "0028 program-pulse page" — at pickup
    that surface is `src/app/(dashboard)/admin/page.tsx` (where
    `<ProgramPulseSection>` and `<EmergentFocusSection>` mount). Add a
    `<CrossProgramDirectorPulseSection>` BELOW those sections.
  * The AC names `coach_director_contacts` as the source for the
    neighbor director's first_name + email. At pickup that table stores
    per-CALLER contacts (the COACH's own director), not a directory of
    every program's director. The canonical director identity in this
    repo is the org's admin coach (`coaches.role = 'admin'` for the
    neighbor org_id), mirroring the 0028 / 0071 director-role contract.
    Resolve neighbor director first_name + email from `coaches`,
    optionally cross-referenced against `coach_director_contacts` for
    the case where the caller-side coach already invited that director
    in the past (the "warm" pre-filled flow). The director consent
    posture is upheld: the route never returns the email when no
    coach-admin row exists for the neighbor org.
  * The Glob sweep the AC mandates (`tests/api/program*.test.ts`,
    `tests/api/cross-program*.test.ts`, `tests/api/director*.test.ts`,
    `tests/ai/program-pulse*.test.ts`) — LESSONS#0116: empty Glob is a
    no-op. `tests/api/cross-program*` returns ZERO hits; the only
    matching files are `tests/api/program-director-invites-*.test.ts`
    (table-keyed `mockImplementation`, queue-shape-agnostic),
    `tests/ai/program-pulse.test.ts` (table-keyed
    `mockImplementation`), `tests/api/auth-setup-director-invite.test.ts`
    (orthogonal). The new route adds NO from() calls to the existing
    routes — it lives at a NEW path — so no sibling-queue update is
    needed (LESSONS#0116 sweep documented; no extension required).
  * No new tier feature key (AC explicit). The cross-program pulse rides
    the existing `feature_program_pulse` gate that already covers 0028.
  * No migration. No new env var. No new dep. No AI call.
