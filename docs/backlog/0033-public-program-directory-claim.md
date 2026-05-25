---
id: 0033
title: Let a cold searcher find a program and claim the team they coach — free
status: groomed
priority: P1
area: growth
created: 2026-05-25
owner: product-groomer
---

## User story

As a volunteer coach who has never heard of SportsIQ but whose rec league already runs on it,
I want to find my program when I search its name, see the team I coach already listed, and tap
"Coach this team — free" to claim it and sign up, so that I land inside the exact team I run
instead of starting cold from a homepage and rebuilding a roster a director already entered.

## Why now (four lenses)

### Product Owner
Every acquisition surface we ship is *pushed by someone who already uses SportsIQ*: a coach
forwards a card (0010/0015/0017/0026), a parent forwards a report (0011/0019/0022), a helper
converts after using the observer link (0029), or a director broadcasts an org link the
recipient must be sent (0024). None of them reach the coach who is searching cold — who types
their league's name into a search bar and would convert in one tap if they found a page. The
org page already exists (`/org/[slug]`, `src/app/org/[slug]/page.tsx`) and already lists the
program's active teams (name, age group, season) — but it is reachable only if you already
know the slug, it carries no indexable directory above it, and a team listed on it has no
per-team "I coach this — claim it" path. The smallest meaningful unit of value is two thin
additions on top of infrastructure we already own: (1) a public, indexable program directory
at `/programs` listing the orgs that have opted into discovery, so a cold searcher can find a
program by name; and (2) a per-team "Coach this team — free" claim path on `/org/[slug]` that
deep-links a brand-new coach to `/signup?org=<slug>&team=<teamId>` so they sign up attached to
the program AND requesting the specific team they coach. No new artifact, no model spend — it
gives an existing surface the cold-inbound funnel and the per-team claim it is missing.

### Stakeholder
This opens the only acquisition channel structurally unreachable by every shipped loop: the
cold searcher who was never sent a link. It widens the org-tier wedge — a discoverable program
directory is compounding distribution (each org that opts in is a permanent inbound funnel for
its own coaches), and per-team claiming is the fastest path from "stranger" to "active coach
inside a paying org's program." It reuses the org slug + `/signup?org=<slug>` attachment built
in 0024 rather than inventing a new mechanism, so the moat compounds: the same org page that a
director broadcasts (0024) now also catches the coach who finds it on their own. And because
the directory and per-team claim are public, server-rendered, and indexable, they become a
durable SEO surface — the kind of distribution that gets cheaper over time, not more
expensive.

### User (the coach, Sunday night, "what's that app our league uses?")
They search their league's name. The program directory page surfaces it; they tap through to
the branded program page they half-recognize (the league name, the teams already there). Next
to "U10 Hawks" they see one orange button: "Coach this team — free." One tap, no slug to type,
no "which org?" prompt, no roster to rebuild — they sign up already attached to the program and
requesting the team they run. On a one-bar connection the directory and the claim button are
plain server-rendered links (real `<a href>`s, not JS share handlers), so they work even when
nothing else loads. If a director hasn't opted the org into discovery, it simply isn't listed —
no team or player data is ever exposed without that opt-in.

### Growth
This is the top-of-funnel surface the product has never had: inbound, not outbound. Every other
loop depends on an existing user choosing to send something; this catches the coach who comes
looking. The "show me" moment is a director realizing their program is *findable* — "wait, my
coaches can just look us up and join the right team?" — which is the thing that gets a director
to opt in and tell the league. It is distinct from every shipped surface: 0024 needs the
director to broadcast a link to a known recipient; this catches the unknown searcher and lands
them in the exact team they coach. Inbound discovery + one-tap per-team claim is the cheapest
acquisition we can build, and it strengthens the longer programs stay (more opted-in orgs = a
deeper directory).

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `GET /api/programs` (public, no auth) returns `200 { programs: [{ name, slug, teamCount, sport }] }` listing ONLY organizations that have explicitly opted into discovery (a `settings`-level `discoverable: true` flag), and excludes any org without the opt-in; the payload carries NO per-coach or per-minor data — only org name, slug, and aggregate counts (vitest: an opted-in org appears with its counts; a non-opted-in org is absent; the response body keys are exactly the allow-list).
- [ ] `GET /api/programs` for a project with zero opted-in orgs returns `200 { programs: [] }` (not an error) (vitest).
- [ ] `GET /api/org/[slug]` is extended so each team in the existing `teams` array carries a stable `id` usable for a claim deep-link, and the existing response shape for all other fields is unchanged — the org landing page continues to render teams + stats for an unauthenticated visitor exactly as today (vitest: the team objects include `id`; all previously-returned keys are still present — regression on the public org endpoint).
- [ ] Signing up via `/signup?org=<slug>&team=<teamId>` attaches the new coach to that organization (the existing 0024 `org` path) AND records the requested team so the coach lands associated with it: `/api/auth/setup` (or the org-scoped signup path) resolves the slug → org, sets `org_id`, and — when `team` is present and the team belongs to that org — associates the new coach with that team (e.g. a `team_coaches` row) ; an invalid/unknown `team` falls back to today's org-only attachment without erroring (vitest: a setup call with a valid `org` + `team` writes the matching `org_id` and the team association; an unknown `team` writes `org_id` only).
- [ ] `/signup?org=<slug>&team=<teamId>` where the `team` does NOT belong to the named org records NO team association — a coach cannot claim a team in an org they are signing into by passing a foreign `teamId` (vitest: a `team` from a different org is ignored server-side; only `org_id` is set).
- [ ] Privacy/COPPA: the program directory and the claim deep-link carry ONLY org name, slug, aggregate counts, and a `teamId` — no coach name, no player name, no jersey, no contact info, no observation text; opt-in is required for an org to appear at all (vitest asserts the `/api/programs` body and the claim URL contain only org-level/team-id data; Playwright asserts no player name renders on `/programs`).
- [ ] Playwright: visiting `/programs` unauthenticated renders the opted-in program(s) by name with a link to `/org/<slug>`, with NO dashboard chrome and NO login required (the page is added to `publicPaths`); a non-opted-in org does not appear.
- [ ] Playwright: on `/org/<slug>` unauthenticated, each listed team shows a "Coach this team — free" CTA whose href contains `/signup?org=<slug>&team=<teamId>` for the seeded org/team, with NO login required.
- [ ] The `/programs` page exposes basic indexability (a descriptive `generateMetadata` title/description and is not `noindex`) so a cold search can surface it; the existing per-org `/org/[slug]` metadata is unchanged (assert the `/programs` page sets an `og:title`/description naming the directory — mirroring the metadata pattern in `src/app/season-recap/[token]/page.tsx`).
- [ ] Regression: the existing per-coach `/signup?ref=CODE` referral capture and the 0024 `/signup?org=<slug>` org attachment are both untouched — `ref`, `org`, and the new `team` param are handled independently and any combination is non-conflicting (vitest: `ref` still writes `referred_by_code`; `org` alone still attaches `org_id`; `org`+`team` adds the association).

## Out of scope

- Auto-copying the team's existing roster or any player data into the new coach's view on
  signup beyond the team association itself. Claiming a team associates the coach with it; how
  much of the director-entered roster the coach then sees is governed by the existing team /
  membership permissions, NOT widened here. Do not copy player rows or expose minor data
  through the claim flow.
- A claim-approval / pending-request moderation flow (director must approve the claimer).
  v1 associates on signup via the validated `org`+`team` params; a director-side approval queue
  is a separate admin ticket.
- Listing every org by default. Discovery is OPT-IN per org (a `settings.discoverable` flag) —
  an org is invisible in the directory until a director turns it on, so no program is exposed
  without consent. Do not list orgs that have not opted in.
- A search box, ranking, or pagination on the directory. v1 is a plain server-rendered list of
  opted-in programs; search/ranking is a later ticket once the list is long enough to need it.
- Any win/loss record, leaderboard, or coach-vs-coach comparison on the directory or org page.
  Honest team-level info only, same product call as the org page (0024) and coach card (0026).
- A vanity per-team URL. The claim deep-link uses the opaque `teamId` already on the team row;
  human-readable team handles (with squatting concerns) are out of scope.
- A new tier gate on discovery or claiming. This is an acquisition surface; gate the
  director-side opt-in toggle on having an org (the same product call as 0024's invite control),
  not on a paid `feature_*` key. If the dev believes the opt-in should be paid-tier-gated, push
  back through this ticket; default is open to maximize the funnel.
- A new analytics SDK, tracker, or per-view counter. PostHog already exists; do not add new
  event types or a view-count column.
- Emailing or notifying the director when their program is found/claimed. v1 is the public
  directory + the claim path; a delivered notification would need an explicit channel-approval
  line per AGENTS.md.

## Engineering notes

- `src/app/api/programs/route.ts` (new) — `GET` (public, no auth, service-role via
  `createServiceSupabase()`). Select `organizations` where the opt-in flag is set
  (`settings ->> 'discoverable' = 'true'`, a `settings`-level boolean — do NOT add a column if
  a `settings` jsonb flag suffices; if a column is genuinely cleaner, use a new numbered
  migration with a unique version prefix and balanced insert columns/values per LESSONS.md
  2026-05-20). For each opted-in org return ONLY `{ name, slug, teamCount, sport }` (aggregate
  team count over active teams; sport derived from the org's teams/sport_config). Define the
  payload as an explicit allow-list constant (mirror `PUBLIC_PERSONALITY_FIELDS` in
  `src/app/api/team-card/[token]/route.ts`) so nothing per-coach/per-minor can leak. Empty list
  → `{ programs: [] }`.
- `src/app/programs/page.tsx` (new) — public server component listing the opted-in programs by
  name, each linking to `/org/<slug>`. Add `generateMetadata` with a directory-naming
  `og:title`/description (mirror `src/app/season-recap/[token]/page.tsx`), and do NOT mark it
  `noindex`. Dark zinc-950 + #F97316 orange (coach-facing discovery surface, like `/team-card`
  and `/org/[slug]`); no emoji-decorated headings; no banned words.
- `src/lib/supabase/middleware.ts` — add `'/programs'` and `'/api/programs'` to `publicPaths`
  (alongside `/org/` if present, and the `/team-card/`, `/season-recap/`, `/coach/` entries).
  Confirm `/org/[slug]` + `/api/org/[slug]` are already public (they are, per 0024) — leave them.
- `src/app/api/org/[slug]/route.ts` (existing) — the `teams` select already returns
  `id, name, age_group, season, sport_id` (so `id` is already present); confirm the page passes
  it through. If the page strips `id` before render, thread it so the per-team claim CTA can be
  built. Do NOT change any other field in the response shape (regression-protected by an AC).
- `src/app/org/[slug]/page.tsx` (existing) — under each listed team, add a "Coach this team —
  free" CTA as a real `<a href={`/signup?org=${slug}&team=${team.id}`}>` (a real link, directly
  assertable — unlike the `data-share-url` share buttons in LESSONS.md 2026-05-21). The page is
  already public and server-rendered; keep it auth-free and dark zinc/orange; no banned words.
- `src/app/api/auth/setup` (existing path) — 0024 already resolves the `org` slug → org and sets
  `org_id` on the new coach. Extend it to also read an optional `team` param: when present AND
  the team's `org_id` matches the resolved org, associate the new coach with that team (insert a
  `team_coaches` row with role `coach` — the `TeamCoach` type already exists:
  `{ team_id, coach_id, role }`). A `team` that does not belong to the resolved org (or is
  unknown) is IGNORED — `org_id` only. Keep the `ref` referral path
  (`referredByCode` → `preferences.referred_by_code`) and the bare `org` path entirely
  independent; all three params may co-occur. Verify team ownership server-side (read the team's
  `org_id` and compare) so a foreign `teamId` cannot be claimed.
- Director-side opt-in — add a "List my program in the directory" toggle where the 0024
  staff-invite control lives (e.g. `src/app/(dashboard)/settings/referrals` or the org admin
  surface). It writes the `settings.discoverable` flag via the client `query()`/`mutate()`
  pattern (NOT direct Supabase — AGENTS.md rule 3), gated on the coach having an org (no
  `feature_*` key, ungated by the same product call as 0024). Default OFF; the org is invisible
  until the director turns it on.
- `tests/programs/list.test.ts` (new, `.test.ts` NOT `.spec.ts` — `vitest.config.ts` excludes
  the spec glob; LESSONS.md 2026-05-20). Mock `createServiceSupabase` with opted-in and
  non-opted-in orgs; assert: opted-in appears with `{ name, slug, teamCount, sport }` only;
  non-opted-in absent; empty → `{ programs: [] }`; no per-coach/per-minor keys. The `GET` reads
  no params/body — invoke it with the signature it declares (LESSONS.md 2026-05-21 re: no-arg
  handlers); run `tsc --noEmit` after route tests, under Node 20.19.0 via PATH (LESSONS.md).
- `tests/auth/setup-team-claim.test.ts` (new) — extend the 0024 setup-org coverage: `org`+valid
  `team` writes `org_id` + the team association; `org`+foreign `team` writes `org_id` only;
  `ref`/`org`/`team` independent and non-conflicting.
- `tests/org/public-get.test.ts` (existing from 0024) — extend to assert the `teams` objects
  carry `id` and the rest of the shape is unchanged (regression).
- `tests/e2e/programs-directory.spec.ts` (new Playwright spec) against the 0006-seeded local
  Supabase. The directory + org pages are server components, so the data must come from the seed
  (mock `page.route()` won't intercept the server fetch — LESSONS.md 2026-05-21); the seed must
  include an org with `settings.discoverable = true` + active teams. Assert: `/programs` lists
  the opted-in org and not a non-opted-in one; `/org/<slug>` shows a per-team "Coach this team —
  free" CTA with `/signup?org=<slug>&team=<teamId>`; no player name renders. The seed/migration
  work is the dev's; this ticket only flags it (seed a `settings.discoverable` org and a team —
  remember a jsonb flag in raw SQL seed must be valid JSON, cf. LESSONS.md 2026-05-25 re: jsonb
  literals under `ON_ERROR_STOP=1`). Skip when E2E creds are unset, per convention.
- New deps: no. Migration: likely NO — use a `settings.discoverable` jsonb flag and the existing
  `team_coaches` table; only add a migration if a real column is genuinely cleaner, and then use
  a unique version prefix + balanced insert columns/values (LESSONS.md 2026-05-20). Env vars: no
  (reuses `NEXT_PUBLIC_APP_URL`). AI prompt change: no. Tier feature key: no (ungated acquisition
  surface; opt-in gated on having an org).

## Implementation log

(Appended by the implementation-dev agent during execution.)
