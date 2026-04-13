-- Player Injury & Availability Tracker
-- Coaches record player availability status (available / limited / injured / sick / unavailable)
-- Only the most-recent record per player is "active" — history is preserved for trend view

CREATE TYPE availability_status AS ENUM (
  'available',
  'limited',
  'injured',
  'sick',
  'unavailable'
);

CREATE TABLE IF NOT EXISTS player_availability (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id          UUID NOT NULL REFERENCES teams(id)   ON DELETE CASCADE,
  status           availability_status NOT NULL DEFAULT 'available',
  reason           TEXT,                -- e.g. "Sprained ankle", "Family trip"
  expected_return  DATE,                -- optional return-to-play date
  notes            TEXT,                -- private coach notes
  created_by       UUID REFERENCES coaches(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_player_availability_player ON player_availability(player_id, created_at DESC);
CREATE INDEX idx_player_availability_team   ON player_availability(team_id,   created_at DESC);

-- RLS: coach must belong to the player's team
ALTER TABLE player_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage availability for their team players"
  ON player_availability
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM team_coaches tc
      WHERE tc.team_id = player_availability.team_id
        AND tc.coach_id = auth.uid()
    )
  );
