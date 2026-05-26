---
id: 0038
title: Put every public coach surface in the sitemap so cold searchers can find them
status: in-progress
priority: P1
area: growth
created: 2026-05-26
owner: product-groomer
---

## User story

As a volunteer coach who has never heard of SportsIQ but whose friend forwarded a season recap
card or whose program is listed in the program directory, I want a search for my league's name
(or my own name on a coach-card someone shared) to actually surface that page on Google, so
that the public surfaces we've already built can do their job as cold-traffic acquisition and
not just as forwarded one-off links.

## Why now (four lenses)

### Product Owner
Every public surface we have shipped is a real `<a href>` page rendered by a server component:
`/programs` (0033), `/org/[slug]` (0024), `/team-card/[token]` (0010), `/season-recap/[token]`
(0017), `/coach/[token]` (0026), `/recap/[token]` (0027), and `/share/[token]` (parent portal,
already not-indexable by design). They all set proper OG metadata. But `src/app/sitemap.ts`
only declares six static marketing routes (`/`, `/demo`, `/signup`, `/login`, `/privacy`,
`/terms`) — every dynamic public page is invisible to a search crawler unless it stumbles in
from an inbound link. The program directory (0033) is the most expensive miss: it is the one
inbound acquisition page we shipped explicitly to catch a cold searcher, and it isn't in the
sitemap. The smallest meaningful unit of value is a dynamic `sitemap.ts` that enumerates every
opted-in org page and every active coach/team/season/recap card token, plus a per-page
`robots`/`canonical` discipline so the parent portal and the dashboard stay correctly excluded.
No new artifact, no new model spend — it makes the existing public surfaces do the job they
were built for.

### Stakeholder
This is the only acquisition wedge that compounds without any per-event cost: once a page is
indexed, every future search is free distribution. The program directory + per-team claim
(0033) and the public coach card (0026) were explicitly designed as cold-traffic surfaces; the
recap and team-card surfaces (0010 / 0017 / 0027) are already passed around socially, so they
also accumulate inbound links a crawler can use to rank them. Sitemap + structured data lift
the discoverability of every one of those at once, with one ticket. The moat angle is
SEO durability: each opted-in org is a permanent inbound funnel for its own coaches' searches,
and the program directory itself becomes the kind of page that compounds — more opted-in orgs
make a richer directory which makes the directory itself rank higher which catches more cold
coaches.

### User (the coach, Sunday night, "what's that app our league uses?")
They search their league's name. Today, nothing on SportsIQ surfaces — even though we already
render a beautiful `/org/<slug>` for that league. After this ships, the org page is on the
result page; they tap through and see "Coach this team — free" next to the team they run
(0033). The cold path that 0033 promised actually works end to end. On a flaky connection it
costs them nothing extra — the sitemap is a static-ish XML file Google crawls in the
background, and the pages it points to are all already real server-rendered HTML.

### Growth
The "show me" moment is a program director searching their own league and seeing their
program page rank — "wait, my program shows up when someone searches us?" That is the thing
that gets a director to flip discoverable ON for their org (which is the gate 0033 already
shipped), and the thing they screenshot to the league commissioner. Distinct from every other
growth surface: 0010/0015/0017/0019/0021/0022/0026/0027 catch the person who already received
a link; 0024/0033 catch the person who already knows the slug; this catches the person who
*doesn't* — the cold searcher who has never been introduced to the product at all. Of all the
acquisition surfaces, this is the only one whose unit economics improve with no further work
once it ships.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `GET /sitemap.xml` returns `200 application/xml` and includes the static marketing routes
  it already lists (`/`, `/demo`, `/signup`, `/login`, `/privacy`, `/terms`) PLUS the
  `/programs` directory page. (vitest renders the `sitemap()` function and asserts every
  expected entry's `url`.)
- [ ] `GET /sitemap.xml` includes one entry per opted-in org page (`/org/<slug>`) — the same
  `settings.discoverable = true` flag the 0033 directory already filters on; a non-opted-in org
  is absent. (vitest mocks `createServiceSupabase` with one opted-in and one non-opted-in org;
  asserts the opted-in slug appears and the other does not.)
- [ ] `GET /sitemap.xml` includes one entry per ACTIVE public token across the four shipped
  token surfaces — `team_card_shares` → `/team-card/<token>`, `season_recap_shares` →
  `/season-recap/<token>`, `coach_card_shares` → `/coach/<token>`, `game_recap_shares` →
  `/recap/<token>` — and excludes rows with `is_active = false` or `revoked_at` not null.
  (vitest with mixed-active fixtures; assert active tokens included, inactive excluded; assert
  no `parent_shares` token appears — see below.)
- [ ] The parent portal (`/share/<token>`) is NOT in the sitemap and is marked `noindex` at the
  page level — parent-portal tokens carry per-minor content (player names, observation text)
  and must not be crawlable. (vitest: `parent_shares` tokens are NEVER included; Playwright:
  visit the seeded `/share/<token>` and assert `<meta name="robots" content="noindex">` is
  rendered in the head.)
- [ ] Every server-rendered public *coach* surface (`/programs`, `/org/<slug>`,
  `/team-card/<token>`, `/season-recap/<token>`, `/coach/<token>`, `/recap/<token>`) sets a
  canonical URL via `generateMetadata` so a crawler can collapse duplicates — the canonical
  uses `NEXT_PUBLIC_APP_URL` so preview and prod produce different canonicals correctly.
  (vitest: call each page's `generateMetadata` with a seeded token and assert
  `alternates.canonical` is `${NEXT_PUBLIC_APP_URL}<path>`.)
- [ ] Privacy / COPPA: the sitemap payload itself contains ONLY org slugs and opaque share
  tokens — no coach names, no player names, no team names, no observation text. (vitest builds
  the sitemap with seed-shaped inputs that include long names and asserts the rendered XML
  contains none of those strings — only slugs and the token characters.)
- [ ] Bound on size: when there are more than 5,000 token rows across the four token tables,
  `sitemap()` returns at most 50,000 entries total and orders the per-token entries by
  `created_at DESC` so the freshest are always indexed first. (vitest: fixture with >5,000
  fake tokens; asserts the cap and that the included tokens are the most recent.)
- [ ] Regression: the dashboard, the API routes, the parent portal, and the existing tier-gated
  surfaces are not added to the sitemap — only the public coach surfaces enumerated above.
  (vitest scans the sitemap for any path under `/api/`, `/(dashboard)`, or `/share/` and
  asserts none appear.)
- [ ] The `/programs` page metadata adds a JSON-LD `BreadcrumbList` (root → `/programs`) AND
  each `/org/<slug>` page metadata adds a JSON-LD `Organization` block (name + url ONLY; no
  email, no phone, no coach data) so a search engine can render a richer result; the existing
  `generateMetadata` `og:title` / `description` on those pages is unchanged. (vitest: the page
  metadata's structured-data block parses as JSON-LD with the expected `@type` and exposes
  only the allow-listed fields; no per-coach/per-minor data is present.)

## Out of scope

- A submitted-to-Search-Console workflow, GSC API integration, or a per-page index-status
  read-out. v1 emits a correct, crawlable sitemap; what a search engine does with it is
  measured outside the app.
- Re-indexing or back-pinging Google when a share is created/revoked (the IndexNow / sitemap-
  ping APIs). v1 lets the daily crawl pick up changes; live notification is a separate ticket
  if it ever proves worth the operational surface.
- Adding any new public surface or widening which fields render on existing public pages. The
  point of this ticket is that the existing surfaces — none of which carry minor data — become
  discoverable; widening what they show is a separate product call.
- A robots.txt rewrite or move from the static `public/robots.txt` to a dynamic generator. The
  one robots discipline this ticket asserts is per-page `noindex` on `/share/[token]` (the
  parent portal); robots.txt itself stays as it is.
- Caching/CDN headers, hreflang, or per-locale sitemaps. We have one locale; cache headers on
  the XML output are an infra-side decision a separate infra ticket can address.
- Any change to the program directory listing logic, the org page rendering, the coach-card,
  the season-recap, the game-recap, or the team-card page. This ticket only adds entries to
  `sitemap.ts` and per-page canonical/structured-data — it does not redesign any public
  surface. (Regression-protected by an AC.)

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- `src/app/sitemap.ts` — convert the current static-array `sitemap()` to an `async function`
  that returns the existing static entries PLUS the dynamic public entries. Read the four
  share tables (`team_card_shares`, `season_recap_shares`, `coach_card_shares`,
  `game_recap_shares`) and the opted-in `organizations` (`settings->>discoverable = 'true'`,
  matching `/api/programs`) via `createServiceSupabase()` (server-side; the sitemap renders
  on the server). Map to `MetadataRoute.Sitemap` entries with the token-only URL — never a
  player or coach name in the URL. Use `NEXT_PUBLIC_APP_URL` as the base, falling back to the
  existing `https://sportsiq.app` default already in the file. Cap at 50,000 entries; order
  per-table by `created_at DESC` (most recent first). The handler currently declares zero
  parameters — keep the same signature (LESSONS#0008 re: no-arg handlers).
- `src/app/programs/page.tsx` — extend the existing `generateMetadata` to set
  `alternates.canonical = ${NEXT_PUBLIC_APP_URL}/programs` and add a JSON-LD `BreadcrumbList`
  via the `other` metadata escape hatch (or render a `<script type="application/ld+json">` in
  the page body, whichever Next 14's `Metadata` API supports cleanly). Do NOT change the
  visual layout.
- `src/app/org/[slug]/page.tsx` — extend `generateMetadata` with a canonical AND a JSON-LD
  `Organization` block (name + url ONLY; no email/phone/coach data — assert by the
  acceptance-criteria allow-list). Reuse the public `/api/org/[slug]` data already fetched.
- `src/app/team-card/[token]/page.tsx`, `src/app/season-recap/[token]/page.tsx`,
  `src/app/coach/[token]/page.tsx`, `src/app/recap/[token]/page.tsx` — add
  `alternates.canonical` to each existing `generateMetadata`. Do NOT touch the rendered page
  body or its existing OG title/description (regression-protected by an AC).
- `src/app/share/[token]/page.tsx` (parent portal) — extend `generateMetadata` to set
  `robots: { index: false, follow: false }`. This is the one page that must remain
  non-indexable; the AC pins it. (LESSONS#0009: this is a server component, so a Playwright
  spec asserting the meta tag is fine — `page.locator('meta[name="robots"]')` reads the
  server-rendered HTML.)
- `tests/app/sitemap.test.ts` (new, `.test.ts` NOT `.spec.ts` — LESSONS#38). Mock
  `createServiceSupabase` with a small fixture per table; assert: static routes present,
  `/programs` present, opted-in org slug present, non-opted-in absent, each active token type
  present and inactive excluded, parent-portal tokens absent, no per-coach/per-minor strings
  in the rendered output, 50,000 cap honored, ordered by `created_at DESC`. Run under Node
  20.19.0 (LESSONS#0010). Run `tsc --noEmit` after writing route tests (LESSONS#0008).
- `tests/app/public-canonicals.test.ts` (new) — invoke each public page's `generateMetadata`
  with seeded params and assert `alternates.canonical` equals the expected URL; for `/programs`
  and `/org/<slug>` additionally parse the structured-data string as JSON-LD and assert the
  `@type` and the allow-listed fields, with no per-coach/per-minor keys.
- `tests/e2e/sitemap-and-noindex.spec.ts` (new Playwright spec) against the 0006-seeded
  Supabase: visit `/sitemap.xml` and assert it contains the seeded `/programs`, the seeded
  opted-in org's `/org/<slug>` URL, and the seeded share tokens (`/team-card/...`,
  `/season-recap/...`, `/coach/...`, `/recap/...`); visit `/share/<seeded token>` and assert
  the `<meta name="robots">` includes `noindex`. The seed already includes an opted-in org
  (from 0033) and the share-token rows the existing e2e specs use — no new seed work needed.
  Skip when E2E creds are unset, per convention. Note: `sitemap.xml` is server-rendered so
  asserting its content via `page.goto('/sitemap.xml')` + `page.content()` works without
  `page.route` (LESSONS#0009 caveat does not apply — we WANT the real server output here).
- `src/lib/supabase/middleware.ts` — confirm `/sitemap.xml` is reachable without auth (it is —
  `/` is already public; `sitemap.xml` lives at the root). No middleware change should be
  needed; verify and call it out in the implementation log.
- New deps: no. Migration: no (reads existing tables only). Env vars: no (reuses
  `NEXT_PUBLIC_APP_URL`). AI prompt change: no. Tier feature key: no (this is an ungated
  acquisition surface; the per-org discovery opt-in already gates which orgs appear via the
  existing `settings.discoverable` flag from 0033, exactly as the directory itself does).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-26 — branch `feat/0038-public-surfaces-sitemap-and-structured-data` opened, status flipped to in-progress.
