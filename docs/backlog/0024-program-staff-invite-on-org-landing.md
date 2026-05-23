---
id: 0024
title: Let a program director bring their whole coaching staff onto SportsIQ from the org page
status: in-progress
priority: P1
area: growth
created: 2026-05-23
owner: product-groomer
---

## User story

As a program director who runs the rec league and just put my organization's page on
SportsIQ, I want one link I can drop into the coaches' staff group chat that signs my
coaches straight into MY program — not into their own disconnected free teams — so that
onboarding twelve volunteer coaches takes one message instead of twelve separate sign-ups
I have to chase down.

## Why now (four lenses)

### Product Owner
Every coach-acquisition loop we have is one-to-one and personal-referral-shaped: the
team-card (0010), the assistant-coach invite (0015), the season recap (0017), the
parent-portal self-signup (0019), and the warm-named signup (0021) all funnel a single
person to `/signup?ref=CODE` carrying ONE coach's referral code. None of them serve the
highest-leverage acquirer in youth sports: the program director who can onboard an entire
staff at once. The org landing page already exists (`/org/[slug]`,
`src/app/org/[slug]/page.tsx`), it already lists the program's teams and stats, and it
already has a "Coach at {org}?" CTA — but that CTA links to `/signup?org=<slug>` with no
way for the director to generate and broadcast it deliberately, and no in-app surface for
the director to grab the link. The smallest meaningful unit of value is a "Bring your
coaching staff" action the director can use to copy/share a single org-scoped invite link,
plus making the `/signup?org=<slug>` path attach the new coach to that organization on
signup. One link, one message, the whole staff lands in the right program.

### Stakeholder
This opens the org-tier acquisition wedge that the per-coach loops structurally cannot
reach. A program director who onboards 12 coaches is the path to the Organization tier
($49.99) — multi-coach, admin panel, custom branding — which is the highest-value
conversion in the product. It widens the moat at its weakest edge: today our distribution
depends on individual coaches each forwarding a card; this makes the *organization* the
unit of acquisition, which is both higher-value and stickier (a coach who joins an org's
shared program has switching costs a solo coach doesn't). It reuses the org slug + branding
infrastructure already built for `/org/[slug]` rather than inventing a new mechanism, so
the moat compounds.

### User (the director, Sunday night, staffing the season in the league WhatsApp)
The director opens their settings, taps "Bring your coaching staff," and gets one link with
a line they can paste: "Join our program on SportsIQ — {org name}." They drop it in the
staff chat. A volunteer coach taps it, lands on the program's branded page (their league's
name and colors, the teams already there), taps "Get started free," and signs up already
attached to the program — no slug to type, no "which org?" prompt, no orphaned solo team to
migrate later. On a flaky connection the invite is a plain server-rendered link, so it works
even when JS is shaky.

### Growth
This is the org-level acquisition multiplier: one director's single message converts a whole
staff, and every coach who lands sees a branded program page that is itself social proof
("my whole league is on this"). The "show me" moment is the director realizing they can
onboard their entire staff with one paste — the thing that makes a program director say
"wait, I can just send this once?" It is distinct from every shipped referral surface: those
move one person via one coach's personal code; this moves a whole staff into one shared
organization. Pure top-of-funnel leverage at the highest-value tier.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `GET /api/org/invite` with an authenticated coach whose `coaches.org_id` resolves to an org with a `slug` returns `200 { url }` where `url` is the program staff-invite link ending in `/org/<slug>?invite=staff` (or equivalent org-scoped param); a coach with no org slug returns `200 { url: null }` (graceful, not an error) (vitest).
- [ ] `GET /api/org/invite` with no auth returns `401` and performs no DB read (vitest).
- [ ] `GET /api/org/invite` returns ONLY the invite URL — no coach list, no player data, no email — so the response is `{ url }` and nothing more (vitest asserts the response body keys; privacy/data-minimization).
- [ ] The existing `GET /api/org/[slug]` public response is unchanged in shape for the existing fields; the org landing page continues to render teams + stats for an unauthenticated visitor (regression: the public org endpoint and page still work exactly as today).
- [ ] Signing up via `/signup?org=<slug>` attaches the new coach to that organization: `/api/auth/setup` (or the org-scoped signup path) resolves the slug to the org and sets the new coach's `org_id` to that org (vitest: a setup call carrying a valid `org` slug writes the matching `org_id`; an invalid/unknown slug falls back to today's default behavior without erroring).
- [ ] Privacy/COPPA: the invite link and the `/signup?org=<slug>` URL carry ONLY the org slug — no coach name, no player data, no contact info, no token-derived PII (vitest/Playwright asserts the outbound URL contains only the `org`/`invite` query data).
- [ ] Playwright: a director-tier coach has a "Bring your coaching staff" control (e.g. in settings) that exposes the org invite link whose href/share payload contains `/org/<slug>` for their seeded org; the control is absent (or shows a "create your program first" hint) for a coach with no org slug.
- [ ] Playwright: visiting `/org/<slug>?invite=staff` unauthenticated renders the existing branded program page and a "Get started free" CTA whose href contains `/signup?org=<slug>` (the org-scoped signup deep-link), with NO dashboard chrome and NO login required (the page is already in `publicPaths`).
- [ ] Regression: the existing per-coach `/signup?ref=CODE` referral capture is untouched — a signup carrying a `ref` code still records `referred_by_code`, and a signup carrying an `org` slug is a separate, additive path that does not break referral attribution (vitest: `ref` and `org` are handled independently; both can be present without conflict).

## Out of scope

- A new email/SMS invite sender or per-coach invite tokens. v1 is ONE shareable org-scoped
  link the director broadcasts themselves (mirrors how the assistant-coach invite, ticket
  0015, hands the coach a link to share rather than sending mail). No new sender, no tracker,
  no per-recipient token table.
- Auto-approving or auto-assigning the joined coach to specific teams. Signing up via the org
  link attaches the coach to the ORGANIZATION; team assignment stays a separate, existing
  admin action. Do not build a team-picker into signup here.
- Changing the org tier on signup. The director's org tier is governed by billing; this
  ticket adds coaches to an org, it does not upgrade the org or touch Stripe.
- A coach-approval / pending-invite moderation flow. v1 attaches on signup via the slug;
  if a director wants to gate who joins, that is a separate admin ticket.
- Redesigning the `/org/[slug]` page. This ADDS the deliberate director-side invite surface
  and wires the org-scoped signup attachment; the public page's existing layout is reused.
- A new referral reward/payout for org invites. This rides org attachment, not the
  `referred_by_code` reward mechanic.
- Any per-minor data on the invite link or the public org page beyond the team-level
  counts the page already shows.

## Engineering notes

- `src/app/api/org/invite/route.ts` (new) — `GET` (authenticated). Auth via
  `createServerSupabase().auth.getUser()` → 401; then `createServiceSupabase()`. Resolve the
  caller's `coaches.org_id`, look up the org's `slug` from `organizations`, and return
  `{ url: ${appUrl}/org/${slug}?invite=staff }` (or `{ url: null }` if the coach has no org or
  the org has no slug). Return ONLY `{ url }`. Use `process.env.NEXT_PUBLIC_APP_URL` for the
  base (same as `src/app/org/[slug]/page.tsx`'s `getOrgData`). If middleware gates `/api/*`,
  this route is authenticated so it does NOT go in `publicPaths` (unlike `/api/org/[slug]`,
  which already is).
- `src/app/api/auth/setup` (existing path) — confirm how signup currently consumes the `org`
  query param. The org landing CTA ALREADY links to `/signup?org=<slug>`
  (`src/app/org/[slug]/page.tsx` line ~249), so the front-end already forwards it; verify the
  setup route resolves the slug → `organizations.id` and writes `org_id` on the new coach. If
  it does not yet honor `org`, add that resolution (invalid/unknown slug → today's default
  org behavior, never an error). Keep the `ref` referral path (`referredByCode` →
  `preferences.referred_by_code`) entirely independent — both params may be present.
- `src/app/org/[slug]/page.tsx` — the public page already renders the branded hero, teams,
  stats, and a "Get started free" CTA to `/signup?org=${org.slug}`. Reuse it; the
  `?invite=staff` param can tune the headline copy (e.g. "Your program invited you") but must
  not change the page's auth-free, server-rendered nature or its dark zinc/orange aesthetic.
  No banned words; no emoji-decorated headings.
- Director-side surface — add the "Bring your coaching staff" control where org admins live
  (e.g. `src/app/(dashboard)/settings/` or the existing admin surface). It fetches
  `GET /api/org/invite` via the client `query()`/TanStack pattern (NOT direct Supabase —
  AGENTS.md rule 3) and exposes the link via copy/`navigator.share`, mirroring the
  assistant-coach invite (ticket 0015) and exposing the URL on a stable `data-share-url`
  attribute for testability (LESSONS.md 2026-05-21 — share buttons render no `<a href>`, so
  assert via `data-share-url`). Render a "create your program first" hint when `url` is null.
- Tier: this is an acquisition surface. The director-side invite control is naturally
  available to coaches who HAVE an org (the org-tier path); do NOT add a new `feature_*` key —
  gate visibility on whether the coach has an org slug, the same product call (ungated growth
  surface) as the team-card (0010) and assistant-invite (0015) decisions. If the dev believes
  the control should be paid-tier-gated, push back through this ticket; default is open to
  maximize the loop.
- `tests/org/invite.test.ts` (new, `.test.ts` NOT `.spec.ts` — `vitest.config.ts` excludes
  `**/*.spec.ts`; LESSONS.md). Mock `createServiceSupabase` with a seeded coach + org +
  slug; assert: 401 no-auth; org-with-slug → `{ url }` containing `/org/<slug>`; coach with no
  org → `{ url: null }`; response body has ONLY `url`. Add a setup-route test asserting an
  `org` slug attaches `org_id` and that `ref` + `org` are handled independently.
- `tests/e2e/` — extend the org-landing / signup e2e against the 0006-seeded local Supabase.
  Seed an org with a slug + branding (the `/org/[slug]` page is a server component — its data
  must come from the seed, not `page.route()`; LESSONS.md 2026-05-21). Assert the public page
  renders the branded hero and the CTA href `/signup?org=<slug>`, and that an authenticated
  director sees the staff-invite control with the org link.
- New deps: no. Migration: likely NO — reuses `organizations.slug`/`org_id` and the existing
  signup path. Only add a migration if the org-scoped signup attachment genuinely needs a new
  column (it should not — `coaches.org_id` already exists); if so, use a unique version prefix
  and balanced insert columns/values (LESSONS.md 2026-05-20). Env vars: no (reuses
  `NEXT_PUBLIC_APP_URL`). AI prompt change: no. Tier feature key: no.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-23 — branch `feat/0024-program-staff-invite-on-org-landing` opened; status → in-progress
- 2026-05-23 — failing tests added FIRST (all `.test.ts`/`.test.tsx`, never `.spec.ts`):
  `tests/org/invite.test.ts` (AC1/AC2/AC3/AC6 — GET /api/org/invite), `tests/auth/setup-org.test.ts`
  (AC5/AC9 — org slug attaches org_id; ref + org independent), `tests/components/staff-invite-button.test.tsx`
  (AC7/AC6 — director control + null-hint), `tests/org/public-get.test.ts` (AC4 — public org route shape
  unchanged), and Playwright `tests/e2e/org-staff-invite.spec.ts` (AC7/AC8 — public landing CTA href +
  authed director control). Confirmed each failed for the right reason (missing module / missing behavior).
- 2026-05-23 — implemented: new `GET /api/org/invite` (authed; 401 no-auth with no DB read; returns ONLY
  `{ url }` = `${NEXT_PUBLIC_APP_URL}/org/<slug>?invite=staff` or `{ url: null }`). `/api/auth/setup` now
  resolves a `org` slug → existing org and attaches `org_id` (joins as role `coach`, not admin); unknown slug
  falls back to today's solo-org create; `ref` path untouched and independent. Signup forwards `org` to setup.
  New `StaffInviteButton` (client `query()` to `/api/org/invite`, `data-share-url` for testability, "create your
  program first" hint when null) mounted on `/settings/referrals`. `/org/[slug]` reads `?invite=staff` to tune
  the CTA copy only — page stays auth-free + server-rendered; CTA still deep-links `/signup?org=<slug>`.
  No new tier key (ungated growth surface, gated on having an org). No new minor-data field. No new dep / migration.
- 2026-05-23 — local gate (Node 20.19.0): `npm run lint` 0 errors, `tsc --noEmit` clean, full `vitest run`
  4435/4436 pass; the 1 fail is `player-of-match-utils.test.ts` date assertion (`Apr 27` vs `Apr 28`) — the
  known TZ/jsdom environmental fail (LESSONS.md #36) in a file this ticket never touched; reproduces in
  isolation, CI's Node 20/UTC arbitrates.
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
