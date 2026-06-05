---
id: 0068
title: Give the coach a one-tap "hi parents, here's our season" card to drop in the team group chat the day the roster is set
status: shipped
priority: P1
area: growth
created: 2026-06-05
owner: product-groomer
---

## User story

As a volunteer youth-sports coach who just finished setting up my team in
SportsIQ on the night before the first practice, I want ONE tap to drop a
clean, public, parent-facing intro card into the team group chat — my name,
my sport, the age group, the one focus I'm starting the season on, and a
"reactions welcome" line for parents — so the FIRST message my parents get
from me this season looks like a coach who has a plan, not a forwarded sign-
up sheet, and the parents who read it also see what SportsIQ is.

## Why now (four lenses)

### Product Owner

The product has shipped a dense library of MID- and END-season public
parent surfaces (0009 player-of-week, 0016 continuity parent report, 0027
game recap, 0041 weekly parent rollup, 0043 mid-season newsletter, 0048
post-game per-kid text, 0057 weekly-pulse league-chat card, 0017 season
recap, 0036 season wrap) and a coach-to-coach surface (0010 team
personality card, 0026 public coach profile). What is structurally missing
is the FIRST surface — the moment AFTER the coach finishes the existing
0007 `/onboarding/setup` flow and BEFORE any practice has been captured.
Today the coach who just set up their team has nothing to send the
parents that isn't a generic group-chat hello. The smallest meaningful
unit of value is: (a) one new "Share your season opener" button on the
post-setup success state of `/onboarding/setup` AND on /home for any team
whose `created_at` is in the last 7 days, (b) a small sheet with ONE
textarea ("one line on what you're starting the season on — 80 chars
max") that defaults to the team's sport-and-age-group focus suggestion
(from the existing `team_focus_suggestions` shape; if absent, the
textarea is empty), (c) one button "Make my season opener", which POSTs
to a new `/api/season-opener/create` endpoint that mints a token + writes
a `season_opener_shares` row + returns `{ token, url }`, and (d) a new
PUBLIC page at `/opener/[token]` (parent-portal aesthetic, gray + orange)
that renders a single-screen card: H1 "Welcome to <Team Name>", a one-
line sub ("<Sport> — <Age group> — Season <YYYY>"), the coach's first
name + a 1-line "your coach this season" note, the focus-line the coach
typed, and a single "say hi back" reaction strip (re-uses the existing
`parent_reactions` shape). NO observations, NO player data, NO AI
generation. The page is byte-light by design — the coach's parents read
it in 8 seconds and the smallest one swipes a heart.

### Stakeholder

This is the FIRST-TOUCH viral surface the product is missing and the only
surface that compounds at the moment of HIGHEST parent attention in a
volunteer-sports season. Three distinct compoundings. (1) The parent-
intro moat — every existing public surface presumes the parent ALREADY
knows their kid's coach uses SportsIQ. The season opener is the moment
that ASSUMPTION becomes true for every parent on the team, in one
message, before practice 1. (2) The cold-share moat — a parent who
forwards "hey, my kid's coach just sent us this" to another parent in a
different sport ("you should ask your coach to do this too") is the
acquisition surface that pulls coaches in through their friend's
parent. The page carries the existing `coaches.handle`-based referral
code per the 0011 / 0021 pattern (the coach is identifiable on the
public page, the parent can land on the existing 0026 coach profile +
0015 invite-an-assistant CTA in one tap). (3) The repeat-season moat —
a coach who shipped a season opener LAST season is one tap away from
"copy last year's opener" THIS season (a v2 follow-on, NOT v1's
scope), which fixes the highest-friction moment of next-season
re-engagement (LESSONS#0052 / 0059 family — cross-season carry).
Distinct from 0010 (team personality, mid-season coach-to-coach, no
parents), 0017 / 0036 (end-of-season, parents already knew the team),
0024 (org-tier director invite), 0057 (weekly-pulse, mid-season). This
is the season's KICK-OFF, the only first-touch we don't have.

### User (the coach, Sunday night, set the team up 5 minutes ago)

She is at her kitchen table. She just finished the existing
`/onboarding/setup` page — team named, sport picked, age group set,
12 kids on the roster. The next screen has a small new orange button:
"Share your season opener with parents." She taps it. A sheet slides
up. ONE textarea, pre-filled with the sport-and-age-group default
("Spacing and off-ball movement for the U10 girls" — drawn from
`team_focus_suggestions`; if absent, empty placeholder "what are you
starting the season on?"). She edits it to "Closeouts and good
sportsmanship — we'll have fun." One button: "Make my season opener."
The button flips to "Copy link." She taps Copy, switches to her team
group chat (already pinned because she's the coach), pastes, types one
line — "Hi everyone! Looking forward to Tuesday." — sends. Total
interaction: 35 seconds. No account creation for the parents, no
download, no PDF.

### User (a parent, Sunday night, in bed scrolling phone)

Their kid's group chat pings. A link. They tap it. A SportsIQ page
loads in their phone browser (gray + orange, large readable type).
One screen, no scroll: "Welcome to the Hawks U10. Spring 2026. Your
coach this season is Sarah. We're starting on closeouts and good
sportsmanship — we'll have fun." A small "say hi back" row underneath
with three reaction emoji (the existing 0022 strip). They swipe the
heart. A small thank-you under the row. At the bottom, two small
gray lines: "Made by Sarah with SportsIQ — coach your kid's team
free." NO login. NO account creation required. Total interaction: 8
seconds.

### Growth

The "show me" moment is the PARENT'S phone — a parent who has never
heard of SportsIQ opens a link from their kid's coach, sees one
clean screen with the coach's NAME and a clear focus for the season,
and that experience is THE definition of "our team has its act
together this year." Compounds three ways. (1) The first-touch
share — every parent on every team is now structurally exposed to
SportsIQ on day 1 of the season, not week 6 when the first parent
report goes out. (2) The cross-team forward — the highest-conversion
shape of acquisition we have shipped (0019 → parent who reads the
report starts their own free team) gets its FIRST-touch analog: a
parent who is also a coach in a different sport sees this on
Sunday night and asks their own coach "wait, why don't we have
this" — the cross-coach pull. (3) The reaction-driven re-engagement
— the existing 0041 weekly-rollup digest reuses this row as the
season's first reaction surface, so the Monday-morning "9 parents
said hi back" pull on the coach is non-trivial. Distinct from
every shipped surface because every shipped surface presumes
existing context; THIS surface is the moment that context is born.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `062_season_opener_shares.sql` adds the table
  `season_opener_shares (id UUID PRIMARY KEY DEFAULT
  gen_random_uuid(), team_id UUID NOT NULL REFERENCES teams(id) ON
  DELETE CASCADE, coach_id UUID NOT NULL REFERENCES coaches(id) ON
  DELETE CASCADE, token TEXT NOT NULL UNIQUE, season_label TEXT NOT
  NULL, focus_line TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL
  DEFAULT NOW(), UNIQUE(team_id, season_label))`. One index
  `(token)` for the public page read. Header comment mirrors
  `048_practice_plan_shares.sql` style; per LESSONS#0088 strip
  `--` comments before the no-banned-token scan. The migration
  adds NO column to `sessions`, `coaches`, `players`, `teams`,
  `observations`, `plans`, `parent_reactions`. Per LESSONS#0006 —
  at pickup confirm `062` is the next free integer after
  `061_sub_handoffs.sql`; if a sibling claimed it first, bump to
  `063`. (vitest: scan migration body with `--` stripped; assert
  column allow-list; assert the `UNIQUE(token)` + `UNIQUE(team_id,
  season_label)`; assert the index; assert NO new column on any
  sacred table.)

- [ ] `POST /api/season-opener/create` (new, authed) accepts
  `{ teamId: UUID, focusLine: string }`. The route: (a) verifies
  the caller is a head coach on the team via `team_coaches` per
  LESSONS#0057 (NOT `teams.coach_id`); (b) validates
  `focusLine` is 1–80 chars + voice-clean per LESSONS#0023
  (positive instruction; reject on banned-word match with a one-
  line gentle nudge); (c) derives `season_label` from the team's
  current season fields (`teams.season` if present, else a
  `Season YYYY` fallback from the team's `created_at` year — read
  the actual `teams` shape at pickup per LESSONS#0096); (d)
  generates a URL-safe token (16 bytes hex via the same
  `crypto.randomBytes` pattern the existing
  `practice_plan_shares` and `drill_shares` routes use — read
  at pickup per LESSONS#0096); (e) upserts a `season_opener_shares`
  row on `(team_id, season_label)` so a second invocation REPLACES
  the focus line + the token (the coach gets a fresh shareable URL
  if they re-edit); (f) returns `200 { token, url }`. The URL is
  `${NEXT_PUBLIC_APP_URL}/opener/${token}`. (vitest: 200 + row
  written; 200 idempotent re-create on same `(team_id, season_label)`
  REPLACES the focus_line + the token; 400 voice on banned-word
  match returns `{ reason: 'voice' }`; 400 length > 80; 400 length
  0; 403 caller not head coach on the team; 404 team not found;
  401 unauthed.)

- [ ] `GET /api/season-opener/[token]` (new, PUBLIC, service-role
  read) returns `200 { teamName, ageGroup, sportName, seasonLabel,
  coachFirstName, coachHandle?: string, focusLine, createdAt }`.
  404 on unknown token. The route's `.select()` calls are EXPLICIT
  ALLOW-LISTS per LESSONS#0036. The response NEVER includes
  player rows, observation text, DOB, jersey numbers, photo URLs,
  parent_email, parent_phone, medical_notes — the page is team-
  level only by design. (vitest: 200 payload shape; 404 unknown;
  planted DOB / medical_notes / parent_email / parent_phone rows
  do NOT appear in the response; the `.select()` keysets are
  explicit allow-lists.)

- [ ] A new PUBLIC page at `src/app/opener/[token]/page.tsx`
  renders the parent-portal aesthetic (gray + orange — NOT the
  dark coach surface; mirror the 0027 `/recap/[token]` page's
  styling tokens — read at pickup per LESSONS#0096). The page is
  a SERVER component (no client-side fetch needed; the payload
  is small and the load is one round-trip; per LESSONS#0009 —
  server-component fetches are NOT interceptable by
  `page.route()`, so the e2e is backed by a real seed row, not
  a mock). One screen, no scroll on a 360x640 phone: H1
  "Welcome to <Team Name>", a sub-line "<Sport> — <Age group> —
  <Season label>", a one-line "Your coach this season is
  <Coach first name>" (links to the existing 0026 `/coach/[handle]`
  profile when `coaches.handle` is present), the `focusLine`
  rendered as a quoted block, the existing 0022 parent-reaction
  strip wired to a new entity_type `'season_opener'` (extend
  the existing `parent_reactions` reaction shape — read its
  enum at pickup per LESSONS#0096; if `entity_type` is enum-
  constrained add `'season_opener'` in the same migration as the
  new table; if it's free-text, no change), and the existing
  0011-pattern referral footer ("Made by <Coach first name> with
  SportsIQ — coach your kid's team free"). The page is added to
  `publicPaths` in `src/lib/supabase/middleware.ts` in the SAME
  PR per LESSONS#0091 / #0104 (parents hit it unauthed). The
  page exposes `data-testid="season-opener-page"`. (Playwright:
  navigate unauthed to a seeded `/opener/<token>`, assert the H1
  + the sub-line + the focus line + the referral footer; scope
  every assertion to the data-testid per LESSONS#0029 / #0082.)

- [ ] An OpenGraph image at
  `src/app/opener/[token]/opengraph-image.tsx` (mirror the
  pattern of `src/app/team-card/[token]/opengraph-image.tsx` —
  read at pickup per LESSONS#0096) renders the team name, the
  season label, the coach's first name, and the focus line in a
  share-friendly card. Per LESSONS#0060 — extract a pure
  `buildSeasonOpenerMetadata(payload, {token, appUrl})` helper
  so `generateMetadata` is unit-testable without rendering the
  satori pipeline; mock `next/og`'s `ImageResponse` per
  LESSONS#0060 to assert the route was constructed once and
  carries the right content-type, not pixel content. (vitest:
  the metadata helper builds the right title + description for
  a known payload; the og-image route constructs without
  throwing on a mocked payload; on a `null` payload the
  metadata defaults to the generic SportsIQ title.)

- [ ] A "Share your season opener" button on the post-setup
  success state of `/onboarding/setup` AND on /home for any
  team whose `created_at` is within the last 7 days. Tapping
  opens a sheet (the existing `<Sheet>` component) with: the
  pre-filled focus textarea (defaults to the team's
  `team_focus_suggestions` value if present, empty placeholder
  if not — read at pickup per LESSONS#0096), the Make-my-
  season-opener button, and the success state showing the URL
  + a Copy button + a Share button (the existing
  `navigator.share` pattern). The Copy button exposes
  `data-share-url={publicUrl}` per LESSONS#0056 / #0082. The
  sheet exposes `data-testid="season-opener-sheet"`. Per
  LESSONS#0065 / #0066 / #0162 — `home/page.tsx` is the DIRTY
  hotspot; mount the entry-point with the smallest possible
  touch (one import + one JSX entry, gated by the 7-day
  freshness predicate). (vitest component test: render the
  /home page with a seeded fresh team, assert the entry-point
  renders; render with a stale team, assert it does NOT
  render; tap the button, assert the sheet opens; tap Make-
  my-season-opener, assert the POST + the success state with
  the URL + the Copy button carrying `data-share-url`.)

- [ ] Sitemap: per LESSONS#0064 / #0049 / #0092 / #0100 — the
  sitemap currently reads N table queues; adding a NEW
  `from('season_opener_shares')` chain forces an update to
  EVERY `mockReturnValueOnce` queue in EVERY sibling test in
  `tests/app/sitemap*.test.ts`. Glob those files at pickup,
  enumerate each queue site, extend each in the same PR.
  `/opener/[token]` is public and SHOULD be in the sitemap (a
  parent who lost the group-chat link can re-find it via
  search; unlike the 24h-scoped sub-handoff, the season opener
  is durable for the season). (vitest: the sitemap test queue
  update for the new from() call; sitemap output includes the
  seeded opener URL.)

- [ ] Tier / feature gating: the season-opener create + public
  page + reaction strip are NOT tier-gated. A free-tier coach
  can ship a season opener. The season opener is a first-touch
  acquisition primitive; gating it would invert the moat. NO
  new tier feature key. (vitest: a free-tier coach successfully
  POSTs the create endpoint; the route does NOT import
  `tier.ts`.)

- [ ] Privacy / COPPA contract: NO player row, NO observation
  text, NO DOB, NO jersey, NO photo URL, NO parent_email, NO
  parent_phone, NO medical_notes is ever surfaced on the
  public page or in any route response. The coach's first name
  + handle are the only person-data on the page. The
  `focusLine` is coach-authored at SUBMIT time and is voice-
  scanned for the AGENTS.md banned-word set on POST. The
  parent-reaction strip is the existing 0022 surface (no new
  parent data shape). (vitest: planted DOB / medical_notes /
  parent_email / parent_phone rows do NOT appear in any
  season-opener route response; the public page render
  contains no minor data; the route `.select()` keysets are
  explicit allow-lists.)

- [ ] Voice contract: every new user-facing string (the sheet
  prompts, the textarea placeholder, the success-state copy,
  the public page H1 / sub-line / referral footer, the
  reaction-strip thank-you line) contains NO AGENTS.md banned
  word per LESSONS#0023. Instruct positively
  ("welcome", "your coach this season", "what you're starting
  the season on") — never enumerate the banned tokens
  verbatim in the prompt or the page. The voice-scan
  rejection text is one plain line ("write it like a text
  to a friend — keep it short and concrete"). (vitest: render
  each new component and scan rendered text; scan the voice-
  rejection nudge text.)

- [ ] Regression: the existing /onboarding/setup page renders
  BYTE-IDENTICALLY pre- and post-change in its non-success-
  state phases (only the success-state gains a new button).
  The existing /home renders BYTE-IDENTICAL for a coach whose
  team is older than 7 days. The existing
  `parent_reactions` reaction surface is BYTE-IDENTICAL for
  every other `entity_type`. The existing sitemap test
  output is BYTE-IDENTICAL except for the appended
  `/opener/<token>` URL. (vitest: snapshot the named routes
  / components against the seeded fixtures pre- and post-
  change; assert no diff for the un-touched paths.)

- [ ] Seeded e2e on the 0006 fixture: seed extension is ONE
  `season_opener_shares` row pre-minted by the E2E coach for
  the existing E2E team, with a deterministic token in the
  next free `0000000000<XX>+` range per LESSONS#0101 (verify
  the range at pickup; the 0067 sub-handoff seed used
  0xfc-0xfe). Playwright spec: (a) sign in as the E2E coach,
  navigate to /home (the seeded team's `created_at` is fresh
  per the existing seed posture; if not, this AC's authed
  half is a vitest component test ONLY and the public-page
  half is the e2e load-bearing assertion — pick at pickup
  per LESSONS#0096), assert the entry-point renders, tap it,
  assert the sheet opens, type a short focus line, tap Make-
  my-season-opener, assert the success state with the URL +
  the Copy button carrying `data-share-url`; (b) sign out,
  navigate unauthed to the seeded `/opener/<token>`, assert
  the H1 + the sub-line + the focus line + the referral
  footer + the reaction strip; (c) tap a reaction, assert
  the success state. Scope by `data-testid` per LESSONS#0081
  / #0082 (the E2E coach's first name overlaps team strings
  per LESSONS#0029). Add `/opener/` AND
  `/api/season-opener/` to `publicPaths` in the SAME PR per
  LESSONS#0091 / #0104.

## Out of scope

- A "copy last season's opener" button. v1 is one season per
  team; the cross-season carry is a follow-on once two
  seasons of data exist.
- A roster preview on the public page ("Here's the kids on
  your kid's team"). v1 has NO minor data on the public page
  by design; a roster surface is a separate privacy review.
- A coach-to-coach version ("share with my assistant"). v1
  is parent-facing; the assistant-invite primitive is the
  existing 0015 surface.
- An AI-generated focus line. v1 is coach-authored, voice-
  scanned only; an AI generation surface is a tier-gated
  follow-on if the textarea ever gets cold-start friction at
  scale.
- A scheduling integration ("link to first practice on the
  team calendar"). v1 is the intro card; the scheduling
  primitive is a different feature.
- A multi-language version. v1 is English-only; i18n is
  org-tier scope.
- A custom theme / team color picker. v1 uses the existing
  parent-portal gray + orange aesthetic; theming is
  org-tier `custom_branding` scope.
- An email-out path ("blast this to all parent_emails"). v1
  is link-only — the coach pastes the URL into the existing
  team group chat. The product does NOT auto-email parents.

## Engineering notes

Files / patterns the dev should touch. Be specific enough
that the dev does not have to re-discover the architecture.

- `supabase/migrations/062_season_opener_shares.sql` (new)
  — the table + 1 index only. NO column on any sacred
  table. LESSONS#0006 — at pickup confirm `062` is free;
  if a sibling claimed it, bump to `063`. LESSONS#0088 —
  strip `--` comments before the no-banned-token scan.
  Mirror `048_practice_plan_shares.sql` header style. If
  `parent_reactions.entity_type` is enum-constrained
  (read at pickup per LESSONS#0096; CHECK constraint or
  enum type), add `'season_opener'` to the constraint in
  the SAME migration per LESSONS#0054 (a stale CHECK is
  invisible until the seed exercises it).
- `src/types/database.ts` — add `SeasonOpenerShare` type.
  NO field on any existing type.
- `src/app/api/season-opener/create/route.ts` (new) —
  `POST(request)`. Authed via `createServerSupabase()` +
  service-role write. Head-coach check via `team_coaches`
  per LESSONS#0057. Token via `crypto.randomBytes(16)
  .toString('hex')` mirroring the existing share routes.
- `src/app/api/season-opener/[token]/route.ts` (new) —
  PUBLIC `GET`. Service-role read. 404 on unknown. Per
  LESSONS#0036 — `.select()` as explicit allow-lists.
- `src/app/opener/[token]/page.tsx` (new) — SERVER
  component, parent-portal aesthetic. Mirror the existing
  `src/app/recap/[token]/page.tsx` styling tokens (read at
  pickup per LESSONS#0096). The reaction strip uses the
  existing `<ParentReactionForm>` component per the
  parent_reactions shape.
- `src/app/opener/[token]/opengraph-image.tsx` (new) —
  mirror `src/app/team-card/[token]/opengraph-image.tsx`.
  Per LESSONS#0060 — `vi.mock('next/og')` and assert
  status/content-type, not pixel content. Pure helper
  `buildSeasonOpenerMetadata` for the title/description
  branching.
- `src/lib/season-opener-metadata.ts` (new) — pure helper
  for OG metadata + the URL builder. Unit-testable
  without satori per LESSONS#0060.
- `src/components/onboarding/season-opener-entry.tsx`
  (new) — the entry button + sheet. `data-testid=
  "season-opener-sheet"`; Copy button has
  `data-share-url={publicUrl}` per LESSONS#0056 / #0082.
- `src/components/home/season-opener-card.tsx` (new) —
  the /home entry-point gated on `team.created_at` within
  7 days. Per LESSONS#0065 / #0066 / #0162 — mount with
  smallest possible touch in `home/page.tsx`.
- `src/app/(dashboard)/home/page.tsx` (existing — read
  first per LESSONS#0096) — one import + one JSX entry
  for the new card.
- `src/app/onboarding/setup/page.tsx` (existing — read
  first per LESSONS#0096) — wire the new entry button
  into the post-setup success state.
- `src/app/sitemap.ts` (existing — read first per
  LESSONS#0096) — add the new `from('season_opener_shares')`
  chain.
- `src/lib/supabase/middleware.ts` — add `/opener/`
  AND `/api/season-opener/` to `publicPaths` in the
  SAME PR per LESSONS#0091 / #0104.
- `tests/migrations/062-season-opener-shares.test.ts`
  (new, `.test.ts` per LESSONS#0020 / #38) — scan body
  with `--` stripped per LESSONS#0088; column allow-list;
  UNIQUE constraints; index; NO new column on any sacred
  table; if `parent_reactions.entity_type` is enum-
  constrained, assert the migration adds the new value.
- `tests/api/season-opener-create.test.ts` (new) — every
  AC case. Per LESSONS#0055 — this route takes a
  request.
- `tests/api/season-opener-token-get.test.ts` (new) —
  every payload shape variant; 404 unknown; no minor
  data leaked.
- `tests/components/season-opener-entry.test.tsx` (new)
  — render the sheet; tap Make; assert POST + success
  state; Copy has `data-share-url`.
- `tests/components/season-opener-card.test.tsx` (new)
  — render with seeded fresh team (renders); render
  with stale team (does NOT render).
- `tests/lib/season-opener-metadata.test.ts` (new) —
  the pure helper builds the right title / description
  / URL.
- `tests/app/opengraph-image-season-opener.test.ts`
  (new) — mocked `next/og` per LESSONS#0060.
- `tests/app/sitemap.test.ts` AND every
  `tests/app/sitemap-*.test.ts` (existing — Glob at
  pickup per LESSONS#0110) — extend EVERY
  `mockReturnValueOnce` queue with the new chain.
- `tests/e2e/season-opener-flow.spec.ts` (new). Seed
  extension per the AC. UUIDs in next free
  `0000000000<XX>+` range per LESSONS#0101. Spec per
  the AC's three phases. Scope by `data-testid` per
  LESSONS#0081 / #0082. Skip when E2E creds are unset.
- New deps: NO. Migration: YES (062 or bump). Env
  vars: NO new. AI prompt change: NO (no AI call on
  this path; the public page renders coach-authored
  content only). Tier feature key: NO new key.
- LESSONS to anchor: #0006 (prefix uniqueness),
  #0009 / #0036 (server-vs-client component fetch
  posture for the public page), #0020 / #38
  (.test.ts), #0023 (positive voice on every new
  template + voice scan on the create POST), #0029 /
  #0082 (data-testid scoping in e2e — E2E coach's
  first name overlaps team strings), #0036 (best-
  effort render + COPPA `.select()` allow-list on
  every public route), #0049 / #0092 / #0100 / #0110
  (sitemap mock queue spillover — Glob every
  sitemap*.test.ts), #0054 (stale CHECK constraint on
  parent_reactions.entity_type if enum-constrained),
  #0055 (route handler call posture), #0056 / #0082
  (data-share-url + data-testid), #0057 (team_coaches
  not teams.coach_id — head-coach check), #0060
  (next/og mock + pure metadata helper), #0064 /
  #0065 / #0066 / #0162 (`home/page.tsx` is DIRTY —
  smallest possible touch), #0084 / #0101 (seed
  posture; UUID range), #0088 (strip `--` comments),
  #0091 / #0104 (publicPaths in the SAME PR), #0096
  (schema wins over prose — at pickup read
  `teams.season`, `parent_reactions.entity_type`, the
  existing share-route token shape, the existing
  recap-page styling tokens, the existing
  `team_focus_suggestions` shape, the existing
  `ParentReactionForm` component, the existing
  `team-card/opengraph-image.tsx` pattern, the
  existing onboarding/setup success-state path).

## Implementation log

- 2026-06-05 [implementation-dev] Picked up. Branched `feat/0068-season-opener-card`. Confirmed
  migration prefix 062 is free (LESSONS#0006). Confirmed `parent_reactions.entity_type` does NOT
  exist on the table (migration 023 + the live schema): the reaction shape is `share_token`-keyed,
  not enum-keyed (LESSONS#0096 — schema wins over prose), so the migration does NOT extend any
  CHECK constraint. The opener page will reuse the existing `ParentReactionForm` with the season-
  opener share token threaded as `shareToken`. Confirmed `team_focus_suggestions` is not a real
  table — the default focus textarea will be an empty placeholder, no schema dependency. Confirmed
  `/onboarding/setup` and `/onboarding/roster` BOTH `router.push` away immediately on success (no
  in-page post-success state); the load-bearing entry point is `/home` for any team whose
  `created_at` is within the last 7 days, per the ticket's "AND on /home" clause. Documented in
  the implementation log per LESSONS#0096. UUID seed range: next free is `0...0180+` (the 0066
  range stops at `0...0173`).
