-- Migration 057: player_trajectories (ticket 0061)
--
-- The "Week 1 vs now" cache row the per-player trajectory route writes once
-- per (player_id, observation_count_bucket). One row holds the AI-derived
-- started/now sentences and up to three turning-point references; the route
-- reads observations on cache miss, calls callAIWithJSON, and upserts here.
-- Subsequent reads in the same bucket return the cached row at zero AI cost.
--
-- COPPA approval trail (the contract this row is gated against):
--   * NO new column on the `players` table. The cache lives ONLY here and
--     references player_id with ON DELETE CASCADE so a hard player delete
--     reaps the row.
--   * NO parent_email column. Parent contact lives on `players` only.
--   * NO parent_phone column. Phone numbers live on `players` only.
--   * NO date_of_birth column. DOBs live on `players` only and never ride
--     on this artifact.
--   * NO medical_notes column. Medical data lives on `players` only.
--   * The `started` and `now` jsonb fields hold first-name-only sentences
--     (the route's input adapter filters to first name at the boundary);
--     no last name ever lands in the cache.
--
-- Bucket sizing: bucket = floor(observationCount / 3) * 3. The cache row
-- stays valid until the player accrues three more observations; that bucket
-- advance is the SOLE invalidation mechanism (no manual regenerate button,
-- per the ticket's out-of-scope section).
--
-- Idempotency: UNIQUE (player_id, observation_count_bucket). A second call
-- in the same bucket hits the cache; a route-level upsert is safe.
--
-- Migration prefix uniqueness: 057 is the next free prefix after
-- 056_parent_initiated_invites.sql (LESSONS#0006). The ticket prose said
-- 056 but 0060 claimed it first; the file frontmatter's implementation log
-- records the bump.
--
-- LESSONS#0088: the migration-content vitest strips `--` comment lines
-- before scanning, so the COPPA documentation above never trips the
-- banned-token scan that lives on the executable DDL.

CREATE TABLE IF NOT EXISTS player_trajectories (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id                   UUID         NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  observation_count_bucket    INT          NOT NULL,
  started                     JSONB        NOT NULL,
  now                         JSONB        NOT NULL,
  turning_points              JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT player_trajectories_bucket_uniq
    UNIQUE (player_id, observation_count_bucket)
);

-- Hot path: the route's cache lookup keys on (player_id, bucket); the
-- UNIQUE constraint already covers the read, but the index is named here
-- explicitly for clarity in EXPLAIN output and to mirror the 055 posture.
CREATE INDEX IF NOT EXISTS idx_player_trajectories_player_bucket
  ON player_trajectories (player_id, observation_count_bucket);

-- The per-coach 30-day free-tier preview gate. One row per VIEW, never per
-- generation. A coach's view is recorded regardless of cache hit/miss so the
-- 30-day preview wall stays consistent. The (coach_id, player_id) lookup
-- with a viewed_at filter is the hot read.
CREATE TABLE IF NOT EXISTS player_trajectory_views (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    UUID         NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id   UUID         NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_trajectory_views_coach_player
  ON player_trajectory_views (coach_id, player_id, viewed_at DESC);
