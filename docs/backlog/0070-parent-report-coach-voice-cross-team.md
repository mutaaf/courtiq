---
id: 0070
title: Make every parent report sound like the coach who is writing it — across every team they have ever coached
status: in-progress
priority: P1
area: ai
created: 2026-06-05
owner: product-groomer
---

## User story

As a coach who has run a U10 girls basketball team in the spring and a
U12 boys volleyball team in the fall and a few seasons of soccer before
that, I want the parent reports the app generates for ANY of my teams to
sound like ME — the way I open a note, the way I frame a tough week, the
specific phrases I keep coming back to ("she's playing with her hands
ready," "he's hearing the call before the ball comes") — so the parents
who get my reports recognize my VOICE the way they would recognize a
text message from me, regardless of which team or season it is.

## Why now (four lenses)

### Product Owner

The product has shipped 0037 — the coaching-signature primitive — which
derives a compact summary of the coach's plan-and-arc history (top
skills, recurring drills, typical session length) and threads it into
the `practicePlan` and `practiceArc` prompts as a SOFT preference. It
does NOT thread into the `parentReport` prompt. So today the coach
who has shipped 60 plans and arcs gets a personalized PLAN but a
generic-voice PARENT REPORT — the artifact that is the highest-
visibility coach-authored output the product ships, sent directly to
parents, is the one place the coach's voice is structurally absent.
The smallest meaningful unit of value is: (a) extend the existing
`buildCoachingSignature` helper to derive a NEW field
`voice_anchors` — up to 6 short phrases the coach has used across
their own PRIOR `parent_report` plans (drawn from the persisted
`content_structured.highlights` and `content_structured.coach_note`
fields), capped at 80 chars each, surname-stripped per LESSONS#0061;
(b) thread the existing `CoachingSignature` (incl. the new
`voice_anchors`) into the `parentReport` prompt as a SOFT preference
block — instructed positively ("write in the voice of a coach who
has shipped reports like this before; lean on these phrasings when
the underlying observation matches"); (c) extend the existing
`/api/ai/parent-report` route (read at pickup per LESSONS#0096) to
read the coach's prior parent-report plans via the existing
`coaching-signature-utils` builder + pass the signature to the
prompt; (d) NO new tier key (the coaching-signature is already gated
implicitly by the parent-report tier gate — if the coach can
generate a parent report, they get the voice signal at no extra
cost); (e) NO new database column, NO new migration — the signal
is derived at generation time from existing persisted plan rows.
Smallest meaningful unit because it ships a measurable voice-
match improvement on EVERY parent-report generation for every
coach with 5+ prior reports, with zero new user-facing surface.

### Stakeholder

This is the moat-deepening primitive that closes the most-cited
coach-attrition gap in the parent-report artifact and that
competitors cannot replicate without our accumulated `plans`
history. Three compoundings, all distinct from 0037. (1) The
voice-arc moat — every shipped parent report is a new data
point for the next parent report's voice; the longer the coach
uses SportsIQ, the MORE the parent reports sound like them
(0037 deepens plan voice; this deepens parent-facing voice —
together they cover both surfaces the coach interacts with). (2)
The cross-team moat — a coach who is coaching team A in spring
and team B in fall benefits from team A's reports having taught
the voice signal that team B's reports inherit, in a way that
makes switching to a forms app cost the coach the entire
accumulated voice they have built. (3) The parent-recognition
moat — the moment a parent says "this report sounds like Coach
Sarah" is the moment SportsIQ becomes structurally invisible
to the parent and IS the coach (the brand recedes; the coach
foregrounds). Distinct from 0037 (which is the plan-side
signature, not parent-side), 0016 (parent-report continuity
WITHIN a team), 0034 (parent-report cross-season for ONE
returning player), 0066 (thin-week safety net for ONE
report). This is the voice-arc that spans EVERY team the coach
has ever coached.

### User (the coach, Friday night, generates the week's parent
reports for her U10 girls)

She taps "generate parent reports" on the team's report card
surface. The reports load. She opens the first one. It reads
like her — not because she has filled in a preferences form,
but because the AI is using phrasing she has used before
("she's reading the play before it happens" — a phrase she
has dropped into three prior reports across two seasons; the
prompt picked it up because the observation about Maya
matched). She edits ONE sentence (the way she always does)
and sends. The parent reads the report and thinks: "yes, this
is Coach Sarah." Total interaction: 35 seconds per report
instead of the 2 minutes the rewrite used to take.

### Growth

The "show me" moment is the PARENT'S phone — a parent who
gets a report and texts a friend "our coach is so attentive
this season, she really sees our kid" — when the parent does
not know the AI wrote it. That is the moment the product
disappears INTO the coach, which is the truest form of
retention (a coach whose parents praise THEM for what the
app generated stays forever). Compounds three ways. (1) The
report-quality compound — every shipped report deepens the
voice signal of the next, so the per-report value INCREASES
over time, a positive feedback loop that compounds the
0037 plan-signature loop. (2) The cross-team parent-pull —
a parent on team A who knows Coach Sarah uses SportsIQ
recognizes the SAME voice on a friend's team B's report
the next season; the cross-coach recognition signal is
the highest-conversion shape of organic awareness the
product can ship. (3) The reduced-edit retention — the
volunteer coach's #1 friction point in the report path is
the "this doesn't sound like me" rewrite; cutting the
rewrite from 2 minutes to 35 seconds is the retention
delta. Distinct from every shipped surface because every
shipped parent-report ticket is single-team or single-
player; THIS one threads the coach's voice across every
team they have ever coached.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] Extend `src/lib/coaching-signature-utils.ts` (existing)
  to add a NEW optional field `voice_anchors: string[]` on
  the `CoachingSignature` type. Per LESSONS#0103 — declare
  the field OPTIONAL so existing call sites (the 0037
  practicePlan / practiceArc / pregame brief / newsletter /
  pulse routes) stay byte-identical without a sweep. Extend
  the builder to: (a) accept a NEW optional input
  `priorParentReports: CoachPlanRow[]` (the coach's own
  `parent_report`-typed plan rows); (b) walk each report's
  `content_structured.highlights` array AND
  `content_structured.coach_note` string, extracting short
  phrases (8–80 chars, no surname-shapes per LESSONS#0061's
  literal-space rule, no banned tokens per LESSONS#0023);
  (c) rank by recurrence across reports; (d) cap at
  `MAX_SIGNATURE_VOICE_ANCHORS = 6` (mirrors
  `MAX_SIGNATURE_DRILLS = 6`); (e) require
  `MIN_VOICE_ANCHOR_RECURRENCE = 2` (mirrors
  `MIN_DRILL_RECURRENCE = 2`). When the coach has fewer
  than 3 prior parent-reports, return `voice_anchors: []`
  (the prompt branch on absence handles the cold-start).
  Per LESSONS#0034 — strip `--`-comment lines from any
  scanned content so the helper's defensive guards never
  trip on documentation; per LESSONS#0061 — use a literal
  space, not `\s+`, for the surname guard. (vitest under
  `tests/lib/coaching-signature-utils.test.ts` — extend
  existing): (i) a coach with 0 prior parent-reports →
  empty `voice_anchors`; (ii) a coach with 2 prior reports
  → still empty (below MIN); (iii) a coach with 5 reports
  where "playing with her hands ready" appears in 3 of
  them → that phrase is in the top voice_anchors; (iv) a
  phrase containing a surname-shape ("Maya Walker is
  finding the ball") is filtered; (v) a phrase containing
  a banned token ("the kids are on an amazing journey") is
  filtered; (vi) the existing `top_skills` +
  `recurring_drills` + `typical_session_minutes` outputs
  are BYTE-IDENTICAL for every existing fixture (the
  optional widening per LESSONS#0103); (vii) the existing
  call-sites that do NOT pass `priorParentReports` get a
  signature with `voice_anchors: []` and otherwise
  unchanged output.

- [ ] Extend the `parentReport` prompt in
  `src/lib/ai/prompts.ts` (existing) to accept an OPTIONAL
  `coachingSignature?: CoachingSignature` parameter. When
  present AND `voice_anchors.length > 0`: append a SOFT-
  preference block at the END of the system prompt
  reading: "This coach has shipped parent reports before;
  they have used phrasings like: [<voice_anchors joined
  by ' / '>]. When the observation for THIS player
  matches one of these phrasings, lean on it; when it
  does not, write plain — never force a phrase that
  doesn't fit." When absent OR empty: the prompt is
  BYTE-IDENTICAL to the post-0066 behavior (LESSONS#0103
  optional-widening pattern). The block is instructed
  POSITIVELY per LESSONS#0023 (never enumerate the
  banned ban-list). The block lists the voice anchors as
  a single line; never as a numbered list (a numbered
  list invites the AI to use ALL of them, which is the
  opposite of the intent). (vitest AI contract test
  under `tests/ai/parent-report.test.ts` — extend
  existing): (i) the prompt with `coachingSignature`
  absent → BYTE-IDENTICAL to the post-0066 baseline
  (snapshot the existing prompt body); (ii) the prompt
  with `coachingSignature` present but
  `voice_anchors: []` → also BYTE-IDENTICAL (the empty
  branch is the cold-start path); (iii) the prompt
  with 3 voice_anchors → contains the "lean on" block
  with those anchors joined by ` / `; (iv) the prompt
  body contains NO AGENTS.md banned word per
  LESSONS#0023 (positive-instruction only — scan
  `${system}\n${user}` per the existing contract); (v)
  the prompt's response JSON shape is BYTE-IDENTICAL
  to today's (no new field on the response); (vi)
  cross-provider contract test under Anthropic + one
  fallback per the AGENTS.md AI contract.

- [ ] Extend the existing `/api/ai/parent-report` route
  (read its exact path at pickup per LESSONS#0096 —
  likely `src/app/api/ai/parent-report/route.ts` per
  the existing `/api/ai/*` convention) to: (a) read the
  coach's OWN prior `parent_report` plans across ALL
  their teams via service-role
  `from('plans').select('content_structured').eq(
  'coach_id', user.id).eq('type', 'parent_report').
  order('created_at', { ascending: false }).limit(40)`
  — capped at 40 so the read stays bounded; (b) pass
  those rows to the extended
  `buildCoachingSignature(plans, priorParentReports)`
  builder; (c) thread the resulting signature into the
  `parentReport` prompt's new optional parameter; (d)
  on a route failure to load the prior reports
  (network error, query error), DEGRADE GRACEFULLY —
  the prompt is called WITHOUT the signature, the
  parent-report generation succeeds, and the user
  sees the same artifact they would have seen before
  this ticket (best-effort posture per LESSONS#0036).
  Per LESSONS#0049 / #0092 / #0100 / #0110 — the
  route gains a NEW `from()` call (the prior-reports
  read) inside its existing `Promise.all` (if
  present) or as a parallel fetch; EVERY sibling
  test that mocks the route's supabase chain queue
  must be extended in the same PR (Glob
  `tests/api/parent-report*.test.ts` AND
  `tests/api/ai/parent-report*.test.ts` at pickup).
  Per LESSONS#0112 — if the route already does a
  `from('plans').select(...)` read for the existing
  prior-report continuity (0016 / 0066) AND
  cross-season (0034), check whether the EXISTING
  read can be widened (more columns, larger limit,
  filter on the broader `coach_id` rather than the
  team-scoped + player-scoped) to subsume the new
  query instead of adding a second `from()` call;
  if yes, take the LOWER-BLAST-RADIUS path. (vitest
  under `tests/api/parent-report-coaching-signature
  .test.ts` (new) or extend existing): (i) a coach
  with 5+ prior reports across multiple teams gets
  the signature threaded; (ii) a coach with 0
  prior reports gets the BYTE-IDENTICAL post-0066
  prompt; (iii) the read failure path falls back
  to the BYTE-IDENTICAL behavior; (iv) the read
  is scoped by `coach_id` (the cross-team
  semantic) NOT by `team_id`; (v) the route's
  `.select()` keysets are explicit allow-lists per
  LESSONS#0036 — never `select('*')`, never a
  field on the `players` row, never minor data.

- [ ] Tier / feature gating: NO new tier feature key.
  The existing parent-report tier gate (read at
  pickup per LESSONS#0096 — likely under
  `feature` key `report_cards` or `parent_sharing`
  in `tier.ts`) is unchanged. The voice-anchor
  enrichment is a quality improvement on the
  EXISTING tier-gated artifact, not a new
  surface. (vitest: the tier-gate posture is
  unchanged for free and for paid; assert via
  the existing gate test fixtures.)

- [ ] Privacy / COPPA contract: the voice-anchor
  extraction reads ONLY the coach-authored fields
  on the coach's OWN prior plan rows
  (`content_structured.highlights[]`,
  `content_structured.coach_note`). It NEVER
  reads the per-player `observations` table, NEVER
  reads `players` columns, NEVER reads parent
  contact info, NEVER reads DOB / medical_notes.
  The extracted phrases are surname-stripped per
  LESSONS#0061 (the AI's prior reports may have
  contained "Maya finished left" — the SURNAME
  shape is what's filtered, first names are kept
  because the phrase loses meaning without them).
  The voice-anchors threaded into the prompt are
  the SAME coach's prior phrases (the coach
  cannot leak another coach's voice into their
  reports). The route's `.select()` on
  `from('plans')` is an explicit allow-list per
  LESSONS#0036. (vitest: a planted prior report
  with "Maya Walker is finding the ball" → the
  extracted anchor is "is finding the ball" (or
  similar) with the surname stripped; planted
  DOB / parent_email / medical_notes columns are
  NEVER touched by the extraction; the extraction
  is scoped to the caller's `coach_id`.)

- [ ] Voice contract: per LESSONS#0023 — the
  enrichment block in the prompt is instructed
  POSITIVELY (no enumerated ban-list). The
  voice_anchors themselves are pre-filtered for
  banned tokens during extraction; the prompt
  block as built contains no banned word for any
  fixture. The defensive scan over
  `${system}\n${user}` is the load-bearing
  contract test. Per LESSONS#0034 — strip `--`
  comment lines from any scanned content before
  the banned-token sweep. (vitest: scan the
  prompt body across a matrix of signatures;
  scan the extraction output of a planted
  fixture that contains a banned word.)

- [ ] Regression: the existing 0016 parent-report
  continuity block, the existing 0034 cross-
  season block, the existing 0066 thin-week
  safety net are BYTE-IDENTICAL when the
  signature is absent (the empty path). The
  existing 0037 plan / arc / newsletter /
  pulse / pregame routes that consume
  `buildCoachingSignature` get a signature
  whose `voice_anchors` field is `[]` (when
  they pass no `priorParentReports`) and
  otherwise unchanged output — per the
  LESSONS#0103 optional-widening pattern, no
  caller is forced to change. The existing
  parent-report response JSON shape is BYTE-
  IDENTICAL (no new field on the response).
  (vitest: snapshot the named routes /
  prompts against the seeded fixtures pre-
  and post-change; assert no diff for the
  un-touched paths.)

- [ ] Cold-start safety: the route MUST handle
  the brand-new coach case (zero prior
  parent-reports) AND the long-tenured coach
  case (200+ prior reports) without
  performance regression. The 40-row LIMIT on
  the prior-reports read is the bound. The
  builder is O(n) on the limited input. The
  prompt block is bounded by the
  `MAX_SIGNATURE_VOICE_ANCHORS = 6` cap. The
  route adds ONE extra Supabase query per
  parent-report generation; this is a tier-
  gated path (already AI-cost-tier-gated) so
  the cost is bounded by the existing gate.
  (vitest: a brand-new coach generates a
  parent report (one of the existing 0016
  fixtures with 0 prior reports) — the
  prompt is BYTE-IDENTICAL to today; a
  long-tenured coach (a fixture with 50
  planted prior reports) — the read is
  bounded by the LIMIT, the prompt is
  bounded by the cap.)

## Out of scope

- A coach-facing "edit your voice anchors"
  settings UI. v1 is fully learned from the
  coach's persisted plan history; a manual-
  override surface is a separate ticket.
- A voice-anchor library across DIFFERENT
  coaches ("borrow another coach's voice").
  v1 is single-coach per the moat semantics;
  cross-coach voice borrowing would dilute
  the moat.
- A WEEKLY-DIGEST voice signal. v1 is
  parent-report only; the weekly-digest
  voice is a separate ticket if data shows
  it matters.
- A multi-language voice signal. v1 is
  English-only; i18n is org-tier scope.
- A re-render of HISTORICAL parent reports
  with the new voice signal. v1 is forward-
  only; the coach's old reports stay as-is.
- A "show the coach which of their phrases
  was used in this report" UI. v1 is
  invisible by design; the coach should
  feel the voice match, not be told "we
  used your phrase #4 here."
- A version 2 of `buildCoachingSignature`
  that reads observations directly. v1 is
  strictly plan-rows in / signature out —
  per the 0037 COPPA boundary, the
  signature never reads per-player
  observation text.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/coaching-signature-utils.ts`
  (existing — read first per LESSONS#0096)
  — extend `CoachingSignature` with the
  optional `voice_anchors: string[]`;
  extend `buildCoachingSignature` to
  accept the new optional
  `priorParentReports` input and extract
  the phrases. Per LESSONS#0061 — literal
  space, not `\s+`, in the surname guard.
  Per LESSONS#0023 — pre-filter banned
  tokens during extraction. Per
  LESSONS#0103 — optional widening means
  every existing call site stays byte-
  identical.
- `src/lib/ai/prompts.ts` (existing — read
  first per LESSONS#0096) — extend
  `parentReport` to accept the optional
  `coachingSignature` and append the
  SOFT-preference block when
  `voice_anchors.length > 0`. Per
  LESSONS#0023 — positive instruction
  only. Per LESSONS#0103 — the absent /
  empty branches keep the prompt byte-
  identical to the post-0066 baseline.
- `src/app/api/ai/parent-report/route.ts`
  (existing — read first per LESSONS#0096)
  — add the prior-reports read scoped by
  `coach_id` AND the signature threading.
  Per LESSONS#0036 — best-effort: a read
  failure degrades to today's behavior.
  Per LESSONS#0112 — check if the EXISTING
  prior-report read can be widened to
  subsume the new query (lower blast
  radius); if yes, do that instead of a
  new `from()` call. Per LESSONS#0049 /
  #0092 / #0100 / #0110 — if a new
  `from()` call is added, Glob every
  `tests/api/parent-report*.test.ts` AND
  `tests/api/ai/parent-report*.test.ts`
  and extend every `mockReturnValueOnce`
  queue.
- `src/types/database.ts` — NO new type
  (the existing `Plan` type covers the
  prior-reports read).
- `src/lib/tier.ts` — NO new feature key
  (the existing parent-report tier gate
  is unchanged).
- `tests/lib/coaching-signature-utils
  .test.ts` (existing — read first per
  LESSONS#0096) — extend with the seven
  new cases from the AC. Per
  LESSONS#0103 — verify the existing
  cases stay byte-identical.
- `tests/ai/parent-report.test.ts`
  (existing — read first per
  LESSONS#0096) — extend with the six
  new prompt cases from the AC. Per
  LESSONS#0023 — positive-instruction
  scan. Cross-provider per the
  AGENTS.md AI contract.
- `tests/api/parent-report-coaching-
  signature.test.ts` (new) OR extend
  the existing parent-report API test
  file at pickup. Per LESSONS#0055 —
  route handler call posture.
- `tests/api/parent-report*.test.ts`
  AND `tests/api/ai/parent-report*
  .test.ts` (existing — Glob at pickup
  per LESSONS#0110) — extend EVERY
  `mockReturnValueOnce` queue with the
  new from-chain IF a new `from()` is
  added; if the LESSONS#0112 widen-
  existing-read path is taken, no
  queue updates are needed.
- New deps: NO. Migration: NO. Env
  vars: NO new. AI prompt change: YES
  (extend existing `parentReport`
  prompt). Tier feature key: NO new
  key.
- LESSONS to anchor: #0020 / #38
  (.test.ts), #0023 (positive voice
  in prompt + pre-filter during
  extraction), #0034 (strip `--`
  comments from scanned content),
  #0036 (best-effort render +
  `.select()` allow-list), #0049 /
  #0092 / #0100 / #0110 (mock queue
  spillover — Glob every
  parent-report test), #0055 (route
  handler call posture), #0061
  (literal space, not `\s+`, in
  surname guard), #0096 (schema
  wins over prose — at pickup read
  the actual `/api/ai/parent-
  report` route path, the actual
  `parentReport` prompt signature
  in `prompts.ts`, the actual
  `buildCoachingSignature` builder
  in `coaching-signature-utils.ts`,
  the actual `content_structured`
  shape of persisted parent-report
  plans, the actual existing
  parent-report tier gate key),
  #0103 (optional widening avoids
  the literal-constructor / mock-
  queue sweep), #0112 (widen
  existing read to subsume new
  query when possible — lower
  blast radius than a new
  `from()` call).

## Implementation log

- 2026-06-06 [implementation-dev] Branch `feat/0070-parent-report-coach-voice-cross-team` off `main`. Status flipped to in-progress in same commit as README index row (LESSONS#42/#74).
- 2026-06-06 [implementation-dev] Read confirmed at pickup (LESSONS#0096): the actual route is `src/app/api/ai/parent-report/route.ts`; existing `from('plans').select(...)` reads in the route are scoped by `player_id` (0016) and `prior_player_id` (0034), NOT `coach_id` — so per LESSONS#0112 the existing reads CANNOT be widened to subsume the new `coach_id`-scoped voice-anchor read (different filter family). A NEW `from('plans')` call is required, and the sibling test queues need extension (LESSONS#0049 / #0092 / #0100 / #0110). The existing sibling tests that mock the chain queue are: `tests/ai/parent-report-continuity.test.ts`, `tests/ai/parent-report-cross-season.test.ts`, `tests/api/parent-report-route-thin-week.test.ts`. `tests/ai/parent-report-thin-week.test.ts` and `tests/ai/parent-report-cross-season-contract.test.ts` exercise the prompt directly via `PROMPT_REGISTRY` (not via the route) — no mock-queue update needed there.
- 2026-06-06 [implementation-dev] Parent-report tier gate confirmed: existing key is `parent_sharing` (free + paid all carry it per `src/lib/tier.ts` lines 22/29/36). The voice-anchor enrichment is a quality lift on the same gate — NO new tier feature key (per ticket).
