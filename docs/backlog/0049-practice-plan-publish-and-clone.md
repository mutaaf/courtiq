---
id: 0049
title: Let a coach publish a great practice plan as a one-tap clone link another coach saves to their team in 10 seconds
status: groomed
priority: P1
area: plans
created: 2026-05-26
owner: product-groomer
---

## User story

As a volunteer coach who just ran a practice plan that worked — kids engaged, drills landed,
the assistant coach across town keeps asking what I'm doing — I want one tap on that plan to
publish a public link, and a coach who taps that link wants one tap to clone the plan to their
own team as a fresh practice plan they can run next Tuesday, so that the work I already did
travels across the sideline at the parking-lot speed of "yeah, here, just tap this" instead of
dying in my own Plans page.

## Why now (four lenses)

### Product Owner
We have shipped every direction of viral except this one: coach → parent (parent report,
weekly star, game recap), parent → coach (parent self-signup 0019, observer-to-coach 0029),
coach-to-coach as a profile / persona surface (team personality 0010, coach profile 0026,
warm referral 0021). What we have NEVER shipped is the COACHING ARTIFACT travelling between
coaches: the actual practice plan, the actual drill list, the actual structured content that
makes the product a coaching tool, moving from one coach to another in a single tap. Today a
coach who likes another coach's plan must word-of-mouth re-build it from memory. The
smallest meaningful unit of value is two new public routes (publish + clone) backed by ONE
new shares table (`practice_plan_shares`) that maps a token → a plan id → the publishing
coach, plus a "Clone to my team" button on the public page that creates a fresh `plans` row
on the cloning coach's active team. No new AI, no new tier-gated paywall (publishing is free
because the publisher's content drives the cloner's discovery — gating it would invert the
loop), and one new column on `plans` (`source_plan_id UUID NULL`) so we know which plans are
clones for the analytics-free attribution this ticket actually needs (the publishing coach
sees a clone count; that is the entire feedback channel).

### Stakeholder
This is the COACH-TO-COACH moat ticket the product has been avoiding writing because the
viral surfaces shipped so far were easier (coach-to-parent has the obvious group-chat path;
this one needs trust, attribution, and a satisfying receiver experience). It is the ticket
that turns SportsIQ from "the coach's notebook" into "the coaching network you don't see
yet." Concretely it deepens the moat three ways. (1) The content moat — every published
plan is a piece of pedagogy the product owns the distribution of; a competitor's day-1
clone cannot reach those plans. (2) The graph moat — clone attribution (the new
`source_plan_id`) gives us a coach-to-coach dependency graph we don't have today
(complements the referral graph from 0011/0021); it is the only edge type in the product
that connects two coaches via WORK they both did, not via an invite link. (3) The
acquisition moat — a cloned plan is the most credible referral channel the product has,
because the receiver chose to clone it (revealed preference), not just to sign up. The
publishing coach's notification ("12 coaches cloned your plan this week") is a feedback
loop that re-fires the publish action. Cone-shaped network effect: one coach publishes,
N coaches clone, M of those publish next, and the long-half-life feedback compounds.

### User (the publishing coach, Wednesday night, looking at last Tuesday's plan they liked)
They open the plans page. The plan they ran is at the top. New small "Publish" link beside
the title. They tap it; a sheet shows two questions: "What sport / age group is this best
for?" (pre-filled from the team's existing sport + age group) and "Anything to tell the
other coach?" (optional one-line). They tap "Publish." A short URL appears with a Copy
button. They drop it in the head-coach text thread for their league. Twenty seconds, done.
A week later they get a small home-card: "3 coaches cloned your closeout drill plan." No
upsell, no email blast — just a count.

### User (the cloning coach, the next morning, gets the link in a text)
They tap the link on their phone. The plan opens at `/plan/[token]` (parent-portal gray /
orange aesthetic, NOT the dark dashboard — public surface) with the publishing coach's
first name + the one-line note + the drill list. At the top: "Save to my team." They tap.
If they're signed in to SportsIQ, a sheet asks which team to clone it onto; tap, done.
The cloned plan opens on /home as a fresh draft they can run next Tuesday. If they're NOT
signed in, the same button drops them at `/signup?clone_token=...` and after the (already
shipped 0007) onboarding, the plan is automatically created on their first team — they
hit /home with a practice ready to run. The COACH'S FIRST NAME is the entire trust signal:
no rating, no review, no comment thread (a forms app's worst feature).

### Growth
This is structurally the highest-leverage acquisition ticket the product has not built.
Every coach who clones a plan is BOTH a converted coach AND a future publisher; the
referral graph and the content graph share a node. The "show me" moment is the public
plan page itself — a parent who is also a coach gets the link in a text from her brother
who coaches her son's flag football team, opens it on her commute, and is converted by
the artifact, not by a marketing landing page. It is the cleanest demo surface the
product can ship: real content, real coach, real plan, fresh. Distinct from every
shipped surface: the team-card and coach-profile (0010/0026) sell the COACH; the season
recap (0017) sells the SEASON; this sells the CRAFT, which is the thing volunteer coaches
respect most about each other.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `046_practice_plan_shares.sql` adds the table
  `practice_plan_shares (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), token TEXT NOT NULL
  UNIQUE, plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE, coach_id UUID NOT
  NULL REFERENCES coaches(id) ON DELETE CASCADE, note TEXT NULL, is_active BOOLEAN NOT
  NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` plus a partial index
  `CREATE INDEX idx_practice_plan_shares_token ON practice_plan_shares (token) WHERE
  is_active;` and a per-coach index `(coach_id, created_at DESC)`. The migration mirrors
  `035_team_card_shares.sql` byte-for-byte where applicable. It also adds ONE column on
  `plans`: `source_plan_id UUID NULL REFERENCES plans(id) ON DELETE SET NULL` so clones
  carry attribution. Pick the next free prefix AFTER 0048's `045_…` (so `046_…`); verify
  with `ls supabase/migrations/`, LESSONS#0006. (vitest scans the executable DDL — strip
  `--` comments per LESSONS#0088 — and asserts the column allow-list on
  `practice_plan_shares` matches exactly the seven columns above; the new `plans.source_plan_id`
  is nullable; banned tokens `player`, `parent`, `observation`, `medical` are absent.)
- [ ] `POST /api/practice-plan-shares/create` (new) accepts `{ planId, note? }`. Auth via
  `createServerSupabase().auth.getUser()` → 401; the plan must belong to the caller
  (`eq('coach_id', user.id)`) and have `type='practice_plan'` → 404 otherwise. On success
  generates a short token (use the same `nanoid`-style helper the existing share routes
  use; mirror `src/app/api/team-card/create/route.ts`), inserts a row into
  `practice_plan_shares` with `is_active=true`, and returns `{ token, url:
  '/plan/<token>' }`. Idempotency: a re-create on the same `planId` reuses the existing
  active row (do not generate two tokens per plan). Service-role only; never a direct
  client write. (vitest covers 401, 404 on foreign plan, 404 on non-practice plan, happy
  path with token-shape assertion, idempotency re-create.)
- [ ] `GET /api/practice-plan-shares/[token]` (new) reads the token, joins to `plans` for
  `content_structured` + `title`, joins to `coaches` for `full_name` (first name only via
  string split server-side), returns the four-key payload `{ planTitle, planContent,
  coachFirstName, note | null }`. The route is PUBLIC (added to `publicPaths` —
  LESSONS#0038 family). The payload includes NO minor data, NO player names, NO email,
  NO last name; the join is scoped to `practice_plan_shares.is_active = true`. The
  practice plan content (`content_structured.drills[].name`, durations, focus) is
  team-level work, never per-player. (vitest: 404 on missing/inactive token; happy path
  returns the four-key allow-list; `Object.keys(payload).sort()` deep-equality assertion;
  no last name in the payload.)
- [ ] `POST /api/practice-plan-shares/clone` (new) accepts `{ token, teamId }`. Auth via
  `createServerSupabase().auth.getUser()` → 401; the share resolves to an active row → 404
  otherwise; the team belongs to the caller (`eq('coaches.org_id', caller.org_id)`) → 404
  otherwise. On success: inserts a NEW `plans` row with `coach_id = caller`, `team_id =
  $teamId`, `type = 'practice_plan'`, `content_structured` copied byte-for-byte from the
  source plan, and `source_plan_id = sourcePlan.id`. Returns `{ planId }`. The clone is a
  fresh draft — the source plan is unchanged. (vitest: 401, 404 on foreign team, 404 on
  inactive token, happy path inserts one row with the source attribution stamped, source
  plan untouched.)
- [ ] `src/app/plan/[token]/page.tsx` (new, server component, parent-portal gray/orange
  aesthetic) reads the token via the public GET route, renders: the publishing coach's
  FIRST NAME + the optional note + the drill list (drill name, focus area, duration). At
  the top a "Save to my team" CTA that, for an authed coach, opens a small team-picker
  sheet (their teams via the existing `useActiveTeam` / `query()` path) and POSTs the
  clone route on selection. For an UNAUTHED visitor the CTA links to
  `/signup?clone_token=...` — onboarding picks up the token in URL and after first-team
  setup auto-clones to the new team. 404 on a missing/inactive token. NO public reaction
  form, NO comments, NO ratings — the receiver experience is "save it or close the tab".
  (Playwright: seed a `practice_plan_shares` row + a plan with three drills; visit
  `/plan/<token>`; assert the drill list renders + the CTA renders; visit with no token →
  404; an authed coach taps CTA → a plan is cloned on their team and they land on /home
  with the fresh plan visible.)
- [ ] `/signup?clone_token=...` (existing onboarding) stashes the token on the auth
  session so after the first-team setup the new coach's first team automatically receives
  the cloned plan. Implementation reuses the existing `clone_token` query-param plumbing
  the dev decides on (most likely a cookie set on signup and consumed once in the
  first-team-creation flow). NEVER trust a client-supplied `source_plan_id` on the
  insert — the route recomputes from the token's resolved plan_id. (Playwright: signup
  flow with `clone_token`; after team creation, the new coach's /home shows the cloned
  plan. vitest on the clone-route: a forged `source_plan_id` in the body is ignored —
  same posture as LESSONS#0039.)
- [ ] The publishing coach's home page renders a small "Coaches who cloned your plans
  this week: N" card when `N >= 1`. The count comes from a new route
  `GET /api/practice-plan-shares/clone-count` that joins `plans` (where `source_plan_id
  IN (select id from plans where coach_id = caller)`) and filters
  `created_at >= now() - 7 days`. The card renders nothing on N = 0 (no nag). On a tap the
  card expands to show per-plan counts (not per-coach — the CLONING coach's identity is
  never surfaced to the publisher, only the COUNT, to keep the loop coach-private). The
  card auto-dismisses on view by writing a `last_seen_clone_count` integer on
  `coaches.preferences` (mirroring 0047's seen-bookmark pattern; do NOT add another
  `coaches` column — store the bookmark in the existing `preferences` jsonb). (vitest: the
  count is computed; the response includes NO coach_id of any cloning coach; the bookmark
  advances on view via a POST; a re-render the same session sees no card.)
- [ ] Voice contract: every user-facing string the dev adds (the publish sheet copy, the
  share URL helper text, the clone sheet copy, the count-card label, the public page's
  header + CTA, the onboarding-clone confirmation) contains NO AGENTS.md banned word
  (`journey`, `amazing`, `exciting`, `elevate`, `empower`, `synergy`). Per LESSONS#0023
  the copy is written POSITIVELY ("Save this plan to your team" / "12 coaches cloned this
  plan this week") and never enumerates the banned tokens verbatim. (vitest: scan every
  new component's rendered text in a setup test for the banned tokens.)
- [ ] Tier / privacy: PUBLISHING a plan is FREE for every tier — gating publish would
  invert the network effect. CLONING is also FREE — every signed-in coach can save a
  plan to one of their teams. The free coach's `maxTeams: 1` limit still applies: a free
  coach with no teams creates one on first clone (the existing onboarding path), and a
  free coach with one team already clones onto that team. No new `feature_*` key. The
  public page renders without auth so search engines (the sitemap from 0038 INCLUDES
  active `practice_plan_shares` tokens — see the next AC) can see the content. (vitest:
  a free coach can publish; a free coach can clone; the sitemap inclusion is asserted.)
- [ ] Sitemap (0038) includes every active `practice_plan_shares` token as
  `/plan/<token>` so cold searchers can find published plans. The existing dynamic
  sitemap reads from the shares tables already; extend it to read
  `practice_plan_shares` where `is_active = true`. NO per-coach data crosses the sitemap;
  the URL is opaque. (vitest: a seeded active share appears in the sitemap; an inactive
  share does not.)
- [ ] COPPA / privacy: a published practice plan contains NO minor data by construction —
  `plans.content_structured` for `type='practice_plan'` is drill names + durations +
  focus areas, never player names or observations. The new public route's payload
  allow-list is strictly the four keys above; planted player-name tokens in the source
  plan's `content_structured` (if a future plan type ever embeds them) would NOT cross
  the route because the route only reads `practice_plan` typed plans. (vitest: a planted
  player-name token in a non-practice plan's `content_structured` does NOT appear in any
  response; the route refuses non-`practice_plan` types as `404`.)
- [ ] Regression: every existing `plans` write path stays byte-identical. The new
  `source_plan_id` column is nullable and defaults to NULL, so every existing plan keeps
  `source_plan_id IS NULL`. The 0011/0015/0021 referral path is untouched. The 0017
  season-recap and 0010 team-card share patterns are untouched. (vitest: a fixture save
  of each existing plan type still passes after the new migration; the cloning POST does
  not write to any of the existing shares tables.)
- [ ] The dispatcher / data-route allow-list in `src/app/api/data/route.ts` and the
  mutate allow-list in `src/app/api/data/mutate/route.ts` are extended (in a comment-
  appropriate place) to include `practice_plan_shares` for READS only (clients NEVER
  insert into shares directly; the dedicated create route does). The `plans` table is
  already on both lists. (vitest: a `query({ table: 'practice_plan_shares' })` succeeds
  for the authed caller's own shares; a `mutate({ table: 'practice_plan_shares' })`
  direct-insert is REFUSED via 403 — the create route is the only insert path.)

## Out of scope

- A search / browse UI of published plans by sport. v1 is link-only: a coach must have
  the URL. A public discoverability surface (a "practice plan library") is a separate
  ticket and a separate moderation discussion.
- Comments / ratings / reviews on a published plan. v1 has no two-way feedback channel —
  the only signal a publisher gets is the clone count. Comments invite a moderation cost
  v1 does not justify.
- A "remix" notion or fork-tree visualisation. v1 records `source_plan_id` once at clone
  time; subsequent edits to the cloned plan do not propagate back to the source and there
  is no chain visualisation. If 10 coaches clone the same plan, we know N=10, not who.
- Stripe / payment / paid templates. Publishing is free; gating it would kill the loop.
  Monetization of published content is a separate ticket and a separate billing
  discussion.
- A push notification when a clone happens. v1 is the in-app card on /home only. A
  delivered notification needs its own approval line (AGENTS.md).
- An admin-side moderation dashboard. v1 trusts the publishing coach; flagged content
  handling is a separate ticket once we see real volume.
- Cross-org publishing controls ("only my program can clone"). v1 is fully public — every
  signed-in coach can clone any active share. A program-private channel is a future
  ticket if directors ask.
- Backfilling past plans as shares. v1 is forward-only; a coach with 12 plans before
  this ships must explicitly publish each one they want to share.
- A per-publish auto-share to the coach's existing followers (no followers feature
  exists). v1 is link-only.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- New migration `supabase/migrations/046_practice_plan_shares.sql` — creates the
  `practice_plan_shares` table per the AC schema, plus the partial index on `token` and
  the per-coach index; also adds `plans.source_plan_id UUID NULL REFERENCES plans(id) ON
  DELETE SET NULL`. Pick `046_…` after verifying with `ls supabase/migrations/`
  (LESSONS#0006). Document the prefix in the Implementation log.
- `src/types/database.ts` — add `PracticePlanShare` interface and extend `Plan` with
  `source_plan_id: string | null`.
- `src/lib/practice-plan-share-utils.ts` (new) — `generateShareToken()` (mirror the
  existing share-token helper used by team-card/season-recap) and
  `buildShareUrl(token)` that returns `/plan/<token>` (joined to `NEXT_PUBLIC_APP_URL`
  for absolute URLs).
- `src/app/api/practice-plan-shares/create/route.ts` (new) — `POST({ planId, note? })`.
  Auth → 401; verify plan ownership + `type='practice_plan'` → 404; idempotent re-create
  reuses the existing active row. Returns `{ token, url }`. Service-role only.
- `src/app/api/practice-plan-shares/[token]/route.ts` (new) — `GET(request, { params })`.
  Reads the token; joins to `plans` + `coaches` (first name only); returns the four-key
  allow-list payload. The join is scoped to `is_active = true`. Public.
- `src/app/api/practice-plan-shares/clone/route.ts` (new) — `POST({ token, teamId })`.
  Auth → 401; verify the active share → 404; verify caller owns the target team → 404.
  Inserts a fresh `plans` row with `source_plan_id` stamped; never trust client-supplied
  source. Returns `{ planId }`.
- `src/app/api/practice-plan-shares/clone-count/route.ts` (new) — `GET(request)`. Returns
  `{ count, byPlan: { plan_id, plan_title, count }[], lastSeenCount }` for the authed
  caller's published plans in the last 7 days. The response has NO cloning-coach ids of
  any kind.
- `src/app/api/practice-plan-shares/clone-count/seen/route.ts` (new) — `POST(request)`.
  Advances the caller's `coaches.preferences.last_seen_clone_count` to their current
  count. Mirror 0047's pattern but use `preferences` jsonb instead of a new column.
- `src/app/plan/[token]/page.tsx` (new, server component, gray/orange parent-portal
  aesthetic, NOT the dark dashboard) — renders the public plan page. 404 on missing /
  inactive token. CTA "Save to my team" — links to clone (authed) or
  `/signup?clone_token=…` (unauthed).
- `src/app/(auth)/signup/page.tsx` (existing — read first) — read `?clone_token=…`,
  stash it on the session (cookie or a small `coaches.preferences.pending_clone_token`
  key consumed once after first-team-setup), and on first-team-creation auto-clone the
  plan via the existing service-role flow.
- `src/components/plans/publish-plan-button.tsx` (new) — client component on the plans
  page's existing plan row UI. Opens a sheet with the optional note field + a "Publish"
  CTA. POSTs to `/api/practice-plan-shares/create` via `mutate()`-like helper (the
  existing share routes have their own create patterns — read
  `src/components/share/share-report-button.tsx` first; reuse that pattern). On success
  shows the URL + a Copy button.
- `src/components/home/plan-clones-card.tsx` (new) — client component, on /home, render
  ONLY when the GET returns count > lastSeenCount. Mirror 0047's celebration-card
  pattern (auto-dismiss on view via a `useEffect`-on-first-render POST).
- `src/app/(dashboard)/home/page.tsx` (existing) — render `<PlanClonesCard />` near the
  other home cards (below P0 banners — LESSONS#0045). The card renders nothing on
  count: 0, so the home screen is byte-identical for coaches with no clones.
- `src/lib/supabase/middleware.ts` — add `/plan/` and `/api/practice-plan-shares/` to
  `publicPaths` (the create / clone / clone-count / seen routes self-enforce auth in the
  handler — same posture as `/api/coach-card/create` etc). LESSONS#0038 family.
- `src/app/sitemap.ts` (existing — read first) — extend the dynamic sitemap to include
  every active `practice_plan_shares` token. Mirror the existing share-table iteration
  pattern.
- `src/app/api/data/route.ts` — add `practice_plan_shares` to the READ allow-list (for
  the coach's own published-shares listing — already implicit via the per-coach index).
- `src/app/api/data/mutate/route.ts` — do NOT add `practice_plan_shares` to the mutate
  allow-list; insertions go through the dedicated create route only (asserted in test).
- `tests/api/practice-plan-shares-create.test.ts` (new, `.test.ts` NOT `.spec.ts` —
  LESSONS#0020/#38) — auth / ownership / non-practice-plan / happy / idempotency. Run
  under Node 20.19.0 (LESSONS#0010). Run `tsc --noEmit` without piping to tail
  (LESSONS#0096).
- `tests/api/practice-plan-shares-token-get.test.ts` (new) — 404 inactive; happy path
  with payload-keyset deep-equality; no last name in payload.
- `tests/api/practice-plan-shares-clone.test.ts` (new) — auth / foreign-team / inactive-
  token / happy / forged-source-plan-id-ignored (mirror LESSONS#0039).
- `tests/api/practice-plan-shares-clone-count.test.ts` (new) — counts only the caller's
  published plans; never returns cloning-coach ids; the seen POST is idempotent.
- `tests/migrations/practice-plan-shares-coppa.test.ts` (new) — scan the migration's
  executable DDL (strip `--` comments — LESSONS#0088); assert the column allow-list on
  `practice_plan_shares` matches exactly; assert the new `plans.source_plan_id` is
  nullable; banned-token absence (`player`, `parent`, `observation`, `medical`).
- `tests/components/publish-plan-button.test.tsx` (new) — render; tap publish; assert
  the create route's mutate is called with `{ planId, note }`; assert the resulting URL
  + Copy button render.
- `tests/components/plan-clones-card.test.tsx` (new) — render with count: 3 + 7 +
  count > lastSeen → card visible; count: 0 → null; on first render the component POSTs
  the seen route.
- `tests/e2e/practice-plan-share-and-clone-flow.spec.ts` (new Playwright spec) against
  the 0006-seeded Supabase. Seed: one publisher coach + a published `practice_plan_shares`
  row + a second coach with one team. The spec signs in as the second coach, visits the
  public `/plan/<token>` page (use `request.get` for the unauthed asset hits but a fresh
  `browser.newContext()` for the visit; consider asserting against the public route
  without signing in first to prove the public surface), taps "Save to my team," picks
  the team, and asserts /home shows the cloned plan with `source_plan_id` set. Use
  `data-testid` scoping (LESSONS#0081). Skip when E2E creds are unset.
- `tests/e2e/sitemap.spec.ts` (existing — read first) — extend to assert active
  practice-plan-shares tokens appear in `/sitemap.xml`.
- New deps: NO. Migration: YES — one table-create + one column-add + indexes. Env vars:
  NO. AI prompt change: NO. Tier feature key: NO new key — publishing and cloning are
  universal.
- LESSONS to anchor: #0006/#0009 (migration prefix uniqueness; coordinate with 0048's
  `045_…`). #0038 (add `/plan/` and `/api/practice-plan-shares/` to `publicPaths`).
  #0039 (the clone route never trusts a client-supplied `source_plan_id`; same posture as
  the drill-signals contract). #0081 (data-testid scoping in Playwright). #0085/#0086
  (jsonb seeding in raw SQL — the seed practice plan's `content_structured` must be
  wrapped as a valid JSON literal). #0088 (strip `--` comments before scanning migration
  content). #0011 (deterministic referral codes via `makeReferralCode(coach.id)` — the
  warm-landing path is independent of clone tokens but the auth session cookie pattern
  mirrors). #0023 (voice contract — instruct positively; the publish sheet and clone CTA
  copy never enumerate banned tokens).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0049-…` opened
- YYYY-MM-DD — failing test added in `tests/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
