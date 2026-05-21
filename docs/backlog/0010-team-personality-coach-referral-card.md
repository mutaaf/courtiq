---
id: 0010
title: Make the Team Personality card a public, coach-to-coach referral surface
status: proposed
priority: P2
area: growth
created: 2026-05-21
owner: product-groomer
---

## User story

As a coach who just generated my team's "personality" card — "The Grinders 🔥, defense
first, never quit" — I want a public link I can drop into the coaches' group chat that
shows the card to anyone who taps it AND quietly carries my referral code, so that the
thing I'm proud to brag about is the same thing that signs up the next coach.

## Why now (four lenses)

### Product Owner
We already generate `team_personality` (`/api/ai/team-personality`), an artifact whose
own prompt instructs the AI to write "a punchy one-liner that would make coaches smile
and want to share it." It's saved as a `plans` row and shown only inside `/plans`. We
also already have a working referral system (`/api/referrals`, code stamped at signup via
`referredByCode` in `/api/auth/setup`). The two have never been connected: the referral
is a bare `/signup?ref=CODE` link with generic copy, and the most brag-worthy artifact has
no public surface. The smallest meaningful unit of value is a public, no-auth page at
`/team-card/[token]` that renders one `team_personality` card and ends in a "make your
own — start free" CTA pre-loaded with the sharing coach's referral code. We are joining
two existing systems, not inventing a third.

### Stakeholder
Every viral surface we have today aims at *parents* (the share portal, parent reactions,
the parent digest). Nothing aims at the *coach-to-coach* loop except a bare referral link
with no payload. Coaches are recruited by other coaches — a program director who runs 8
teams onboards all 8. A referral with a real, funny, specific artifact attached converts
a different and higher-value audience than the parent loop. This widens the moat at its
weakest viral edge and turns the dormant referral code into a channel with a reason to
click.

### User (at 8:30pm, scrolling the league coaches' WhatsApp)
The coach taps "Share team card" on a personality they already generated. The native
share sheet opens with a link and a line ("My team is The Grinders — made with SportsIQ").
A rival coach taps it on their phone, sees a clean dark card with the team type, tagline,
and a couple of traits — no login wall, no app install — and a single button: "Make your
team's card — free." One tap to a signup that already knows who referred them. The whole
thing is one tap to share and one tap to convert; the public page is server-rendered and
fast on cellular.

### Growth
This is the coach-acquisition "show me" moment, the coach-side analog of the parent
portal's weekly-star screenshot. The single image that makes another coach say "wait,
what is that?" is a team identity card with a real tagline pulled from their actual
season data. It compounds the existing referral reward loop: instead of asking coaches to
paste a naked link, we give them an artifact they *want* to post, with the referral baked
in. Retention angle too — generating and sharing a team identity is the kind of
end-of-week ritual that brings a coach back.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `POST /api/team-card/create` with an authenticated coach and a `{ planId }` for a `team_personality` plan they own returns `200 { token, url }` and persists a share record linking the token to that plan.
- [ ] `POST /api/team-card/create` with no auth returns `401` and creates no token.
- [ ] `POST /api/team-card/create` with a `planId` that is not a `team_personality` plan, or not owned by the caller, returns `403`/`404` and creates no token (no cross-coach leakage).
- [ ] `GET /api/team-card/[token]` (public, no auth) returns the plan's `content_structured` (team_type, tagline, traits, etc.), the team name, and the creating coach's referral `code` — and `404` for an unknown/inactive token.
- [ ] The public response includes the referrer's referral code resolved from the creating coach's `preferences.referral_code` (lazily generated the same way `/api/referrals` does if absent), so the page CTA can deep-link to `/signup?ref=CODE`.
- [ ] Playwright: visiting `/team-card/[token]` unauthenticated renders the team type, the tagline, at least one trait, and a visible "start free" CTA whose href contains `/signup?ref=` followed by the referrer's code.
- [ ] Playwright: the public card page renders with NO dashboard chrome and requires NO login (it must be in `publicPaths` in `src/lib/supabase/middleware.ts`).
- [ ] The card page exposes a `generateMetadata` OG title/description/image so a pasted link shows a rich preview (assert the `<meta property="og:title">` includes the team type).
- [ ] Regression: the existing `/signup?ref=CODE` capture still records `referred_by_code` on the new coach (the `/api/auth/setup` path is unchanged and still honored).

## Out of scope

- Generating the team_personality artifact (that route exists and is unchanged).
- A new referral reward or payout mechanic. This rides the existing `referred_by_code` tracking; reward logic is not in scope.
- Making EVERY artifact publicly shareable. This ticket is scoped to `team_personality` only; weekly-star/season-summary public cards are separate tickets if this one performs.
- A custom-designed OG image renderer per artifact. A single `opengraph-image.tsx` for the team card (text on the brand background, mirroring the existing `/share/[token]/opengraph-image.tsx` pattern) is the v1; do not build a templating system.
- Editing the personality before sharing. Share what was generated; an editor is future scope.
- Any PII about minors on the public card. The team_personality artifact is team-level and references players only by first name inside sample observations — the public card must render team-level fields only (team_type, tagline, description, traits, strengths, growth_areas, motto) and MUST NOT expose player names, rosters, or any per-minor data. (AGENTS.md COPPA / data-minimization rule.)
- A new analytics SDK or tracker. PostHog already exists; do not add new event types in this ticket.

## Engineering notes

- New public route page: `src/app/team-card/[token]/page.tsx` (server component, dark zinc-950 + orange aesthetic — this is a coach-facing surface, NOT the gray/orange parent portal). Add `/team-card` to `publicPaths` in `src/lib/supabase/middleware.ts` so it's reachable without auth.
- New OG image: `src/app/team-card/[token]/opengraph-image.tsx` — mirror `src/app/share/[token]/opengraph-image.tsx`.
- `src/app/api/team-card/create/route.ts` (new) — `POST`. Auth via `createServerSupabase().auth.getUser()`; then `createServiceSupabase()`. Verify the `planId` is a `plans` row of `type='team_personality'` owned by the caller (`coach_id = user.id`). Generate a token with `randomBytes(16).toString('hex')` (same pattern as `src/app/api/share/create/route.ts`). Persist the token→plan mapping (see migration note).
- `src/app/api/team-card/[token]/route.ts` (new) — public `GET` (no auth), `createServiceSupabase()`. Resolve token → plan → team name + creating coach. Resolve the coach's referral code from `coaches.preferences.referral_code`, lazily generating + persisting it with the SAME deterministic algorithm as `src/app/api/referrals/route.ts` (`makeReferralCode`) if missing — consider extracting that helper so both routes share it rather than duplicating.
- Referral capture is already wired: `/signup?ref=CODE` → `referredByCode` → `/api/auth/setup` writes `preferences.referred_by_code` (confirmed). No change to that path; the new CTA just links to `/signup?ref=<code>`.
- COPPA: render ONLY team-level fields from `team_personality.content_structured` (`team_type`, `type_emoji`, `tagline`, `description`, `traits`, `strengths`, `growth_areas`, `coaching_tips`, `team_motto`). Do NOT render `sampleObservations` or any player-identifying data on the public page.
- Migration: a small share-mapping table is needed (e.g. `team_card_shares` with `token`, `plan_id`, `coach_id`, `is_active`, `created_at`) since `parent_shares` is player-scoped and not a fit. New numbered migration under `supabase/migrations/` with a UNIQUE version prefix (LESSONS.md 2026-05-20: balanced columns/values, no duplicate version prefix). Add the table to the allow-lists in `src/app/api/data/route.ts` and `src/app/api/data/mutate/route.ts` only if client reads are needed (the public read goes through the dedicated route, so this may be unnecessary). Add types to `src/types/database.ts`.
- Tier: this is a growth/acquisition surface, not a gated feature — do NOT add a `feature_*` key. (Optional product call: gate *creation* of a public card behind a paid tier later; for v1 keep it open to maximize the loop. If the dev wants a gate, push back through the ticket — default is ungated.)
- `tests/` — `tests/team-card/create.test.ts` + a public-GET test (`.test.ts`, not `.spec.ts`; LESSONS.md). `tests/e2e/` — a Playwright spec for the public card render + CTA href, run against the 0006-seeded Supabase (seed a `team_personality` plan + a team-card share row, or have the create route exercised in the spec).
- New deps: no. Migration: yes (one new table, unique version prefix). Env vars: no. AI prompt change: no. Tier feature key: no.

## Implementation log

(Appended by the implementation-dev agent during execution.)
