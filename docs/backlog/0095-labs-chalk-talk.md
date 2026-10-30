---
id: 0095
title: Add a Labs section with Chalk Talk, a voice and sketch play board (X's and O's) for basketball and flag football
status: in-progress
priority: P2
area: plans
created: 2026-10-30
owner: human
---

## User story

As a volunteer coach the night before practice, I want to say a play out loud ("1 dribbles to the right wing, 5 sets the ball screen and rolls") or sketch it with my finger and watch it draw as X's and O's, so that I can show my kids the play on a phone or a TV instead of a dry-erase board.

## Why now (four lenses)

### Product Owner
One page, one experiment, clearly labeled. Nothing else in CourtIQ changes.

### Stakeholder
A visual, shareable play board is the "show me" moment for basketball and flag football coaches; Labs lets us learn whether coaches use it before it touches plans or the curriculum.

### User (at 5:45pm on a Tuesday, 12 kids on a court)
Tap the mic, say the play, hand the phone to a kid. The concept library (spacing, give and go, pick and roll, Horns, slant-flat, smash…) works with no setup and no key.

### Growth
The animated board is the screenshot a coach sends to another coach.

## Acceptance criteria

- [x] `/labs` lists Chalk Talk with an Experimental tag (Playwright: `tests/e2e/labs-flow.spec.ts`).
- [x] `/labs/chalk-talk` mounts the board client-side and destroys it on unmount (Playwright smoke; no WebGL assertions).
- [x] The board opens on the team's sport: basketball → basketball, flag/football → flag 5v5, 7v7 → flag 7v7, anything else → basketball (vitest: `tests/labs-sport-utils.test.ts`).
- [x] Labs is reachable from the desktop dock, the mobile More sheet and the command palette.

## Out of scope

- No CourtIQ AI route, quota or tier gate: plays from free-form words use the coach's own Claude/OpenAI key, called from the browser to that provider only (the package's design). No server changes, no new tables.
- No saving plays into practice plans yet.

## Engineering notes

**New dependency:** `chalk-talk` (`github:mutaaf/chalk-talk#v0.3.0`, MIT, pinned to a tag), which brings `aurora-field@3.3.0` (MIT, zero dependencies). Reason: the board is a self-contained WebGL/voice app maintained in its own repo (it also runs standalone at https://mutaafaziz.com/chalktalk/); importing the package keeps one engine and lets CourtIQ upgrade by bumping the tag. It is loaded with a dynamic `import()` inside `useEffect`, so it ships in its own chunk and never runs on the server.

- Files: `src/app/(dashboard)/labs/page.tsx`, `src/app/(dashboard)/labs/chalk-talk/page.tsx`, `src/lib/labs-sport-utils.ts`, `src/types/chalk-talk.d.ts`, nav in `dashboard-shell.tsx` and `command-palette.tsx`.
- `/labs/chalk-talk` is a full-bleed route (like `/assistant`) so the board fills the screen above the mobile nav.
- Privacy / COPPA: the board uses no player data (X's and O's only, never names) and stores only the coach's optional keys in localStorage.

## Implementation log

- 2026-10-30: shipped behind the Labs section (this PR).
