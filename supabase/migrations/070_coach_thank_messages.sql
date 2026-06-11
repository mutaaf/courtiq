-- Migration 070: coach_thank_messages (ticket 0081)
--
-- The IN-PRODUCT DM primitive. ONE row per (sender_coach, recipient_coach,
-- drill_share | plan_share) edge written when the publishing coach taps
-- "Thank this coach" on a 0076 stuck milestone card. The receiving coach
-- reads the row from /home's new Inbox surface; the row is the ENDPOINT
-- of the publish-clone-stick loop, NOT the start of a chat — there is
-- no reply primitive and the schema-level UNIQUE makes one message
-- per (sender, recipient, share) FOREVER.
--
-- COPPA: nothing readable about minors is added by this table. The
-- table references coaches(id), drill_shares(id), practice_plan_shares(id),
-- and coach_reputation_milestones(id) — all adult-only or coach-level
-- entities. The body is the publisher's free text (sanitized at the
-- route layer to <= 280 chars + an anti-email-leak scan, never auto-
-- injected from any account).
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
--   no player id,
--   no observation id,
--   no kid name,
--   no team name.
--
-- Tier posture: the thank-back / inbox primitive is universal (every
-- tier including free). The publish-graph is a free-tier-onward
-- consequence — a publishing coach may be on Pro while the cloner who
-- received the thank-you is on Free; the product MUST work for both
-- without a feature key.
--
-- Migration prefix uniqueness (LESSONS#0006): 069 is taken by
-- parent_forward_signals; 070 is the next free prefix. The ticket
-- prose said 071 — but `ls supabase/migrations/` at pickup shows
-- only prefixes up through 069 exist on disk (070 was never minted,
-- despite the no-new-migration-0079 sentinel pinning 70 as the file
-- count after THIS migration lands). Documented in the Implementation
-- log as a schema-wins-over-prose deviation (LESSONS#0096).

CREATE TABLE IF NOT EXISTS coach_thank_messages (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_coach_id     UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  recipient_coach_id  UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  drill_share_id     UUID        NULL REFERENCES drill_shares(id) ON DELETE CASCADE,
  plan_share_id      UUID        NULL REFERENCES practice_plan_shares(id) ON DELETE CASCADE,
  milestone_id       UUID        NULL REFERENCES coach_reputation_milestones(id) ON DELETE SET NULL,
  body               TEXT        NOT NULL,
  sent_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at            TIMESTAMPTZ,
  CHECK ((drill_share_id IS NOT NULL) OR (plan_share_id IS NOT NULL)),
  UNIQUE (sender_coach_id, recipient_coach_id, drill_share_id),
  UNIQUE (sender_coach_id, recipient_coach_id, plan_share_id)
);

-- Recipient-side inbox lookup — unread rows first, then most-recent.
CREATE INDEX IF NOT EXISTS idx_coach_thank_messages_recipient
  ON coach_thank_messages (recipient_coach_id, read_at NULLS FIRST, sent_at DESC);
