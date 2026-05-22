---
id: 0015
title: Give the coach a one-tap "invite your assistant coach" link that carries their referral code
status: groomed
priority: P1
area: growth
created: 2026-05-21
owner: product-groomer
---

## User story

As a volunteer coach who shares the team with an assistant or knows the coach of the
team down the hall, I want to send them a signup link from inside the app in one tap, so
that they land on a signup that already knows I sent them — and I get the referral credit
— instead of me telling them "yeah it's called SportsIQ, just google it" and the trail
going cold.

## Why now (four lenses)

### Product Owner
The referral machine is built and proven on two surfaces: the Team Personality card
(ticket 0010) and the parent portal's "share with your other coach" CTA (ticket 0011).
Both reuse `makeReferralCode()` (`src/lib/referral-code.ts`), store the code in
`coaches.preferences.referral_code`, and capture signups via `/signup?ref=CODE` →
`coaches.preferences.referred_by_code` (`/api/auth/setup`). The one surface we *don't*
have is the most direct one: a coach inviting another coach they already know, from
inside the app, without routing through a parent. The smallest meaningful unit of value
is a single "Invite your assistant coach" control on a surface the coach already visits
(home dashboard or settings) that opens the native share sheet with
`/signup?ref=<their code>`. It reuses the exact `/api/referrals` GET that already returns
`{ code, referralCount }` — no new endpoint, no new code format, no new storage.

### Stakeholder
This widens the moat at the most direct acquisition edge we own. The parent loop (0011)
is high-traffic but indirect — it depends on a parent choosing to forward. The
coach-to-coach direct invite is lower-traffic but far higher-intent: a coach who taps
"invite my assistant" is recruiting a specific person who already trusts them, which is
the highest-converting acquisition there is. Wiring it makes the referral system a
*complete* attributed graph — parent-forwarded, card-forwarded, and directly-invited
coaches all trace to a code. It strengthens the same flywheel without inventing a reward
mechanic: the same `referralCount` the coach already sees ticks up. No new backend, no
schema change, no new tier gate.

### User (the coach, in the parking lot after practice, talking to their assistant)
The coach pulls up the app, taps "Invite your assistant coach," and the phone's share
sheet opens with a ready-to-send link and a short line of text. They send it over text
right there. The assistant taps it that evening, lands on a signup that already shows
"invited by [coach]" context (via the existing `ref` capture), and signs up in the normal
flow. The inviting coach did one tap. If the share sheet isn't available (desktop), it
falls back to copy-to-clipboard. If the code can't be resolved for any reason, the
control still works and falls back to the bare app URL — a missing code never breaks the
invite.

### Growth
This is the cleanest acquisition surface in the app: high-intent, one tap, attributed.
Every team has at least one other adult — an assistant coach, a co-parent who helps, the
coach of the sibling's team — and that person is the single likeliest next user. The
"show me" moment is the share sheet itself: a coach sees how easy it is to bring someone
in and does it in the moment. Because it reuses the same `referralCount` the coach
already watches, an invite that converts is visibly *theirs* — which is exactly the
feedback loop that makes a coach invite the next person too. Pure acquisition, riding
plumbing we already ship.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] The invite control builds its shared URL as `${APP_URL}/signup?ref=<code>` where `<code>` is the coach's referral code fetched from the existing `GET /api/referrals`, and falls back to the plain `${APP_URL}` when the code is null/absent (component test asserts the constructed URL for both the code-present and code-null cases).
- [ ] `GET /api/referrals` continues to lazily generate + persist the code via `makeReferralCode(user.id)` when absent and return the existing code unchanged when present (vitest: regression — the route's existing contract is unchanged; the new surface adds no new endpoint).
- [ ] `GET /api/referrals` with no auth returns `401` (vitest: regression that the invite surface relies on the same auth boundary).
- [ ] The invite control exposes the exact URL it forwards via a stable `data-share-url` attribute on the trigger (because `navigator.share`/clipboard render no `<a href>`; LESSONS.md 2026-05-21) so both the component test and the Playwright spec can assert it.
- [ ] Playwright: an authenticated coach sees the "Invite your assistant coach" control on its host surface, and the control's `data-share-url` contains `/signup?ref=` followed by the seeded coach's deterministic code.
- [ ] Playwright: visiting `/signup?ref=CODE` and completing signup still records `referred_by_code` on the new coach (regression: the `/api/auth/setup` capture path is unchanged — reuse/extend the existing referral-capture e2e).
- [ ] COPPA/privacy regression: the invite surface and its link expose no player/minor data — the only data leaving the app is the coach-level referral code and the app URL (assert the constructed URL contains no player identifiers).

## Out of scope

- A new referral reward, payout, or leaderboard. This rides 0010's `referred_by_code`
  tracking and the existing `referralCount`; reward logic is a separate ticket.
- An email-based invite that sends mail server-side. v1 uses the native share sheet /
  clipboard exactly like 0010 and 0011; no new mail send, no contacts access, no new env.
- Multi-coach team membership / seat provisioning. Inviting a coach is not the same as
  adding them to your team's roster of coaches (`multi_coach` is an org-tier feature).
  This ticket only sends a signup link; it does not auto-link the invitee to a team.
- A new referral code format or storage location. Reuse `makeReferralCode()` and
  `coaches.preferences.referral_code` verbatim (LESSONS.md re: 0010/0011 conventions).
- Changing `/api/referrals`' response shape. Consume what it already returns.
- Any new analytics event or tracker. PostHog already exists; do not add event types.

## Engineering notes

- Host surface: place the control where the coach already lands and where it won't
  collide with the home-dashboard merge hotspots noted in LESSONS.md (the lucide import
  list / top-of-component `useState` block / helper block in
  `src/app/(dashboard)/home/page.tsx` are recurring conflict zones). Prefer a settings
  surface (`src/app/(dashboard)/settings/...`) or a small standalone card component so the
  diff stays out of the home-page hotspot; if home is chosen, add the control in its own
  JSX region, not inside the contended import/state/helper blocks.
- New component `src/components/growth/invite-coach-button.tsx` (`'use client'`) — fetches
  the code with a TanStack `useQuery` hitting `GET /api/referrals` (or `query()` if it
  fits the allow-list); builds `${base}/signup?ref=<code>` with `NEXT_PUBLIC_APP_URL`,
  falling back to the bare base when the code is null. Mirror the `navigator.share` /
  clipboard fallback and the `data-share-url` testability hook from
  `src/components/share/parent-viral-cta.tsx` (0011) exactly. No Supabase access from the
  component (AGENTS.md rule 3) — the code arrives from the route.
- `src/app/api/referrals/route.ts` — no change expected. It already returns
  `{ code, referralCount, rewardEarned }` and lazily generates the code. Do not add a new
  endpoint; consume this one.
- Reuse `makeReferralCode` and the `referral_code` / `referred_by_code` conventions from
  0010/0011 verbatim — do NOT invent a second code format or storage location.
- `tests/components/invite-coach-button.test.tsx` (new) — render the component directly
  (same approach as `tests/components/parent-viral-cta.test.tsx`); mock the
  `/api/referrals` fetch to return a code and assert `data-share-url` =
  `…/signup?ref=<code>`; mock it to return a null/absent code and assert the fallback to
  the bare base. `.test.ts(x)`, NOT `.spec.ts`.
- A small vitest regression over `GET /api/referrals` (or reuse the existing referrals
  test if one exists) asserting lazy-generate-and-persist, no-overwrite, and 401-no-auth
  are unchanged.
- `tests/e2e/` — add an invite-control spec against the 0006-seeded local Supabase. The
  seeded coach lazily resolves to a deterministic code (e.g. `AAAAAA`, the same one
  `team-card-flow.spec.ts` / 0011 already assert), so no new seed row is needed — assert
  the control's `data-share-url` contains `/signup?ref=AAAAAA`. Extend the existing
  `/signup?ref=` capture e2e for the signup-attribution regression.
- New deps: no. Migration: no (`coaches.preferences` jsonb already holds `referral_code`).
  Env vars: no (`NEXT_PUBLIC_APP_URL` already used by the existing share CTAs). AI prompt
  change: no. Tier feature key: no — this is an ungated growth surface, same posture as
  0010 and 0011.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0015-...` opened
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
