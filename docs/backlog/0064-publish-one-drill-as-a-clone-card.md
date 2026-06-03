---
id: 0064
title: Let a coach publish a single drill they love as a one-tap clone card another coach saves into their library in 10 seconds
status: groomed
priority: P1
area: plans
created: 2026-06-03
owner: product-groomer
---

## User story

As a volunteer youth-sports coach who just ran the "1-2 close-out" drill on Tuesday and
watched three of my kids actually finish the closeout for the first time all season, I
want a one-tap "Publish this drill" button right on the drill card that publishes JUST
that ONE drill — title, setup, the two lines about what made it work for my U10 girls —
as a public, cloneable card under my coach handle, so that when Coach James from the
team across the gym asks "what drill was that?" I send him a link, he taps Save, and
that single drill lands in his own library for next week — without either of us having
to publish a whole practice plan.

## Why now (four lenses)

### Product Owner

The product has shipped three coach-to-coach content-graph primitives that bracket but
do not fill the per-drill seam. (1) 0049 ships PUBLISH-AND-CLONE for a WHOLE practice
plan (the 60-minute set, with all drills, blocks, focus). (2) 0044 ships an
ANONYMOUS-AGGREGATE per-drill signal (after coaches thumb up drill X, the network
suggests drill Y). (3) 0039 ships PERSISTENT DRILL FAVORITES (a coach can thumb up
drill X and the favorite carries across teams and seasons). What is missing — and what
the actual coach-to-coach pickup conversation at the parking lot is about — is the
SINGLE-DRILL PUBLISH primitive: one drill, one card, one clone tap, no whole-plan
overhead. The smallest meaningful unit of value is a `drill_shares` table (`id`,
`coach_id`, `drill_id`, `share_token`, `caption`, `created_at`, `is_active`), ONE
"Publish this drill" button on the existing drill detail page that POSTs to
`/api/drill-shares/create` and returns a public `/drill/[token]` URL, a PARENT-PORTAL-
themed public page rendering the drill name + setup + the coach's 2-line caption + a
"Save to my library" button, and ONE `/api/drill-shares/[token]/clone` endpoint that
copies the drill into the cloner's `drill_favorites` (reusing the existing 0039
favorite primitive so the cloned drill shows up in the cloner's drill list with one
tap, no new "my drills" table). Mirrors 0049 byte-for-byte where applicable; differs
only on the granularity (one drill, not the whole plan) and the clone destination
(`drill_favorites`, not a fresh `plans` row).

### Stakeholder

This is the moat-deepening primitive the coach-to-coach content graph has been
waiting for since 0044 + 0049 + 0055 + 0063 each shipped a different EDGE shape but
none of them named the ATOMIC NODE the conversation is actually about. Three
compoundings, all distinct from the existing primitives. (1) The content-density
moat — today the graph only carries WHOLE PLANS as content; a 60-minute plan is a
high-friction publish (the coach has to be confident the WHOLE plan is good). A
single-drill publish is the LOWEST-FRICTION publish primitive the graph has: a coach
who just got one drill working publishes that one drill in 10 seconds, and the
graph's content edges per coach per week go from 0–1 (whole-plan) to 3–5 (per-drill).
Same coach, same product, 5× the content. (2) The discovery-quality moat — 0044's
anonymous next-drill signal can only suggest a drill from the aggregate; it cannot
say WHY that drill worked for that coach. A NAMED single-drill share carries the
coach's own 2-line caption ("this one finally got my U10 girls to finish their
close-outs") which the cloning coach reads BEFORE they save it. The cold-clone
conversion rate is structurally higher when the content is captioned. (3) The
follow-graph activation moat — 0063 just shipped the named persistent follow edge,
which today only re-fires on whole-plan publishes (a once-a-week event at best). A
follow edge that ALSO re-fires on single-drill publishes is the loop that turns
0063's edge from a weekly signal into a 3–5×-weekly signal. Every shipped
coach-to-coach surface compounds.

### User (the publisher, Sarah, Tuesday 7:42pm, just got home from practice)

She opens the SportsIQ app. From the existing drill detail page (the same page where
she thumbs up a drill per 0039) there is a new small button next to the heart:
"Publish this drill." She taps. A small sheet slides up. The drill title + setup is
already filled in; one textarea asks "what made this drill work for your team? (2
sentences max)". She types: "Finally got my U10 girls to finish their close-outs.
Cue: chest to the ball-handler before the hands go up." She taps Publish. The sheet
flips: "Published — copy link." One Copy button. She copies, texts Coach James, done.
Total interaction: under 20 seconds. If she taps Publish on the same drill a second
time the route is idempotent (returns the existing token); editing the caption
updates the existing share row in place — no new token, no new URL she has to re-send.
If she changes her mind she taps "Unpublish" on the same drill card (sets
`is_active=false`); the public page goes 410.

### User (the cloner, James, Wednesday morning, 6:18am, on the couch with coffee)

He gets Sarah's text. He taps the link. A parent-portal-aesthetic page loads (gray +
orange, NOT dark): "Coach Sarah Rodriguez — Hornets U10 — 1-2 closeout drill." The
drill name, the setup (3 short lines), Sarah's 2-sentence caption beneath ("Finally
got my U10 girls to finish their close-outs. Cue: chest to the ball-handler before
the hands go up."), and ONE button: "Save to my library." If he's not signed in the
button routes to `/login?next=<drill-page>` and the clone happens on return. If he
IS signed in, one tap and the drill is in his favorites (the existing 0039
primitive). The success state flips: "Saved — open in your library." Below: the
existing 0063 inline "Follow Coach Sarah's drops" card appears (since he's now
cloned her work, the same revealed-preference trigger as 0063's whole-plan clone).
The footer carries the existing "made with SportsIQ" + Sarah's referral code per
the 0011/0049 pattern.

### Growth

The "show me" moment is the text conversation itself — Sarah texting James a one-line
"this was the drill" with a single tappable link, James saving it in 10 seconds, no
account creation in the middle, no whole-plan import. That is the screenshot a third
coach sees when James shares the link forward ("look how easy this is, I'm using
this for Saturday"). Compounds four ways. (1) The publish-rate compounding — a
whole-plan publish is a 5-minute commitment; a single-drill publish is a 20-second
commitment. Same coach now publishes 3–5× per week instead of 0–1. (2) The cold-
acquisition vector — every public drill page carries a referral footer; a coach
following the link who isn't signed up lands on `/drill/[token]` then `/login?
next=...` then the existing 0011 referral attribution path. The public drill page
is INDEXABLE in the existing 0038 sitemap (this ticket adds it), so cold searchers
find drills like they find published plans. (3) The 0063 follow loop activation —
every single-drill publish re-fires the existing 0063 "From coaches you follow"
section on /plans for every follower of the publisher. Sarah publishes 3 drills
this week; her 4 followers see 12 new cards on /plans without any of them having
to remember her name. (4) The 0044 next-drill signal feedback loop — every named
single-drill clone is now an explicit signal feeding 0044's aggregate (a stronger
signal than the existing anonymous favorite-thumbs-up because it is publish-
attached). The next-drill suggestions get better the more single drills get
published. Distinct from every shipped surface: 0049 is the whole-plan share;
0044 is the anonymous-aggregate suggestion; 0039 is the private favorite; 0010
is the team-card; THIS is the single-drill named publish, the missing primitive.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `059_drill_shares.sql` adds the table `drill_shares (id UUID
  PRIMARY KEY DEFAULT gen_random_uuid(), coach_id UUID NOT NULL REFERENCES
  coaches(id) ON DELETE CASCADE, drill_id TEXT NOT NULL, share_token TEXT NOT
  NULL UNIQUE, caption TEXT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL
  DEFAULT NOW(), UNIQUE(coach_id, drill_id))`. Three indexes: `(share_token)`
  via the UNIQUE, `(coach_id, created_at DESC)` for the publisher's own
  "drills I have published" list, and `(coach_id, is_active, created_at DESC)`
  for the follower-feed read path. `drill_id` is TEXT (not a FK) because the
  drill library is a static-content surface, not a DB table — read the actual
  `src/lib/drills/*` shape at pickup and confirm (LESSONS#0096 — schema wins
  over prose; if drills ARE in the DB at pickup, switch to UUID + FK + ON
  DELETE CASCADE). The migration adds NO column to `coaches` or `plans` or
  `players`. Mirror `048_practice_plan_shares.sql` header style. Prefix `059`
  is the next free integer after `058_coach_follows.sql` (LESSONS#0006 — at
  pickup confirm; if 0065/0066/0067 claimed `059` first, bump to `060`).
  LESSONS#0088 — strip `--` comments before the no-banned-token scan.
  (vitest: scan migration SQL with `--` stripped, assert column allow-list,
  assert both UNIQUE constraints, assert all indexes; assert NO new column on
  `coaches` / `plans` / `players`.)

- [ ] `POST /api/drill-shares/create` (new, authed) accepts `{ drillId: string,
  caption?: string }`. Resolves the drill from `src/lib/drills/<sport>/*`
  (mirror the existing drill resolution used by 0044 / 0049 / `practice-queue`
  per LESSONS#0096 — read first). Validates the drill exists (404 if not).
  Validates the caption is <= 240 chars (400 if longer) AND voice-clean per
  LESSONS#0023 (the route runs the existing banned-word scan from the shared
  utils; on a banned word match the route returns `400 { reason: 'voice',
  field: 'caption' }`). Idempotent on `(coach_id, drill_id)`: a second POST
  with a different caption UPDATES the caption + `updated_at` on the same row
  (and the same `share_token`); a second POST with the same caption is a
  no-op returning the existing row. Returns `200 { token, url, caption,
  alreadyPublished: boolean }`. (vitest: 200 first publish + row written +
  share_token generated; 200 idempotent re-publish updates caption, same token;
  400 on banned-word caption; 400 on >240 chars; 404 on unknown drillId; 401
  unauthed.)

- [ ] `POST /api/drill-shares/[token]/unpublish` (new, authed) sets
  `is_active=false` on the share row owned by `auth.user.id`. Idempotent (no
  row → 200 with `{ wasPublished: false }`). The public page at the same token
  returns 410 (gone) after unpublish — NEVER a 404 (so the cloning coach who
  bookmarked the link sees "the publisher unpublished this drill" instead of
  a confusing not-found). A re-publish of the same `(coach_id, drill_id)`
  flips `is_active=true` on the SAME row + SAME token (not a new one — the
  unique constraint and the route's read-then-update posture ensures it).
  (vitest: 200 on unpublish + row flipped; 200 idempotent; 410 on the public
  page GET after unpublish; re-publish via `/create` flips active + reuses
  token; 401 unauthed.)

- [ ] `GET /api/drill-shares/[token]` (new, PUBLIC) returns the public payload
  `200 { drill: { id, name, setup, sportSlug, ageGroupHint }, caption,
  publisher: { firstName, handle | null }, createdAt, isActive }` when the row
  exists and `is_active=true`. Returns 410 when `is_active=false`. Returns 404
  when the token is unknown. The publisher's first name is
  `coaches.full_name.split(' ')[0]` — never the full name. The publisher's
  handle is `coaches.handle` if set (per migration 051), null otherwise. No
  email, no phone, no player data, no team data on this surface — the drill
  is the artifact, not the team. (vitest: 200 with the payload shape;
  publisher first name only; planted full-name / email / phone on coach row
  do NOT appear; 410 after unpublish; 404 on unknown token; planted player
  data does not leak.)

- [ ] `POST /api/drill-shares/[token]/clone` (new, authed) reads the share row
  (404 if unknown, 410 if `is_active=false`), then ADDS the drill to the
  caller's `drill_favorites` via the EXISTING `toggleFavorite` helper in
  `src/lib/drill-favorites-utils.ts` (only ADD — never remove if already
  favorited). Idempotent (a second clone of the same drill is a no-op
  returning `{ alreadyFavorited: true }`). Returns `200 { drillId,
  alreadyFavorited: boolean }`. Rejects self-clone (caller is the publisher
  → `200 { reason: 'self', alreadyFavorited: true | false }` — silent, not
  an error, to keep the share-with-yourself preview flow harmless). (vitest:
  200 + drill added to favorites; idempotent second clone returns
  alreadyFavorited; self-clone is a silent no-op; 410 on unpublished; 404
  on unknown; 401 unauthed.)

- [ ] A new PUBLIC page `/drill/[token]` (new file at
  `src/app/drill/[token]/page.tsx`) renders the public drill card in the
  PARENT-PORTAL aesthetic (gray + orange, NOT the dark coach surface — same
  aesthetic decision as `/plan/[token]` per 0049 and `/share/[token]` per
  the parent portal). Layout: publisher first name + sport + age-group hint at
  the top, drill name as the H1, setup (3–5 short lines) as the body, the
  publisher's caption in a quoted block beneath, one large "Save to my
  library" button. Below the fold: a small "Made with SportsIQ — start your
  own free team" footer carrying the publisher's referral code per the
  existing 0011 / 0049 pattern (read the share/plan footer at pickup —
  LESSONS#0096). When the visitor is signed in AND has just cloned the drill,
  a SECOND card appears below the Save button: the existing 0063
  `<FollowCoachInlineCard>` (revealed-preference trigger — same as 0063's
  whole-plan clone-success state). The page exposes
  `data-testid="drill-share-card"` and the save button exposes
  `data-share-url={publicUrl}` per LESSONS#0056 / #0082 so vitest +
  Playwright can scope cleanly. The page is added to `publicPaths` in
  `src/lib/supabase/middleware.ts` in the SAME PR per LESSONS#0091 / #0104
  (cold visitors hit the URL before they sign in). (Playwright: navigate
  unauthed to a seeded `/drill/<token>`, assert the heading + caption +
  Save button render; navigate after sign-in, tap Save, assert the success
  state + the inline follow card.)

- [ ] A "Publish this drill" control on the EXISTING drill detail page (read
  `src/app/(dashboard)/drills/[drillId]/page.tsx` at pickup per LESSONS#0096
  — confirm the exact path; the drill list page is at `/drills` per the
  dashboard directory). The control is a small icon button next to the
  existing 0039 favorite heart, NOT a new prominent CTA (it sits inside the
  existing per-drill action row). On tap it opens a sheet rendering the
  drill name, the setup, a `<textarea>` for the caption pre-filled with the
  caption from any existing `drill_shares` row owned by the coach for this
  drill (so editing an existing publish is one tap, not a hunt for the
  current text), a Publish button (POSTs `/api/drill-shares/create`), an
  Unpublish button when the drill is already published (POSTs `/api/drill-
  shares/[token]/unpublish`), and a Copy-link button on the success state.
  The sheet exposes `data-testid="publish-drill-sheet"` and the copy button
  exposes `data-share-url={publicUrl}` per LESSONS#0056 / #0082. (vitest
  component test: render the drill page with a mocked drill, tap Publish,
  assert the sheet renders; tap Publish in the sheet, assert the POST is
  fired; the success state shows the URL and Copy button. Playwright:
  scope every assertion to the new data-testid containers.)

- [ ] `GET /api/drill-shares/mine` (new, authed) returns the caller's own
  published drills `200 { shares: Array<{ token, drillId, drillName,
  caption, publishedAt, isActive, cloneCount }> }`. `cloneCount` is the
  count of distinct cloners of this share — see next AC for the
  `drill_share_clones` table. Used by a new small "Drills I have published"
  panel on the existing `/coach-profile` page (read its existing path at
  pickup — `src/app/(dashboard)/coach-profile/page.tsx`; if the path is
  `/coach-profile/published` mount the panel there instead — LESSONS#0096).
  The panel renders one row per share with the drill name, the caption
  truncated, the clone count, and an Unpublish link. (vitest: returns
  caller's own shares; cloneCount is correct; the existing 0026 public
  coach profile is BYTE-IDENTICAL — this list lives only on the AUTHED
  coach-profile dashboard page, never on the public `/coach/<handle>`
  surface.)

- [ ] A second small table `drill_share_clones (id UUID PK DEFAULT
  gen_random_uuid(), drill_share_id UUID NOT NULL REFERENCES drill_shares(id)
  ON DELETE CASCADE, cloner_coach_id UUID NOT NULL REFERENCES coaches(id) ON
  DELETE CASCADE, cloned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE
  (drill_share_id, cloner_coach_id))` lives in the SAME migration file
  `059_drill_shares.sql`. The clone route writes one row on first clone
  (idempotent via the UNIQUE constraint — a second clone is a no-op). The
  table holds NO player data. The publisher's `cloneCount` reads from this
  table. (vitest: assert the second table's column allow-list + UNIQUE
  constraint; assert the clone route writes ONE row on first clone and
  ZERO additional rows on repeat clones.)

- [ ] Sitemap inclusion: the new public `/drill/[token]` route is added to
  the existing dynamic sitemap at `src/app/sitemap.ts` (read first per
  LESSONS#0096; the sitemap was last extended for 0049's `/plan/[token]`
  per LESSONS#0100 — the existing test queues 6 from-chains, the new ticket
  adds a 7th, so `tests/app/sitemap.test.ts`'s `mockReturnValueOnce` queue
  needs the 7th chain added in the SAME PR per LESSONS#0049 / #0100 to
  avoid the queue-overflow regression). The sitemap reads
  `drill_shares` where `is_active=true`, returns the public URL per token.
  (vitest: the existing sitemap test passes after the queue extension; the
  new test asserts a seeded active drill share appears in the sitemap;
  the inactive ones do NOT appear.)

- [ ] Tier / feature gating: NEITHER publishing NOR cloning a single drill
  is tier-gated. A free-tier coach can publish a drill and clone one. The
  publish primitive is universal so the graph remains open (gating it would
  invert the network effect, same posture as 0049 / 0055 / 0063 keeping
  publish + clone universal). NO new tier feature key is added. (vitest:
  a free-tier coach successfully POSTs `/api/drill-shares/create` and
  `/api/drill-shares/[token]/clone`; the route does NOT import
  `tier.ts`.)

- [ ] Privacy / COPPA contract: the `drill_shares` table is COACH-PUBLISH-
  only. It references `coaches(id)` and a string `drill_id` (or, if the
  pickup reveals drills are in a DB table, the drill's UUID). It NEVER
  references a player, a parent, a session, a team, or a minor's data. The
  public page `/drill/[token]` exposes the publisher's first name only +
  handle (already public on `/coach/<handle>`), and the caption (coach-
  authored, voice-scanned per LESSONS#0023). NO email, NO phone, NO team
  name, NO player name, NO age-group except the drill's static sport hint.
  The route's `.select()` calls are EXPLICIT ALLOW-LISTS per LESSONS#0036.
  The `drill_share_clones` table references coaches only and holds NO
  player or session data. (vitest: planted full-name / email / phone /
  player rows do NOT appear in any drill-shares route response; the public
  page render contains only the first-name; `.select()` keysets are
  explicit allow-lists.)

- [ ] Voice contract: every user-facing string the dev adds (the publish
  sheet header, the textarea placeholder, the Publish / Unpublish / Copy /
  Save-to-my-library button labels, the public page H1 + footer, the
  publisher-side "drills I have published" panel header, the inline-card
  copy on the success state, the share-row helpers) contains NO AGENTS.md
  banned word per LESSONS#0023. Instruct POSITIVELY in the textarea
  placeholder ("what made this drill work for your team?"); never enumerate
  the banned tokens. There is NO AI call on this path (the publish flow is
  100% coach-authored); the voice scan is a render-time scan on the
  templates only. (vitest: render each new component and scan rendered text
  for the banned list.)

- [ ] Regression: the existing `/api/drill-favorites` (GET + PATCH) response
  shape is BYTE-IDENTICAL (the clone route writes via the same
  `toggleFavorite` helper but adds NO new shape on the existing endpoint).
  The existing 0049 `/plan/[token]` route + page is BYTE-IDENTICAL (new
  routes are at `/drill/[token]` and `/api/drill-shares/*`, not under the
  plan namespace). The existing 0026 public coach profile `/coach/<handle>`
  is BYTE-IDENTICAL — the publisher's drill list lives on the AUTHED
  dashboard coach-profile page only. The existing 0063 follow primitive is
  unchanged. The existing 0044 next-drill aggregate continues to read its
  own data; this ticket does NOT rewire 0044 to read `drill_shares` (a
  follow-up can). (vitest: snapshot the named routes / components against
  the seeded fixtures pre- and post-change; assert no diff.)

- [ ] Seeded e2e on the 0006 fixture: seed extension is ONE new
  `drill_shares` row for the existing E2E coach + ONE additional auth.users
  + `coaches` row for a SECOND coach used as the CLONER (mirroring the
  0063 two-coach e2e pattern per LESSONS#0084 / #0101). UUIDs in the next
  free `0000000000<XX>+` range. Playwright spec: (a) sign in as the E2E
  coach, navigate to the existing drill detail page for a deterministic
  seed drill, tap Publish, fill the caption, tap Publish in the sheet,
  assert the success state with the public URL; (b) sign out, navigate
  unauthed to the seeded `/drill/<token>`, assert the rendered drill name
  + caption + Save button; (c) sign in as the SECOND seeded coach, tap
  Save, assert the success state + the inline follow card. Scope by
  `data-testid` per LESSONS#0081 / #0082. Skip when E2E creds are unset.
  Add `/drill/` and `/api/drill-shares/` to `publicPaths` in
  `src/lib/supabase/middleware.ts` in the SAME PR per LESSONS#0091 /
  #0104 (the public page + the public GET route are both crawler-
  reachable without auth).

## Out of scope

- A drill DISCOVERY feed scoped to the publisher's league / sport (a
  /drills/league surface). v1 surfaces a single-drill publish + clone only;
  surfacing a feed of published drills is a follow-up ticket that reads the
  same table (mirrors 0055's relationship to 0049). The 0063 follow surface
  + the sitemap inclusion give the v1 enough distribution.
- An EDIT-the-drill-itself surface (the publisher changing the drill's setup
  text inside SportsIQ). v1 publishes the drill exactly as it exists in the
  static drill library; the publisher can only edit the CAPTION. A
  publisher-authored drill body is a different feature with its own
  validation surface.
- A parent-facing view of the published drill ("here is what your kid was
  working on"). The drill share is COACH-TO-COACH only; the parent already
  has the parent report (0016 / 0034). A parent-facing drill view would
  invert the COPPA trust model (the parent did not opt into seeing the
  league's published content).
- A "publish all drills from this practice plan at once" bulk surface. v1 is
  per-drill, one publish at a time, with a per-drill caption. A bulk publish
  would dilute the caption-per-drill quality and is a follow-up if there's
  evidence the per-drill friction is too high (revealed by usage, not
  presumed).
- A REMIX of someone else's published drill (publish-with-a-fork). v1's
  clone copies the drill into the cloner's favorites; if the cloner wants
  to publish their OWN version they publish the same drill_id again under
  their own coach_id (the UNIQUE is `(coach_id, drill_id)`, not `drill_id`
  alone, so two coaches can publish the same drill with different captions).
- A "report this drill" parent-portal-style moderation flow. v1 has no
  moderation surface; the publisher controls the publish + unpublish state
  end-to-end, and the voice scan on the caption catches the rendered
  copy. A moderation queue is a follow-up only if abuse surfaces in
  practice.
- A clone-count card on /home for the publisher (like 0049's clone-count
  card). v1 surfaces the clone count on the publisher's AUTHED coach-
  profile dashboard page only, alongside the publish list. A /home card
  is a follow-up; the recurring `home/page.tsx` is a DIRTY hotspot per
  LESSONS#0065 / #0066 / #0162 and a v1 ticket should minimize edits to
  it.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev
doesn't redesign on pickup.

- `supabase/migrations/059_drill_shares.sql` (new) — the two tables only.
  NO column on `coaches`, `plans`, `players`. LESSONS#0006 — at pickup
  confirm `059` is free; if 0065 / 0066 / 0067 claimed `059` first, bump
  to `060`. LESSONS#0088 — strip `--` comments before the no-banned-token
  scan.
- `src/types/database.ts` — add `DrillShare` and `DrillShareClone` types.
  NO field on `Coach` / `Plan` / `Player`.
- `src/app/api/drill-shares/create/route.ts` (new) — `POST`. Authed via
  `createServerSupabase()` for `auth.getUser()`, then
  `createServiceSupabase()` for the upsert. Validate the drill via the
  EXISTING drill resolution (read `src/lib/drills/*` shape at pickup per
  LESSONS#0096). Voice-scan the caption via the existing banned-word
  helper. Idempotent on `(coach_id, drill_id)`.
- `src/app/api/drill-shares/[token]/route.ts` (new) — PUBLIC `GET`. Service-
  role. Returns 410 on unpublished. Per LESSONS#0036 — `.select()` as
  explicit allow-list; the route NEVER returns minor data.
- `src/app/api/drill-shares/[token]/clone/route.ts` (new) — `POST` (authed).
  Writes a `drill_share_clones` row + calls the existing `toggleFavorite`
  helper (only the add direction). Per LESSONS#0096 — read the existing
  helper signature first; do NOT re-inline it.
- `src/app/api/drill-shares/[token]/unpublish/route.ts` (new) — `POST`
  (authed). Flips `is_active=false`. Idempotent.
- `src/app/api/drill-shares/mine/route.ts` (new) — `GET` (authed). Returns
  the caller's own published drills + clone counts. Per LESSONS#0036 —
  explicit allow-list.
- `src/app/drill/[token]/page.tsx` (new) — PUBLIC parent-portal-aesthetic
  page. `'use client'` per LESSONS#0036's client-fetch posture so e2e
  `page.route()` is straightforward. The success state mounts the
  EXISTING 0063 `<FollowCoachInlineCard>` (read its path at pickup —
  likely `src/components/plan/follow-coach-inline-card.tsx` per the 0063
  notes; reuse it as-is).
- `src/components/drills/publish-drill-sheet.tsx` (new) — the sheet on the
  drill detail page. `data-testid="publish-drill-sheet"`, the copy button
  carries `data-share-url={publicUrl}` per LESSONS#0056 / #0082.
- `src/components/drills/drill-share-card.tsx` (new) — the public page's
  card body (extracted for unit-testability per LESSONS#0060).
- `src/app/(dashboard)/drills/[drillId]/page.tsx` (existing — read first
  per LESSONS#0096) — mount the new publish control next to the existing
  0039 favorite heart. Per LESSONS#0065 / #0066 / #0162 — `home/page.tsx`
  is the DIRTY hotspot, NOT the drill detail page; this edit is safe but
  still keep the touch minimal (one import + one JSX entry).
- `src/app/(dashboard)/coach-profile/page.tsx` (existing — read first;
  per the 0063 notes the dashboard coach-profile lives in this tree —
  confirm at pickup) — mount the new "Drills I have published" panel
  reading `/api/drill-shares/mine`. The panel is rendered only when the
  caller has at least one share row; silence beats an empty state.
- `src/app/sitemap.ts` (existing — read first per LESSONS#0096) — add the
  drill-shares query as a 7th from-chain. CRITICALLY: per LESSONS#0049 /
  #0100, the existing `tests/app/sitemap.test.ts` queues 6 chains per
  test; extending to a 7th REQUIRES adding a 7th
  `mockReturnValueOnce` chain to every `wireTables()` and ad-hoc chain
  in the test file IN THE SAME PR. Without that change the sibling
  test will throw `obs is not iterable` (or similar) on the test that
  consumed the 7th chain's result. Drain `mockReset()` in `beforeEach`
  per LESSONS#0092.
- `src/lib/supabase/middleware.ts` — add `'/drill/'` AND
  `'/api/drill-shares/'` to `publicPaths` in the SAME PR per
  LESSONS#0091 / #0104. The `/api/drill-shares/[token]` GET is public
  (cold visitors hit it before sign-in); the `/create`, `/clone`,
  `/unpublish`, `/mine` routes self-enforce auth in the handler (same
  posture as 0049's `/api/practice-plan-shares/create` per the existing
  middleware comments). The blanket prefix `/api/drill-shares/` is the
  same pattern as `/api/practice-plan-shares/` already uses.
- `src/lib/drill-favorites-utils.ts` (existing — read first) — REUSE
  `toggleFavorite` for the clone path. Add a tiny `addToFavorites`
  helper if the existing toggle's only-add semantics are awkward (read
  the existing signature first per LESSONS#0096 — do NOT rewrite the
  helper).
- `tests/migrations/059-drill-shares.test.ts` (new, `.test.ts` per
  LESSONS#0020 / #38) — scan migration body with `--` stripped
  (LESSONS#0088); assert column allow-list on BOTH tables; assert
  UNIQUE constraints; assert NO new column on `coaches` / `plans` /
  `players`.
- `tests/api/drill-shares-create.test.ts` (new) — 200 first publish;
  200 idempotent re-publish updates caption; 400 voice; 400 length;
  404 unknown drill; 401 unauthed. Per LESSONS#0055 — call no-arg
  handlers with no args; this route takes a `Request` so pass one.
- `tests/api/drill-shares-token-get.test.ts` (new) — 200 payload shape;
  publisher first name only; 410 after unpublish; 404 unknown; no
  minor data leaked.
- `tests/api/drill-shares-clone.test.ts` (new) — 200 + favorite added +
  `drill_share_clones` row written; idempotent; self-clone silent;
  410 / 404 / 401.
- `tests/api/drill-shares-unpublish.test.ts` (new) — 200; idempotent;
  401.
- `tests/api/drill-shares-mine.test.ts` (new) — returns caller's own
  shares + cloneCount; empty array for caller with no shares; 401.
- `tests/app/sitemap.test.ts` (EXISTING — extend) — add the 7th
  from-chain in every `mockReturnValueOnce` queue per LESSONS#0049 /
  #0100. Drain `mockReset()` in `beforeEach` per LESSONS#0092. Assert
  a seeded active drill share appears in the sitemap; an inactive one
  does not.
- `tests/components/publish-drill-sheet.test.tsx` (new) — render the
  sheet; tap Publish; assert POST + success state; Copy button has
  `data-share-url`.
- `tests/components/drill-share-card.test.tsx` (new) — render the public
  card body; assert rendered text has no banned word per LESSONS#0023.
- `tests/e2e/drill-share-flow.spec.ts` (new). Seed extension: ONE new
  `auth.users` (LESSONS#0084) + ONE new `coaches` row (the cloner) +
  ONE `drill_shares` row published by the E2E coach (pre-seeded
  active token so the unauthed read path is exercisable without a
  prior in-spec publish — same posture as 0049's `/plan/[token]`
  seeded share). UUIDs in next free `0000000000<XX>+` range per
  LESSONS#0101. Spec: see the AC for the three-phase flow. Scope by
  `data-testid` per LESSONS#0081 / #0082 (the seeded second coach's
  first name may overlap with team names — never use bare
  `getByText`). Skip when E2E creds are unset.
- New deps: NO. Migration: YES (059 or bump). Env vars: NO new. AI
  prompt change: NO (no AI call on this path). Tier feature key:
  NO new key.
- LESSONS to anchor: #0006 (prefix uniqueness — coordinate with
  sibling new tickets at pickup), #0009 / #0036 (server vs client
  component fetch posture for the public page), #0020 / #38 (.test.ts),
  #0023 (positive voice for templates + the caption voice-scan posture),
  #0029 / #0082 (strict-mode collisions; scope to data-testid in e2e),
  #0036 (best-effort render + COPPA `.select()` allow-list),
  #0049 / #0092 / #0100 (CRITICAL — the sitemap test queues need the
  7th from-chain added in the same PR), #0055 (no-arg handler call
  posture in tests), #0056 / #0082 (data-share-url + data-testid),
  #0057 (team_coaches not teams.coach_id — irrelevant here since this
  ticket has no team-scoped query, but worth confirming if pickup
  surfaces one), #0065 / #0066 / #0162 (`home/page.tsx` is DIRTY —
  this ticket does NOT touch it; if pickup-time scope creep tries to
  add a /home card, defer that to a follow-up), #0084 / #0101 (seed
  posture + auth.users rows for the second coach), #0088 (strip `--`
  comments), #0091 / #0104 (publicPaths for the new `/drill/` page +
  `/api/drill-shares/` prefix — must land in the same PR), #0096
  (schema wins over prose — read the actual `src/lib/drills/*`
  resolution + the existing `drill-favorites-utils.ts` signature +
  the existing `coach-profile` dashboard path at pickup before
  writing the routes).

## Implementation log

(Appended by the implementation-dev agent during execution.)
