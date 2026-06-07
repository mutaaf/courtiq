---
id: 0073
title: When a coach browses the league discovery surface, rank the published coaches by how many DIFFERENT programs have cloned their plans this month — and tell each named coach who saw their work
status: in-progress
priority: P1
area: growth
created: 2026-06-07
owner: product-groomer
---

## User story

As a volunteer coach who has opened the league discovery surface (0055)
to look at what other coaches in my sport are publishing, I want the
coaches in that list ordered NOT alphabetically and NOT by recency,
but by a small honest credibility signal — "Coach Maya: 12 coaches in
4 programs cloned her plans this month" — so the coach I decide to
follow (0063) or clone from (0049 / 0064) is the coach whose work has
already traveled, and the coach whose plans I cloned hears about it by
name a week later ("a coach in the Sharks program saved your closeout
drill — that's the third program this month") so the credibility
signal compounds on BOTH sides of the discovery surface.

## Why now (four lenses)

### Product Owner

The product has shipped the cross-coach plumbing piece by piece: 0049
ships the practice-plan publish + clone; 0063 ships the follow-a-coach
loop after a clone; 0064 ships the single-drill clone card; 0055 ships
the league plan discovery surface; 0026 ships the public coach profile;
0054 ships the vanity handle. Today a coach who opens league discovery
sees a list of plans (0055) and a list of coaches (0026 / 0054) — but
the LIST ORDER carries no credibility signal. Coach Maya, whose
closeout drill was cloned 27 times across 4 programs, sits in the same
visual position as Coach Bob who published once and was never cloned.
The smallest meaningful unit of value is: (a) a new pure helper
`computeCoachReputation(plans, planClones, drillClones)` that derives
two numbers per published coach over the last 28 days — `cloneCount`
(plan clones + drill clones) and `distinctProgramCount` (count of
distinct `org_id`s on the CLONING coaches' teams); (b) the existing
0055 league-discovery surface re-ranks its returned plans + coaches
by `(distinctProgramCount, cloneCount, recency)` tuple sort; (c) each
plan / drill card on the discovery surface renders one quiet line —
"<N> coaches in <M> programs cloned this in the last month" — that
is RENDERED ONLY when `N >= 3` and `M >= 2` (below that, silence beats
small-number bragging); (d) a new `coach_reputation_notifications`
row is written when a clone count crosses a milestone (3, 10, 25, 50
total clones; 2, 4, 8 distinct programs) and the published coach gets
ONE in-app card on /home the next time they open the app: "Your
closeout drill was cloned by a coach in a 3rd program this month —
Hornets U10." Neither side surfaces the cloning coach's full name or
team — the cloning coach's PROGRAM name is the unit of attribution
(consent posture: a coach who publishes consented to attribution by
publishing; a coach who clones did not consent to being named, so we
name their PROGRAM, not their team). No new tier feature key, no AI
generation, no public surface beyond the existing 0055 discovery URL.

### Stakeholder

This is the moat-deepening primitive that turns the cross-coach
plan-and-drill graph (0049 / 0063 / 0064 / 0055) from a flat directory
into a ranked credibility surface — and the inverse-flow signal that
turns the publishing coach's retention from a once-per-publish event
into a once-per-clone-milestone event. Three compoundings, all
structurally invisible to a forms-app competitor because no forms-app
has a cross-coach plan-and-drill clone graph at all. (1) The ranked-
discovery moat — coaches who open 0055 see the highest-cloned content
first, which COMPOUNDS the moat (high-cloned content is more likely
to get cloned again, the rich-get-richer dynamic that built every
content network). (2) The cross-program attribution moat — the
`distinctProgramCount` is the load-bearing scarcity signal (10 clones
inside ONE program is a chatty assistant coach; 10 clones across 4
PROGRAMS is genuine cross-league signal); using DISTINCT PROGRAM as
the primary sort key surfaces durable signal over local enthusiasm.
(3) The publishing-coach retention pull — every milestone fires an
in-app card the next time the publishing coach opens the app, with
THEIR work credited by program name, which is the strongest re-
engagement signal the product can ship to the long-tail publishing
coach. Distinct from 0026 (a profile the coach SENDS; this is a
discovery rank OTHER coaches see passively), 0049 (the publish
mechanic itself), 0055 (the discovery surface — this re-ranks it),
0063 (the follow-a-coach action after a single clone — this is the
cross-program AGGREGATE signal that survives a single clone), 0064
(single-drill clone — this aggregates plan + drill clones into one
reputation number), 0047 (a referral-conversion celebration — this
is the CONTENT-conversion celebration, a separate edge type).

### User (the browsing coach, Sunday 8:42pm, looking at league
discovery for the first time)

She opens the league discovery surface (the one the 0055 ticket
already shipped at `/library/league` or whatever path landed — read
at pickup per LESSONS#0096). The list of plans is now ordered:
Coach Maya's closeout plan is at the top, with one quiet line under
the title in zinc-500: "Cloned by 12 coaches in 4 programs this
month." Coach Bob's once-cloned plan is at position 23, with no
credibility line (silence beats nag — below the threshold the line
is ABSENT). She skims the top three. She taps Coach Maya's. She
clones the closeout plan to her own team (the existing 0049 mechanic
fires). Her tap also writes a `practice_plan_clones` row (it already
does — the clone count is derived from existing rows; this ticket
does NOT add a new clone-tracking row). Three days later she opens
the app and the discovery surface shows the SAME ranking — the new
high-clone plans she has not seen yet have surfaced, the ones she
already cloned are de-prioritized (her own teams' cloned plans drop
to the bottom by the existing 0055 filter).

### User (the published coach, Coach Maya, Thursday 6:11pm, the
12th clone of her closeout plan just landed)

She opens the SportsIQ app to build Tuesday's plan. At the top of
her /home, a new small card with a quiet orange accent: "Your
closeout drill was cloned by a coach in a 3rd program this month —
the Hornets program. Want to publish another?" Below the line, ONE
button: "Open my plans." She taps. The plans page loads with a
small Publish indicator next to her published plans (existing) and
the same orange accent under "Closeout 2-on-2" reading "cloned 12
times this month, 4 programs." She does NOT publish a new plan
this minute, but the seed is planted. Two weeks later she ships
her next plan and publishes it the same day. The card auto-
dismisses on view. No nag, no daily ping. The milestone is
crossed once per threshold; the next card fires when she crosses
the 25-clone or 8-program threshold, never on every clone.

### Growth

The "show me" moment is TWO screens. (1) The browsing coach's
discovery surface — a list of plans with credibility numbers
under each, the kind of list a coach DM screenshots to another
coach in the same league with "Maya's plans are getting cloned
across 4 programs — should we adopt her closeout setup?" That
screenshot is the ranked-discovery viral signal a forms-app
competitor structurally cannot match. (2) The publishing
coach's milestone card — the "your work travelled to a 3rd
program" line that turns a once-per-publish action into a
sustained reason to publish more. Compounds three ways. (1)
The ranked-discovery upgrade pull — the surface 0055 already
ships becomes the credibility ranking competitors do not have
because they do not have the publish-and-clone graph. (2) The
publishing-coach retention pull — the milestone card pulls the
publishing coach back on a HUMAN signal, complementing 0047
(the referral-conversion celebration) which is a different
edge type. (3) The cross-program network compound — every
new program that clones from a published coach is a NEW edge
in the cross-program graph, the same edge type 0050 / 0060
build for the parent loop, here for the coach loop. Distinct
from every shipped surface because every shipped surface is
single-clone or single-coach; THIS is the AGGREGATE cross-
program credibility signal, on BOTH sides.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper `src/lib/coach-reputation-utils.ts`.
  Exports `computeCoachReputation(args: { publishedCoachId:
  string; planClones: Array<{ source_plan_id: string;
  cloning_coach_id: string; cloning_team_id: string;
  cloning_org_id: string | null; created_at: string }>;
  drillClones: Array<{ source_drill_share_id: string;
  cloning_coach_id: string; cloning_team_id: string;
  cloning_org_id: string | null; created_at: string }>;
  windowDays?: number; nowMs: number }): CoachReputation`.
  `CoachReputation`: `{ cloneCount: number;
  distinctProgramCount: number; distinctCoachCount: number;
  recentProgramNames: string[] (max 3, derived
  separately) }`. The helper: (a) filters to clones in the
  last `windowDays` (default 28); (b) unions plan + drill
  clones into a per-clone tuple; (c) `cloneCount = sum`;
  (d) `distinctProgramCount = size of Set(cloning_org_id
  filtered non-null)`; (e) `distinctCoachCount = size of
  Set(cloning_coach_id)`; (f) the cloning coach's OWN
  org/team is NEVER counted (a coach who clones their own
  plan does not credit themselves); (g) self-clones (same
  `cloning_coach_id` as `publishedCoachId`) are filtered.
  Pure function, reads no DB. Per LESSONS#0023 — no
  banned-word scan needed (numbers, not free text). Per
  LESSONS#0061 — no surname guard needed. (vitest under
  `tests/lib/coach-reputation-utils.test.ts` — new): (i)
  empty clones → `{ cloneCount: 0, distinctProgramCount:
  0, distinctCoachCount: 0 }`; (ii) 5 plan clones, 1
  program → `{ 5, 1, 5 }`; (iii) 5 plan + 3 drill clones,
  3 programs, 1 self-clone → `{ 7, 3, 7 }` (self-clone
  filtered); (iv) clones outside `windowDays` excluded;
  (v) 12 clones across 4 programs, 8 distinct cloning
  coaches → `{ 12, 4, 8 }`; (vi) a clone with `org_id
  null` is counted toward `cloneCount` but NOT toward
  `distinctProgramCount`; (vii) deterministic across
  input order.

- [ ] Extend the existing 0055 league-discovery API
  (read at pickup per LESSONS#0096 — likely
  `src/app/api/league/discovery/route.ts` per the
  existing 0055 surface). The extension: (a) for each
  plan / coach returned, read the existing
  `practice_plan_clones` rows (where the source plan
  belongs to that coach) AND the existing
  `drill_share_clones` (or whatever 0064 named the
  drill-clone tracking table — read at pickup); (b)
  call `computeCoachReputation` for each published
  coach; (c) attach `{ cloneCount, distinctProgramCount,
  distinctCoachCount }` to each plan / coach in the
  response payload; (d) RE-RANK the response by
  `(distinctProgramCount desc, cloneCount desc, recency
  desc)` tuple; (e) plans whose published coach has
  `cloneCount < 3 OR distinctProgramCount < 2` get
  `reputation: null` on the payload (the surface
  renders nothing for them — silence beats small-
  number bragging). The route's `.select()` calls are
  explicit allow-lists per LESSONS#0036 — NEVER reads
  player columns, parent contact info, DOB. Per
  LESSONS#0049 / #0092 / #0100 / #0110 — the route
  gains 2 new from() calls; Glob `tests/api/league*
  .test.ts` AND `tests/app/library*` at pickup and
  extend every queue. Per LESSONS#0112 — check if the
  existing 0055 reads can be widened (e.g. the
  existing plan-shares read may already join
  team/org rows — if it does, the new aggregation
  may be derivable WITHOUT a second from() call). The
  re-ranking is BYTE-IDENTICAL to today's order when
  every plan's reputation is null (the new sort tuple
  ties on the existing recency sort). (vitest under
  `tests/api/league-discovery-reputation.test.ts` —
  new): (i) a league with 5 published plans, only
  one with `cloneCount >= 3 AND distinctProgramCount
  >= 2` → that plan is first, reputation populated;
  the other 4 keep their recency order, reputation
  null; (ii) two plans both above threshold → sorted
  by distinctProgramCount desc, then cloneCount
  desc; (iii) zero plans above threshold → BYTE-
  IDENTICAL order to today; (iv) the response
  payload's `.select()` keysets contain no minor
  data; (v) planted DOB / parent_phone on player
  rows are NEVER read.

- [ ] Extend the existing 0055 league-discovery UI
  surface (read at pickup per LESSONS#0096) to render
  the reputation line under each plan / coach card
  WHEN the payload's `reputation` is non-null. The
  line reads: "Cloned by <distinctCoachCount> coaches
  in <distinctProgramCount> programs this month." The
  line is rendered in zinc-500 (the existing dimmed-
  metadata posture of the discovery surface — read at
  pickup). The line is ABSENT when reputation is
  null. The line never names the cloning coach or
  team — only the aggregate counts. Per LESSONS#0065
  / #0066 / #0162 — discovery is a hotspot; mount
  with the SMALLEST POSSIBLE touch. Per LESSONS#0029
  / #0082 — scope every Playwright assertion to a
  per-card data-testid (the credibility number is a
  recurring digit that overlaps other strings).
  (vitest component test): (i) a plan card with
  reputation `{ 12, 4, 8 }` → renders "Cloned by 8
  coaches in 4 programs this month."; (ii) a plan
  card with reputation null → line is ABSENT; (iii)
  rendered text contains no AGENTS.md banned word;
  (iv) the data-testid is per-card.

- [ ] A new migration `065_coach_reputation_milestones
  .sql` adds the table `coach_reputation_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  published_coach_id UUID NOT NULL REFERENCES
  coaches(id) ON DELETE CASCADE, milestone_kind TEXT
  NOT NULL CHECK (milestone_kind IN ('clones_3',
  'clones_10', 'clones_25', 'clones_50',
  'programs_2', 'programs_4', 'programs_8')),
  crossed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ NULL, UNIQUE
  (published_coach_id, milestone_kind))`. Index:
  `(published_coach_id, notified_at) WHERE
  notified_at IS NULL`. NO column on any sacred
  table. Per LESSONS#0006 — confirm `065` is the
  next free integer at pickup; bump if a sibling
  claimed it. Per LESSONS#0088 — strip `--`
  comments before banned-token sweep. (vitest under
  `tests/migrations/065-coach-reputation-milestones
  .test.ts`: scan migration body with `--`
  stripped; column allow-list; CHECK constraint;
  index; UNIQUE constraint; NO new column on
  sacred tables.)

- [ ] A new cron extension OR a write-side hook
  that, when a clone fires (existing
  `/api/practice-plan/clone` and the 0064 drill-
  clone route — read paths at pickup per
  LESSONS#0096), re-computes the published
  coach's reputation and UPSERTS any milestone
  row whose threshold was just crossed. The
  UPSERT on `(published_coach_id, milestone_kind)`
  ensures a milestone fires ONCE. The route is
  best-effort: a milestone-write failure does
  NOT block the clone (per LESSONS#0036). Per
  LESSONS#0049 / #0092 / #0100 / #0110 — the
  clone route gains a new from() call; Glob
  `tests/api/practice-plan-clone*` AND
  `tests/api/drill*clone*` at pickup and
  extend every queue. (vitest under
  `tests/api/practice-plan-clone-reputation
  .test.ts` — new): (i) a clone that pushes
  `cloneCount` from 2 to 3 → `clones_3` row
  written; (ii) a clone that pushes
  `distinctProgramCount` from 1 to 2 →
  `programs_2` row written; (iii) a re-clone
  that does NOT cross a threshold → no row
  written; (iv) the milestone UPSERT is
  idempotent (same threshold crossed twice
  does not write twice); (v) a write failure
  on the milestone read returns 200 on the
  clone path (best-effort).

- [ ] A new `<CoachReputationMilestoneCard />`
  mounted on the existing /home surface (read at
  pickup per LESSONS#0096). The card renders the
  caller coach's MOST-RECENT unconsumed
  milestone (one of `clones_3 / clones_10 /
  clones_25 / clones_50 / programs_2 /
  programs_4 / programs_8`) with a copy line
  shaped per the milestone kind. Examples:
  `programs_2` → "Your <plan_title> was cloned
  by a coach in a 2nd program — well done."
  `clones_10` → "Your plans have been cloned 10
  times this month. Want to publish another?"
  ONE button: "Open my plans" (deep-links to
  the existing /plans surface). A tiny "Got it"
  button stamps `notified_at = NOW()` and hides
  the card. When the milestones list is empty,
  the card is ABSENT (silence beats nag). The
  card cycles to the most-recent on a Got-it
  tap if multiple are pending. Card exposes
  `data-testid="coach-reputation-milestone-
  card"`. Per LESSONS#0065 / #0066 / #0162 —
  smallest possible touch on the home page.
  (vitest component test): (i) one unconsumed
  milestone → card renders with the right copy;
  (ii) no milestones → card is ABSENT; (iii)
  the Open-my-plans link points at /plans; (iv)
  tapping Got-it stamps notified_at and hides
  the card; (v) rendered text contains no
  banned word for any milestone kind; (vi) two
  milestones → "+ 1 more" pill, advance on
  Got-it.

- [ ] Tier / feature gating: the reputation
  ranking on the discovery surface AND the
  reputation-milestone card on /home are
  available to EVERY tier including free —
  the published coach's reputation belongs to
  THEM (publish is free per the 0049 contract;
  reputation is a quality lift on the same
  surface). The 0055 league-discovery
  surface's EXISTING tier gate (if any) is
  unchanged. (vitest: a free-tier coach sees
  the ranking AND the milestone card; a paid-
  tier coach sees both; the 0055 discovery
  tier posture is byte-identical.)

- [ ] Privacy / COPPA contract: the
  reputation surface NEVER reads player
  columns, parent_email, DOB, medical_notes,
  jersey_number. The cloning-coach SIDE of
  every clone read carries only `cloning_coach_id`
  + `cloning_team_id` + `cloning_org_id` — and
  ONLY the org-id (PROGRAM name) is rendered to
  the published coach (the cloning coach's full
  name is NOT rendered, ever). The
  milestone-card copy reads "a coach in a 3rd
  program — <program_name>" — never "<coaching
  coach first name>" and never the cloning
  team's name. The route's `.select()` calls
  are explicit allow-lists per LESSONS#0036.
  Per LESSONS#0034 / #0088 / #0114 — the
  migration's COPPA scan strips `--` comments
  + any structural identifier. (vitest:
  planted DOB / medical_notes / parent_email
  on player rows are NEVER read; the
  reputation payload contains no cloning-
  coach name; the milestone card renders no
  cloning-coach first name; the
  `distinctProgramCount` aggregate never
  leaks the specific list of cloning teams
  beyond their org names.)

- [ ] Voice contract: every new user-facing
  string (the reputation line, every
  milestone-card copy variant, the email
  body if any, the Got-it label) contains NO
  AGENTS.md banned word per LESSONS#0023.
  Instruct positively ("cloned by N coaches
  in M programs", "well done", "want to
  publish another?", "got it") — never the
  banned ban-list. The milestone copy is a
  fixed template per kind; the matrix scan
  covers every kind. (vitest: render each
  new component and scan rendered text;
  scan the reputation line across a matrix
  of N / M counts; scan every milestone-
  kind copy.)

- [ ] Regression: the existing 0055
  league-discovery route is BYTE-IDENTICAL
  when every plan's reputation is null
  (the new sort tuple ties on the existing
  sort). The existing 0049 publish + clone
  routes are BYTE-IDENTICAL on the happy
  path (the milestone write is best-effort,
  parallel, and silent on failure). The
  existing 0064 drill-clone route is
  BYTE-IDENTICAL on the happy path. The
  existing /home surface is BYTE-IDENTICAL
  when the caller has zero unconsumed
  milestones. The existing 0026 / 0054
  coach profile surfaces are BYTE-
  IDENTICAL (reputation is NOT surfaced on
  the public profile in v1 — see Out of
  scope). (vitest: snapshot the named
  routes / components against seeded
  fixtures pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture:
  seed extension is — pre-mint 12
  `practice_plan_clones` rows (or
  whatever 0049 named the clone-tracking
  table — read at pickup per
  LESSONS#0096; if no clone-tracking
  table exists, the reputation must
  derive from `plans.source_plan_id` per
  the 0049 schema — read first) tied to
  ONE published plan by ONE seeded
  published coach, spread across 4
  distinct cloning orgs. Pre-mint ONE
  `coach_reputation_milestones` row for
  the `programs_2` threshold with
  `notified_at IS NULL` for the
  published coach. Per LESSONS#0084 —
  seed in an idempotent DELETE-then-
  INSERT block; every new coaches row
  carries a matching `auth.users` row.
  Per LESSONS#0101 — UUIDs in the next
  free `0000000000<XX>+` range.
  Playwright spec: (a) sign in as a
  BROWSING coach (NOT the published
  coach), navigate to the 0055 league
  discovery surface, assert the
  published plan renders first AND the
  reputation line reads "Cloned by N
  coaches in 4 programs this month";
  (b) sign in as the PUBLISHED coach,
  navigate to /home, assert the
  reputation-milestone card renders with
  the programs_2 copy; (c) tap Got-it,
  assert the card hides; (d) reload,
  assert the card stays hidden. Scope by
  data-testid per LESSONS#0081 /
  #0082. Skip when E2E creds are unset.

## Out of scope

- A public coach-reputation surface on
  `/coach/[handle]` (0026 / 0054). v1 is
  in-product only — surfacing reputation
  publicly opens a credibility-gaming
  surface and is a separate ticket with
  its own consent and anti-abuse posture.
- A TROPHY / LEADERBOARD surface. v1
  uses reputation as a SORT KEY and a
  milestone signal, NOT a "top 10 coaches
  in your league" leaderboard; a
  leaderboard surface is a separate
  ticket.
- An AI-generated milestone copy. v1 is
  a per-kind template-fill; the AI
  surface is a separate ticket if the
  templates prove too generic.
- An EMAIL extension of the milestone
  card. v1 is in-app only; an email
  channel is a separate ticket (the
  0042 / 0072 reactivation channels
  already cover the email surface for
  retention).
- A CROSS-WEEK or cross-month reputation
  ("your closeout plan is the most-
  cloned plan in volleyball this
  quarter"). v1 is a single 28-day
  window; cross-window comparisons are
  a v2 follow-on.
- A reputation surface for the CLONING
  coach ("you cloned from 3 different
  programs this month — you are
  exploring"). v1 is published-coach-
  side only; cloning-coach-side
  reputation is a separate ticket
  that needs its own value
  hypothesis.
- A retroactive milestone sweep at
  ticket-ship time. v1 fires on
  FORWARD clones only; back-filling
  is a separate cron-route ticket.
- A "share my reputation" surface
  (the published coach forwarding
  their reputation as a recruiting
  artifact). v1 is invisible to the
  outside world; sharing reputation
  is a separate ticket if data shows
  it matters.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/coach-reputation-utils.ts`
  (new) — pure helper. Mirror the
  shape of `src/lib/emergent-focus-
  utils.ts` (0071) and `src/lib/
  coach-reactivation-utils.ts` (0072).
- `src/app/api/league/discovery/route.ts`
  (existing — read first per
  LESSONS#0096; the 0055 ticket's
  actual route path may differ).
  Per LESSONS#0036 — `.select()`
  allow-lists. Per LESSONS#0049 /
  #0092 / #0100 / #0110 — new from()
  calls; Glob every `tests/api/
  league*.test.ts` AND `tests/app/
  library*` at pickup. Per
  LESSONS#0112 — check if the
  existing 0055 reads can be widened
  to subsume the new aggregation
  (LOWER blast radius).
- `src/app/api/practice-plan/clone/
  route.ts` (existing — read first
  per LESSONS#0096) — milestone
  write hook. Per LESSONS#0036 —
  best-effort; clone never blocks on
  milestone write. Per LESSONS#0049
  / #0092 / #0100 / #0110 — new
  from() call; Glob every
  `tests/api/practice-plan-clone*
  .test.ts` at pickup.
- `src/app/api/drill-share/clone/
  route.ts` (or whatever 0064 named
  it — existing, read first per
  LESSONS#0096) — same milestone
  write hook.
- `supabase/migrations/065_coach_
  reputation_milestones.sql` (new).
  Per LESSONS#0006 — confirm `065`
  is free at pickup. Per
  LESSONS#0088 — strip `--`
  comments before banned-token
  sweep.
- `src/types/database.ts` — add
  `CoachReputationMilestone` type.
  NO field on any existing type.
- `src/app/api/coach/reputation-
  milestones/route.ts` (new) —
  `GET(request)` returns the
  authed coach's unconsumed
  milestones from the last 14
  days. Per LESSONS#0036 —
  `.select()` allow-lists.
- `src/app/api/coach/reputation-
  milestones/consume/route.ts`
  (new) — `POST(request)` stamps
  `notified_at = NOW()` after
  ownership check.
- `src/components/library/coach-
  reputation-line.tsx` (new) — the
  zinc-500 line on a discovery
  card. `data-testid="coach-
  reputation-line"` per card.
- `src/components/home/coach-
  reputation-milestone-card.tsx`
  (new). `data-testid="coach-
  reputation-milestone-card"`.
- `src/app/(dashboard)/library/
  league/page.tsx` (existing —
  read first per LESSONS#0096;
  the 0055 surface path may
  differ). One import + one JSX
  entry per card.
- `src/app/(dashboard)/home/page
  .tsx` (existing — read first
  per LESSONS#0096). One import
  + one JSX entry. Per
  LESSONS#0065 / #0066 / #0162
  — smallest possible touch.
- `src/lib/tier.ts` — NO new
  feature key.
- `src/components/ui/upgrade-
  gate.tsx` — NO new
  registration.
- `tests/lib/coach-reputation-
  utils.test.ts` (new) — every
  helper case.
- `tests/api/league-discovery-
  reputation.test.ts` (new) —
  every route case.
- `tests/migrations/065-coach-
  reputation-milestones.test.ts`
  (new).
- `tests/api/practice-plan-
  clone-reputation.test.ts`
  (new) — every milestone-
  write case.
- `tests/api/drill-share-
  clone-reputation.test.ts`
  (new, if 0064 exposed a
  separate route — Glob at
  pickup).
- `tests/api/coach-reputation-
  milestones.test.ts` (new).
- `tests/api/coach-reputation-
  milestones-consume.test.ts`
  (new).
- `tests/components/coach-
  reputation-line.test.tsx`
  (new).
- `tests/components/coach-
  reputation-milestone-card
  .test.tsx` (new).
- `tests/api/league*.test.ts`
  AND `tests/app/library*
  .test.ts` AND
  `tests/api/practice-plan-
  clone*.test.ts` AND
  `tests/api/drill*clone*
  .test.ts` (existing — Glob
  at pickup per LESSONS#0110)
  — extend every
  `mockReturnValueOnce`
  queue. Per LESSONS#0116 —
  if the Glob returns empty
  for a prefix, document the
  empty sweep in the
  Implementation log and do
  not invent files.
- `tests/e2e/coach-
  reputation-flow.spec.ts`
  (new). Seed extension per
  the AC. UUIDs in the next
  free range per
  LESSONS#0101. Skip when
  E2E creds are unset.
- New deps: NO. Migration:
  YES (065 or bump). Env
  vars: NO new. AI prompt
  change: NO. Tier feature
  key: NO new key.
- LESSONS to anchor: #0006
  (prefix uniqueness), #0020
  / #38 (.test.ts), #0023
  (positive voice on every
  copy), #0029 / #0082
  (data-testid scoping —
  digits overlap), #0034 /
  #0088 (strip `--`
  comments on COPPA sweep),
  #0036 (best-effort
  render + `.select()`
  allow-lists), #0049 /
  #0092 / #0100 / #0110
  (mock queue spillover —
  Glob every league /
  clone test), #0055
  (route handler call
  posture), #0061
  (literal space on
  defensive scans), #0062
  (thenable chain mock
  when two `.eq()` calls),
  #0065 / #0066 / #0162
  (home + discovery
  hotspots — smallest
  possible touch), #0084
  / #0101 (seed posture;
  UUID range), #0096
  (schema wins over
  prose — at pickup read
  the actual 0049 clone-
  tracking schema, the
  actual 0055 discovery
  route path, the actual
  /home + /library
  surfaces, the actual
  0064 drill-clone
  route), #0103
  (optional widening on
  any shared type), #0112
  (widen existing read
  to subsume new query
  — lower blast radius
  than a new from()),
  #0114 (strip
  structural identifier
  when its name contains
  a banned token), #0116
  (a Glob sweep that
  returns empty is a
  no-op, not a missing
  file).

## Implementation log

(Appended by the implementation-dev agent during execution.)

### 2026-06-07 — Pickup notes (implementation-dev)

**Status: in-progress.** Branch `feat/0073-coach-reputation-on-league-discovery`.

LESSONS#0096 pickup reads — actual schema/routes vs. ticket prose:

- **Clone-tracking tables.** The 0049 schema (`supabase/migrations/048_practice_plan_shares.sql`) does NOT use a `practice_plan_clones` table — the clone tracking is `plans.source_plan_id` (a self-FK on `plans`, set when a clone is created). The 0064 schema (`supabase/migrations/059_drill_shares.sql`) uses a dedicated `drill_share_clones` table. So the route extension must read `plans` (filtered by `source_plan_id IN <publisher plan_ids>`) for plan clones AND `drill_share_clones` for drill clones. Joined to the cloning coach's row to derive `cloning_org_id`.
- **0055 league-discovery route.** Lives at `src/app/api/practice-plan-shares/league/route.ts` (not `src/app/api/league/discovery/route.ts`). The route already does five `from()` calls: teams (caller ownership), coaches (caller org), coaches (peer coaches), teams (peer teams), practice_plan_shares (heavy read with plan join). We extend with two NEW reads — plans (source_plan_id-based clone scan) and drill_share_clones — for the reputation aggregation. Per LESSONS#0112 widening one of the existing `.select()` calls subsumes nothing usefully because the new reads are on different tables — but we DO keep the new reads conditional on a non-empty peer plan set so the route is byte-identical on empty leagues.
- **0049 clone route.** Lives at `src/app/api/practice-plan-shares/clone/route.ts` (not `/api/practice-plan/clone/route.ts`).
- **0064 drill clone route.** Lives at `src/app/api/drill-shares/[token]/clone/route.ts` (not `/api/drill-share/clone/route.ts`).
- **0055 UI surface.** The league discovery surface is a `<LeaguePlansSection />` mounted at the top of `src/app/(dashboard)/plans/page.tsx` — NOT a separate `/library/league` page. The reputation line mounts on each row of `src/components/plan/league-plans-section.tsx`.
- **/home page.** `src/app/(dashboard)/home/page.tsx` (client component). Pattern: mount the new milestone card next to the existing `<ReturningParentSection />` (line 1444) — same `!practiceActive` guard.
- **Next migration prefix.** `064_coach_reactivation_signals.sql` is the latest. `065` is the next free prefix. Confirmed via `ls supabase/migrations/`.
- **UUID range for seed extension.** Used: `d0..d6`, `e0..e1`. Next free: `0000000000d7..dc` (six rows planned for this ticket).

LESSONS#0116 empty-sweep documentation (Glob hits that returned empty):

- `tests/api/league*.test.ts` — empty (no files match this prefix). The relevant league test is `tests/api/practice-plan-shares-league.test.ts`; we extend that file.
- `tests/app/library*.test.ts` — empty (no `library*` files; the 0055 surface is on `/plans`, not `/library`).
- `tests/api/practice-plan-clone*.test.ts` — empty (no files match this prefix). The relevant clone test is `tests/api/practice-plan-shares-clone.test.ts`; we extend that file.
- `tests/api/drill*clone*.test.ts` — empty (no files match this prefix). The relevant drill clone test is `tests/api/drill-shares-clone.test.ts`; we extend that file.

Per LESSONS#0116 the empty sweeps are a no-op — don't invent files. The actual sibling files we update are the four named above.
