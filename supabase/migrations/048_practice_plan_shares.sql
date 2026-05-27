-- Migration 048: practice_plan_shares + plans.source_plan_id (ticket 0049)
--
-- The publish/clone-a-practice-plan moat. Two pieces of schema:
--
-- 1) practice_plan_shares — a small share-mapping table that maps a public
--    token to ONE practice plan and the publishing coach. The public page at
--    /plan/<token> reads via this token; a clone POST creates a fresh plans
--    row on the cloning coach's team. Mirrors team_card_shares (035) /
--    season_recap_shares (036) / game_recap_shares (038) byte-for-byte where
--    applicable, with the addition of a nullable `note` column for the
--    publisher's optional one-line context.
--
-- 2) plans.source_plan_id — a nullable self-FK on plans. A cloned plan stamps
--    this to the SOURCE plan's id so the publisher's home card can count
--    clones of their own plans. The publisher never learns who cloned (only
--    the aggregate count) — this column carries attribution, not identity.
--
-- COPPA: practice_plan_shares references a plan + a coach, never a player.
-- The public read (src/app/api/practice-plan-shares/[token]/route.ts) pins
-- type='practice' so even a future plan type that embedded a minor name
-- could not cross. There is no name-similarity, no biometric, no observation
-- data here — only the FK to the team-level practice plan and the publishing
-- coach's id.
--
-- Migration prefix uniqueness: 048 is the next free prefix after 0048's
-- 047_plans_type_postgame_parent_texts.sql (LESSONS#6 — coordinate prefix).
-- Column / value counts on every insert below are balanced (LESSONS#6).

CREATE TABLE IF NOT EXISTS practice_plan_shares (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        NOT NULL UNIQUE,
  plan_id     UUID        NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  coach_id    UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  note        TEXT        NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public token resolution is the hot path (one lookup per page view).
CREATE INDEX IF NOT EXISTS idx_practice_plan_shares_token
  ON practice_plan_shares (token) WHERE is_active;

-- Look up a coach's existing shares (most-recent-first) for the publisher's
-- "your published plans" listing and the clone-count rollup.
CREATE INDEX IF NOT EXISTS idx_practice_plan_shares_coach
  ON practice_plan_shares (coach_id, created_at DESC);

-- A cloned plan stamps source_plan_id to the SOURCE plan's id (attribution).
-- Nullable so every existing plan keeps source_plan_id IS NULL. ON DELETE SET
-- NULL because losing the source plan must NOT cascade-delete the cloned
-- plan the cloner is running — the clone is an independent fresh draft.
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS source_plan_id UUID NULL
    REFERENCES plans(id) ON DELETE SET NULL;

-- Index the publisher's "who cloned my plans" rollup: count clones in the
-- last 7 days grouped by source_plan_id. The PARTIAL predicate (only rows
-- whose source_plan_id IS NOT NULL) keeps the index small even at scale.
CREATE INDEX IF NOT EXISTS idx_plans_source_plan_id
  ON plans (source_plan_id, created_at DESC) WHERE source_plan_id IS NOT NULL;
