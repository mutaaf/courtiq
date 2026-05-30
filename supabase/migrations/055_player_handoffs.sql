-- Migration 055: player_handoffs (ticket 0059)
--
-- The program-internal coach-to-coach knowledge handoff. When a coach finishes
-- a season and players age up to next year's coach inside the SAME program
-- (same org_id), this table holds one short coach-authored card per player
-- summarizing "what worked for me coaching this kid." When the receiving
-- coach claims a roster that matches by first name + age + jersey, the card
-- materializes on her /roster as a per-row badge.
--
-- COPPA approval trail (the load-bearing constraint):
--   * This migration adds NO new column on the `players` table. The receiving
--     coach's "Save to my coach notes" action writes the card body into the
--     EXISTING `player_notes` table (coach-private journal, migration 019) so
--     this ticket does not widen the per-minor schema.
--   * The `card_body` column on `player_handoffs` is COACH-AUTHORED prose.
--     The AI's role is to SUMMARIZE the source coach's existing observations
--     into a short clipboard-voiced note; it does not invent new descriptive
--     minor data. The route also runs the body through `stripContactInfo`
--     (the existing helper from 0056) before insert to defeat planted email
--     / phone / URL fragments.
--   * The card carries the player's first name only — never a full name, DOB,
--     parent contact, address, or photo. There is no name-similarity, no
--     dob-match, no biometric, no photo-match, no observation text, and no
--     parent contact on the row. The COPPA boundary lives in BOTH the table
--     shape (this DDL) and the route's input-builder.
--   * `claimed_player_id` is the RECEIVING coach's local `players` row id; it
--     is NEVER a remote-DB join — it stamps which local row the handoff was
--     claimed against.
--
-- Idempotency: the route's "commit" path is idempotent at
-- (source_coach_id, source_player_id, source_team_id) — a second commit
-- reuses the existing row rather than minting a second.
--
-- Migration prefix uniqueness: 055 is the next free prefix after
-- 054_weekly_pulse_shares.sql (LESSONS#0006).

CREATE TABLE IF NOT EXISTS player_handoffs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_coach_id        UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  source_player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  source_team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  org_id                 UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  season_label           TEXT NOT NULL,
  card_body              TEXT NOT NULL,
  ai_provider            TEXT NOT NULL,
  claimed_by_coach_id    UUID NULL REFERENCES coaches(id) ON DELETE SET NULL,
  claimed_at             TIMESTAMPTZ NULL,
  claimed_player_id      UUID NULL REFERENCES players(id) ON DELETE SET NULL,
  is_archived            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT player_handoffs_idempotency_uniq
    UNIQUE (source_coach_id, source_player_id, source_team_id)
);

-- Receiving-coach lookup: every roster row fires one read scoped to the
-- caller's org_id + unclaimed handoffs. Partial index keeps the hot path
-- tight by excluding archived rows.
CREATE INDEX IF NOT EXISTS idx_player_handoffs_org_unarchived
  ON player_handoffs (org_id)
  WHERE NOT is_archived;

-- Source-coach history: "what handoffs have I queued, most recent first."
CREATE INDEX IF NOT EXISTS idx_player_handoffs_source_coach
  ON player_handoffs (source_coach_id, created_at DESC);

-- Per-claimant ordering for a future "what was handed to me" surface.
CREATE INDEX IF NOT EXISTS idx_player_handoffs_claimant
  ON player_handoffs (claimed_by_coach_id, claimed_at DESC)
  WHERE claimed_by_coach_id IS NOT NULL;
