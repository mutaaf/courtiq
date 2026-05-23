---
id: 0020
title: Bring the active Practice Arc onto Capture so the coach picks up the arc mid-practice
status: shipped
priority: P1
area: capture
created: 2026-05-22
owner: product-groomer
---

## User story

As a volunteer coach in the middle of session 2 of my 3-practice defense arc, I want
Capture itself to know I'm running an arc — and to show me the one thing I said I'd carry
forward — so that when I'm standing on the court tapping observations, the app reminds me
what today is supposed to build toward, instead of me having to remember it or flip back
to the plans screen between drills.

## Why now (four lenses)

### Product Owner
Ticket 0018 shipped the Practice Arc memory: `GET /api/ai/practice-arc/active` returns the
team's most recent `practice_arc` with `arcTitle`, `total_sessions`, the per-session
`carries_forward` / `key_coaching_point` data, and a derived `currentSessionNumber`. But
0018 deliberately scoped that read to the planning surfaces (`/plans` continuity line + the
home `ContinueArcCard`) and listed a Capture-side nudge as out of scope: "A Capture-side
'you're in an arc' nudge is a separate, smaller follow-up if this performs." 0018 performed
and merged. The smallest meaningful unit of value now is to surface the SAME active-arc read
on Capture — one quiet line above the record control showing "Defense Arc · session 2 of 3 ·
today: build on closeouts." No new data, no new generation, no new artifact: it reuses the
endpoint 0018 already built and the same defensive, best-effort read pattern as the
free-tier usage meter (0008). It removes the "wait, what were we working on?" flip-back, it
doesn't add a new screen.

### Stakeholder
This is the Practice Arc cross-session-memory moat reaching the surface where the coach
spends the actual minutes of practice. 0018 made the arc legible on the planning screens; a
coach plans once but captures dozens of times. Putting the carried-forward coaching point on
Capture is what makes the arc feel like a coach who is *in the gym with you*, not a document
you read before practice and forgot. A forms app can show you a plan; it cannot stand next to
you mid-drill and say "remember, today is about closeouts." That in-the-moment continuity is
the hardest-to-copy expression of the artifact-memory moat, and it compounds 0018 rather than
forking it — same endpoint, same derivation, second surface.

### User (at 5:45pm on a Tuesday, 12 kids on a court)
The coach opens Capture between drills. Above the mic, one line: "Session 2 of 3 — Defense
Arc · today: build on closeouts." It's a fact, not a nag — sized like the usage meter,
tappable to expand the full coaching point if they want it, dismissible for the session if
they don't. When there's no active arc, the line is simply absent and Capture looks exactly
as it does today. On a flaky gym wifi the read is best-effort: if the arc can't load, the
line doesn't render and the record button works unchanged. Nothing about capturing an
observation ever waits on the arc read.

### Growth
This is a pure retention deepener, and it earns its P1 by touching the single most-used path
in the product (Capture) with the named moat (Arc memory). A coach who is reminded of the
arc's thread every time they capture is a coach who runs the full 3-session arc instead of
abandoning it after session 1 — which is exactly the multi-session cadence that pulls them
back every Tuesday. There is no new viral artifact here; the "show me" moment is the same
subtle one 0018 created ("look, it knew it was session 2"), now visible at the moment a rival
coach is most likely to be watching over their shoulder — during an actual practice.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] Capture (`src/app/(dashboard)/capture/page.tsx`) fetches the active arc via the existing
      `GET /api/ai/practice-arc/active?teamId=<id>` (ticket 0018) using the client query
      patterns already on the page (a TanStack `useQuery`, NOT a direct Supabase call —
      AGENTS.md rule 3); when the response has an active arc, a continuity line is visible
      whose text matches `/session \d+ of \d+/i` and includes the arc title (Playwright,
      seeded active arc).
- [ ] When the active-arc read returns `{ active: null }` (team has no `practice_arc`), the
      continuity line is absent and Capture renders normally with the record control operable
      (Playwright/component — no empty/placeholder element).
- [ ] The continuity read is non-blocking: when `GET /api/ai/practice-arc/active` fails or
      times out, the line does not render and the record button stays enabled and operable
      (component test — the arc read never gates capture, mirroring the 0008 usage-meter
      degrade-silently behavior).
- [ ] The line surfaces the carried-forward coaching point for the current session: when the
      active-arc payload includes the current session's `key_coaching_point` / `carries_forward`,
      the rendered line (expanded, or in a tooltip/secondary text) contains that text
      (component test asserts the carried-forward string is present in the DOM for a seeded arc).
- [ ] The line is dismissible for the session: tapping a dismiss control hides it and it stays
      hidden on re-render within the same session (component test — assert the line is gone
      after the dismiss interaction; persistence is in-memory/session only, no new storage).
- [ ] Regression: the existing free-tier AI usage meter (ticket 0008) still renders above the
      record control for a free coach, and the arc line coexists with it without removing or
      displacing it (component/Playwright — both elements present together when both apply).
- [ ] No new server route, no change to `GET /api/ai/practice-arc/active`'s response shape, and
      no change to the plan-generation path: this ticket is read-only consumption of the 0018
      endpoint on a new surface (vitest/Playwright — the endpoint contract is unchanged).

## Out of scope

- Generating or advancing the arc from Capture. This surfaces the existing active arc; the
  coach still generates each session's plan on the planning surface (0018). No "generate next
  session" button on Capture.
- A new endpoint or any change to `GET /api/ai/practice-arc/active` (ticket 0018 owns it). If
  the route is missing a field the line needs, push back via this ticket body rather than
  reshaping the endpoint — the carried-forward / coaching-point fields are already in its
  payload per 0018's acceptance criteria.
- Persisting the dismissed state across sessions or devices with new schema. Session-scoped
  in-memory dismissal only; no migration, no new column, no `localStorage` contract change
  beyond what the page may already use.
- Auto-tagging captured observations to the arc, or scoring observations against the
  carried-forward focus. v1 is a passive reminder line, not an analytics linkage.
- Surfacing the arc on any surface other than Capture (the planning surfaces are 0018; this is
  the deferred Capture follow-up only).
- A new tier gate. The active-arc read is the same ungated continuity helper 0018 shipped;
  this ticket adds no `feature_*` key and no `<UpgradeGate>`.
- Any per-minor data exposure. The arc artifact is team-level; no player fields are read or
  written.

## Engineering notes

- `src/app/(dashboard)/capture/page.tsx` (`'use client'`) — add a small TanStack `useQuery`
  (already imported on the page, same as the 0008 usage meter) hitting
  `/api/ai/practice-arc/active?teamId=<activeTeamId>`. Use `useActiveTeam()` for the team id.
  The query is fire-and-forget: the record control's `disabled` state must NOT depend on it.
  Render a compact line near the record control / usage meter; dark zinc/orange aesthetic, no
  banned words, 44px touch targets for the dismiss control.
- Prefer extracting a small presentational component (e.g.
  `src/components/capture/arc-continuity-line.tsx`) carrying a stable `data-testid`
  (e.g. `arc-continuity-line`) so the four UI states are unit-testable in isolation — mirror
  exactly how 0008 extracted `src/components/capture/ai-usage-meter.tsx`. The component renders
  `null` when there is no active arc, while loading, or on fetch failure (best-effort).
- The endpoint already exists: `src/app/api/ai/practice-arc/active/route.ts` (ticket 0018).
  Read its actual response shape before wiring — it returns `{ active: { arcTitle,
  total_sessions, currentSessionNumber, ... per-session carries_forward / key_coaching_point } }`
  or `{ active: null }`. Do NOT modify this route.
- The home `ContinueArcCard` (`src/components/home/continue-arc-card.tsx`, ticket 0018) and the
  `/plans` continuity line are the prior art for how the active arc is presented and which
  fields are used — reuse the same field selection so Capture, Plans, and Home never disagree
  on "what session am I in / what carries forward."
- `tests/components/arc-continuity-line.test.tsx` (new, `.test.tsx` NOT `.spec.ts` —
  `vitest.config.ts` excludes `**/*.spec.ts`; LESSONS.md). Render the component directly (same
  approach as `tests/components/ai-usage-meter.test.tsx`): active arc → line shows
  `/session \d+ of \d+/i` + arc title + carried-forward text; no arc → renders nothing; fetch
  failure → renders nothing and contributes nothing that disables capture; dismiss → line gone.
- `tests/e2e/` — extend the existing capture e2e (the 0008 `capture-usage-meter.spec.ts`
  convention: `signInViaUI` → `test.skip` when `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` are unset,
  because `/capture` is middleware-protected). Seed a `practice_arc` plan + a couple of
  `sessions` rows in `tests/e2e/fixtures/seed.sql` if not already present from 0018 so the
  active-arc read resolves deterministically; the page is a client surface but the endpoint is
  server-backed, so the arc data must come from the seed.
- New deps: no. Migration: no. Env vars: no. AI prompt change: no. Tier feature key: no.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-22 — branch `feat/0020-arc-continuity-on-capture` opened; ticket marked in-progress.
- 2026-05-22 — Contract reconciliation: the ticket prose says the endpoint returns `arcTitle`,
  but the real `GET /api/ai/practice-arc/active` (`src/app/api/ai/practice-arc/active/route.ts`)
  returns `{ active: { arc_title, total_sessions, currentSessionNumber, currentSession,
  priorSession, progression_note } }` (snake_case `arc_title`; per-session
  `key_coaching_point` / `carries_forward` live on `currentSession`/`priorSession`). Per
  LESSONS#39 I assert the REAL contract — the component consumes `ActiveArcResponse` from the
  route, not the prose shape. Route is NOT modified (out-of-scope).
- 2026-05-22 — Failing test added first: `tests/components/arc-continuity-line.test.tsx`
  (`.test.tsx`, NOT `.spec.ts`, per LESSONS#38). Confirmed it failed on the missing
  `@/components/capture/arc-continuity-line` import before implementation.
- 2026-05-22 — Implemented `src/components/capture/arc-continuity-line.tsx` (pure presentational,
  mirrors 0008's `ai-usage-meter.tsx`; renders null on no-arc/loading/failure; session-scoped
  in-memory dismiss; 44px touch target) and wired a fire-and-forget TanStack `useQuery` on the
  Capture page hitting `GET /api/ai/practice-arc/active?teamId=<id>` via `useActiveTeam()` — the
  record button's `disabled` state does NOT depend on it. Added `tests/e2e/capture-arc-continuity.spec.ts`
  (mocks the endpoint, `test.skip` when E2E creds unset, per the 0008 convention; no seed change
  needed since the spec mocks the endpoint like the sibling capture specs).
- 2026-05-22 — Local gate green under pinned Node 20.19.0: lint 0 errors, `tsc --noEmit` clean,
  vitest 4376 passed (the lone `player-of-match-utils` `Apr 27` vs `Apr 28` fail is the documented
  environmental TZ artifact, LESSONS#36 — reproduces on pure main, arbitrated green by CI/UTC).
- 2026-05-22 — PR #263 opened, auto-merge armed; all three gating checks green
  (lint, unit-tests, e2e-tests 3m29s). Merged to main.
