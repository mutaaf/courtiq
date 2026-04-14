-- Migration 019: Observation highlights
-- Coaches can "star" their best observations to create a curated highlights
-- collection per player, shareable with parents and viewable in player detail.

ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS is_highlighted BOOLEAN NOT NULL DEFAULT FALSE;

-- Index so fetching highlighted observations per team/player is fast
CREATE INDEX IF NOT EXISTS idx_observations_highlighted
  ON observations (team_id, is_highlighted)
  WHERE is_highlighted = TRUE;
