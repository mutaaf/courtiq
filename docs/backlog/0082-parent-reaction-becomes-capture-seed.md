---
id: 0082
title: When a parent leaves a reaction on the portal naming a specific thing about their kid — "thank you for sticking with him on his shooting" — show that one line back to the coach at the TOP of next Tuesday's Capture for THAT kid as a seed — "Sarah said his shooting carried last week — what did you see today?" — so the parent's reaction stops being a Monday rollup artifact and becomes the kid's first observation of the next session
status: groomed
priority: P1
area: capture
created: 2026-06-11
owner: product-groomer
---

## User story

As a volunteer coach who opened the 0041 Monday parent-reactions rollup
and read Sarah's note "thank you for sticking with him on his shooting,
he came home actually proud Tuesday," took the moment seriously enough
to fire the 0056 one-tap thank-you back to Sarah, and is now standing on
the court the FOLLOWING Tuesday at 5:45pm about to capture Devon for the
first time this week, I want — at the TOP of Devon's per-player Capture
sheet (where the existing 0025 per-player memory line "Devon was
working on his shooting on May 12, May 19, May 21" already lives) — ONE
quiet line in zinc-500: "Sarah said his shooting carried last week —
what did you see today?" so the parent's specific reaction on Monday
becomes the SEED of Devon's first observation NEXT Tuesday, the loop
the product has been building (parent reacts → coach reads → coach
thanks → coach captures the named thing) finally CLOSES, and the
parent's words become the prompt that gets the coach typing on a kid
who would otherwise be a silent player (the existing 0062 nudge
target).

## Why now (four lenses)

### Product Owner

The product has shipped the full parent-reaction stack — 0009 / 0022 /
0023 ship the reaction primitive; 0041 ships the Monday rollup; 0056
ships the coach's one-tap thank-you back to the parent. The loop is
single-direction: the parent reacts → the coach reads on Monday → the
coach thanks on Monday → the reaction is ARCHIVED. What is MISSING is
the LAST seam: the parent's reaction is the highest-quality
unstructured signal in the product (a parent naming a specific thing
about their kid) and it dies in the rollup. The smallest meaningful
unit of value is: (a) a new pure helper
`extractReactionSeed(reactions, playerId, lookbackDays = 14)` that
filters `parent_reactions` for the named player in the window and
returns the SINGLE most-recent reaction with `note IS NOT NULL AND
length(note) BETWEEN 12 AND 300` (rules out heart-only reactions and
spammy long notes — both are noise for the seed); (b) a small
extension to the existing 0025 per-player Capture top-card (real
path read at pickup per LESSONS#0096) that, when a recent reaction
seed exists, renders ONE quiet zinc-500 line ABOVE the existing
"working on X on dates Y, Z" line in the shape "Sarah said his
shooting carried last week — what did you see today?" where the
parent's first name + the parent's WORDS (sanitized; max 80 chars
displayed; truncated with a "…" if longer) drive the prompt; (c)
the seed line is REMOVED from the surface the moment the coach's
NEXT observation on this player is written (the seed is a
one-shot prompt — once the coach has captured something this
session, the seed has done its job and the screen returns to the
existing 0025 surface; this prevents the seed from staying around
across sessions); (d) the seed write is purely a server-rendered
prompt — NO new write, NO new table, NO new AI generation. The
helper is pure; the surface is one zinc-500 line. NO new tier
feature key (the seed is a free capture-side affordance; the
parent-reaction surface itself is tier-agnostic). NO migration.

### Stakeholder

This is the moat-deepening primitive that turns the parent-reaction
graph from a one-shot Monday surface into a Capture-side continuity
loop — the closure that makes parent reactions DRIVE next week's
coaching attention rather than just RECEIVE it. Three compoundings,
all structurally hard for a forms-app competitor to replicate
because they require BOTH a parent-reaction graph AND a per-player
capture-time prompt surface, both of which the product has and
competitors do not. (1) The capture-quality moat — the silent-
player problem the existing 0062 nudge addresses ("you haven't said
a word about Maya in 8 days") is solved by a NUDGE — a calendar
signal. The parent-reaction seed is a different kind of solve: it
gives the coach a SPECIFIC reason to start typing on this kid (the
parent's exact words); the expected observation-coverage delta on
quiet players whose parents recently reacted is the strongest
capture-quality signal the product can ship. (2) The retention
compound — the coach reading "Sarah said his shooting carried"
above the Capture sheet AT THE MOMENT THEY ARE ABOUT TO TYPE is the
strongest possible coaching-context signal; the expected reaction
cycle (parent reacts → coach captures → parent gets a richer report
→ parent reacts again) self-feeds the parent-engagement loop the
existing 0041 / 0056 surfaces depend on. (3) The parent-LTV
compound — every parent whose reaction VISIBLY drove the coach's
NEXT observation gets a richer next-week report (because the coach
captured the named thing for the named kid) which raises the
parent's engagement which raises the reaction-rate which raises
the seed-rate the next cycle. The product becomes a closed loop:
parent's voice → coach's attention → kid's observation → parent's
next report. Distinct from 0025 (per-player capture memory —
COACH-side history only), 0041 (Monday rollup — feed surface,
not capture surface), 0056 (one-tap reply — sender-side, not
capture-side), 0062 (silent-player nudge — calendar signal,
not human-content signal), 0070 (cross-team coach voice —
report writing, not capture-time prompt). THIS is the first
parent-reaction → capture surface — the seam that turns the
parent's voice into next-week's first observation.

### User (Coach Maya, Tuesday 5:45pm on the court, about to capture
Devon for the first time this week)

She is on the side of the court. Devon just finished his shooting
drill. She taps Devon's card to open Capture. At the top of
Devon's per-player Capture sheet, the existing 0025 line shows
"Devon — working on his shooting on May 12, May 19, May 21." ABOVE
that line, a small zinc-500 line with a tiny orange dot on the
left: "Sarah said his shooting carried last week — what did you
see today?" She reads it. She remembers Sarah's Monday note. She
taps the voice button. She says "Devon — closeout still soft on
the second pass but his off-foot pull-up is hitting twice in a row
now." The observation lands. The seed line disappears (the
existing 0025 history line slides up to take its place). She moves
to the next kid. Total marginal interaction: 2 seconds of reading
the seed before the observation. The parent's reaction
operationalized into the kid's first observation of the session
WITHOUT a new UI element, a new tap, or a new screen.

### User (Sarah, Devon's mom, next Sunday opening the parent portal)

She gets the next week's report (existing 0016 continuity). The
report leads with "Devon's been working on his shot — closeout
still soft on the second pass but his off-foot pull-up is hitting
twice in a row now." She recognizes the language — it's exactly
what she said last Monday ("thank you for sticking with him on his
shooting"). She feels seen. She reacts again, this time more
specifically. The reaction-loop self-feeds.

### Growth

The "show me" moment is the Capture sheet's seed line — a one-line
zinc-500 quote from a parent above the empty observation field,
right before the coach types. The screenshot a coach DMs to another
coach with "the app shows me what the parent said about this kid
last week right when I'm about to take notes on him." That
screenshot is the capture-quality acquisition surface because every
coach has the experience of standing on a court trying to remember
what they wanted to focus on for this kid — the app shows you
exactly what the most-trusted source (the parent) said. Compounds
three ways. (1) The capture-retention compound — every coach whose
first observation of a kid was seeded by a parent's specific words
is structurally more likely to keep capturing for THAT kid (the
seed makes the silent-player problem the existing 0062 nudge
addresses largely self-solving for any kid whose parent recently
reacted). (2) The parent-engagement compound — every parent whose
reaction visibly drove the coach's next observation gets a richer
report and is structurally more likely to react again, which feeds
the next seed, which feeds the next observation. (3) The
acquisition compound — the seed line is the screenshot a coach
forwards to a NEIGHBORING coach in the league (the existing 0075
cross-program emergent skill surface), which fires another coach
to start using the parent-reaction surfaces. Distinct from every
shipped surface because every shipped parent-reaction surface is
a FEED surface (rollup, thank-you reply, one-tap forward); THIS
is the first parent-reaction → capture-time prompt surface.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper `src/lib/reaction-seed-utils.ts`. Exports
  `extractReactionSeed(args: { reactions: Array<{ player_id:
  string; parent_first_name: string | null; note: string | null;
  created_at: string }>; playerId: string; lookbackDays?: number;
  minNoteLength?: number; maxNoteLength?: number; nowMs: number
  }): { parent_first_name: string; note: string; created_at:
  string } | null`. The helper: (a) filters `reactions` for the
  named `playerId`; (b) filters to `note !== null AND
  length(note.trim()) >= minNoteLength (default 12) AND
  length(note.trim()) <= maxNoteLength (default 300)`; (c)
  filters to `created_at >= nowMs - lookbackDays*24h (default
  14)`; (d) returns the MOST-RECENT qualifying reaction (one
  seed at a time); (e) returns `null` if no qualifying
  reaction; (f) the returned `note` is the TRIMMED parent
  note (still the parent's words — the rendering surface does
  the display-truncation; the helper does not change the
  semantic content); (g) the returned `parent_first_name`
  defaults to the literal word "A parent" if the original is
  null (NEVER "anonymous", NEVER an empty string — see Voice
  contract). Pure function, reads no DB. Per LESSONS#0023 —
  numbers (`12`, `300`, `14`) not free text. (vitest under
  `tests/lib/reaction-seed-utils.test.ts` — new): (i) empty
  inputs → null; (ii) a 50-char note from 3 days ago → seed
  returned with the parent's first name + the note; (iii) a
  heart-only reaction (note === null) → excluded; (iv) a
  10-char note ("nice job") → excluded (below threshold);
  (v) a 350-char note → excluded (above threshold); (vi) a
  35-day-old note → excluded (outside lookback); (vii) two
  qualifying reactions → the most-recent wins; (viii) a
  reaction with `parent_first_name === null` → seed returns
  "A parent" as the display name; (ix) deterministic across
  input order; (x) the returned note preserves the parent's
  exact words (no AI rephrasing, no truncation in the helper
  layer).

- [ ] The existing per-player Capture surface (real path
  read at pickup per LESSONS#0096; the 0025 per-player
  memory + the 0062 silent-player nudge both anchor on
  the same surface) is EXTENDED to fetch the most-recent
  qualifying reaction seed for the player and render
  ONE quiet zinc-500 line ABOVE the existing 0025 memory
  line. The seed line: (a) renders only when
  `extractReactionSeed(...)` returns non-null; (b)
  format: a small orange-500 dot left-anchored followed
  by `"<parent_first_name> said his/her/their <NOTE_KEY>
  carried last week — what did you see today?"` where
  the verb form "his/her/their" is NEVER picked from
  player gender (the player record has no gender column
  per the COPPA contract — read at pickup per
  LESSONS#0036 / #0078); v1 ALWAYS uses "their" as the
  voice-neutral form (the parent's pronoun is
  unknowable from the data and inventing one is a
  bigger voice failure than "their"); (c) `NOTE_KEY` is
  the FIRST significant noun phrase from the parent's
  note, derived by a deterministic single-pass token
  scan (strip common stop-words; the FIRST remaining
  4+ char token wins; truncated at 24 chars; if the
  scan fails to find a token, fall back to rendering
  the parent's verbatim note truncated to 60 chars
  with an ellipsis) — the helper for this lives in
  `src/lib/reaction-seed-utils.ts` per the previous
  AC; (d) on touch / tap the parent's full note
  expands inline (a small zinc-300 expansion below the
  line — the parent's complete words for the coach who
  wants the full context); (e) the line is REMOVED
  from the surface immediately when the coach writes
  the NEXT observation for the player in this session
  (the seed has done its job — the existing 0025 line
  slides up to take its place); (f) the line NEVER
  appears for a player whose parent has not left a
  reaction with a note in 14 days. Per LESSONS#0022 /
  #0029 / #0082 — every assertion scoped to
  `data-testid="reaction-seed-line"`,
  `data-testid="reaction-seed-expand"` — and the line
  is scoped to a stable parent
  `data-testid="capture-player-header"` per the
  existing 0025 surface (read at pickup; widen if
  missing). Per LESSONS#0049 / #0092 / #0100 / #0110
  / #0118 — Glob `tests/capture*` AND `tests/api/
  capture*` AND `tests/components/capture*` at pickup
  and extend every queue + broaden every whitelist
  for the new `parent_reactions` read on the player
  card. Per LESSONS#0072 — never `delete` a field on
  a DB-read reaction row; spread to a new object if
  filtering is needed. Per LESSONS#0036 — explicit
  `.select()` allow-list on the reaction read:
  `player_id, parent_first_name, note, created_at`
  — NEVER reads parent_email, NEVER reads the
  reaction's `coach_reply_id`, NEVER reads the
  reaction's any other column. Per LESSONS#0112 —
  prefer extending the existing Capture player-card
  data fetch over a NEW from() call (lower blast
  radius). (vitest under `tests/components/
  capture-player-card-reaction-seed.test.tsx` —
  new): (i) a player with a qualifying reaction →
  the seed line renders with the parent's first
  name + the derived note key; (ii) a player with
  no qualifying reaction → the seed line is
  absent; (iii) tapping the line expands the
  parent's full note inline; (iv) writing a new
  observation removes the seed line from the
  surface; (v) the seed line uses "their" never
  "his/her" never an invented gender pronoun;
  (vi) the seed line is BELOW any error banner
  AND ABOVE the existing 0025 memory line per the
  existing surface order (read at pickup); (vii)
  every rendered text contains no AGENTS.md
  banned word; (viii) the line renders no
  surname, no parent email, no kid DOB.

- [ ] The existing per-player Capture data-fetch
  surface (whichever route — `/api/capture/...` or
  a direct loader on the page — confirm at pickup
  per LESSONS#0096) is EXTENDED to also fetch the
  most-recent qualifying `parent_reactions` row
  for the player in the 14-day lookback. The fetch
  honors the same coach-scope the existing Capture
  surface honors (the coach owns the player's team
  via `team_coaches` per LESSONS#0057 — NEVER
  `teams.coach_id`). The fetch is part of the
  EXISTING Capture player-card GET — NOT a new
  endpoint. Per LESSONS#0112 — widen the existing
  select. Per LESSONS#0036 — explicit allow-list.
  Per LESSONS#0049 / #0092 / #0100 / #0110 /
  #0118 — Glob `tests/api/capture*` AND
  `tests/api/player*` AND `tests/api/observation*`
  at pickup; extend every queue AND broaden every
  whitelist for the new `parent_reactions` read.
  Per LESSONS#0072 — spread, never delete.
  (vitest under `tests/api/capture-player-card-
  with-reaction.test.ts` — new): (i) a coach
  owning the team gets the seed reaction in the
  payload; (ii) a coach NOT owning the team gets
  no payload (the existing scope is preserved);
  (iii) the payload contains ONLY
  `(player_id, parent_first_name, note,
  created_at)`; (iv) reactions older than 14
  days are excluded; (v) reactions on OTHER
  players are excluded; (vi) the payload NEVER
  contains parent_email, parent_phone, or any
  COPPA-sensitive field; (vii) the existing
  Capture player-card GET response shape stays
  byte-identical except for the additive
  `reaction_seed` field.

- [ ] Tier / feature gating: NO new tier feature
  key. The seed surface is free-tier-onward
  available (the parent-reaction primitive is
  tier-agnostic; the Capture surface is tier-
  agnostic for any team within the team-count
  limit). The expanding the existing read does
  not introduce a new gate. (vitest: a free-tier
  coach's Capture surface renders the seed; a
  paid-tier coach's Capture surface renders the
  same.)

- [ ] Privacy / COPPA contract: (a) The
  `parent_reactions` read returns ONLY
  `(player_id, parent_first_name, note,
  created_at)` — NEVER parent_email, NEVER
  parent_phone, NEVER any FK to a coach's
  contact info, NEVER any kid data beyond the
  player_id scope (the surface's owner-scope is
  preserved). (b) The rendered seed line
  contains the parent's FIRST NAME (sanitized;
  if null, the literal word "A parent") + the
  parent's WORDS (sanitized; trimmed; no
  HTML; the parent's exact note is the
  source — no AI rephrasing); NEVER the
  parent's surname, NEVER the parent's email,
  NEVER a player DOB, NEVER a jersey number.
  (c) The seed never persists; it is
  server-derived at fetch-time from the
  existing `parent_reactions` row. (d) The
  seed line is REMOVED from the page when the
  coach writes the next observation — the seed
  is a one-shot prompt, not a tracked surface.
  (e) NO new write, NO new table, NO new
  email channel. Per LESSONS#0036 — every
  `.select()` is an explicit allow-list. Per
  LESSONS#0072 — never `delete` a field on a
  DB-read reaction row; spread. (vitest:
  planted parent_email / DOB / medical_notes
  / jersey on the underlying rows are NEVER
  read; the seed line renders no surname; the
  seed line renders no email; the seed line
  renders no kid metadata beyond the
  player_id-scope first-name surface that
  Capture already shows.)

- [ ] Voice contract: every new user-facing
  string (the seed-line template, the
  expand-toggle copy, the "A parent" fallback,
  the "their" pronoun) contains NO AGENTS.md
  banned word per LESSONS#0023. Mirror the
  existing 0025 / 0062 capture-time cardboard
  voice exactly. Per LESSONS#0061 — defensive
  scans use literal spaces, not `\s+`. The
  variable substitution NEVER produces a
  banned token for any matrix of
  parent_first_name / note_key / note /
  player_first_name. The note-key derivation
  NEVER injects a generated word (it
  preserves the parent's exact words). The
  pronoun is ALWAYS "their" — the test
  asserts the rendered text never contains
  "his shooting" or "her shooting" derived
  from a player-gender field (per
  LESSONS#0036 — the player table has no
  gender field; we never read or invent
  one). Per LESSONS#0023 — never enumerate
  the banned tokens verbatim in any AI
  prompt (none here — this ticket has no
  AI). (vitest: render each component
  variant + the note-key derivation matrix
  + scan rendered text; scan a banned-word
  matrix on the parent_first_name +
  note + player_first_name fixture set; the
  test asserts pronoun is "their" never
  "his" never "her" when derived from the
  template; the "A parent" fallback
  asserts on a null first-name input.)

- [ ] Regression: the existing 0025 per-
  player Capture memory line is BYTE-
  IDENTICAL on every existing case (the
  seed line is ABOVE it; when no qualifying
  reaction exists, the surface is
  byte-identical to today). The existing
  0062 silent-player nudge is BYTE-
  IDENTICAL (the seed and the nudge serve
  different purposes and coexist; a player
  with both a recent reaction-seed AND a
  silent-player nudge sees both lines, the
  nudge above the seed per the existing
  0062 surface order — confirm at pickup).
  The existing 0014 last-practice
  carryover + 0020 Practice Arc continuity
  are BYTE-IDENTICAL (the seed lives at
  the per-player scope; carryover and arc
  live at the practice scope). The
  existing 0009 / 0022 / 0041 / 0056
  parent-reaction surfaces are BYTE-
  IDENTICAL (this ticket only READS
  `parent_reactions`; never writes to it).
  (vitest: snapshot the named routes /
  components against seeded fixtures
  pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — pre-mint ONE `parent_reactions`
  row on the E2E team's existing player
  (the existing fixture has the E2E
  team + E2E player + the parent-portal
  share-token — read at pickup per
  LESSONS#0096; per LESSONS#0121 grep
  the seed for the named player BEFORE
  writing the assertion). The reaction:
  `parent_first_name = 'Sarah'`, `note =
  'thank you for sticking with him on
  his shooting, he came home actually
  proud Tuesday'`, `created_at = 3 days
  ago`. Per LESSONS#0084 — seed in the
  idempotent DELETE-then-INSERT block.
  Per LESSONS#0101 — UUIDs in the next
  free range (after 0079 / 0080 / 0081
  reservations — confirm at pickup).
  Per LESSONS#0009 — Capture is a
  CLIENT component (per the 0036 lesson
  on TanStack query interceptability);
  the e2e mocks `/api/me` and lets the
  Capture fetch hit the seeded DB.
  Playwright spec: (a) sign in as the
  E2E coach; (b) navigate to Capture for
  the seeded team; (c) tap the seeded
  player's card; (d) assert the seed
  line renders with text containing
  "Sarah" + "shooting" + the question
  prompt; (e) assert the pronoun is
  "their" never "his" never "her"
  derived from a gender lookup; (f)
  tap the seed line to expand;
  assert the parent's full note is
  visible inline; (g) write a new
  observation via the existing
  Capture voice/text path; (h) assert
  the seed line is REMOVED from the
  surface after the observation
  lands; (i) re-navigate to the
  Capture surface and assert the
  seed line does not return for
  this session. Scope every
  assertion by `data-testid` per
  LESSONS#0022 / #0029 / #0082.
  Skip when E2E creds are unset.

## Out of scope

- An AI-PARAPHRASED seed prompt (the
  helper rewrites the parent's words
  into a coach-voice prompt). v1
  preserves the parent's exact words
  — the seed's authenticity IS the
  feature; AI paraphrasing breaks the
  signal.
- A SEED for a HEART-ONLY reaction
  (no note). v1 caps at note
  reactions because the seed needs
  specific words; a heart-only
  seed is a separate ticket if a
  weaker shape is valuable.
- A SEED across MULTIPLE qualifying
  reactions on the same player.
  v1 caps at ONE seed per player
  per session — the most-recent
  reaction wins; multi-seed cycling
  is a separate ticket.
- A SEED that PERSISTS across
  sessions (the seed comes back
  Tuesday even if the coach
  captured on Thursday). v1 is
  one-shot — the seed is removed
  the moment the coach writes the
  next observation in the
  session.
- A SEED for an OBSERVER COACH
  surface (the existing 0067
  sub-coach Tuesday handoff
  link). v1 caps at the head-coach
  per-player Capture; surfacing
  the seed to a sub-coach is a
  separate ticket with its own
  consent posture (the sub-coach
  may not have the parent-reaction
  read scope).
- A SEED that DEEP-LINKS to the
  Monday rollup or the 0056
  reply surface. v1 is a
  capture-time prompt only; the
  rollup is the existing
  Monday surface.
- An EMAIL / push when a new
  qualifying reaction lands
  (a "your parent reacted, see
  the seed Tuesday" notification).
  v1 is purely render-time
  surface; a notification is a
  separate ticket.
- A COACH-WRITTEN OVERRIDE of
  the seed ("dismiss this
  seed; show me the next one").
  v1 is one seed per session;
  dismissal is a separate
  ticket.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/reaction-seed-utils.ts` (new) — pure
  helper. Mirror the shape of the existing 0062
  silent-player utils for shape cohesion (real
  path at pickup per LESSONS#0096).
- The existing Capture player-card data fetch
  (real path at pickup — likely the page's
  TanStack `useQuery` against the existing
  `/api/data` endpoint OR a typed Capture
  route; confirm at pickup). Per LESSONS#0112 —
  widen the existing select. Per LESSONS#0036
  — explicit allow-list.
- The existing Capture player-card render
  (real path at pickup; the 0025 per-player
  memory + 0062 silent-player nudge anchor
  the same surface). Per LESSONS#0065 / #0066
  / #0162 — smallest possible touch (one new
  zinc-500 line above the existing memory
  line). Per LESSONS#0022 / #0029 / #0082 —
  every assertion scoped to a per-action
  data-testid.
- `src/lib/tier.ts` — NO new feature key.
- `src/components/ui/upgrade-gate.tsx` — NO
  new registration.
- `tests/lib/reaction-seed-utils.test.ts`
  (new).
- `tests/components/capture-player-card-
  reaction-seed.test.tsx` (new) — the render
  case.
- `tests/api/capture-player-card-with-
  reaction.test.ts` (new) — the data fetch
  case.
- `tests/api/capture*.test.ts` AND
  `tests/api/player*.test.ts` AND
  `tests/api/observation*.test.ts` AND
  `tests/components/capture*.test.tsx`
  (existing — Glob at pickup per
  LESSONS#0110) — extend every
  `mockReturnValueOnce` queue AND broaden
  every `mockImplementation((table) =>
  ...)` whitelist for the new
  `parent_reactions` read. Per LESSONS#0116
  — empty Glob is a no-op.
- `tests/e2e/reaction-seed-on-capture-flow
  .spec.ts` (new). Seed extension per the
  AC. UUIDs in the next free range per
  LESSONS#0101. Skip when E2E creds are
  unset.
- New deps: NO. Migration: NO. Env vars: NO
  new. AI prompt change: NO. Tier feature
  key: NO new key.
- LESSONS to anchor: #0009 (Capture is a
  CLIENT component per the 0036 lesson —
  the e2e can use page.route() for the
  /api/me mock but should let the capture
  GET hit the seeded DB), #0020 / #0038
  (.test.ts), #0022 / #0029 / #0082 (data-
  testid scoping), #0023 (positive voice;
  mirror existing 0025 / 0062 voice; the
  pronoun is ALWAYS "their" — never
  invented gender), #0027 (no
  set-controlled state in the seed-removal
  effect dep list — the seed disappears
  when an observation is written; read the
  player's observation count as a
  SNAPSHOT, not a dep), #0033 (commit
  multi-line / special-char strings via
  heredoc), #0034 / #0088 / #0114 (strip
  `--` comments AND structural
  identifiers on COPPA sweep — applies
  only if a migration lands; v1 has none),
  #0036 (best-effort `.select()` allow-
  lists), #0049 / #0092 / #0100 / #0110
  / #0118 (mock queue + whitelist
  spillover — Glob every capture /
  player / observation test and broaden
  every mockImplementation whitelist),
  #0055 (route handler call posture —
  if a typed route is widened), #0057
  (team-coach via `team_coaches`, NEVER
  `teams.coach_id` — applies to the
  existing scope check on the Capture
  GET), #0061 (literal space on
  defensive scans), #0063 (scope leak
  assertions to rendered shapes, not
  bare digits), #0065 / #0066 / #0162
  (Capture player-card hotspot —
  smallest possible touch), #0072
  (never `delete` a field on a DB-read
  object — spread to a new object;
  applies to filtering parent_email
  from the reaction read), #0078 (when
  a sibling test's `mockImplementation
  ((table) => ...)` is a strict
  whitelist, broaden it to include
  `parent_reactions` if it isn't
  already on the whitelist), #0084 /
  #0101 (seed posture; UUID range),
  #0096 (schema wins over prose — at
  pickup read the actual Capture
  player-card data fetch path, the
  actual `parent_reactions` schema, the
  actual 0025 + 0062 render order on
  the player card, the actual 0056
  coach_reply_at column to confirm we
  do NOT read or modify it, the
  actual e2e seed's player + parent-
  reaction fixture shape), #0103
  (additive widening on the Capture
  player-card response shape — the
  new `reaction_seed` field is
  optional so every existing caller
  is byte-identical), #0112 (widen
  the existing Capture player-card
  GET to include `reaction_seed`
  rather than a new from() call),
  #0116 (Glob sweep that returns
  empty is a no-op), #0118 (broaden
  sibling whitelists for the new
  `parent_reactions` read on the
  Capture surface), #0121 (grep
  the seed for the named player
  BEFORE writing the e2e assertion;
  the seed-named fixture must
  match the real seed row).

## Implementation log

(Appended by the implementation-dev agent during execution.)
