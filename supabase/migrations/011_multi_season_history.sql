-- Multi-Season History
-- Coaches can archive a completed season, capturing a snapshot of the team's
-- state (player proficiencies, session/observation counts) at that point in
-- time. Archives are immutable once created.

CREATE TABLE IF NOT EXISTS season_archives (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id       UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  coach_id      UUID        NOT NULL REFERENCES coaches(id) ON DELETE SET NULL,
  season_name   TEXT        NOT NULL,            -- e.g. "Spring 2026"
  start_date    DATE,
  end_date      DATE,
  session_count INTEGER     NOT NULL DEFAULT 0,
  observation_count INTEGER NOT NULL DEFAULT 0,
  player_count  INTEGER     NOT NULL DEFAULT 0,
  -- JSON snapshot: array of { player_id, player_name, skills: [{ name, level, trend }] }
  player_snapshot JSONB     NOT NULL DEFAULT '[]',
  notes         TEXT,
  archived_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS season_archives_org_idx  ON season_archives(org_id);
CREATE INDEX IF NOT EXISTS season_archives_team_idx ON season_archives(team_id);
