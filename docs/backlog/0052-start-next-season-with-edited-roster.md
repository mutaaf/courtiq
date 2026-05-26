---
id: 0052
title: Let the coach start the next season with an edited roster without losing player history
status: proposed
priority: P0
area: onboarding
created: 2026-05-25
owner: product-groomer
---

<!-- ID renumbered 0030 → 0052 on 2026-05-25 because the autonomous Groomer
     filled 0029/0030/0031 with unrelated GTM tickets between groom and pickup
     of this batch. Substance unchanged. -->


## User story

As a volunteer coach whose Spring 2026 season just ended, I want to start my Fall
2026 season with a clean roster — release the four kids who graduated up, keep the
six who are returning (with their multi-season observation history intact), and
add the five new signups — in one flow on one screen, so that I don't have to
either (a) delete the team and lose two seasons of notes on the returning kids or
(b) "start a fresh team" alongside the old one and lose the through-line that makes
the AI's memory worth anything.

This is a **coach-blocking gap** reported by a real user. They said "I need to be
able to do this." Today the only existing surface is the season-archive snapshot
in `/settings/seasons` (built by 0011 migration + `/api/seasons` POST), which
preserves a frozen JSON view of the prior season's player skills but does NOT
provide a roster-turnover flow: the live `players` table just keeps growing, the
graduated kids remain `is_active=true` and clutter every roster surface, and
there is no way to mark a player as "carried over to the next season" so the
Practice Arc / parent report / weekly star know the new season started.

## Why now (four lenses)

### Product Owner
The smallest meaningful unit of value is a single-screen "start a new season on
this team" flow that does three things in one submit:

1. **Names the new season** (text + start/end date).
2. **Lets the coach mark each current player as either *returning*, *released*
   (graduated up / left the program), or *new* (added inline by name + age
   group + optional jersey),** with a "release the four kids who are too old now"
   bulk action.
3. **Optionally snapshots the closing season** into `season_archives` via the
   existing `POST /api/seasons` (so 0011's prior work is reused, not bypassed).

After submit, the team's live roster is the union of *returning* + *new*;
*released* players are soft-released (a new `players.released_at` timestamp,
mirroring the `teams.archived_at` shape from 029) but their observations stay
attached to the player_id for cross-season continuity. The team row is updated
in place — `teams.season` and `teams.season_weeks` get new values — instead of
cloning the team, because cloning would orphan every cross-season query and
double the roster surface for parents who used the prior `/share/[token]`. The
"removed not added" win here is large: we don't ship a second "clone team for
new season" affordance, we don't ship "merge two teams later", we don't ship a
new dashboard tab. One flow, one screen.

### Stakeholder
This is a load-bearing moat ticket disguised as a CRUD ticket. The
multi-season `player_skill_proficiency` + `observations` history is the asset
that makes the Practice Arc and the "since last report" parent narrative
(0016) work *across* seasons; a coach who has to nuke their team and rebuild
every fall destroys that asset every September and we ship a memoryless
artifact each new season. Worse, a coach who works around the gap by creating
"Spring 2026 Lions" and "Fall 2026 Lions" as two separate teams gives us two
shallow histories instead of one deep one — and the AI prompts that say
"player X has been working on closeouts since week 3 of last season" can't
ever speak. So: this ticket is the carrier-wave for cross-season AI memory.
The migration adds `players.released_at` (nullable timestamptz), and every
existing "active roster" read filters on `released_at IS NULL` AND
`is_active = true`, which means returning kids keep their per-player memory
(0025), Practice Arc continuity (0018/0020), and per-player parent-report
continuity (0016) by id, while released kids stop showing up in capture /
roster / parent links without their history being deleted.

### User (at 5:45pm on a Tuesday, 12 kids on a court)
The coach is at the kitchen table the Sunday night before the fall season —
not on a court — and they tap "Start a new season" from the team header.
One screen: name + dates at the top, the 12 current players as a list with
three radio chips per row (Returning / Released / New), a bulk "Release all
players above age X" affordance for the graduated-up case, and a "+ Add player"
inline row that mirrors the existing roster-add UX. Submit. They land on the
roster page with the new season banner and the cleaned roster. If the network
hiccups mid-submit, the API is idempotent (running it again with the same
season name + dates either no-ops or returns the prior result, never doubles
the release/add). On a phone this is one scrolling screen, not a wizard.

### Growth
Pure retention at the highest-risk moment of the year. The
end-of-season-to-next-season transition is the single biggest churn hazard
for a youth-sports product — coaches who don't make it through this transition
never come back in the fall. Getting it right makes the multi-season "your
returning kids picked up where they left off" story possible, which is the
"show me" moment for a returning coach: opening Capture on day 1 of the fall
season and seeing "Maya — last time: hesitated on closeouts (3 months ago)"
from the player-memory line (0025) is the kind of demo that makes another
coach say "wait, it remembers from spring?" There's no shareable viral
artifact here, but the retention multiplier across the season boundary is
the single largest one we ship this quarter.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] Migration 037 (or the next free numbered prefix per LESSONS.md re:
  unique migration prefixes) adds `players.released_at TIMESTAMPTZ NULL` and
  a partial index `idx_players_team_active_unreleased` on
  `(team_id, created_at DESC) WHERE is_active = true AND released_at IS NULL`
  to keep the active-roster query path fast (vitest checks the column
  exists by inserting a row with `released_at = NOW()` and reading it back).
- [ ] `POST /api/teams/[teamId]/new-season` returns `200 { teamId, seasonName,
  returningCount, releasedCount, addedCount, archiveId? }` for an
  authenticated head coach of the team, atomically applying the
  returning/released/new partition in a single request (vitest seeds a team
  with 3 players, posts a body marking 1 returning, 1 released, 1 new, and
  asserts the live count is 2 + released_at set on the third + new row created).
- [ ] `POST /api/teams/[teamId]/new-season` returns `401` with no auth and
  `403` for an authenticated coach who is not `team_coaches.role = 'head_coach'`
  on the team; in both cases NO row in `players` or `teams` is changed
  (vitest asserts the rows are byte-identical after the rejected call).
- [ ] `POST /api/teams/[teamId]/new-season` returns `404` for a team in a
  different org from the caller (no existence-leak — same shape as the 0029
  delete-session route).
- [ ] When the body includes `archivePreviousSeason: true`, the route ALSO
  calls into the same code path as the existing `POST /api/seasons`
  (extracted into `src/lib/seasons/archive.ts` as a pure server-side
  function) so the prior season's `season_archives` row is created with the
  team's current `teams.season` as `season_name` BEFORE the released_at
  flips happen (so the snapshot's `player_count` includes the
  about-to-be-released players); the route returns the `archiveId`. When
  `archivePreviousSeason: false`, no archive row is created (vitest covers
  both branches).
- [ ] Released players (`released_at IS NOT NULL`) are EXCLUDED from every
  active-roster read path — `/api/data` GET on `players` with the standard
  filters used by the roster/capture/observe pages — without changing those
  callers; do this by adding a `released_at IS NULL` predicate at the
  generic `/api/data` route level for the `players` table only, behind an
  opt-in `includeReleased` flag for surfaces that need to see them (e.g. the
  season-archive viewer). Regression: existing roster page test still
  shows all currently-active players (vitest + Playwright).
- [ ] Released players are STILL JOINABLE for cross-season reads: a query
  for observations on a released player returns their history; the parent
  report "since last report" continuity (0016) for a released player still
  works if a parent visits an old `/share/[token]` (vitest seeds a released
  player with 5 observations and asserts both observations and a generated
  report can resolve the player by id).
- [ ] The new-season UI screen lives at `/teams/[teamId]/new-season`
  (server-rendered, head-coach-only). It renders the current active roster
  as a list of rows; each row offers Returning / Released / New chips and a
  bulk action "Release all players over age X" (Playwright: 12 seeded
  players across two age groups, click bulk for the older group, assert
  only the older rows flip to Released).
- [ ] Submitting the new-season form lands the coach on `/roster` with a
  one-line orange banner reading the new season's name; the released
  players are absent from /roster (Playwright e2e).
- [ ] Idempotency: re-posting `POST /api/teams/[teamId]/new-season` with
  the same `seasonName` and the same returning/released/new partition does
  NOT double-release anyone, does NOT create duplicate players, and does
  NOT create a second `season_archives` row (vitest: post twice, assert
  counts unchanged on the second call). Phrase the second call's response
  as `200 { ... noop: true }` rather than 409 — a flaky network shouldn't
  fail the second submit.
- [ ] Privacy/COPPA: no new field is added to `players` other than
  `released_at` (a status timestamp; carries no minor PII). No
  `publicPaths` change. The route never accepts a player's age as a
  free-text birthdate field that wasn't already collected — the bulk
  "release over age X" uses the existing `players.age_group` /
  `date_of_birth` columns only.
- [ ] No tier gate. Roster turnover is a basic operation across all tiers
  (Free coaches need it too — they only have 1 team but they still have a
  September). Server-side test asserts the route succeeds on a `tier='free'`
  org for the org's one team.

## Out of scope

Explicit anti-goals — the dev agent will not do these even if they seem related.

- A "clone this team for next season" affordance. We update the team in
  place. Cloning would orphan cross-season queries and double the parent
  portal surface and is precisely the workaround we are removing.
- Restoring a released player. v1 has no un-release action; a coach who
  releases the wrong kid can re-add them as a new player. (Their old
  observation history stays attached to the old player_id; we can ship a
  merge tool later if this becomes a real pattern.)
- Auto-detecting "graduated up" from age. v1 surfaces a bulk "Release all
  players over age X" but the coach picks X and the action is explicit.
- Transferring a released player to a different team within the same org.
  Out of scope — handled by the org-level player-move flow if/when we
  build it; this ticket is single-team only.
- Cross-team parent linking, parent re-consent on a new season, or any
  notification to parents about the season change. Parents see the new
  season's content the next time the coach generates a report — silent
  rollover.
- Touching the existing `POST /api/seasons` route's contract. We *extract*
  the archive-build helper into `src/lib/seasons/archive.ts` and have BOTH
  routes call it; the old route's response shape stays byte-identical.
- A timeline view of "all seasons this team has run". Out of scope; the
  `/settings/seasons` page already lists the archives.
- Any new analytics SDK or tracker.
- Hard-deleting released players. Released is a soft state by design;
  the only way to hard-delete a player remains the existing roster-edit
  flow on a per-player basis.

## Engineering notes

Files / patterns the dev should touch.

- **Migration** — next free numbered prefix after `036_season_recap_shares.sql`,
  so `supabase/migrations/037_player_released_at.sql`. Add the column, the
  partial index, and a short doc comment explaining "released ≠ deleted —
  preserves cross-season observation history by id". Verify the prefix is
  unique (LESSONS.md 2026-05-20 re: dup `031_` prefixes that broke
  `schema_migrations_pkey`).
- `src/lib/seasons/archive.ts` (new) — extract the body of the existing
  `POST /api/seasons/route.ts` archive-snapshot logic into a pure server-side
  function `buildAndInsertSeasonArchive(admin, { orgId, teamId, coachId,
  seasonName, startDate, endDate, notes })` returning `{ archive }`. Both
  the old `/api/seasons` POST and the new `/api/teams/[teamId]/new-season`
  POST call this helper. No behavior change to `/api/seasons`.
- `src/app/api/teams/[teamId]/new-season/route.ts` (new) — `POST` handler.
  Auth via `createServerSupabase().auth.getUser()` → 401; then
  `createServiceSupabase()`. Resolve `coaches.org_id`; confirm the team
  belongs to that org (else 404). Confirm `team_coaches.role = 'head_coach'`
  for `(team_id, user.id)` (else 403). Body shape:
  ```
  {
    seasonName: string;            // e.g. "Fall 2026"
    startDate?: string;            // ISO date
    endDate?: string;              // ISO date
    seasonWeeks?: number;
    archivePreviousSeason?: boolean;
    archiveNotes?: string;
    returningPlayerIds: string[];  // every id MUST already exist on the team
    releasePlayerIds: string[];    // every id MUST already exist on the team
    newPlayers: Array<{ name: string; ageGroup: string; position?: string;
                       jerseyNumber?: number }>;
  }
  ```
  Execution order: (1) if `archivePreviousSeason`, call
  `buildAndInsertSeasonArchive(...)` and capture `archiveId`. (2)
  `update players set released_at = NOW() where id in (releasePlayerIds)
  and team_id = <teamId> and released_at is null`. (3)
  `insert into players (team_id, name, age_group, ...) values (...)` for
  the new rows. (4) `update teams set season = <seasonName>, season_weeks =
  <seasonWeeks ?? existing>, current_week = 1, updated_at = NOW() where id
  = <teamId>`. (5) Bust `/api/me` cache for the coach (LESSONS.md 2026-05-20
  re: bust-on-webhook caching pattern; reuse `bustOrgMeCache` or its
  equivalent for non-webhook callers).

  Idempotency: before (2)/(3), compute the no-op signal — if every
  `releasePlayerIds` already has `released_at IS NOT NULL` AND every
  proposed new player already exists on the team by `(name, age_group)`
  match AND `teams.season === seasonName`, return
  `200 { noop: true, ... }` without writes (vitest covers this).
- `src/app/api/data/route.ts` — add `released_at IS NULL` to the `players`
  read predicate by default. Add a `includeReleased: true` flag in the
  request body that opts back in (the season-archive viewer and the
  per-player observation history reader will use it). Regression: confirm
  the existing `tests/data/*.test.ts` (if any) still pass and the roster
  Playwright e2e returns the same players it did before.
- `src/app/(dashboard)/teams/[teamId]/new-season/page.tsx` (new,
  `'use client'`). Renders the head-coach-only turnover form. Use existing
  primitives — `Card`, `Button`, `Input` — and the existing roster row
  layout from `src/app/(dashboard)/roster/page.tsx`. Each row gets three
  chip toggles (Returning / Released / New, default Returning) with 44px
  touch targets. A "+ Add player" inline row mirrors
  `src/app/(dashboard)/roster/add/page.tsx`. The bulk "Release all over
  age X" affordance is a single row above the list. Dark zinc/orange
  aesthetic; no banned words; no emoji-decorated headings. The submit
  button is disabled while the mutation is in flight (no double-submit).
- Team header (`src/components/layout/*` for the active team switcher, or
  the team detail page if one exists — read first) gets a "Start a new
  season" link, visible only to head coaches. Wire it to the new page.
- `src/app/api/seasons/route.ts` — refactor to call the new
  `buildAndInsertSeasonArchive` helper. Response shape unchanged.
- Test files (all `.test.ts(x)` NOT `.spec.ts` — LESSONS.md 2026-05-20):
  - `tests/seasons/new-season-route.test.ts` — chainable in-memory
    Supabase mock; seed team + 3 players + head-coach membership; assert
    every AC in the route block. Cover the no-auth, non-head-coach, and
    cross-org 401/403/404 cases. Cover the idempotent re-post.
  - `tests/seasons/archive-helper.test.ts` — exercise the extracted
    `buildAndInsertSeasonArchive` in isolation against a fixture admin;
    assert the existing `/api/seasons` POST behavior is byte-identical
    (regression).
  - `tests/data/players-released-filter.test.ts` — assert the
    `released_at IS NULL` default filter on `/api/data` for `players`,
    and the `includeReleased: true` opt-in.
  - `tests/components/new-season-form.test.tsx` — render the form
    component; assert the three-chip row, the bulk release, the inline
    add-new-player row, and the disabled-on-submit state.
  - `tests/e2e/team-new-season.spec.ts` — `test.skip` without
    `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`. Seed an additional 4 players on
    the existing E2E team with mixed ages (extend
    `tests/e2e/fixtures/seed.sql` minimally). The flow: head coach opens
    `/teams/<id>/new-season`, names the new season, marks 1 released and
    1 returning and 1 new, submits, lands on `/roster`, the released
    player is gone, the new player is present, the new season name shows.
- Run the gate under pinned Node 20.19.0 via PATH (LESSONS.md 2026-05-21
  re: `nvm use` swallowing output): `N20="$HOME/.nvm/versions/node/v20.19.0/bin";
  PATH="$N20:$PATH" npm ci && PATH="$N20:$PATH" ./node_modules/.bin/vitest run ...`.
- New deps: no. Migration: **yes**, `037_player_released_at.sql` (unique
  prefix). Env vars: no. AI prompt change: no. Tier feature key: no.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0030-...` opened
- YYYY-MM-DD — failing test added in `tests/seasons/new-season-route.test.ts`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
