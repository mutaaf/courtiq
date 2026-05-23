-- Migration 037: coach_card_shares (ticket 0026)
--
-- A small share-mapping table for the public, coach-as-referrer surface at
-- /coach/[token]. Unlike team_card_shares (035, team_personality-scoped) and
-- season_recap_shares (036, season_summary-scoped), this card is scoped to the
-- COACH themselves — their standing identity surface — so the row references a
-- coach only, never a plan and never a player.
--
-- This collects NO data about minors: the row references a coach, never a player.
-- The public read (src/app/api/coach-card/[token]/route.ts) renders ONLY the
-- coach-level fields named in an allow-list (display_name, sports, age_groups) and
-- aggregate integer counts (weeks_coaching, practices_logged, players_observed)
-- derived from existing rows — no player name, jersey, or observation text ever
-- reaches the public payload. (AGENTS.md COPPA / data-minimization.)
--
-- Column / value counts are balanced; the version prefix 037 is unique (035 is
-- team_card_shares, 036 is season_recap_shares) so a fresh-CI-DB seed under
-- ON_ERROR_STOP=1 applies cleanly (LESSONS.md 2026-05-20 re: 0006 migration bugs).

CREATE TABLE IF NOT EXISTS coach_card_shares (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        NOT NULL UNIQUE,
  coach_id    UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public token resolution is the hot path (one lookup per page view).
CREATE INDEX IF NOT EXISTS idx_coach_card_shares_token
  ON coach_card_shares (token) WHERE is_active;

-- Reuse-or-create: look up a coach's existing active card (the create route
-- returns the existing active token rather than minting a second).
CREATE INDEX IF NOT EXISTS idx_coach_card_shares_coach
  ON coach_card_shares (coach_id, created_at DESC);
