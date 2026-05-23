---
id: 0026
title: Give the coach a public, shareable coaching profile a parent or rival coach can land on
status: groomed
priority: P1
area: growth
created: 2026-05-23
owner: product-groomer
---

## User story

As a volunteer coach who has run a season's worth of practices and built up notes,
reports, and recaps inside SportsIQ, I want one public link that shows the kind of coach I
am — how long I've been coaching, how many practices I've logged, the sports and age groups
I run — so that when a parent asks "what app are you using?" or a coaching friend asks "is
that worth it?" I send a single link that shows the work instead of trying to describe it.

## Why now (four lenses)

### Product Owner
Every public surface we ship is scoped to a *thing the coach made about a team*: the
team-card (0010) shows one team's personality, the season-recap (0017) shows one season's
arc, the parent portal (0009/0013/0016) shows one player's report, and the org page (0024)
shows a whole program. None of them is scoped to the *coach as a person*. The one question a
coach is asked most — "what are you using, and are you any good with it?" — has no single
artifact that answers it. The smallest meaningful unit of value is a public, no-auth coach
profile at `/coach/[token]` the coach turns on with one tap: their display name and the
sports/age-groups they coach, plus a few honest, already-collected counts (weeks coaching,
practices logged, players observed), and a "Start coaching like this — free" CTA carrying
the coach's referral code. It is the coach's standing identity surface, generated entirely
from data they already produced, that turns "trust me, it's good" into a link.

### Stakeholder
This opens an acquisition channel none of the shipped surfaces reach: the coach's *own
credibility* as the unit of distribution, rather than a single team/season artifact. It
widens the referral-loop moat by giving the coach a surface that gets *more* compelling the
longer they use SportsIQ — weeks coaching and practices logged only go up — so the artifact
that earns referrals is itself a retention hook (a coach proud of their profile keeps
feeding it). It reuses the exact public-card machinery already built (token table + `/create`
route + `/[token]` route + `publicPaths` entry + COPPA allow-list field-picking + lazy
referral code via `makeReferralCode`), so it compounds the moat instead of inventing new
plumbing. And it lands the referral code on a surface a *rival coach* sees — the highest-
intent acquisition audience we have, distinct from the parent audience the portal reaches.

### User (Saturday after a game, a parent at the car asks "what are you using?")
The coach opens their profile from settings, taps "Share my coaching profile," and gets one
link plus a line they can paste: "Here's how I coach — {name} on SportsIQ." They drop it in
a text or the team chat. The other person taps it, lands on a clean card — the coach's name,
"Coaching basketball, U10 · 14 weeks · 31 practices logged," and a "Start free" button — no
login, no app install wall, no dashboard chrome. On a flaky connection it's a plain
server-rendered page, so it opens even when the parking-lot signal is one bar.

### Growth
This is the coach-as-referrer surface the product is missing. A coach who has a profile they
are quietly proud of has a reason to send it unprompted, and every send carries their
referral code to the one audience most likely to convert: another coach. The "show me"
moment is a coach seeing their own season summed up in one card and realizing they can just
send it — the thing that makes a rival coach say "wait, it tracks all that? send me that
link." It is distinct from every shipped surface: those move a team/season/player artifact;
this moves the coach's identity, and it strengthens the longer the coach stays.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `POST /api/coach-card/create` with an authenticated coach returns `200 { token, url }` where `url` ends in `/coach/<token>`, and persists a row in the new `coach_card_shares` token table keyed to the caller's `coaches.id` with `is_active: true` (vitest mirrors `src/app/api/team-card/create/route.ts`).
- [ ] `POST /api/coach-card/create` with no auth returns `401` and writes no row (vitest).
- [ ] `POST /api/coach-card/create` is idempotent-friendly: a second create for the same coach returns a usable active token (either reuses the existing active row or returns a fresh active one) without erroring (vitest asserts a second call still yields `200 { token }`).
- [ ] `GET /api/coach-card/[token]` (public, no auth) resolves the token to the coach and returns ONLY an allow-listed payload: `display_name`, `sports` (names), `age_groups`, and a small stats block (`weeks_coaching`, `practices_logged`, `players_observed`) plus the coach's lazily-generated `referral_code` — and NOTHING else (no email, no org internals, no player names, no observation text) (vitest asserts the response body keys are exactly the allow-list, mirroring the `PUBLIC_PERSONALITY_FIELDS` allow-list in `src/app/api/team-card/[token]/route.ts`).
- [ ] `GET /api/coach-card/[token]` for an unknown/inactive token returns `404`/`410` (matching the existing card routes) and leaks no coach data (vitest).
- [ ] Privacy/COPPA: the public payload contains NO per-minor data — counts are aggregate integers derived from existing rows, and no player name, jersey, or observation text is ever included; `coach_card_shares` adds no field on `players` or any minor-scoped table (vitest asserts the payload carries only aggregate counts + coach-level fields; the allow-list excludes everything player-scoped).
- [ ] Playwright: visiting `/coach/<token>` unauthenticated renders the coach's display name, the sport/age-group line, the stats block, and a "Start free" CTA whose href contains `/signup?ref=<code>` (the referral code from the create flow), with NO dashboard chrome and NO login required (the page is in `publicPaths`).
- [ ] Playwright: an authenticated coach has a "Share my coaching profile" control (e.g. in settings) that surfaces the profile link; the link's URL is exposed on a stable `data-share-url` attribute so it is assertable even though the share button renders no `<a href>` (LESSONS.md 2026-05-21).
- [ ] Regression: the existing `/team-card/[token]` and `/season-recap/[token]` public pages and their `/create` + `/[token]` routes are untouched and still render for the seeded fixtures (the new card reuses the pattern, does not modify the existing ones).

## Out of scope

- A vanity/custom-handle URL (e.g. `/coach/jordan`). v1 uses an opaque token like the
  existing `/team-card/[token]` and `/season-recap/[token]` surfaces; a claimed human-readable
  handle (with uniqueness + squatting concerns) is a separate ticket.
- Any win/loss record, ranking, leaderboard, or coach-vs-coach comparison. The card shows
  honest activity counts only — no competitive scoreboard, no "top coach" framing.
- Showing players, rosters, observation text, parent reports, or any per-kid content on the
  public card. The card is coach-level only; the field allow-list excludes everything
  player-scoped (COPPA / data-minimization).
- An AI-generated bio or blurb. v1 is factual fields + counts the coach already produced; no
  `callAI()` call and no model spend. If a generated coach-voice line is wanted later, that is
  a separate ticket.
- A new tier gate. Like the team-card (0010) and assistant-invite (0015) growth surfaces, this
  is an ungated referral surface by product decision — gate visibility on the coach having an
  account, not on a paid tier. If the dev believes it should be paid-gated, push back through
  this ticket; default is open to maximize the loop.
- Editing or moderating the public card content. v1 derives everything from existing data; the
  only coach control is turn-on / share (and the standard `is_active` toggle the other card
  tables already support).
- A new analytics SDK, tracker, or per-view counter. PostHog already exists; do not add new
  event types or a view-count column.

## Engineering notes

- New migration `supabase/migrations/037_coach_card_shares.sql` (next free version after
  `036_season_recap_shares.sql`; use a UNIQUE version prefix and balanced insert
  columns/values — LESSONS.md 2026-05-20 re: the 031 collisions). Define `coach_card_shares`
  modeled on `035_team_card_shares.sql` / `036_season_recap_shares.sql`: `id`, `token`
  (unique), `coach_id` (FK to `coaches`), `is_active boolean default true`, `created_at`.
  Add the type to `src/types/database.ts`. If the card route reads it via `query()`, add
  `coach_card_shares` to the allow-lists in `src/app/api/data/route.ts` and
  `src/app/api/data/mutate/route.ts` — but the public `[token]` GET should use
  `createServiceSupabase()` directly, like the existing card token routes, so the allow-list
  is only needed if the dashboard control reads the table via `query()`.
- `src/app/api/coach-card/create/route.ts` (new) — `POST` (authenticated). Auth via
  `createServerSupabase().auth.getUser()` → 401; then `createServiceSupabase()`. Mint a
  token with `randomBytes(16).toString('hex')` (same shape as `src/app/api/share/create` and
  `team-card/create`), insert into `coach_card_shares` for `user.id`, return
  `{ token, url: /coach/${token} }`. Reuse-or-create an active row so repeated calls are safe.
- `src/app/api/coach-card/[token]/route.ts` (new) — `GET` (public, no auth, service-role).
  Resolve token → `coach_id`; load the coach's `display_name`/`name` + the sports/age-groups
  they coach (derive from the coach's teams, NOT from a new field) + aggregate counts. Define
  an explicit allow-list constant (mirror `PUBLIC_PERSONALITY_FIELDS`) so the payload is an
  allow-list, not a deny-list — anything player-scoped is structurally excluded. Lazily
  generate the referral code with `makeReferralCode(coach_id)` from `src/lib/referral-code.ts`
  (same algorithm the other card routes use, so the code is deterministic and matches existing
  referral attribution). Counts: `weeks_coaching` from the coach's earliest activity to now;
  `practices_logged` from `sessions` of type practice; `players_observed` as a distinct count
  over the coach's `observations` — all aggregate integers, no per-row data exposed.
- `src/app/coach/[token]/page.tsx` (new) — public server component mirroring
  `src/app/team-card/[token]/page.tsx` and `src/app/season-recap/[token]/page.tsx`. Renders
  the name, sport/age-group line, the stats block, and a "Start free" CTA to
  `/signup?ref=<code>`. Dark zinc/orange aesthetic (the public coach surface follows the
  coach-side dark theme, like `/team-card`); no emoji-decorated headings; no banned words.
- `src/lib/supabase/middleware.ts` — add `'/coach/'` and `'/api/coach-card/'` to `publicPaths`
  (alongside `/team-card/` and `/season-recap/`) so the page + its public token GET render
  without auth. The `/api/coach-card/create` route is authenticated and must NOT be added.
- Dashboard control — add a "Share my coaching profile" action where the other share/referral
  controls live (e.g. `src/app/(dashboard)/settings/referrals` next to the 0024 staff-invite
  and the team-card/season-recap share controls). It POSTs `/api/coach-card/create` via the
  client `query()`/TanStack pattern (NOT direct Supabase — AGENTS.md rule 3) and exposes the
  link via copy/`navigator.share`, with the URL on a stable `data-share-url` attribute for
  testability (LESSONS.md 2026-05-21 — share buttons render no `<a href>`).
- `tests/coach-card/create.test.ts` and `tests/coach-card/token.test.ts` (new, `.test.ts` NOT
  `.spec.ts` — `vitest.config.ts` excludes `**/*.spec.ts`; LESSONS.md 2026-05-20). Mock the
  service Supabase (chainable in-memory, as in the team-card route tests): create → 401 no-auth
  / 200 token / second-call-still-200; token GET → allow-listed payload only / unknown token →
  404/410 / no player-scoped fields present. The `[token]` GET reads `params` (a Promise) and
  the create reads a JSON body — invoke each with the signature it actually declares (LESSONS.md
  2026-05-21 re: handler signatures); run `tsc --noEmit` after writing route tests. Run under
  Node 20.19.0 by prepending the pinned bin to PATH (LESSONS.md 2026-05-21).
- `tests/e2e/coach-card-flow.spec.ts` (new Playwright spec) against the 0006-seeded local
  Supabase. The page is a server component, so the token must resolve from a seeded
  `coach_card_shares` row + seeded coach/sessions/observations (mock `page.route()` won't
  intercept the server fetch — LESSONS.md 2026-05-21). Assert the public page renders the
  name/stats and the `/signup?ref=` CTA, and that an authenticated coach sees the share control
  exposing the link (skip when `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` are unset, per convention).
- New deps: no. Migration: YES — `037_coach_card_shares.sql`. Env vars: no (reuses
  `NEXT_PUBLIC_APP_URL`). AI prompt change: no. Tier feature key: no (ungated growth surface).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0026-...` opened
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
