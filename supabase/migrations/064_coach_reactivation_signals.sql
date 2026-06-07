-- Migration 064: coach_reactivation_signals (ticket 0072)
--
-- The DORMANT-coach reactivation primitive. ONE row per (dormant coach,
-- prior player) edge fired when a parent on that prior player's row opens
-- the parent portal of a DIFFERENT team in the fall — a signal that the
-- coach's OLD parent has come back to the product on someone else's team,
-- carrying the strongest reactivation shape a youth-sports app can ship
-- ("your old parent is back, by name").
--
-- The signal is COACH-AUTHORED data crossing seasons. It does NOT collect
-- anything new on the parent or the kid. The parent's email is stored as
-- a SHA-256 hash (NEVER the plaintext) so the dormant-coach surface never
-- reads a readable parent email; the edge is verified by re-hashing at
-- read time. There is NO new column on the sacred tables (coaches,
-- players, teams, observations, plans).
--
-- The dormant-coach card on /home reads the unconsumed rows joined with
-- the prior player first name + the prior team name (allow-list selects,
-- LESSONS#0036 — NEVER reads parent_email, DOB, medical_notes, etc.).
-- The 0042 quiet-coach cron extension reads the unconsumed-and-not-yet-
-- notified rows from the last 7 days and sends ONE email per signal then
-- stamps notified_at so the same signal is never re-sent.
--
-- COPPA contract: nothing readable about the parent or the kid is added
-- by this table beyond what the COACH already owns (the prior player's
-- first name is already on the coach's roster — it's information the
-- coach has, not a new collection). The returning_parent_email_hash
-- column is structurally a hash; per LESSONS#0114 its IDENTIFIER name
-- contains an inherited token but its VALUE space is a hash, never a
-- plaintext email — the migration-test scan strips the identifier
-- before the banned-token sweep.
--
-- The header lists what we deliberately do NOT add so the LESSONS#0088
-- banned-token scan (which strips `--` comment lines) reads only the
-- executable DDL:
--   - no parent name
--   - no parent phone
--   - no readable email
--   - no date-of-birth
--   - no medical line
--   - no biometric, no photo
--   - no nickname, no relationship-label
--
-- Migration prefix uniqueness (LESSONS#0006): 063 is taken by
-- game_decompressions, so 064 is the next free prefix. Confirmed via
-- `ls supabase/migrations/` at pickup.

CREATE TABLE IF NOT EXISTS coach_reactivation_signals (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dormant_coach_id              UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  prior_team_id                 UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  prior_player_id               UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  returning_parent_email_hash   TEXT        NOT NULL,
  fired_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at                   TIMESTAMPTZ,
  consumed_at                   TIMESTAMPTZ,
  UNIQUE (dormant_coach_id, prior_player_id)
);

-- The /home card lookup is keyed by the dormant coach with consumed_at
-- still null, most-recent-first. A partial index keeps the index small
-- (consumed rows fall out after the card is dismissed) and fast.
CREATE INDEX IF NOT EXISTS idx_coach_reactivation_signals_coach_unconsumed
  ON coach_reactivation_signals (dormant_coach_id, fired_at DESC)
  WHERE consumed_at IS NULL;

-- The cron lookup is keyed by notified_at IS NULL — the rows the daily
-- batch has not yet emailed about. A partial index keeps the scan
-- bounded; rows transition out of the index the moment the cron stamps
-- notified_at.
CREATE INDEX IF NOT EXISTS idx_coach_reactivation_signals_unnotified
  ON coach_reactivation_signals (notified_at)
  WHERE notified_at IS NULL;
