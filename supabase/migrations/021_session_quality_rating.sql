-- Migration 021: Session quality rating
-- Coaches rate each session 1–5 stars after it ends, creating a simple
-- self-assessment dataset that feeds the analytics quality trend card.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS quality_rating INTEGER
    CHECK (quality_rating BETWEEN 1 AND 5);

-- Fast lookup: average quality per team, rated sessions only
CREATE INDEX IF NOT EXISTS idx_sessions_quality_rating
  ON sessions (team_id, quality_rating)
  WHERE quality_rating IS NOT NULL;
