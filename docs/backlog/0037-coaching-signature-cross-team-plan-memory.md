---
id: 0037
title: Make practice plans learn the coach's own style across every team they've run
status: shipped
priority: P2
area: ai
created: 2026-05-25
owner: product-groomer
---

## User story

As a coach who has run dozens of practices across a couple of teams and seasons, I want the
practice plans and arcs the app generates to feel like the practices *I* actually run — the
drills I keep coming back to, the focus areas I lean on, the way I structure a session — so
that the AI feels like an assistant who has watched me coach, not a stranger handing me a
generic plan.

## Why now (four lenses)

### Product Owner
Today every generated plan and arc is built from one team's recent observations
(`buildAIContext` is team-scoped; the `practicePlan` and `practiceArc` prompts take only that
team's skill data). A coach who has run 40 practices gets a plan that knows nothing about how
*they* coach — the same cold-start every time, even on their fifth season. The smallest
meaningful unit of value is a "coaching signature": a compact, derived summary of the plans
this coach has actually generated and run across all their teams (their most-used drills,
recurring focus areas, typical session shape), threaded into the practice-plan and practice-arc
prompts as a SOFT preference. It makes the existing artifacts better without a new surface — the
coach taps "generate plan" exactly as they do now and the output simply sounds more like them.

### Stakeholder
This is a moat-deepener a forms app structurally cannot copy. A forms app has no accumulated
*structured coach artifacts* to learn from; we do — every plan and arc is persisted in `plans`
with `coach_id`, `skills_targeted`, and `content_structured`. Turning that history into a
coach-level preference signal compounds the Practice-Arc memory along a new axis: not "what did
this team do last session" (0014/0018/0020) but "how does this coach coach, everywhere." It
routes entirely through the existing `callAIWithJSON()` path (multi-provider routing, quota,
failover all inherited) and adds zero minor data — the signal is built from the coach's OWN
generated plans, which describe drills and focus areas, not children. The longer a coach uses
SportsIQ, the more it sounds like them, and the harder it is to leave for a tool that starts
cold every time. That is the retention-by-accumulation that the structured-artifact moat exists
to create.

### User (Sunday night, planning Tuesday's practice, tired)
The coach opens plans, taps "generate next practice." The plan that comes back opens with a
warmup they actually use, leans on the spacing-and-passing focus they always come back to, and
structures the session the way they like — so it reads as "yes, that's my practice," needing a
tweak instead of a rewrite. They didn't fill in a preferences form; the app learned it by
watching what they generated and kept. On a flaky connection, generation behaves exactly as
today — the signature is a best-effort enrichment that, if it can't load, simply leaves the
plan as it is now.

### Growth
The "show me" moment is a coach telling another coach "it knows how I run practice — it suggested
my warmup" — the demo that distinguishes a coaching assistant from a plan template generator,
and the kind of competence story that converts a skeptical volunteer. Its retention effect is
the strongest kind: it grows with use, so a multi-season coach has a personalized assistant a
new competitor can't replicate on day one. It also lifts plan quality, and a better plan is a
plan the coach actually runs, which produces the observations that feed the parent reports and
recap cards the viral loops already depend on.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A pure helper builds a "coaching signature" from a coach's own persisted plans: given a
  set of `plans` rows for one `coach_id` (across multiple teams), it returns a compact summary —
  the most frequent `skills_targeted`, the most-recurring drill names from `content_structured`,
  and a typical session length — capped to a small, prompt-safe size; given a coach with too few
  plans it returns `null` (vitest on the pure helper: many plans → ranked summary; <N plans →
  null; the summary is bounded in length).
- [ ] The signature is built ONLY from plans owned by the requesting coach: the helper/query is
  scoped to the caller's `coach_id` (resolved server-side from the session), and a coach never
  receives signal derived from another coach's plans (vitest: plans belonging to a different
  `coach_id` are excluded from the built signature; assert the query filter server-side).
- [ ] `/api/ai/plan` threads the signature into the `practicePlan` prompt as a SOFT preference
  (it influences but does not override the team's real current needs), and STILL returns a valid
  structured plan when the signature is `null` (cold-start coach) — i.e. the feature degrades to
  exactly today's behavior with no signature (vitest: route called with a signature-producing
  coach passes the signature into `callAIWithJSON`; route called for a cold-start coach passes no
  signature and produces a plan unchanged in shape).
- [ ] The same soft-preference threading is applied to `/api/ai/practice-arc` (the arc prompt
  already accepts a soft `programFocus` hint from 0031 — add the coaching signature alongside it,
  same soft-priority semantics) (vitest: arc route threads the signature; null signature →
  unchanged arc behavior).
- [ ] The plan/arc routes continue to enforce the existing AI quota and tier behavior unchanged:
  a free coach at quota still gets `402 { upgrade: true }` from the route (the signature does not
  bypass `enforceAIQuota`), and the call goes through `callAIWithJSON()` with `orgId` so provider
  routing + logging apply (vitest: signature path still 402s at free quota; `callAIWithJSON`
  invoked with the resolved `orgId`).
- [ ] AI contract test: the `practicePlan` prompt WITH a coaching-signature block produces
  structurally-valid plan JSON (parses against the existing plan schema) under at least Anthropic
  AND one fallback provider, mirroring `tests/ai/provider-failover.test.ts` — the signature must
  not be Anthropic-specific and must not break the existing plan contract (vitest contract test).
- [ ] COPPA/privacy: the coaching signature is derived ONLY from the coach's own generated plans
  (drill names, focus categories, session length) and contains NO player/minor data — no player
  names, no per-child observations — and the signature is never exposed on any public/no-auth
  surface (vitest asserts the built signature object contains no fields sourced from `players` or
  per-player observation text, only coach-plan-derived aggregates).

## Out of scope

- A coach-editable "my coaching style" settings form. v1 LEARNS the signature from persisted
  plans automatically; an explicit editable profile is a separate ticket (and risks becoming a
  forms feature, which is the opposite of the point).
- A new tier gate. The signature enriches the EXISTING plan/arc generators, which are already
  governed by the AI quota and the existing plan tiering; do not add a new `feature_*` key or a
  new `<UpgradeGate>` — that would gate an invisible enrichment, which can't be surfaced honestly.
- Cross-COACH learning ("coaches like you also used…"). v1 is strictly the coach's OWN history.
  Any cross-coach aggregation is a separate privacy discussion, not this ticket.
- Persisting the signature as a new artifact or table. v1 derives it on demand from existing
  `plans` rows at generation time; no new `plans.type`, no `plans_type_check` change, no new
  table. If caching is wanted later for cost, that's a separate ticket.
- Re-running or backfilling old plans against the new signature. It only affects plans/arcs
  generated AFTER this ships.
- Threading the signature into non-plan artifacts (parent reports, recaps, weekly star). v1 is
  scoped to practice PLANS and ARCS — the artifacts where "the coach's own style" is the relevant
  signal. Other artifacts are out of scope.

## Engineering notes

- `src/lib/` — add `src/lib/coaching-signature-utils.ts`: a pure `buildCoachingSignature(plans)`
  that takes the coach's `plans` rows (already fetched server-side) and returns a compact,
  length-bounded `{ top_skills: string[]; recurring_drills: string[]; typical_session_minutes:
  number } | null`. Rank `skills_targeted` frequency, extract recurring drill names from
  `content_structured`, derive a typical length. This is the unit-testable core (mirror the
  pure-helper pattern of `src/lib/season-momentum-utils.ts`). It must touch NO `players`/observation
  data — only `plans` fields.
- `src/app/api/ai/plan/route.ts` — after resolving the authed `coach_id`, fetch that coach's
  recent `plans` (scoped `eq('coach_id', coachId)`, across all their teams), build the signature,
  and pass it into the `practicePlan` prompt params. Preserve all existing behavior when the
  signature is `null`. Keep the existing quota + `callAIWithJSON` path intact (AGENTS.md rule 4).
- `src/app/api/ai/practice-arc/route.ts` — same: build the signature and thread it into the
  `practiceArc` prompt params alongside the existing `programFocus` soft hint (0031). Same
  null-safe degradation.
- `src/lib/ai/prompts.ts` — extend `practicePlan` and `practiceArc` to accept an optional
  `coachingSignature` param and inject it as a SOFT preference block ("This coach tends to lean
  on these focus areas and drills; prefer them where they fit the team's real needs — do not force
  them if the data points elsewhere", phrased the same soft way as the existing `programFocus`
  hint). Voice: clipboard, no banned words ("journey"/"amazing"/etc.); do NOT enumerate banned
  words inside the prompt string (LESSONS#0023). The output JSON schema is UNCHANGED — the
  signature only nudges content, not structure.
- `src/lib/ai/context-builder.ts` — leave `buildAIContext` team-scoped as-is; the coaching
  signature is a SEPARATE coach-scoped fetch in the route, not folded into the team context (keeps
  the team context cache-correct and the new signal cleanly separable/testable).
- `tests/` — `tests/lib/coaching-signature-utils.test.ts` (ranked summary, <N plans → null, bound
  on length, contains no player/observation fields), `tests/ai/plan-coaching-signature.test.ts`
  (route threads the signature; cold-start → unchanged; cross-coach plans excluded; still 402s at
  free quota; `callAIWithJSON` called with `orgId`). `.test.ts` NOT `.spec.ts` (LESSONS#38). Run
  under Node 20.19.0 (LESSONS#0010).
- AI contract test under `tests/ai/` — reuse the hoisted Anthropic/OpenAI/Gemini mock strategy
  from `tests/ai/provider-failover.test.ts` so the `practicePlan` prompt WITH a signature block is
  exercised through ≥2 providers and the plan JSON still parses against the existing plan schema.
- New deps: no. Migration: no (reads existing `plans`; persists nothing new). Env vars: no. AI
  prompt change: YES — extend `practicePlan` + `practiceArc` in `src/lib/ai/prompts.ts` with an
  optional soft `coachingSignature` block (no schema change). Tier feature key: no (enriches
  existing quota-governed generators; do not add a gate for an invisible enrichment).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-25 — branch `feat/0037-coaching-signature-cross-team-plan-memory` opened; status → in-progress.
- 2026-05-25 — failing tests added: `tests/lib/coaching-signature-utils.test.ts`,
  `tests/ai/plan-coaching-signature.test.ts`, `tests/ai/plan-coaching-signature-contract.test.ts`.
- 2026-05-25 — implemented pure `src/lib/coaching-signature-utils.ts`
  (`buildCoachingSignature`); threaded an optional SOFT `coachingSignature` block into
  `practicePlan` + `practiceArc` in `src/lib/ai/prompts.ts` (output JSON schema UNCHANGED);
  wired the coach-scoped fetch (`eq('coach_id', coachId)`, all teams) + signature build into
  `/api/ai/plan` and `/api/ai/practice-arc`, null-safe so a cold-start coach is byte-identical
  to today's behavior. Quota + `callAIWithJSON(orgId)` path untouched.
- 2026-05-25 — PR #305 opened, three gating checks green (lint / unit-tests / e2e-tests),
  squash-merged to main as `ee8f152`. Status → shipped via separate `chore/0037-mark-shipped`
  branch off freshly-pulled main (per LESSONS#0020).
