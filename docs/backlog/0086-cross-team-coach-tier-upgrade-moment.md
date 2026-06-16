---
id: 0086
title: When a free coach is invited to a second team and hits the 1-team limit, turn the error into a contextual "you're a multi-team coach now — Coach is $9.99" upgrade moment that knows which team they were trying to join
status: in-progress
priority: P1
area: tier
created: 2026-06-15
owner: product-groomer
---

## User story

As a free-tier volunteer coach who already runs my own kid's U10 team on
SportsIQ, who just got an assistant-coach invite link from a friend who runs
the U12 in the same program (via 0015 / 0024), and who taps "Join U12" — only
to see a flat generic error "Your free plan allows up to 1 team. Please
upgrade to add more teams" with no way to know what happens next — I want
the moment to land as a CONTEXTUAL upgrade sheet that names the team I was
trying to join, names the coach who invited me, says "Coach plan is $9.99
a month and unlocks both your U10 and your friend's U12, with everything
you already captured intact," and after I upgrade lands me back on the join
flow with the U12 attached on the first reload — so the "I am suddenly
coaching two teams" moment converts cleanly instead of stalling at a
typography-as-a-paywall string.

## Why now (four lenses)

### Product Owner

The free-tier `maxTeams: 1` limit is enforced server-side in TWO places:
`src/app/api/auth/create-team/route.ts:36` and
`src/app/api/auth/configure-team/route.ts:48`. Both return a flat JSON
`{ error: "Your free plan allows up to 1 team. Please upgrade to add
more teams." }` with no structural fields the client could use to render
a real upgrade flow. The acquisition surfaces that DRIVE a free coach
across that wall have multiplied: 0015 (assistant-coach invite), 0024
(director invites whole coaching staff), 0029 (observer → coach), 0033
(claim a team from a cold program search), 0049 / 0064 (clone a plan or
drill into your team — implicit second-team draw if the clone target
isn't your active team), 0060 (parent invites another kid's coach),
0067 (sub-coach Tuesday handoff). Every one of those acquisition paths
funnels a coach toward "I now want to be on a SECOND team," and every
one of them dead-ends at the same generic error string. The smallest
meaningful unit of value is: (a) widen the two `create-team` /
`configure-team` 4xx responses to return a STRUCTURED tier-limit body
(`{ error, code: 'tier_limit_max_teams', currentCount, maxCount,
attemptedTeamName, invitedBy?: { firstName, role } }`) so the client
knows the failure SHAPE, not just the error text; (b) ship a NEW
client component `<TeamLimitUpgradeSheet />` that renders on a
`code: 'tier_limit_max_teams'` response — names the attempted team,
names the inviter when present, lists the Coach-tier benefits, and
routes to `/settings/upgrade?resume=join_team:<teamId>` reusing
the 0035 resume primitive; (c) wire the 0035 resume target to a
new `join_team` kind that, after the Stripe round-trip, finishes
the join (the same `configure-team` / `create-team` POST that
returned the 402-shaped 4xx now succeeds because the tier flipped).
NO new tier feature key — the limit is already enforced in
`src/lib/tier.ts:TIER_LIMITS.free.maxTeams = 1`. NO change to the
limit number itself. NO new public surface.

### Stakeholder

This is the moat-deepening companion to the entire cross-coach
acquisition wave (the audit memo names it explicitly:
"Acquisition pipes are now wide … but there's no evidence the
FUNNEL converts"). Three compoundings, all asymmetric. (1) The
multi-team coach is structurally the HIGHEST-LTV free user the
product has — they have demonstrated they will coach more than
one team in a season, which means they will hit EVERY tier limit
sooner (AI calls, players, sports) and they will publish more
content for the viral surfaces to leverage. Recovering them at
their first multi-team moment is the highest-leverage
freemium-to-paid conversion the product can build. (2) The
contextual upgrade sheet IS the moat-shaping artifact — it
embodies the entire 0035 resume primitive applied to a NEW
action kind (`join_team`), it carries the inviter's name
forward as social proof (the warm-landing 0021 posture), and
it removes the only friction in the loop's strongest funnel
shape (a free coach who was already a head coach somewhere,
being pulled into a SECOND team by a known peer). A
forms-app competitor would surface a paywall that names the
limit; this surface names the OTHER COACH and the OTHER TEAM
and what the upgrade buys. (3) The data-already-exists
compound — every persisted row needed for the contextual sheet
(`teams.name`, `team_coaches.role`, the inviting coach's
`coaches.full_name` for the first-name split) ALREADY EXISTS;
this ticket reuses them and builds NO new persistence. Per
the strategy audit (`docs/STRATEGY_AUDIT_2026-06-15.md`) —
"the upgrade moment hasn't kept pace with the viral surface
area"; the cross-team upgrade moment is exactly the wall this
audit named.

### User (the free coach, Sarah, runs the U10 already, Wednesday
7:43pm just got texted the U12 invite link from her friend
Mike)

She taps the link. The /signup or /join page resolves the
team and the inviting coach (the existing 0015 / 0021 warm-
landing surface). She picks "Join existing — I'm already a
SportsIQ coach." The route POSTs `configure-team` or
`create-team`. The server checks tier; the free `maxTeams: 1`
limit fires. INSTEAD of the flat error toast, a sheet slides
up: "You're already coaching your U10. Adding Mike's U12 is
one upgrade away. Coach plan, $9.99 a month, unlocks both
teams." Underneath: a small named card — "Joining: Hawks U12
— invited by Coach Mike." Underneath: the existing 0035
benefit-list ("3 teams · unlimited AI · parent reports ·
weekly digest · season momentum"). One button: "Upgrade and
join the U12." She taps. Stripe. Returns. Lands directly
on the U12 team's home — the join completed in the
post-webhook resume target (the 0035 mechanic). Total
extra friction over the dead-end error: about 35 seconds
of Stripe. She does not have to re-find the invite link.
The U10 data is intact. The U12 starts with her name
already attached as a coach. If she ABANDONS the upgrade,
she lands back on the original join page with the
sheet still visible (no half-applied state). On a flaky
gym wifi, the sheet renders from the structured 4xx
body — no second round-trip needed to render the
contextual copy.

### Growth

The "show me" moment is internal but specific: every
multi-team free coach who converts at this wall is a coach
whose U12 invite came from a person they know, and the
conversion line they share back to that person ("I
upgraded just to join your team — the limit caught me")
is the testimonial that turns the inviter into a
re-firer of the 0015 / 0024 invite loop. Three
compoundings. (1) The named-inviter compound — a wall
that names the inviter converts higher than a generic
wall (the warm-landing 0021 / 0029 ticket established
this pattern; applying it at the upgrade wall extends
the same shape). (2) The multi-team-publishes compound
— a converted multi-team coach publishes practice
plans, drills, weekly pulses on TWO teams' rhythms;
every published artifact feeds the 0049 / 0064 / 0073 /
0076 viral surfaces. (3) The retention compound —
the multi-team Coach-tier subscriber has TWO seasons'
worth of artifacts they don't want to lose; their churn
risk is structurally lower than a single-team Coach-
tier coach. The first conversion at this wall pays
for itself in 4 months at the Coach tier; subsequent
months are pure margin.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] Widen the 4xx response of both
  `src/app/api/auth/create-team/route.ts:36` and
  `src/app/api/auth/configure-team/route.ts:48` (existing —
  read first per LESSONS#0096) to return a STRUCTURED
  tier-limit body when the `maxTeams` check fires:
  `{ error: '<existing string>', code:
  'tier_limit_max_teams', currentCount: number, maxCount:
  number, attemptedTeamName: string | null, invitedBy?: {
  firstName: string; role: 'head_coach' | 'assistant_coach'
  } }`. The `error` string is BYTE-IDENTICAL to today (so
  every existing client toast continues to render). The new
  `code` field is the load-bearing signal the client uses to
  switch to the new sheet. The route resolves
  `attemptedTeamName` from the request body (the team
  being joined or created) when present; on a missing or
  cross-org team it returns `null` rather than leaking
  another org's team name. The `invitedBy` block is
  populated ONLY when the request carries a valid invite
  token (the 0015 / 0024 invite-link signature, resolved
  server-side); otherwise the field is OMITTED. Per AGENTS.md
  rule 3 — service-role lookups; per LESSONS#0036 — narrow
  allow-list `.select()` (only `coaches.full_name` for the
  first-name split, never email / phone / DOB). Per
  LESSONS#0061 — literal-space surname strip. Per
  LESSONS#0070 — never mutate the DB row reference. Per
  LESSONS#0103 — the new fields are additive; every
  existing 200-path response is BYTE-IDENTICAL. (vitest
  under `tests/api/auth-create-team-tier-limit.test.ts`
  AND `tests/api/auth-configure-team-tier-limit.test.ts`
  — new): (i) a free coach with 0 existing teams hits
  CREATE and SUCCEEDS — response BYTE-IDENTICAL to today;
  (ii) a free coach with 1 existing team hits CREATE and
  is REJECTED — the response carries
  `code: 'tier_limit_max_teams'`, `currentCount: 1`,
  `maxCount: 1`, and `attemptedTeamName` set to the
  posted team name; (iii) a free coach with 1 existing
  team hits CONFIGURE on a second team and is REJECTED
  with the structured body; (iv) the response carries
  `invitedBy: { firstName: 'Mike', role: 'assistant_coach' }`
  when a valid invite token is in the request and
  resolves to a coach in the same org; (v) the response
  OMITS `invitedBy` when no invite token is present;
  (vi) the response sets `attemptedTeamName: null` when
  the posted team_id is for a different org (no leak);
  (vii) a Coach-tier or Pro-tier coach hits CREATE on
  a 4th team (over their `maxTeams: 3`) and ALSO gets
  the structured body — the upgrade target is then
  `organization` per the existing `<UpgradeGate>` tier
  ladder; (viii) planted email / phone / DOB on the
  inviting coach are NEVER read.

- [ ] A new client component `src/components/team/team-
  limit-upgrade-sheet.tsx`. Renders as a bottom-sheet
  modal (mobile-first, 44px touch targets, dark
  zinc-950 + orange #F97316 per AGENTS.md), receives
  the structured 4xx body as props, and renders: (a)
  a headline naming the attempted team
  ("Adding Hawks U12 takes one upgrade") with the
  inviter's first name when present ("Coach Mike
  invited you"); (b) the existing 0035-style
  benefit list pulled from the
  `<UpgradeGate>` Coach-tier `feature_weekly_digest`
  / `feature_season_momentum` / `report_cards` /
  `parent_sharing` copy (DRY: import the
  FEATURE_CONFIG entries by key rather than
  re-copying); (c) ONE primary button "Upgrade and
  join the U12" that navigates to
  `/settings/upgrade?resume=join_team:<teamId>`
  (the 0035 resume primitive — the new `join_team`
  kind is added to the resume allow-list); (d) ONE
  secondary "Maybe later" button that closes the
  sheet and returns the coach to the originating
  surface without any state change; (e) when the
  upgrade target is `organization` (Coach/Pro
  hitting their own ceilings), the copy adapts
  ("Adding a 4th team takes one more upgrade —
  Organization plan, $49.99"); (f) `data-testid=
  "team-limit-upgrade-sheet"` for scoped e2e per
  LESSONS#0029 / #0082. The sheet is REUSABLE
  across every surface that POSTs `create-team` /
  `configure-team` (the join flow, the team-
  switcher's "+ Add team", the 0015 / 0024 /
  0033 entry points). Per AGENTS.md voice — no
  banned word; per LESSONS#0023 — instruct
  positively in jsdoc. (vitest under
  `tests/components/team-limit-upgrade-sheet.test.tsx`
  — new): (i) free → Coach scenario renders the
  Coach copy + the named team + the named inviter;
  (ii) free → Coach scenario WITHOUT
  `invitedBy` renders the named team only;
  (iii) Coach → Org scenario renders the Org
  copy + the named team; (iv) Pro → Org scenario
  renders the same Org copy; (v) the "Upgrade
  and join" button's href contains the resume
  string `join_team:<teamId>`; (vi) tapping
  "Maybe later" closes the sheet without side
  effect; (vii) no banned word across the
  fixture matrix.

- [ ] Extend the 0035 resume primitive
  (`src/lib/resume-target.ts` — existing, read
  first per LESSONS#0096) to add `join_team` to
  the closed enum of kinds. The new
  `parseResumeTarget` branch validates that the
  `teamId` segment is a UUID and that AFTER the
  Stripe tier-flip the team is REACHABLE by the
  caller (the same `configure-team` /
  `create-team` POST the wall blocked must now
  succeed). Per LESSONS#0035 — server-side
  validation is the load-bearing guard; an
  invalid or cross-org `teamId` resolves to
  `/home` per the existing fallback. The post-
  checkout landing reads the resume target,
  resolves to a NEW small client surface
  `src/app/settings/upgrade/resume-join-team.tsx`
  (or extension of the existing settings/upgrade
  resume handler — read at pickup per LESSONS#0096)
  that, after the tier has flipped, POSTs the
  ORIGINALLY-blocked join request and routes
  the coach to the new team's home. Per
  LESSONS#0044 — the webhook's tier-flip is the
  load-bearing guard; the resume cannot succeed
  until the tier has flipped to a non-free value.
  (vitest under `tests/lib/resume-target-join-
  team.test.ts` — new): (i) `parseResumeTarget`
  returns `{ kind: 'join_team', path:
  '/team/<teamId>' }` for a valid UUID +
  owned-team; (ii) cross-org `teamId` → `null`;
  (iii) malformed UUID → `null`; (iv)
  `buildResumePath({ kind: 'join_team',
  teamId })` returns the team home path. (vitest
  under `tests/api/auth-create-team-resume.test.ts`
  — new): (i) a Stripe success+resume callback
  with a flipped Coach tier executes the
  originally-blocked CREATE successfully;
  (ii) a callback with a still-free tier
  (webhook race) returns the structured 4xx
  again and the surface shows the sheet again
  (no silent free-tier write). The 0035-shipped
  test suite for `resume-target.ts` is
  BYTE-IDENTICAL per the existing kinds.

- [ ] Wire the structured 4xx body into the
  CLIENT-side join surfaces. At minimum:
  `src/app/(auth)/onboarding/setup/page.tsx`
  (the existing onboarding create-team flow,
  read at pickup per LESSONS#0096), the team-
  switcher's "+ Add team" entry point (read at
  pickup), and any 0015 / 0024 / 0033 join
  landing pages that POST `configure-team`.
  The wiring: on a 4xx response with
  `code: 'tier_limit_max_teams'`, RENDER
  `<TeamLimitUpgradeSheet />` instead of the
  flat error toast. The toast is fallback for
  ANY 4xx without the code (so unmodified
  callers degrade gracefully). Per LESSONS#0065 /
  #0066 / #0162 — smallest possible touch on
  each shared surface. Per LESSONS#0103 — the
  sheet is ADDITIVE; the existing toast path
  is unchanged when the code field is absent.
  (vitest under `tests/components/team-limit-
  surface-integration.test.tsx` — new): (i)
  a free coach hitting CREATE with the
  structured 4xx renders the sheet, NOT the
  toast; (ii) the same coach hitting an
  unrelated 4xx (e.g. validation error) still
  renders the existing toast unchanged;
  (iii) the sheet is rendered with the
  named team and the named inviter when
  present.

- [ ] Server-side tier enforcement is
  BYTE-IDENTICAL — the `tierLimits.maxTeams`
  check at `create-team:36` and
  `configure-team:48` fires at the same
  threshold (1 for free, 3 for coach, 999
  for pro/org). NO change to
  `src/lib/tier.ts:TIER_LIMITS` numbers. The
  free→Coach upgrade unblocks the join via
  the same `maxTeams` check (3 ≥ 2). Per
  AGENTS.md rule 5 — server gate is the
  load-bearing fence; the sheet is the UX
  layer on top. (vitest: assert
  `TIER_LIMITS.free.maxTeams === 1`,
  `TIER_LIMITS.coach.maxTeams === 3`,
  unchanged; the route's HTTP status code
  on the structured 4xx is 403 — the same
  status the existing string returns —
  byte-identical mapping.)

- [ ] Privacy / COPPA contract: the
  structured 4xx body NEVER includes any
  field from `players` (no DOB, jersey,
  medical_notes, parent_email, parent_phone),
  NEVER includes the inviting coach's email
  / phone / full surname (first name only
  per the 0021 / 0029 / 0074 posture). The
  `attemptedTeamName` is the team's NAME
  only (no kids' names, no internal ids
  beyond the URL-safe teamId). Per
  LESSONS#0036 / #0070 — `.select()`
  allow-lists; never mutate the DB row.
  (vitest: planted email / phone / DOB on
  the inviting coach are NEVER read; the
  4xx body passes a surname / minor-field
  regex sweep.)

- [ ] Voice contract: every new user-facing
  string (the sheet headline across both
  upgrade-target variants, the named-inviter
  line, the named-team line, the primary
  button label, the "Maybe later" label) contains
  NO AGENTS.md banned word per LESSONS#0023.
  Instruct positively in the component's
  jsdoc; never embed a verbatim ban-list per
  LESSONS#0023 / #0034 / #0088. The existing
  flat error STRING in the 4xx body is
  BYTE-IDENTICAL — banned-word lint also
  passes there (the existing string already
  does). (vitest: render every variant
  across the tier / inviter / team-name
  matrix and scan; the existing 4xx string
  is asserted unchanged.)

- [ ] Regression: the existing flow for a
  free coach within their team limit is
  BYTE-IDENTICAL — same 200 response on
  CREATE/CONFIGURE, same downstream onboarding,
  no sheet rendered. The existing
  `<UpgradeGate>` placements are BYTE-IDENTICAL
  (the sheet imports FROM the FEATURE_CONFIG
  copy; the gate's own rendering is
  unchanged). The 0035 resume primitive's
  existing kinds (`parent_report` etc.) are
  BYTE-IDENTICAL — only the `join_team`
  kind is additive. The Stripe checkout
  `success_url` for resumes is BYTE-IDENTICAL
  for non-`join_team` resumes. (vitest:
  snapshot the named routes, the existing
  resume parser, and the upgrade-gate render
  pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — pre-mint ONE seeded U12 team
  in the SAME ORG as the existing E2E coach's
  U10 team, with the E2E coach NOT YET listed
  on `team_coaches` for the U12 (so the
  configure-team path hits the limit). Pre-
  mint ONE seeded inviting-coach row
  (`auth.users` + `coaches` in the same
  idempotent block per LESSONS#0084) with a
  deterministic invite token tying her to
  the U12 invite. Per LESSONS#0101 — UUIDs in
  the next free range. Playwright spec: (a)
  sign in as the seeded free E2E coach, (b)
  visit the seeded U12 invite landing page,
  (c) tap "Join existing", (d) assert the
  POST to configure-team returns 403 with
  the structured `code: 'tier_limit_max_teams'`,
  (e) assert `<TeamLimitUpgradeSheet />`
  renders scoped by data-testid with the
  named team AND the named inviter, (f)
  assert the "Upgrade and join" button's
  href contains
  `resume=join_team:<u12TeamId>`, (g) mock
  the Stripe round-trip per the 0002 / 0035
  pattern, assert the post-checkout landing
  POSTs the join successfully and routes to
  /team/<u12TeamId>. Scope every assertion
  by data-testid per LESSONS#0081 / #0082.
  Skip when E2E creds are unset.

## Out of scope

- A change to the FREE-tier `maxTeams` number
  itself. v1 keeps 1 free team; raising it is
  a separate tier-economics discussion.
- A "preview the second team" surface where
  the free coach can SEE the U12 without
  joining. v1 keeps the data isolation strict
  per AGENTS.md COPPA contract — the team's
  roster is not exposed before the join.
- A NEW Stripe SKU or discounted "second team"
  upgrade. v1 reuses the existing Coach-tier
  $9.99 price.
- An ASYNC "queue the join — upgrade later"
  surface. v1 either upgrades-and-joins or
  abandons-and-shows-the-sheet-again. No half-
  applied state.
- A push notification or email when the
  inviter's coach upgrades to join. v1 does
  not notify the inviter; that's a v2.
- A LEADERBOARD of "you've been invited to
  N teams." v1 is single-invite contextual
  only.
- A retroactive sweep for coaches who PAST
  hit the wall and bounced. v1 fires forward
  only.
- A change to the team-switcher's "+ Add
  team" UX beyond rendering the sheet on
  the 4xx. v1 does not redesign the switcher.

## Engineering notes

Files / patterns the dev should touch.

- `src/app/api/auth/create-team/route.ts`
  (existing — read first per LESSONS#0096) —
  widen the 4xx response with the structured
  body. Per LESSONS#0036 — narrow `.select()`
  on the inviter / team reads. Per LESSONS#0049 /
  #0092 / #0100 / #0110 — at pickup Glob
  `tests/api/auth*team*.test.ts` and extend
  every `mockReturnValueOnce` queue.
- `src/app/api/auth/configure-team/route.ts`
  (existing — read first per LESSONS#0096) —
  same widening.
- `src/lib/resume-target.ts` (existing — read
  first per LESSONS#0096) — add `join_team` to
  the closed enum + `buildResumePath` branch.
  Per LESSONS#0103 — additive widening.
- `src/components/team/team-limit-upgrade-sheet.tsx`
  (new). Imports FEATURE_CONFIG entries from
  `src/components/ui/upgrade-gate.tsx` (DRY:
  do NOT re-copy the benefit copy).
- `src/components/ui/upgrade-gate.tsx` (existing
  — read first per LESSONS#0096) — NO change to
  the gate itself; the new sheet reuses
  FEATURE_CONFIG by EXPORTING the relevant
  entries (a new `export const COACH_BENEFITS`
  named export, or equivalent; pick the
  smallest-blast-radius shape at pickup).
- Caller surfaces — at minimum
  `src/app/(auth)/onboarding/setup/page.tsx`
  and the team-switcher entry point (read at
  pickup per LESSONS#0096). The integration
  is a SHARED `useTeamLimitUpgradeSheet()` hook
  (`src/hooks/use-team-limit-upgrade-sheet.ts`
  — new) that intercepts a 403 response with
  the new `code` and mounts the sheet. Per
  LESSONS#0065 / #0066 / #0162 — smallest
  possible touch per surface.
- `src/app/settings/upgrade/page.tsx` (existing
  — read first per LESSONS#0096) — extend the
  post-checkout resume handler with the
  `join_team` branch. Per AGENTS.md rule 3 —
  the join POST goes through the authed
  `query()` / `mutate()` helper, not the
  raw Supabase client.
- `src/lib/tier.ts` — NO change. NO new
  feature key.
- `tests/api/auth-create-team-tier-limit.test.ts`
  (new).
- `tests/api/auth-configure-team-tier-limit.test.ts`
  (new).
- `tests/api/auth-create-team-resume.test.ts`
  (new) — exercises the post-Stripe resume POST.
- `tests/lib/resume-target-join-team.test.ts`
  (new).
- `tests/components/team-limit-upgrade-sheet.test.tsx`
  (new).
- `tests/components/team-limit-surface-integration.test.tsx`
  (new).
- `tests/hooks/use-team-limit-upgrade-sheet.test.ts`
  (new).
- `tests/e2e/cross-team-upgrade-flow.spec.ts` (new).
  Seed extension per the AC. UUIDs in the next
  free range per LESSONS#0101. Skip when E2E
  creds are unset.
- New deps: NO. Migration: NO (every row read
  already exists). Env vars: NO. AI prompt
  change: NO. Tier feature key: NO new key
  (the existing `maxTeams` integer is the
  load-bearing gate).
- LESSONS to anchor: #0002 / #0039 (organizations.tier
  not plan; canAccess takes a string), #0023
  (positive voice), #0029 / #0082 (data-testid
  scoping), #0034 / #0088 (strip `--` comments
  on banned-word scan), #0035 (resume primitive
  reuse), #0036 (`.select()` allow-lists), #0040
  (stub stripe helpers deterministically), #0049 /
  #0092 / #0100 / #0110 (mock queue sweeps),
  #0057 (team_coaches not teams.coach_id), #0061
  (literal space defensive scans), #0065 / #0066 /
  #0162 (smallest possible touch on shared
  surfaces), #0066 (widen existing select vs add
  from()), #0070 (no DB-row mutate), #0084 /
  #0101 (seed posture), #0096 (schema wins over
  prose — read the actual `create-team` /
  `configure-team` shape, the actual
  FEATURE_CONFIG export shape, the actual
  resume-target enum), #0103 (additive widening),
  #0116 (empty-Glob no-op), STRATEGY_AUDIT_2026-06-15.md
  (acquisition surface vs conversion surface
  asymmetry — the multi-team coach is the
  highest-LTV free user this surface converts).

Depends on: 0035 (shipped — the resume primitive
extended here), 0015 (shipped — assistant invite),
0024 (shipped — director invites staff), 0029
(shipped — observer-to-coach), 0033 (shipped —
program-claim landing), 0060 / 0067 (shipped —
cross-team and sub-coach surfaces that drive
free coaches toward this wall).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-06-16 — branch `feat/0086-cross-team-coach-tier-upgrade-moment` opened; ticket flipped to `in-progress`.
- 2026-06-16 — deviation: the ticket prose references an "invite token (0015/0024 invite-link signature)" on `create-team` / `configure-team`. Schema wins (LESSONS#0096): 0015's referral path is a `?ref=<code>` on `/signup` (no token rides on `create-team`); the closest signed invite primitive is 0065's `verifyDirectorInviteRef`, which binds coach+team+invite+sentAt and is irrelevant to a paid-coach landing here. Real-world wiring: an OPTIONAL `inviteCoachId` field on the request body, validated server-side to be a `coaches.id` in the SAME org as the caller — when present and resolves, populate `invitedBy: { firstName, role }`; otherwise OMIT the field. The role is derived from the inviter's `team_coaches.role` for the attempted team (head_coach / assistant_coach); if no team_coaches row exists for that pair, default to `assistant_coach`. Documented here per LESSONS#0096 / #0002 / #0039.
- 2026-06-16 — Reused the existing 0035 `parseResumeTarget` / `buildResumePath` enum: added `join_team` to `RESUME_KINDS`. Team-scoped only — no playerId.
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
