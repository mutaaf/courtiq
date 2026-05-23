---
id: 0019
title: Let the parent who is also a coach start their own free team from the report they're reading
status: in-progress
priority: P2
area: growth
created: 2026-05-22
owner: product-groomer
---

## User story

As a parent reading my kid's progress report — and who also coaches my other kid's team —
I want to start my own free team right from the report I'm looking at, with one tap, so that
I don't have to remember the app name, find it later, and sign up cold; I become a coach in
the moment I'm most impressed by what coaching with this looks like.

## Why now (four lenses)

### Product Owner
The parent portal (`/share/[token]`) already carries one referral surface: the
`ParentViralCTA` (ticket 0011), a "Share with your other coach" button that forwards the app
to *someone else*. That captures the parent who knows a coach but isn't one. It does NOT
capture the much higher-value visitor: the parent who is themselves a coach, looking at a
polished report and thinking "I want this for my team." For that person, "forward this to a
coach" is the wrong verb — they want to *start*, not *refer*. The smallest meaningful unit of
value is a second, distinct CTA on the portal — a direct "Start your own team — free" path
that deep-links to signup carrying the same coach's referral code, framed by the report the
parent is already reading. This is one additional conversion path on our highest-traffic viral
surface, not a redesign.

### Stakeholder
Every conversion surface we have today funnels to either the bare app URL or a forward-to-a-
friend action. None of them turns a portal *viewer* directly into a *coach signup* in
context. This widens the parent-portal viral moat at its most leveraged point: the portal is
already the surface parents screenshot and forward, so adding a direct self-signup path is
free distribution we already paid for. It also strengthens the referral loop's economics —
the originating coach earns the referral credit whether the visitor forwards the app OR signs
up themselves, so we monetize both halves of the audience instead of one.

### User (Saturday morning, parent on the couch with the report open)
The parent has just scrolled their kid's report — the skill progress, the coach's note, maybe
a Player of the Week card. Below it, two clear choices, not one: "Share with your other coach"
(existing) and "Start your own team — free." Tapping the second goes straight to a signup that
already knows who referred them; they don't type a URL, don't search an app store, don't
forget by Monday. On a flaky connection the CTA is a plain server-rendered link (an `<a href>`,
not a JS share handler), so it works even if nothing else on the page loads.

### Growth
This is the conversion-rate ticket for the surface that already gets the most eyeballs. The
"show me" moment is the report itself — the parent is already looking at the artifact that
sells the product; we just give them a one-tap way to act on it. It compounds the existing
referral loop (same code, second verb) and turns passive portal traffic into measurable
coach signups. Distinct from ticket 0011: that one moves the parent to forward the app to a
*third party*; this one converts the parent *themselves*. Both can live on the portal at once.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `GET /api/share/[token]` already resolves the creating coach's referral code for the
      portal (ticket 0011); this ticket reuses that resolved code — assert the share payload
      still includes the coach's referral `code` and that a missing code is lazily generated via
      the shared `makeReferralCode` helper (regression-style check on the existing field).
- [ ] The portal page renders a NEW direct self-signup CTA distinct from the existing
      `ParentViralCTA` forward button: it is a real `<a href>` (not a JS share handler) whose
      href contains `/signup?ref=` followed by the creating coach's referral code (Playwright
      asserts the href by attribute — unlike the forward button, this CTA must be a plain link so
      it works without JS).
- [ ] When the share has no resolvable referral code, the self-signup CTA still renders and links
      to a bare `/signup` (a missing code never breaks the CTA — same defensive fallback as the
      forward button in ticket 0011).
- [ ] Playwright: a `/share/[token]` page renders BOTH the existing "Share with your other coach"
      forward control AND the new "Start your own team" self-signup link (the two CTAs coexist;
      the existing forward button is not removed or replaced).
- [ ] Privacy/COPPA: the self-signup CTA exposes only the referral code in its href — no player
      name, no parent contact, no token-derived PII is placed in the outbound `/signup` link
      (vitest/Playwright asserts the href contains only `ref=<code>` query data).
- [ ] Regression: the existing `/signup?ref=CODE` capture still records `referred_by_code` on the
      new coach (the `/api/auth/setup` path is unchanged), so a parent who self-signs-up via the
      new CTA is attributed to the originating coach.
- [ ] Regression: all existing portal sections (report card, skill challenge, starred
      observations, the spotlight card, the existing viral CTA) still render for a player who has
      them — the new CTA is additive.

## Out of scope

- Removing, replacing, or restyling the existing `ParentViralCTA` forward button (ticket 0011).
  This ticket ADDS a second CTA; it does not touch the first.
- A new referral reward or payout mechanic. This rides the existing `referred_by_code` tracking.
- A parent-account product. The CTA sends the parent to the standard coach `/signup` flow
  (age 13+, COPPA-compliant) — there is no new "parent role" and no minor account.
- Server-side tier gating. This is an ungated growth surface (the portal itself is already gated
  to Coach+ via `parent_sharing`; the CTA inherits that visibility without a second gate). No new
  `feature_*` key.
- A/B testing copy variants or a new analytics event. PostHog already exists; do not add new
  event types in this ticket. (If conversion measurement is wanted later, that's a separate
  ticket with an explicit tracker-approval line per AGENTS.md.)
- Any change to the OG image / link preview (ticket 0013 owns the spotlight preview).

## Engineering notes

- `src/app/share/[token]/page.tsx` — the server component already destructures the coach's
  referral code from the `GET /api/share/[token]` payload and passes it into `ParentViralCTA`
  (ticket 0011). Add a new self-signup CTA element near the existing viral CTA. Make it a plain
  server-rendered `<a href={`/signup?ref=${code}`}>` (fall back to `/signup` when no code) so it
  needs no client JS — this is deliberately a different primitive from the forward button, which
  uses `navigator.share`/`clipboard`. Match the existing light-mode gray/orange portal aesthetic;
  banned words apply (no "journey", "unlock", etc.).
- `src/components/share/parent-viral-cta.tsx` — do NOT modify. If a small shared presentational
  component is cleaner, add a sibling (e.g. `src/components/share/start-your-team-cta.tsx`) rather
  than overloading the forward button.
- `src/app/api/share/[token]/route.ts` — already resolves and returns the creating coach's
  referral code (ticket 0011). No change expected; if the code is not currently in the payload,
  confirm against the route and reuse the existing resolution (lazy `makeReferralCode` from
  `src/lib/referral-code.ts`) — do not duplicate the algorithm.
- Referral capture path is unchanged: `/signup?ref=CODE` → `referredByCode` → `/api/auth/setup`
  writes `preferences.referred_by_code`. The new CTA only constructs the link.
- COPPA / data minimization: the outbound href carries ONLY `ref=<code>`. Do not append the
  player name, the share token, or any contact data to the `/signup` URL.
- `tests/components/start-your-team-cta.test.tsx` (or extend the existing parent-CTA component
  test) — render the new CTA; assert the `href` contains `/signup?ref=<code>`, that it falls back
  to `/signup` with no code, and that it is a real link (`getByRole('link')`). Use `.test.tsx`.
- `tests/e2e/share-flow.spec.ts` (extend the 0006-seeded share spec) — assert both CTAs render and
  the self-signup link's href contains the seeded coach's referral code (the seeded coach reuses
  the deterministic referral code already present from ticket 0011's seed; the portal is a server
  component so assertions are seed-backed — LESSONS.md 2026-05-21).
- New deps: no. Migration: no. Env vars: no. AI prompt change: no. Tier feature key: no.

## Implementation log

- 2026-05-22 [implementation-dev] Started. Branch `feat/0019-parent-portal-coach-self-signup`,
  status → in-progress. Confirmed against the codebase: `GET /api/share/[token]` already
  resolves + returns `referralCode` (ticket 0011, `src/app/api/share/[token]/route.ts`), and
  `src/app/share/[token]/page.tsx` already destructures `referralCode` and passes it to
  `ParentViralCTA`. AC 1 (the referral-code resolution + lazy `makeReferralCode` regression) is
  already covered by `tests/share/referral-code.test.ts` — no route change needed. This ticket
  ADDS a second, sibling CTA only.
- Plan: new presentational server component `src/components/share/start-your-team-cta.tsx`
  rendering a plain `<a href={code ? `/signup?ref=${code}` : '/signup'}>` (no JS, no
  navigator.share — deliberately a different primitive from the forward button). Wire it into
  the portal next to `ParentViralCTA`, leaving the forward button untouched. Tests:
  `tests/components/start-your-team-cta.test.tsx` (`.test.tsx`, not `.spec.ts` — LESSONS#38),
  plus extend `tests/e2e/share-flow.spec.ts` so both CTAs coexist and the self-signup link's
  href carries the seeded code `AAAAAA`.
- 2026-05-22 [implementation-dev] Shipped. Added `src/components/share/start-your-team-cta.tsx`
  (a plain `<a href>`, no client JS) and wired it into `src/app/share/[token]/page.tsx` directly
  below `ParentViralCTA`, both fed the same resolved `referralCode`. The forward button is
  untouched (out-of-scope per the ticket). Light-mode gray/orange aesthetic; `py-3` button is a
  44px touch target; banned words avoided. Tests:
  `tests/components/start-your-team-cta.test.tsx` (real link, /signup?ref=<code>, bare-/signup
  fallback for null/empty, COPPA: only `ref` in the href) and three new `tests/e2e/share-flow`
  scenarios (self-signup href = `/signup?ref=AAAAAA`, both CTAs coexist, href has no
  player/token PII). Local gate: `npm run lint` 0 errors, `tsc --noEmit` clean, vitest
  4389 passed. The single vitest failure (`player-of-match-utils.test.ts` "Apr 27" vs "Apr 28")
  is the documented TZ artifact (LESSONS#36): the file is byte-identical to origin/main, the
  machine is America/Chicago (UTC-5), and CI runs UTC where it passes — NOT a regression, not
  weakened.
