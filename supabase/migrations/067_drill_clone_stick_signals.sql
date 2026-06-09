-- Migration 067: drill_clone_stick_signals (ticket 0076)
--
-- The CLONE-STICK primitive. One row per (drill_share, cloning coach)
-- edge written when the cloner thumbs-up the drill they previously
-- cloned (a 0044 coach_drill_signals row with rating='up' signaled
-- AFTER the drill_share_clones row).
--
-- The signal — distinct from the raw clone — is "the cloning coach
-- ran the drill on a real court AND it worked for them". The 0073
-- league-discovery surface re-ranks by this signal so a drill that
-- stuck in 3 programs out-ranks a drill that was downloaded by 12
-- programs but stuck in zero; the milestone hook fires the
-- publishing coach's stuck_1 / stuck_3 / stuck_8 home-card.
--
-- COPPA: nothing readable about minors is added by this table. The
-- table references drill_shares(id), coaches(id), organizations(id)
-- — all adult-only entities. There is no cloning-coach name, no
-- parent email, no DOB, no jersey, no medical note. The publisher's
-- home card renders the cloning PROGRAM name (NOT the cloning coach's
-- name) — same consent posture as the existing 0073 milestone.
--
-- The header lists what we deliberately do NOT add so the
-- LESSONS#0088 banned-token scan (which strips `--` comment lines)
-- reads only the executable DDL:
--   no jersey,
--   no nickname,
--   no parent first name,
--   no parent phone,
--   no parent email,
--   no date-of-birth,
--   no medical-line,
--   no biometric, no photo,
--   no relationship-label.
--
-- Tier posture: the stick signal is universal (every tier including
-- free). Cloning is universal; the publishing coach's reputation
-- belongs to them; the stick signal is the deeper credibility that
-- makes the rank trustable.
--
-- Migration prefix uniqueness (LESSONS#0006): 066 is taken by
-- referral_credit_grants, so 067 is the next free prefix.
-- Confirmed via `ls supabase/migrations/` at pickup.

CREATE TABLE IF NOT EXISTS drill_clone_stick_signals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_share_id  UUID        NOT NULL REFERENCES drill_shares(id) ON DELETE CASCADE,
  cloner_coach_id UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  cloner_org_id   UUID        NULL REFERENCES organizations(id) ON DELETE SET NULL,
  stuck_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (drill_share_id, cloner_coach_id)
);

-- Publisher-side rollup query — "how many programs has my drill
-- stuck in this month".
CREATE INDEX IF NOT EXISTS idx_drill_clone_stick_signals_share
  ON drill_clone_stick_signals (drill_share_id, stuck_at DESC);

-- Widen the existing 0073 coach_reputation_milestones.milestone_kind
-- CHECK constraint to include the three NEW stuck-kind values. Done
-- atomically as a DROP + ADD so the existing rows do not need a
-- one-off backfill.
ALTER TABLE coach_reputation_milestones
  DROP CONSTRAINT IF EXISTS coach_reputation_milestones_milestone_kind_check;

ALTER TABLE coach_reputation_milestones
  ADD CONSTRAINT coach_reputation_milestones_milestone_kind_check
  CHECK (milestone_kind IN (
    'clones_3',
    'clones_10',
    'clones_25',
    'clones_50',
    'programs_2',
    'programs_4',
    'programs_8',
    'stuck_1',
    'stuck_3',
    'stuck_8'
  ));
