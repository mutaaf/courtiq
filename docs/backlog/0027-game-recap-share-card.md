---
id: 0027
title: Turn the game recap into a public card the coach drops in the team group chat on the drive home
status: in-progress
priority: P1
area: parent-portal
created: 2026-05-23
owner: product-groomer
---

## User story

As a volunteer coach who just generated a recap after Saturday's game, I want one public
link I can paste into the team group chat — a clean card with the score story, a couple of
key moments, and a short coach message — so that every parent gets the same proud recap in
the chat they already read, instead of me retyping "good game today" twelve times.

## Why now (four lenses)

> Groom 2026-05-25: raised P2 → P1. With all the dependency-heavy billing / infra / referral
> work shipped, this is the next compounding lever: the highest-frequency, highest-reach viral
> surface in the product (game day recurs weekly in front of every family group chat), built
> entirely on public-card machinery that already exists. It outranks 0028 (program pulse, P2),
> which reaches only the org-tier director audience — the smallest segment — while this reaches
> every family of every coach who plays a game.

### Product Owner
We already generate a rich game recap (`/api/ai/game-recap`, `gameRecapSchema`: result
headline, intro, key moments, player highlights, team performance, coach message, looking
ahead). But today it only renders *inside the app, for the coach*. The moment a recap is
actually shared — the team group chat, on the drive home — has no artifact: the coach either
copies raw text or describes the game. The smallest meaningful unit of value is a public,
no-auth card at `/recap/[token]` the coach turns on with one tap, rendering the recap they
already generated as a forwardable page, with a "Follow your team — free" CTA carrying the
coach's referral code. No new generator, no new model spend — it gives the existing recap a
shareable home, exactly like `/team-card` gave the team-personality plan one and
`/season-recap` gave the season summary one.

### Stakeholder
This widens the viral-loop moat at the highest-frequency moment in youth sports: game day,
which recurs every week, in front of the entire family group chat. The parent portal (0009/
0016) is per-player and per-coach-action; this is one card seen by *every* family at once, on
their own chat surface, with the coach's referral code attached. It compounds the structured-
artifact moat (the recap is already a defensible AI artifact a forms app can't produce) by
making that artifact the thing that travels — a recap a parent forwards to a friend in
another league is pure organic acquisition. It reuses the public-card machinery wholesale
(token table + `/create` + `/[token]` + `publicPaths` + COPPA allow-list + lazy referral
code), so the moat deepens without new plumbing.

### User (Saturday, in the car after the game, phone in one hand)
The coach taps "Share this recap" on the recap they just made, gets one link plus a paste
line ("Saturday's recap — {team}"), and drops it in the team chat before pulling out of the
lot. Parents tap it and see a clean card: the score story, a couple of moments, and the
coach's message — no login, no app wall. On a flaky parking-lot connection it's a plain
server-rendered page that opens on one bar. The coach said something specific to all twelve
families in ten seconds, which is exactly the promise the product makes.

### Growth
This is the weekly, high-frequency viral surface the product is missing. Game day comes
every week and the recap card lands in front of every family — the highest-reach, most-
recurring share moment we have, each one carrying the coach's referral code. The "show me"
moment is a parent in the chat seeing a real recap card and asking "did the COACH make that?"
— and a parent who also coaches another team forwarding it to their own group. It pulls the
coach back every game day (a recurring reason to open the app) AND it is the most-forwarded
artifact we can ship, because a game recap is the thing families actually want to keep.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `POST /api/recap-card/create` with an authenticated coach and `{ planId }` (a `game_recap` plan the caller owns) returns `200 { token, url }` where `url` ends in `/recap/<token>`, and persists a row in the new `game_recap_shares` token table scoped by `coach_id` AND plan `type='game_recap'` so another coach's plan or a non-recap plan simply isn't found (vitest mirrors `src/app/api/team-card/create/route.ts`).
- [ ] `POST /api/recap-card/create` with no auth returns `401` and writes no row; a `planId` the caller does not own (or that is not a `game_recap`) returns `404` and writes no row (vitest asserts cross-coach/wrong-type lookups fail without leaking).
- [ ] `GET /api/recap-card/[token]` (public, no auth, service-role) resolves the token to the recap plan and returns ONLY allow-listed recap fields: `title`, `result_headline`, `intro`, `key_moments`, `team_performance`, `coach_message`, `looking_ahead`, the team name, and the coach's lazily-generated `referral_code` — NOTHING outside the allow-list (vitest asserts the response keys are exactly the allow-list, mirroring `PUBLIC_PERSONALITY_FIELDS` in `src/app/api/team-card/[token]/route.ts`).
- [ ] Privacy/COPPA: `player_highlights` (which name individual minors) are EXCLUDED from the public payload by the allow-list — the public recap card shows team-level narrative only, no per-minor name or stat line; the allow-list is enforced server-side, not by the page (vitest asserts `player_highlights` and any player-scoped field never appear in the `[token]` response).
- [ ] `GET /api/recap-card/[token]` for an unknown/inactive token returns `404`/`410` (matching the existing card routes) and leaks no recap data (vitest).
- [ ] Playwright: visiting `/recap/<token>` unauthenticated renders the result headline, the intro, at least one key moment, and the coach message, plus a "Follow your team — free" CTA whose href contains `/signup?ref=<code>`, with NO dashboard chrome and NO login required (the page is in `publicPaths`).
- [ ] Playwright: a coach viewing a generated game recap in the app has a "Share this recap" control that surfaces the `/recap/<token>` link; the URL is exposed on a stable `data-share-url` attribute (LESSONS.md 2026-05-21 — share buttons render no `<a href>`).
- [ ] Regression: `/api/ai/game-recap` and the existing in-app recap rendering are unchanged — the recap is still generated the same way; this ticket only adds the public card on top of an existing recap (vitest/Playwright: the generator route's contract is untouched).

## Out of scope

- Changing the recap generator or `gameRecapSchema`. This ADDS a public surface for the recap
  that already exists; it does not modify `/api/ai/game-recap`, the prompt, or the schema.
- Putting individual player highlights / names / stat lines on the public card. Game recaps
  name minors; the public allow-list excludes `player_highlights` entirely. The per-player
  proud-moment surface is the existing parent portal (0009/0016), which is per-recipient and
  auth-scoped — not a public chat card.
- An OG / rich link preview image for the recap card. The team-card got its OG preview in a
  separate ticket (cf. 0013 for the spotlight); a recap-card OG image is a follow-on, not v1.
- Emailing or push-notifying the recap. v1 is ONE link the coach pastes into the chat they
  already use; a delivered recap would need an explicit channel-approval line per AGENTS.md.
- A new tier gate. Like the team-card (0010) and season-recap (0017) public surfaces, this is
  an ungated referral surface by product decision. Generating the recap itself already follows
  its existing tier rules; the public card on top is open. Push back through this ticket if the
  dev believes otherwise; default open.
- Persisting a new `plans.type`. The recap is already a `game_recap` plan; do NOT add a new
  type value or touch `plans_type_check` (LESSONS.md 2026-05-21 re: stale CHECK constraints).
- A new analytics SDK, tracker, or per-view counter. PostHog already exists; no new events.

## Engineering notes

- New migration `supabase/migrations/038_game_recap_shares.sql` (next free version after
  `037_coach_card_shares.sql` if 0026 ships first, else `037`; use a UNIQUE version prefix and
  balanced insert columns/values — LESSONS.md 2026-05-20). Define `game_recap_shares` modeled
  exactly on `036_season_recap_shares.sql`: `id`, `token` (unique), `plan_id` (FK to `plans`),
  `coach_id` (FK to `coaches`), `is_active boolean default true`, `created_at`. Add the type
  to `src/types/database.ts`.
- `src/app/api/recap-card/create/route.ts` (new) — `POST` (authenticated). Auth via
  `createServerSupabase().auth.getUser()` → 401; then `createServiceSupabase()`. Verify the
  `planId` is a `game_recap` plan owned by the caller (`.eq('coach_id', user.id)
  .eq('type', 'game_recap').single()` → 404 if not found, exactly like
  `src/app/api/team-card/create/route.ts` does for `team_personality`). Mint a token with
  `randomBytes(16).toString('hex')`, insert into `game_recap_shares`, return
  `{ token, url: /recap/${token} }`.
- `src/app/api/recap-card/[token]/route.ts` (new) — `GET` (public, no auth, service-role).
  Resolve token → plan → recap `content_structured`. Pick ONLY the allow-listed fields via an
  explicit constant (mirror `PUBLIC_PERSONALITY_FIELDS` in `team-card/[token]`): `title`,
  `result_headline`, `intro`, `key_moments`, `team_performance`, `coach_message`,
  `looking_ahead`. CRITICALLY exclude `player_highlights` (names minors). Add the team name and
  the coach's referral code via `makeReferralCode(coach_id)` from `src/lib/referral-code.ts`.
- `src/app/recap/[token]/page.tsx` (new) — public server component mirroring
  `src/app/season-recap/[token]/page.tsx`. Renders the headline/intro/key-moments/coach-
  message and a "Follow your team — free" CTA to `/signup?ref=<code>`. This is a family-facing
  card, but it sits in the coach-card family of public surfaces; follow the existing
  `/season-recap` aesthetic. No emoji-decorated headings; no banned words.
- `src/lib/supabase/middleware.ts` — add `'/recap/'` and `'/api/recap-card/'` to `publicPaths`
  (alongside `/season-recap/` and `/team-card/`). The `/api/recap-card/create` route is
  authenticated and must NOT be added to `publicPaths`.
- In-app share control — add a "Share this recap" action to the surface where a generated game
  recap is shown to the coach (find where `GameRecapResult` is rendered; the recap UI consumes
  `/api/ai/game-recap`). It POSTs `/api/recap-card/create` via the client `query()`/TanStack
  pattern (NOT direct Supabase — AGENTS.md rule 3) and exposes the link via
  copy/`navigator.share` with the URL on a stable `data-share-url` attribute (LESSONS.md
  2026-05-21).
- `tests/recap-card/create.test.ts` and `tests/recap-card/token.test.ts` (new, `.test.ts` NOT
  `.spec.ts`; LESSONS.md 2026-05-20). Mock the service Supabase (chainable in-memory, as in the
  team-card route tests): create → 401 no-auth / 200 token / cross-coach plan → 404 / wrong
  type → 404; token GET → allow-listed payload only / `player_highlights` ABSENT / unknown token
  → 404/410. The `[token]` GET reads `params` (a Promise) and create reads a JSON body — invoke
  each with its real signature (LESSONS.md 2026-05-21); run `tsc --noEmit` after the route
  tests. Run under Node 20.19.0 via PATH (LESSONS.md 2026-05-21).
- `tests/e2e/recap-card-flow.spec.ts` (new Playwright spec) against the 0006-seeded local
  Supabase. The page is a server component, so seed a `game_recap` plan + a `game_recap_shares`
  row (the server fetch won't be intercepted by `page.route()` — LESSONS.md 2026-05-21). Assert
  the public page renders the headline/coach-message and the `/signup?ref=` CTA, and that
  `player_highlights` content does NOT appear on the public page. Skip when E2E creds are unset.
  Seeding a `game_recap` plan must satisfy the `plans_type_check` constraint — confirm
  `game_recap` is already an allowed type (it is written by `/api/ai/game-recap`); if a fresh-DB
  seed rejects it, add a numbered migration aligning the CHECK (LESSONS.md 2026-05-21), do not
  weaken the seed.
- New deps: no. Migration: YES — `game_recap_shares`. Env vars: no (reuses
  `NEXT_PUBLIC_APP_URL`). AI prompt change: no (reuses the existing recap). Tier feature key:
  no (ungated growth surface).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-25 — branch `feat/0027-game-recap-share-card` opened; status → in-progress.
- 2026-05-25 — Mirrored the season-recap public-card family wholesale: migration
  `038_game_recap_shares.sql` (modeled on `036_season_recap_shares.sql`, unique
  version prefix, balanced columns/values); `GameRecapShare` type in
  `src/types/database.ts`; authed `POST /api/recap-card/create`; public service-role
  `GET /api/recap-card/[token]` with an explicit `PUBLIC_RECAP_FIELDS` allow-list
  (`title`, `result_headline`, `intro`, `key_moments`, `team_performance`,
  `coach_message`, `looking_ahead`) that EXCLUDES `player_highlights` (names minors);
  public server-component page `src/app/recap/[token]/page.tsx`; `'/recap/'` +
  `'/api/recap-card/'` added to `publicPaths` (NOT `/api/recap-card/create`).
- 2026-05-25 — In-app "Share this recap" control: a reusable client
  `RecapShareButton` (mirrors `CoachProfileShareButton`) embedded in the
  `GameRecapCard` on the session page; POSTs `/api/recap-card/create` and exposes
  the `/recap/<token>` link on a stable `data-share-url` attribute (LESSONS.md
  2026-05-21 — share buttons render no `<a href>`).
- 2026-05-25 — Tests: `tests/recap-card/create.test.ts`,
  `tests/recap-card/token.test.ts`, `tests/components/recap-share-button.test.tsx`,
  and `tests/e2e/recap-card-flow.spec.ts` (seeded `game_recap` plan +
  `game_recap_shares` row; `game_recap` is already allowed by `plans_type_check`
  via migration 034, so no CHECK migration needed).
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
