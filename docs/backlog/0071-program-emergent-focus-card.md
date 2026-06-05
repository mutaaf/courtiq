---
id: 0071
title: When 3+ coaches in the same program are working on the same skill this week, surface it to the director as "your program is rallying around X"
status: groomed
priority: P1
area: analytics
created: 2026-06-05
owner: product-groomer
---

## User story

As a program director who oversees a dozen volunteer coaches across the
league, I want to see ONE small card on my home page on Monday morning
that says "three of your coaches are working on closeouts this week —
the U10 girls, the U12 boys, and the U14 boys" — when that pattern
emerges ORGANICALLY from what coaches are doing in their own practices,
without me having set a program-wide focus — so I can shout that out in
the Tuesday all-coaches text ("nice — closeouts is a great focus, three
of you converged on it independently") and the coaches feel SEEN for
what they are doing in their own gyms.

## Why now (four lenses)

### Product Owner

The product has shipped 0031 — the program director sets ONE weekly
focus and it shows up in every coach's Capture and practice plan. That
is the TOP-DOWN program-focus surface. It does NOT have a BOTTOM-UP
counterpart: when multiple coaches in the same program organically
converge on the same skill in their own practice plans, the director
has no visibility into the convergence — and the coaches have no
signal that their work is connecting to anything bigger than their
own team. The smallest meaningful unit of value is: (a) a new
`GET /api/org/emergent-focus?orgId=...` endpoint (authed, org-tier
only) that reads the last 14 days of `plans` rows for every team in
the org, aggregates the `skills_targeted` arrays across teams, and
returns the top 1 or 2 skills that appear across `MIN_CONVERGENCE =
3` distinct teams; (b) a new `<EmergentFocusCard />` on the existing
org-tier admin/home surface (the one that today renders the 0028
program-pulse card — read at pickup per LESSONS#0096) that renders
"This week, <N> of your coaches are working on <skill> — <team1>,
<team2>, <team3>"; (c) a small button on the card: "Share this with
the coaches" — opens a sheet with a single auto-drafted text the
director can paste into the all-coaches text thread ("Nice — three
of you converged on closeouts this week. Keep at it."); (d) the card
auto-dismisses on the share-action OR on a "Got it" tap; (e) if no
convergence exists this week, the card is ABSENT (silence beats nag
per the existing 0023 / 0028 norm). NO new tier feature key beyond
the existing org-tier gate; NO AI generation (the share-draft is a
template fill, the convergence is a pure aggregation); NO new
database column, NO migration — the signal is derived at read time
from existing persisted `plans.skills_targeted`.

### Stakeholder

This is the moat-deepening primitive for the org-tier surface and
the inverse of 0031 — together they shape program focus from BOTH
directions (top-down + bottom-up), which no forms app can replicate
because no forms app has the cross-team plan-and-arc accumulation we
do. Three compoundings. (1) The org-tier retention moat — the
director who sees "your program is rallying around closeouts this
week" gets a weekly reason to OPEN the app (mirror of the 0023
coach-side weekly digest pull, transposed to the org tier). The
$49.99 org tier is the hardest acquisition + the most expensive
loss; this is the surface that converts the org-tier login from
"I should check the dashboard" into "I just send the Tuesday text."
(2) The coach-feels-seen moat — when the director shouts out the
emergent focus in the Tuesday text, the coaches in the convergence
get the recognition signal directly, and the recognition is anchored
in their OWN structured artifact (the practice plan), not in
something the director invented. The coach-side compound is "my
work counts to my director" — a non-replicable cross-loop signal.
(3) The data-density moat — the convergence calculation requires
30+ distinct plans/week across an org to fire; every org-tier coach
who ships more plans accelerates the org's signal density. The
coach-side feature retention compounds the org-side feature pull.
Distinct from 0028 (per-coach activity stats — quiet vs active),
0031 (top-down director-set focus), 0024 (staff invite), 0033
(cold searcher claims a team), 0049 / 0055 / 0063 (cross-coach
plan sharing — voluntary clone, not emergent convergence).

### User (the director, Mark, Monday 7:18am, in line at the
coffee shop)

He opens the SportsIQ app out of habit. At the top of his /admin
or /home surface (whichever the org-tier admin lands on per the
existing 0028 surface posture — read at pickup): a new small card.
"This week, three of your coaches are working on closeouts —
U10 girls, U12 boys, U14 boys. Want to give them a shout?" Two
buttons. He taps "Share this." A small sheet slides up with one
pre-drafted line in a textarea: "Nice — three of you converged
on closeouts independently this week. Keep at it." He tweaks it
to "Three of you on closeouts — well done. See if you can stack
a 2-on-2 closeout drill into Thursday." He taps "Copy." The
sheet closes. He switches to his coaches' group text, pastes,
sends. The card auto-dismisses. Total interaction: 22 seconds.

### User (the coach, Sarah, Monday 9:11am, during her lunch
break)

She opens the SportsIQ app. /home renders normally. She does
NOT see the emergent-focus card (it is director-only by
design; the coach-side feature retention is the existing 0023
weekly digest). What SHE sees is Mark's text in the all-
coaches thread: "Three of you on closeouts — well done. See if
you can stack a 2-on-2 closeout drill into Thursday." She
reads it. She thinks: "Mark sees that I'm working on this." She
opens her practice plan for Thursday. She stacks a 2-on-2
closeout drill. The recognition signal compounds her own
retention without any in-app surface change for her.

### Growth

The "show me" moment is the DIRECTOR'S phone — the Monday 7am
card that turns the program from "I have 12 coaches I barely
know what's going on with" into "I just saw three of them
converged on the same skill — I'm shouting them out." That
moment is the org-tier upgrade-justification screenshot: a
free / coach-tier director (the program might be on a coach
tier today because the director is also a coach) sees the
card on a friend's org-tier instance and knows immediately
this is what makes the $49.99 tier worth it. Compounds three
ways. (1) The org-tier upgrade pull — the card is gated to
org-tier; surfacing its absence on the coach tier (via the
existing `<UpgradeGate>` upsell when a coach-tier admin opens
the /admin surface — per the existing 0035 "upgrade to
finish the artifact you were making" pattern) is the
upgrade lever. (2) The all-coaches-text loop — every shared
emergent focus brings the coaches in the convergence into a
warmer relationship with their director, which is the
retention compound on the COACH side that org-tier sales
historically can't measure. (3) The pattern density compound
— the more weeks an org accumulates, the more interesting
the cross-week emergent patterns become (a v2 follow-on:
"closeouts has been your top emergent focus for 3 weeks in
a row — your program has an identity"). Distinct from
every shipped surface: 0028 is per-coach activity, 0031 is
top-down focus, 0044 is per-coach next-drill suggestions.
THIS is the emergent cross-team convergence the director
has never had visibility into.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper `src/lib/emergent-focus-utils.ts`.
  Exports `computeEmergentFocus(plans: PlanRow[], opts?:
  { minConvergence?: number; windowDays?: number; maxFocuses?:
  number }): EmergentFocus[]`. `PlanRow` minimal shape:
  `{ team_id: string; skills_targeted: string[] | null;
  created_at: string }`. `EmergentFocus`: `{ skill: string;
  teamIds: string[]; teamCount: number }`. The builder: (a)
  filters to plans in the last `windowDays` (default 14); (b)
  unions each plan's `skills_targeted` into a per-team set
  (a team that ran 4 plans this week counts ONCE per skill);
  (c) aggregates skill → distinct team_ids; (d) filters to
  skills with `teamIds.length >= minConvergence` (default
  3); (e) sorts by `teamCount` desc; (f) caps at
  `maxFocuses` (default 2); (g) per LESSONS#0023 — does NOT
  scan the skill string for banned tokens (skills are
  controlled-vocabulary from the team's drill library; they
  are not free-text), per LESSONS#0061 — does NOT need the
  surname guard (skills are sport vocabulary, not names).
  Pure function; reads no DB. (vitest under
  `tests/lib/emergent-focus-utils.test.ts` — new): (i)
  empty plans → empty result; (ii) 2 teams on the same
  skill, MIN=3 → empty; (iii) 3 teams on the same skill →
  one result with teamCount 3; (iv) 4 teams on the same
  skill but 1 team's plan is outside the windowDays → 3
  teams; (v) a team running 5 plans this week with the
  same skill counts ONCE; (vi) caps at maxFocuses; (vii)
  null `skills_targeted` is silently skipped; (viii) the
  output is deterministic across input order.

- [ ] `GET /api/org/emergent-focus?orgId=<uuid>` (new,
  authed). The route: (a) verifies the caller is an
  org-tier admin on the org via the existing org-
  membership shape (read at pickup per LESSONS#0096 —
  likely `organizations.tier = 'organization'` AND
  `organization_members.role IN ('admin','owner')` —
  read the EXISTING 0028 program-pulse route's auth
  posture and mirror it); (b) reads
  `from('teams').select('id').eq('org_id', orgId)` (allow-
  list per LESSONS#0036); (c) reads
  `from('plans').select('team_id, skills_targeted,
  created_at').in('team_id', teamIds).gte('created_at',
  new Date(Date.now() - 14*86400000).toISOString())` (allow-
  list); (d) calls `computeEmergentFocus(plans)`; (e) reads
  `from('teams').select('id, name').in('id',
  emergentTeamIds)` for the display names (allow-list); (f)
  returns `200 { focuses: Array<{ skill, teamCount,
  teams: Array<{id, name}> }> }`. On a query failure, the
  route returns `200 { focuses: [] }` (silence beats nag —
  the card is ABSENT on read failure per the 0028 best-
  effort posture). The route's `.select()` calls are all
  explicit allow-lists per LESSONS#0036 — NEVER reads
  `players`, `observations`, parent contact info, DOB,
  jersey numbers, medical_notes. Per LESSONS#0049 /
  #0092 / #0100 / #0110 — the route adds 3 new `from()`
  calls; every sibling test that mocks the supabase chain
  must extend its queue (Glob `tests/api/org-*.test.ts`
  AND `tests/api/admin*.test.ts` at pickup). (vitest
  under `tests/api/org-emergent-focus.test.ts` — new):
  (i) an org-tier admin with 3 teams converged on
  closeouts → 200 with the focus; (ii) a coach-tier
  caller → `403 { reason: 'tier' }`; (iii) a non-member
  caller → 403; (iv) an unauthed caller → 401; (v) an
  unknown orgId → 404; (vi) a query failure on the
  plans read → 200 with `focuses: []` (best-effort);
  (vii) planted minor data on a player row is NEVER read
  by any of the route's `.select()` calls (the route
  reads only `teams.id`, `teams.name`, `plans.team_id`,
  `plans.skills_targeted`, `plans.created_at`).

- [ ] Tier / feature gating: the route + the card are
  gated behind a new `feature_program_emergent_focus`
  key. Registered in `TIER_LIMITS` under
  `organization` ONLY (NOT coach, NOT pro_coach — the
  primitive is org-only because the cross-team
  aggregation requires multi-team membership). Per
  LESSONS#0078 — the literal `feature_*` key string
  is what `canAccess()` reads AND what the
  `<UpgradeGate>` `feature` prop must equal. The
  card on /admin renders `<UpgradeGate
  feature="feature_program_emergent_focus" ...>` for
  a non-org-tier admin (the card body is replaced by
  a small "upgrade to see what your coaches are
  converging on" panel per the existing 0035 inline-
  upgrade pattern). The route returns `403 {
  reason: 'tier' }` server-side per AGENTS.md.
  (vitest: the org-tier admin gets the data; the
  coach-tier admin gets the `<UpgradeGate>` render
  AND a 403 on a direct API call; the
  `<UpgradeGate>` `feature` prop equals the
  registered tier key string exactly per
  LESSONS#0078.)

- [ ] A new `<EmergentFocusCard />` mounted on the
  existing org-tier admin/home surface (read at
  pickup per LESSONS#0096 — likely
  `src/app/(dashboard)/admin/page.tsx` per the
  existing 0028 program-pulse card mount site).
  The card renders the top emergent focus (the
  helper returns up to 2; v1 renders ONE — the
  second is reserved for a v2 follow-on). The card
  is ABSENT when the route returns
  `focuses: []`. Has a single "Share this with
  the coaches" button that opens a sheet with the
  pre-drafted line + a Copy button (exposes
  `data-share-url` per LESSONS#0056 / #0082 —
  here `data-share-text` since there is no URL,
  per the navigator.share text-only pattern; the
  vitest test asserts the attribute exists with
  the drafted text). The card also has a
  "Got it" button that hides the card for 7 days
  (writes to localStorage with a date stamp; per
  LESSONS#0023 — the dismiss is silent, no
  "you'll see this next week" copy). The card
  exposes `data-testid="emergent-focus-card"`.
  Per LESSONS#0065 / #0066 / #0162 — the admin
  page is a hotspot; mount with the SMALLEST
  POSSIBLE touch (one import + one JSX entry).
  (vitest component test): (i) org-tier admin
  with a non-empty focus → card renders with
  the right copy + the team names; (ii) the
  empty-focus state → card does NOT render;
  (iii) tap Share → sheet opens with the
  draft; (iv) Copy carries
  `data-share-text` with the right text; (v)
  tap Got-it → card hides; (vi) re-render
  within 7 days → card stays hidden; (vii)
  re-render after 7 days → card returns.

- [ ] A small pre-drafted share-text template at
  `src/lib/emergent-focus-share-text.ts`.
  Exports `buildEmergentFocusShareText({ skill,
  teamCount, teamNames }: { skill: string;
  teamCount: number; teamNames: string[] }):
  string`. Returns a single line: "Nice — N of
  you converged on <skill> independently this
  week (<team1>, <team2>, ...). Keep at it." Per
  LESSONS#0023 — instruct positively in the
  template ("Nice", "Keep at it"), never the
  banned ban-list. The team names are truncated
  to the first 3; if more, append "+ N more".
  The text contains NO AGENTS.md banned word
  for any fixture input. (vitest under
  `tests/lib/emergent-focus-share-text.test.ts`
  — new): (i) 3 teams → "Nice — 3 of you
  converged on closeouts independently this
  week (Hawks U10, Sharks U12, Eagles U14).
  Keep at it."; (ii) 5 teams → "+ 2 more";
  (iii) the output contains no banned word
  for a matrix of skill / team-name fixtures.

- [ ] Privacy / COPPA contract: the route reads
  ONLY team-aggregate fields. NEVER reads
  `players`, `observations`, parent_email,
  parent_phone, DOB, jersey numbers, photo
  URLs, medical_notes. The card surfaces ONLY
  skill names + team names (no player names,
  no coach names beyond the implicit
  "<N> of your coaches"). The share-text
  template uses NO minor data by
  construction. The route's `.select()` calls
  are explicit allow-lists per LESSONS#0036.
  (vitest: planted DOB / medical_notes /
  parent_email / parent_phone columns are
  NEVER read by any of the route's
  `.select()` calls; the response payload
  contains no minor data; the share-text
  template never emits a player name.)

- [ ] Voice contract: the card copy, the
  sheet copy, the share-text template, the
  upgrade-gate copy, the Got-it label all
  contain NO AGENTS.md banned word per
  LESSONS#0023. Instruct positively
  ("nice", "keep at it", "see what your
  coaches are converging on") — never the
  banned ban-list. (vitest: render each
  new component and scan rendered text;
  scan the share-text output across a
  matrix.)

- [ ] Regression: the existing 0028
  program-pulse card is BYTE-IDENTICAL.
  The existing 0031 program-focus top-
  down surface is BYTE-IDENTICAL. The
  existing /admin or /home surface
  renders BYTE-IDENTICAL for a non-org-
  tier coach (the new card is gated). The
  existing org-tier admin's surface
  renders BYTE-IDENTICAL when the
  emergent focus is empty (the card is
  absent). (vitest: snapshot the named
  routes / components against the
  seeded fixtures pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — IF the existing seed
  already has an org with at least 3
  teams (verify at pickup per
  LESSONS#0084 / LESSONS#0096) — pre-mint
  3 `plans` rows across 3 teams in the
  same org with the same skill in
  `skills_targeted` ("closeouts") and
  `created_at = now() - interval '2
  days'`. If the seed has fewer than 3
  teams in any one org, ADD the
  necessary teams + auth.users +
  coaches + team_coaches rows in the
  same idempotent DELETE-then-INSERT
  block per LESSONS#0084. Playwright
  spec: (a) sign in as the org-tier
  admin (the existing E2E coach is
  promoted to org-tier in the seed —
  verify at pickup; if not, this
  ticket's e2e becomes a vitest-only
  ticket and the load-bearing assertion
  is the component test), navigate to
  /admin (or /home — whichever the
  org-tier admin lands on per
  pickup), assert the
  `<EmergentFocusCard />` renders
  with the seeded skill + team names;
  (b) tap Share, assert the sheet
  opens with the drafted text + the
  Copy carries `data-share-text`; (c)
  tap Got it, assert the card hides;
  (d) reload, assert the card stays
  hidden. Scope by `data-testid` per
  LESSONS#0029 / #0082 (the E2E
  coach's first name overlaps team
  strings). Skip when E2E creds are
  unset.

## Out of scope

- A CROSS-WEEK emergent focus ("closeouts
  has been the top emergent focus for 3
  weeks in a row"). v1 is one-week (the
  last 14 days, single bucket); the cross-
  week pattern is a v2 follow-on.
- A COACH-FACING version of the card. v1
  is director-only. The coach-side
  recognition is the all-coaches text
  the director shouts out, not an in-app
  surface for the coach.
- An AI-generated share-text. v1 is a
  template-fill; the AI surface is a
  separate ticket if the template-fill
  proves too generic at scale.
- A PROACTIVE notification (email /
  push) to the director when the
  convergence fires. v1 is on-app-open
  only; a proactive surface is a
  separate cron-route ticket per the
  existing 0023 / 0042 / 0058 path
  cohort.
- A "send the shoutout AS the director
  from the app" surface (sends a real
  email / SMS / push to each coach).
  v1 is COPY-TO-CLIPBOARD only; the
  director pastes into THEIR existing
  group text. Auto-sending opens a
  consent + deliverability surface
  that's a separate ticket.
- A weekly-digest version (a weekly
  email of the emergent focus to the
  director). v1 is the in-app card
  only; a weekly digest extension is a
  v2 if app-open data shows insufficient
  surface.
- A skill DRILL-DOWN ("show me the
  practice plans where these teams
  worked on closeouts"). v1 is the
  surface card; the drill-down is a
  separate ticket.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/emergent-focus-utils.ts` (new) —
  pure helper, no DB. Mirror the shape of
  `src/lib/season-momentum-utils.ts` per
  the existing pure-helper pattern.
- `src/lib/emergent-focus-share-text.ts`
  (new) — pure template. Mirror the shape
  of any existing share-text helper at
  pickup per LESSONS#0096.
- `src/app/api/org/emergent-focus/route.ts`
  (new) — `GET(request)` reading the
  `orgId` from the URL. Authed via
  `createServerSupabase()` for auth, then
  `createServiceSupabase()` for the reads.
  Org-tier check via the existing
  `canAccess(tier,
  'feature_program_emergent_focus')` AND
  the org-membership check mirrored from
  the existing 0028 program-pulse route
  (read at pickup per LESSONS#0096). Per
  LESSONS#0036 — `.select()` allow-lists.
  Per LESSONS#0049 / #0092 / #0100 / #0110
  — 3 new `from()` calls; Glob every
  `tests/api/org-*.test.ts` AND
  `tests/api/admin*.test.ts` at pickup and
  extend the mock queues.
- `src/lib/tier.ts` — add
  `feature_program_emergent_focus` to the
  `organization` tier ONLY. Per
  LESSONS#0078 — literal `feature_*`
  string.
- `src/components/ui/upgrade-gate.tsx` —
  register `feature_program_emergent_focus`
  in `FEATURE_CONFIG` with the benefit
  copy. Per LESSONS#0078 — the `feature`
  prop on `<UpgradeGate>` MUST equal the
  registered key string exactly.
- `src/components/admin/emergent-focus-
  card.tsx` (new) — the card + the share
  sheet. `data-testid="emergent-focus-
  card"`. Copy button exposes
  `data-share-text={draftText}` per
  LESSONS#0056 / #0082 (text-only
  navigator.share variant).
- `src/app/(dashboard)/admin/page.tsx`
  (existing — read first per
  LESSONS#0096) — one import + one JSX
  entry for the new card, mounted next
  to the existing 0028 program-pulse
  card. Per LESSONS#0065 / #0066 /
  #0162 — smallest possible touch.
- `tests/lib/emergent-focus-utils.test.ts`
  (new) — every AC case from the pure
  helper.
- `tests/lib/emergent-focus-share-text
  .test.ts` (new) — share-text matrix.
- `tests/api/org-emergent-focus.test.ts`
  (new) — every route AC case. Per
  LESSONS#0055 — route handler call
  posture.
- `tests/api/org-*.test.ts` AND
  `tests/api/admin*.test.ts` (existing
  — Glob at pickup per LESSONS#0110) —
  extend EVERY `mockReturnValueOnce`
  queue with the new from-chains IF
  the route shares supabase chain mocks
  with sibling routes.
- `tests/components/emergent-focus-card
  .test.tsx` (new) — every AC case
  including the localStorage Got-it
  hide.
- `tests/e2e/emergent-focus-flow.spec
  .ts` (new). Seed extension per the
  AC. UUIDs in next free
  `0000000000<XX>+` range per
  LESSONS#0101. Skip when E2E creds
  are unset.
- New deps: NO. Migration: NO. Env
  vars: NO new. AI prompt change: NO
  (no AI call on this path; the
  emergent focus is a pure aggregation,
  the share text is a template-fill).
  Tier feature key: YES
  (`feature_program_emergent_focus`,
  organization-only).
- LESSONS to anchor: #0020 / #38
  (.test.ts), #0023 (positive voice on
  card copy + share-text + upgrade-gate
  copy), #0029 / #0082 (data-testid
  scoping in e2e — E2E coach overlaps
  team strings), #0036 (best-effort
  render + `.select()` allow-list on
  every read), #0049 / #0092 / #0100 /
  #0110 (mock queue spillover — Glob
  every org / admin test), #0055
  (route handler call posture), #0056
  / #0082 (data-share-text variant on
  text-only share), #0065 / #0066 /
  #0162 (admin page is hotspot —
  smallest possible touch), #0078
  (feature key literal), #0084 / #0101
  (seed posture; if the seed needs
  3+ teams in one org, seed the
  necessary auth.users + coaches +
  team_coaches rows in the same
  idempotent block), #0091 / #0104
  (publicPaths — the route is authed,
  NOT public; no publicPaths
  extension needed), #0096 (schema
  wins over prose — at pickup read
  the actual `organizations` shape,
  the actual `organization_members`
  role enum, the existing 0028
  program-pulse route's auth
  posture, the actual /admin or
  /home surface for the org-tier
  admin, the actual `plans
  .skills_targeted` shape, the
  actual `teams.org_id` column, the
  existing `<UpgradeGate>` inline-
  upsell pattern from 0035), #0112
  (widen existing reads where
  possible to subsume new queries —
  but here the 3 reads are
  structurally distinct and cannot
  be subsumed).

## Implementation log

(Appended by the implementation-dev agent during execution.)
