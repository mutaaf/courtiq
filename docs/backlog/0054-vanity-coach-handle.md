---
id: 0054
title: Let the coach claim a vanity URL (/coach/sarah-rodriguez) so their profile fits in an email signature
status: groomed
priority: P1
area: growth
created: 2026-05-28
owner: product-groomer
---

## User story

As a volunteer coach who already turned on the public coach profile (0026) and uses it in
the head-coach text thread, I want a one-time choice of a vanity handle so my profile lives
at `/coach/sarah-rodriguez` instead of `/coach/Kx9pQ2Lm7vN4Xb8R`, so that I can put it on
my email signature, in my league's "meet the coaches" page, and in the bio line of the
group chat — places a random 16-character token does not belong.

## Why now (four lenses)

### Product Owner
0026 shipped the public coach profile at `/coach/[token]` — a random opaque 16-char
identifier minted by the existing share-token machinery. It works, it's seeded, it's
indexed in the sitemap (0038), and it converts. But it is not a URL a human can speak,
remember, or put on a business card. A coach asked for "the link" three times this season
already had to copy-paste a string of base62 noise into a text message. The smallest
meaningful unit of value is one new nullable column on `coaches` (`handle TEXT NULL
UNIQUE`), one server-side resolver that maps `/coach/[handle]` → the same `getCoachCard()`
data the token route renders, and a one-time "claim your handle" sheet that opens from
`/settings/referrals` (the existing surface coaches already visit when they ship a profile
link). The token URL keeps working forever — handle is purely additive, never replaces.
The handle is opt-in: coaches who don't claim one stay on their token URL and nothing
breaks. Zero AI, zero new tier-gated paywall, zero new public route — `/coach/[handle]`
slots into the existing `/coach/[token]` route by extending the dynamic segment's
resolver to accept either.

### Stakeholder
This is the cheapest SEO+word-of-mouth upgrade the existing acquisition surface can take.
The sitemap (0038) already lists every public coach card; promoting the URL from a random
token to a vanity handle does three compounding things at zero infra cost. (1) The
handle is the substring a cold searcher actually types — "coach sarah rodriguez
basketball" — so the public profile starts ranking on the coach's actual name, not on
a random token nobody searches for. (2) The handle is the substring that survives a
copy-paste into an Instagram bio, a Linktree, a school directory, a parks-and-rec
website — surfaces the token URL is structurally rejected from because nobody puts
base62 noise in their bio line. (3) The handle deepens the moat by anchoring the coach's
own NAME inside the product — a coach who claims `sarah-rodriguez` has implicitly named
SportsIQ as the place their public coaching identity lives, which is the kind of identity
investment a forms-app competitor never earns. No new tier, no new email cron, no new
tracker — just a column and a route extension.

### User (the coach, Sunday morning, sitting at the kitchen table trying to put her profile in her email signature)
She opens /settings/referrals (where she already lives to grab the coach-card URL). At the
top, below her existing token link, a new small line: "Want a cleaner URL?" A button:
"Claim a handle." Sheet opens: one text input pre-filled with her name kebab-cased
("sarah-rodriguez") and an available-checker that updates as she types. If the name is
taken, the input shows a small "try sarah-rodriguez-2 or sarah-r" suggestion (deterministic
from her display name + a small integer, no surnames from other coaches surfaced). She taps
"Claim sarah-rodriguez." Toast: "You're at sportsiq.app/coach/sarah-rodriguez now."
Below, the link updates. She copies it; it fits in one screen of her email signature. If
she never opens this sheet, nothing happens — her token URL keeps working. The handle is
one-time-claim-then-lock for v1 (no rename in the first ticket; a "change my handle"
flow is a future ticket once the namespace dynamics are understood).

### Growth
The "show me" moment is one screenshot: a coach's email signature with
`sportsiq.app/coach/sarah-rodriguez` under her name, and the recipient (another coach or
a parent) tapping that link out of curiosity. That URL is structurally more shareable
than the token URL on every surface that matters: email signatures, Instagram bios,
league directories, parents' fridges. Concretely, every coach with a paid tier OR a free
coach with five-plus practices logged is eligible (a soft gate against squatting); the
expected lift is in the long tail of one-off shares that the token URL never got because
the URL itself was the friction. Every coach who comes back this week to claim a handle
is a coach we get to re-engage with a notification ("your link is now sportsiq.app/coach/
your-name") that does NOT require a new email cron — the existing /settings/referrals
visit is the surface. Distinct from every shipped acquisition ticket (0010/0017/0026/
0027/0033/0038): those all created a NEW public surface. This makes the EXISTING public
surface humanly shareable.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `050_coaches_handle.sql` adds exactly one column `coaches.handle
  TEXT NULL UNIQUE` and a `CHECK (handle ~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$')` —
  forcing 2–32 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen. The
  column carries NO new minor data. Pick the next free integer prefix after 049's
  `049_plans_type_mid_season_team_newsletter.sql` (LESSONS#0006). (vitest scans the
  migration's executable DDL — strip `--` comments per LESSONS#0088 — and asserts only
  the documented column + check are added; banned tokens `player`, `parent`,
  `observation`, `medical` are absent.)
- [ ] A pure helper `proposeHandle(displayName: string, takenHandles: Set<string>): string`
  lives in `src/lib/coach-handle-utils.ts`. Given a display name (`"Sarah Rodriguez"`)
  returns the kebab-case primary (`"sarah-rodriguez"`); if that's in `takenHandles`,
  appends `-2`, `-3`, ... until free; strips non-alphanumeric (except spaces converted to
  hyphens); lowercases; collapses repeated hyphens; trims leading/trailing hyphens; caps
  at 32 chars. A second helper `isReservedHandle(handle: string): boolean` returns true
  for a small reserved list (`admin`, `api`, `app`, `settings`, `signup`, `login`,
  `share`, `team-card`, `season-recap`, `plan`, `recap`, `programs`, `coach`, `parents`,
  `observe`, `org`, `privacy`, `terms`, `account`) so a coach cannot claim a route
  prefix that already exists. (vitest: each transformation case; reserved-list rejection;
  the regex matches the migration's CHECK character class.)
- [ ] `GET /api/coach-handle/available?handle=<h>` (new) returns `{ available: boolean,
  reason: 'taken' | 'reserved' | 'invalid' | null }`. The route is authed (caller's
  coach id must exist via `createServerSupabase().auth.getUser()` → 401), runs
  `isReservedHandle` first, then the regex, then a single `from('coaches').select('id').
  eq('handle', h).maybeSingle()` via `createServiceSupabase()`. The route never returns
  WHICH coach holds a taken handle. (vitest: 401 on missing auth; available=true on a
  fresh handle; available=false reason='reserved' on `admin`; available=false reason
  ='invalid' on `SARAH ROD!`; available=false reason='taken' on a seeded held handle.)
- [ ] `POST /api/coach-handle/claim` (new) accepts `{ handle: string }`. Auth → 401.
  Validates the regex + reserved list server-side (NEVER trusts client validation; same
  posture as LESSONS#0039). If the caller already has a `handle`, returns
  `409 { error: 'already_claimed' }` — v1 is one-time claim. Otherwise atomically
  updates the caller's `coaches.handle` via a service-role write; on a unique-constraint
  violation returns `409 { error: 'taken' }`. Returns `200 { handle }` on success. The
  route never accepts a handle on behalf of a different coach. (vitest: 401 missing auth;
  invalid handle → 400; reserved handle → 400; happy path writes the column; re-claim
  returns 409; concurrent write to the same handle → 409 on the loser.)
- [ ] The dynamic route `/coach/[token]` (existing — read first) is extended so the
  `[token]` segment accepts EITHER a 16-char share-token (existing behavior, byte-
  identical) OR a `handle` matching the regex. The server-side resolver in
  `src/app/coach/[token]/page.tsx` (or whichever page file 0026 shipped — verify with
  `ls src/app/coach/`) detects which path by length+character-class and routes the read
  to either `coach_card_shares` (token) or `coaches.handle` (handle) → both resolve to
  the SAME `getCoachCard()` render. On a handle lookup, the route additionally writes
  the resolved `coach_id` so the view-count surface in `coach_card_shares` keeps its
  attribution shape (look up the coach's existing public card token via
  `coach_card_shares.coach_id = $id AND is_active = true`, increment its view_count).
  If the coach has a handle but NO active coach-card token (claimed handle before
  publishing the card), render a friendly 404 — the handle is a re-routing of an
  existing public profile, not a new one. (Playwright: visit `/coach/<token>` and
  `/coach/<handle>` for the same seeded coach; both render the SAME page; assert the
  page contains the coach's display name in both; visit `/coach/<unknown>` returns 404;
  visit `/coach/<handle-without-active-card>` returns 404. vitest: the resolver helper
  given a token-shape vs a handle-shape input dispatches correctly.)
- [ ] The `/settings/referrals` page (existing — the surface coaches reach to grab their
  coach-card URL) renders a new "Want a cleaner URL?" section below the existing card
  link. Tapping "Claim a handle" opens a sheet with a single text input, pre-filled by
  `proposeHandle(coach.full_name, ...)` and an availability check that POSTs to
  `/api/coach-handle/available` debounced by 250ms. On a successful claim the section
  collapses to "You're at sportsiq.app/coach/<handle>" with a Copy button. If the coach
  already has a handle, the section renders only the read-only display ("Your URL:
  sportsiq.app/coach/<handle>") with the Copy button — no re-claim affordance in v1.
  Dark/orange dashboard aesthetic, 44px targets, no banned words. (Playwright/component:
  render with a seeded unclaimed coach; type a handle; assert the availability indicator
  flips; submit; assert the success copy. Render with a seeded claimed coach; assert the
  read-only display.)
- [ ] Sitemap update: `src/app/sitemap.ts` (existing — shipped by 0038) emits the
  vanity URL `/coach/<handle>` for any coach with a non-null handle AND an active
  coach_card_shares row, IN ADDITION to (or in place of) the existing `/coach/<token>`
  entry. The handle URL is preferred when both exist (canonical). Per LESSONS#0091, the
  `/coach/<handle>` URL inherits the existing `/coach/` prefix in `publicPaths` (no
  middleware change). (vitest: an authed coach with a handle gets a sitemap entry at
  `/coach/<handle>` and NOT at `/coach/<token>`; an authed coach without a handle gets
  the token entry; the sitemap content-type stays `application/xml`.)
- [ ] OG image + metadata: `src/app/coach/[token]/opengraph-image.tsx` (existing,
  shipped by 0026) is unchanged in body; the dynamic route just accepts a handle as
  well as a token (same dispatcher as the page). The OG card and `generateMetadata`
  resolve the same coach via the same shared `getCoachCard()` helper — there is ONE
  metadata helper (LESSONS#0060) so the title/description never disagrees between the
  page and the og image. (vitest: og route invoked with a handle returns 200 +
  image/png; metadata title is byte-identical between handle and token paths for the
  same coach.)
- [ ] Privacy / COPPA: the handle is on `coaches`, NEVER on `players` — no minor data
  widening. The available-check endpoint never reveals WHO holds a taken handle. The
  handle itself is a coach's own choice; the reserved list prevents impersonation of
  route prefixes. (vitest: the available-check response payload's keyset matches
  `{ available, reason }` exactly via `Object.keys().sort()` deep equality — no `coach_id`,
  no `coach_name` leaks; the migration DDL is scanned for banned tokens.)
- [ ] Voice contract: every new user-facing string ("Want a cleaner URL?", "Claim a
  handle", the toast, the reserved-handle error copy, the taken-handle hint) contains
  NO AGENTS.md banned word (`journey`, `amazing`, `exciting`, `elevate`, `empower`,
  `synergy`). Per LESSONS#0023 the copy is factual ("Your URL: sportsiq.app/coach/..."),
  never enumerates the banned tokens verbatim. (vitest: scan every new component's
  rendered text for the banned tokens.)
- [ ] Tier / privacy: NO new `feature_*` key. The handle claim is universal — every
  coach who has published their coach card (the 0026 prerequisite) can claim a handle.
  Gating it would invert the loop (the cleaner URL is the thing that gets the coach-card
  re-shared). The 0026 publish-the-card flow itself is unchanged. (vitest: a `free`,
  `coach`, `pro_coach`, and `organization`-tier coach all receive 200 on the claim
  route; the available-check has no tier check.)
- [ ] Regression: the existing `/coach/[token]` path is byte-identical (same render, same
  view_count increment) for tokens that do not match the handle regex. The existing
  `/api/coach-card/create` route is untouched. The 0038 sitemap continues to emit ONE
  url per coach card (not both token and handle simultaneously — the handle is the
  canonical when present). (vitest: an existing-token Playwright spec from 0026 passes
  unchanged; the sitemap unit test asserts no duplicate emission per coach.)

## Out of scope

- A "change my handle" / rename flow. v1 is one-time-claim-then-lock. Renames invite
  link-rot, broken email signatures, and squatter dynamics that v1 doesn't solve. A
  future ticket adds an alias table once we know how often coaches actually want to
  rename.
- A handle-on-team or handle-on-org. v1 is coach-only. Team and org slugs already exist
  on `organizations.slug`; this ticket does not touch them.
- A handle marketplace, premium handles, or paid reservations. The reserved list is for
  route-prefix protection only; everything else is first-come-first-served.
- An avatar / bio / link-tree on the coach-card page. v1 keeps the 0026 card body byte-
  identical and only adds an alternate URL to reach it. A richer profile body is a
  future ticket.
- A redirect from `/coach/<token>` to `/coach/<handle>` (canonical 301). v1 keeps both
  URLs live and the sitemap prefers the handle; a 301 forces every existing share-thread
  link to refetch and is a separate decision.
- A handle-search surface ("find coach by handle"). v1 has no directory of handles
  beyond what the sitemap already exposes; a search box is a separate ticket and a
  separate privacy review.
- Email notification to the coach when their handle is claimed. The claim is the
  in-product action; no email cron is added.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- New migration `supabase/migrations/050_coaches_handle.sql` — adds `handle TEXT NULL
  UNIQUE` + the CHECK regex on `coaches`. Pick `050_…` after verifying with `ls
  supabase/migrations/` (LESSONS#0006); the last shipped prefix is `049_…`. Document
  in the Implementation log. The migration adds nothing to `players`.
- `src/types/database.ts` — extend the `Coach` row type with `handle: string | null`.
- `src/lib/coach-handle-utils.ts` (new) — pure helpers: `proposeHandle(displayName,
  takenHandles)`, `isReservedHandle(handle)`, `isValidHandleShape(handle)` (regex
  match). NO database access.
- `src/app/api/coach-handle/available/route.ts` (new) — `GET(request)`. Auth → 401.
  Read `?handle=` param; run shape + reserved-list check; if both pass, query
  `coaches` for the handle. Return `{ available, reason }`. Service-role for the
  read.
- `src/app/api/coach-handle/claim/route.ts` (new) — `POST(request)`. Auth → 401. Read
  `{ handle }` from JSON. Re-run shape + reserved-list checks server-side. Look up
  the caller's `coaches.handle`; if non-null → 409 `already_claimed`. Else update via
  service role; on unique-constraint violation (Postgres SQLSTATE `23505`) → 409
  `taken`. Return `{ handle }` on 200.
- `src/app/coach/[token]/page.tsx` (existing — read first; shipped by 0026) — extend
  the dynamic segment's resolver: if `[token]` length is exactly 16 (or whatever the
  existing share-token length is — VERIFY via the existing `makeShareToken` helper) and
  matches the token character class, run today's `coach_card_shares` lookup. Otherwise,
  if the segment matches the handle regex, look up `coaches.handle = $segment AND
  EXISTS (coach_card_shares.coach_id = coaches.id AND is_active = true)`. Either way
  the rest of the page (the `getCoachCard()` data fetch + render) is unchanged.
  Increment `view_count` on the resolved `coach_card_shares` row.
- `src/app/coach/[token]/opengraph-image.tsx` (existing — read first) — the same
  resolver extension applies. The OG image is unchanged in body.
- `src/lib/share-metadata.ts` (existing — the helper shipped under LESSONS#0060) — the
  same helper resolves both URL shapes via the shared coach-card lookup.
- `src/app/(dashboard)/settings/referrals/page.tsx` (existing — read first) — add a
  new "Want a cleaner URL?" section. Use `query()` for the available-check (debounced
  client-side; the route is the auth boundary). Use `mutate()` to POST the claim.
  Dark/orange aesthetic, 44px targets.
- `src/app/sitemap.ts` (existing — shipped by 0038) — replace the per-coach
  `/coach/<token>` emission with `/coach/<handle>` when `coaches.handle IS NOT NULL`,
  else fall back to `/coach/<token>`. Per LESSONS#0091 no `publicPaths` change is
  needed because the `/coach/` prefix is already public.
- `src/lib/supabase/middleware.ts` — NO change. The `/coach/` prefix is already in
  `publicPaths`.
- `tests/lib/coach-handle-utils.test.ts` (new, `.test.ts` NOT `.spec.ts` —
  LESSONS#0020/#38) — `proposeHandle` matrix (single name, two names, special chars,
  unicode, collision auto-suffix); `isReservedHandle` for every reserved entry; the
  CHECK-regex shape matcher.
- `tests/api/coach-handle-available.test.ts` (new) — 401 on missing auth; the four
  reason states; the payload keyset deep-equality (LESSONS#0078). Run `tsc --noEmit`
  without piping (LESSONS#0095/#0096). Run under Node 20.19.0 (LESSONS#0010).
- `tests/api/coach-handle-claim.test.ts` (new) — 401, 400 invalid, 400 reserved, 200
  happy, 409 already_claimed, 409 taken (simulate unique-violation by mocking the
  service-role response). NEVER trust a client-supplied handle past validation.
- `tests/migrations/coaches-handle.test.ts` (new) — strip `--` comments per
  LESSONS#0088; assert the column allow-list exactly; assert no banned tokens; assert
  the CHECK regex character class matches the helper's `isValidHandleShape`.
- `tests/components/claim-handle-section.test.tsx` (new) — render with a seeded
  unclaimed coach; type a handle; assert the available-check fires; assert the success
  copy after a successful claim. Render with a seeded claimed coach; assert read-only
  display.
- `tests/app/coach-page-handle.test.ts` (new) — render `coach/[token]/page.tsx` with
  a handle param (mocked Supabase resolves it to the coach); assert the render is
  byte-identical to the token render for the same coach.
- `tests/app/sitemap-handle.test.ts` (extend or new) — assert handle URL preferred,
  token URL fallback, no duplicates per coach.
- `tests/e2e/coach-handle-flow.spec.ts` (new Playwright spec) against the 0006-seeded
  Supabase. Seed: extend the existing E2E coach in `tests/e2e/fixtures/seed.sql` with
  `handle = 'e2e-coach'`. Spec: visit `/coach/e2e-coach` unauthed, assert the page
  renders with the coach's display name (the existing 0026 spec's locator). Visit
  `/coach/<existing-e2e-token>`, assert the same page renders. Visit
  `/coach/admin` (reserved) and assert a 404. Use `data-testid` scoping (LESSONS#0081).
  Skip when E2E creds are unset.
- New deps: NO. Migration: YES (one nullable TEXT column + UNIQUE + CHECK). Env vars:
  NO. AI prompt change: NO. Tier feature key: NO.
- LESSONS to anchor: #0006/#0009 (migration prefix uniqueness; coordinate after 049).
  #0023 (voice positively; never enumerate banned tokens). #0038 (page is a SERVER
  component — `getByText` mocks via `page.route()` don't help; back the e2e with the
  seed). #0039 (never trust client-supplied handle past validation; same posture as
  drill-signal coach_id). #0060 (one shared metadata helper for both page + og image).
  #0078 (assert response payload keyset via `Object.keys().sort()`). #0081 (data-testid
  scoping). #0088 (strip `--` comments before scanning migration). #0091 (any new
  public root route MUST be in `publicPaths` — here `/coach/` is already covered, so
  no change). #0099 (after widening a domain type, grep tests for object literals that
  construct `Coach` and add `handle: null`).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0054-...` opened
- YYYY-MM-DD — failing test added in `tests/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
