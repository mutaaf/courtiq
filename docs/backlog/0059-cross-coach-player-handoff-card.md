---
id: 0059
title: When a kid ages up to next year's coach in the same program, hand the new coach what worked for the kid
status: shipped
priority: P1
area: ai
created: 2026-05-30
owner: product-groomer
---

## Implementation log

- 2026-05-30 [implementation-dev] Picked up; branch `feat/0059-player-handoff-card`.
  Reconciliations against the spec:
  - Migration prefix `055` was free (last existing is `054_weekly_pulse_shares.sql`)
    so the migration is `055_player_handoffs.sql` as named in the AC.
  - The spec's AC mentions a possible new `players.coach_notes` column for the
    receiver "Save to my coach notes" target; the schema already has
    `players.notes` (existing nullable text) — schema wins (LESSONS#0039/#0051/#0057).
    Instead of widening `Player` (which would cascade into every literal-constructor
    test, LESSONS#0099/#0052), the claim route stores the handoff body via the
    EXISTING `player_notes` table (a coach-private journal already wired in by
    earlier tickets), threaded as a new row with `note_type = 'handoff'`. This
    keeps the COPPA promise (no new descriptive minor column on `players`) AND
    avoids the literal-constructor cascade. Documented here, not invented in code.
  - `stripContactInfo` is the existing helper in `src/lib/parent-reply-utils.ts`.
  - For the source-coach badge / sheet entry point on the season-recap card area
    of /home: rather than refactor the very large home page, the source sheet is
    rendered from a dedicated new section that we mount inline on /home at the
    bottom of the "season recap" block. The button is the explicit user-facing
    entry; the sheet is a client component.

## User story

As a volunteer rec-league coach who just finished a season with the 9-year-olds, knowing
that six of those kids are aging up to the 10-and-under team next season under another
coach in the same program, I want one tap on my finished roster to generate a short,
COPPA-clean "what worked for me coaching this kid" one-pager per player, queued
silently to the program's next-season roster intake so that when the new coach claims
the team in August she opens her roster and finds, beside each kid's name, ONE coaching
note from me — what I actually figured out coaching that kid for 12 weeks — instead of
starting blind the way every other youth coach in the country starts every August.

## Why now (four lenses)

### Product Owner
0034 ships parent-report memory ACROSS seasons for the SAME coach (the prior-season
report threaded into the next season's parent report for the same coach + same
player). 0052 ships the same-coach next-season roster carry. 0037 ships the coach
signature memory ACROSS that coach's own teams. What none of these does is move the
COACHING KNOWLEDGE across COACHES inside a program when a player ages up: every August
in every rec program in the country, a new coach inherits a roster and starts blind.
The product already owns the structured coach-authored memory of "how to coach this
kid"; the missing edge is the program-internal handoff that delivers that memory to
the next coach. The smallest meaningful unit of value is one new button at the end of
a season on the prior coach's roster — "Hand off players to next season" — which fires
ONE AI call per player to summarize the coach's own end-of-season observations into a
short, no-PII, coach-to-coach one-pager (the player's first name only, the coach's
two-line "what worked for me," one drill that landed, one growth area). The cards are
written to a new `player_handoffs` table keyed to `(source_coach_id, player_id,
target_coach_id NULL)`. When a coach in the same program creates a new team and
imports a player by first name + age + jersey number (the existing roster intake
flow), the handoff card auto-attaches to the new roster row. The receiving coach
sees one badge "1 handoff note" beside the kid; tap to read. No new sharing surface,
no new public page, no parent-side surface.

### Stakeholder
This is the deepest moat ticket in the backlog. It is also the hardest to copy. Three
structural reasons. (1) The handoff card requires the EXISTING memory layer — coach-
authored observations, signature, the per-player season storyline (already shipped) —
none of which a competitor has. A forms-app competitor cannot generate a meaningful
handoff card because they have no per-player coaching memory to summarize. (2) The
handoff card requires the PROGRAM GRAPH — the source and target coaches must be in
the same `org_id` (already a hard requirement of the routing). 0024 ships the multi-
coach invite; 0028 ships the program pulse; this ticket ships the ARTIFACT that
makes a program's coaches a continuous coaching staff across seasons instead of a
collection of unrelated volunteers who happen to share a parking lot. (3) The card
compounds the data graph in a way nothing else does: every handoff is a coach-authored
piece of pedagogy that travels across coaching transitions, so the program's
collective coaching memory grows over time even as individual coaches turn over.
This is the network-effect ticket that turns SportsIQ from "the coach's notebook" into
"the program's collective coaching memory." COPPA is the load-bearing constraint:
the handoff card MUST NOT widen what we collect on minors. The card carries (a) the
player's first name only (NEVER full name, DOB, parent contact, address, photo),
(b) the source coach's coach-authored notes (already on `observations` + the season
storyline — already approved minor-adjacent content), and (c) a one-drill / one-
growth-area summary the AI generates from the existing notes — strictly DERIVED from
data the source coach already owns. The new `player_handoffs` table has NO new
descriptive minor field; it stamps WHO wrote the card, WHEN, and the card BODY
(coach-authored prose).

### User (the source coach, end of season, looking at the finished season recap)
She opens /home. The season recap (0036) is at the top. New small section underneath:
"Hand off your players to next season (8 of 10 ready)." The 8 are the players she
has at least 5 observations on (cold-start guard — players she barely coached don't
qualify). She taps. A sheet opens with a checklist of the 8 players, each row with a
preview of what the AI will write ("Eli — what worked: short, specific cues during
shooting drills; ONE drill that landed: stationary form-shoot with cue 'guide hand
off early'; growth area: still working on left-hand finishing"). She skims, unchecks
ONE kid (she wants to think about that one more), taps "Send to program." A toast:
"Handoff notes queued for the 7 players. The next coach will see them when they pick
up the roster." That's it on her end. NO direct send to the receiving coach, NO email
fan-out, NO public surface — the cards live in the program's roster intake and
materialize when a coach in the same `org_id` creates a new team and imports a
matching player.

### User (the receiving coach, August, claiming her new roster)
She does the existing 0033 "claim my team" or 0024 "join the program" flow and lands
on /roster with the 10 kids the program imported. Beside the names of the 7 kids who
have handoff notes, a small badge "1 handoff note." She taps Eli's badge. A sheet
opens: "From Coach Maya, 2025 fall season — Eli responds well to short, specific
cues during shooting drills. One drill that landed for me: stationary form-shoot
with the cue 'guide hand off early.' He's still working on left-hand finishing —
worth a few minutes early in the season." Two buttons: "Save to my coach notes" (
copies the body into the new `players.coach_notes` field — read first; if no such
column, into a `coach_team_player_notes` row) and "Close." That's it. No public-
ness, no parent-side surface, no analytics. The receiving coach starts the season
knowing one true thing about Eli a stranger coach would have spent 4 weeks figuring
out.

### Growth
The "show me" moment is the RECEIVING COACH'S /roster screen in August — the row of
kids with handoff badges beside them, the first time the new coach sees that another
coach has handed her real coaching knowledge about a kid she has never met. That's
the screenshot the new coach sends to the program director saying "this is why I
will keep using SportsIQ" — and the screenshot the program director sends to the
next coach they recruit saying "this is what the program gives you." The retention
compound is asymmetric: the SOURCE coach who hands off players is a coach who has
captured a season's worth of observations (the product's stickiest user); the
RECEIVING coach who picks up a handoff has a value moment in their first session
that NO competitor can match. The acquisition compound runs through the program
director: a director who sees the handoff working in one season recruits new
coaches with "you'll inherit the prior coach's notes from day one." Distinct from
every shipped surface: 0034 carries memory within ONE coach across seasons; 0052
carries the ROSTER within one coach to next season; 0024 invites the coaches; this
is the first surface that carries COACHING KNOWLEDGE across the coaches inside a
program — the artifact a forms-app competitor literally cannot generate because
they have no structured per-player coaching memory.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] New migration `055_player_handoffs.sql` (verify next free prefix at pickup
  via `ls supabase/migrations/` per LESSONS#0006) adds the table `player_handoffs
  (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source_coach_id UUID NOT NULL
  REFERENCES coaches(id) ON DELETE CASCADE, source_player_id UUID NOT NULL
  REFERENCES players(id) ON DELETE CASCADE, source_team_id UUID NOT NULL
  REFERENCES teams(id) ON DELETE CASCADE, org_id UUID NOT NULL REFERENCES
  organizations(id) ON DELETE CASCADE, season_label TEXT NOT NULL, card_body
  TEXT NOT NULL, ai_provider TEXT NOT NULL, claimed_by_coach_id UUID NULL
  REFERENCES coaches(id) ON DELETE SET NULL, claimed_at TIMESTAMPTZ NULL,
  claimed_player_id UUID NULL REFERENCES players(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL
  DEFAULT NOW())`. Indexes: `(org_id, is_archived) WHERE NOT is_archived`,
  `(source_coach_id, created_at DESC)`, `(claimed_by_coach_id, claimed_at DESC)
  WHERE claimed_by_coach_id IS NOT NULL`. Document the COPPA approval trail in
  the `--` header: NO new column on `players`; the `card_body` is coach-authored
  prose (the AI's role is to SUMMARIZE the coach's existing observations, not
  to invent new descriptive minor data); the `claimed_player_id` FK is the
  RECEIVING coach's new `players` row, never a remote-DB join. LESSONS#0088 —
  strip `--` comments before the test scans DDL. (vitest: scan executable DDL
  only; assert column allow-list matches exactly; assert NO new column on
  `players`; banned tokens `dob`, `medical`, `photo`, `address`, `parent_email`,
  `biometric`, `similarity` absent from executable DDL.)
- [ ] New AI prompt `playerHandoffCard` in `src/lib/ai/prompts.ts`. Input
  `{ playerFirstName, ageGroup, sportName, topStrengths: string[], topGrowthArea:
  string, signatureDrillNames: string[], coachAuthoredHighlights: string[],
  seasonLabel }`. Output JSON: `{ card_body: string }` where `card_body` is 3-4
  short sentences in plain English ("Eli responds well to short, specific cues
  during shooting drills. One drill that landed for me: stationary form-shoot
  with the cue 'guide hand off early.' He's still working on left-hand finishing
  — worth a few minutes early in the season."). Per LESSONS#0023 the system
  prompt instructs the voice POSITIVELY ("write like a coach handing off to
  another coach over coffee — short, specific, no marketing voice"); never
  enumerates the banned tokens. The prompt receives ONLY the eight named
  inputs — never an observation's raw text containing a name that isn't the
  player's first name, never a parent contact, never a DOB. (vitest contract
  test: prompt runs under Anthropic + one fallback provider; scan `${system}\n$
  {user}` for AGENTS.md banned tokens — none present; assert the prompt's user
  payload contains EXACTLY the eight named keys.)
- [ ] `POST /api/player-handoffs/generate-preview` (new) accepts
  `{ teamId, playerIds: string[] }`. Auth → 401. Team belongs to the caller →
  404. Each player belongs to the team → 404 on any miss. For each player:
  resolve the structured inputs (the existing season-storyline / season-letter
  logic already aggregates the strengths + growth area + highlights — reuse
  those helpers, don't duplicate them), call `callAI()` with the new prompt
  (one call per player), return `{ previews: Array<{ playerId, playerFirstName,
  cardBody }> }`. Cold-start guard: any player with fewer than 5 observations
  this season is silently dropped from the preview list (returned in a
  `dropped: Array<{ playerId, reason: 'insufficient_observations' }>` array).
  AI quota goes through `callAI()` — the route is universal but a free coach
  with < 5 calls remaining gets a 402 with the existing 0035 upgrade-gate
  payload at the route level. (vitest: 401; 404 foreign team; 404 foreign
  player; cold-start drop on a 3-observation player; happy path returns N
  previews with the expected first-name + body shape; quota-blocked free coach
  sees the existing 0035 upgrade-gate payload.)
- [ ] `POST /api/player-handoffs/commit` (new) accepts
  `{ teamId, playerIds: string[], previews: Array<{ playerId, cardBody }> }`.
  Auth → 401. Team belongs to the caller → 404. For each player: insert one
  `player_handoffs` row with `source_coach_id = caller`, `source_player_id =
  player.id`, `source_team_id = teamId`, `org_id = team.org_id`, `season_label
  = team.season` (or the resolved equivalent — read the existing season-label
  helper first), `card_body = previews[i].cardBody` (server re-validates length
  < 1000 chars + strips planted email / phone / URL via the same
  `stripContactInfo` helper from 0056), `ai_provider = the provider that
  generated the preview`. Idempotent at `(source_coach_id, source_player_id,
  source_team_id)` — a second commit reuses the existing row. Returns
  `{ committed: Array<{ playerId, handoffId }> }`. Service-role only. (vitest:
  401; 404 foreign team; happy path inserts one row per player; idempotent
  recommit returns the same ids; planted contact info in the cardBody is
  stripped; the `card_body` is exactly the coach-edited string + the strip.)
- [ ] `GET /api/player-handoffs/for-player?playerId=<id>` (new) — the
  RECEIVING coach's read path. Auth → 401. Resolves the caller's `org_id`,
  finds an unclaimed handoff matching `org_id` AND a `players` shape match
  (the existing roster-intake matcher — read first; mirrors the 0052 next-
  season-roster `prior_player_id` posture): match on `first_name`
  (case-insensitive), `age_group` within ±1 year, and `jersey_number` if both
  sides have one. Returns the matched handoff `{ handoffId, sourceCoachFirst
  Name, seasonLabel, cardBody }` or `null`. Multiple matches → return the most
  recent. The matcher uses ONLY data the receiving coach already has (the new
  `players` row was just imported — no cross-DB join). (vitest: 401; null on
  no match; null on cross-org match; happy path with first-name + age match;
  most-recent-wins on multi-match.)
- [ ] `POST /api/player-handoffs/[handoffId]/claim` (new) — the RECEIVING
  coach's "save to my coach notes" action. Auth → 401. Resolves the handoff;
  if `handoff.org_id != caller.org_id` → 404; if `handoff.claimed_by_coach_id
  IS NOT NULL` → 409. Stamps `claimed_by_coach_id = caller`, `claimed_at =
  now()`, `claimed_player_id = body.playerId` (the receiving coach's new
  player row id; must belong to the caller — verified server-side). Returns
  `{ handoffId, claimed_player_id }`. Idempotent: a second claim by the same
  coach returns 409 with the SAME `claimed_player_id`. (vitest: 401; cross-org
  404; second claim 409; happy path stamps the row + claims it; foreign
  `playerId` 404.)
- [ ] `src/components/handoffs/handoff-sheet.tsx` (new) — the SOURCE coach's
  end-of-season sheet, opened from a new "Hand off players to next season"
  button on the season-recap card area of /home (read first to find the exact
  layout). The sheet POSTs `generate-preview` on open (loading state per
  LESSONS pattern — one POST on open, not a re-render-firing useEffect), shows
  the per-player preview with a checkbox per player (defaulted ON for eligible
  ones; the cold-start drops are shown in a small "not enough observations
  yet" footer line), and a "Send to program" CTA that POSTs `commit`. On
  success the sheet collapses to a "Handoff queued for N players" toast. NO
  direct send to any coach; NO public surface. (vitest component test: render
  with mocked preview → assert checkboxes render; uncheck one + commit →
  asserts only checked players are posted; commit success → toast renders.)
- [ ] `src/components/roster/handoff-badge.tsx` (new) — the RECEIVING coach's
  per-row badge on /roster. For each player row the component fires
  `useQuery({ table: 'player_handoffs', op: 'for-player', playerId })` (via
  the new GET); on a non-null result renders a small "1 handoff note" badge
  beside the player's name. Tapping the badge opens a sheet rendering the
  card body, the source coach's first name, the season label, and TWO buttons:
  "Save to my coach notes" (POSTs claim + writes the body into the existing
  per-player notes surface — read first; if `players.coach_notes` column
  doesn't exist, write into the existing `coach_team_player_notes` row or its
  equivalent; if NO such surface exists, the dev creates a one-line text-area
  column on `players` IN THE SAME MIGRATION as the handoffs table, with the
  COPPA approval trail documented in the migration `--` header — coach-
  authored prose only). "Close" dismisses. (vitest component test: render with
  no handoff → no badge; render with a handoff → badge renders; tap → sheet
  renders the body; claim → calls the claim route; close dismisses.)
- [ ] AI quota / provider failover: `callAI()` is the ONLY AI entrypoint
  (AGENTS.md rule 4). The preview route logs every call to `ai_interactions`.
  A quota-blocked free coach sees the existing 0035 upgrade-gate payload on
  the preview route (the COMMIT route does NOT call AI — a coach who pre-
  generated previews could in theory commit during a later quota-blocked
  state; this is a feature, not a bug). The `pro_coach` / `organization`
  tiers' AI quotas are not changed by this ticket. (vitest: quota-blocked free
  coach on preview route → 402; quota-blocked coach on commit route → 200 if
  previews were generated earlier in the month.)
- [ ] Tier / feature gating: ONE new feature key `feature_player_handoff`
  registered in `src/lib/tier.ts` (`TIER_LIMITS` arrays) and
  `FEATURE_CONFIG` in `<UpgradeGate>` (per LESSONS#0023 the prop value must
  equal the tier-key exactly). GENERATING handoffs (source coach) requires
  `coach` tier or up (free coaches with only one team and ~10 players don't
  meaningfully benefit from a cross-coach handoff; the feature is for
  recurring coaches in programs). RECEIVING / CLAIMING handoffs (receiving
  coach) is UNIVERSAL — a free coach in an `organization`-tier program can
  always claim a handoff written for them, because gating the receiver path
  would orphan handoffs in the program. The receiver path bypasses the tier
  check; the source path enforces server-side `canAccess(tier,
  'feature_player_handoff')`. (vitest: free coach on the preview route → 402
  with `<UpgradeGate feature='feature_player_handoff' />`-shaped payload; coach-
  tier source → 200; free coach as receiver → claim route succeeds.)
- [ ] Privacy / COPPA: the AI prompt receives ONLY the eight named inputs.
  Planted full names, parent emails, DOBs, addresses in the source
  observations are NOT passed to the model (the structured-inputs builder
  reads only the strengths / growth area / drill names / coach-authored
  highlights — derived fields, not raw observation text with embedded PII).
  The `card_body` is server-stripped of planted contact info via the same
  `stripContactInfo` helper as 0056. The new `player_handoffs.card_body`
  column carries coach-authored prose only; the migration adds NO descriptive
  minor field. The receiving coach's read NEVER reaches the SOURCE coach's
  underlying observations — only the `card_body` (already stripped). Cross-
  org access is impossible (the `org_id` check on the receiver routes is the
  load-bearing posture). (vitest: planted email + phone + URL in a source
  observation does NOT appear in the AI prompt payload; the same planted
  tokens in the coach-edited `cardBody` are stripped before commit; a
  cross-org `for-player` query returns null.)
- [ ] Voice contract: every new user-facing string the dev adds (the season-
  recap "Hand off players to next season" CTA, the source sheet's header /
  preview / commit-button / toast, the receiving roster badge, the receiving
  sheet's header / Save button / Close button, the upgrade-gate copy) contains
  NO AGENTS.md banned word. Per LESSONS#0023 instruct positively ("Hand off
  your players to next season's coach" / "Save to my coach notes"); never
  enumerate the banned tokens. The AI prompt's `system` + `user` strings
  contain no banned word in the INSTRUCTION. (vitest: scan every rendered
  component's text + the prompt strings.)
- [ ] Allow-list and data-route posture: `player_handoffs` is added to the
  READ allow-list in `src/app/api/data/route.ts` (for the source coach's
  history view). It is NOT added to the mutate allow-list — insertions /
  claims flow through the dedicated routes only. The READ allow-list scopes
  every read to `source_coach_id = caller OR claimed_by_coach_id = caller OR
  org_id = caller.org_id` via the existing per-table RLS-equivalent layer
  (read first). (vitest: a `query({ table: 'player_handoffs' })` for the
  caller's own handoffs succeeds; a direct `mutate({ table:
  'player_handoffs', op: 'insert' })` is refused with 403; a cross-org read
  returns no rows.)
- [ ] Regression: existing 0034 cross-season parent report path is byte-
  identical (it reads from `plans` of `type='parent_report'`, not from
  `player_handoffs`). Existing 0052 next-season roster carry is byte-identical
  (it uses `prior_player_id` on `players`, NOT `claimed_player_id` on
  `player_handoffs` — they are different columns on different tables and the
  new ticket does not touch the 0052 paths). Existing `players` writes are
  byte-identical UNLESS the dev decides to add a new per-player coach-notes
  column for the receiver claim; if so, the column is nullable + defaults to
  NULL and the existing roster intake skips it. (vitest: snapshot the existing
  0034 cross-season report fixture; assert no diff. Snapshot the existing
  0052 roster carry fixture; assert no diff. If a new column is added, a
  fixture players-row insert pre-migration still passes post-migration.)
- [ ] Seeded e2e on the 0006 fixture: seed extension is TWO coaches in the
  same `org_id` (one already exists; add a SECOND coach + matching
  `auth.users` row per LESSONS#0028, in the `00000000-0000-4000-a000-
  000000000002` UUID family — verify no collision at pickup per LESSONS#0043),
  a SOURCE team with at least 5 observations on a seeded player, and a
  TARGET team with no roster yet (the receiving coach claims and creates a
  matching player). UUIDs in the `0000000000c0+` range (LESSONS#0101).
  Playwright: sign in as the source coach, tap "Hand off players," verify the
  preview sheet, commit; sign out; sign in as the receiving coach, navigate
  to /roster of the target team, import a matching-first-name + matching-age
  player (use the existing roster-intake flow), assert the handoff badge
  appears beside the player's name; tap → sheet renders → tap "Save to my
  coach notes" → assert the per-player notes field shows the card body.
  Scope assertions with `data-testid` (LESSONS#0081). Skip when E2E creds
  are unset.

## Out of scope

- A direct coach-to-coach message channel ("text Maya a thank-you for the
  handoff"). v1 is one-way: source coach writes, receiving coach reads. A
  reply channel is a separate ticket.
- An admin / program-director surface to view all handoffs in a program. The
  director's view is the existing 0028 program-pulse; a per-handoff director
  surface is a future ticket.
- A parent-side surface ("your kid's prior coach said this"). The handoff
  card is COACH-PRIVATE — it is the receiving coach's coaching tool, not a
  parent-facing artifact. Parent-facing growth narratives live in 0034.
- Auto-generating handoffs on a cron at season end. v1 requires the source
  coach to tap. Auto-generation would destroy the voice authenticity that
  the receiving coach trusts.
- Handoff cards for players the source coach has fewer than 5 observations
  on. v1 silently drops these (the cold-start guard). A future ticket can
  enable explicit override.
- Cross-program handoffs (a player who transfers to a DIFFERENT program).
  v1 is same-`org_id` only. Cross-program transfer is a separate privacy
  conversation.
- Storing the AI provider's per-call raw input. v1 logs to `ai_interactions`
  via the existing `callAI()` path; no new audit table.
- A revision / version history of the card. v1 is single-version: the source
  coach commits one body per player. Edits are out of scope.
- Auto-attaching handoff cards to imported players whose first name + age
  don't match. v1 requires a match; mismatched handoffs stay unclaimed
  until a coach explicitly claims them (a future ticket can build the
  director's "5 unclaimed handoffs in your program" surface).
- A pricing change to the `coach` tier to include handoff generation. v1
  re-uses the existing tier feature configuration with the new
  `feature_player_handoff` key already present in `coach` / `pro_coach` /
  `organization` arrays.

## Engineering notes

Files / patterns the dev should touch.

- New migration `supabase/migrations/055_player_handoffs.sql` per the AC
  schema. Verify next free prefix at pickup via `ls supabase/migrations/`
  (LESSONS#0006); if 055 is taken, use the next free integer. Document the
  COPPA approval trail in the `--` header (LESSONS#0088 — strip comments
  before scanning).
- `src/types/database.ts` — add `PlayerHandoff` interface and (if the dev
  decides to add the per-player coach-notes column) extend `Player` with
  `coach_notes: string | null`. Per LESSONS#0099 / #0052 — if widening
  `Player`, grep `tests/` for `Player` literal constructors and add the
  new field with `null` default in EVERY one (`tests/factories/index.ts`,
  every `makePlayer` test fixture).
- `src/lib/ai/prompts.ts` (existing — append) — new export
  `playerHandoffCard({ playerFirstName, ageGroup, sportName, topStrengths,
  topGrowthArea, signatureDrillNames, coachAuthoredHighlights, seasonLabel
  }): { system, user }`. Voice POSITIVELY per LESSONS#0023.
- `src/lib/player-handoff-utils.ts` (new) — pure helpers:
  `buildStructuredHandoffInputs(player, observations, signature): { topStrengths,
  topGrowthArea, signatureDrillNames, coachAuthoredHighlights }` (reuse the
  existing season-storyline / season-letter aggregation logic — do NOT
  duplicate; refactor into a shared helper if needed),
  `matchHandoffToPlayer(handoff, player): boolean` (case-insensitive first
  name + age within ±1 + jersey-number when both present).
- `src/app/api/player-handoffs/generate-preview/route.ts` (new) — `POST({ teamId,
  playerIds })`. Auth → 401; ownership → 404; cold-start drop; call `callAI()`
  per player; return previews + dropped. Service-role only; passes `orgId` to
  `callAI()` so quota + provider routing work (AGENTS.md). Per LESSONS#0023
  the route is tier-gated server-side via `canAccess(tier,
  'feature_player_handoff')`.
- `src/app/api/player-handoffs/commit/route.ts` (new) — `POST({ teamId,
  playerIds, previews })`. Auth → 401; ownership → 404; insert + idempotent
  reuse + strip planted contact info via `stripContactInfo` (existing
  helper from 0056 — read first via `grep -rn "stripContactInfo" src/lib/`).
- `src/app/api/player-handoffs/for-player/route.ts` (new) — `GET(request)`.
  Auth → 401; org-scoped first-name + age + jersey-number matcher; returns
  the most recent unclaimed handoff or `null`. Per LESSONS#0039 NEVER trust
  client-supplied org_id; resolve from the caller server-side.
- `src/app/api/player-handoffs/[handoffId]/claim/route.ts` (new) —
  `POST(request, { params })`. Auth → 401; cross-org 404; already-claimed
  409; happy stamps the row + writes the body to the per-player notes
  surface (existing or new column).
- `src/components/handoffs/handoff-sheet.tsx` (new) — client component on the
  season-recap card area. POSTs preview on open, renders checkboxes, commits
  on tap.
- `src/components/roster/handoff-badge.tsx` (new) — client component on each
  roster row. Renders nothing on no-handoff; renders a small badge + sheet
  on a found handoff.
- `src/components/ui/upgrade-gate.tsx` — register `feature_player_handoff` in
  `FEATURE_CONFIG` with the benefit copy. Per LESSONS#0023 the `feature` prop
  must equal the tier-key exactly.
- `src/lib/tier.ts` — register `feature_player_handoff` in the `features` arrays
  of `coach`, `pro_coach`, `organization` (free does NOT get it). The Free coach
  who is RECEIVING a handoff (claim path) is universal — the receiver routes
  do NOT check `canAccess`.
- `src/app/api/data/route.ts` — add `player_handoffs` to the READ allow-list.
- `src/app/api/data/mutate/route.ts` — do NOT add. Insertions / claims flow
  through the dedicated routes only.
- `src/lib/supabase/middleware.ts` — NO change (every new route is dashboard-
  only / authed).
- `tests/ai/player-handoff-card.test.ts` (new) — AI contract test under
  Anthropic + one fallback provider per AGENTS.md test rule. Assert the
  rendered prompt has the eight named inputs; no banned tokens in
  `${system}\n${user}`; the response is structurally `{ card_body: string }`.
- `tests/api/player-handoffs-preview.test.ts` (new) — 401 / 404 / cold-start
  drop / happy / quota-blocked free → 402 with upgrade gate.
- `tests/api/player-handoffs-commit.test.ts` (new) — 401 / 404 / happy /
  idempotent / planted contact-info stripped.
- `tests/api/player-handoffs-for-player.test.ts` (new) — 401 / cross-org
  returns null / first-name + age match / most-recent-wins.
- `tests/api/player-handoffs-claim.test.ts` (new) — 401 / cross-org 404 /
  already-claimed 409 / happy stamps the row + writes notes.
- `tests/migrations/player-handoffs-coppa.test.ts` (new) — strip `--`
  comments per LESSONS#0088; assert column allow-list on `player_handoffs`;
  assert banned tokens (`dob`, `medical`, `photo`, `address`,
  `parent_email`, `biometric`, `similarity`) absent from executable DDL;
  assert NO new descriptive minor field on `players`.
- `tests/components/handoff-sheet.test.tsx` (new) — render; preview fetch
  fires; checkbox toggle; commit calls the route with the right ids.
- `tests/components/handoff-badge.test.tsx` (new) — render with no handoff
  → no badge; render with a handoff → badge + sheet; claim calls the route.
- `tests/e2e/player-handoff-flow.spec.ts` (new Playwright spec) against the
  0006-seeded Supabase. Seed extension: a SECOND coach + matching
  `auth.users` row (LESSONS#0028) + a SOURCE team with 5+ observations on
  one seeded player + a TARGET team for the second coach. UUIDs in the
  `0000000000c0+` range (LESSONS#0101); coach UUID in the `00000000-0000-
  4000-a000-000000000002` family (verify no collision at pickup,
  LESSONS#0043). Spec: sign in as the source coach, tap "Hand off players,"
  commit; sign out; sign in as the receiving coach, navigate to /roster,
  import a matching-first-name + matching-age player via the existing
  roster intake (or seed the matching player directly to keep the spec
  short), assert the handoff badge appears, tap → sheet renders → tap
  "Save to my coach notes" → assert the per-player notes field shows the
  card body. Scope with `data-testid` (LESSONS#0081). Skip when E2E creds
  are unset.
- New deps: NO. Migration: YES (one new table + optional one new column on
  `players`). Env vars: NO. AI prompt change: YES — new
  `playerHandoffCard` in `src/lib/ai/prompts.ts`. Tier feature key: YES —
  `feature_player_handoff`.
- LESSONS to anchor: #0006 (migration prefix uniqueness — verify at pickup),
  #0009 (a new `players` column must align with any CHECK constraint —
  there is none, but verify), #0023 (instruct prompt + UI POSITIVELY;
  `<UpgradeGate feature=...>` prop equals tier-key exactly), #0028 (seed
  any new coach with a matching `auth.users` row), #0039 (never trust
  client-supplied org_id), #0043 (seed UUID collisions in the coach family),
  #0049 / #0092 / #0100 (extending shared routes requires updating sibling
  mock queues — but this ticket adds DEDICATED new routes so the risk is
  lower; still grep), #0052 / #0099 (if widening `Player` type, grep tests
  for literal constructors and add the new field), #0078 (response-keyset
  deep-equality), #0081 (data-testid scoping in Playwright), #0084 (seed
  player + parent contacts when adding observation rows; for handoffs we
  need an existing seeded player with 5+ obs), #0088 (strip `--` comments
  before DDL banned-token scan — the COPPA approval trail lives in the
  comment header), #0101 (seed UUID range collisions), #0102 (anchor
  faker fixtures).
