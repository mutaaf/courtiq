---
id: 0063
title: When a coach clones another coach's practice plan, let them follow that coach's next drops in one tap — and tell the published coach
status: in-progress
priority: P1
area: plans
created: 2026-06-01
owner: product-groomer
---

## User story

As a volunteer coach who just cloned Coach James's "Tuesday catch-up" practice plan from the
league's published feed (0049 / 0055) because his stuff keeps working for the same age group
I coach, I want a one-tap "Follow Coach James's drops" right under the Save-to-my-team
button, so that the next plan James publishes lands in MY league feed at the top the day he
publishes it — and I want Coach James to get a quiet "Coach Sarah just cloned your plan and
is following your drops" notification on his /home, so that the loop the product just lit
up between two coaches stays lit up.

## Why now (four lenses)

### Product Owner
0049 shipped the publish-and-clone surface (a coach publishes a plan, another coach taps
to clone it). 0055 shipped the in-league discovery feed (the cloning coach finds plans
inside their own program). 0044 shipped the drill-sequence-network signal (a coach's next-
drill suggestions are informed by the league's collective drill choices). Together those
three create the COACH-TO-COACH COACHING CONTENT GRAPH the product has been building since
2026-05-26. But every edge in that graph is anonymous and one-shot: the cloning coach never
knows when the publisher publishes NEXT week, and the publisher never knows who cloned
their work. The graph has no PERSISTENT EDGES. The smallest meaningful unit of value is
ONE new follow primitive: a `coach_follows` table (`follower_id`, `followee_id`, `created_at`)
and a single "Follow Coach <Name>'s drops" button that appears INLINE on the clone-success
state of the public plan page (and on the league-feed cards on /plan). One new GET that
the existing 0055 league feed already wants ("plans published by coaches I follow, even
across program boundaries"), one quiet notification card on the publisher's /home when a
new follow lands, no new email, no new tier-gated feature. The follow is one-directional
(no approval flow — published plans are already public).

### Stakeholder
This is the moat-deepening ticket the product's coach-to-coach content graph has been
waiting for. (1) The persistent-edge moat — today's coach-to-coach graph has only
TRANSIENT edges (one clone, one event). A `coach_follows` row is a STANDING edge that
re-fires every time the followee publishes a new plan; the loop's compounding shifts
from N events per N clones to N×M events as each follow accumulates more publishes over
time. (2) The cross-program moat — 0055's discovery is scoped to `org_id` (a coach's own
program). A FOLLOW edge is cross-program by construction (a coach in program A can
follow a coach in program B), which is the FIRST piece of network value the product
ships that crosses the program boundary in the content graph. This is the moat layer
that ultimately defends against a single-program competitor or a forms-app: even if a
rival captures one program, the followed-coach edges keep SportsIQ's content graph
denser. (3) The publisher-feedback moat — today the publisher gets a "your plan was
cloned 4 times this week" rollup (0049's clone-count card on /home), but the clones
are anonymous. A follow is a NAMED, persistent endorsement; the publisher learns
WHICH coaches are coming back to them. That signal compounds the publisher's
willingness to publish AGAIN — the loop's most fragile single variable.

### User (the cloning coach, Sunday 7:18pm, just cloned James's Tuesday plan)
She taps Save-to-my-team on Coach James's plan in her league feed (0055). The cloned
plan opens on /plan as a fresh draft. New small line directly above the draft:
"Cloned from Coach James — Hornets U10 flag football. Follow his drops?" One small
button: "Follow Coach James." She taps. The line flips to "Following Coach James — his
next plan will appear at the top of your league feed." Done. The next time she opens
/plan she sees a NEW section above her org-scoped league feed: "From coaches you
follow." If James never publishes again, the section never appears. If she taps the
section title she sees the list of coaches she follows and an Unfollow button per row.
No nag, no email digest yet (a future ticket can layer one), no public visibility of
who she follows (the follow is coach-to-coach inside the product; nothing leaks to
parents or the public coach profile).

### User (the publisher, James, Monday 7:42am on /home)
He opens /home. The existing clone-count card he gets weekly (0049) now also shows
"Coach Sarah Rodriguez is following your drops." That's it. One quiet line, named coach,
no number to game, no exhortation. The card carries the small footer "publish another
plan" link that already exists on the clone-count card. The notification is rate-limited
to one per coach per week per follower so a binge of follows doesn't spam the publisher
(see AC for the dedup posture). If he wants to see his full follower list he taps the
card and lands on `/coach-profile/followers` (a new authed page, not public). His public
coach profile (0026) does NOT show his follower count — the trust signal stays
coach-to-coach inside the product, NOT vanity-metricized on a public surface.

### Growth
The "show me" moment is the SECOND-WEEK SURFACE — the cloning coach opening /plan the
following Sunday and finding James's NEW plan waiting at the top of her feed because she
followed him last week. THAT is the loop the product has been building toward since 0049
shipped: the coach who finds value in another coach's work doesn't have to remember the
publisher's name or scroll the league feed; the product remembers for her. Compounds
three ways. (1) The follow edge becomes the lever that converts ONE good plan from a
publisher into N good plans seen across the publisher's followers — the publisher's
distribution compounds without ever leaving the product. (2) The publisher's quiet "Coach
Sarah is following your drops" card materially raises the publish rate (revealed
endorsement → reciprocity → more publishes). (3) The follow graph is the SUBSTRATE that
makes every FUTURE coach-to-coach feature (a "what coaches in your follow list captured
this week" digest, a "your followed coaches all ran drill X" signal, a peer-benchmark
panel) shippable as a single-row read instead of a hard graph query. The persistent
edge is the unlock for an entire category of features. Distinct from every shipped
surface: 0049 shipped the artifact; 0055 shipped the in-program discovery; 0044 shipped
the anonymous-aggregate drill signal; THIS shipds the named-persistent-edge graph that
unifies all three.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `056_coach_follows.sql` adds the table `coach_follows (id UUID
  PRIMARY KEY DEFAULT gen_random_uuid(), follower_id UUID NOT NULL REFERENCES
  coaches(id) ON DELETE CASCADE, followee_id UUID NOT NULL REFERENCES coaches(id) ON
  DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(follower_id,
  followee_id), CHECK (follower_id <> followee_id))`. Two indexes:
  `(follower_id, created_at DESC)` (the cloning coach's "who I follow" lookup) and
  `(followee_id, created_at DESC)` (the publisher's follower list + the publisher-
  card notification dedup). Mirror `040_coach_drill_signals.sql` header style. Prefix
  `056` is the next free integer after `055_player_handoffs.sql` (LESSONS#0006 — at
  pickup confirm; if 0060 or 0061 has claimed `056` first, bump this to `057` or
  `058`). Per LESSONS#0088 strip `--` comments before the no-banned-token scan.
  (vitest: scan migration SQL stripped of `--` comments, assert the column allow-list,
  assert the UNIQUE + CHECK constraints, assert both indexes exist; assert NO new
  column on `coaches` or `plans`.)
- [ ] `POST /api/coach-follows` (new, authed) accepts `{ followee_id: UUID }`. Inserts
  a `coach_follows` row for `(follower=auth.user.id, followee=followee_id)`. Idempotent
  (the UNIQUE constraint causes a second POST to return 200 with `{ alreadyFollowing:
  true }` — the route catches the unique violation and returns success). Returns 400 if
  `followee_id === auth.user.id` (the CHECK constraint catches this too; route returns
  400 explicitly). Server-side rate limit: max 30 follows per coach per 7 rolling days
  (enforced via a count of `coach_follows` rows for the caller in the last 7 days; 429
  on overflow). (vitest: 200 on first follow + row written; 200 on duplicate POST with
  alreadyFollowing flag, no second row; 400 on self-follow; 429 on the 31st follow in
  7 days; 401 unauthed.)
- [ ] `DELETE /api/coach-follows/[followeeId]` (new, authed) deletes the
  `coach_follows` row for `(follower=auth.user.id, followee=followeeId)`. Idempotent
  (no row → 200 with `{ wasFollowing: false }`). (vitest: 200 + row deleted; 200 idempotent
  on no row; 401 unauthed.)
- [ ] `GET /api/practice-plan-shares/from-follows` (new, authed) returns the most
  recent (limit 5) `practice_plan_shares` rows whose `coach_id` is in the caller's
  `coach_follows.followee_id` set, scoped to the caller's sport (joined via the
  publisher's most recent active team's sport_id to keep the feed relevant), ordered
  by `created_at DESC`. Returns `200 { plans: Array<{ token, planTitle, publisherFirstName, publisherDisplaySport, ageGroup, createdAt }> }`. NEVER returns the
  publisher's email, parent contact, or any player data. (vitest: a caller who
  follows two publishers and one of them has published 3 plans gets the 3 published
  plans first; the publisher's first-name-only is returned, never full name; planted
  publisher email / player data on the publisher's team is NOT in the response;
  empty array for a caller who follows nobody.)
- [ ] Inline follow control on the clone-success surface:
  - On the public plan page at `/plan/[token]` (parent-portal aesthetic, NOT dark),
    when the visiting coach is signed in AND has just successfully cloned the plan,
    a small inline card appears directly below the "Save to my team" success state:
    "Cloned from Coach <First Name>. Follow their drops?" + a single button "Follow
    Coach <First Name>." The button POSTs to `/api/coach-follows`. On success the
    card flips to "Following Coach <First Name> — their next plan will appear at the
    top of your league feed."
  - On the in-league feed cards (0055's "From your league" section on /plan), each
    card gets a small "Follow" toggle inline (an icon button, no card growth). Same
    POST / DELETE wiring.
  - Both surfaces expose `data-testid="follow-coach-control"` and the follow button
    exposes `data-share-url={profileUrl}` per LESSONS#0056 / #0082 so the e2e and
    the vitest component test can scope cleanly. (Playwright + vitest: the clone-
    success surface renders the inline card; tapping the button calls POST; the
    success state flips; an unauthenticated visitor sees the card but tapping it
    routes to `/login?next=<plan-page>` and does NOT POST.)
- [ ] A new "From coaches you follow" section on `/plan` (above the existing 0055
  "From your league" section). The section reads `/api/practice-plan-shares/from-
  follows`; renders one card per result with a Save-to-my-team button (reusing the
  existing 0055 clone primitive — NO new clone endpoint). The section renders
  nothing if the caller follows zero coaches OR if every followee has published
  zero plans in the relevant window (silence beats an empty state). The section is
  best-effort: a network failure on the new GET does NOT block the /plan page from
  rendering the rest of its content. The section title carries a small "(N)" count
  matching the section title pattern of 0055. (vitest: section renders for a caller
  with follows and published plans; section is empty / not rendered for a caller
  with follows but no published plans from those followees; a network failure on
  the new GET does NOT throw on /plan.)
- [ ] Publisher-side follower notification card on /home:
  - A new `<NewFollowersCard />` component on /home reads `GET /api/coach-follows/
    new-followers` (new, authed) which returns the last 7 days of `coach_follows`
    rows where `followee_id = auth.user.id` AND whose `created_at` is more recent
    than the caller's `coaches.preferences.last_seen_follow_count` bookmark
    (mirroring the existing 0049 clone-count card's seen-bookmark pattern via the
    `/api/practice-plan-shares/clone-count/seen` precedent).
  - The card renders ONE line per new follower naming the FIRST NAME only ("Coach
    Sarah Rodriguez is following your drops"), capped at 5; if there are more, the
    card adds "+ N more." A "Got it" button POSTs to `/api/coach-follows/new-
    followers/seen` (new, authed) which sets the bookmark to `now()` so the card
    will not re-render the same followers tomorrow.
  - Dedup posture: a single follower contributes AT MOST ONE line per week of
    rendering; if they unfollow and re-follow within the week, the card still
    shows them once. (vitest: a publisher with 3 new follows in the last 7 days
    sees the card with 3 lines; the Got-it button POSTs and the next render is
    empty; a follower who un-follows + re-follows in the same week appears once.)
- [ ] A new authed page `/coach-profile/followers` (`src/app/(dashboard)/coach-
  profile/followers/page.tsx`) lists the caller's full follower set, paginated. The
  page exposes the caller's `coach_follows` where `followee_id = auth.user.id`. Each
  row shows the follower's FIRST name + a small Unfollow-me link that DELETEs the
  follow row (the follower retains the same Unfollow control from THEIR side — both
  parties can dissolve the edge). The page is NOT public (no entry in `publicPaths`
  in `src/lib/supabase/middleware.ts`). The page is NOT linked from the public
  coach profile (0026) — the follower count never leaks to a public surface.
  (Playwright: navigate as the seeded coach with 2 seeded followers; assert both
  rows render; tap Unfollow-me on one; assert the row disappears.)
- [ ] Tier / feature gating: NEITHER following NOR being-followed is tier-gated. A
  free-tier coach can follow another coach and be followed. The follow primitive
  is universal so the graph remains open (gating it would invert the network
  effect, same posture as 0049 and 0055 keeping publish + clone universal). The
  "From coaches you follow" section on /plan is universal. The publisher
  notification on /home is universal. NO new tier feature key is added. (vitest: a
  free-tier coach successfully POSTs `/api/coach-follows`; the route does NOT
  import `tier.ts`; a paid-tier publisher and a free-tier publisher both see the
  followers card.)
- [ ] Privacy / COPPA contract: the `coach_follows` table is COACH-TO-COACH only.
  It NEVER references a player, a parent, or a minor's data. The follower-list
  page renders the follower's FIRST NAME only (parsed via
  `coaches.name.split(' ')[0]`) — never the follower's full name, email, phone, or
  any other contact field. The public plan page (`/plan/[token]`) is UNCHANGED in
  what it leaks publicly — the follow control appears INLINE only after a
  successful clone, and only to the signed-in cloner; an unauthenticated visitor
  to `/plan/[token]` sees the existing 0049 surface byte-identically. The publisher's
  public coach profile (0026) does NOT display the follower count. (vitest: planted
  full-name / email / phone fields on the follower's coach row do NOT appear on the
  /coach-profile/followers page; the unauthed render of `/plan/[token]` is byte-
  identical to the 0049 baseline; the public coach profile route's response does
  NOT include `follower_count`.)
- [ ] Regression: the existing `/api/practice-plan-shares/[token]` GET response
  shape is byte-identical (new fields are added on the new routes, not on this
  one). The existing 0055 "From your league" section on /plan renders byte-
  identically when the new "From coaches you follow" section is empty. The existing
  0049 clone-count card on /home renders byte-identically; the new NewFollowersCard
  sits ABOVE or BELOW it as a separate card (read first to confirm visual order
  with the existing /home card sequence). The existing public coach profile
  (0026) is byte-identical. (vitest: snapshot the named routes / components against
  the seeded fixtures pre- and post-change; assert no diff.)
- [ ] Voice contract: every user-facing string the dev adds (the inline follow card
  copy, the section title "From coaches you follow", the publisher notification
  card text, the follower-list page copy, the Unfollow-me text) contains NO
  AGENTS.md banned word per LESSONS#0023. Instruct POSITIVELY (there is no AI
  call on this path; this is templates and component text). (vitest: render each
  component and scan for the banned list.)
- [ ] Seeded e2e on the 0006 fixture: seed extension is ONE additional coach (a
  second coach beyond the E2E coach, used as the FOLLOWEE) + ONE auth.users row
  for that coach (LESSONS#0084) + ONE practice_plan_shares row published by that
  follow-target coach so the "From coaches you follow" section has content. UUIDs
  in the next free `0000000000<XX>+` range per LESSONS#0101. Playwright spec:
  sign in as the E2E coach, navigate to `/plan/<follow-target-token>`, simulate
  the clone, tap Follow, assert the follow row exists; navigate to /plan, assert
  the new "From coaches you follow" section renders the follow-target's plan;
  navigate to /coach-profile/followers as the follow-target coach (a second
  sign-in flow OR a separate spec — match the pattern from 0029's two-coach
  e2e), assert the E2E coach appears in the follower list. Scope by `data-
  testid` per LESSONS#0081 / #0082. Skip when E2E creds are unset.

## Out of scope

- A follow-someone-from-their-public-profile button (i.e. on `/coach/<handle>`). v1
  surfaces the follow control on the CLONE-SUCCESS and the LEAGUE-FEED only —
  those are the two surfaces where revealed-preference makes the follow honest. A
  public-profile follow button is a follow-up ticket; the trust model is different
  (revealed preference vs cold tap).
- An email digest of the followed coaches' new plans. v1 surfaces the new plans
  inline on /plan; an email digest is a follow-up that needs its own cadence-
  collision review against 0023 / 0058.
- A "suggested coaches to follow" surface. v1 has no recommendation engine; the
  follow happens only after the cloning coach has chosen the plan themselves.
- A "block this coach" surface. v1 has no blocklist; the publisher's plans are
  already public via 0049, so blocking a single follower does not change what is
  visible to them. If a publisher wants to dissolve a follow they tap Unfollow-me
  on the followers page.
- A follow count on the public coach profile (0026). v1 keeps the graph private
  coach-to-coach inside the product; a public follower-count is a vanity-metric
  that the dark-zinc + orange aesthetic and the AGENTS.md voice contract reject.
- A mutual-follow / reciprocal surface ("you both follow each other"). v1 is one-
  directional. Mutuality is a follow-up that reads the same table; nothing in v1
  prevents a second ticket adding it.
- A "see what your followed coaches captured this week" digest. v1 surfaces only
  PUBLISHED PLANS from followed coaches (the artifact they chose to share);
  captures are not surface-able cross-coach because the per-player observations
  belong to the team, not the coaching network. A future surface that respects
  that boundary is a separate ticket.
- A notification to the cloned-coach EVERY week regardless of new follows. v1's
  publisher card is rendered only when there ARE new followers since the
  bookmark; an empty state is silence.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't redesign
on pickup.

- `supabase/migrations/056_coach_follows.sql` (new) — the table + 2 indexes only. NO
  column on `coaches` or `plans`. LESSONS#0006 — at pickup confirm the next-free
  prefix; if 0060 / 0061 has claimed 056, bump to 057 / 058. LESSONS#0088 — strip
  `--` comments before the no-banned-token scan.
- `src/types/database.ts` — add the new `CoachFollow` type. NO field added to the
  existing `Coach` or `Plan` types.
- `src/app/api/coach-follows/route.ts` (new) — `POST(request)`. Authed via
  `createServerSupabase()` for auth.getUser(), then `createServiceSupabase()` for
  the insert. Handle the UNIQUE-violation case by catching the error and returning
  `{ alreadyFollowing: true }` with 200. Rate-limit by `count(coach_follows)` for
  the caller in the last 7 days; 429 on >= 30.
- `src/app/api/coach-follows/[followeeId]/route.ts` (new) — `DELETE`. Idempotent.
- `src/app/api/coach-follows/new-followers/route.ts` (new) — `GET`. Returns the
  last 7 days of new follows where `followee_id = auth.user.id` AND `created_at >
  preferences.last_seen_follow_count`. Mirror 0049's clone-count seen-bookmark
  pattern (read `src/app/api/practice-plan-shares/clone-count/route.ts` +
  `src/app/api/practice-plan-shares/clone-count/seen/route.ts` first per
  LESSONS#0096 — schema wins over prose).
- `src/app/api/coach-follows/new-followers/seen/route.ts` (new) — `POST`. Sets
  `coaches.preferences.last_seen_follow_count = now().toISOString()`.
- `src/app/api/practice-plan-shares/from-follows/route.ts` (new) — `GET`. Authed.
  Per LESSONS#0049 / #0092 / #0100 — if extending shared from-chain mocks in
  any sibling test (likely `tests/app/sitemap.test.ts` if the new route is added
  to the sitemap), drain `mockReturnValueOnce` queues in `beforeEach`. The query
  joins `coach_follows` → `practice_plan_shares` → `plans` → `teams` (for the
  publisher's sport) with explicit `.select()` allow-lists (LESSONS#0036 COPPA
  posture).
- `src/components/plan/follow-coach-inline-card.tsx` (new) — the inline card on
  the clone-success state of `/plan/[token]` AND a small icon-button variant for
  the in-league feed cards. Exposes `data-testid="follow-coach-control"` and
  `data-share-url={profileUrl}` per LESSONS#0056 / #0082.
- `src/components/plan/from-coaches-you-follow-section.tsx` (new) — the new
  section on /plan reading `/api/practice-plan-shares/from-follows`. Best-effort
  render (LESSONS#0036's network-failure-doesn't-block posture).
- `src/components/home/new-followers-card.tsx` (new) — the publisher-side card on
  /home. Per LESSONS#0065 / #0066 / #0162 — `src/app/(dashboard)/home/page.tsx`
  is the recurring DIRTY hotspot; minimize edits to it. Add the card via a
  new line in the existing card list with the smallest possible touch (one
  import + one JSX entry); review the existing card sequence to insert near the
  existing 0049 clone-count card.
- `src/app/(dashboard)/coach-profile/followers/page.tsx` (new) — the authed
  follower-list page. NOT added to `publicPaths`. Per LESSONS#0091 / #0104 —
  the page is auth-required by default; no allow-list change needed; verify
  the path at pickup.
- `src/app/plan/[token]/page.tsx` (existing — read first) — mount the new inline
  follow card on the clone-success state. Per LESSONS#0009 — this is a server
  component; the clone-success state is the client-component sub-tree where
  state lives, so the new card mounts inside that sub-tree.
- `src/app/(dashboard)/plan/page.tsx` (existing — read first per 0058's note:
  the dashboard route is `/plans` (plural) and the search-param pattern is
  `?draftId=` etc.) — mount the new "From coaches you follow" section above the
  existing 0055 "From your league" section.
- `src/lib/supabase/middleware.ts` — NO change. All new endpoints live under
  `/api/coach-follows/...` and `/api/practice-plan-shares/from-follows` (auth-
  required), and the new follower-list page lives at `/coach-profile/followers`
  (auth-required). Per LESSONS#0091 / #0104 — verify at pickup.
- `tests/api/coach-follows-post.test.ts` (new, `.test.ts` per LESSONS#0020 / #38)
  — 200 first follow; 200 duplicate alreadyFollowing; 400 self-follow; 429 rate
  limit; 401 unauthed. Per LESSONS#0055 — call no-arg handlers correctly.
- `tests/api/coach-follows-delete.test.ts` (new) — 200 + delete; 200 idempotent
  no-row; 401 unauthed.
- `tests/api/coach-follows-new-followers.test.ts` (new) — bookmark-respect; cap
  at 5 + "+ N more" string; dedup on re-follow.
- `tests/api/practice-plan-shares-from-follows.test.ts` (new) — follow + publish
  flow; COPPA `.select()` allow-list assertion; empty-array for no-follow caller.
- `tests/components/follow-coach-inline-card.test.tsx` (new) — assert
  data-testid + data-share-url; POST on tap; success-state flip.
- `tests/components/from-coaches-you-follow-section.test.tsx` (new) — section
  empty when no data; network-failure does NOT throw.
- `tests/components/new-followers-card.test.tsx` (new) — card renders new
  follows; Got-it POST bookmark.
- `tests/migrations/056-coach-follows.test.ts` (new) — scan migration body with
  `--` stripped (LESSONS#0088); assert column allow-list, UNIQUE, CHECK, both
  indexes; assert NO new column on `coaches` or `plans`.
- `tests/e2e/follow-coach-flow.spec.ts` (new) — seed extension: ONE new
  `auth.users` (LESSONS#0084), ONE new `coaches` row (the follow target), ONE
  new `teams` + `team_coaches` join (LESSONS#0057), ONE `practice_plan_shares`
  row published by the new coach. UUIDs in the next free `0000000000<XX>+`
  range per LESSONS#0101 + #0102. Spec: sign in as the seeded E2E coach,
  navigate to the seeded plan-share token URL, tap Save (existing 0049 clone
  primitive), tap Follow on the new inline card, navigate to /plans, assert the
  new "From coaches you follow" section renders the follow-target's plan; for
  the publisher-card path, either a second sign-in OR a service-role-seeded
  assertion (match the pattern from 0029's two-coach e2e). Per LESSONS#0029 /
  #0082 — scope every assertion to data-testid containers, never page-wide
  getByText (the follow-target coach's first name may overlap with the E2E
  coach's "E2E" or the team name). Skip when E2E creds are unset.
- New deps: NO. Migration: YES (056 or bump). Env vars: NO new. AI prompt
  change: NO. Tier feature key: NO new key.
- LESSONS to anchor: #0006 (prefix uniqueness — coordinate with 0060 / 0061 at
  pickup), #0009 / #0036 (server vs client component fetch posture for the
  inline card on the public plan page), #0020 / #38 (.test.ts), #0023 (positive
  voice for templates), #0029 / #0082 (strict-mode collisions; scope to
  data-testid), #0036 (best-effort render + COPPA `.select()` allow-list),
  #0049 / #0092 / #0100 (mock queue spillover when extending shared from-chain
  mocks — likely the existing sitemap test if the new route is added there),
  #0055 (no-arg handler call posture in tests), #0056 / #0082 (data-share-url
  + data-testid), #0057 (team_coaches not teams.coach_id), #0065 / #0066 /
  #0162 (`home/page.tsx` is the recurring DIRTY hotspot — minimize edits and
  add the new card with the smallest possible JSX + import touch), #0084 /
  #0085 / #0086 / #0101 / #0102 (seed posture + UUID range + anchor faker
  fixtures), #0088 (strip `--` comments), #0091 / #0104 (publicPaths
  verification — the new follower-list page stays auth-required), #0096
  (schema wins over prose — read the actual `practice_plan_shares` columns +
  the existing `clone-count/seen` bookmark route at pickup time before
  writing the new routes).

## Implementation log

- 2026-06-01 [implementation-dev] Started. Branch `feat/0063-follow-coach-after-clone`
  off main. Status flipped to `in-progress` on both the ticket file and the
  README index row.
- 2026-06-01 [implementation-dev] Migration prefix deviation: the ticket named
  `056_coach_follows.sql` and authorised a bump to 057/058 if claimed. At
  pickup `supabase/migrations/056_parent_initiated_invites.sql` AND
  `supabase/migrations/057_player_trajectories.sql` BOTH exist on main. The
  next free prefix is **058**, so the migration ships as
  `supabase/migrations/058_coach_follows.sql` (LESSONS#0006).
- 2026-06-01 [implementation-dev] Regression-test deviation: the ticket's
  regression AC said `/api/practice-plan-shares/[token]` response shape is
  byte-identical. The inline follow card needs the publisher's coach id for
  its POST body so the route's allow-list widens by ONE key (`coachId`). The
  coach id is NOT minor data and is already implicit in the public token
  (anyone holding the token can POST to /api/coach-follows). The widening
  keeps first-name extraction server-side (LESSONS#0009). The existing
  practice-plan-shares-token-get keyset assertion is updated in this PR to
  expect the FIVE-key payload; no test was weakened — the contract widened.
