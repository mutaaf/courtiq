---
id: 0031
title: Let a program director set one weekly focus that shows up in every coach's Capture and practice plan
status: groomed
priority: P2
area: plans
created: 2026-05-25
owner: product-groomer
---

## User story

As a program director who wants the whole league working on the same thing this week (say,
"spacing and off-ball movement"), I want to set one weekly focus that quietly shows up at the
top of every one of my coaches' Capture screens and gets woven into the practice plans the AI
makes for them, so that my program actually moves together instead of twelve coaches each
doing their own thing.

## Why now (four lenses)

### Product Owner
A program director on the Organization tier can invite their staff (0024) and read a pulse of
who is active (0028), but they have no way to *direct* the program — to say "this week, every
team works on X." Today the only lever is a group text the coaches forget by Tuesday. The
smallest meaningful unit of value is one director-set "weekly focus" string, scoped to the
org, that surfaces as a single line at the top of every org coach's Capture screen ("Program
focus this week: spacing & off-ball movement") and is passed as a soft hint into the practice-
plan / practice-arc generator the coach already uses. The director sets it once; it propagates
to every coach with zero work on their side. It reuses the existing System→Org→Team config
cascade (`src/lib/config/resolver.ts`) rather than inventing a new mechanism, so it is one
org-scoped config value, not a new subsystem.

### Stakeholder
This deepens two named moats at once at the highest-value account. It strengthens the org
roll-up moat by turning the director from a passive dashboard-reader into the person who
actually *runs* the program through SportsIQ — a genuine multi-coach network effect, because
one director's intent now shapes every coach's day. And it deepens the structured-artifact /
Practice Arc moat by letting the program's focus flow INTO the AI plans coaches generate, so
the artifacts a forms app cannot produce now also carry the program's direction. A director
whose whole league's weekly focus lives in SportsIQ has switching costs no group chat can
manufacture — losing the app means losing the instrument they steer the program with.

### User (the director Sunday night; the coach Tuesday at 5:45pm)
The director, planning the week, opens the org settings, types one line — "spacing & off-ball
movement" — and saves. Done. Tuesday, every coach opens Capture and sees, above the input, a
quiet single line: "Program focus this week: spacing & off-ball movement." No popup, no
dismiss-to-continue, no extra tap before they can capture — it is a label, not a gate. When
that coach taps "make a practice plan," the plan leans toward the program focus without the
coach typing anything. If the director set nothing, the line is simply absent and Capture
looks exactly as today.

### Growth
This is an org-tier retention and expansion lever aimed at the account most expensive to win
and most valuable to keep. A director who steers their league through SportsIQ each week keeps
paying for the Organization tier and keeps every coach under them on the platform — org churn
is the most damaging churn we have, and this is a direct hedge against it. The "show me"
moment lands with a league board or a fellow director: "I set the focus once and it shows up
for all twelve of my coaches and even shapes the plans the AI makes them." It is distinct from
0024 (invite) and 0028 (read-only pulse): this is the first surface where the director's intent
*acts on* every coach's daily workflow.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `POST /api/org/weekly-focus` (or the org-config mutate path) with an authenticated org admin and `{ orgId, focus }` persists the focus as an org-scoped config value, and `GET` returns it for coaches of that org; the value is read through the existing `resolveConfig` cascade (`src/lib/config/resolver.ts`) as an org override, not a new bespoke store (vitest asserts set-then-get round-trips through the org config path).
- [ ] Authorization is server-side and role+tier scoped: setting the focus requires the caller to be an `admin` of the org (`coaches.role === 'admin'` for that `org_id`) AND the org tier to satisfy `canAccess(tier, 'feature_program_focus')`; a non-admin org coach setting the focus returns `403`, a coach of a different org returns `403`/`404`, and a non-org tier returns `403` (vitest asserts BOTH the role and tier checks run in the route, not only in the UI).
- [ ] A coach (any role) of the org can READ the current focus for display, but a coach of a different org reading it gets their own org's value or none — the focus never leaks across orgs (vitest asserts cross-org read isolation).
- [ ] Playwright: a coach in an org that has a weekly focus set sees a single "Program focus this week: <focus>" line at the top of `/capture`; a coach in an org with no focus set sees no such line, and in NEITHER case is the capture input blocked, gated, or made to require a tap-to-dismiss (the line is a label, never a gate).
- [ ] The practice-plan / practice-arc generator receives the program focus as a soft hint when one is set: the route building the plan prompt includes the focus string in the prompt params, and produces no different output shape (still parses against the existing plan/arc schema) when it is absent (vitest asserts the focus is threaded into the prompt params when present and omitted cleanly when absent; the schema contract is unchanged).
- [ ] Privacy/COPPA: the weekly focus is a free-text coaching topic set by an adult director and carries NO per-minor data; it is org-scoped config, adds no field to `players`, and is never placed on any public/no-auth surface (vitest asserts the value is stored in org config only and the public/share routes do not read it).
- [ ] Server-side tier gate is real, not UI-only: `canAccess('organization', 'feature_program_focus') === true` and `canAccess('pro_coach', 'feature_program_focus') === false`, and the set route rejects a non-org tier even if the request is hand-crafted (vitest on `src/lib/tier.ts` + the route).

## Out of scope

- A multi-focus calendar, scheduling focuses ahead, or focus history/analytics. v1 is ONE
  current weekly-focus string the director sets and replaces; a schedule or history is a
  separate ticket.
- Per-team or per-coach override of the program focus in v1. The config cascade
  (`resolveConfig`) technically supports a team override, but v1 sets and reads it at the ORG
  scope only; exposing a per-team override UI is a follow-on.
- Forcing the focus into the plan as a hard constraint. It is a SOFT hint in the prompt params —
  the AI weaves it in but is not required to build the entire plan around it, and the plan
  schema does not change. No new required field, no schema migration.
- Notifying or messaging coaches that a new focus was set (no email, no push). v1 surfaces the
  focus passively at Capture and in the plan generator; a delivered notification would need an
  explicit channel-approval line per AGENTS.md.
- Any public, parent-facing, or coach-to-coach-referral surface for the focus. It is a
  director-private org-internal direction, never placed on `/share/[token]`, `/org/[slug]`,
  `/coach/[token]`, or any no-auth route.
- A new analytics SDK or tracker. PostHog already exists; do not add new event types.

## Engineering notes

- Storage — use the EXISTING System→Org→Team config cascade rather than a new table. Read via
  `resolveConfig` from `src/lib/config/resolver.ts` with the focus as an org override (a
  `org_config` / org-overrides row keyed by a `programFocus.current` domain/key, following how
  org overrides are already loaded for the resolver). If the org-config write path is the
  generic `/api/data/mutate` allow-list, add the org-config table there; otherwise add a small
  dedicated `src/app/api/org/weekly-focus/route.ts` (`POST` set + `GET` read) that uses
  `createServerSupabase().auth.getUser()` → 401, then `createServiceSupabase()`. Prefer the
  cascade over a bespoke column so it composes with the existing config system.
- Authorization — mirror the org-admin gate already used by `/admin/org-analytics` and the
  0028 program-pulse route: resolve the caller's `coaches.org_id` + `role` + org `tier`;
  enforce `role === 'admin'` for the requested `orgId` → 403, AND
  `canAccess(tier, 'feature_program_focus')` → 403. A cross-org `orgId` → 403/404 (whichever the
  existing org-scoped routes use). The READ for display is allowed to any coach of the org.
- `src/lib/tier.ts` — add `'feature_program_focus'` to the `features` array for `organization`
  ONLY (NOT free/coach/pro_coach — it is an org-direction surface). Add a vitest asserting
  `canAccess('organization', 'feature_program_focus') === true` and `canAccess('pro_coach', …)
  === false`.
- `src/components/ui/upgrade-gate.tsx` — register `feature_program_focus` + benefit copy. Per
  LESSONS.md 2026-05-23 (#0023): the `<UpgradeGate feature=…>` prop MUST be the exact tier key
  string (`feature_program_focus`) because it resolves via `canAccess(tier, feature)`.
- Director set surface — add a small "Program focus this week" input on the org settings surface
  (`src/app/(dashboard)/settings/organization/page.tsx` is the natural home), behind
  `<UpgradeGate feature="feature_program_focus">`, POSTing the focus via the client
  `query()`/`mutate()` or the dedicated route (NOT direct Supabase — AGENTS.md rule 3). Dark
  zinc/orange; 44px touch targets; no banned words.
- Coach Capture surface — render a single passive line at the top of `src/app/(dashboard)/capture/page.tsx`
  ("Program focus this week: <focus>") only when an org focus is set for the coach's org. It must
  NOT block, gate, or require dismissing before capture. Read the focus via the existing
  `query()`/config path the page already uses (do NOT add a Supabase client call).
- Plan generator — thread the program focus into the prompt params where the practice-plan /
  practice-arc prompt is built (`PROMPT_REGISTRY` in `src/lib/ai/prompts.ts`, consumed by
  `src/app/api/ai/plan/route.ts` and/or `src/app/api/ai/practice-arc/route.ts`). Pass it as an
  optional `programFocus?: string` param that the prompt mentions as a soft priority when
  present and omits cleanly when absent; do NOT change the plan/arc Zod schema in
  `src/lib/ai/schemas.ts`. Keep the AI call through `callAIWithJSON()` with `orgId` (AGENTS.md
  rule 4) — unchanged except for the added param.
- `tests/org/weekly-focus.test.ts` (new, `.test.ts` NOT `.spec.ts`; LESSONS.md 2026-05-20):
  mock `@/lib/supabase/server` (chainable in-memory, as in the org-analytics / program-pulse
  tests). Cover: 401 no-auth; admin+org → set then get round-trips; non-admin org coach → 403;
  non-org tier → 403; cross-org orgId → 403/404; cross-org read isolation. Run under Node
  20.19.0 via PATH (LESSONS.md 2026-05-21); run `tsc --noEmit` after the route test.
- A plan-prompt test (extend the existing plan/arc test): assert the prompt params include the
  program focus when one is set and that the generated output still parses against the unchanged
  plan/arc schema when it is absent. If the AI contract suite covers the plan prompt, ensure the
  added param does not make the prompt provider-specific.
- `tests/e2e/program-focus-flow.spec.ts` (new Playwright spec) against the 0006-seeded local
  Supabase. Seed an Organization-tier org with an admin + a coach + a set program focus; assert
  the coach sees the focus line at `/capture` and that capture is not gated by it; seed a second
  org with no focus and assert no line. Skip when E2E creds are unset, per convention.
- New deps: no. Migration: only if the existing org-config store needs a row shape it does not
  already have — prefer reusing the existing org-overrides table the `resolveConfig` cascade
  reads; if a new column/table IS required, use a UNIQUE migration version prefix and balanced
  insert columns/values (LESSONS.md 2026-05-20), and add nothing to `players`. Env vars: no. AI
  prompt change: YES — add an optional `programFocus` param to the practice-plan/arc prompt in
  `src/lib/ai/prompts.ts` (schema unchanged). Tier feature key: YES — `feature_program_focus` in
  `src/lib/tier.ts` (Organization only).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0031-...` opened
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
