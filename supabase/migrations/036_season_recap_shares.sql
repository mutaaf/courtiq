-- Migration 036: season_recap_shares (ticket 0017)
--
-- A small share-mapping table for the public, coach-to-coach + coach-to-parent
-- referral surface at /season-recap/[token]. It maps a public token to ONE
-- season_summary plan and the coach who created the recap. parent_shares is
-- player-scoped; team_card_shares (migration 035) is team_personality-scoped —
-- neither fits a season-recap card, hence a dedicated table that mirrors the
-- team-card shape exactly.
--
-- This collects NO data about minors: the row references a plan + a coach, never
-- a player. The public read (src/app/api/season-recap/[token]/route.ts) renders
-- only the team-level content_structured fields named in PUBLIC_RECAP_FIELDS and
-- strips player_breakthroughs / per-player names. (AGENTS.md COPPA /
-- data-minimization.)
--
-- Column / value counts are balanced; the version prefix 036 is unique (035 is
-- team_card_shares) so a fresh-CI-DB seed under ON_ERROR_STOP=1 applies cleanly
-- (LESSONS.md 2026-05-20 re: 0006 migration bugs). plans_type_check already
-- allows 'season_summary' (migration 034) — no constraint change needed.

CREATE TABLE IF NOT EXISTS season_recap_shares (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        NOT NULL UNIQUE,
  plan_id     UUID        NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  coach_id    UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public token resolution is the hot path (one lookup per page view).
CREATE INDEX IF NOT EXISTS idx_season_recap_shares_token
  ON season_recap_shares (token) WHERE is_active;

-- Look up a coach's existing recaps (e.g. to reuse a token per plan).
CREATE INDEX IF NOT EXISTS idx_season_recap_shares_coach
  ON season_recap_shares (coach_id, created_at DESC);
