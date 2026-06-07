---
id: 0075
title: When a coach opens Capture and three coaches in OTHER programs in the same sport are working on the same skill this week, surface ONE quiet line — "three coaches in your sport are on closeouts too — here's the drill they're running"
status: groomed
priority: P1
area: capture
created: 2026-06-07
owner: product-groomer
---

## User story

As a volunteer coach who has opened Capture to run Tuesday's practice
and is looking at the existing 0014 "last practice's focus areas"
header, I want — when three or more coaches in OTHER programs in my
sport (NOT my own program; the cross-program signal is the load-
bearing scarcity) are converging on the same skill this week — one
honest quiet line under the existing focus block: "three coaches in
basketball are on closeouts this week too — the most-thumbed-up drill
they're running is 'Live closeout 1-on-1'" with one tap to clone that
drill into my plans library (the existing 0064 one-tap-clone card),
so the skill choice I am about to walk onto the court with feels
like I am part of a real coaching community making the same
decisions I am, not a lone volunteer guessing what to work on next.

## Why now (four lenses)

### Product Owner

The product has shipped 0071 — when 3+ coaches in the SAME program
converge on a skill, surface it to the director — and 0055 — surface
plans other coaches in your league have published, ranked by recency
+ sport match. What is MISSING is the cross-PROGRAM, sport-wide,
coach-side EMERGENT signal: the skill convergence that the coach
DOES NOT YET KNOW their league is running, surfaced at the EXACT
moment the coach is choosing what to work on (Capture, not Plans).
0071 is in-program; THIS is cross-program. 0055 is "what plans have
been published"; THIS is "what skills are being worked on right now"
(an aggregation BEFORE a single plan was published). The smallest
meaningful unit of value is: (a) reuse the existing 0071
`computeEmergentFocus` helper at a new scope — the sport, not the
org — with a stricter MIN_CONVERGENCE = 3 across DISTINCT PROGRAMS;
(b) a new `GET /api/sport/emergent-focus?sportId=...&excludeOrgId=...`
endpoint (authed, available to every tier) that returns the top 1
emergent skill for the caller's sport in the last 14 days,
EXCLUDING plans from the caller's own org (the cross-program
contract — the signal is what OTHER programs are doing); (c) a small
`<CrossProgramFocusLine />` on the existing Capture surface that
renders BELOW the existing 0014 "last practice's focus areas" block
when an emergent focus exists; (d) the line includes a one-tap
clone card for the MOST-THUMBED-UP drill associated with that skill
(reusing the existing 0044 thumbed-drill ranking + the existing
0064 drill-clone card primitive). The line is rendered ONLY when
`distinctProgramCount >= 3` (the cross-program scarcity bar — below
that, silence). NO new tier feature key (the signal is a quality
lift on Capture; tier-gating it would inverse the loop). NO new
migration (every signal derives from existing `plans` + `drill_shares`
+ team-to-org joins). NO AI generation (pure aggregation +
template-fill line).

### Stakeholder

This is the moat-deepening primitive that turns the league/sport-
wide plan-and-drill graph into a real-time coaching-community
signal at the SHARPEST coach decision moment — the second before
they choose what to work on at practice. Three compoundings, all
structurally invisible to a forms-app competitor. (1) The cross-
program emergent moat — the SAME computation that powers the
director-side 0071 in-program signal powers the coach-side cross-
program signal here, but at a different SCOPE (sport, not org)
and a different VISIBILITY (every coach, not just directors); the
helper is reused, the scope and rendering are new. (2) The
discovery-at-decision-time moat — 0055 surfaces published plans
when a coach OPENS the discovery surface (a deliberate action);
THIS surfaces the signal at the moment a coach already opened
CAPTURE for their practice (a forced action — every coach who
runs a practice opens Capture). The conversion shape is one tap
on the drill clone card from a coach who was about to make a
skill decision anyway. (3) The cross-program network compound —
every coach who clones the most-thumbed drill via this surface
writes a new `drill_shares` row whose source ranking is the
cross-program convergence; the compounding rich-get-richer
dynamic of 0073 (coach reputation) is fed by THIS surface
because every cross-program clone counts toward the published
coach's `distinctProgramCount`. Distinct from 0071 (in-program
director-only), 0055 (deliberate discovery, plan-level), 0044
(per-coach next-drill suggestion, intra-coach), 0014 (the
coach's OWN last-practice focus), 0031 (top-down program-set
focus), 0063 (post-clone follow-a-coach action).

### User (the coach, Tuesday 5:43pm, walking into the gym, 12
kids are warming up, she opens Capture on her phone)

She sees the existing 0014 header — "last practice you were
working on rebounding and conditioning." Below it, one new line
in zinc-500: "Three coaches in basketball are on closeouts this
week too — the drill they're running most: 'Live closeout 1-on-1
— 8 minutes.'" Below the line, one orange-pill button: "Save to
my drills." She taps it. The drill clones to her library (the
existing 0064 mechanic). She opens her practice plan after warm-
up and the closeout drill is sitting in her drill library where
she can drop it into Thursday's plan. She did not search; she
did not browse the league discovery surface; she did not open
SportsIQ to find this. She opened Capture to do her job and the
signal met her there. The total interaction took 4 seconds and
zero typing. If no cross-program convergence exists for her
sport this week, the line is ABSENT (silence beats nag — the
existing 0014 header is byte-identical when there is no
emergent signal). On a flaky gym connection, the line is best-
effort — the existing 0014 header NEVER waits on the new
endpoint's response.

### User (the published coach who originated the most-thumbed
drill, Coach Maya, Wednesday 9:11am)

She does not see anything on this surface. The cross-program
fanout of her closeout drill fires entirely on the BACKEND —
every coach who clones it via this surface writes a row that
counts toward her 0073 reputation `distinctProgramCount`, and
when it crosses her next milestone she gets the 0073
milestone card on /home: "Your closeout drill was cloned by a
coach in a 5th program this month." The compound between THIS
surface and 0073 is the bidirectional loop the product has not
shipped before: 0073 surfaces credibility on discovery, this
surface FEEDS the credibility from a non-discovery surface (a
coach who never opens 0055 still contributes to the cross-
program clone graph through THIS surface).

### Growth

The "show me" moment is the CAPTURE SCREEN — a quiet line that
turns a moment of decision-isolation ("what should I work on
tonight?") into a moment of community-discovery ("three other
coaches like me are on this too"). That screenshot is the
COACH-TO-COACH viral artifact a coach texts to another
coach in the same sport with "the app told me this — should
we run closeouts Thursday?" Compounds three ways. (1) The
Capture retention pull — every coach who runs Capture sees
this line when it fires, which is the highest-frequency
surface the product ships; the signal becomes habitual. (2)
The cross-program clone compound — every clone via this
surface is a `drill_shares` row that feeds 0073's reputation
ranking, which feeds 0055's discovery ranking, which feeds
this surface's drill-pick — the four-way network effect that
turns the product into the league-wide coaching reference.
(3) The cross-coach-to-cross-program acquisition pull — a
coach in a program that does NOT yet use SportsIQ hears
about the surface from a coach who does ("the app told me
three coaches in OTHER programs in basketball are doing
this") and the cross-program word-of-mouth is the highest-
conversion shape of organic coaching-app awareness.
Distinct from every shipped surface because every shipped
emergent / discovery / recommendation surface is either
(a) deliberate-action (0055, 0049 publish), (b) in-
program (0071, 0031), or (c) intra-coach (0014, 0044);
THIS is real-time cross-program at decision-time.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] Extend the existing `src/lib/emergent-focus-utils.ts`
  (shipped by 0071 — read first per LESSONS#0096) to add a
  new pure helper
  `computeCrossProgramEmergentFocus(plans, opts?: {
  minPrograms?: number; windowDays?: number; maxFocuses?:
  number })`. The new helper builds on the existing
  `computeEmergentFocus` shape but: (a) deduplicates skills
  per DISTINCT `org_id` (not per team_id — the cross-
  program contract); (b) defaults `minPrograms = 3`; (c)
  ALWAYS returns `EmergentFocus[]` capped at `maxFocuses`
  (default 1; the Capture surface renders at most one
  line). Pure function, reads no DB. Per LESSONS#0103 —
  the new helper is ADDITIVE; the existing
  `computeEmergentFocus` and its 0071 callers stay BYTE-
  IDENTICAL. (vitest extending
  `tests/lib/emergent-focus-utils.test.ts` — existing per
  the 0071 ticket): (i) empty plans → empty result; (ii) 3
  plans all from the SAME org → empty result (the cross-
  program contract); (iii) 3 plans from 3 distinct orgs
  on the same skill → one result; (iv) 3 plans from 2
  distinct orgs (2 plans from org A, 1 from org B) → empty
  result; (v) the result is capped at `maxFocuses = 1`
  even with 3 separate skills above threshold; (vi) the
  existing `computeEmergentFocus` output is BYTE-
  IDENTICAL for every existing fixture per the optional-
  widening LESSONS#0103 pattern.

- [ ] A new
  `GET /api/sport/emergent-focus?sportId=<uuid>&excludeOrgId=<uuid>`
  (new, authed). The route: (a) verifies the caller is
  authenticated; (b) reads
  `from('teams').select('id, org_id').eq('sport_id',
  sportId).neq('org_id', excludeOrgId)` (allow-list per
  LESSONS#0036); (c) reads
  `from('plans').select('team_id, skills_targeted,
  created_at').in('team_id', teamIds).gte('created_at',
  windowStart)` (allow-list); (d) joins through to
  `org_id` from the teams row; (e) calls
  `computeCrossProgramEmergentFocus(plans, { minPrograms:
  3 })`; (f) if a focus is found, looks up the MOST-
  THUMBED-UP drill associated with the focus skill via
  the existing 0044 thumbed-drill ranking (read the
  exact 0044 helper at pickup per LESSONS#0096) AND
  the existing 0064 `drill_shares` table; (g) returns
  `200 { focus: { skill, distinctProgramCount,
  drill: { sourceDrillShareId, name,
  setup_lines, duration_minutes } } | null }`. If
  no focus is found, returns
  `200 { focus: null }`. The route is best-effort: a
  query failure returns `200 { focus: null }` (silence
  beats nag — the Capture surface is byte-identical
  when the line is absent). Per LESSONS#0036 —
  `.select()` allow-lists; NEVER reads player columns,
  parent contact, DOB, jersey numbers. Per LESSONS#0049
  / #0092 / #0100 / #0110 — the route gains 3 new
  from() calls; Glob `tests/api/sport*.test.ts` AND
  `tests/api/emergent*.test.ts` AND `tests/api/capture*
  .test.ts` at pickup and extend every queue. Per
  LESSONS#0112 — if the existing /api/data read for
  Capture's last-practice can be widened to subsume
  the cross-program read, prefer that (LOWER blast
  radius). (vitest under
  `tests/api/sport-emergent-focus.test.ts` — new):
  (i) caller's sport has 3 distinct orgs on closeouts →
  200 with `{ focus: { skill: 'closeouts', drill: {...}
  } }`; (ii) caller's sport has 2 distinct orgs on
  closeouts → 200 with `{ focus: null }`; (iii)
  caller's own org's plans are NEVER included (assert
  via planted plans in `excludeOrgId`); (iv) plans
  older than 14 days are excluded; (v) when no drill
  is found for the focus skill in the league's
  `drill_shares` ranking → 200 with `{ focus: { skill,
  drill: null } }` (the surface renders the line
  without the clone card); (vi) a query failure on
  the plans read returns 200 with `{ focus: null }`
  (best-effort); (vii) an unauthed caller → 401;
  (viii) planted DOB / parent_phone on player rows
  are NEVER read.

- [ ] A new `<CrossProgramFocusLine />` mounted on the
  existing Capture surface (read at pickup per
  LESSONS#0096 — likely `src/app/(dashboard)/capture/
  page.tsx` per the existing 0014 / 0020 / 0025 / 0062
  Capture surface). The line is mounted BELOW the
  existing 0014 "last practice's focus areas" block,
  ABOVE the capture controls (so a coach sees it as
  they prepare to capture, not as they are mid-
  observation — the cognitive load is "before I
  observe", not "during"). The line renders only when
  the endpoint returns `focus !== null`. The line
  body: "Three coaches in <sportName> are on <skill>
  this week too — the drill they're running most:
  '<drill.name>' — <drill.duration_minutes> minutes."
  When `focus.drill` is null, the line reads:
  "Three coaches in <sportName> are on <skill> this
  week too." When `focus.distinctProgramCount` is >3,
  the line begins with the exact count (e.g. "Four
  coaches in basketball..."). When the drill is
  present, ONE clone button reads "Save to my drills"
  and tapping fires the existing 0064 drill-clone
  POST. After the clone, the button shows a
  confirmation pill "Saved" and disables. Per
  LESSONS#0023 — every copy variant is instructed
  positively, no banned tokens. The line exposes
  `data-testid="cross-program-focus-line"`. Per
  LESSONS#0029 / #0082 — scope every Playwright
  assertion to the testid (skill names like
  "closeouts" overlap many other strings). Per
  LESSONS#0065 / #0066 / #0162 — Capture is a
  hotspot; smallest possible touch (one import + one
  JSX entry below the 0014 block). The line is
  PURELY ADDITIVE — the 0014 block is byte-identical
  when this line is absent. (vitest component test):
  (i) endpoint returns a focus with a drill → line
  renders with skill + sport + drill name +
  duration + Save button; (ii) endpoint returns a
  focus with `drill: null` → line renders without
  the drill name + WITHOUT the Save button; (iii)
  endpoint returns `focus: null` → line is ABSENT;
  (iv) tapping Save fires the 0064 clone POST; (v)
  on a clone failure, the button reverts (best-
  effort posture per LESSONS#0036); (vi) the
  rendered text contains no AGENTS.md banned word
  for any matrix of sport / skill / drill-name
  fixtures.

- [ ] Tier / feature gating: NO new tier feature
  key. The cross-program focus line is available
  to EVERY tier including free — the signal is a
  quality lift on Capture (the highest-frequency
  free-tier surface the product ships); gating it
  would invert the loop. The CLONE action calls the
  EXISTING 0064 drill-clone POST, which carries
  its existing tier gate posture untouched. Per
  LESSONS#0096 — at pickup read the actual 0064
  drill-clone tier posture; this ticket does not
  change it. (vitest: a free-tier coach sees the
  line and can tap Save; the 0064 endpoint's
  existing tier posture is byte-identical; a
  paid-tier coach has the same experience.)

- [ ] Privacy / COPPA contract: the route reads
  ONLY team-aggregate + org + plan + drill_shares
  fields. NEVER reads `players`, `observations`,
  `parent_email`, DOB, jersey numbers, photo
  URLs, medical_notes. The surface renders ONLY
  the sport name + the skill string + the drill
  name + duration; NEVER the cloning coach's
  name, the originating team's name, the
  publishing coach's name. The drill source
  attribution is via the OPAQUE
  `sourceDrillShareId` (the 0064 clone API
  resolves it server-side; the client never
  sees the publishing coach id). Per LESSONS#0036
  — `.select()` allow-lists on every read; NEVER
  `select('*')`. (vitest: planted DOB /
  medical_notes / parent_phone on player rows are
  NEVER read by any route; the response payload
  contains no coach names; the Capture rendered
  line contains no coach names; the
  `sourceDrillShareId` is the only identifier
  passed to the clone POST.)

- [ ] Voice contract: every new user-facing
  string (the Capture line copy across all three
  variants — with-drill, no-drill, varying
  program counts — the Save button label, the
  Saved confirmation pill) contains NO AGENTS.md
  banned word per LESSONS#0023. The variable
  substitution NEVER produces a banned token for
  any fixture sport / skill / drill name. The
  fallback when the program count is exactly 3
  reads "Three coaches" with the word spelled
  out (not "3 coaches") — the existing 0071 /
  0073 numeric posture (read at pickup).
  (vitest: render each component variant and
  scan rendered text; scan the Capture line
  across a matrix of sport / skill / count /
  drill fixtures.)

- [ ] Regression: the existing Capture surface is
  BYTE-IDENTICAL when the endpoint returns
  `focus: null` (the line is absent). The
  existing 0014 last-practice focus block, the
  existing 0020 practice-arc surface, the
  existing 0025 player-context surface, the
  existing 0062 thin-player nudge are all BYTE-
  IDENTICAL. The existing 0064 drill-clone POST
  is BYTE-IDENTICAL (this ticket calls it from
  a new surface, with the same payload shape).
  The existing 0071 in-program emergent-focus
  surface is BYTE-IDENTICAL (this ticket adds a
  new helper to the same file; the existing
  helper is unchanged per LESSONS#0103). The
  existing 0073 reputation milestone surface is
  BYTE-IDENTICAL (clones from this surface
  count toward 0073 reputation through the
  existing 0064 clone path — no double-counting).
  (vitest: snapshot the named routes /
  components against seeded fixtures pre- and
  post-change.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — pre-mint THREE plans across
  THREE DISTINCT orgs (NOT the E2E coach's
  org) with the same skill in
  `skills_targeted` ("closeouts" or whatever
  the existing seed's basketball skills
  vocabulary uses — read at pickup per
  LESSONS#0096) and `created_at = now() -
  interval '2 days'`. Pre-mint ONE
  `drill_shares` row tied to one of those
  org's teams with a focus matching the skill
  AND at least one thumbed-up signal (the 0044
  existing thumbed-drill ranking; read the
  exact ranking helper at pickup). Per
  LESSONS#0084 — seed in an idempotent
  DELETE-then-INSERT block; every new
  organization + team + coaches + auth.users
  row in the same block. Per LESSONS#0101 —
  UUIDs in the next free `0000000000<XX>+`
  range (the 0072 / 0073 / 0074 tickets each
  reserve their own UUID family; pick the
  next free family at pickup). Playwright
  spec: (a) sign in as the E2E coach,
  navigate to /capture (the existing 0014
  surface), assert the
  `<CrossProgramFocusLine />` renders with
  the seeded skill + sport + drill name +
  duration AND a Save button; (b) tap Save,
  assert the 0064 clone POST is called with
  the seeded sourceDrillShareId AND the
  button updates to Saved; (c) assert the E2E
  coach's drill library now contains the
  cloned drill (the existing 0064 happy-path
  assertion); (d) navigate to a Capture
  surface for a sport with NO cross-program
  convergence (seed a one-plan-only fixture
  if needed) and assert the line is ABSENT.
  Scope by data-testid per LESSONS#0081 /
  #0082. Skip when E2E creds are unset.

## Out of scope

- A coach-side IN-PROGRAM emergent surface (the
  0071 director-side card transposed to the
  coach). v1 stays cross-program only; in-
  program-coach-side surfacing would compete
  with the existing 0031 top-down program
  focus and 0014 last-practice block — a
  separate ticket if data shows it matters.
- A MULTI-FOCUS variant (the line renders up
  to N emergent skills). v1 caps at ONE focus
  per render; multi-focus is a v2 follow-on.
- An AI-GENERATED line copy ("the AI explains
  why closeouts matters this week"). v1 is a
  template-fill matching the existing 0071
  voice. AI personalization is a separate
  ticket if the template proves generic.
- A WEEKLY EMAIL extension of the cross-
  program emergent focus. v1 is in-app on
  Capture only; an email surface is a
  separate ticket.
- A cross-sport variant ("here's what soccer
  coaches are working on — basketball might
  borrow"). v1 is sport-scoped; cross-sport
  is a separate ticket with its own
  vocabulary mapping problem.
- A program-director-facing version of the
  cross-program signal ("your program is
  BEHIND the league on closeouts"). v1 is
  coach-side; the director-side cross-
  program signal is a separate ticket if
  asked for.
- A retroactive sweep of cross-program
  convergence at ticket-ship time. v1 fires
  on FORWARD plan publishes only.
- A "share this signal" surface (the coach
  forwarding the cross-program line to
  another coach). v1 is in-product only; a
  share surface is a separate ticket.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/emergent-focus-utils.ts` (existing —
  read first per LESSONS#0096; shipped by
  0071). Add the new
  `computeCrossProgramEmergentFocus` pure
  helper; the existing helper is BYTE-
  IDENTICAL per LESSONS#0103 optional
  widening.
- `src/app/api/sport/emergent-focus/route.ts`
  (new) — `GET(request)`. Authed via
  `createServerSupabase()` for auth, service-
  role for the cross-program reads. Per
  LESSONS#0036 — `.select()` allow-lists. Per
  LESSONS#0049 / #0092 / #0100 / #0110 — new
  from() calls; Glob every `tests/api/sport*`
  AND `tests/api/emergent*` AND
  `tests/api/capture*` at pickup. Per
  LESSONS#0112 — check whether existing
  Capture reads can be widened to subsume
  this read (likely NOT — different sport
  scope).
- `src/components/capture/cross-program-
  focus-line.tsx` (new). `data-testid="cross-
  program-focus-line"`.
- `src/app/(dashboard)/capture/page.tsx`
  (existing — read first per LESSONS#0096).
  One import + one JSX entry BELOW the
  existing 0014 block. Per LESSONS#0065 /
  #0066 / #0162 — smallest possible touch on
  the Capture hotspot.
- `src/lib/tier.ts` — NO new feature key.
- `src/components/ui/upgrade-gate.tsx` — NO
  new registration.
- `src/app/api/drill-share/clone/route.ts`
  (existing — read first per LESSONS#0096;
  shipped by 0064). NO change; this ticket
  calls the existing POST.
- `tests/lib/emergent-focus-utils.test.ts`
  (existing — read first per LESSONS#0096)
  — extend with every new helper case per
  LESSONS#0103.
- `tests/api/sport-emergent-focus.test.ts`
  (new) — every route case.
- `tests/components/cross-program-focus-line
  .test.tsx` (new) — every render case.
- `tests/api/sport*.test.ts` AND
  `tests/api/emergent*.test.ts` AND
  `tests/api/capture*.test.ts` (existing —
  Glob at pickup per LESSONS#0110) — extend
  every queue. Per LESSONS#0116 — empty Glob
  is a no-op; document in the log.
- `tests/e2e/cross-program-focus-flow.spec
  .ts` (new). Seed extension per the AC.
  UUIDs in the next free range per
  LESSONS#0101. Skip when E2E creds are
  unset.
- New deps: NO. Migration: NO (every signal
  derives from existing tables). Env vars:
  NO new. AI prompt change: NO. Tier
  feature key: NO new key.
- LESSONS to anchor: #0020 / #38 (.test.ts),
  #0023 (positive voice on every copy
  variant; numbers spelled out — three /
  four / five per the 0071 / 0073 posture),
  #0029 / #0082 (data-testid scoping — skill
  + sport strings overlap many rendered
  strings on Capture), #0036 (best-effort
  render + `.select()` allow-lists), #0049
  / #0092 / #0100 / #0110 (mock queue
  spillover — Glob every sport / emergent /
  capture test), #0055 (route handler call
  posture), #0061 (literal space on
  defensive scans), #0062 (thenable chain
  mock when two `.eq()` calls), #0065 /
  #0066 / #0162 (Capture hotspot —
  smallest possible touch), #0081 / #0082
  (e2e scope by data-testid), #0084 /
  #0101 (seed posture; new orgs + teams +
  coaches + auth.users in same idempotent
  block; UUID range), #0096 (schema wins
  over prose — at pickup read the actual
  Capture page, the actual 0014 last-
  practice block surface, the actual 0044
  thumbed-drill ranking helper, the actual
  0064 drill-clone POST shape, the actual
  `teams.sport_id` + `teams.org_id`
  columns, the existing
  `computeEmergentFocus` 0071 helper
  shape), #0103 (optional widening on
  shared util — the new helper is
  ADDITIVE), #0112 (widen existing read
  if possible — though likely not here),
  #0116 (Glob sweep that returns empty is
  a no-op).

## Implementation log

(Appended by the implementation-dev agent during execution.)
