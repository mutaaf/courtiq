-- Migration 027: onboarding flags
-- players.is_sample marks rows seeded by "Try with sample players" so they can be
-- filtered out of parent-share + public/portal endpoints (real-roster-only).
-- teams.is_demo marks the throwaway team created by /onboarding/demo so its data
-- can be hidden once the coach starts a real team.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_players_active_real
  ON players (team_id, is_active)
  WHERE is_active = TRUE AND is_sample = FALSE;
