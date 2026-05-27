---
id: 0053
title: Let an org admin delete a team that shouldn't be on the organization's roster
status: proposed
priority: P0
area: tier
created: 2026-05-25
owner: product-groomer
---

<!-- ID renumbered 0031 → 0053 on 2026-05-25 because the autonomous Groomer
     filled 0029/0030/0031 with unrelated GTM tickets between groom and pickup
     of this batch. Substance unchanged. -->


## User story

As the org admin (program director) of a youth-sports organization, I want to
delete a team that shouldn't be on my org — a defunct U10 program we no longer
run, a team a coach created by mistake during onboarding, a restructured
program that was split into two — in a small number of taps, so that my org's
team list, billing roster, and parent-portal surface area reflect the real
program I run today.

This is a **coach-blocking gap** reported by a real user. They said "I need to
be able to delete a team." Today there is no surface that lets them do it. The
`teams.archived_at` column exists (migration 029) but is only set by the
auto-downgrade path when a paid org cancels — there is no manual archive
affordance, and there is no hard-delete affordance at any role. Worse, the
generic `/api/data/mutate` `operation: 'delete'` against `teams` is callable
today with no role check, which would silently destroy every cascading child
(`players` → `observations` → AI history → parent reports) on the first try.

## Why now (four lenses)

### Product Owner
The smallest meaningful unit of value is a two-stage flow that matches how an
admin actually thinks about a team they want gone:

1. **Archive (default).** "I'm done with this team but I might want to look
   at the history later." One tap from the team list (org-admin-only). Sets
   `teams.archived_at = NOW()` (the column already exists). The team
   disappears from the active dashboards, capture switcher, billing
   roster-count, weekly digest, and program-pulse digest. It stays
   queryable in `/settings/seasons` and in any read path the admin opts in
   to via an `includeArchived` flag. **Reversible** by an unarchive action.
2. **Hard-delete (destructive).** "This team should not exist in our
   records — created by mistake, sample data, a test." A second action
   inside the archived-team detail view, behind a typed-team-name confirm
   and a clear list of what will be removed ("12 players, 47 practices, 312
   coach observations, 8 AI-generated parent reports, 3 active share links
   — all permanently deleted"). Hard-deletes the team and every cascaded
   child via the existing schema-level `ON DELETE CASCADE` on `teams(id)`,
   plus a NULL-out of any FK that points at teams without cascade (today:
   `parent_shares.team_id` is nullable and lacks cascade — verify and
   handle; `ai_interactions.team_id` similarly).

A coach who is the head coach of a single team CAN archive their own team
(it's their own coaching surface), but ONLY an org admin can hard-delete.
That permission split is the right one — a head coach should be able to
say "I'm done with this season" without giving them a destructive primitive
that could wipe a sibling team's history if they're confused about which
team is active.

### Stakeholder
This is a privacy + billing hygiene ticket pretending to be a CRUD ticket.
Three named risks today:

1. **Billing math:** the Coach tier's `maxTeams = 3` limit is enforced
   against `select count(*) from teams where org_id = <id>`; an org that
   accumulated a mistake-team can't add a real one without a workaround.
   Archive + delete makes the count accurate.
2. **Parent-portal surface area:** every team carries a `parent_shares`
   set; an abandoned team is an abandoned share surface no one is
   maintaining. Hard-delete cleans it up.
3. **The `/api/data/mutate` hole** (also called out by 0029): a raw
   `operation: 'delete'` on `teams` is callable today with no role check.
   This PR closes that path for `teams` (alongside the 0029 closure for
   `sessions` and `players`).

The moat impact is small — admins archiving teams isn't a viral surface —
but the trust impact is large. An admin who tried to clean up their org
and couldn't, told us so out loud.

### User (5:45pm Sunday, on the couch, on a laptop)
This is the rare workflow that is NOT a Tuesday-on-a-court interaction —
the admin doing this is on a laptop, on the org settings page, taking 30
seconds between dinner and the kids' bath. The team list shows
"Archive" next to each active team (admin-only). One tap → modal: "Archive
the U10 Lions? You can restore it from Settings → Archived teams." One
orange button. Done; the team is gone from the active list and shows up
under "Archived teams" in settings. To hard-delete, the admin opens the
archived team's detail page, sees the counts, scrolls past a yellow
"This is permanent" panel, types the team name, taps "Delete the team
forever". Hard mode is intentionally slower than archive — that's the
right asymmetry.

### Growth
Pure retention + a quiet sales hygiene win. An org admin who can clean up
their roster never has to email support; an org admin who emails support
about a missing CRUD operation churns. The "show me" moment is invisible.
This earns its P0 by being **the third coach-blocking gap** in the same
release wave as 0029/0030 and by being the wedge for the org-pulse digest
(0028) to render a believable team list. There is no viral artifact.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `POST /api/teams/[teamId]/archive` returns `200 { ok: true,
  archivedAt }` for an authenticated coach who is EITHER an org admin
  (`coaches.role IN ('admin', 'head_coach')` per the existing config-route
  pattern at `src/app/api/config/[domain]/route.ts`) for the team's
  `org_id` OR the team's head coach via `team_coaches.role='head_coach'`;
  it sets `teams.archived_at = NOW()`. Re-posting on an already-archived
  team is a no-op (`200 { ok: true, archivedAt: <unchanged> }`).
- [ ] `POST /api/teams/[teamId]/unarchive` returns `200 { ok: true }` for
  the same roles, sets `teams.archived_at = NULL`. Re-posting on a live
  team is a no-op.
- [ ] `DELETE /api/teams/[teamId]` (hard delete) returns `200 { ok: true,
  removedCounts: { players, sessions, observations, plans, parent_shares,
  ai_interactions } }` ONLY when (a) `teams.archived_at IS NOT NULL`
  (i.e. the team is already archived) AND (b) the caller is an org admin
  (NOT just a head coach) AND (c) the request body's `confirm` field
  case-insensitive-equals the team's `name`. Each missing/mismatched
  precondition returns a specific 4xx code: 409 if not archived, 403 if
  not org admin, 400 if confirm missing/mismatched (vitest covers each).
- [ ] `DELETE /api/teams/[teamId]` cascades correctly: after a successful
  call, `select count(*)` is 0 for `players`, `sessions`, `observations`,
  `recordings`, `media`, `plans`, `parent_shares`, `team_announcements`,
  `team_card_shares`, `season_recap_shares`, `season_archives`,
  `recurring_sessions`, `team_coaches`, `org_branding (team-scoped)`,
  `config_overrides (team-scoped)` for the team_id, AND
  `ai_interactions.team_id` is NULLed (the ai_interactions row stays for
  org-level audit, but no longer points at the dead team). Vitest seeds
  one of each row and asserts the per-table cleanup.
- [ ] `DELETE /api/teams/[teamId]` of a NON-archived team returns 409
  with no DB writes; the caller MUST archive first (vitest).
- [ ] `DELETE /api/teams/[teamId]` returns `401` with no auth and `403`
  for an authenticated non-admin (including a head coach of the team
  itself); the row is unchanged (vitest).
- [ ] `DELETE /api/teams/[teamId]` returns `404` for a team in a
  different org from the caller; no existence-leak (vitest).
- [ ] The generic `/api/data/mutate` route REJECTS `operation: 'delete'`
  on `teams` with `403 { error: 'use the typed endpoint' }` (this AC
  overlaps with 0029's identical AC on `sessions`/`teams`/`players`; if
  0029 lands first this rejection already exists and this ticket just
  asserts it; if 0031 lands first 0029 inherits the closed path —
  whichever ships second adds nothing here but asserts the existing
  behavior). Regression: existing legitimate `operation: 'update'` and
  `operation: 'insert'` on `teams` (e.g. updating `teams.name`,
  `teams.season`) continue to work.
- [ ] The active-team query path (`/api/me`, `useActiveTeam`, the team
  switcher) EXCLUDES `archived_at IS NOT NULL` teams from the default
  result. Existing `idx_teams_org_live` (migration 029) already supports
  this query. Regression: archiving the only active team for an org
  shows the org's settings page with an empty-state, never a 500 or a
  blank crash (vitest + Playwright).
- [ ] Tier-limit math (`teams.maxTeams` in `src/lib/tier.ts`) counts
  ACTIVE teams only — archived teams do not consume a slot. A Coach-tier
  org with `maxTeams=3` and one archived team can still create three
  active teams (vitest against `canAccess(tier, 'feature_extra_team')`
  or the team-create route's pre-check, whichever exists today — read
  first).
- [ ] The org settings page (`src/app/(dashboard)/settings/organization/page.tsx`
  or equivalent) lists active teams with an admin-only "Archive" action,
  and a separate "Archived teams" panel that lists archived rows with
  "Restore" and "Delete permanently" actions. The "Delete permanently"
  action opens a modal showing the live cascade counts and a typed-name
  confirm; submitting without the matching name leaves the modal open
  (Playwright e2e against seeded org with 2 teams).
- [ ] Privacy/COPPA: the hard-delete path is the only way to remove a
  player's records as a bulk action; on hard-delete, `players` rows are
  removed (which cascades into `observations`), the corresponding
  `parent_shares` go too, and any public `/share/[token]` URL that
  resolved to one of those shares returns the existing 404/expired page
  (existing behavior — assert no regression). No new `publicPaths` entry.
- [ ] The archive and hard-delete endpoints both call
  `fireWebhooks(orgId, 'team.archived' | 'team.deleted', {...})` via the
  existing webhook bus if those event names are already defined in
  `WebhookEvent`; if not, the events are ADDED to `WebhookEvent` in this
  PR and the bus call wired up. Existing webhook consumers must NOT
  break (regression — assert the `WebhookEvent` union expansion is
  backward-compatible).

## Out of scope

Explicit anti-goals — the dev agent will not do these even if they seem related.

- A "merge two teams into one" or "split a team into two" affordance.
  Out of scope — handled by manual archive + create.
- A trash / undo window beyond the archive → unarchive primitive.
  Hard-delete is final by design.
- Restoring data from a previous hard-delete (no audit-log replay).
  We do not stamp a soft-deleted shadow into another table.
- Touching the `season_archives` snapshots when hard-deleting the team
  they reference. By design, `season_archives.team_id` has
  `ON DELETE CASCADE` already (migration 011) and we accept that — the
  snapshot was meant to live with the team. If a future ticket wants
  archives to outlive their team, that's a separate migration.
- Cross-org team transfer (move a team from org A to org B). Out of
  scope. Today's contract: a team belongs to exactly one org for life
  or until deleted.
- Org-level archive ("archive my whole organization"). Out of scope.
- Any tier gate. Archive/delete is a basic primitive across all tiers.
- AI involvement on the deletion itself. No `callAI()` call, no prompt
  change. (We do NULL out `ai_interactions.team_id` so historical AI
  rows remain auditable at the org level — see AC.)
- Any new analytics SDK or tracker.
- Touching the auto-downgrade archive path (the existing `archived_at`
  setter on cancellation). That code path keeps writing to the same
  column and is unchanged. The new manual-archive endpoint is additive.

## Engineering notes

Files / patterns the dev should touch.

- `src/app/api/teams/[teamId]/archive/route.ts` (new) — `POST` handler.
  Auth via `createServerSupabase().auth.getUser()` → 401; then
  `createServiceSupabase()`. Resolve `coaches.role` AND
  `coaches.org_id` for the user; resolve `team_coaches.role` for
  `(team_id, user.id)`. Authorize: org admin OR team head coach. Update
  `teams set archived_at = NOW() where id = <id> and archived_at is
  null`. Bust `/api/me` cache for every coach on the team (LESSONS.md
  2026-05-20 re: bust-on-webhook). Fire `team.archived` webhook.
  Return `{ ok: true, archivedAt: <ts> }`. Idempotent on a re-call.
- `src/app/api/teams/[teamId]/unarchive/route.ts` (new) — symmetric;
  `archived_at = NULL`.
- `src/app/api/teams/[teamId]/route.ts` (new) — `DELETE` handler.
  Auth as above. Authorize: ORG ADMIN ONLY
  (`coaches.role IN ('admin', 'head_coach')` for the org per the
  config-route precedent; verify the exact role-name in
  `src/app/api/config/[domain]/route.ts` and reuse it — do not invent a
  new role). Pre-check: load the team; if `archived_at IS NULL` → 409
  (must archive first). Read JSON body `confirm`; case-insensitive
  trimmed compare against `teams.name`; 400 if missing/mismatched.
  Count the about-to-be-removed children (single SELECT each, head
  count). Execute deletes in dependency order — the schema already
  cascades from `teams(id)` for: `players`, `sessions`, `recordings`,
  `observations`, `media`, `plans`, `team_coaches`, `parent_shares`
  (verify; if not cascade, NULL out instead), `config_overrides`,
  `team_announcements`, `season_archives`, `team_card_shares`,
  `season_recap_shares`, `recurring_sessions`. For tables WITHOUT
  cascade on `team_id` — verified at write time as
  `ai_interactions.team_id` (no cascade in 001) and any other found via
  `grep "team_id.*references teams" supabase/migrations/*.sql` — NULL
  out the column. Then `delete from teams where id = <id>`. Fire
  `team.deleted` webhook with the `removedCounts` snapshot. Bust caches.
  Return `{ ok: true, removedCounts }`.
- `src/app/api/data/mutate/route.ts` — confirm the `operation === 'delete'`
  branch already rejects `teams` (if 0029 shipped first) or add it here
  alongside `sessions` and `players`. Same vitest.
- `src/app/api/data/route.ts` — the team-list reads (used by the team
  switcher, `useActiveTeam`, `/api/me`) must default to
  `archived_at IS NULL`. Add an `includeArchived: true` opt-in for the
  "Archived teams" panel on the settings page. Regression-test the
  switcher view.
- `src/lib/tier.ts` (or wherever the team-count check lives — read
  `src/app/api/auth/create-team/route.ts` first) — ensure the
  `maxTeams` count uses `archived_at IS NULL`, not raw row count.
- `src/app/(dashboard)/settings/organization/page.tsx` (read first; if
  the surface doesn't exist or doesn't list teams, the right place is
  whichever existing settings page lists the org's teams; otherwise
  ADD a small "Teams" panel here). Render the Archive action per active
  team (admin-only OR head-coach-of-that-team). Render an "Archived
  teams" panel listing archived rows with Restore + Delete actions
  (admin-only). The hard-delete modal lives in
  `src/components/teams/delete-team-modal.tsx` (new) with stable
  `data-testid="delete-team-modal"`, showing the cascade counts and the
  typed-name confirm. Dark zinc/orange aesthetic; no banned words; no
  emoji-decorated headings.
- Test files (all `.test.ts(x)` NOT `.spec.ts` — LESSONS.md 2026-05-20):
  - `tests/teams/archive-route.test.ts` — POST archive + unarchive;
    idempotency; 401/403/404; cache-bust assertion via mock; webhook
    fired.
  - `tests/teams/delete-route.test.ts` — full cascade matrix. Seed
    one row per child table; assert post-delete counts. Cover 409
    (not archived), 403 (head coach only, not admin), 400 (no
    confirm), 401 (no auth), 404 (cross-org). Assert
    `ai_interactions.team_id` is NULLed not deleted.
  - `tests/data/team-list-archive-filter.test.ts` — the default
    archive filter and the `includeArchived: true` opt-in.
  - `tests/tier/max-teams-counts-active-only.test.ts` — the
    maxTeams pre-check skips archived rows.
  - `tests/components/delete-team-modal.test.tsx` — counts, typed
    confirm, disabled-on-submit.
  - `tests/e2e/team-archive-and-delete.spec.ts` — `test.skip` without
    `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`. Extend
    `tests/e2e/fixtures/seed.sql` minimally with a second team owned
    by the same org; admin archives it; opens archived list; deletes
    it with the typed-name confirm; asserts it's gone.
- Run the gate under pinned Node 20.19.0 via PATH (LESSONS.md
  2026-05-21).
- New deps: no. Migration: **probably no** (the schema cascade story
  on `teams(id)` is already broad; verify and add only if you find a
  child table that should cascade but doesn't — e.g. `ai_interactions`
  is intentionally NULL-out not delete). If a migration is needed, use
  the next unique numbered prefix after 037 (or 036 if 0030 hasn't
  landed yet). Env vars: no. AI prompt change: no. Tier feature key:
  no — the route is role-gated, not tier-gated.
- **Dependency note for the loop:** 0029, 0030, 0031 share the
  `/api/data/mutate` delete-denial change. Whichever ships first
  introduces it; the others assert it. They do NOT need to ship in a
  particular order — each is independently mergeable as long as the
  shipping dev runs the local gate after rebasing on top of any of the
  other two that landed first. (LESSONS.md 2026-05-21 re: catch-up
  merge surfacing latent test mock gaps — when this ticket merges on a
  branch that already has 0029, regenerate the data-mutate test
  expectations once and move on.)

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0031-...` opened
- YYYY-MM-DD — failing test added in `tests/teams/delete-route.test.ts`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
