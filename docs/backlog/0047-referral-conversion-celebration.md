---
id: 0047
title: Show the coach the moment their invited coach signed up, with a one-tap "invite the next one"
status: in-progress
priority: P1
area: growth
created: 2026-05-26
owner: product-groomer
---

## User story

As a volunteer coach who already tapped "invite your assistant coach" (0015) or dropped a
season-recap card (0017) in a group chat last week, I want the app to tell me the moment
the person I invited actually signed up — "Coach Maya you invited just joined" — and to
give me one tap to send another invite right then, so that the loop I started feels SEEN
instead of disappearing into the silence of a referral count I never check.

## Why now (four lenses)

### Product Owner
The referral graph is complete and attributed: every shipped invite surface (0015 assistant,
0017 season recap, 0010 team card, 0011 parent forward, 0019 parent self-signup, 0021
warm landing, 0022 reaction page, 0026 coach profile, 0027 game recap, 0029 observer
conversion, 0033 program directory) routes through `/signup?ref=CODE` and writes
`coaches.preferences.referred_by_code`. The inviting coach can see their `referralCount`
on the `/api/referrals` route, but NOTHING tells them WHEN a referral converts. The feedback
loop the inviter actually needs — "the person you sent the link to is now in here" — is
silent. The smallest meaningful unit of value is a tiny celebration card on `/home`,
fired ONLY at the moment a coach's `referralCount` advances since the last time they saw
the app, with one specific message ("Coach <first_name> joined from your invite") and one
button ("Invite another coach" — the existing 0015 share sheet). One new column on
`coaches` (`last_seen_referral_count INT NOT NULL DEFAULT 0`), one pure helper that diffs
current vs. seen, one card with one action that already exists. No new AI, no new public
surface, no new email cron.

### Stakeholder
This is the only viral-loop reinforcement surface the product has never built: the
referrer's FEEDBACK channel. Every viral surface today is one-way — the coach sends a
link, the link converts, the count ticks up, and the inviter is never told. Behavioral
research on referral loops is unambiguous: the inviter who sees their invite land sends
another one within 24 hours at multiples of the rate of an inviter who never gets a signal.
We have the count; we have not closed the loop. This widens the referral moat by turning
a silent attribution into a noticed conversion event, which is the kind of compounding
that costs us nothing on the model side and is structurally invisible to a forms app
competitor (they don't even have a referral graph to celebrate). It also creates the first
in-product surface where the inviting coach sees a SPECIFIC person who joined — a much
more motivating signal than a number on a settings page. No new tier, no new spend, no
new tracker (the data is already attributed).

### User (Tuesday evening, the coach opens the app to prep practice)
At the top of `/home`, one quiet card with an orange accent: "Coach Maya you invited last
week just joined SportsIQ." Below the line, one button: "Invite another coach." Tapping it
opens the same share sheet 0015 already built. If they ignore the card, it auto-dismisses
the moment they leave the home screen (the `last_seen_referral_count` advances on view).
If their last-seen count and their current count match (no new conversions since last
visit), the card is simply absent — no nag, no "you should invite someone" guilt copy. On
a flaky connection the read is best-effort; the card never blocks the home screen.

### Growth
This is the cheapest growth lever the product can build: the referral graph is already
working, the share surfaces are already shipped, and this card closes the only missing
piece of the loop. Concretely, every referral conversion today is an inviter who feels
nothing happened — a known cohort that re-invites at the lowest rate. By telling them
specifically WHO joined, we turn one referral into a chain. The "show me" moment is the
card itself, in front of a coach who is already in the product: they see "Maya joined"
and tap "invite the next." It is distinct from every shipped acquisition surface (those
acquire the SECOND coach; this re-fires the FIRST coach's behavior), and it has the
shortest path from build to measurable lift — every coach with `referralCount >= 1` is in
the eligible audience the moment this ships.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `04N_coaches_last_seen_referral_count.sql` adds exactly one column
  `coaches.last_seen_referral_count INT NOT NULL DEFAULT 0` and nothing else. The column
  carries NO new minor data — it's a per-coach UI bookmark. Pick the next free integer
  prefix AFTER 0046's `plans_type_check` widening and document the prefix in the
  Implementation log per LESSONS#0006. (vitest scans the migration's executable DDL —
  strip `--` comments per LESSONS#0088 — and asserts only the documented column is added;
  banned tokens `player`, `parent`, `observation`, `medical` are absent.)
- [ ] A pure helper `referralCelebrationFor({ currentCount, lastSeenCount, latestReferral
  }: { currentCount: number, lastSeenCount: number, latestReferral: { coach_first_name:
  string, joined_at: string } | null }): { show: boolean, message: string | null }` lives
  in `src/lib/referral-celebration-utils.ts`. Returns `{ show: false, message: null }` when
  `currentCount <= lastSeenCount` (no new conversions). Returns `{ show: true, message:
  "Coach <first_name> you invited just joined SportsIQ" }` when `currentCount > lastSeenCount
  && latestReferral !== null`. Returns `{ show: true, message: "Someone you invited just
  joined SportsIQ" }` (the anonymous-fallback) when `currentCount > lastSeenCount` but the
  latestReferral lookup returned null (defensive: a referral attribution race). (vitest:
  three matrix cases, plus a `currentCount < lastSeenCount` regression returning
  `{ show: false }`.)
- [ ] `GET /api/referrals` (existing — keep its existing shape byte-identical for sibling
  callers) gains a parallel `GET /api/referrals/celebration` (new) that returns
  `{ show, message, currentCount }` for the authed caller. The route resolves the caller
  via `createServerSupabase().auth.getUser()` → 401; resolves the caller's own referral
  code via `makeReferralCode` (lazy as today); counts `coaches` where `preferences ->>
  'referred_by_code' = caller_code`; reads `last_seen_referral_count` from the caller's
  own row; and fetches the most recent referred coach's first name via a scoped select
  on `coaches` ordered by `created_at DESC LIMIT 1` (NEVER returning the referred coach's
  id, email, or any non-first-name field). (vitest: 401 on missing auth; 200 with each
  matrix case; the response payload's keyset matches `Object.keys(payload).sort()`
  deep-equality with the four-key allow-list.)
- [ ] `POST /api/referrals/celebration/seen` (new) advances the caller's
  `last_seen_referral_count` to their current count, atomically. Auth via
  `createServerSupabase().auth.getUser()` → 401. The route NEVER trusts a client-supplied
  count value — it recomputes the current count server-side and writes that exact integer
  back. A re-POST is idempotent: the second call sees `last_seen_referral_count === currentCount`
  and writes the same value. (vitest: the route computes the count server-side; a forged
  `currentCount: 999` in the body is ignored; re-POST is idempotent.)
- [ ] The home screen renders the celebration card ONLY when `GET /api/referrals/celebration`
  returns `show: true`. The card has one button labeled "Invite another coach" that opens
  the EXISTING 0015 invite share sheet (read `src/components/home/invite-coach-card.tsx`
  first — that surface is already in place). On view the card POSTs to
  `/api/referrals/celebration/seen` once so subsequent renders return `show: false` until
  the next conversion. (Playwright/component: an authed coach with `currentCount = 1,
  last_seen_referral_count = 0` sees the card; tapping anywhere on the home screen
  advances the seen-count; a re-render the same session sees no card.)
- [ ] Privacy / COPPA: the celebration message uses ONLY the referred coach's FIRST NAME —
  never email, full name, or any minor data; the referred coach's role/team/players are
  not referenced. The `last_seen_referral_count` column is on `coaches`, not on `players`,
  and the migration adds nothing to any minor-scoped table. (vitest: the message string
  contains only the first name; planted full-name / email / player-name tokens in the
  inviter's seeded data do NOT appear in the response payload; the migration DDL is
  scanned for banned tokens.)
- [ ] Voice contract: the celebration message string contains NO AGENTS.md banned word
  (`journey`, `amazing`, `exciting`, `elevate`, `empower`, `synergy`). Per LESSONS#0023
  the message template is constructed positively ("Coach X you invited just joined
  SportsIQ" — factual) and never enumerates the banned tokens verbatim. (vitest: the
  rendered message string is scanned and asserts no banned token appears.)
- [ ] Tier / privacy: NO new `feature_*` key. The celebration is universal across tiers —
  every coach who refers another coach is eligible (free coaches can refer too via 0015
  and 0021). Gating the celebration would invert the loop. The card's "Invite another
  coach" button DOES sit on the existing free-eligible invite surface; nothing changes
  about that gate. (vitest: a `free` and `coach` and `pro_coach` and `organization`-tier
  inviter all receive `show: true` when `currentCount > lastSeenCount`; the existing
  invite-share path is untouched.)
- [ ] Regression: the existing `GET /api/referrals` payload shape is byte-identical (the
  sibling 0015 / 0021 / 0029 surfaces read it). The new celebration route is purely
  additive. The 0015 invite-share path is untouched — the card just opens it. (vitest:
  the existing `/api/referrals` shape fixture passes; the 0015 share component is not
  modified.)

## Out of scope

- An email or push notification when a referral converts. v1 is in-app card only. A
  delivered notification would require a new sender / channel approval line (AGENTS.md).
- A referral leaderboard ("top 10 inviters this month") or social-feed surface. v1 shows
  the coach their OWN attribution only; cross-coach visibility is a separate ticket and a
  separate privacy discussion.
- A referral reward / free-month credit / billing change. v1 is a celebration only — the
  existing referral count is unchanged in meaning, and no Stripe-side credit is created.
  Awarding economic credit is a separate ticket that must touch billing (0001-0005's
  patterns).
- A retroactive celebration for past referrals. The first time this ships, every existing
  coach's `last_seen_referral_count` defaults to 0, so a coach with 3 prior conversions
  may see "Someone you invited just joined" once on first view (the anonymous-fallback
  path) — but only once, because the `seen` POST advances the bookmark immediately. v1
  ACCEPTS this one-time historical signal and treats it as a feature, not a bug: it tells
  long-standing referrers that the loop they ran a season ago is being noticed now.
- Multi-coach celebrations ("3 coaches you invited joined this week"). v1 is single-
  coach-at-a-time: when the count advances by 1, show one card; when it advances by N >= 2
  in the gap between two visits, show the most-recent referred coach's first name and
  fold the others into the seen-count silently. A "you got N this week" rollup is a
  future ticket.
- A "thank-you" message TO the referred coach. v1 is one-sided — the inviter's celebration
  only. A reciprocal warm-named landing for the new coach already exists (0021).
- A configurable celebration setting in `coaches.preferences` (opt-out, dismiss-for-a-week).
  v1 is a one-shot card that auto-dismisses on view. If coach feedback shows it's
  annoying, the next ticket adds a preference.
- Threading the conversion event into the weekly digest (0023) or the program pulse (0028).
  v1 is a home-screen card only.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- New migration `supabase/migrations/04N_coaches_last_seen_referral_count.sql` — adds the
  `last_seen_referral_count INT NOT NULL DEFAULT 0` column on `coaches`. Pick the next
  free prefix AFTER 0046's plans-type-check widening (LESSONS#0006). Document in the
  Implementation log. The migration adds nothing to `players` or any minor-scoped table.
- `src/types/database.ts` — extend the `Coach` row type with `last_seen_referral_count:
  number`.
- `src/lib/referral-celebration-utils.ts` (new) — pure helper:
  `referralCelebrationFor({ currentCount, lastSeenCount, latestReferral }): { show:
  boolean, message: string | null }`. NO database access; the routes do the IO.
- `src/app/api/referrals/celebration/route.ts` (new) — `GET(request)`. Auth → 401. Resolve
  the caller's referral code via the existing `makeReferralCode(user.id)` helper. Count
  `coaches` where `preferences->>'referred_by_code' = $code` via `createServiceSupabase()`.
  Read the caller's own `last_seen_referral_count`. Fetch the most-recent referred
  coach's `full_name` (split to first name) via a scoped select ORDER BY `created_at`
  DESC LIMIT 1. Pass into `referralCelebrationFor` and return its result plus the
  current count. Payload allow-list: `{ show, message, currentCount, latestFirstName |
  null }` (the first name optional because the anonymous-fallback may set it null). Strip
  every other key before returning.
- `src/app/api/referrals/celebration/seen/route.ts` (new) — `POST(request)`. Auth → 401.
  Recompute the current count server-side (NEVER trust a client-supplied value — same
  pattern as LESSONS#0039 for the drill-signal `coach_id`). Update
  `coaches.last_seen_referral_count = currentCount` for the caller. Return 204.
- `src/components/home/referral-celebration-card.tsx` (new) — client component. Uses
  `query()` against `/api/referrals/celebration` (AGENTS.md rule 3). When `show === true`,
  renders the message + an "Invite another coach" button that reuses the EXISTING
  `InviteCoachCard`'s share-sheet handler (read `src/components/home/invite-coach-card.tsx`
  first; either import the existing share-sheet hook/util or wrap the component). On view
  the card calls `mutate()` to POST `/api/referrals/celebration/seen` once via a
  `useEffect`-on-first-render hook. Dark zinc/orange, 44px targets, no banned words. The
  card auto-hides on the same page-load after the POST returns 204.
- `src/app/(dashboard)/home/page.tsx` (existing) — render `<ReferralCelebrationCard />`
  near the top of the home feed, but below any P0 banners (cancel banner, past-due banner
  — LESSONS#0045 documents these). The card renders nothing on `show: false`, so the
  home screen is byte-identical for coaches with no new conversions.
- `tests/lib/referral-celebration-utils.test.ts` (new, `.test.ts` NOT `.spec.ts` —
  LESSONS#0020/#38). Pure-helper cases: no-new (show:false), advanced-with-name (show:true,
  named message), advanced-without-name (show:true, anonymous fallback), regression
  (current<seen returns show:false).
- `tests/api/referrals-celebration.test.ts` (new) — GET 401 on missing auth; GET 200 with
  each matrix case; payload keyset deep-equality; the referred-coach name lookup is
  scoped to `preferences->>'referred_by_code' = $code` and never returns email or full
  name. Run `tsc --noEmit` after (LESSONS#0008). Run under Node 20.19.0 (LESSONS#0010).
- `tests/api/referrals-celebration-seen.test.ts` (new) — POST 401 on missing auth; a
  forged `currentCount: 999` in the body is ignored and the server-recomputed value
  written; re-POST is idempotent.
- `tests/migrations/coaches-last-seen-referral-count.test.ts` (new) — scan the migration's
  executable DDL (strip `--` comments per LESSONS#0088); assert the column allow-list
  matches exactly; banned-token absence.
- `tests/components/referral-celebration-card.test.tsx` (new) — render with mocked
  `query()` returning `show: true` + a first name → asserts the message and CTA render;
  mocked `show: false` → asserts the card renders nothing; on first render the component
  calls the seen-POST via `mutate()` (asserted via `mutate` mock invocation count).
- `tests/e2e/referral-celebration-flow.spec.ts` (new Playwright spec) against the
  0006-seeded Supabase. Seed: one inviter coach with `last_seen_referral_count = 0` + a
  second coach whose `preferences.referred_by_code` equals the inviter's deterministic
  `makeReferralCode(inviter_id)` value (LESSONS#0011 — the deterministic code is computed
  from the inviter's id, no separate referral table). The spec signs in as the inviter,
  visits `/home`, asserts the celebration card renders with the second coach's first
  name, scoped via a `data-testid` on the card container (LESSONS#0081). Skip when E2E
  creds are unset (convention).
- `src/lib/supabase/middleware.ts` — NO change. The new routes are dashboard-only / authed.
- New deps: NO. Migration: YES — one nullable INT column on `coaches`. Env vars: NO. AI
  prompt change: NO. Tier feature key: NO.
- LESSONS to anchor: #0006/#0009 (migration prefix uniqueness; coordinate with 0042/0043/
  0044/0045/0046). #0023 (the message string is positive; never enumerate banned tokens).
  #0011 (deterministic referral codes via `makeReferralCode(coach.id)`; the same code
  resolves for the same inviter — no new DB lookup table needed). #0039 (the route's
  `from()` reads on `coaches` may collide with sibling test mocks; if so, drain mock
  queues with `mockFromFn.mockReset()` in `beforeEach`). #0081 (data-testid scoping in
  Playwright). #0088 (strip `--` comments before scanning migration content).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-28 — branch `feat/0047-referral-conversion-celebration` opened; status flipped to `in-progress` in the ticket file AND `docs/backlog/README.md` index row.
- 2026-05-28 — picked migration prefix `050_` (next free after `049_plans_type_mid_season_team_newsletter.sql`); the new column lives ONLY on `coaches`, never `players`.
