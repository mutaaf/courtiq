-- Migration 022: Team announcements
-- Coaches post short updates (practice cancelled, bring water, etc.) that
-- appear at the top of the parent portal for any player on that team.
-- expires_at is optional — NULL means "show indefinitely".

CREATE TABLE IF NOT EXISTS team_announcements (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by  UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by team + recency. The "non-expired" filter happens at query
-- time (a partial-index predicate using NOW() is rejected because NOW() is
-- not IMMUTABLE).
CREATE INDEX IF NOT EXISTS idx_team_announcements_team_recent
  ON team_announcements (team_id, created_at DESC);
