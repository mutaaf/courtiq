-- Migration 042: coaches.paused_until + coaches.last_active_at (ticket 0042)
--
-- Adds two nullable timestamptz columns to `coaches` so the system can:
--   1) Politely email a coach who's been quiet 14 days ("Still coaching this
--      season?") with a one-tap "Pause for 30 days" link, and
--   2) Honour that pause from every existing cron (weekly-digest,
--      parent-digest, practice-reminder, weekly-parent-rollup) and the new
--      check-in cron itself.
--
-- paused_until is the shared QUIET-HOURS predicate. When NULL or in the past,
-- the coach is active and every cron behaves as before. When in the future,
-- every outbound cron short-circuits before any send work — no nag, no parent
-- digest, no Monday rollup, no practice reminder.
--
-- last_active_at tracks the coach's most recent meaningful activity (a logged
-- observation, a saved plan, a sign-in). The check-in cron reads it to decide
-- who's been quiet. We add the column NULLABLE with NO default — existing
-- rows have unknown last activity, and the check-in cron must treat NULL
-- conservatively (it falls back to derivation from `sessions` until the column
-- backfills naturally as coaches use the app).
--
-- COPPA / data-minimization (AGENTS.md non-negotiable 2): both new columns
-- live on the COACH row. There is no minor-scoped column added, no widening
-- of `players`, no parent-contact field, no biometric / dob_match / similarity
-- column. This migration deliberately documents what it is NOT adding so the
-- privacy boundary is recorded in the migration trail; the
-- coaches-paused-until.test.ts banned-token scan strips `--` comment lines
-- before assertions so this explanatory header isn't mis-flagged (LESSONS#88).
--
-- Migration prefix 042 was chosen DELIBERATELY: ticket 0040's
-- `041_plans_type_pregame_brief.sql` had already merged to main when this
-- branch opened (see git log on main at 4c18ef4 -> 7260b67), so the next
-- free integer is 042. The supabase CLI keys applied migrations on the
-- leading `<version>_` token, so a unique prefix avoids the
-- schema_migrations duplicate-key class of failure (LESSONS#6).

ALTER TABLE coaches
  ADD COLUMN IF NOT EXISTS paused_until    TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_active_at  TIMESTAMPTZ NULL;

-- Partial index: only ROWS that are actually paused need to be scanned by the
-- cron's eligibility query; an unconditional btree on paused_until would index
-- the (much larger) NULL set unnecessarily. The cron's WHERE is
-- `last_active_at <= now() - interval '14 days' AND (paused_until IS NULL OR
-- paused_until <= now())`, so this partial index supports the inequality scan
-- without dragging the active-coach majority into the index.
CREATE INDEX IF NOT EXISTS coaches_paused_until_idx
  ON coaches(paused_until)
  WHERE paused_until IS NOT NULL;
