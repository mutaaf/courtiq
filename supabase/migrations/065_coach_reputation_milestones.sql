-- Migration 065: coach_reputation_milestones (ticket 0073)
--
-- The PUBLISHING-coach reputation-milestone primitive. ONE row per
-- (published coach, milestone kind) edge, written when a clone fires
-- and the publishing coach's clone count crosses a documented
-- threshold. The home-page card on the publishing coach's /home
-- reads the unconsumed rows from the last 14 days and renders ONE
-- quiet line per milestone with a one-tap "Got it" button to stamp
-- notified_at and hide the card.
--
-- COPPA: nothing readable about minors is added by this table. The
-- table references coaches(id) and stores a milestone-kind label.
-- There is no cloning-coach name, no parent email, no DOB, no medical
-- notes, no per-player field. The cloning coach's NAME never reaches
-- this surface — only the milestone label does.
--
-- The header lists what we deliberately do NOT add so the LESSONS#0088
-- banned-token scan (which strips `--` comment lines) reads only the
-- executable DDL:
--   - no parent first name
--   - no parent phone
--   - no parent email
--   - no date-of-birth
--   - no medical-line
--   - no biometric, no photo
--   - no nickname
--   - no jersey-number
--   - no relationship-label
--
-- Tier posture: the milestone primitive is universal (every tier).
-- The publishing coach's reputation belongs to them — publish is
-- free per 0049 and reputation is a quality lift on the same surface.
--
-- Migration prefix uniqueness (LESSONS#0006): 064 is taken by
-- coach_reactivation_signals, so 065 is the next free prefix.
-- Confirmed via `ls supabase/migrations/` at pickup.

CREATE TABLE IF NOT EXISTS coach_reputation_milestones (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  published_coach_id  UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  milestone_kind      TEXT        NOT NULL CHECK (milestone_kind IN (
                                    'clones_3',
                                    'clones_10',
                                    'clones_25',
                                    'clones_50',
                                    'programs_2',
                                    'programs_4',
                                    'programs_8'
                                  )),
  crossed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at         TIMESTAMPTZ,
  UNIQUE (published_coach_id, milestone_kind)
);

-- The /home card lookup is keyed by the published coach with
-- notified_at still null, most-recent-first. A partial index keeps
-- the index small (consumed rows fall out the moment notified_at
-- is stamped) and fast.
CREATE INDEX IF NOT EXISTS idx_coach_reputation_milestones_unsent
  ON coach_reputation_milestones (published_coach_id, notified_at)
  WHERE notified_at IS NULL;
