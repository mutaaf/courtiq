-- Extend the plans.type CHECK constraint allow-list to include
-- 'sideline_talking_points' (ticket 0046).
--
-- WHY: ticket 0046 adds POST /api/ai/sideline-talking-points which persists a
-- coach-private one-tap sideline cheat sheet — one row per rostered player,
-- two short lines per row, that the coach GLANCES at and SAYS to that
-- player's parent at half-time. The sheet is stored in the existing `plans`
-- table the same way every other AI artifact already is, so the only schema
-- change is widening the type CHECK to permit the new value. Without this,
-- the fresh-CI DB (ticket 0006 applies every migration on a clean Supabase
-- under ON_ERROR_STOP=1) rejects the insert and the seed/route would
-- 23514-fail.
--
-- This migration mirrors 041_plans_type_pregame_brief.sql exactly — drop + add
-- the same constraint name with the same value list, plus
-- 'sideline_talking_points'. No new column, no new table, no new minor-data
-- collection: the sheet is persisted in plans.content_structured as jsonb,
-- and the artifact's per-entry shape is strict (player_first_name only — no
-- surname, no DOB, no parent / medical field). The artifact is COACH-PRIVATE
-- by construction; there is no companion /share token route and the new plan
-- type is not added to any public allow-list.

alter table plans drop constraint if exists plans_type_check;

alter table plans add constraint plans_type_check check (type in (
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
  -- 0046 — coach-private sideline cheat sheet (one row per player, two lines)
  'sideline_talking_points'
));
