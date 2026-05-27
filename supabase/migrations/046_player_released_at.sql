-- Migration 046: players.released_at — soft-state next-season roster turnover (ticket 0052)
--
-- Adds a single nullable timestamptz column on `players` that the new-season
-- flow flips for kids who aged up or left the program. Released != deleted:
-- the player row stays, their cross-season observation history stays attached
-- by id, and the AI prompts that say "since week 3 of last season" can keep
-- speaking. The active-roster reads simply add `released_at IS NULL` to the
-- predicate so released kids stop showing up on capture / roster / parent
-- contact without their history being destroyed.
--
-- COPPA / data minimization: this column collects NO new information ABOUT
-- the minor. It is a status timestamp the coach controls (set when the coach
-- presses "Released" on the next-season turnover screen). There is no
-- name-similarity, dob-match, biometric, or photo-match data here — only the
-- nullable timestamptz. An existing player has released_at = NULL and behaves
-- exactly as before, so the migration is backfill-safe with no app
-- coordination required.
--
-- Index strategy: the active-roster read path is the hottest on `players`
-- (roster page, capture page, observe page all run it). Add a PARTIAL index
-- on the predicate so the planner can skip released rows entirely as the
-- released backlog grows. The existing idx_players_team (001_schema.sql:540)
-- stays in place for cross-season reads that want every player.
--
-- Unique version prefix 046 (next free after 045_drill_sequence_aggregates).
-- The Supabase CLI keys applied migrations on the leading <version>_ token,
-- so a unique prefix avoids the schema_migrations duplicate-key class of
-- failure (LESSONS.md 2026-05-20 — the dup `031_` files broke a fresh DB).

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ NULL;

-- Partial index for the active-roster query path. Only rows that are STILL
-- on the team (is_active=true AND released_at IS NULL) live in this index.
CREATE INDEX IF NOT EXISTS idx_players_team_active_unreleased
  ON players (team_id, created_at DESC)
  WHERE is_active = true AND released_at IS NULL;
