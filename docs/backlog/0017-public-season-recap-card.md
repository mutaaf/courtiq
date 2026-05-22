---
id: 0017
title: Turn the end-of-season recap into a public card the coach is proud to send
status: in-progress
priority: P1
area: growth
created: 2026-05-22
owner: product-groomer
---

## User story

As a volunteer coach who just finished a 12-week season and generated my team's season
summary, I want a single public link I can drop into the team group chat and the league
coaches' chat that shows the season's story to anyone who taps it AND quietly carries my
referral code, so that the proudest thing I make all season is the same thing that signs
up the next coach and the next parent.

## Why now (four lenses)

### Product Owner
We already generate `season_summary` (`POST /api/ai/season-summary`), the single
highest-affect artifact in the product: a headline, an overall assessment, team
highlights, skill-progress arc, team challenges, and a warm closing message, validated by
`seasonSummarySchema` and saved as a `plans` row of `type='season_summary'`. Today it
renders only inside `/plans` — it dies in the coach's dashboard the moment the season
ends. We already proved the pattern that fixes this twice: the team-personality card
(ticket 0010) and the weekly-star spotlight (0009/0013) both took an existing artifact and
gave it a public, no-auth, referral-carrying surface. The smallest meaningful unit of value
here is the same move applied to the season recap: a public page at `/season-recap/[token]`
that renders one `season_summary` and ends in a "make your own — start free" CTA preloaded
with the sharing coach's referral code. We are wiring two existing systems (the season
artifact + the referral code), not inventing a third.

### Stakeholder
This is the deepest-affect entry into both viral loops at once. The end of a season is when
a coach has the strongest emotional reason to share and the strongest social proof to show
— a real, data-grounded story of a team that improved. It widens the structured-artifact
moat (a forms app cannot produce a season narrative) and the parent-portal/coach-referral
viral moat (the recap reaches every parent in the chat and every rival coach in the league
chat). It also makes the paid tiers visibly more worth it: a coach who can post a season
recap with their name on it has a reason to keep paying through the off-season instead of
churning the moment games stop.

### User (at 9pm on the last Saturday of the season, on the couch)
The coach taps "Share season recap" on a summary they already generated. The native share
sheet opens with a link and a line ("Our season with the Rockets — built with SportsIQ").
A parent taps it on their phone and sees a clean card with the season headline, the team's
growth story, and the closing message — no login wall, no app install. A rival coach taps
the same link from the league chat and sees one button: "Make your team's recap — free."
One tap to share, one tap to convert. The public page is server-rendered and fast on
cellular; there is no dashboard chrome and no auth.

### Growth
This is the season-end "show me" moment — the coach-and-parent analog of the weekly-star
screenshot, but with twelve weeks of payload behind it. The single image that makes another
coach say "wait, what is that?" is a team's season story with a real headline pulled from
their actual data, attributed to a coach they know. It compounds the existing referral loop:
instead of a naked `/signup?ref=CODE` link, the coach posts an artifact they *want* to post,
with the referral baked in. Retention angle: generating and sharing a season recap is the
ritual that closes the loop on a season and pulls the coach back to start the next one.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `POST /api/season-recap/create` with an authenticated coach and `{ planId }` for a `season_summary` plan they own returns `200 { token, url }` and persists a share record linking the token to that plan.
- [ ] `POST /api/season-recap/create` with no auth returns `401` and creates no token (no DB write).
- [ ] `POST /api/season-recap/create` with a `planId` that is not a `season_summary` plan, or not owned by the caller, returns `404` and creates no token (the lookup is scoped by `coach_id` AND `type` so another coach's plan is simply not found — no cross-coach leakage).
- [ ] `GET /api/season-recap/[token]` (public, no auth) returns the team-level recap fields, the team name, the creating coach's first name, and the creating coach's referral `code`; returns `404` for an unknown/inactive token.
- [ ] The public `GET` response is built from an explicit allow-list of team-level fields (`headline`, `season_period`, `overall_assessment`, `team_highlights`, `skill_progress`, `team_challenges`, `coaching_insights`, `next_season_priorities`, `closing_message`) and MUST NOT include `player_breakthroughs` or any per-player name (vitest seeds a plan whose `content_structured` contains `player_breakthroughs` and asserts no player name appears in the response — COPPA / data-minimization).
- [ ] The public response includes the referrer's referral code resolved from `coaches.preferences.referral_code`, lazily generated and persisted with the shared `makeReferralCode` helper (`src/lib/referral-code.ts`) when absent — so the page CTA can deep-link to `/signup?ref=CODE`.
- [ ] Playwright: visiting `/season-recap/[token]` unauthenticated renders the season headline, the closing message, and a visible "start free" CTA whose href contains `/signup?ref=` followed by the referrer's code.
- [ ] Playwright: the public recap page renders with NO dashboard chrome and requires NO login (it is in `publicPaths` in `src/lib/supabase/middleware.ts`).
- [ ] The recap page exposes `generateMetadata` OG title/description so a pasted link shows a rich preview (assert `<meta property="og:title">` includes the season headline or team name).
- [ ] Regression: the existing `/signup?ref=CODE` capture still records `referred_by_code` on the new coach (the `/api/auth/setup` path is unchanged and still honored).

## Out of scope

- Generating the `season_summary` artifact — that route exists and is unchanged.
- Making the `season_awards` or `season_letter` artifacts publicly shareable. Both reference
  players by name (`awards[].player_name`, the per-player letter) and are NOT a fit for a
  public, COPPA-safe card. This ticket is scoped to `season_summary` only; an awards/letter
  surface, if ever built, would need a different privacy model and is a separate ticket.
- A custom-designed OG image renderer. A text `generateMetadata` preview (mirroring the
  team-card title/description preview from ticket 0010) is the v1; do not build a per-artifact
  image templating system. An `opengraph-image.tsx` mirroring `share`/`team-card` may be added
  if a dev finds it trivial, but it is not required to satisfy the ACs.
- Editing the recap before sharing. Share what was generated; an editor is future scope.
- A new referral reward or payout mechanic. This rides the existing `referred_by_code`
  tracking; reward logic is not in scope.
- Any per-minor data on the public card. Only the team-level fields in the allow-list above
  are rendered; `player_breakthroughs` and every per-player field are stripped server-side.
- A new analytics SDK or tracker. (PostHog already exists; do not add new event types here.)

## Engineering notes

- New public page: `src/app/season-recap/[token]/page.tsx` (server component, dark zinc-950 +
  orange #F97316 — this is a coach-facing brag surface, NOT the gray/orange parent portal).
  Add `/season-recap/` and `/api/season-recap/` to `publicPaths` in
  `src/lib/supabase/middleware.ts` (the array already lists `/team-card/` and `/api/team-card/`
  added by ticket 0010 — follow that exact shape).
- `src/app/api/season-recap/create/route.ts` (new) — `POST`. Mirror
  `src/app/api/team-card/create/route.ts` almost verbatim: auth via
  `createServerSupabase().auth.getUser()` → 401; then `createServiceSupabase()`; verify the
  `planId` is a `plans` row of `type='season_summary'` scoped by `.eq('coach_id', user.id)`
  (so a non-owner / non-summary plan is a 404); generate a token with
  `randomBytes(16).toString('hex')`; insert into the new share-mapping table.
- `src/app/api/season-recap/[token]/route.ts` (new) — public `GET` (no auth),
  `createServiceSupabase()`. Mirror `src/app/api/team-card/[token]/route.ts`: resolve token →
  `season_summary` plan → team name → creating coach. Use an explicit `PUBLIC_RECAP_FIELDS`
  allow-list (same allow-list-not-deny-list pattern as `PUBLIC_PERSONALITY_FIELDS` in the
  team-card route) covering ONLY the team-level fields listed in the ACs. Resolve the coach's
  referral code via `makeReferralCode` from `src/lib/referral-code.ts` (already extracted by
  ticket 0010 and imported by `/api/team-card/[token]`), lazily generating + persisting it on
  `coaches.preferences.referral_code` when absent. Expose `coachFirstName` (first token of
  `full_name`) for attribution — never the full name, email, or contact info.
- Referral capture is already wired: `/signup?ref=CODE` → `referredByCode` → `/api/auth/setup`
  writes `preferences.referred_by_code`. No change to that path; the new CTA just links to
  `/signup?ref=<code>`.
- Migration: a new share-mapping table is needed (`parent_shares` is player-scoped;
  `team_card_shares` is personality-scoped). Add e.g. `season_recap_shares` (`token` unique,
  `plan_id`, `coach_id`, `is_active`, `created_at`) as a new numbered migration under
  `supabase/migrations/` with a UNIQUE version prefix and balanced insert column/value counts
  (LESSONS.md 2026-05-20: a fresh-CI-DB seed runs every migration under `ON_ERROR_STOP=1`).
  `plans_type_check` already allows `season_summary` (added by ticket 0009's migration `034`);
  confirm before assuming a constraint change is needed — it should NOT be. The public read goes
  through the dedicated route, so the new table likely does NOT need to be added to the
  `/api/data` allow-lists (mirror the team-card decision in ticket 0010). Add types to
  `src/types/database.ts` if the table is referenced through generated types.
- Tier: this is a growth/acquisition surface. Default UNGATED (no `feature_*` key, no
  `<UpgradeGate>`) — same product call as ticket 0010. Note that generating a `season_summary`
  already lives behind the coach-tier flow upstream, so the share surface inherits that without
  a second gate. If the dev wants to gate *creation* of the public card, push back through the
  ticket — default is open to maximize the loop.
- `tests/season-recap/create.test.ts` + a public-GET test (`.test.ts`, NOT `.spec.ts` —
  `vitest.config.ts` excludes `**/*.spec.ts`; LESSONS.md). The public-GET test must seed a
  `content_structured` containing `player_breakthroughs` and assert no player name leaks.
  Mirror the mock-Supabase shape used in `tests/team-card/*` if present, or the chainable
  in-memory mock used in `tests/api-routes.test.ts`.
- `tests/e2e/` — a Playwright spec for the public recap render + CTA href, run against the
  0006-seeded local Supabase. Seed a `season_summary` plan + a `season_recap_shares` row in
  `tests/e2e/fixtures/seed.sql` (the portal page is a server component — `page.route()` does
  NOT intercept its server fetch, so assertions must be seed-backed; LESSONS.md 2026-05-21).
- New deps: no. Migration: yes (one new share table, unique version prefix). Env vars: no.
  AI prompt change: no. Tier feature key: no.

## Implementation log

- 2026-05-22 [implementation-dev] Picked up 0017. Mirrors ticket 0010 (team-card)
  almost verbatim: a public, no-auth, referral-carrying surface for an existing
  `season_summary` artifact. Branch `feat/0017-season-recap-card`. Status →
  in-progress. Plan: new migration `036_season_recap_shares.sql` (UNIQUE version
  prefix — 035 is team_card_shares), `POST /api/season-recap/create`, public
  `GET /api/season-recap/[token]` with an explicit `PUBLIC_RECAP_FIELDS` allow-list
  (NO `player_breakthroughs` / per-player names — COPPA), public page
  `/season-recap/[token]` (server component, dark zinc-950 + orange),
  `/season-recap/` + `/api/season-recap/` added to `publicPaths`, `generateMetadata`
  OG tags, and referral resolution via `makeReferralCode`. Confirmed
  `plans_type_check` already permits `season_summary` (migration 034) — no
  constraint change. `season_recap_shares` is read only via the dedicated route
  (not `/api/data`), mirroring the 0010 team-card decision — no generated type or
  `/api/data` allow-list entry needed.
