---
id: 0011
title: Carry the coach's referral code through the parent portal's "share with your other coach" CTA
status: in-progress
priority: P1
area: growth
created: 2026-05-21
owner: product-groomer
---

## User story

As a volunteer coach whose parent just tapped "Share with your other coach" on their
kid's progress portal, I want the link that parent forwards to carry MY referral code, so
that when the next coach signs up off the back of my report, I actually get the referral
credit instead of the recruit landing on a generic homepage that traces back to no one.

## Why now (four lenses)

### Product Owner
The parent portal already has the most-used coach-acquisition surface we own: the
`ParentViralCTA` ("Share with your other coach") at the bottom of `/share/[token]`
(`src/components/share/parent-viral-cta.tsx`). But it shares a bare
`process.env.NEXT_PUBLIC_APP_URL` with no referral code attached — so every coach a parent
recruits arrives un-attributed, and the sharing coach gets nothing. Meanwhile ticket 0010
already built the entire referral machine: deterministic 6-char codes
(`makeReferralCode()` in `src/lib/referral-code.ts`), lazy generation + persistence in
`coaches.preferences.referral_code` (`/api/referrals`), and signup capture via
`/signup?ref=CODE` → `preferences.referred_by_code` (`/api/auth/setup`). The smallest
meaningful unit of value is to thread the coach's existing code through the existing CTA so
the link the parent forwards is `/signup?ref=CODE`. This adds zero new surface — it makes a
surface we already ship actually pay the coach who made it work.

### Stakeholder
This widens the moat at its weakest viral edge. Today *every* parent-facing share recruits
coaches anonymously: the report reflects beautifully on the coach but the platform can't
tell whose report drove the signup, and the coach has no compounding reason to keep sharing.
Wiring the code in turns the single highest-traffic share surface into an attributed
coach-acquisition channel — the parent loop and the coach-referral loop become the same
loop. It also strengthens the structured-artifact moat: the artifact a parent forwards is no
longer a dead-end advertisement, it's a tracked recruiting event. No new backend, no schema
change, no new tier gate — it reuses 0010's referral plumbing on a surface 0009 already made
worth sharing.

### User (the parent on Saturday morning — and the coach who finds out it worked)
The parent opens the same link they always had, sees their kid's report, and at the bottom
taps "Share with your other coach." The native share sheet opens with a link that quietly
carries the coach's code. The other coach taps it on their phone, lands on a signup that
already knows who sent them, and signs up in the normal flow. The sharing coach does nothing
extra — the credit accrues silently. On a flaky connection nothing breaks: if the code can't
be resolved for any reason the CTA still works and falls back to the plain app URL (a missing
code must never break the share button).

### Growth
This is the compounding lever the parent portal was always missing. The portal already
produces the "show me" screenshot (the weekly-star spotlight from 0009); this ticket makes
the *next* tap — the forward to another coach — a tracked, rewarded acquisition event. A
coach who can see their referral count tick up because a parent forwarded their report has a
concrete reason to generate more reports and share more often: the retention flywheel and the
acquisition flywheel turn each other. There's no new artifact to build; the leverage is in
connecting two things we already ship so the loop closes.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `GET /api/share/[token]` includes a `referralCode` field resolved from the share's creating coach (`share.coach_id` → `coaches.preferences.referral_code`), lazily generating + persisting the code with `makeReferralCode(coach.id)` (the same helper `/api/referrals` uses) when absent (vitest: seeded coach without a code returns a deterministic code AND the code is written back to `coaches.preferences`).
- [ ] `GET /api/share/[token]` for a coach who already has a `referral_code` returns that exact existing code unchanged (vitest: no overwrite of an existing code).
- [ ] The `referralCode` resolution failing (e.g. coach row missing) does NOT 500 the share route — the portal still returns its report data with `referralCode: null` (vitest: regression — share GET stays 200 when the code can't be resolved).
- [ ] `ParentViralCTA` builds its shared URL as `${APP_URL}/signup?ref=<referralCode>` when a code is present, and falls back to the plain `${APP_URL}` when the code is null/absent (component test asserts the constructed URL for both cases).
- [ ] Playwright: on a `/share/[token]` page whose coach has a referral code, the "Share with your other coach" control's resulting link (via `navigator.share` data or the clipboard-copy text — assert through whichever the component exposes for testing) contains `/signup?ref=` followed by the coach's code.
- [ ] Playwright: visiting `/signup?ref=CODE` and completing signup still records `referred_by_code` on the new coach (regression: the `/api/auth/setup` capture path is unchanged and still honored — reuse/extend the existing referral-capture e2e if one exists).
- [ ] COPPA/privacy regression: the `referralCode` added to the share response is coach-level only; the share GET response exposes no new player/minor field as part of this change (vitest asserts the response shape gains exactly `referralCode` and nothing player-scoped).

## Out of scope

- A new referral reward, payout, or leaderboard mechanic. This rides 0010's existing `referred_by_code` tracking; reward logic is a separate ticket.
- Adding the referral code to the parent-DIGEST email CTA (`src/app/api/cron/parent-digest/route.ts`). That's a distinct channel and a separate ticket; this one is scoped to the in-portal `ParentViralCTA`.
- Changing the CTA copy/voice or its placement on the portal. Thread the code through the existing button; leave the design alone.
- A per-share toggle to disable the referral code. v1 always carries the creating coach's code.
- Backfilling referral codes for all coaches in a migration. Codes are generated lazily on first share-GET (and already on first `/api/referrals` hit), exactly as 0010 established.
- A new analytics event or tracker. PostHog already exists; do not add new event types here.

## Engineering notes

- `src/app/api/share/[token]/route.ts` — after resolving `coach` (the route already selects `coaches.full_name, preferences` by `share.coach_id`), resolve the referral code from `coach.preferences.referral_code`; if absent, generate with `makeReferralCode(share.coach_id)` from `src/lib/referral-code.ts` and persist via `admin.from('coaches').update({ preferences: { ...prefs, referral_code: code } }).eq('id', share.coach_id)` — mirror the exact lazy-generate-and-persist pattern in `src/app/api/referrals/route.ts`. Add `reportData.referralCode = code ?? null`. Wrap the persistence in a try/catch so a write failure degrades to `referralCode: null` rather than 500-ing the public portal.
- `src/components/share/parent-viral-cta.tsx` — accept a new optional `referralCode?: string` prop. Build `appUrl` as `${base}/signup?ref=${referralCode}` when present, else the plain base (current behavior). Keep the `navigator.share` / clipboard fallback intact. The component is `'use client'`; no Supabase access from it (AGENTS.md rule 3) — the code arrives as a prop from the server-rendered page.
- `src/app/share/[token]/page.tsx` — destructure `referralCode` from the share data and pass it to `<ParentViralCTA coachName={coachName} teamName={team?.name} referralCode={referralCode} />` (currently called at ~line 1210 without it).
- Reuse `makeReferralCode` and the `referral_code` / `referred_by_code` conventions from 0010 verbatim — do NOT invent a second code format or storage location.
- `tests/` — `tests/share/referral-code.test.ts` (`.test.ts`, NOT `.spec.ts` — `vitest.config.ts` excludes `**/*.spec.ts`; LESSONS.md 2026-05-20) for the share-GET resolution + lazy-generate + no-overwrite + no-500 cases. A component test for the CTA URL construction (render `ParentViralCTA` directly, same approach as the existing `tests/components/*` render tests).
- `tests/e2e/share-flow.spec.ts` (the 0006-seeded share spec) — extend with the referral-link assertion on the portal; the seed already has a coach + share token, so seed (or assert generation of) a `referral_code` for that coach so the assertion's expected code is deterministic. The signup-capture regression can extend whatever e2e already covers `/signup?ref=`.
- New deps: no. Migration: no (`coaches.preferences` is jsonb and already holds `referral_code`). Env vars: no (`NEXT_PUBLIC_APP_URL` already used by the CTA). AI prompt change: no. Tier feature key: no — this is an ungated growth surface, same posture as 0010.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-21 — branch `feat/0011-referral-code-on-parent-portal-cta` opened; status → in-progress.
