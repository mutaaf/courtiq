-- Extend the plans.type CHECK constraint allow-list to include 'pregame_brief'
-- (ticket 0040).
--
-- WHY: ticket 0040 adds POST /api/ai/pregame-brief which persists a new
-- coach-private artifact — a four-section pre-game brief synthesized from an
-- opponent_profile plan + the team's last 4 weeks of observations + the
-- coach's signature. The brief is stored in the existing `plans` table the
-- same way every other AI artifact already is, so the only schema change is
-- widening the type CHECK to permit the new value. Without this, the fresh-CI
-- DB (ticket 0006 applies every migration on a clean Supabase under
-- ON_ERROR_STOP=1) rejects the insert and the seed/route would 23514-fail.
--
-- This migration mirrors 034_plans_type_check_align.sql exactly — drop + add
-- the same constraint name with the same value list, plus 'pregame_brief'. No
-- new column, no new table, no new minor-data collection. The brief is about
-- the OPPONENT and the TEAM by design (the prompt forbids per-player blocks)
-- so the existing content_structured jsonb column is the only data surface.

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
  -- 0040 — pre-game brief (a four-section synthesis of an opponent_profile
  -- plan + this team's last 4 weeks of observations). Opponent + team only;
  -- never per-player by construction.
  'pregame_brief'
));
