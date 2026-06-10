-- Migration 068: coach_clone_reactivation_signals (ticket 0078)
--
-- The DORMANT-PUBLISHER reactivation-by-email primitive. One row
-- per (published coach, milestone) edge written when the existing
-- 0042 cron's new 0078 branch dispatches a reactivation email to
-- a dormant publishing coach whose 0073 / 0076 milestone row was
-- crossed in the last 24h.
--
-- The cron's per-coach cooldown lookup reads this table by
-- (published_coach_id, dispatched_at DESC) to enforce the
-- load-bearing 60-day anti-fatigue contract: a publishing coach
-- gets at most one reactivation email every 60 days even when
-- their published work is being cloned in many programs.
--
-- The UNIQUE (published_coach_id, milestone_id) constraint makes
-- the dispatch row idempotent across re-runs of the same cron in
-- the same window — the cron writes the row best-effort after a
-- successful sendEmail; a duplicate run is a no-op.
--
-- COPPA: nothing readable about minors is added by this table.
-- The table references coaches(id) and coach_reputation_milestones(id)
-- — both adult-only entities. The dispatched email body itself
-- contains the publishing coach's first name + the cloning PROGRAM
-- name + the cloned drill / plan title; NEVER the cloning coach's
-- name, NEVER a parent contact, NEVER a date of birth, NEVER a
-- jersey number, NEVER any per-minor identifier.
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
--   no relationship-label,
--   no observation text.
--
-- Tier posture: the dispatch row is universal (every tier including
-- free). Publishing is universal per 0049 / 0064; the reactivation
-- pull belongs to the publishing coach regardless of their current
-- tier (a free-tier publisher who shipped a drill in spring deserves
-- the signal as much as a paid-tier one — the email is not a tier
-- feature, it is a publish-graph consequence).
--
-- Migration prefix uniqueness (LESSONS#0006): 067 is taken by
-- drill_clone_stick_signals, so 068 is the next free prefix.
-- Confirmed via `ls supabase/migrations/` at pickup.

CREATE TABLE IF NOT EXISTS coach_clone_reactivation_signals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  published_coach_id  UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  milestone_id        UUID        NOT NULL REFERENCES coach_reputation_milestones(id) ON DELETE CASCADE,
  dispatched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (published_coach_id, milestone_id)
);

-- The cooldown lookup is keyed by the publishing coach with the most
-- recent dispatch first. A standard B-tree index on the descending
-- timestamp is the right shape — the cron's per-coach SELECT picks
-- the latest row with `.order('dispatched_at', { ascending: false })`
-- `.limit(1)`.
CREATE INDEX IF NOT EXISTS idx_coach_clone_reactivation_signals_cooldown
  ON coach_clone_reactivation_signals (published_coach_id, dispatched_at DESC);
