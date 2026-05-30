---
id: 0057
title: Let the coach drop a one-tap "what my team is working on this week" card into the league group chat
status: shipped
priority: P1
area: growth
created: 2026-05-30
owner: product-groomer
---

## Implementation log

- 2026-05-30 [implementation-dev] Branched `feat/0057-weekly-pulse-share-card`. Flipped status to `in-progress`. Next free migration prefix is `054` (last was `053_parent_reactions_coach_reply.sql`). Will mirror 0049 / `practice_plan_shares` patterns for table + share token routes; the public page mirrors `/plan/[token]` (gray/orange parent-portal aesthetic). The home preview card mirrors 0049's publish-button pattern. The public payload's `referralCode` is server-derived via `makeReferralCode(coach.id)` so a forged `?ref=` is overwritten on the page (LESSONS#0039). Reusing the existing `coachFirstName` server-side split pattern from 0049's GET route so no last name is exposed.


## User story

As a volunteer rec-league coach whose three other head coaches in the program share a
WhatsApp thread where they trade what's working ("anyone got a closeout drill?",
"who's playing the Y next week?"), I want one tap on the home page to drop a short
public card — "Week of May 26 · Coach Maya · spacing & off-ball movement · 3 drills,
1 scrimmage" — into the chat, so that I get credit for what my team is actually working
on, the other coaches in the league see me showing up week after week, and the cold
coaches in that thread who don't use SportsIQ click the link and land on a public
artifact a real coach in their own league made.

## Why now (four lenses)

### Product Owner
0049 ships the public practice-plan share (one-shot publish-and-clone of a single
plan). 0055 ships the in-product surface that lets a league's coaches see each other's
PUBLISHED plans on /plan. What neither does is give the coach a RECURRING, low-effort,
weekly-cadence public artifact summarizing what their TEAM (not their PLAN) worked on
this week — the thing the coach actually drops in a league group chat on Saturday
morning saying "here's where we are." The smallest meaningful unit of value is one new
"Share this week" button on /home that resolves the coach's current week's focus
(already computed for the 0023 Monday digest), the count of practices held, the top
two skill categories worked on (aggregated from observations the coach already
captured), and the team's first name + age group — packaged as a public
`/week/[token]` card (gray/orange parent-portal aesthetic), one tap to copy the URL.
No new AI generation on the share path (the card is a structured summary of data the
coach already has), no per-week cron, no new minor data. Reuses the same shares
posture as 0049 (`practice_plan_shares`) — one new table `weekly_pulse_shares` keyed
to a coach + ISO week.

### Stakeholder
This is the missing RECURRING coach-to-coach viral edge. 0049 fires when a coach
publishes a plan they liked (event-triggered, infrequent, asymmetric). This one fires
every week, on a predictable cadence, with low cognitive cost (the data is already
computed). Three moat deepenings: (1) The coach-graph compound: each weekly card is
one more inbound edge into SportsIQ from a coach-trusted channel (the league chat),
landing in front of an audience the product cannot otherwise reach — cold coaches who
trust their colleague but have no SportsIQ awareness. (2) The data-graph compound:
every week the coach is INCENTIVIZED to capture, because the card looks empty without
observations; capture rate goes up, which strengthens every other downstream AI
surface (parent reports, recaps, signature memory). (3) The retention compound: a
coach who has shared 4 weekly pulses has built a public, weekly identity inside the
product — they will not switch to a competitor that doesn't have their last 4 weeks
of pulse history. The card is structurally hard for a forms-app competitor to
replicate because the underlying data (observations, signature, focus, plan
attendance) does not exist in their schema.

### User (Saturday morning, coach over coffee, league chat already pinging)
She opens /home. New small card under the weekly digest tile: "Share this week —
Week of May 26 (3 drills · 2 sessions · spacing & off-ball)." She taps. A sheet shows
a preview of the card EXACTLY as the league chat will see it (the same component
that renders the public `/week/[token]` page, mirrored small inside the sheet so she
trusts what she's sending). Two buttons: "Copy link" (fires `navigator.clipboard`,
shows a toast "Copied — paste in your league chat") and "Edit caption" (lets her add
one optional line like "anyone want to swap closeout drills?"). She taps Copy, drops
it in the WhatsApp thread. On the cold-coach side: another head coach in the program
opens the link on his phone, sees Maya's week — the public card is plain, dense, no
SportsIQ marketing crust, just real coaching info — and at the bottom one CTA: "I
coach too — start free." That CTA carries Maya's referral code (0011/0021 pattern),
so the warm-landing on /signup names Maya. If Maya never taps the button: home is
byte-identical to today, no nag.

### Growth
The "show me" moment is the LEAGUE CHAT screenshot — a real coach's name, a real
week, a real team's focus, dropped into a 4-coach text thread. That's the screenshot
another coach in the same league sends to her own assistant saying "look what Maya's
running this week." Compounds three ways no shipped surface compounds: (1) the
publisher's reciprocity — once Maya shares one week, the second week is a one-tap
re-share with this week's data; the cognitive cost of the fourth share is near zero.
(2) the public URL's referral attribution — every visit carries the publisher's
`makeReferralCode(coach.id)` so 0021's warm-landing names Maya on the cold coach's
signup. (3) the sitemap inclusion (0038) — the active pulse cards are crawlable, so
a cold searcher Googling "coach maya flag football arvada" finds the artifact even
without the chat. This is the league-internal compound the 0024 invite-coach flow
seeds but does NOT keep alive — staff coaches stop opening the dashboard once
they're signed up; weekly-pulse keeps them publicly accountable to each other.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] New migration `054_weekly_pulse_shares.sql` adds the table
  `weekly_pulse_shares (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), token TEXT
  NOT NULL UNIQUE, coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE, iso_week TEXT NOT
  NULL, caption TEXT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at
  TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT weekly_pulse_shares_coach_week_uniq
  UNIQUE (coach_id, team_id, iso_week))` plus `CREATE INDEX
  idx_weekly_pulse_shares_token ON weekly_pulse_shares (token) WHERE is_active;` and
  a `(coach_id, created_at DESC)` index. Pick the next free prefix after 053 by
  running `ls supabase/migrations/` at pickup — LESSONS#0006. Document the COPPA
  approval trail in the `--` header (no per-minor data on this table; the public
  card renders team-level aggregates only — no player names, no observation text;
  LESSONS#0088 — strip comments before scanning DDL in the test). (vitest: scan
  executable DDL only; assert column allow-list matches exactly; banned tokens
  `player`, `parent`, `medical`, `dob`, `name` absent in DDL.)
- [ ] `POST /api/weekly-pulse/create` (new) accepts `{ teamId, isoWeek?, caption? }`.
  Auth via `createServerSupabase().auth.getUser()` → 401. Team must belong to the
  caller (`eq('coach_id', user.id)`) → 404. Defaults `isoWeek` to the current
  ISO week if omitted. Idempotent: a second POST for the same `(coach_id, team_id,
  iso_week)` reuses the existing active row (returns the same token). Inserts via
  service-role only; never a direct client write. Returns `{ token, url:
  '/week/<token>' }`. (vitest: 401 missing auth; 404 foreign team; happy returns
  token + URL with the correct shape; idempotent re-create returns the same token.)
- [ ] `GET /api/weekly-pulse/[token]` (new) reads the token (active rows only),
  joins to `teams` for `name + sport + age_group`, joins to `coaches` for
  `first_name` (server-side split of `full_name`; never the full name), and
  computes from `observations` + `sessions` for the row's `iso_week`:
  `sessionCount`, `topCategories: string[]` (max 2, by count of needs-work +
  positive obs), `focusFromProgramOrCoach: string | null` (the existing program-
  focus resolver from 0031, falling back to the coach's signature from 0037 if
  set; never the player's name). The response keyset is EXACTLY
  `{ coachFirstName, teamName, sportName, ageGroup, isoWeek, sessionCount,
  topCategories, focusLine, caption }` — no `player_*`, no `observation_text`, no
  `parent_*`. Sort `Object.keys(payload)` and deep-equal-assert. 404 on
  missing/inactive token. PUBLIC (added to `publicPaths`). (vitest: 404 missing;
  payload-keyset deep-equality on happy path; planted player-name tokens in any
  joined row do NOT appear in the response; the public-key allow-list is the
  asserted contract.)
- [ ] `src/app/week/[token]/page.tsx` (new, server component, gray/orange parent-
  portal aesthetic — NOT the dark dashboard) reads the token via the public GET
  route and renders: "Week of <human-readable date> · Coach <FirstName>" header,
  the team name + sport + age group, a small two-line block listing the top
  categories and the focus line, the session count, the optional caption. Bottom
  CTA "I coach too — start free" that links to `/signup?ref=<coach
  referral code>` using `makeReferralCode(coach.id)` (0011/0021 pattern) so the
  warm-landing names the publishing coach. 404 on missing/inactive token. NO
  comments, NO reactions, NO ratings — receiver experience is "read it and tap
  the CTA or close the tab". Routes added to `publicPaths` in `src/lib/supabase/
  middleware.ts` per LESSONS#0038 (`/week/` and `/api/weekly-pulse/`). (Playwright
  on the 0006-seeded Supabase: seed a `weekly_pulse_shares` row + a few
  observations for the week's ISO range; visit `/week/<token>`; assert the team
  name, the coach first name, the focus line, and the CTA href render; visit with
  no token → 404; the CTA href contains the publisher's referral code.)
- [ ] `src/components/home/weekly-pulse-share-card.tsx` (new) — client component
  on /home. Renders a small "Share this week" card with the current week's
  aggregate preview (session count, top categories, focus line — fetched via a
  client-side `useQuery` against a new `GET /api/weekly-pulse/preview?teamId=<id>`
  route that returns the SAME shape the public GET will render, computed live for
  the active team). On tap the card opens a sheet that POSTs `/api/weekly-pulse/
  create`, shows the URL + a Copy button, and a small "Edit caption" textarea
  that re-POSTs with the caption to update. On a coach with no observations this
  week the card renders nothing (silence beats nag). 44px tap targets, dark/zinc
  card, orange accent. (vitest component test: render with mocked preview;
  asserts the preview text + the share button; tap → asserts the create route is
  called; on no-data → renders null; render with a coach who has already shared
  this week → button reads "Copy link" not "Share.")
- [ ] The dynamic sitemap (`src/app/sitemap.ts`, shipped by 0038) is extended to
  include every active `weekly_pulse_shares.token` as `/week/<token>` — mirror
  the existing share-table iteration pattern. NO per-coach data crosses the
  sitemap; the URL is opaque. (vitest: a seeded active pulse appears in
  `/sitemap.xml`; an inactive one does not.)
- [ ] Tier / privacy / COPPA: sharing the weekly pulse is FREE for every tier (no
  new `feature_*` key — gating a viral surface inverts the loop). The public card
  contains NO per-player data by construction (the GET route's allow-list never
  includes player names, observation text, or any minor descriptive field). A
  free coach can share. The route counts as ZERO AI calls (it does no LLM work).
  (vitest: free coach happy-path; the public GET response contains none of
  `player_name`, `observation`, `parent`, `dob`, `email` even if planted in the
  source `observations.text`.)
- [ ] Voice contract: every user-facing string the dev adds (the home card
  header + button + tooltip, the sheet copy, the public page's header / CTA /
  footer, the toast text, the caption placeholder) contains NO AGENTS.md banned
  word. Per LESSONS#0023 the copy is written POSITIVELY ("Share this week," "I
  coach too — start free") and never enumerates the banned tokens verbatim.
  (vitest: render each new component; scan the rendered text for the banned
  list.)
- [ ] Referral-code attribution: the public page's CTA href contains the
  publishing coach's `makeReferralCode(coach.id)` so a cold-coach signup is
  warm-landed against the publisher per 0011/0021. The referral code is computed
  server-side (the public route returns it as part of the payload OR is
  re-derived from the joined coach id on the page); never trust a client-supplied
  ref. (vitest: the public route's response includes the publisher's referral
  code as a string; the page's CTA href contains it; a forged `?ref=` in the
  URL is overwritten by the page's computed CTA.)
- [ ] Regression: existing `/api/weekly-digest` (0023), `/api/practice-plan-
  shares/league` (0055), `/api/share/<token>` (parent-portal) are byte-identical
  for any coach who has not shared a weekly pulse. The new card on /home renders
  null on no-observations, so /home for a brand-new coach is byte-identical.
  (vitest: snapshot the existing weekly-digest output for a fixture coach; assert
  no change after the migration applies. /home component test with zero-state
  observations: the share card is absent from the DOM.)
- [ ] Allow-list and data-route posture: `practice_plan_shares` follows the same
  pattern as 0049 — `weekly_pulse_shares` is added to the READ allow-list in
  `src/app/api/data/route.ts` (so the coach can list their past pulses) but NOT
  to the mutate allow-list in `src/app/api/data/mutate/route.ts` (insertions
  flow through the dedicated create route only — same posture as LESSONS#0039).
  (vitest: a `query({ table: 'weekly_pulse_shares' })` for the caller's own
  pulses succeeds; a direct `mutate({ table: 'weekly_pulse_shares', op:
  'insert' })` is REFUSED with 403.)
- [ ] Seeded e2e on the 0006 fixture: extend `tests/e2e/fixtures/seed.sql` to
  add ONE `weekly_pulse_shares` row tied to the existing E2E coach + E2E team
  for a fixed ISO week, with a small observations seed inside that week so the
  GET route's category aggregation has data. Pick UUIDs in the `0000000000a0`
  family (the parent-reactions seeds end around `00a0` after 0056; verify with
  grep at pickup per LESSONS#0101) and the `iso_week` value is a fixed string
  like `'2026-W22'` (a calendar-frozen value, not `now()`, so the spec is
  deterministic). The Playwright spec signs in as the E2E coach, taps the home
  card, asserts the sheet opens with the seeded URL, then opens the public
  `/week/<token>` page in a fresh `browser.newContext()` and asserts the team
  name + focus line + CTA render. Scope assertions with `data-testid` per
  LESSONS#0081. Skip when E2E creds are unset.

## Out of scope

- A weekly-pulse CRON that auto-publishes a card every Saturday for every coach.
  v1 requires the coach to tap. Auto-publishing destroys the voice authenticity
  the league chat trusts.
- AI generation of the card's content (the focus line, the categories). v1 is
  pure structured aggregation — the focus line is the existing program-focus or
  coach-signature, the categories are the obs counts. Adding AI here would be a
  voice mismatch for the recurring cadence + a quota cost we don't need.
- Comments / reactions / ratings on the public card. v1 is one-way (publisher
  posts, viewer reads). Reactions belong on the parent portal, not the coach-to-
  coach surface.
- A weekly-pulse INBOX showing every league colleague's pulse. 0055 covers the
  in-product discovery for PLANS; a pulse inbox would duplicate that surface.
  Keep this ticket about the SHARE side, not the discovery side.
- Localizing the public card. v1 is English.
- Per-week archival pruning. Active shares accumulate; we add the unique
  constraint on `(coach_id, team_id, iso_week)` so we never get duplicates.
  Bulk-prune is a future infra ticket.
- Storing per-pulse view counts. v1 has no analytics SDK and no view-counter
  table; adding one needs an explicit AGENTS.md approval line.
- Threading the pulse into the Monday digest (0023) email. v1 keeps the digest
  byte-identical; the pulse lives in /home only.

## Engineering notes

Files / patterns the dev should touch.

- New migration `supabase/migrations/054_weekly_pulse_shares.sql` per the AC
  schema. Document the COPPA approval trail in the `--` header (LESSONS#0088).
  Verify next free prefix with `ls supabase/migrations/` at pickup (LESSONS#0006);
  if 054 is taken by a sibling, use the next free integer.
- `src/types/database.ts` — add `WeeklyPulseShare` interface. Per LESSONS#0099
  no widening of an existing required type, so no sweep needed.
- `src/lib/weekly-pulse-utils.ts` (new) — pure helpers: `generateShareToken()`
  (mirror the existing share-token helper used by team-card / season-recap /
  practice-plan-shares); `currentIsoWeek(date = new Date()): string` (e.g.
  `'2026-W22'`); `buildPulsePayload({ team, coach, observations, sessions,
  focusLine }): { coachFirstName, teamName, sportName, ageGroup, isoWeek,
  sessionCount, topCategories, focusLine, caption }`. NO database access; NO AI
  call. Per LESSONS#0102 if pinning a faker-derived fixture for tests, anchor
  the name explicitly to avoid initials/text strict-mode collisions.
- `src/app/api/weekly-pulse/create/route.ts` (new) — `POST({ teamId, isoWeek?,
  caption? })`. Auth → 401; ownership → 404; idempotency reuse. Service-role
  only.
- `src/app/api/weekly-pulse/[token]/route.ts` (new) — `GET(request, { params })`.
  Reads the token; computes the aggregate; returns the four-shape payload.
  Public (in `publicPaths`).
- `src/app/api/weekly-pulse/preview/route.ts` (new) — `GET(request)`. Same shape
  as the public GET but authed and live-computed for the caller's active team
  (no token resolution). Powers the home-card preview.
- `src/app/week/[token]/page.tsx` (new, server component, gray/orange aesthetic).
  Mirror `src/app/plan/[token]/page.tsx` (0049) layout patterns; the CTA href is
  `/signup?ref=<referralCode>` using `makeReferralCode(coach.id)` (0021).
- `src/components/home/weekly-pulse-share-card.tsx` (new) — client component
  rendered on `/home`. Mirror the 0049 publish-plan button pattern; opens a
  sheet on tap; renders the preview, the share button, the Copy button, the
  caption textarea.
- `src/app/(dashboard)/home/page.tsx` (existing — read first) — render
  `<WeeklyPulseShareCard />` near the other home cards. Renders null on no-data
  so the home screen is byte-identical for a coach with no obs this week.
- `src/lib/supabase/middleware.ts` — add `/week/` and `/api/weekly-pulse/` to
  `publicPaths` (LESSONS#0038). The create / preview routes self-enforce auth
  in the handler so the blanket prefix never bypasses the 401.
- `src/app/sitemap.ts` (existing — read first; LESSONS#0049) — extend the
  iteration to include `weekly_pulse_shares` where `is_active = true`. Per
  LESSONS#0049 / #0100, if extending an existing route shared with a hand-rolled
  test mock, update EVERY `mockReturnValueOnce` queue in `tests/app/sitemap.test.ts`
  to add the new chain.
- `src/app/api/data/route.ts` — add `weekly_pulse_shares` to the READ allow-list.
- `src/app/api/data/mutate/route.ts` — do NOT add `weekly_pulse_shares`. Direct
  client-insert is refused; insertions flow through the dedicated create route.
- `tests/api/weekly-pulse-create.test.ts` (new, `.test.ts` per LESSONS#0020/#38)
  — 401 / 404 / happy / idempotency. Run under Node 20.19.0 (LESSONS#0010); run
  `tsc --noEmit` without piping to `tail` (LESSONS#0095/#0096).
- `tests/api/weekly-pulse-token-get.test.ts` (new) — 404 inactive; payload-keyset
  deep-equality on happy path; no minor descriptive field in the payload even if
  planted in the source.
- `tests/api/weekly-pulse-preview.test.ts` (new) — auth required; live-compute
  for the caller's active team; no-data → empty aggregate.
- `tests/migrations/weekly-pulse-shares-coppa.test.ts` (new) — strip `--`
  comments per LESSONS#0088; assert column allow-list; assert banned tokens
  (`name`, `dob`, `medical`, `parent`, `observation`) absent from executable
  DDL.
- `tests/components/weekly-pulse-share-card.test.tsx` (new) — render with mocked
  preview → asserts the share button + preview text; tap → calls the create
  mutation; on no-data → null. Anchor any faker-derived fixture name explicitly
  to avoid the LESSONS#0102 initials collision.
- `tests/e2e/weekly-pulse-flow.spec.ts` (new Playwright spec) against the
  0006-seeded Supabase. Seed extension: ONE `weekly_pulse_shares` row + a small
  observations seed inside the row's `iso_week`. Pick UUIDs in the `0000000000a0+`
  range (LESSONS#0101). Sign in as the E2E coach; tap the home card; assert the
  sheet shows the seeded URL; open `/week/<token>` in a fresh browser context;
  assert the team name + focus line + CTA href render. Scope with
  `data-testid` (LESSONS#0081). Skip when E2E creds are unset.
- `tests/e2e/sitemap.spec.ts` (existing) — extend to assert active
  `weekly_pulse_shares` tokens appear in `/sitemap.xml`.
- New deps: NO. Migration: YES (one new table + indexes). Env vars: NO. AI
  prompt change: NO (no new entry in `src/lib/ai/prompts.ts`). Tier feature
  key: NO (sharing is universal).
- LESSONS to anchor: #0006 (migration prefix uniqueness — verify with `ls`
  at pickup), #0038 (add to `publicPaths`), #0039 (server-side referral-code
  re-derivation; never trust client-supplied refs), #0049 / #0100 (update
  sitemap test mocks when extending the sitemap from-chain), #0081 (`data-
  testid` scoping in Playwright), #0084 / #0101 (seed UUIDs and parent contacts
  — but this card has none), #0088 (strip `--` comments before DDL banned-token
  scan), #0102 (anchor faker fixture names to avoid initials collisions),
  #0023 (instruct positively in voice scans; the rendered text must not enumerate
  banned tokens).
