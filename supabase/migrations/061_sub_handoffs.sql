-- Migration 061: sub_handoffs (ticket 0067)
--
-- The substitute-coach Tuesday-night handoff. ONE table mapping a public
-- observer token to ONE session-coach pair, with three include-flag booleans
-- that drive what the public /sub/<token> page renders, plus the sub's
-- one-line note back to the regular coach (sub-authored at submit time,
-- voice-scanned at the route, capped at 500 chars).
--
-- Mirrors 048_practice_plan_shares.sql header style; differs on (1) the
-- token is the EXISTING 24h observer token (HMAC, validated via
-- src/lib/observer-utils.ts), not a randomBytes hex; (2) the row carries
-- the sub-authored short text directly (no second table), since the
-- one-way return note is one short string, not an artifact.
--
-- COPPA: this table references a session + a coach. Never a child, a
-- guardian, a contact email, a date of birth, a medical line, a biometric,
-- nothing minor-specific. The public route's `.select()` is an explicit
-- allow-list that returns first names only (LESSONS#0036), and the route
-- NEVER joins to the guardian columns on the children's roster table even
-- when sourcing the eyes-on-watch line — only the most-recent coach-
-- authored observation text is surfaced.
--
-- Migration prefix uniqueness (LESSONS#0006): 059 is taken by drill_shares,
-- 060 is taken by coach_director_contacts, so the next free prefix is 061.
-- The header comment names the COPPA fields we deliberately do NOT add so
-- the LESSONS#0088 banned-token scan (which strips `--` comment lines)
-- still reads only DDL.

CREATE TABLE IF NOT EXISTS sub_handoffs (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                  UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  coach_id                    UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  observer_token              TEXT        NOT NULL,
  sub_first_name              TEXT        NULL,
  include_queued_drills       BOOLEAN     NOT NULL DEFAULT TRUE,
  include_weekly_focus        BOOLEAN     NOT NULL DEFAULT TRUE,
  include_eyes_on_players     BOOLEAN     NOT NULL DEFAULT TRUE,
  sub_note_text               TEXT        NULL,
  sub_note_at                 TIMESTAMPTZ NULL,
  sub_note_seen_at            TIMESTAMPTZ NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, coach_id)
);

-- Public token resolution is the hot path (every visit to /sub/<token>).
CREATE INDEX IF NOT EXISTS idx_sub_handoffs_observer_token
  ON sub_handoffs (observer_token);

-- /home unread-sub-note card — read by GET /api/sub-handoff/recent-notes.
-- PARTIAL predicate keeps the index tiny: only rows that actually carry an
-- inbound sub-note land here.
CREATE INDEX IF NOT EXISTS idx_sub_handoffs_coach_sub_note_at
  ON sub_handoffs (coach_id, sub_note_at DESC) WHERE sub_note_at IS NOT NULL;
