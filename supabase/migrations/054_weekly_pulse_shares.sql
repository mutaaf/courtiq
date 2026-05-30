-- Migration 054: weekly_pulse_shares (ticket 0057)
--
-- The recurring coach-to-coach viral edge. ONE small share-mapping table that
-- maps a public token to:
--   • the publishing coach
--   • the team whose week is being summarized
--   • the ISO week the card belongs to (e.g. '2026-W22')
--   • an optional one-line caption the publisher types before they paste the
--     link in their league group chat
--
-- The public page at /week/<token> renders a structured summary of data the
-- coach already has — session count, top categories, focus line, team + age
-- group — drawn live from the existing observations / sessions / config /
-- coaches.full_name tables when the public GET resolves the token. NO new
-- per-minor data is stored on this table by construction: the table holds the
-- token + coach + team + iso_week + caption, never a player id, never a parent
-- contact, never a single descriptive minor field. The public read renders
-- team-level aggregates only — there is no name-similarity, no dob-match, no
-- biometric, no photo-match, no observation text, and no parent contact on the
-- card. The COPPA boundary lives in BOTH the table shape (this DDL) and the
-- public route's response allow-list.
--
-- Idempotency: a `(coach_id, team_id, iso_week)` UNIQUE constraint means a
-- coach who taps Publish twice in the same week reuses the same token rather
-- than minting a second one. The create route re-reads the existing active row
-- before inserting; the constraint is the defense-in-depth guard.
--
-- Migration prefix uniqueness: 054 is the next free prefix after
-- 053_parent_reactions_coach_reply.sql (LESSONS#6 — coordinate prefix).
-- Column / value counts on every insert below are balanced (LESSONS#6).

CREATE TABLE IF NOT EXISTS weekly_pulse_shares (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        NOT NULL UNIQUE,
  coach_id    UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  team_id     UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  iso_week    TEXT        NOT NULL,
  caption     TEXT        NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT weekly_pulse_shares_coach_week_uniq
    UNIQUE (coach_id, team_id, iso_week)
);

-- Public token resolution is the hot path (one lookup per public page view).
CREATE INDEX IF NOT EXISTS idx_weekly_pulse_shares_token
  ON weekly_pulse_shares (token) WHERE is_active;

-- A coach's most-recent-first listing of their own pulses (used by the home
-- card's "you already shared this week" lookup AND by future per-coach
-- listing surfaces). Mirrors the per-coach index pattern from 048.
CREATE INDEX IF NOT EXISTS idx_weekly_pulse_shares_coach
  ON weekly_pulse_shares (coach_id, created_at DESC);
