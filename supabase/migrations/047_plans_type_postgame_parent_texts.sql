-- Extend the plans.type CHECK constraint allow-list to include
-- 'postgame_parent_texts' (ticket 0048).
--
-- WHY: ticket 0048 adds POST /api/ai/postgame-parent-texts which persists a
-- coach-private list of one short text per rostered player that the coach
-- can long-press, copy, and paste into that player's parent's Messages
-- thread on the drive home from a just-finished game. The artifact is the
-- post-game complement to the 0046 sideline cheat sheet, scoped to a single
-- session (the in-progress game). It is stored in the existing `plans`
-- table the same way every other AI artifact already is, so the only schema
-- change is widening the type CHECK to permit the new value. Without this,
-- the fresh-CI DB (ticket 0006 applies every migration on a clean Supabase
-- under ON_ERROR_STOP=1) rejects the insert and the seed/route would
-- 23514-fail.
--
-- This migration mirrors 044_plans_type_sideline_talking_points.sql exactly
-- — drop + add the same constraint name with the same value list, plus
-- 'postgame_parent_texts'. No new column, no new table, no new minor-data
-- collection: the texts are persisted in plans.content_structured as jsonb,
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
  'sideline_talking_points',
  -- 0048 — coach-private post-game parent texts (one row per player, one SMS-sized line)
  'postgame_parent_texts'
));
