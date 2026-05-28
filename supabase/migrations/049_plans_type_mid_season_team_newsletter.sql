-- Migration 049: plans.type allow-list + team_card_shares.type column-add
-- (ticket 0043)
--
-- WHY: ticket 0043 adds POST /api/ai/mid-season-team-newsletter which persists
-- a new TEAM-WIDE mid-season parent-newsletter artifact (five short blocks the
-- coach taps once and sends to every parent at once). The artifact is stored
-- in the existing `plans` table exactly like every other AI artifact already
-- is, so the only schema changes are:
--
--  1) WIDEN `plans_type_check` to permit the new value
--     'mid_season_team_newsletter'. Without this, the fresh-CI DB (ticket 0006
--     applies every migration on a clean Supabase under ON_ERROR_STOP=1)
--     rejects the insert with 23514 and the seed/route would fail.
--     Mirrors 034_plans_type_check_align.sql and 041_plans_type_pregame_brief.sql
--     exactly — drop + add the same constraint name with the full value list,
--     plus the new value.
--
--  2) ADD a nullable `type TEXT NULL DEFAULT 'team_card'` column to the
--     existing `team_card_shares` table (created in 035_team_card_shares.sql)
--     so the newsletter share can ride on the SAME share-mapping table
--     instead of needing a brand-new shares table. The default 'team_card'
--     pins existing rows to their original meaning (a coach-to-coach
--     referral card); the route writes the value 'mid_season_team_newsletter'
--     on new newsletter share rows, and the public reader pins the
--     resolution to .eq('type', 'mid_season_team_newsletter') so the two
--     share kinds can never cross.
--
-- No new table. No new column on plans. No widening of what the product
-- collects on minors — the newsletter is about the TEAM by construction
-- (the prompt forbids per-player blocks; the zod schema has no place to
-- put a player name) so the existing content_structured jsonb column is
-- the only data surface.
--
-- Migration prefix uniqueness: 049 is the next free prefix after the 0049
-- 048_practice_plan_shares.sql (LESSONS#0006 — coordinate prefix). Column /
-- value counts on every statement below are balanced (LESSONS#0006).

ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_type_check;

ALTER TABLE plans ADD CONSTRAINT plans_type_check CHECK (type IN (
  -- legacy types (001_schema.sql + 009_add_newsletter_plan_type.sql)
  'practice', 'gameday', 'weekly', 'development_card',
  'parent_report', 'report_card', 'custom', 'newsletter',
  -- AI-generated artifact types written by src/app/api/ai/*
  'weekly_star', 'player_of_match', 'skill_challenge', 'player_messages',
  'season_summary', 'season_awards', 'season_storyline', 'season_letter',
  'game_recap', 'huddle_script', 'team_talk', 'team_personality',
  'team_group_message', 'practice_arc', 'coach_reflection',
  -- 0040 — pre-game brief
  'pregame_brief',
  -- 0043 — mid-season team newsletter. A TEAM-wide five-block parent
  -- newsletter (headline + arc_summary + 2 strengths + 2 focus areas +
  -- 1 coach-voice quote). Opponent-shaped data is not involved; the
  -- artifact is the team's own arc over the middle of the season.
  -- Per-player blocks are forbidden by the prompt AND structurally
  -- impossible under the zod schema, so no widening of minor-data
  -- collection follows from this CHECK extension.
  'mid_season_team_newsletter'
));

-- Add the share-type discriminator. Default 'team_card' so every existing
-- row (the 0010 coach-to-coach referral cards) keeps its original meaning
-- without a backfill. The newsletter share writes
-- 'mid_season_team_newsletter' on insert, and the public reader filters
-- on this column so the two share kinds can never cross. Nullable on add
-- to be defensive against any in-flight insert that omits it.
ALTER TABLE team_card_shares
  ADD COLUMN IF NOT EXISTS type TEXT NULL DEFAULT 'team_card';
