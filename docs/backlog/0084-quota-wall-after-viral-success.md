---
id: 0084
title: When a free coach hits the AI quota wall on the artifact a parent just forwarded or a coach just cloned, name THAT event in the upgrade prompt — not the generic limit copy
status: groomed
priority: P1
area: tier
created: 2026-06-15
owner: product-groomer
---

## User story

As a free-tier volunteer coach whose parent report from last Sunday was forwarded
to three other parents on a teammate team (0079 / 0080), whose closeout drill was
cloned by a coach in another program this week (0064 / 0076), and who just
opened the app at 7:09pm Tuesday to write THIS WEEK's parent report — only to
hit "Monthly AI limit reached" on the second generate — I want the upgrade
prompt to name the success that already happened ("Your last report was
forwarded by 3 parents on the Hawks; Coach plan keeps reports going") instead
of the same generic "Upgrade to Coach" headline the wall has shown me for the
last four months, so that the upgrade moment lands as "the thing you already
proved works costs $9.99 to keep going" instead of "you ran out, pay us."

## Why now (four lenses)

### Product Owner

Ticket 0035 shipped the QUOTA WALL RESUME — the free coach who hits the wall on
a specific artifact (parent_report / practice_plan / weekly_star / game_recap /
session_debrief) goes through Stripe and lands BACK on the exact artifact
surface with the player still selected. That is the funnel mechanics piece. What
0035 did NOT touch is the COPY at the wall: today the headline says "Upgrade to
Coach and finish Maya's report" (or the generic fallback). The shipped viral
loops (0064 publish-and-clone, 0076 stick-signal, 0079/0080 parent forward, 0078
dormant publisher reactivation) have produced a whole NEW class of "the coach's
work already traveled" event types that the wall has no idea exist. The
smallest meaningful unit of value is: at the moment the wall fires, the server
404 the most recent VIRAL EVENT attributable to the calling coach — a parent
forward on one of THEIR reports in the last 14 days, a clone of one of THEIR
drills in the last 14 days, a stick-signal thumb-up on one of THEIR drills in
the last 14 days, or a reputation milestone they crossed this month (0073 /
0074) — and thread a SHORT HONEST LINE describing that event onto the existing
`<AIUpgradePrompt>` props as a `socialProof` string. The wall's headline gains
ONE second-line under the existing artifact-named headline: "Your last
report was forwarded to 3 parents on the Hawks" or "A coach in the Hornets
program cloned your closeout drill last week." Nothing else changes — the
Stripe round-trip is byte-identical, the resume target is byte-identical, the
402 response shape is byte-identical. We do not invent new viral surfaces; we
make the existing wall WITNESS the ones the loop already shipped. We do not
add a new tier feature key. We surface what the user already earned.

### Stakeholder

This is the conversion-side companion to the entire 2-week viral wave the loop
just shipped. Every one of the 30 surfaces in 0054–0083 widened acquisition;
NONE of them widened the funnel surface that converts the resulting traffic.
Three moat compoundings, all asymmetric. (1) The conversion-rate compound — the
coach who hits the wall with a fresh "your work just traveled" social-proof line
is qualitatively different from the coach who hits it with the generic
"upgrade" headline; the former has already had their best moment witnessed BY
THE PRODUCT, the latter is being asked to pay for nothing they've seen yet.
Even a single-digit lift on the wall-to-Stripe conversion rate compounds
against every viral surface upstream. (2) The viral-surface-justifying compound
— the strategy audit (`docs/STRATEGY_AUDIT_2026-06-15.md`) explicitly named the
funnel asymmetry as the next theme: "the upgrade moment hasn't kept pace with
the viral surface area." This ticket is the smallest closing move — it reuses
the viral surfaces' OWN persisted signals (the `drill_share_clones` rows from
0064, the `drill_clone_stick_signals` from 0076, the `parent_forward_signals` /
`parent_forward_signals_cross_team` rows from 0079/0080, the
`coach_reputation_milestones` rows from 0073) instead of inventing a new
attribution path. (3) The honesty compound — the line is FACTUAL ("3 parents
forwarded" / "a coach in the Hornets program cloned") and is derived from
durable persisted rows, never an LLM hallucination; this matches the
AGENTS.md clipboard-voice contract and is structurally hard for a marketing-
copy competitor to fake. Distinct from 0035 (the resume mechanic), 0047 (the
in-app celebration on /home — that fires SEPARATELY when the inviter
re-opens the app, not on the wall), 0074 (the billing credit — that fires
when 3 qualified referrals cross, not on a single forward / clone / thumb).

### User (Tuesday 7:09pm, walking from car to gym, second generate of the month)

She taps "generate Maya's parent report" expecting it to fail because she
already used her 5 free AI calls. It does fail. But this time the upgrade
sheet does not lead with the same headline. The first line still says
"Upgrade to Coach and finish Maya's report" (0035 already does this). The
SECOND line — small, zinc-400, factual — reads: "3 parents on the Hawks
forwarded your last report this week." That is true; she has been seeing the
0079 / 0080 confirmation cards on the parent portal. She does not have to
trust marketing copy. She knows it landed. She taps Upgrade. She finishes
Maya's report. The whole interaction is 35 seconds longer than the generic
wall would have been — but it lands. If she has no viral event in the last
14 days, the social-proof line is ABSENT (silence beats fabrication) and the
sheet renders exactly as 0035 ships it today. On a flaky gym wifi the
social-proof line is a single short string from one API call; if it fails to
fetch in 800ms the sheet renders without it (graceful degrade — the upgrade
path itself is never blocked by the proof line being absent).

### Growth

The "show me" moment is internal to the conversion funnel but real: a coach
who upgrades because the wall named their forward is a coach who tells the
NEXT coach "the app told me parents had forwarded my report — that's when I
paid." That is the testimonial that sells freemium-to-paid in a youth-sports
coaching market where every competitor's wall is the same generic upsell.
Every converted coach is also a still-firing node in the viral graph (their
publishes / drills / reports keep traveling), so a conversion at this wall
also re-funds the surfaces it leveraged. The single-tap screenshot of the
sheet with the social-proof line is the artifact a converted coach DOES
forward to a coach friend in a way the generic wall never produced.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper `src/lib/viral-social-proof.ts` exports
  `buildViralSocialProof(args: { events: ViralProofEvent[]; nowMs: number }):
  { line: string; eventKind: string } | null`. `ViralProofEvent` is a closed
  enum of `kind`s: `parent_forward_on_team`, `parent_forward_cross_team`,
  `drill_clone`, `drill_stick_signal`, `reputation_milestone`. The helper
  picks the SINGLE strongest event in a 14-day window (priority order:
  `reputation_milestone` > `drill_stick_signal` > `parent_forward_cross_team`
  > `parent_forward_on_team` > `drill_clone`; ties broken by recency), formats
  ONE short string per kind (e.g. `parent_forward_on_team` → `"<N> parents on
  the <team_name> forwarded your last report this week"`,
  `parent_forward_cross_team` → `"a parent on a teammate team forwarded your
  last report this week"`, `drill_clone` → `"a coach in the <program_name>
  program cloned your <drill_title> this week"`, `drill_stick_signal` → `"a
  coach who cloned your <drill_title> thumbed it up after running it"`,
  `reputation_milestone` → `"your work was cloned by coaches in <M> programs
  this month"`), and returns `null` when the events array is empty or every
  event is older than 14 days. The strings never name a parent by full name
  (first name + "on the <team_name>" only), never name the cloning coach by
  name (only the cloning PROGRAM — the 0073 consent posture). Pure function,
  reads no DB. (vitest under `tests/lib/viral-social-proof.test.ts` — new):
  (i) empty events → `null`; (ii) only events older than 14 days → `null`;
  (iii) one parent_forward_on_team in window → renders the on-team string;
  (iv) one drill_clone + one drill_stick_signal in window → returns the
  stick_signal (higher priority); (v) reputation_milestone beats everything
  else; (vi) the rendered string contains NO AGENTS.md banned word for a
  matrix of names / numbers / kinds; (vii) the rendered string never
  contains a parent's surname (literal-space guard per LESSONS#0061); (viii)
  the rendered string never names a cloning coach (only the program); (ix)
  deterministic across input order; (x) the line is capped at 140
  characters (defensive — every variant fits with room).

- [ ] A new `GET /api/coach/viral-social-proof` (new, authed) returns
  `{ line: string | null, eventKind: string | null }` for the calling
  coach. The route: (a) reads `drill_share_clones` joined to `drill_shares`
  WHERE the share publisher = `user.id` AND `cloned_at` is within 14 days,
  resolves the cloning coach's `org_id` → `organizations.name` per
  LESSONS#0078; (b) reads `drill_clone_stick_signals` for shares published
  by `user.id` in 14 days; (c) reads `parent_forward_signals` AND
  `parent_forward_signals_cross_team` for plans authored by `user.id` in
  14 days, grouped by the SOURCE team_id, counting distinct
  forwarder_parent_email_hashes per LESSONS#0084 (one team gets ONE event
  with `count: N`); (d) reads `coach_reputation_milestones` for `user.id`
  in 14 days; (e) calls `buildViralSocialProof`; (f) returns the result.
  Per AGENTS.md rule 3 — service-role for the cross-coach reads; the
  caller is the publishing coach (the row owner). Per LESSONS#0036 —
  `.select()` allow-lists; NEVER reads a parent's email, a parent's full
  name, a player's DOB, a player's jersey, a player's medical_notes.
  Per LESSONS#0049 / #0092 / #0100 / #0110 — Glob `tests/api/*forward*.test.ts`
  AND `tests/api/*drill*.test.ts` AND `tests/api/*reputation*.test.ts`
  at pickup and extend every queue. Per LESSONS#0057 — team-ownership
  reads through `team_coaches` only. Per LESSONS#0080 — chain mocks
  filter on `.in()` args. (vitest under
  `tests/api/coach-viral-social-proof.test.ts` — new): (i) coach with
  no events → `{ line: null, eventKind: null }`; (ii) coach with a 20-
  day-old clone but nothing fresher → `null`; (iii) coach with one
  fresh parent_forward_on_team → the on-team line; (iv) coach with one
  fresh drill_clone + one fresh stick_signal → the stick_signal line;
  (v) coach with a reputation_milestone → that line beats everything;
  (vi) the route NEVER reads a parent_email / parent_phone / DOB
  (assert via mock-call inspection); (vii) the cloning coach's
  full_name is NEVER read (only the org_id); (viii) an unauthed caller
  → 401.

- [ ] `src/components/ui/ai-upgrade-prompt.tsx` accepts a new OPTIONAL
  `socialProof?: { line: string; eventKind: string }` prop. When
  supplied, the component renders ONE short second-line UNDER the
  existing artifact-named headline (zinc-400, 13px, no icon, no
  button — pure factual line), with a `data-testid="upgrade-prompt-
  social-proof"` for scoped e2e per LESSONS#0029 / #0082. When the
  prop is absent, the component renders BYTE-IDENTICAL to today
  (no DOM change, no new element). Per AGENTS.md voice contract —
  no banned word; instruct positively in the prop's TypeScript
  jsdoc ("a short factual line describing a recent viral event,
  rendered alongside the upgrade headline"). Per LESSONS#0103 —
  the new prop is OPTIONAL so every existing caller stays
  byte-identical. (vitest under `tests/components/ai-upgrade-
  prompt-social-proof.test.tsx` — new): (i) `socialProof` absent
  → component DOM is byte-identical to the 0035-baseline snapshot;
  (ii) `socialProof: { line: 'X parents on the Y forwarded your
  last report', eventKind: 'parent_forward_on_team' }` → the
  line renders inside the data-testid container; (iii) the
  rendered line contains no banned word across the matrix of
  fixture lines; (iv) the existing `resume` + `resumeLabel` props
  continue to behave exactly as 0035 wires them.

- [ ] The dashboard surface(s) that fire `<AIUpgradePrompt>` on
  a 402 wall (read at pickup per LESSONS#0096 — at minimum
  `src/app/(dashboard)/capture/review/page.tsx`, plus any
  artifact surfaces wired by 0035 — `parent_report`, `practice_
  plan`, `weekly_star`, `game_recap`, `session_debrief`) fetch
  the social-proof line via the new GET route the FIRST time the
  402 fires in a session, then pass `socialProof` through to the
  prompt. The fetch has a 1.2-second timeout; on timeout, network
  error, or `{ line: null }`, the prompt renders without the line
  (graceful degrade per LESSONS#0036). The fetch is debounced to
  once per session (no re-fetch on every prompt render). Per
  LESSONS#0065 / #0066 / #0162 — smallest possible touch on the
  shared 402-handling code (the social-proof fetch is added in
  ONE place, not per-surface). (vitest under `tests/components/
  ai-upgrade-prompt-fetch.test.tsx` — new): (i) the prompt renders
  on a 402, the social-proof fetch fires once; (ii) the fetch
  resolves `{ line: 'X parents forwarded …' }` → the line shows;
  (iii) the fetch resolves `{ line: null }` → no line; (iv) the
  fetch times out → no line, the upgrade button is still
  rendered; (v) opening the prompt twice in the same session
  does not re-fetch.

- [ ] Tier / feature gating: the social-proof line is rendered
  for FREE-tier callers only (a paid coach hitting a 402 on
  some other surface — e.g. a per-tier feature wall, not the
  AI quota — does not see the proof line; the route returns
  `{ line: null }` for paid tiers because they are not in the
  conversion target). NO new tier feature key. Per AGENTS.md
  rule 5 — the server-side check is in the route (does NOT
  read social proof for paid tiers); the client side is
  defense-in-depth (the prompt is only mounted on the 402
  branch, which only fires for free coaches at quota).
  (vitest: the route returns `{ line: null }` for a coach
  whose org tier is `coach` / `pro_coach` / `organization`,
  regardless of viral activity.)

- [ ] Privacy / COPPA contract: the route NEVER reads
  `players.date_of_birth`, `players.medical_notes`,
  `players.parent_email`, `players.parent_phone`,
  `players.jersey_number`, `players.full_name`. The
  rendered line NEVER contains a parent's full name (first
  name + "on the <team_name>" only), NEVER contains a
  cloning coach's name (program-name attribution only per
  LESSONS#0073), NEVER contains a player's name. Per
  LESSONS#0036 / #0070 — `.select()` allow-lists and never
  mutate a DB row reference. (vitest: planted DOB /
  medical_notes / parent_phone / player_full_name on the
  queried rows are NEVER read; the rendered line passes
  a regex sweep for parent surnames, player names, and
  cloning-coach names.)

- [ ] Voice contract: every rendered variant of the line
  contains NO AGENTS.md banned word (per LESSONS#0023
  instruct positively in the helper's jsdoc, never embed
  a verbatim ban-list). The numeric ranges (1-9 parents,
  1-99 clones, 2-15 programs) all render cleanly. The
  oxford-comma + "and" conjunction matches the 0047 / 0074
  string posture for first-name lists. (vitest: render
  every variant across the kind / count / name matrix
  and scan the rendered text.)

- [ ] Regression: the existing 0035 quota-wall resume flow
  is BYTE-IDENTICAL when the new prop is absent — same
  402 response, same Stripe `success_url`, same post-
  checkout landing, same cancel-path. The existing
  AIUpgradePrompt callers that do NOT pass `socialProof`
  render byte-identical to today. The 402 contract in
  `src/lib/ai/error.ts` is BYTE-IDENTICAL. (vitest:
  snapshot the named routes / components against
  seeded fixtures pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture: seed extension is
  — pre-mint THREE rows for the existing E2E coach: ONE
  `drill_share_clones` row (with the cloning coach's
  `org_id` pointing to a seeded organization named
  "Hornets U10" so the rendered line is deterministic),
  ONE `drill_clone_stick_signals` row tied to the same
  share, ONE `parent_forward_signals` row on a seeded
  parent_report plan. All three within 14 days of the
  test run (`now() - interval '3 days'`). Per
  LESSONS#0084 / #0101 — idempotent block, UUIDs in
  the next free range, auth.users rows for any new
  coaches. Playwright spec: (a) sign in as the E2E
  coach (free tier, AI quota artificially set to 0 in
  the seeded org row so the next generate hits the
  wall — DO NOT seed past-the-wall AI call rows
  unless the seed already supports it; read 0035's
  e2e for the existing pattern), (b) navigate to the
  artifact surface that fires the prompt (the 0035
  e2e's parent_report surface is the reference path),
  (c) trigger the generate, (d) assert the upgrade
  sheet appears AND the data-testid `upgrade-prompt-
  social-proof` container is visible AND contains the
  expected stick-signal line (the highest-priority
  event among the three seeded). Scope every
  assertion by data-testid per LESSONS#0081 / #0082.
  Skip when E2E creds are unset.

## Out of scope

- A new "celebration card" on /home for the viral event itself.
  0047 / 0073's reputation card / 0079 / 0080 / 0081 all already
  fire in-app cards on the SEPARATE re-open moment. This ticket
  ONLY threads the line onto the quota wall; the in-app celebration
  is its own surface.
- A push notification or email when the viral event fires. The
  social-proof line is rendered only at the wall, in-session, when
  the free coach is already mid-task. A separate email/push is its
  own ticket with its own consent surface.
- A new viral event TYPE. This ticket reuses the five existing
  persisted row types (clones, stick-signals, forwards-on-team,
  forwards-cross-team, reputation milestones). A new event type
  (e.g. a "follow" from 0063) is a separate widening.
- A change to the 402 quota response shape in
  `src/lib/ai/error.ts`. The 402 contract is unchanged; the social-
  proof line is fetched CLIENT-side from a separate route.
- A retroactive sweep of pre-ticket viral events for already-
  converted paid coaches ("we should have shown them this when
  they upgraded"). The line is shown only to free coaches at the
  wall.
- A line that aggregates ACROSS event kinds ("3 forwards AND 2
  clones AND a stick signal"). v1 picks the SINGLE strongest
  event per the priority order; aggregation is a v2 if data
  shows it converts better.
- An A/B test framework for the line copy. v1 ships ONE copy
  per kind from the helper; a copy-test is its own ticket and
  needs the analytics surface the audit memo flagged is
  missing.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/viral-social-proof.ts` (new) — pure helper. Mirrors the
  shape of `src/lib/referral-credit-utils.ts` (0074),
  `src/lib/coach-reputation-utils.ts` (0073),
  `src/lib/coach-reactivation-utils.ts` (0072). Closed enum of
  event kinds; priority sort; line formatters per kind. Per
  LESSONS#0061 — literal space on defensive surname-strip.
- `src/app/api/coach/viral-social-proof/route.ts` (new) —
  `GET(request)`. Authed via `createServerSupabase()` for auth,
  service-role for the cross-table reads. Per LESSONS#0036
  allow-lists. Per LESSONS#0049 / #0092 / #0100 / #0110 mock-
  queue sweeps. Per LESSONS#0080 — chain mocks must filter on
  `.in()` args. Per LESSONS#0057 — team-coaches not teams.coach_id.
- `src/components/ui/ai-upgrade-prompt.tsx` (existing — read first
  per LESSONS#0096). Add the OPTIONAL `socialProof` prop with
  `data-testid` per LESSONS#0029 / #0082. Per LESSONS#0103 —
  optional widening so every existing caller stays byte-identical.
- Caller surfaces — at minimum
  `src/app/(dashboard)/capture/review/page.tsx`; read 0035's
  Implementation log at pickup to confirm which other
  artifact surfaces actually wire the prompt vs. gate via
  `<UpgradeGate>`. The fetch + threading lives in ONE shared
  client hook (`src/hooks/use-viral-social-proof.ts` — new),
  not per-surface. Per LESSONS#0065 / #0066 / #0162 — smallest
  possible touch on each shared surface.
- `src/lib/tier.ts` — NO change. NO new feature key.
- `src/components/ui/upgrade-gate.tsx` — NO change.
- `src/lib/ai/error.ts` — NO change. The 402 contract is stable
  (per 0035's hand-off discipline).
- `tests/lib/viral-social-proof.test.ts` (new).
- `tests/api/coach-viral-social-proof.test.ts` (new).
- `tests/components/ai-upgrade-prompt-social-proof.test.tsx` (new).
- `tests/components/ai-upgrade-prompt-fetch.test.tsx` (new).
- `tests/hooks/use-viral-social-proof.test.ts` (new) — debounce +
  timeout behavior.
- `tests/e2e/quota-wall-social-proof-flow.spec.ts` (new). Seed
  extension per the AC. UUIDs in the next free range per
  LESSONS#0101. Skip when E2E creds are unset.
- New deps: NO. Migration: NO (every row read already exists).
  Env vars: NO. AI prompt change: NO. Tier feature key: NO.
- LESSONS to anchor: #0023 (positive voice), #0029 / #0082
  (data-testid scoping), #0036 (best-effort reads,
  `.select()` allow-lists), #0049 / #0092 / #0100 / #0110
  (mock-queue spillover sweep), #0057 (team_coaches), #0061
  (literal space on defensive scans), #0070 (no mutate of
  DB row references — spread to new object), #0073 (consent
  posture: program-name attribution for cloning coaches),
  #0078 (cloning coach → org_id → organizations.name path),
  #0080 (chain mocks filter on `.in()` args), #0082 (parent
  reaction first-name only), #0096 (schema wins over prose
  — read the actual `<AIUpgradePrompt>` props shape and
  the actual 0035 caller wiring at pickup), #0103 (optional
  widening), #0116 (empty-Glob sweep is a no-op),
  STRATEGY_AUDIT_2026-06-15.md (Free → Paid conversion
  friction theme).

Depends on: 0035 (shipped — the resume mechanic; this builds the
social-proof copy layer on top), 0064 / 0076 (shipped — the drill
clone + stick-signal rows), 0073 (shipped — reputation milestone
rows), 0079 / 0080 (shipped — parent forward rows).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0084-quota-wall-after-viral-success` opened
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
