-- Migration 039: cross-season player development memory (ticket 0034)
--
-- Adds a single nullable self-referential pointer on `players` linking a returning
-- player to their PRIOR-SEASON players row, so the parent report can thread the
-- coach's own prior-season report as cross-season continuity context.
--
-- COPPA / data-minimization: this column collects NO new information ABOUT the
-- minor. It is a pointer between two `players` rows the coach already created
-- (the explicit, coach-confirmed "same player as last season?" link). There is no
-- name-similarity, DOB-match, biometric, or photo-match data here — only the FK.
-- An existing player has prior_player_id = NULL and behaves exactly as before.
--
-- ON DELETE SET NULL: if the prior-season player row is ever deleted, the link
-- quietly clears rather than cascading a deletion onto the current-season player.
--
-- Unique version prefix 039 (next free after 038_game_recap_shares); the CLI keys
-- applied migrations on the leading <version>_ token, so a unique prefix avoids the
-- schema_migrations duplicate-key class of failure (LESSONS.md 2026-05-20).

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS prior_player_id UUID NULL
    REFERENCES players (id) ON DELETE SET NULL DEFAULT NULL;

-- Partial index for the route's prior-link lookups (only the linked rows).
CREATE INDEX IF NOT EXISTS idx_players_prior_player_id
  ON players (prior_player_id)
  WHERE prior_player_id IS NOT NULL;
