-- Migration 056: parent_initiated_invites (ticket 0060)
--
-- The dedupe table the new POST /api/share/[token]/sibling-invite route
-- writes to when a parent reading kid A's report taps "Invite Sofia's
-- coach with one tap." One row per (from_share_token, to_coach_email) per
-- 30-day window so a re-tap on the same surface to the same coach skips
-- the second email; one row counts against the rolling 7-day rate-limit
-- of 3 invites per share token so a leaked token cannot bulk-spam coach
-- inboxes.
--
-- Mirrors the byte-for-byte posture of 048_practice_plan_shares.sql:
-- numbered prefix the next free integer after 055_player_handoffs.sql
-- (LESSONS#6); CREATE TABLE IF NOT EXISTS for idempotency; partial index
-- on the hot lookup; explicit ON DELETE SET NULL on `from_player_id` so
-- a soft-released player on the inviting team's roster never cascades a
-- delete of the audit row this dedupe leans on.
--
-- COPPA posture (the contract this row is gated against):
--   * NO parent_email column. The matched email lives ONLY on
--     `players.parent_email` and is resolved at request time; this audit
--     row carries `to_coach_email` (the coach the parent typed in the
--     sheet), never the parent's own address.
--   * NO parent_phone column. Phone numbers live on `players` only.
--   * NO date_of_birth column. DOBs live on `players` only.
--   * NO sibling_last_name column. The candidate-lookup route strips
--     `players.name` to its first space-delimited token before returning
--     it; the parent edits that token in the sheet; this row stores ONLY
--     the parent-typed first name (the parent authored it — it is not
--     server-lifted from a `players` row at insert time).
--   * NO observation excerpt, NO age_group, NO position. Coach-only data.
--
-- Voice / instruct positively (LESSONS#0023):
--   This header names the absent columns to record the COPPA boundary in
--   the migration trail; the migration's no-banned-token vitest scan
--   strips `--` comments first (LESSONS#0088) so the explanatory list
--   never trips its own gate.

CREATE TABLE IF NOT EXISTS parent_initiated_invites (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_share_token    TEXT        NOT NULL,
  from_player_id      UUID        NULL REFERENCES players(id) ON DELETE SET NULL,
  to_coach_email      TEXT        NOT NULL,
  sibling_first_name  TEXT        NULL,
  program_id          UUID        NULL REFERENCES organizations(id) ON DELETE SET NULL,
  referral_code       TEXT        NULL,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedupe + rate-limit lookups: the hot path is
-- `(from_share_token, to_coach_email)` ordered by sent_at descending so a
-- re-tap can short-circuit on the most-recent prior row.
CREATE INDEX IF NOT EXISTS idx_parent_initiated_invites_dedupe
  ON parent_initiated_invites (from_share_token, to_coach_email, sent_at DESC);

-- The rolling 7-day rate-limit reads count by share token; a separate
-- partial index keeps the count query lean.
CREATE INDEX IF NOT EXISTS idx_parent_initiated_invites_rate
  ON parent_initiated_invites (from_share_token, sent_at DESC);
