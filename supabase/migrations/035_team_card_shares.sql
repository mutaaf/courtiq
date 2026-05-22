-- Migration 035: team_card_shares (ticket 0010)
--
-- A small share-mapping table for the public, coach-to-coach referral surface at
-- /team-card/[token]. It maps a public token to ONE team_personality plan and the
-- coach who created the card. parent_shares is player-scoped (it carries
-- player_id + per-section include_* flags), so it is not a fit for a team-level,
-- referral-oriented card — hence a dedicated table.
--
-- This collects NO data about minors: the row references a plan + a coach, never
-- a player. The public read (src/app/api/team-card/[token]/route.ts) renders only
-- team-level content_structured fields. (AGENTS.md COPPA / data-minimization.)
--
-- Column / value counts are balanced; the version prefix 035 is unique
-- (LESSONS.md 2026-05-20 re: 0006 migration bugs).

CREATE TABLE IF NOT EXISTS team_card_shares (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        NOT NULL UNIQUE,
  plan_id     UUID        NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  coach_id    UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public token resolution is the hot path (one lookup per page view).
CREATE INDEX IF NOT EXISTS idx_team_card_shares_token
  ON team_card_shares (token) WHERE is_active;

-- Look up a coach's existing cards (e.g. to reuse a token per plan).
CREATE INDEX IF NOT EXISTS idx_team_card_shares_coach
  ON team_card_shares (coach_id, created_at DESC);
