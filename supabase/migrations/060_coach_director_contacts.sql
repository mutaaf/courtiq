-- Migration 060: coach_director_contacts (ticket 0065)
--
-- The third edge of the program-director acquisition triangle. The COACH —
-- not a director already on platform (0024) and not a parent (0050) — taps a
-- new "Send to my program director" surface beneath the existing 0057
-- weekly-pulse share sheet's Copy-link button, types the director's first
-- name + email, and we mint ONE invite email pointing at the same public
-- /week/<token> URL the coach just published. This one small mapping table
-- exists so the SECOND week's invite is one tap: the share sheet pre-fills
-- the last director the coach invited, and the same row's invite_count
-- increments on a re-send.
--
-- Columns:
--   • coach_id              — the caller. FK to coaches(id).
--   • director_first_name   — what the coach typed (1–60 chars, voice-clean
--                              at the route layer).
--   • director_email        — the address. Raw form, used to fire the email
--                              and to mask on the prefill GET. NEVER
--                              returned to the client.
--   • director_email_hash   — sha256(lowercase + trim) hex. The dedup query
--                              (the shared 30-day check across this table
--                              AND program_referrals from 0050) NEVER puts
--                              a raw email in a WHERE clause. Mirrors
--                              052_program_referrals.sql byte-for-byte.
--   • last_invited_at       — bumped on every re-invite. The pre-fill GET
--                              orders by this DESC.
--   • invite_count          — incremented on every re-invite of the same
--                              director by the same coach.
--
-- COPPA posture: this table holds ZERO minor data. There is no player FK, no
-- parent contact field, no observation excerpt, no age-band field, no
-- date-of-birth, no medical note here. The COACH is the actor; the DIRECTOR
-- is an adult contact the coach volunteered. The weekly-pulse card the
-- email links to is a team-level aggregate (no per-kid content by
-- construction; ticket 0057 + migration 054). There is no name-similarity,
-- no dob-match, no biometric, no photo-match, no parent contact on this
-- table. The privacy boundary lives in BOTH the table shape (this DDL) AND
-- the route response allow-lists.
--
-- Idempotency: the UNIQUE (coach_id, director_email_hash) constraint means
-- a coach who taps Send-to-Mike twice updates the same row (increments
-- invite_count, bumps last_invited_at) rather than minting a second one.
-- The route's upsert path is the defense-in-depth guard.
--
-- Migration prefix uniqueness: the ticket spec aimed for 059 but 059 was
-- claimed by 059_drill_shares.sql (ticket 0064) before this lands. 060 is
-- the next free integer (LESSONS#0006 — coordinate prefix). Column / value
-- counts on every insert below are balanced (LESSONS#0006); there are no
-- INSERTs in this migration.

CREATE TABLE IF NOT EXISTS coach_director_contacts (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id             UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  director_first_name  TEXT        NOT NULL,
  director_email       TEXT        NOT NULL,
  director_email_hash  TEXT        NOT NULL,
  last_invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invite_count         INT         NOT NULL DEFAULT 1,
  CONSTRAINT coach_director_contacts_coach_director_uniq
    UNIQUE (coach_id, director_email_hash)
);

-- The pre-fill GET reads the caller's most-recent contact: filter by coach_id,
-- order by last_invited_at DESC, limit 1. Per-coach + most-recent-first.
CREATE INDEX IF NOT EXISTS idx_coach_director_contacts_coach_recent
  ON coach_director_contacts (coach_id, last_invited_at DESC);
