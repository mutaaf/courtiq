-- Parent reactions: parents can send appreciation/messages to coaches from the report card portal
CREATE TABLE IF NOT EXISTS parent_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  share_token TEXT NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES coaches(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT '❤️',
  message TEXT,
  parent_name TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parent_reactions_team_id_idx ON parent_reactions(team_id);
CREATE INDEX IF NOT EXISTS parent_reactions_coach_id_idx ON parent_reactions(coach_id);
CREATE INDEX IF NOT EXISTS parent_reactions_created_at_idx ON parent_reactions(created_at DESC);
CREATE INDEX IF NOT EXISTS parent_reactions_is_read_idx ON parent_reactions(is_read) WHERE is_read = FALSE;
