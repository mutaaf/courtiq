-- Migration 062: season_opener_shares (ticket 0068)
--
-- The first-touch parent-facing card. ONE table mapping a public token to
-- ONE team-coach pair plus the coach-authored focus_line for the season.
-- The public page at /opener/<token> reads this row and renders a single
-- screen the parents see on day 1 of the season: team name, sport, age
-- group, season label, the coach's first name, the focus line.
--
-- Mirrors 048_practice_plan_shares.sql header style; differs on (1) there
-- is NO is_active flag (the season opener is a season-durable surface,
-- not a per-share revocable token — every active row is crawler-reachable
-- by design; the sitemap reads every row); (2) the idempotency key is
-- (team_id, season_label) so a re-create UPDATES the existing row with a
-- fresh focus_line + a fresh token, never piles up dead rows for the same
-- team's same season.
--
-- COPPA: this table references a team + a coach. Never a child, a guardian,
-- a contact email, a date of birth, a medical line, a biometric — nothing
-- minor-specific. The public route's `.select()` is an explicit allow-list
-- (LESSONS#0036) that returns team-aggregate fields and the coach's first
-- name only. The header comment names the COPPA fields we deliberately do
-- NOT add so the LESSONS#0088 banned-token scan (which strips `--` comment
-- lines) still reads only DDL.
--
-- Migration prefix uniqueness (LESSONS#0006): 061 is taken by sub_handoffs,
-- so the next free prefix is 062. Confirmed via `ls supabase/migrations/`
-- at pickup.
--
-- parent_reactions.entity_type: NOT enum-constrained (the table has no
-- entity_type column at all — migration 023 keys reactions by share_token).
-- The opener page reuses the existing ParentReactionForm by threading the
-- season-opener share token as `shareToken`; this migration therefore does
-- NOT extend any CHECK constraint on parent_reactions (LESSONS#0054 family
-- — only widen when the constraint actually exists; LESSONS#0096 — schema
-- wins over the ticket's "entity_type" prose).

CREATE TABLE IF NOT EXISTS season_opener_shares (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  coach_id      UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  token         TEXT        NOT NULL UNIQUE,
  season_label  TEXT        NOT NULL,
  focus_line    TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, season_label)
);

-- Public token resolution is the hot path (every visit to /opener/<token>).
CREATE INDEX IF NOT EXISTS idx_season_opener_shares_token
  ON season_opener_shares (token);
