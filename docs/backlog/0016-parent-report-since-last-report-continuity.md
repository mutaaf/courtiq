---
id: 0016
title: Make the parent report a continuity artifact that tells the growth story since the last report
status: groomed
priority: P1
area: ai
created: 2026-05-21
owner: product-groomer
---

## User story

As a coach generating a parent report a month after the last one, I want the new report
to say what changed since the report I already shared — "since last month, Maya went from
hesitating on closeouts to defending the perimeter" — so that the parent sees their kid
actually developing over the season, not a fresh snapshot every time that reads like the
last one.

## Why now (four lenses)

### Product Owner
The parent report (`src/app/api/ai/parent-report/route.ts`) generates a fresh snapshot
every time: it reads the player's recent observations and proficiency and writes a
report with no awareness that a prior report was ever shared. So a parent who gets one in
March and another in April sees two disconnected snapshots — and the second one often
restates the first because the underlying skill picture moves slowly. The smallest
meaningful unit of value is to feed the *prior* parent report (the most recent
`plans` row of `type='parent_report'` for that player, already stored with
`content_structured`) into the prompt as continuity context, and have the model produce a
short "since last report" growth note. One new field on the artifact, one prior-report
read, same one AI call. It makes the report we already ship feel like a story instead of
a status.

### Stakeholder
This deepens two moats at once. It strengthens the structured-artifact moat: a report
that references its own predecessor is a chained artifact a forms app cannot produce
because a forms app has no prior artifact to read. And it strengthens the parent-portal
viral surface: a growth-over-time narrative ("look how far she's come since last month")
is dramatically more shareable than a snapshot — it's the screenshot a parent forwards to
the other parent. Critically, it routes through `callAIWithJSON()` exactly like every
other artifact, so the continuity logic inherits multi-provider routing, quota counting,
and failover (0012) for free — the moat compounds rather than forking. No schema change:
prior reports already live in `plans`.

### User (the coach, Sunday night, sending reports before the parent meeting)
The coach taps "Generate parent report" for Maya the same way they do today. The report
that comes back now opens with a sentence that connects to the one they sent last month —
the coach doesn't have to remember what they said, the report does. If this is the
player's *first* report, there's no prior to compare to and the report reads exactly as it
does today (no awkward "since your first report" filler). The coach reviews, shares the
portal link, done — same flow, richer output. If the prior-report read fails for any
reason, the report still generates as a clean snapshot rather than erroring.

### Growth
This is the artifact most likely to produce the next "show me" forward. A parent who sees
"since last report: moved from Practicing to Got It! on dribbling under pressure"
forwards *that* to the other parent and the grandparent in a way they never forward a flat
status. It also lifts coach retention: a report that visibly builds on the last one
rewards the coach for generating reports regularly — the value compounds the more
consistently they report, which is exactly the cadence we want. Retention and a viral
artifact in the same change, on a surface (the parent portal) that's already our viral
channel.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `POST /api/ai/parent-report` fetches the most recent prior `plans` row with `type='parent_report'` for the same `player_id` (excluding the one being generated) and passes its `content_structured` into the prompt as continuity context (vitest: with a seeded prior report, the prompt builder receives the prior report's content; assert via the mocked `callAIWithJSON` system/user prompt arguments).
- [ ] When NO prior parent report exists for the player, the route generates the report with no continuity context and the output omits the growth note (vitest: seeded player with zero prior reports → the prompt contains no prior-report block and the parsed result has no `since_last_report` / continuity field set).
- [ ] The generated artifact gains exactly one new optional continuity field (e.g. `since_last_report: string | null`) on the parent-report schema; the existing report fields are unchanged and still validate (vitest: `parentReportSchema.parse()` accepts both a report WITH and WITHOUT the new field; existing fixtures still pass).
- [ ] A prior-report fetch failure does NOT 500 the route — it falls back to generating a snapshot report with `since_last_report: null` (vitest: regression — the route stays 2xx when the prior-report read throws).
- [ ] The newly generated report is still persisted to `plans` with `type='parent_report'`, `player_id`, and `content_structured` exactly as today (vitest: regression — the insert shape is unchanged aside from the continuity field living inside `content_structured`).
- [ ] AI contract test: the `parentReport` prompt with a continuity block produces structurally valid output (parses against `parentReportSchema`) under at least Anthropic AND one fallback provider (e.g. OpenAI or Gemini), mirroring the multi-provider mock strategy in `tests/ai/provider-failover.test.ts` — the continuity feature must not be Anthropic-specific.
- [ ] COPPA/privacy regression: the continuity context fed to the model contains only the prior report's coach-authored narrative content, and the change adds no new field collected on the `players` table (vitest asserts the prompt's prior-report block carries no new minor-scoped data beyond what the existing report already contained).

## Out of scope

- Generating a *standalone* "season progress" artifact. This enriches the existing
  parent report in place; it does not add a new artifact type or a new route.
- Showing a diff/timeline UI of all prior reports. v1 is one "since last report" sentence
  inside the report; a history view is a separate ticket.
- Comparing against anything other than the single most recent prior parent report
  (e.g. averaging all prior reports, or comparing to the debrief). One prior report in,
  one growth note out.
- Re-tuning the rest of the parent-report prompt's voice or structure. Add the continuity
  block; leave the existing prompt body and tone alone.
- Backfilling a continuity note onto already-generated reports. New field is populated
  going forward only.
- A new tier gate. Parent reports are already gated by the `parent_sharing` /
  `report_cards` tier features (Coach+); this ticket changes the *content* of an artifact
  the tier already permits, it does not add a new `feature_*` key.
- Any new analytics event or tracker. PostHog already exists; do not add event types.

## Engineering notes

- `src/lib/ai/prompts.ts` — extend `PROMPT_REGISTRY.parentReport(params)` to accept an
  optional `priorReport?: ParentReport` (or its `content_structured` shape). When present,
  add a continuity block to the user prompt instructing the model to produce a short
  `since_last_report` note grounded in the *difference* between then and now; when absent,
  the prompt is byte-identical to today (gate the block on presence, the same way
  `practicePlan` gates its trend block). Keep the JSON schema instruction in the prompt in
  sync with the new optional field.
- `src/lib/ai/schemas.ts` — add `since_last_report: z.string().nullable().optional()` (or
  equivalent) to `parentReportSchema`. It must be optional so existing fixtures and the
  no-prior-report path still validate. Do not make any existing field required-er.
- `src/app/api/ai/parent-report/route.ts` — after resolving `player`, fetch the most
  recent prior parent report:
  `admin.from('plans').select('content_structured').eq('player_id', playerId).eq('type','parent_report').order('created_at',{ascending:false}).limit(1)`,
  wrapped in try/catch so a read failure degrades to no continuity (never 500). Pass it
  into `PROMPT_REGISTRY.parentReport({ ...context, priorReport })`. The route already
  routes through `callAIWithJSON()` with `interactionType: 'generate_parent_report'` and
  `orgId` — keep that exactly so quota + provider routing + failover (0012) apply
  unchanged. Persist as today.
- `tests/ai/parent-report-continuity.test.ts` (new, `.test.ts` NOT `.spec.ts` —
  `vitest.config.ts` excludes `**/*.spec.ts`; LESSONS.md 2026-05-20). Mock
  `@/lib/supabase/server` (chainable in-memory, as in `tests/ai/weekly-star.test.ts`),
  `@/lib/ai/context-builder`, and `@/lib/ai/client`'s `callAIWithJSON` so you can assert
  the prompt arguments. Cover: prior-report-present → continuity block in prompt;
  no-prior-report → no block + no continuity field; prior-fetch-throws → 2xx snapshot with
  `since_last_report: null`; persisted insert shape unchanged.
- The AI contract test belongs under `tests/ai/` alongside `contracts.test.ts` /
  `provider-failover.test.ts`. Reuse the provider-mock strategy from
  `tests/ai/provider-failover.test.ts` (hoisted Anthropic/OpenAI/Gemini SDK mocks) so the
  same continuity prompt is exercised through at least two providers and parsed against
  `parentReportSchema`. Run under Node 20.19.0 (LESSONS.md 2026-05-21 re: invoking the
  pinned Node directly via PATH, not `nvm use`).
- New deps: no. Migration: no (`plans.content_structured` is jsonb and already stores the
  report). Env vars: no. AI prompt change: YES — `PROMPT_REGISTRY.parentReport` in
  `src/lib/ai/prompts.ts`. Tier feature key: no new key (rides existing `parent_sharing` /
  `report_cards` gating).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0016-...` opened
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
