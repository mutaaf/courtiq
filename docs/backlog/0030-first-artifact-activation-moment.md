---
id: 0030
title: Walk the brand-new coach to their first shareable AI artifact the moment they have enough notes
status: shipped
priority: P2
area: onboarding
created: 2026-05-25
owner: product-groomer
---

## User story

As a coach who just signed up, added a few players, and logged my first handful of
observations, I want the app to show me — without my hunting for it — that it can now turn
those notes into something I can actually send a parent, so that I hit the "oh, THIS is what
it does" moment in my first session instead of leaving thinking it is just a notes app.

## Why now (four lenses)

### Product Owner
Our activation scaffolding (`GettingStartedCard`, `FirstPracticeLauncher`) walks a new coach
to "capture an observation" — and then stops. The step list ends at the input, never at the
*output*. But the product's whole promise is the artifact: the parent report, the session
debrief, the thing a coach sends. A new coach who captures three notes and never discovers
that the AI will turn them into a shareable report has used a notes app, not SportsIQ — and
churns. The smallest meaningful unit of value is one card on home that appears ONLY for a
coach who has crossed the threshold where a first artifact is possible (enough observations,
no artifact generated yet): "You have enough notes — see what SportsIQ can make from them,"
with a one-tap path to generate their first report/debrief. It is the missing final step of
the activation arc — output, not input — and it self-dismisses the moment the coach generates
their first artifact.

### Stakeholder
Activation is where the structured-artifact moat is either felt or missed. The moat is not
the notes — a forms app has notes — it is the AI artifact a forms app cannot produce. A coach
who never reaches their first artifact never experiences the moat and judges us on the part
we share with every competitor. This ticket makes the first artifact a guided, one-tap
destination, so the differentiator lands in session one. It routes through the existing
artifact generators (no new `callAI()` path, no new prompt), so it deepens the moat by
*surfacing* it, not by building new plumbing — and it lifts the metric that everything
downstream (retention, referral, conversion) compounds on: did the new coach reach the magic
moment.

### User (first Tuesday with the app, between drills, just saved their fourth note)
They glance at home and see a single card: "You have 4 notes on your team — turn them into a
parent report?" One orange button. They tap it, the report generates, and for the first time
they see their own scribbles come back as something they would actually text a parent. That is
the moment. If they have not logged enough yet, the card is simply absent — no nag, no empty
state, no "you haven't done enough" guilt (banned tone). If generation fails on a flaky
connection, the card stays and nothing breaks; the home screen renders exactly as today.

### Growth
This is the retention lever the activation flow is missing: it converts "I tried the notes" into
"I saw the magic," which is the single best predictor that a coach comes back and tells someone.
The "show me" moment is literally built in — the first artifact IS the screenshot a coach sends
a fellow coach ("look what it made from my notes"), and every shipped share surface (parent
portal, recap card, coach profile) only matters if the coach reached a first artifact at all.
It pulls the new coach back the next day with a concrete, completed win in hand, and it makes
every downstream viral surface reachable for a cohort that otherwise would have churned before
generating anything.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A pure eligibility helper (e.g. `shouldShowFirstArtifactNudge({ observations, artifactsGenerated })` in `src/lib/first-artifact-utils.ts`) returns `true` only when `observations >= THRESHOLD` (a small constant, e.g. 3) AND `artifactsGenerated === 0`, and `false` otherwise (below threshold, or once any artifact exists) (vitest covers the threshold boundary and the already-generated case).
- [ ] The first-artifact card renders on the home surface only when the eligibility helper returns `true`; once the coach has generated their first artifact (the count is non-zero), the card does not render (vitest/component on the card: shown for an eligible new coach, absent for a coach with a prior artifact and absent for a coach below threshold).
- [ ] The card's primary CTA routes the coach into an EXISTING first-artifact generator (e.g. the parent report or session debrief flow) — it does not introduce a new AI route or a new prompt (vitest asserts the CTA target is an existing route; no new `src/app/api/ai/*` route is added).
- [ ] The card is dismissible and stays dismissed for a bounded window (localStorage, mirroring `GettingStartedCard`'s dismiss pattern), so a coach who closes it is not re-nagged on every load (component test asserts dismiss hides it and a re-mount within the window keeps it hidden).
- [ ] The "have they generated an artifact yet" signal is read from existing data (e.g. a count of the coach's `plans` / artifact rows surfaced to the home page), NOT from a new tracking field on any table, and especially not from any field on `players` (vitest asserts the eligibility input is the existing artifact count; no migration adds a player-scoped field).
- [ ] Privacy/COPPA: the card shows only the coach's own aggregate note count and team name — no player name, jersey, or observation text (component/Playwright asserts the card renders no per-minor data).
- [ ] Playwright: a freshly seeded coach with observations above the threshold and zero artifacts sees the first-artifact card with its CTA on `/home`; a seeded coach who already has an artifact does not see it (best-effort: if the underlying count query is slow, the home screen still renders).

## Out of scope

- A new AI prompt, schema, or `src/app/api/ai/*` route. v1 routes into an EXISTING generator
  (parent report / session debrief / whichever the dev picks as the cleanest first artifact);
  it does not generate the artifact itself or change any generator's contract.
- Auto-generating the first artifact without a tap. The coach taps to generate — no surprise
  AI spend, no auto-charging a free coach's monthly quota (the existing generator already
  enforces its own tier/quota rules via `callAI()`).
- A multi-step onboarding wizard or a new onboarding route. This is ONE home card, added to the
  existing home activation stack alongside `GettingStartedCard` / `FirstPracticeLauncher` /
  `StreakCard` — not a new flow.
- Changing the existing `GettingStartedCard` step list or `FirstPracticeLauncher`. This card is
  additive and complementary; do not rework the existing activation components.
- A new tier gate or paywall on the nudge. The nudge is open; the artifact the coach generates
  is subject to whatever tier/quota rules its existing generator already applies.
- A new analytics SDK, event, or tracker to measure activation. PostHog already exists; do not
  add new event types or a tracking column.

## Engineering notes

- `src/lib/first-artifact-utils.ts` (new) — a pure `shouldShowFirstArtifactNudge(input)` plus
  the threshold constant, so eligibility is unit-testable without rendering. Mirror the pure-
  helper-plus-component split the home cards already use (e.g. `next-best-actions-utils.ts`
  behind `quick-wins-card.tsx`, `streak-utils.ts` behind `streak-card.tsx`).
- `src/components/home/first-artifact-card.tsx` (new) — presentational + a thin client wrapper.
  Inputs: the team's `observations` count and an `artifactsGenerated` count (both already
  computed or cheaply derivable on the home page's stats). Dismiss via localStorage keyed by
  team id, mirroring `getting-started-card.tsx`'s `dismissKey` + bounded-window pattern. The CTA
  is a `<Link href=...>` to an existing first-artifact destination (e.g. the report/debrief
  surface). Dark zinc-950 + #F97316; 44px touch targets; no emoji-decorated headings; no banned
  words. Render `null` when ineligible or dismissed.
- `src/app/(dashboard)/home/page.tsx` — mount `<FirstArtifactCard ... />` in the home activation
  stack near `GettingStartedCard` / `FirstPracticeLauncher` / `StreakCard` (see the existing
  imports around lines 44-46 and the render block around 1432-1524). It needs an
  `artifactsGenerated` count: derive it from the coach's existing artifact rows (the home page
  already loads several stats; surface a count of the coach's `plans`/generated-artifact rows
  via the same `query()`/stats path the page already uses — do NOT add a Supabase client call;
  AGENTS.md rule 3). If a suitable count is not already loaded, add it to the home page's
  existing read, not a new endpoint.
- `tests/first-artifact/utils.test.ts` (new, `.test.ts` NOT `.spec.ts`; LESSONS.md 2026-05-20):
  cover the threshold boundary (below/at/above) and the already-generated short-circuit.
- A component test for `first-artifact-card.tsx` (render with QueryClientProvider + mocked
  router as the other home-card tests do; LESSONS.md 2026-05-21 re: rendering home cards in
  isolation): shown for eligible / absent for already-generated / absent below threshold /
  dismiss hides and stays hidden on re-mount.
- `tests/e2e/first-artifact-flow.spec.ts` (new Playwright spec) against the 0006-seeded local
  Supabase. Seed one coach with observations above threshold and zero artifacts (sees the card)
  and assert the CTA is present; the page reads data server-side/via `query()`, so the signal
  must come from the seed (LESSONS.md 2026-05-21). Skip when E2E creds are unset, per convention.
- New deps: no. Migration: no (reads existing `observations` + artifact/`plans` counts; no new
  field, definitely none on `players`). Env vars: no. AI prompt change: no (routes into an
  existing generator). Tier feature key: no (the nudge is ungated; the generator keeps its own
  tier rules).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-25 — branch `feat/0030-first-artifact-activation-moment` opened; ticket flipped to in-progress.
- 2026-05-25 — failing tests added FIRST: `tests/first-artifact/utils.test.ts` (threshold
  boundary + already-generated short-circuit + CTA-is-existing-route), the component test
  `tests/first-artifact/first-artifact-card.test.tsx` (eligible-shows / already-generated-absent /
  below-threshold-absent / no-per-minor-data / dismiss-stays-hidden), and the Playwright spec
  `tests/e2e/first-artifact-flow.spec.ts` (eligible coach sees card+CTA; coach with an artifact
  doesn't; home renders when stats read fails). Confirmed they failed for the right reason
  (missing modules) before implementing.
- 2026-05-25 — implemented `src/lib/first-artifact-utils.ts` (pure `shouldShowFirstArtifactNudge`
  + `FIRST_ARTIFACT_OBS_THRESHOLD = 3` + `FIRST_ARTIFACT_CTA_HREF = '/plans'`) and
  `src/components/home/first-artifact-card.tsx` (presentational + localStorage dismiss mirroring
  GettingStartedCard's 30-day window). Mounted in the home activation stack right after
  `GettingStartedCard`.
- Reconciliation notes / decisions:
  - CTA destination: chose `/plans` (the existing in-app artifact hub where parent reports /
    report cards are generated) as the cleanest existing first-artifact route — it is reachable
    ungated for any coach and needs no session id, while the per-player report-card route is
    itself tier-gated. The nudge is ungated; the generator keeps its own tier/quota rules.
  - `artifactsGenerated` signal: derived from a count of the team's existing `plans` rows added
    to the home page's EXISTING `home-stats` `query()` (`plans` is already on the data-route
    allow-list). No Supabase client call, no migration, no new field — and definitely none on
    `players`. The home-stats query is already invalidated after a debrief/artifact generation,
    so the card self-dismisses once the first artifact exists.
  - Vitest files are `*.test.ts(x)` not `*.spec.ts` (LESSONS 2026-05-20).
- 2026-05-25 — local gate green: `npm run lint` 0 errors, `tsc --noEmit` clean, new tests 17/17.
  Full `vitest run --no-file-parallelism` = 4519 passed; the single fail
  (`player-of-match-utils` `Apr 27` vs `Apr 28`) is the documented non-UTC-TZ env artifact
  (LESSONS 2026-05-20), reproduces identically in isolation, and is untouched by this change.
- 2026-05-25 — PR #289 opened; all three gating checks green (lint / unit-tests / e2e-tests).
- 2026-05-25 — PR #289 squash-merged to main; status flipped to shipped via chore/0030-mark-shipped.
