---
id: 0044
title: When a coach thumbs-up a drill, suggest the next drill other coaches in the same sport ran after it
status: groomed
priority: P1
area: plans
created: 2026-05-26
owner: product-groomer
---

## User story

As a volunteer coach building next week's practice who just thumbs-up'd a drill on the
break-screen, I want the app to say "12 other coaches in basketball ran THIS drill next, after
they liked the same one you just liked" — so that I get a real next-step recommendation from
the community of coaches the app has been quietly accumulating, instead of staring at a
sport-wide drill library and guessing.

## Why now (four lenses)

### Product Owner
Ticket 0039 just shipped the `coach_drill_signals` table — every thumbs-up / thumbs-down a
coach gives a drill is now a server-side fact, joined to the drill and to the coach across
all their teams and seasons. Today that data ranks ONE coach's own drills in ONE coach's own
picker. The smallest meaningful unit of value that extends it is a nightly aggregation across
all coaches into a per-sport "if a coach upvoted drill A, the next drill they upvoted within
14 days was drill B with frequency N" table — and a single section on the drill detail page
that surfaces the top-3 next-drills with their coach-counts. No new collection on any coach;
no new collection on any minor; the input is signals coaches already volunteered. One nightly
cron, one materialized table, one component on an existing page. Strictly k-anonymous: a
suggestion is surfaced ONLY when `coach_count >= 5` for that sport+drill pair, so no
individual coach's preference is inferrable from the recommendation.

### Stakeholder
This is the MOAT ticket. The structured-coach-artifact moat compounds per coach; this is the
NETWORK-EFFECT moat that compounds per coach-pair. A competitor's day-1 clone of SportsIQ
starts the suggestion engine at N=0 sequences. Every additional coach who uses the break-
screen rating UI deepens this moat for every other coach in the same sport. It also creates
a credibility surface for the app — "12 other coaches in basketball ran this drill next" is
the kind of detail a forms-app cannot produce, the kind that turns a skeptical assistant
coach into a believer. The k-anonymity floor (N≥5) is a real privacy posture, not a
performative one — it's the difference between "a network-effect product" and "a tracker"
and we ship it on the public-route side, not just in the prompt.

### User (the coach, the kitchen-table planning hour, looking at next week's drill picks)
They tap into the corner-shooting drill they ran last week. Below the drill's name they see
a small block: "Coaches who liked this drill in basketball ran: (1) close-out drill — 18
coaches, (2) elbow shooting — 14 coaches, (3) 3-on-3 to shot — 12 coaches." Three taps, one
of them added to the queue, planning done in 90 seconds instead of 20 minutes. If the drill
hasn't crossed the N≥5 floor yet (a brand-new drill, an obscure sport), the block renders
NOTHING — no "0 coaches" guilt copy, no empty state. They can dismiss the whole block per-
drill with a small "hide these suggestions" link (writes a signal of its own back to
`coach_drill_signals`).

### Growth
The "show me" moment is the suggestion box itself — a coach in a co-coach meeting taps a
drill, sees "12 other coaches in basketball ran this next," and says "wait, this thing has
data on what other coaches do?" That is the demo that converts a sport-curious assistant
into a power-coach. It also lifts plan generation and capture as side-effects: a coach who
picks a SUGGESTED drill is more likely to rate it (because they're conscious of the network),
which feeds back into the same aggregate next cycle. Network-effect feedback loops are the
acquisition surface with the longest half-life in the product.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `04N_drill_sequence_aggregates.sql` adds the table
  `drill_sequence_aggregates(sport TEXT NOT NULL, drill_id UUID NOT NULL, next_drill_id UUID
  NOT NULL, coach_count INT NOT NULL, last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sport, drill_id, next_drill_id))` with NO coach reference of any kind in the
  table — the `coach_count` is an integer aggregate, NOT a list of coach ids. Pick the next
  free prefix AFTER the 0043 migration (so `044_…` if 0043 lands first); document the
  prefix decision in the Implementation log per LESSONS#0006. (vitest scans the executable
  DDL — strip `--` comments per LESSONS#0088 — and asserts the column allow-list is exactly
  the five columns above; banned tokens `coach_id`, `coach_ids`, `player`, `parent`,
  `observation` are absent from DDL.)
- [ ] `POST /api/cron/refresh-drill-sequences` (new, bearer-auth `CRON_SECRET`) recomputes
  the table from `coach_drill_signals` (the 0039 ship): for each (sport, drill_id) where a
  coach upvoted that drill, find every subsequent drill that same coach upvoted within 14
  days, and aggregate the count of DISTINCT coaches per (sport, drill_id, next_drill_id)
  pair. The route writes the resulting rows with a single transaction (`DELETE FROM
  drill_sequence_aggregates; INSERT …`) so the table is always a consistent snapshot.
  Returns `200 { rows_written, took_ms }`. (vitest: seed 6 coaches who all upvoted drill A
  then drill B; run the cron; assert `drill_sequence_aggregates` has one row for `(sport,
  A, B)` with `coach_count = 6`; assert a re-run is idempotent.)
- [ ] `GET /api/drill-sequence-suggestions?drillId=…&sport=…` returns ONLY rows where
  `coach_count >= 5`. The k-anonymity floor is enforced AT THE ROUTE LAYER, not just in the
  cron — a row with `coach_count = 4` exists in the table but NEVER crosses the route to
  the client. The payload contains EXACTLY the keyset `{ next_drill_id, next_drill_title,
  coach_count, sport }` (the title joined from the `drills` table at read time) — NO
  `coach_id`, NO `coach_ids`, NO timestamps that could leak individual recency. (vitest:
  seed rows with `coach_count` values 2, 4, 5, 12; assert the route returns only the
  `>=5` rows; assert the response payload's keyset matches the allow-list exactly via
  `Object.keys(row).sort()` deep-equality.)
- [ ] The drill detail page surfaces the suggestion block ONLY when the route returns ≥1
  row. When the route returns an empty array (no aggregate met the floor), the page
  renders nothing for this block — NOT "0 coaches tried this next" or any empty-state
  text. (Playwright: a drill with seeded high-N suggestions renders the block with 3
  rows; a drill with no aggregates renders no block at all; the rest of the drill detail
  page is byte-identical between the two states.)
- [ ] A coach can dismiss the suggestions for a specific drill by tapping a "hide these
  suggestions" link. The tap writes one row to `coach_drill_signals` with
  `signal_type='dismiss_suggestion'` (extending the existing `signal_type` enum on that
  table from 0039 — verify whether 0039 already has a signal_type column or whether the
  rating column is used; if there's no enum yet, add one in this migration with values
  `('up', 'down', 'dismiss_suggestion')` and migrate existing rating values). A dismissed
  drill never shows the suggestion block for that coach again; the global aggregate is
  untouched. (vitest: a coach posts a dismiss; the next GET for that coach + that drill
  returns suggestions but the client component hides them when the dismiss row exists;
  another coach's GET for the same drill returns the suggestions unsuppressed.)
- [ ] Tier / privacy: the suggestion block has NO new tier gate — it's free for every
  coach because the value compounds the more coaches see it (gating would invert the
  network effect). The block is shown on the authed dashboard `/drills/[drillId]` page
  only; it does NOT appear on any public surface (`/share/...`, `/team-card/...`,
  `/coach/...`, `/programs`, or the sitemap from 0038). (vitest scans the public-surface
  page renderers for any import of the new suggestions component and asserts none of them
  reference it; Playwright on the seeded public pages asserts no `coach_count` text
  renders.)
- [ ] COPPA / data minimization: the migration's DDL contains NO column referencing
  players, observations, or any minor data; the cron's SELECT reads ONLY
  `coach_drill_signals` + `drills`, never `players` / `observations` / `parent_reactions`.
  (vitest: scan the migration DDL and the route's source for the banned-token list above;
  assert the cron's queries are scoped exclusively to the two named tables.)
- [ ] Regression: every existing `coach_drill_signals` write path stays byte-identical
  (the break-screen toggle from 0039, the merge from 0039, the coaching-signature read in
  the plan / arc routes). The new `dismiss_suggestion` enum value is purely additive; the
  existing `up` / `down` rows continue to be consumed by `buildCoachingSignature` exactly
  as today. (vitest fixture of an existing rating round-trip still passes; the signature
  builder's pre-existing output is byte-identical for the no-dismiss case.)

## Out of scope

- Cross-sport suggestions ("coaches in soccer also liked this basketball drill"). The
  aggregate is strictly per-sport in v1; cross-sport blending is a separate privacy and
  product discussion.
- Personalized suggestions ("coaches LIKE YOU also ran…"). The aggregate is global per
  sport+drill pair; per-coach personalization needs a richer signal layer than v1.
- A "trending drills this week" surface. The aggregate is a lifetime cumulative; a
  windowed-trending view is a separate ticket.
- Promoting paid drills / sponsored content into the suggestion order. The order is by
  `coach_count DESC` only; no commercial weighting.
- Exposing the aggregate counts as a public SEO surface. v1 is authed only; a public
  "popular basketball drills" page is a separate ticket and a separate privacy review.
- An admin dashboard for inspecting the table. v1 is read-only on the coach side.
- Backfilling against any historical signals before this ships. The cron's first run
  computes the aggregate from whatever exists in `coach_drill_signals` at that moment;
  there is no separate import step.
- A push notification when a new high-N suggestion crosses the floor. v1 is pull-only on
  the drill detail page.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- `supabase/migrations/04N_drill_sequence_aggregates.sql` (new) — creates the
  `drill_sequence_aggregates` table per the AC schema. Also extends
  `coach_drill_signals` with a `signal_type TEXT NOT NULL DEFAULT 'rating'` column if the
  0039 migration did not already include one (read `supabase/migrations/040_coach_drill_signals.sql`
  FIRST — it shipped with `rating` as a 2-value check; the new `signal_type` is an
  ADJACENT column with values `('rating', 'dismiss_suggestion')`, NOT a replacement for
  `rating`). Pick the next free prefix AFTER the 0043 migration (so `044_…` if 0043 lands
  first); document in the Implementation log per LESSONS#0006. Add
  `drill_sequence_aggregates` to the generic data-route allow-list in
  `src/app/api/data/route.ts`.
- `src/types/database.ts` — add the `DrillSequenceAggregate` interface and (if the
  signal_type column was newly added) extend `CoachDrillSignal` accordingly.
- `src/app/api/cron/refresh-drill-sequences/route.ts` (new) — `POST(request)`. Auth via
  `Bearer ${CRON_SECRET}`. Pull every `coach_drill_signals` row with `rating='up'` and
  `signal_type='rating'`, join to `drills` to get the sport, group by coach, sort each
  coach's series by `last_rated_at`, and for each consecutive pair within 14 days emit a
  `(sport, drill_id, next_drill_id)` tuple. Aggregate with `Map<string, Set<coachId>>` and
  emit the row count = `set.size` per key. Wrap the table refresh in a single transaction:
  `BEGIN; DELETE FROM drill_sequence_aggregates; INSERT … VALUES …; COMMIT;`. Service-role
  only. Return `{ rows_written, took_ms }`.
- `src/app/api/drill-sequence-suggestions/route.ts` (new) — `GET(request)` reads
  `?drillId=...&sport=...`. Auth required (any tier). Selects from
  `drill_sequence_aggregates` where `coach_count >= 5` AND `drill_id = $1` AND `sport =
  $2`, joins `drills` for `next_drill_title`, orders by `coach_count DESC`, limits to top
  3. Strip every field outside the allow-list before returning. Per LESSONS#0039 — assert
  in the test that a `coach_count = 4` row in the table NEVER crosses to the client even
  if explicitly requested.
- `src/components/drills/next-drill-suggestions.tsx` (new) — client component. Takes
  `{ drillId, sport }`. Uses `query()` (AGENTS.md rule 3) to fetch
  `/api/drill-sequence-suggestions`. Reads the coach's own `coach_drill_signals` via the
  existing 0039 hook to check for a `dismiss_suggestion` row for this drill; if present,
  renders nothing. Otherwise renders up to 3 rows with `{next_drill_title}` + "—
  {coach_count} coaches". A small "hide these suggestions" text-link writes the dismiss
  signal via `mutate()`. Dark zinc/orange, 44px targets, no banned words, no emoji-decorated
  headings.
- `src/app/(dashboard)/drills/[drillId]/page.tsx` — render
  `<NextDrillSuggestions drillId={drillId} sport={drill.sport} />` near the bottom of the
  drill detail layout. The component renders nothing on empty / dismissed states so the
  page is byte-identical when no suggestions exist.
- `vercel.json` — add a new cron entry pointing at `/api/cron/refresh-drill-sequences`,
  scheduled `0 3 * * *` (03:00 UTC nightly — outside the Monday-morning email window).
  Keep the other cron entries byte-identical.
- `src/lib/supabase/middleware.ts` — NO change. The new route is dashboard-only.
- `tests/api/cron/refresh-drill-sequences.test.ts` (new, `.test.ts`) — auth 401; six
  coaches all upvote A then B → one aggregate row with count 6; four coaches → no
  suggestion crosses the route's >=5 floor; idempotent re-run leaves the table identical.
- `tests/api/drill-sequence-suggestions.test.ts` (new) — auth required; the >=5 floor is
  enforced at the route (a planted count=4 row is filtered out); the payload keyset is
  exactly the four-key allow-list; a `dismiss_suggestion` row for the caller's coach +
  drill suppresses the response on the CLIENT (the route still returns the data — the
  hiding happens in the component); cross-sport rows aren't bled in.
- `tests/migrations/drill-sequence-aggregates-coppa.test.ts` (new) — scan the migration's
  executable DDL (strip `--` comments per LESSONS#0088); assert the column allow-list
  matches exactly and banned tokens (`coach_id` in the aggregates table specifically —
  the aggregates table has NO coach reference; the join table `coach_drill_signals`
  legitimately has one) are absent.
- `tests/components/next-drill-suggestions.test.tsx` (new) — render with seeded
  `query()` mock returning 3 rows; assert 3 items render with correct titles and counts;
  render with empty array → null output; render with a seeded dismiss-suggestion signal
  for the caller → null output; tap "hide these suggestions" → assert `mutate()` is
  called with the dismiss payload.
- `tests/e2e/drill-suggestions-flow.spec.ts` (new Playwright spec) against the
  0006-seeded Supabase. Seed: a coach + a drill + 6 coach signals on (A, then B) in
  `coach_drill_signals` so the post-cron aggregate hits the floor + a `drill_sequence_aggregates`
  row inserted directly (so the test doesn't depend on running the cron in CI). The spec
  visits `/drills/<A>`, asserts the suggestion block renders B with `6 coaches`; visits
  a different drill with no aggregates, asserts no block renders. Skip when E2E creds
  are unset (convention). Use a `data-testid` on the suggestions container (LESSONS#0081).
- `tests/ai/...` — no contract test needed. This ticket is not an AI feature.
- New deps: NO. Migration: YES — one table-create + one optional column-add on
  `coach_drill_signals`. Env vars: NO new ones — reuses `CRON_SECRET`. AI prompt change:
  NO. Tier feature key: NO.
- LESSONS to anchor: #0006/#0009 (migration prefix uniqueness; coordinate with 0042 and
  0043 prefixes). #0084 (assert payload keyset on the GET route — Object.keys deep-equal).
  #0088 (strip `--` comments before scanning migration content). #0039 (CRITICAL — when
  editing a shared surface that uses `mockReturnValueOnce` chains, drain mocks with
  `mockFromFn.mockReset()` in `beforeEach`; `vi.clearAllMocks()` does NOT drain the
  queue, and an extra queued chain leaks into the next `it()`. The cron's route adds a
  `from('coach_drill_signals')` and a `from('drills')` and a `from('drill_sequence_aggregates')`
  inside the same handler, so any sibling test that mocks `from()` chainably for the
  signals table needs its queue updated and reset). #0085/#0086 (jsonb seeding caveats in
  raw SQL fixtures).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0044-…` opened
- YYYY-MM-DD — failing test added in `tests/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
