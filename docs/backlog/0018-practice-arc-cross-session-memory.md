---
id: 0018
title: Make the Practice Arc remember itself — surface "what carried forward" at the next practice
status: shipped
priority: P1
area: plans
created: 2026-05-22
owner: product-groomer
---

## User story

As a volunteer coach who generated a 3-practice arc on defense, I want my next practice
plan to know it's session 2 of that arc and to pick up exactly where session 1 left off —
without me re-typing what we did last time — so that the app feels like a coach who remembers
my team, not a form that forgets everything between Tuesdays.

## Why now (four lenses)

### Product Owner
We already generate `practice_arc` (`POST /api/ai/practice-arc`), a coherent 2–3 session
progression where the prompt is explicitly built to carry skills forward: each session has a
`carries_forward` sentence, a `key_coaching_point`, and the arc has an arc-level
`progression_note`. The artifact is saved as a `plans` row of `type='practice_arc'`. But the
memory it produces goes nowhere: the regular practice-plan generator
(`PROMPT_REGISTRY.practicePlan` via `POST /api/ai/plan`) does not read the most recent arc,
and nothing on the coach's surfaces tells them "you're in session 2 of 3 — last time you
introduced closeouts, today you build on them." The arc is generated once and then forgotten
the moment the coach closes the page. The smallest meaningful unit of value is to make the
active arc *legible and continuous*: surface the current arc position to the coach, and feed
the prior session's `carries_forward` into the next plan generation so the AI continues the
story instead of starting over.

### Stakeholder
This is the Practice Arc cross-session-memory moat — named in the product brief as a core
differentiator — made real for the first time. Today the arc is a one-shot generation; a
forms-app competitor can copy a one-shot "generate a 3-week plan" button. What they cannot
copy is an app that *remembers across sessions*: that knows this is the second practice of a
running progression and threads the prior session's coaching point into the next one. That
continuity is the thing that turns a generator into a coach, and it is the hardest part of
the moat to replicate because it depends on our accumulated structured artifacts, not a
single prompt.

### User (at 5:45pm on a Tuesday, 12 kids on a court)
The coach opens the plan for today's practice. At the top, one quiet line: "Session 2 of 3 —
Defense Arc · last time: introduced closeouts." When they tap "generate today's plan," it
already continues from there — no re-typing what happened last week, no scrolling back through
old plans. If there is no active arc, nothing changes and the surface is identical to today.
The continuity read is best-effort: if the prior arc can't be loaded on a flaky gym wifi, plan
generation still works exactly as it does now (continuity must never block a plan).

### Growth
The retention story is the whole point: an app that remembers your team across sessions is an
app you come back to every practice, because starting from scratch every Tuesday is exactly
the friction that makes coaches abandon coaching apps. The "show me" moment is subtle but
sticky — a coach showing another coach "look, it knew it was session 2 and picked up where I
left off" is the demo that separates SportsIQ from every forms app the rival coach already
tried and quit. There is no new viral artifact here; this is a deep retention/moat ticket,
and it earns its P1 by making the most-used planning path feel like memory instead of amnesia.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `GET /api/ai/practice-arc/active?teamId=<id>` (new) returns `200` with the most recent active `practice_arc` plan for the team, including its `arc_title`, `total_sessions`, and the per-session `carries_forward` / `key_coaching_point` / `theme` data from `content_structured`, plus a computed `currentSessionNumber` derived from how many practice sessions the team has logged since the arc was created; returns `200 { active: null }` when the team has no `practice_arc` plan.
- [ ] `GET /api/ai/practice-arc/active` with no auth returns `401` and performs no DB read.
- [ ] `GET /api/ai/practice-arc/active` is team-scoped: a `practice_arc` plan for a team the caller does not coach is not returned (vitest with a seeded other-team arc; assert `active: null` or 403, whichever the route's existing ownership pattern uses).
- [ ] `POST /api/ai/plan` accepts an optional `arcContext` (the prior arc session's `carries_forward` + `key_coaching_point`) and, when present, threads it into `PROMPT_REGISTRY.practicePlan` so the generated plan references the carried-forward focus; when absent, the prompt is byte-identical to today's output (regression: existing plan generation is unchanged when no arc context is passed).
- [ ] The continuity read is non-blocking: when `GET /api/ai/practice-arc/active` fails or times out, `POST /api/ai/plan` still generates a plan (vitest/Playwright — plan generation never depends on the arc read succeeding).
- [ ] Playwright: on `/plans`, when an active `practice_arc` exists for the team, a continuity line is visible showing the arc title and the current session position (text matching `/session \d+ of \d+/i`); when no arc exists, that element is absent and the page renders normally.
- [ ] Contract test: the `practicePlan` prompt, when given `arcContext`, produces structurally-valid plan JSON under at least Anthropic AND one fallback provider (extend the existing `tests/ai/` plan contract coverage; the prompt change must hold across providers since `callAIWithJSON` routes per-org).
- [ ] Regression: `POST /api/ai/practice-arc` still generates and saves a `practice_arc` plan exactly as today (the generator route is unchanged except, optionally, that the new active-arc read can find it).

## Out of scope

- Auto-generating session 2/3 of the arc without the coach asking. The coach still taps to
  generate each practice; this ticket gives that generation *memory*, it doesn't make it
  automatic.
- A full multi-session scheduler / calendar. `currentSessionNumber` is derived from logged
  sessions or a simple stored counter — do not build a scheduling UI.
- Persisting per-session "completed" state with new schema if it can be derived. Prefer
  computing the current position from existing `sessions` rows for the team since the arc's
  `created_at`. Only add a stored pointer (e.g. an `arc_session_index` on the arc plan's
  `content_structured` or a small column) if derivation is genuinely ambiguous — and if so,
  document the reason in the implementation log.
- Surfacing arc continuity on Capture. This ticket targets `/plans` (the planning surface).
  A Capture-side "you're in an arc" nudge is a separate, smaller follow-up if this performs.
- Changing the arc prompt's session count rules (still 2 or 3, validated by
  `isValidSessionCount`).
- Any per-minor data exposure. The arc and plan artifacts are team-level; no new player fields
  are read or written.
- A new tier gate. Arc generation already flows through the existing AI-quota enforcement in
  `callAI()`; the active-arc read is a lightweight continuity helper, not a gated feature.

## Engineering notes

- `src/app/api/ai/practice-arc/active/route.ts` (new) — `GET`. Auth via
  `createServerSupabase().auth.getUser()` → 401; then `createServiceSupabase()`. Read the most
  recent `plans` row where `team_id = ?` AND `type='practice_arc'`, `order by created_at desc
  limit 1`. Verify the caller coaches the team using the same ownership pattern the existing
  team-scoped routes use (e.g. the `coaches.org_id` / `teams.coach_id` checks already present in
  `src/app/api/ai/practice-arc/route.ts`). Compute `currentSessionNumber` from the count of
  `sessions` rows for the team with `date >= arc.created_at` (clamped to `[1, total_sessions]`).
- `src/app/api/ai/plan/route.ts` — accept an optional `arcContext` in the request body and pass
  it through to the prompt call. Confirm the exact route path/handler that calls
  `PROMPT_REGISTRY.practicePlan` (the plan generator) and thread the new field there; the call
  already goes through `callAIWithJSON` with `orgId` for quota + provider routing — do NOT bypass
  it.
- `src/lib/ai/prompts.ts` — `practicePlan` already accepts `focusSkills` and builds an
  `insightsBlock`. Add an optional `arcContext?: { carriesForward?: string; keyCoachingPoint?:
  string; sessionNumber?: number; totalSessions?: number; arcTitle?: string }` param and, when
  present, append a short "ARC CONTINUITY" block to the `user` prompt (e.g. "This is session N
  of M in the '<arc_title>' arc. Last session carried forward: <carriesForward>. Continue that
  progression today; lead with the key coaching point: <keyCoachingPoint>."). When the param is
  absent, the `.filter(Boolean)` join must produce byte-identical output to today (assert this in
  a prompt unit test).
- `src/app/(dashboard)/plans/page.tsx` — fetch the active arc with the existing client patterns
  (a TanStack `useQuery` hitting `/api/ai/practice-arc/active`, or `query()` if it fits the
  allow-list; never call Supabase directly from the client — AGENTS.md rule 3). Render a compact
  continuity line near the plan-generation control showing the arc title and "Session N of M ·
  last time: <carries_forward>". The line renders nothing when `active` is null or the read fails
  (best-effort, never blocks generation). Match the dark zinc/orange aesthetic; no banned words.
- Plans table columns (from `supabase/migrations/001_schema.sql` + `032_plans_session_id.sql`):
  `id, team_id, coach_id, player_id, ai_interaction_id, type, title, content, content_structured,
  curriculum_week, skills_targeted, is_shared, share_token, share_expires_at, session_id,
  created_at`. `practice_arc` plans store the full arc in `content_structured`. `plans_type_check`
  already allows `practice_arc` (the route writes it today, and the CI seed exercises it) — do
  NOT widen the constraint without confirming it's actually rejected on a fresh DB.
- `tests/ai/practice-arc-active.test.ts` (new, `.test.ts` not `.spec.ts`; LESSONS.md) — mock
  `createServiceSupabase` with seeded `plans` + `sessions`; assert the active-arc shape, the
  `currentSessionNumber` computation, the no-arc `{ active: null }` case, the 401 no-auth case,
  and team-scoping.
- `tests/ai/plan.test.ts` (extend) + the existing `tests/ai/` plan contract coverage — assert
  the `practicePlan` prompt threads `arcContext` when present and is unchanged when absent, and
  add the multi-provider contract box (Anthropic + one fallback) for the arc-context path.
- `tests/e2e/` — a Playwright spec for the `/plans` continuity line (present with a seeded active
  arc, absent without), run against the 0006-seeded Supabase. Seed a `practice_arc` plan + a
  couple of `sessions` rows in `tests/e2e/fixtures/seed.sql` so `currentSessionNumber` resolves
  deterministically (server component → seed-backed assertions; LESSONS.md 2026-05-21).
- New deps: no. Migration: prefer NO migration (derive `currentSessionNumber`); only add one if
  derivation is genuinely ambiguous, with a documented reason and a unique version prefix. Env
  vars: no. AI prompt change: YES — `practicePlan` in `src/lib/ai/prompts.ts` (additive, optional
  param). Tier feature key: no.

## Implementation log

(Appended by the implementation-dev agent during execution.)
