---
id: 0035
title: Turn the AI-quota wall into a one-tap upgrade that finishes the exact artifact the coach was making
status: in-progress
priority: P1
area: tier
created: 2026-05-25
owner: product-groomer
---

## User story

As a free-tier volunteer coach who just finished a practice and tapped "generate parent
report" — only to hit "Monthly AI limit reached" — I want the upgrade screen to know
exactly which report I was trying to make and to drop me back on it the instant I upgrade,
so that I get the thing I came for in one step instead of upgrading, losing my place, and
re-finding the player I was about to write up.

## Why now (four lenses)

### Product Owner
Ticket 0008 shipped the *meter* (a free coach can see the wall coming on Capture). The
`AIUpgradePrompt` component already renders when an `/api/ai/*` route returns `402 { upgrade:
true }`. But the highest-intent conversion moment in the whole product is wasted: the coach
is mid-task, they've already done the work (captured the notes, picked the player, tapped
generate), and the wall throws that intent away — it shows a generic "Upgrade to Coach"
card with no memory of *what* they were doing, then `/settings/upgrade` is a cold pricing
page that, after checkout, drops them on Settings, not back on the artifact. The smallest
meaningful unit of value is: carry the blocked action's identity (which artifact, which
player/team) through the upgrade round-trip so that the moment the webhook flips the tier,
the coach lands back on the exact generate button — pre-filled — and the artifact they
wanted is one tap away. We remove a re-navigation, not add a feature.

### Stakeholder
This is the conversion lever that the entire freemium funnel hinges on and it is currently
the leakiest pipe we own. Every other tier surface gates *access* (`<UpgradeGate>` on a
feature the coach hasn't tried); this gates the *completion of an action the coach is
actively performing* — the single moment a free coach has demonstrated they want the paid
artifact badly enough to have done all the prep work. Recovering even a fraction of that
intent compounds directly into MRR, and it deepens the tier-aware-quota moat by making the
quota wall a conversion surface rather than a dead end. It touches no AI provider logic and
no new artifact type — it threads existing state (the 402 response already carries `tier`
and `limit`) through the existing Stripe checkout (0002) and the existing webhook tier-flip
(0004) — so it inherits multi-provider routing and billing correctness for free.

### User (Tuesday 6:40pm, packing up cones, parents arriving)
The coach taps "generate Maya's parent report." Instead of a dead "limit reached" card with
a generic upgrade button, they see: "You're out of free AI for this month. Upgrade to Coach
and I'll finish Maya's report right now." One tap → Stripe → back on Maya's report screen
with the generate button live and her name still on it. They never had to remember they were
on Maya, never had to re-navigate the roster with cold hands. If they bail on checkout, they
land back exactly where they were, nothing lost. The resume target is read from a short-lived
signed value, not from anything that could leak across coaches.

### Growth
This is pure conversion, not virality — and it's the right kind of pure conversion because
it converts *demonstrated intent*, the cheapest dollar in the funnel. The "show me" moment
is internal but real: a free coach telling another free coach "I hit the limit right when I
needed a report, upgraded, and it just finished the report — didn't even lose my spot" is
the testimonial that sells the paid tier on its competence, not its pitch. Every recovered
upgrade here also seeds the downstream viral surfaces (the parent report becomes a portal
share, the recap becomes a share-card), so a conversion at the wall pays forward into the
loops we already shipped.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A free-tier coach hitting any gated `/api/ai/*` route at quota still gets `402 { upgrade: true, tier, limit }` exactly as today (vitest: assert the existing 402 contract is unchanged — this ticket does NOT alter the server quota response shape).
- [ ] `/settings/upgrade` accepts an optional `resume` query param (an opaque short string the client passes describing the blocked action, e.g. `parent_report:<teamId>:<playerId>`) and round-trips it through Stripe checkout: the value is stamped into the checkout session's `success_url` so it survives the redirect (vitest on `/api/stripe/create-checkout`: when a `resume` param is provided, the generated `success_url` contains it; when absent, the success URL is unchanged from today).
- [ ] The `resume` value is validated server-side before it is ever used to navigate: it must match a fixed allow-list of `{action}` kinds (`parent_report | practice_plan | weekly_star | game_recap | session_debrief`) and its id segments must be UUIDs the upgraded coach's org actually owns; a malformed or cross-org `resume` is ignored and the coach lands on `/home`, never on another org's player (vitest: a `resume` pointing at a teamId/playerId outside the caller's org resolves to `/home` and reads no foreign rows server-side).
- [ ] After a successful upgrade, the post-checkout return path resolves the validated `resume` target and routes the coach to the exact artifact surface with the player/team pre-selected and the generate action ready — verified end-to-end (Playwright: a free coach blocked on a parent report → upgrade flow (mocked Stripe success) → lands on the parent-report surface for the same player with the generate control present).
- [ ] If the coach abandons checkout (Stripe cancel), they return to the surface they were blocked on with the `AIUpgradePrompt` still shown and nothing lost — no half-applied state (Playwright: cancel path returns to the blocked surface, no tier change, generate still gated).
- [ ] Tier enforcement is server-side and unchanged: a coach whose webhook has NOT yet flipped the tier (race between redirect and `customer.subscription.created`) still gets `402` from the gated route and the resume target shows the still-gated state rather than silently running an AI call for a free coach (vitest: resume + un-flipped tier → route still returns 402; the client shows the prompt, not a generated artifact).
- [ ] No AI is involved in this ticket itself, so no new prompt and no multi-provider contract test is required; an existing gated route's 402-then-200-after-upgrade behavior is asserted instead (vitest: same route returns 402 at free quota and 200 once the org tier is `coach`, proving the wall→resume path runs the real generator only when entitled).
- [ ] COPPA/privacy: the `resume` token carries only ids the coach already owns (teamId/playerId), adds no new field to `players`, and is never exposed on any public/no-auth surface (the parent portal, share-card, and OG routes are untouched) (vitest asserts the resume parsing rejects anything but owned-UUID ids and that no public route reads it).

## Out of scope

- Changing the monthly free quota number (still 5; this ticket changes the *experience at the
  wall*, not the limit). Any change to `maxAICallsPerMonth` is a separate tier discussion.
- A new "soft paywall" that previews the artifact for free before upgrading. v1 resumes the
  *generate action*; it does not generate a watermarked preview for an unentitled coach (that
  would run a paid AI call for a free coach — explicitly disallowed by the quota contract).
- Discounts, trials, or one-off "single report" purchases. The resume path leads to the
  existing Coach upgrade only; no new SKU, no new Stripe price.
- Persisting blocked-action history or analytics on conversion. No new table, no new tracker,
  no PostHog events — the resume value is short-lived and request-scoped only.
- Reworking `/settings/upgrade` into a redesigned pricing page. v1 adds the `resume`
  round-trip and the contextual copy on the existing page; a pricing redesign is separate.
- Email/push "you hit your limit, come back and upgrade" nudges. v1 is in-session only; a
  delivered nudge would need its own ticket (the drip + cron infra exists but is out of scope
  here).

## Engineering notes

- `src/lib/ai/error.ts` — `handleAIError` already returns `402 { upgrade: true, tier, limit }`.
  Do NOT change this contract; the resume value is constructed CLIENT-side from what the coach
  was doing, not added to the 402 body (keeps the server response stable and avoids leaking
  ids into error payloads).
- `src/components/ui/ai-upgrade-prompt.tsx` — accept an optional `resume` prop and append it to
  the `/settings/upgrade?resume=…` links. Update the copy so the headline names the blocked
  action ("Upgrade to Coach and finish Maya's report") when a `resume` describes a known
  artifact; fall back to today's generic copy when none is supplied. Keep dark zinc/orange,
  44px targets, no banned words ("journey"/"amazing"/etc.).
- Callers of `AIUpgradePrompt` that already handle the 402 (`src/app/(dashboard)/capture/*`,
  `src/app/(dashboard)/plans/page.tsx`, `src/app/(dashboard)/roster/[playerId]/page.tsx`,
  `src/app/(dashboard)/assistant/page.tsx`) — pass a `resume` describing the in-flight action
  where the surface knows it (parent report knows the playerId; plan knows the teamId). Surfaces
  that can't form a clean resume target simply omit it and keep today's behavior.
- `src/app/api/stripe/create-checkout/route.ts` — read an optional `resume` from the request,
  validate it against the allow-list of action kinds + UUID id segments, and stamp the
  VALIDATED value onto `success_url` (mirror the existing `success_url`/`cancel_url`
  construction; cf. LESSONS#0005 — session metadata also propagates to the subscription, but
  here the value rides the redirect URL). Never trust the raw `resume`; an invalid one drops to
  the default success URL.
- `src/lib/` — add a small pure helper `src/lib/resume-target.ts`: `parseResumeTarget(raw,
  ownedTeamIds, ownedPlayerIds)` → a validated `{ kind, path }` or `null`, and
  `buildResumePath(target)` → the dashboard URL. Closed enum of `kind` so an unknown action can
  never route. This is the unit-testable core (cf. the pure-helper pattern in 0013's
  `buildShareMetadata`).
- The post-checkout landing: the existing success page / `/settings` post-checkout handler reads
  the `resume` off the URL, validates ownership via the authed `query()` helper (NOT a direct
  Supabase client — AGENTS.md rule 3), and `router.replace()`s to the resolved path; an invalid
  or un-owned target falls to `/home`.
- `src/lib/tier.ts` — NO change. This ticket adds no feature key; it reuses the existing quota
  enforcement (`enforceAIQuota` / `canAccess`). The resume path only runs a real AI call after
  the tier is genuinely `coach`+ (the gated route's own 402→200 transition is the guard).
- `tests/` — `tests/lib/resume-target.test.ts` (pure parser: allow-list kinds, UUID id
  validation, cross-org rejection, malformed → null); `tests/stripe/create-checkout-resume.test.ts`
  (success_url contains validated resume; absent → unchanged; invalid → default). `.test.ts` NOT
  `.spec.ts` (LESSONS#38). Run under Node 20.19.0 by prepending the pinned bin to PATH
  (LESSONS#0010).
- `tests/e2e/` — a Playwright spec for the wall→upgrade→resume happy path and the cancel path,
  against the 0006-seeded Supabase, with Stripe mocked at the route boundary as the existing
  checkout e2e does (0002). Skip when E2E creds are unset (authenticated-flow convention).
- New deps: no. Migration: no. Env vars: no (reuses existing `STRIPE_*` + `NEXT_PUBLIC_APP_URL`).
  AI prompt change: no. Tier feature key: no.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-25 — branch `feat/0035-quota-wall-resume-after-upgrade` opened off main; ticket flipped to `in-progress`.
- 2026-05-25 — tests-first: `tests/lib/resume-target.test.ts` (pure parser: allow-list
  kinds, UUID id validation, cross-org rejection, malformed → null, path builder),
  `tests/stripe/create-checkout-resume.test.ts` (success_url contains a validated
  resume; absent → byte-identical to today; invalid/cross-org → default),
  `tests/ai/quota-wall-resume.test.ts` (the 402 contract + 402-then-200-when-entitled
  guard through the REAL `callAI` quota enforcement + `handleAIError`),
  `tests/components/ai-upgrade-prompt.test.tsx` (resume link threading + named-artifact
  copy + banned-words), and the e2e `tests/e2e/quota-wall-resume-flow.spec.ts`
  (happy/cross-org/cancel/no-resume landing paths, skips when E2E creds unset).
- 2026-05-25 — implemented `src/lib/resume-target.ts` (pure `parseResumeTarget` +
  `buildResumePath`, closed enum, UUID + ownership validation, root-relative paths
  only — open-redirect guard); threaded `resume` through the create-checkout route
  (validated server-side against the org's own teams/players before stamping onto
  `success_url`, never trusts the raw value; absent/invalid → today's default URL);
  added the post-checkout landing effect on `/settings/upgrade` (reads `success` +
  `resume` off the URL, re-validates ownership via the authed `query()` helper, then
  `router.replace()`s to the resolved path or `/home`); and threaded an optional
  `resume`/`resumeLabel` through `AIUpgradePrompt` (copy names the blocked artifact
  when supplied, generic otherwise). NO change to the 402 contract in
  `src/lib/ai/error.ts`, no new tier feature key, no migration, no env var, no AI prompt.
- 2026-05-25 — Reconciliations (cf. AGENTS.md hand-off discipline): (1) the only live
  caller of `AIUpgradePrompt` today is `src/app/(dashboard)/capture/review/page.tsx`,
  whose 402 wall is observation-segmentation — NOT one of the five artifact kinds —
  so per the ticket ("surfaces that can't form a clean resume target simply omit it")
  that caller is left unchanged rather than wired to a dishonest target; the resume
  capability is fully built + tested through the component/route/parser/landing, and
  the e2e exercises the landing with a real `parent_report` resume. The named callers
  `roster/[playerId]` and `plans` gate via `<UpgradeGate>` (tier-feature), not the
  runtime 402 prompt, so they need no change here. (2) The existing route's
  `success_url` uses `?success=true` (not `?status=success` the upgrade page's toast
  effect reads); kept byte-identical for the no-resume case and added a separate
  success+resume effect, so today's toast behavior is untouched.
