-- Align the plans.type CHECK constraint with the plan types the app actually
-- writes (ticket 0009).
--
-- WHY: the constraint was last touched in 009_add_newsletter_plan_type.sql and
-- only permits 8 legacy types (…'newsletter'). Since then the AI routes under
-- src/app/api/ai/* have shipped many new plan types — weekly_star,
-- player_of_match, skill_challenge, player_messages, season_*, game_recap,
-- huddle_script, team_*, practice_arc, coach_reflection — that the stale check
-- would reject. The hosted DB tolerated these out-of-band, but the CI e2e job
-- (ticket 0006) applies every tracked migration to a fresh DB, so the
-- player_of_match spotlight row the share-flow seed needs would be rejected by
-- the old constraint and abort the seed under ON_ERROR_STOP=1.
--
-- This is a constraint reconciliation, not new data collection: no new columns,
-- no minor-data widening, no new table. It only widens the allowed `type`
-- enumeration to match existing route behavior so the seeded spotlight inserts.

ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_type_check;

ALTER TABLE plans ADD CONSTRAINT plans_type_check CHECK (type IN (
  -- legacy types (001_schema.sql + 009_add_newsletter_plan_type.sql)
  'practice', 'gameday', 'weekly', 'development_card',
  'parent_report', 'report_card', 'custom', 'newsletter',
  -- AI-generated artifact types written by src/app/api/ai/*
  'weekly_star', 'player_of_match', 'skill_challenge', 'player_messages',
  'season_summary', 'season_awards', 'season_storyline', 'season_letter',
  'game_recap', 'huddle_script', 'team_talk', 'team_personality',
  'team_group_message', 'practice_arc', 'coach_reflection'
));
