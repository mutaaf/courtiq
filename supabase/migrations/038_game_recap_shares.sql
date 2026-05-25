-- Migration 038: game_recap_shares (ticket 0027)
--
-- A small share-mapping table for the public, coach-to-parent + coach-to-coach
-- referral surface at /recap/[token]. It maps a public token to ONE game_recap
-- plan and the coach who created the recap. parent_shares is player-scoped;
-- team_card_shares (035) is team_personality-scoped; season_recap_shares (036) is
-- season_summary-scoped; coach_card_shares (037) is coach-scoped — none fits a
-- game-recap card, hence a dedicated table that mirrors the season-recap shape
-- exactly.
--
-- This collects NO data about minors: the row references a plan + a coach, never
-- a player. The public read (src/app/api/recap-card/[token]/route.ts) renders
-- only the team-level content_structured fields named in PUBLIC_RECAP_FIELDS and
-- strips player_highlights (which carry player_name + per-player stat lines).
-- (AGENTS.md COPPA / data-minimization.)
--
-- Column / value counts are balanced; the version prefix 038 is unique (035 is
-- team_card_shares, 036 is season_recap_shares, 037 is coach_card_shares) so a
-- fresh-CI-DB seed under ON_ERROR_STOP=1 applies cleanly (LESSONS.md 2026-05-20
-- re: 0006 migration bugs). plans_type_check already allows 'game_recap'
-- (migration 034) — no constraint change needed.

CREATE TABLE IF NOT EXISTS game_recap_shares (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        NOT NULL UNIQUE,
  plan_id     UUID        NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  coach_id    UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public token resolution is the hot path (one lookup per page view).
CREATE INDEX IF NOT EXISTS idx_game_recap_shares_token
  ON game_recap_shares (token) WHERE is_active;

-- Look up a coach's existing recaps (e.g. to reuse a token per plan).
CREATE INDEX IF NOT EXISTS idx_game_recap_shares_coach
  ON game_recap_shares (coach_id, created_at DESC);
