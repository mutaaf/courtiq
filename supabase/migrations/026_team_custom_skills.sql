-- Migration 026: Team-scoped custom curriculum skills.
-- Coaches add skills on top of the global curriculum without forking it.
-- skill_id is a free-form slug, prefixed with `custom:` at write time so it
-- can never collide with a built-in `curriculum_skills.skill_id`.

CREATE TABLE IF NOT EXISTS team_custom_skills (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  skill_id           TEXT        NOT NULL,
  name               TEXT        NOT NULL,
  category           TEXT        NOT NULL,
  age_groups         TEXT[]      NOT NULL DEFAULT '{}',
  intro_week         INT,
  teaching_script    TEXT,
  progression_levels JSONB       NOT NULL DEFAULT
    '{"exploring":{"min_success_rate":0.25},"practicing":{"min_success_rate":0.50},"got_it":{"min_success_rate":0.75},"game_ready":{"min_success_rate":0.50,"context":"game_only"}}'::jsonb,
  -- Custom skills always sort after base skills (default 1000)
  sort_order         INT         NOT NULL DEFAULT 1000,
  created_by         UUID        NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_custom_skills_unique UNIQUE (team_id, skill_id),
  CONSTRAINT team_custom_skills_skill_id_prefix CHECK (skill_id LIKE 'custom:%'),
  CONSTRAINT team_custom_skills_intro_week_range CHECK (intro_week IS NULL OR (intro_week >= 1 AND intro_week <= 52))
);

CREATE INDEX IF NOT EXISTS idx_team_custom_skills_team
  ON team_custom_skills (team_id, sort_order);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_team_custom_skills_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_team_custom_skills_updated_at ON team_custom_skills;
CREATE TRIGGER trg_team_custom_skills_updated_at
  BEFORE UPDATE ON team_custom_skills
  FOR EACH ROW
  EXECUTE FUNCTION set_team_custom_skills_updated_at();
