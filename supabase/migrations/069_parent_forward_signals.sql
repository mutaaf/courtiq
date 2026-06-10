-- Migration 069: parent_forward_signals (ticket 0079)
--
-- The PARENT-TO-PARENT-ON-SAME-TEAM forward primitive. One row per
-- (sender_player, recipient_player) edge written when a parent on the
-- team forwards this week's parent-portal report to another parent on
-- the SAME team. The receiving parent lands on her OWN kid's portal
-- session for HER own kid (NOT the sender's), entering the existing
-- parent-portal viral graph (0019 / 0050 / 0060) the coach already
-- shipped for that kid.
--
-- The signal — distinct from the email itself — is the durable
-- attribution edge. Downstream surfaces (0072 returning-parent rollup,
-- 0050 director-handoff signal aggregation) credit the originating
-- parent through this row WITHOUT ever reading the email body, the
-- sender's first name, or the recipient's contact info.
--
-- COPPA: nothing readable about minors or their parents is added by
-- this table. The two FKs point at players(id) and teams(id) — opaque
-- ids only. There is no sender name, no sender email, no recipient
-- name, no recipient email, no recipient phone, no note body, no
-- subject line, no date-of-birth, no jersey, no medical line, no
-- biometric, no photo, no relationship label, no nickname. The
-- email's transient body lives only in the dispatch payload and is
-- forgotten the moment the mail pipeline acks.
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
--   no note body.
--
-- Tier posture: the forward action is universal (every parent on
-- every report sees it regardless of the coach's tier). The parent-
-- portal surface is the only product surface not gated by tier.
--
-- Migration prefix uniqueness (LESSONS#0006): 068 is taken by
-- coach_clone_reactivation_signals, so 069 is the next free prefix.
-- Confirmed via `ls supabase/migrations/` at pickup.

CREATE TABLE IF NOT EXISTS parent_forward_signals (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_player_id     UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recipient_player_id  UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id              UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  dispatched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at            TIMESTAMPTZ NULL,
  UNIQUE (sender_player_id, recipient_player_id)
);

-- Team-scoped rollup index — "how many forwards have fired on this
-- team this week" feeds the existing 0050 / 0072 attribution surfaces
-- passively (no new coach-side UI lands in v1).
CREATE INDEX IF NOT EXISTS idx_parent_forward_signals_team
  ON parent_forward_signals (team_id, dispatched_at DESC);
