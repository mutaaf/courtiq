-- Migration 029: team archive / read-only state for graceful downgrades.
--
-- When a paid coach with N teams cancels and falls back to free (1 team
-- max), we don't want to silently hide teams 2..N. Instead we mark the
-- excess teams `archived_at = NOW()` so the dashboard still lists them as
-- read-only with a "reactivate by upgrading" CTA. After 30 days a sweeper
-- can hard-archive them (out of scope for this migration; flag only).

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Existing index covers (org_id) lookups; add a partial index on the active
-- subset to speed the most common query path (live teams for an org).
CREATE INDEX IF NOT EXISTS idx_teams_org_live
  ON teams (org_id, created_at DESC)
  WHERE archived_at IS NULL;
