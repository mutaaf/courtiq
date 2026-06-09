---
id: 0076
title: When a coach who cloned another coach's drill thumbs it up after running it, tell the publishing coach by name — "your closeout drill landed for a coach in the Hornets program" — and weight 0073 reputation by clones that stuck, not clones that downloaded
status: shipped
priority: P1
area: plans
created: 2026-06-09
owner: product-groomer
---

## User story

As a volunteer coach who published her favorite closeout drill via the
0064 share card and has watched the 0073 reputation surface tick up to
"12 coaches in 4 programs cloned this month," I want — the first time a
cloning coach actually RAN that drill at a practice and gave it a
thumbs-up in their own 0044 drill signals — to be told by name which
program it landed in ("a coach in the Hornets program ran your closeout
drill at Tuesday's practice and thumbed it up — that's the second
program where it stuck this month"), and I want the 0073 league
discovery ranking to weight the published drill / plan by clones that
STUCK (the downstream coach used it AND thumbed it up), not just clones
that were downloaded, so the credibility number under my drill card on
discovery means "this drill works on a real court in someone else's
gym" and not "this drill got tapped a lot."

## Why now (four lenses)

### Product Owner

The product has shipped the full publish-clone-rank stack: 0049 publishes
a practice plan, 0064 publishes a single drill, 0055 surfaces league
plans on discovery, 0073 ranks the publishing coach by `(distinct
program count, clone count, recency)`, 0075 surfaces cross-program
emergent skills on Capture and reuses the same clone-count signal. What
is MISSING is the SECOND HALF of the loop: a clone is currently counted
as a credibility unit the moment the cloning coach taps Save — but a
clone that never ran on a court is structurally indistinguishable from a
clone that became Tuesday's most-effective drill. The 0044 helper
already records `coach_drill_signals` (the cloning coach's OWN thumbs
up / thumbs down on a drill in their library), so the data to derive
"the clone stuck" already exists. The smallest meaningful unit of value
is: (a) a new pure helper
`detectStuckClones(args: { drillShareIds: string[]; lookbackDays: number;
nowMs: number }, db reads upstream)` that returns the set of
`(drill_share_id, cloner_coach_id, program_id, stuck_at)` tuples where
the cloner has a `coach_drill_signals.rating='up'` for the cloned drill
created AFTER their `drill_share_clones.cloned_at`; (b) a write-side
hook on the existing 0044 thumbs-up POST that, when a freshly-thumbed
drill is itself a CLONE (i.e. there is a matching `drill_share_clones`
row tied to the same cloning coach), upserts a row into a new
`drill_clone_stick_signals` table; (c) the existing 0073
`computeCoachReputation` is widened (per LESSONS#0103 optional
widening) with a `stuckCloneCount` + `stuckProgramCount` that subset
the existing counts to stuck clones only; (d) the 0073 league-discovery
ranking re-sorts to `(stuckProgramCount desc, distinctProgramCount desc,
cloneCount desc, recency)` so a drill that stuck in 3 programs
out-ranks a drill that was downloaded by 12 programs but stuck in zero;
(e) ONE quiet milestone-style notification primitive — a row in the
existing 0073 `coach_reputation_milestones` table with new
milestone_kinds `stuck_1 / stuck_3 / stuck_8` — fires the existing 0073
milestone card on the publishing coach's `/home` with copy that names
the cloning PROGRAM (not the cloning coach) the first time a clone
sticks. NO new tier feature key, NO public surface, NO AI generation.

### Stakeholder

This is the moat-deepening primitive that turns the publish-clone graph
from a download counter into a real coaching-effectiveness signal — the
single edge that makes 0073 reputation TRUSTABLE by a coach who has
never met the published coach. Three compoundings, all structurally
hard for a forms-app competitor because they require BOTH the
cross-coach clone graph AND a per-coach drill-effectiveness signal,
both of which the product has and competitors do not. (1) The
credibility-quality moat — the existing 0073 ranking is honest but
shallow ("12 coaches downloaded this"); the stuck-clone ranking is
the deeper honesty ("3 of those coaches ran it and it worked for
them"). A coach browsing 0055 discovery in October trusts a "stuck in
3 programs" number more than a "cloned by 12 programs" number, and
the higher-quality signal is what makes 0055 the default coaching
reference. (2) The publishing-coach retention compound — the existing
0073 milestone fires once per download milestone; this ticket adds a
DEEPER milestone family that fires far less often but on a far higher-
trust signal ("your drill landed in a 3rd real gym" beats "your drill
was downloaded by a 4th program"). The dormant publishing coach who is
already on 0073's `clones_10` plateau gets a new milestone family that
re-engages them on the effectiveness signal. (3) The 0075 cross-
program feed-back compound — 0075 currently picks the MOST-THUMBED
drill in the league for the emerging skill; widening the 0075 picker
to bias toward drills with a positive `stuckProgramCount` means the
Capture surface surfaces drills that have ALREADY landed in other
coaches' gyms, not just drills that have been downloaded most.
Distinct from 0044 (the intra-coach thumb-up signal that already
ranks the OWN coach's drills), 0064 (the share-card publish), 0073
(the download-ranked reputation), 0075 (the cross-program emergent
focus that consumes the ranking). THIS is the missing edge that
closes the publish → clone → run → thumb-up → re-signal loop, and
the loop that promotes 0073 from a download counter to a
coaching-effectiveness counter.

### User (the publishing coach, Coach Maya, Wednesday 8:33pm, two weeks
after her closeout drill was cloned by a Hornets coach)

She opens SportsIQ to write Thursday's plan. At the top of /home,
under the existing 0073 milestone slot, a new small card — the SAME
visual treatment as the 0073 `clones_3` card, but with copy that
reads: "Your closeout drill landed for a coach in the Hornets
program — they ran it Tuesday and thumbed it up. That's the first
program where your drill stuck." ONE button: "Open my drill" (deep-
links to the existing 0064 share-card admin for that drill). She
taps. She lands on the share card surface, sees the existing 0073
"cloned by N coaches in M programs" line AND a new second line
underneath in zinc-500 — "stuck in 1 program so far." She closes
the app feeling like her work travelled into a gym she will never
visit. Three weeks later the next card fires — "Your closeout
drill has now stuck in a 3rd program — Hawks, Hornets, and the
Bears program have each run it and thumbed it up." The cards
cycle on tap; one shows at a time; the card is ABSENT when no
stuck milestone is unconsumed. No daily ping, no nag.

### User (the browsing coach, Sarah, Sunday 8:42pm, looking at league
discovery to pick Thursday's drill)

She opens the existing 0055 league discovery surface. The drill cards
are still ranked by Maya's closeout drill first — but Maya's drill
now has a NEW second credibility line under the existing 0073 line:
"Cloned by 12 coaches in 4 programs this month — stuck in 3 of those
programs." She knows what that means: three real coaches at three
different programs ran this drill at a real practice and thumbed it
up. She clones it for her Tuesday plan. Three weeks later she runs
it, thumbs it up — and her thumb-up fires the same loop back for
Maya. The credibility signal becomes self-feeding.

### Growth

The "show me" moment is TWO screens. (1) The publishing coach's
"your drill stuck" card — the screenshot a coach DMs to another
coach in their league with "the app told me a coach in the Hornets
program ran my drill on Tuesday — wild." That screenshot is the
publishing-coach retention pull that no forms-app structurally can
match because no forms-app has a cross-program clone graph paired
with a downstream effectiveness signal. (2) The browsing coach's
"stuck in 3 programs" line under the discovery card — the
screenshot that becomes the credibility signal in a league text
thread when a coach is recommending a plan. Compounds three ways.
(1) The publish-loop retention compound — every "stuck" signal
fires the publishing coach back into the app, where they are most
likely to publish another plan; the loop self-feeds. (2) The
discovery-quality compound — the higher-quality ranking surfaces
drills that work in real gyms, which makes 0055 the default
coaching reference, which feeds 0075's Capture surface, which
fires more clones, which fires more thumbs-up, which fires more
stuck signals. (3) The cross-program word-of-mouth compound — a
publishing coach whose drill stuck in another program is
structurally more likely to mention SportsIQ to a third coach
("my closeout drill is being run in three other programs now —
the app told me by name"). Distinct from every shipped surface
because every shipped surface treats a clone as an undifferentiated
unit; THIS is the first surface that separates download from
adoption.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper `src/lib/clone-stick-utils.ts`. Exports
  `detectStuckClones(args: { drillShares: Array<{ drill_share_id:
  string; drill_id: string; publisher_coach_id: string }>; clones:
  Array<{ drill_share_id: string; cloner_coach_id: string;
  cloner_org_id: string | null; cloned_at: string }>;
  thumbsUp: Array<{ coach_id: string; drill_id: string;
  signaled_at: string }>; lookbackDays?: number; nowMs: number }):
  Array<{ drill_share_id: string; cloner_coach_id: string;
  cloner_org_id: string | null; stuck_at: string }>`. The helper:
  (a) joins each clone to a thumbs-up where `coach_id ===
  cloner_coach_id` AND `drill_id` matches the drill_share's
  `drill_id` AND `signaled_at >= cloned_at` (the thumb came AFTER
  the clone — a thumb from BEFORE the clone is not a stick
  signal); (b) excludes the publisher's OWN thumbs-up on their own
  drill (`cloner_coach_id !== publisher_coach_id` — a coach
  thumbing their own drill is not a stick signal); (c) returns the
  EARLIEST qualifying `(drill_share_id, cloner_coach_id)` tuple
  (one stick per cloner per share); (d) defaults `lookbackDays =
  60` (a thumb more than 60 days after the clone is structurally
  not a "ran it and it worked" signal). Pure function, reads no
  DB. Per LESSONS#0023 — numbers, not free text. (vitest under
  `tests/lib/clone-stick-utils.test.ts` — new): (i) empty inputs
  → empty result; (ii) clone with a matching thumb AFTER the clone
  → one stuck tuple; (iii) clone with a thumb BEFORE the clone →
  empty (timing); (iv) clone with a thumb from the PUBLISHER
  (cloner_coach_id === publisher_coach_id) → empty (self-thumb
  filter); (v) clone with a thumb-down → empty (only `up`
  signals); (vi) two thumbs from the same cloner on the same
  drill → ONE stuck tuple (the earliest `signaled_at`); (vii)
  thumb signaled more than `lookbackDays` after the clone →
  empty; (viii) deterministic across input order.

- [ ] A new migration `067_drill_clone_stick_signals.sql` adds the
  table `drill_clone_stick_signals (id UUID PRIMARY KEY DEFAULT
  gen_random_uuid(), drill_share_id UUID NOT NULL REFERENCES
  drill_shares(id) ON DELETE CASCADE, cloner_coach_id UUID NOT
  NULL REFERENCES coaches(id) ON DELETE CASCADE, cloner_org_id
  UUID NULL REFERENCES organizations(id) ON DELETE SET NULL,
  stuck_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE
  (drill_share_id, cloner_coach_id))`. Index: `(drill_share_id,
  stuck_at DESC)` for the publisher-side rollup query. Per
  LESSONS#0006 — confirm `067` is the next free integer at
  pickup; bump if a sibling claimed it. Per LESSONS#0088 / #0114
  — strip `--` comments AND the structural identifier names
  (`drill_clone_stick_signals`, `cloner_coach_id`, `cloner_org_id`)
  before the banned-token sweep. NO column on any sacred table
  (`players` / `observations` / `auth.users` untouched). (vitest
  under `tests/migrations/067-drill-clone-stick-signals.test.ts`:
  scan migration body with `--` stripped + identifier strip;
  column allow-list; UNIQUE constraint; index; NO new column on
  sacred tables.) Per LESSONS#0074 — bump
  `tests/migrations/no-new-migration-0068.test.ts` (or the
  current N+1 sentinel) from 67 → 68.

- [ ] A write-side hook on the existing 0044 thumbs-up POST
  (read at pickup per LESSONS#0096 — likely
  `src/app/api/coach-drill-signals/route.ts` or the path the
  0044 ticket landed). When a thumb-up POST fires AND the
  thumbed drill has a matching `drill_share_clones` row where
  `cloner_coach_id === caller AND cloned_at < signaled_at`, the
  hook upserts a `drill_clone_stick_signals` row keyed on
  `(drill_share_id, cloner_coach_id)`. The UPSERT is best-
  effort: a stick-signal write failure does NOT block the
  thumb-up (per LESSONS#0036). The hook NEVER fires for the
  publisher's OWN thumbs-up on their own drill (the helper's
  self-thumb filter, mirrored at write time). Per LESSONS#0049
  / #0092 / #0100 / #0110 — the route gains 2 new from() calls
  (drill_shares + drill_share_clones lookup); Glob
  `tests/api/coach-drill-signals*` AND `tests/api/drill*signal*`
  AND `tests/lib/drill-thumbs*` at pickup and extend every
  queue. Per LESSONS#0116 — empty Glob is a no-op; document
  in the log. (vitest under `tests/api/coach-drill-signals-
  stick-hook.test.ts` — new): (i) thumb-up on a cloned drill
  AFTER the clone → one stick row written; (ii) thumb-up on a
  cloned drill BEFORE the clone (impossible in production but
  defensive) → no row written; (iii) thumb-up by the
  publisher on their own drill → no row written; (iv) thumb-
  down on a cloned drill → no row written; (v) duplicate
  thumb-up (re-tap) on the same cloned drill → idempotent
  (one row, not two — UNIQUE on `(drill_share_id,
  cloner_coach_id)`); (vi) write failure on the stick row
  returns 200 on the thumb-up path (best-effort).

- [ ] Widen the existing 0073 `src/lib/coach-reputation-utils
  .ts` `computeCoachReputation` to additively return
  `stuckCloneCount` and `stuckProgramCount` per LESSONS#0103
  optional widening — every existing 0073 caller stays BYTE-
  IDENTICAL when the new `stuckClones` input is `undefined`.
  Signature: `computeCoachReputation(args: { ...existing
  fields...; stuckClones?: Array<{ drill_share_id: string;
  cloner_coach_id: string; cloner_org_id: string | null;
  stuck_at: string }> }): { ...existing... ;
  stuckCloneCount: number; stuckProgramCount: number }`. The
  new counts subset the existing counts to stuck-only and
  follow the same self-filter + windowDays posture. (vitest
  extending `tests/lib/coach-reputation-utils.test.ts`):
  (i) existing 0073 fixtures return BYTE-IDENTICAL output
  for the existing keys (the new keys default to 0 when no
  `stuckClones` is passed); (ii) 12 clones, 3 stuck → `{
  ...; stuckCloneCount: 3, stuckProgramCount: <distinct
  cloner_org_id count among stuck> }`; (iii) stuck self-
  clones are filtered (self-thumb on own drill); (iv) the
  new counts respect the existing `windowDays` filter
  (default 28 — read at pickup per LESSONS#0096).

- [ ] Extend the existing 0073 league-discovery route (real
  path `src/app/api/practice-plan-shares/league/route.ts`
  per LESSONS#0096 — confirm at pickup) to read
  `drill_clone_stick_signals` rows for the published
  coaches' drill_share_ids in the window, pass them to
  `computeCoachReputation`, and re-rank by `(stuckProgramCount
  desc, distinctProgramCount desc, cloneCount desc,
  recency desc)`. Per LESSONS#0036 — `.select()` allow-
  lists. Per LESSONS#0049 / #0092 / #0100 / #0110 — the
  route gains ONE new from() call (drill_clone_stick_signals);
  extend every sibling `mockReturnValueOnce` queue in
  `tests/api/practice-plan-shares-league*.test.ts` AND
  `tests/api/league-discovery-reputation*.test.ts` (real
  paths via Glob at pickup). Per LESSONS#0112 — check
  whether the existing reads can be widened to subsume
  (likely NOT — stick is a different table); proceed with
  one additive from(). The re-rank is BYTE-IDENTICAL when
  every plan's `stuckProgramCount` is 0 (the tuple ties on
  the existing 0073 order). The response payload widens
  the existing `reputation` object additively per
  LESSONS#0103 — the new keys default to 0 when no stick
  rows exist. (vitest under
  `tests/api/league-discovery-stick-rank.test.ts` — new):
  (i) two plans both above the existing 0073 threshold,
  one with `stuckProgramCount = 3` and one with `0` → the
  stuck one is first; (ii) a plan with
  `stuckProgramCount = 3` AND a plan with
  `distinctProgramCount = 5` but `stuckProgramCount = 0`
  → the stuck plan is first (stick beats download
  volume); (iii) zero stuck signals → BYTE-IDENTICAL
  ordering to today's 0073; (iv) the payload's
  `.select()` keysets contain no minor data;
  (v) planted DOB / parent_phone on player rows are
  NEVER read.

- [ ] Extend the existing 0073
  `src/lib/coach-reputation-milestone-hook.ts` (real path
  read at pickup per LESSONS#0096) to ADDITIONALLY upsert
  a `coach_reputation_milestones` row whose
  `milestone_kind` is one of NEW values `stuck_1 /
  stuck_3 / stuck_8` when the new `stuckCloneCount`
  crosses 1, 3, or 8 for a publishing coach. The CHECK
  constraint on `coach_reputation_milestones.milestone_kind`
  must be widened in this ticket's migration to include
  the new kinds. The hook fires from the same write site
  as the existing 0073 hook (the clone-route hook for
  consistency) AND additionally from the new thumb-up
  hook above (so the milestone can cross when a stick
  signal fires, not just when a clone fires). The UPSERT
  on `(published_coach_id, milestone_kind)` keeps each
  kind firing ONCE. Per LESSONS#0036 — best-effort; the
  milestone write failure does NOT block the upstream
  action. (vitest under
  `tests/api/coach-drill-signals-stick-milestone.test.ts`
  — new): (i) a stick signal that pushes
  `stuckCloneCount` from 0 to 1 → `stuck_1` row
  written; (ii) a stick signal that pushes
  `stuckCloneCount` from 2 to 3 → `stuck_3` row written;
  (iii) a re-thumbed stick (idempotent) does NOT write
  a second milestone row; (iv) the existing 0073
  `clones_3 / programs_2 / etc` milestones still fire
  on the clone-route hook (BYTE-IDENTICAL to 0073's
  test suite for the existing kinds); (v) a write
  failure on the milestone row returns 200 on the
  thumb-up path (best-effort).

- [ ] Extend the existing 0073
  `<CoachReputationMilestoneCard />` (real path read at
  pickup) to render copy for the three new milestone
  kinds. The copy variants:
  - `stuck_1` → "Your <drill_title> just landed for a
    coach in the <program_name> program — they ran it
    and thumbed it up. That's the first program where
    your drill stuck."
  - `stuck_3` → "Your <drill_title> has stuck in a 3rd
    program — <program_name_1>, <program_name_2>, and
    <program_name_3> have each run it and thumbed it
    up."
  - `stuck_8` → "Your <drill_title> has stuck in 8
    programs this month. Want to publish another?"
  The button is the existing 0073 "Open my plans" /
  the new "Open my drill" deep-link to the existing
  0064 share-card admin surface when the milestone is
  on a drill_share. The card pulls the program names
  from `drill_clone_stick_signals` joined to
  `coaches.org_id → organizations.name`. NO cloning-
  coach first name is ever rendered (the
  attribution unit is the program, NOT the coach —
  same posture as the existing 0073 program-naming
  contract). Per LESSONS#0023 — every copy variant
  positively instructed; banned-word matrix scan
  over all new kinds. Per LESSONS#0029 / #0082 —
  the card's existing `data-testid="coach-
  reputation-milestone-card"` is reused. (vitest
  component test): (i) `stuck_1` unconsumed
  milestone with one stuck program → card renders
  with the program name + drill title; (ii)
  `stuck_3` with three program names → all three
  rendered; (iii) no stick milestones → card is
  absent (existing 0073 still-empty contract
  preserved); (iv) tapping "Open my drill" deep-
  links to the 0064 share-card admin for that
  drill; (v) rendered text contains no banned
  word for any stuck-kind matrix.

- [ ] Tier / feature gating: NO new tier feature key.
  The stick signal and the milestone card are
  available to EVERY tier including free — the
  publishing coach's stick reputation belongs to
  them and the publish action is already free per
  the 0049 / 0064 contract. The existing 0044 thumb-
  up posture is BYTE-IDENTICAL (the new write-side
  hook is additive). (vitest: a free-tier
  publishing coach sees the milestone card; a
  free-tier cloning coach can fire a stick signal
  by thumbing-up; the existing 0044 / 0073 tier
  posture is byte-identical.)

- [ ] Privacy / COPPA contract: the new route reads
  ONLY drill_shares + drill_share_clones +
  coach_drill_signals + coaches.id / org_id +
  organizations.name. NEVER reads player columns,
  parent_email, DOB, jersey_number, medical_notes,
  photo URLs. The stick-signal table itself stores
  NO minor data (the schema's `cloner_coach_id` +
  `cloner_org_id` are coach / org entities, NOT
  player entities). The milestone card renders the
  cloning PROGRAM name, never the cloning coach's
  name (consent posture — same as 0073). Per
  LESSONS#0036 — `.select()` allow-lists on every
  read. Per LESSONS#0088 / #0114 — the migration's
  COPPA scan strips `--` comments AND the
  structural identifier names. (vitest: planted
  DOB / medical_notes / parent_phone on player
  rows are NEVER read; the response payload
  contains no cloning-coach name; the milestone
  card renders no cloning-coach first name; the
  `stuckProgramCount` aggregate never leaks the
  specific list of cloning teams beyond their org
  names.)

- [ ] Voice contract: every new user-facing string
  (the three new milestone copy variants, the new
  "Open my drill" button label) contains NO
  AGENTS.md banned word per LESSONS#0023. Numbers
  spelled out (one / three / eight) per the
  existing 0071 / 0073 / 0075 posture (read at
  pickup). Instruct positively in any prompt or
  template — never enumerate the banned list.
  (vitest: render each new component variant and
  scan rendered text; scan the milestone-kind
  matrix.)

- [ ] Regression: the existing 0044 thumb-up POST
  is BYTE-IDENTICAL on every existing happy path
  (the stick hook is additive try/catch-wrapped).
  The existing 0073 league-discovery route is
  BYTE-IDENTICAL when no stick signals exist (the
  re-rank ties on the existing tuple). The
  existing 0073 milestone-card component is
  BYTE-IDENTICAL when no stuck-kind milestones
  are unconsumed. The existing 0075 cross-program
  Capture surface is BYTE-IDENTICAL in v1 (the
  picker stays on the existing 0044 thumbed-drill
  rank; widening the picker to bias toward stuck
  drills is Out-of-scope here — see Out-of-scope).
  The existing 0064 drill-share admin surface is
  BYTE-IDENTICAL (this ticket adds an additional
  zinc-500 line on the existing share-card admin,
  per LESSONS#0065 / #0066 / #0162 — smallest
  possible touch). (vitest: snapshot the named
  routes / components against seeded fixtures
  pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — pre-mint one published drill_share
  for the existing 0073 published coach (the 0073
  seed already pre-mints this published coach +
  her drill_share — read at pickup per
  LESSONS#0096). Pre-mint THREE distinct cloning
  coaches in THREE distinct orgs (NOT the
  published coach's org), each with one
  `drill_share_clones` row tied to the published
  drill_share AND one `coach_drill_signals` row
  with `rating='up'` on the SAME drill_id AND
  `signaled_at > cloned_at`. Pre-mint TWO
  `drill_clone_stick_signals` rows (the third is
  derived live by the e2e to test the
  forward-path hook). Pre-mint ONE
  `coach_reputation_milestones` row of kind
  `stuck_1` with `notified_at IS NULL` for the
  published coach. Per LESSONS#0084 — seed in
  the idempotent DELETE-then-INSERT block; every
  new coaches row carries a matching `auth.users`
  row. Per LESSONS#0101 — UUIDs in the next
  free `0000000000<XX>+` range (the existing
  seed's highest reserved family is `0...f2` per
  the 0073 implementation log — confirm the next
  free range at pickup). Playwright spec: (a)
  sign in as the published coach, navigate to
  /home, assert the `<CoachReputationMilestoneCard
  />` renders the `stuck_1` copy with the
  Hornets (or whatever the seeded program name
  is) program name; (b) sign in as the THIRD
  cloning coach, fire a thumb-up POST against
  the same drill_id (the 0044 route) AND assert
  the new write-side hook upserts a stick row;
  (c) sign back in as the published coach,
  reload /home, assert the milestone card cycles
  to `stuck_3` (now that three programs have
  stuck); (d) navigate to the existing 0055
  league-discovery surface as a fourth browsing
  coach, assert the published drill's reputation
  line now reads the new "stuck in 3 programs"
  second line. Scope by data-testid per
  LESSONS#0081 / #0082. Skip when E2E creds
  are unset.

## Out of scope

- A 0075 Capture-surface widening to bias the
  drill picker toward stuck drills. This widens
  the consuming surface and earns its own
  ticket if data shows the bias improves
  Capture-side clone-to-stick conversion. v1
  ships the stick signal + the milestone +
  the 0073 ranking re-sort.
- A PLAN-level stick signal (the equivalent
  for cloned practice plans — derived from a
  pattern like "the cloning coach ran the
  cloned plan in their next session AND the
  session has a recap"). v1 is drill-level
  only because the 0044 thumb-up gives a clean
  one-event stick signal; the plan-level
  stick is a v2 ticket with its own
  definition.
- A PUBLIC stick number on `/coach/[handle]`
  (0026 / 0054). v1 is in-product only — same
  consent posture as 0073's "no public
  reputation" out-of-scope contract.
- A "your drill DID NOT stick" surface (a
  negative signal back to the publisher when
  cloning coaches thumb-down). v1 is positive-
  signal only; the negative signal is a
  separate ticket with its own UX and
  consent posture.
- A LEAGUE-WIDE leaderboard of stuck drills.
  v1 uses stick as a SORT KEY and a milestone
  signal, NOT a "top stuck drills in
  basketball this month" leaderboard; the
  leaderboard surface is a separate ticket.
- A RETROACTIVE stick sweep at ship time.
  v1 fires on FORWARD thumb-up actions only;
  back-filling old thumbs against old clones
  is a separate cron-route ticket if
  needed.
- A "share that your drill stuck" surface
  (the publishing coach forwarding the
  milestone card as a viral artifact). v1
  is in-product only; the share-out
  surface is a separate ticket.
- An EMAIL extension of the stick milestone
  card. v1 is in-app only; an email
  channel is a separate ticket (the
  existing 0042 / 0072 reactivation
  channels already cover the email surface
  for retention).

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/clone-stick-utils.ts` (new) — pure
  helper. Mirror the shape of
  `src/lib/emergent-focus-utils.ts` (0071) and
  `src/lib/coach-reputation-utils.ts` (0073).
- `supabase/migrations/067_drill_clone_stick_
  signals.sql` (new). Per LESSONS#0006 —
  confirm `067` is the next free integer at
  pickup (latest as of write-time is `066`).
  Per LESSONS#0088 / #0114 — strip `--`
  comments + the structural identifier names
  before banned-token sweep. ALSO widens the
  existing `coach_reputation_milestones`
  CHECK constraint to include `stuck_1 /
  stuck_3 / stuck_8` in the SAME migration.
- `src/types/database.ts` — add
  `DrillCloneStickSignal` type AND extend the
  `CoachReputationMilestone.milestone_kind`
  union with the three new kinds. NO field
  on any sacred type.
- `src/app/api/coach-drill-signals/route.ts`
  (existing — read first per LESSONS#0096;
  the 0044 ticket's actual path may differ).
  Add the write-side stick hook in the same
  best-effort try/catch posture as the 0073
  clone-route hook. Per LESSONS#0049 /
  #0092 / #0100 / #0110 — Glob
  `tests/api/coach-drill-signals*` AND
  `tests/api/drill*signal*` AND
  `tests/lib/drill-thumbs*` AND
  `tests/api/drill-sequence*` at pickup;
  extend every `mockReturnValueOnce` queue
  for the 2 new from() calls. Per
  LESSONS#0116 — empty Glob is a no-op.
- `src/lib/coach-reputation-milestone-hook.ts`
  (existing — shipped by 0073; read first
  per LESSONS#0096) — wire the new
  milestone family from BOTH the existing
  clone hook AND the new thumb-up hook.
- `src/lib/coach-reputation-utils.ts`
  (existing — shipped by 0073; read first
  per LESSONS#0096). Widen
  `computeCoachReputation` ADDITIVELY per
  LESSONS#0103 — existing callers stay
  byte-identical when `stuckClones` is
  undefined.
- `src/app/api/practice-plan-shares/league/
  route.ts` (existing — real path per the
  0073 implementation log; read first per
  LESSONS#0096). One new from() call; per
  LESSONS#0049 / #0092 / #0100 / #0110 —
  extend every sibling queue.
- `src/components/home/coach-reputation-
  milestone-card.tsx` (existing — shipped
  by 0073; read first per LESSONS#0096).
  One copy-variant per new milestone kind;
  the deep-link button branches to /plans
  for plan-shaped milestones and to the
  0064 share-card admin for drill-shaped
  milestones (the existing 0073 component
  may already deep-link to /plans only;
  widen it ADDITIVELY).
- `src/lib/tier.ts` — NO new feature key.
- `src/components/ui/upgrade-gate.tsx` —
  NO new registration.
- `tests/lib/clone-stick-utils.test.ts`
  (new) — every helper case.
- `tests/migrations/067-drill-clone-stick-
  signals.test.ts` (new).
- `tests/migrations/no-new-migration-
  XX.test.ts` — bump the next-prefix
  sentinel (real path per the 0073
  implementation log).
- `tests/api/coach-drill-signals-stick-
  hook.test.ts` (new).
- `tests/api/coach-drill-signals-stick-
  milestone.test.ts` (new).
- `tests/api/league-discovery-stick-
  rank.test.ts` (new).
- `tests/lib/coach-reputation-utils.test
  .ts` (existing — extend per
  LESSONS#0103 with the new keys).
- `tests/components/coach-reputation-
  milestone-card.test.tsx` (existing —
  extend with the new milestone-kind
  cases).
- `tests/api/coach-drill-signals*.test
  .ts` AND `tests/api/practice-plan-
  shares-league*.test.ts` AND
  `tests/api/league-discovery-
  reputation*.test.ts` (existing — Glob
  at pickup per LESSONS#0110) — extend
  every `mockReturnValueOnce` queue.
  Per LESSONS#0116 — empty Glob is a
  no-op.
- `tests/e2e/clone-stick-flow.spec.ts`
  (new). Seed extension per the AC.
  UUIDs in the next free range per
  LESSONS#0101. Skip when E2E creds
  are unset.
- New deps: NO. Migration: YES (067
  or bump). Env vars: NO. AI prompt
  change: NO. Tier feature key: NO.
- LESSONS to anchor: #0006 (prefix
  uniqueness), #0020 / #38 (.test.ts),
  #0023 (positive voice; numbers
  spelled out), #0029 / #0082 (data-
  testid scoping — digits overlap),
  #0034 / #0088 / #0114 (strip `--`
  comments AND structural
  identifiers on COPPA sweep), #0036
  (best-effort + `.select()` allow-
  lists), #0049 / #0092 / #0100 /
  #0110 / #0118 (mock queue
  spillover — Glob every signal /
  clone / discovery test), #0061
  (literal space on defensive
  scans), #0062 (thenable chain
  mock when two `.eq()` calls),
  #0065 / #0066 / #0162 (smallest
  possible touch on the existing
  0073 milestone card + the 0044
  thumb-up route), #0072 (don't
  `delete` on a DB-read object —
  spread to a new object when
  stripping fields), #0084 / #0101
  (seed posture; UUID range),
  #0096 (schema wins over prose —
  at pickup read the actual 0044
  thumb-up route, the actual 0073
  reputation-utils + milestone hook
  + milestone card + league-
  discovery route, the actual
  drill_shares + drill_share_clones
  + coach_drill_signals schemas),
  #0103 (additive widening — the
  new keys default when absent),
  #0112 (widen existing read if
  possible — though likely not
  here), #0116 (Glob sweep that
  returns empty is a no-op).

## Implementation log

- 2026-06-09 [impl-dev] Pickup. Read AGENTS.md + LESSONS.md + ticket in
  full. Confirmed migration 067 is the next free prefix (last is 066
  referral_credit_grants). Read existing 0073 stack — pure helper at
  `src/lib/coach-reputation-utils.ts`, milestone write hook at
  `src/lib/coach-reputation-milestone-hook.ts`, card at
  `src/components/home/coach-reputation-milestone-card.tsx`. Read the
  0044 thumbs-up route at `src/app/api/coach-drill-signals/route.ts`
  (PATCH not POST — the route is PATCH-shaped because it doubles as a
  delete on `rating: null`). Read the 0064 drill_share_clones schema +
  drill-share clone route. Confirmed seed UUID range — the 0073 family
  ends at `0...f2`; `0...310+` is free.
- 2026-06-09 [impl-dev] Migration 067 plan: new
  `drill_clone_stick_signals` table + widen the
  `coach_reputation_milestones.milestone_kind` CHECK constraint in the
  same migration to include `stuck_1 / stuck_3 / stuck_8`. Per
  LESSONS#0088 / #0114 strip `--` comments AND the structural
  identifier names before the COPPA banned-token sweep.
- 2026-06-09 [impl-dev] Branch
  `feat/0076-clone-stick-signal` created off `main`.
- 2026-06-09 [impl-dev] Shipped via PR #396 (squash-merged). All
  three gating checks green (lint 1m29s, unit-tests 3m34s,
  e2e-tests 4m23s). Local full-suite vitest: 6256/6257 pass; the
  one fail is the well-known TZ environmental on
  `player-of-match-utils.test.ts` (LESSONS#0036, not a regression).
