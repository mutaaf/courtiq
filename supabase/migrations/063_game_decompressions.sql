-- Migration 063: game_decompressions (ticket 0069)
--
-- The COACH-FACING post-loss primitive. ONE table per (session, coach) that
-- captures up to 60 seconds of voice the coach records on the drive home
-- from a bad loss — "we couldn't get a single rebound, they outran us on
-- every transition" — turns it into a transcript via the existing voice
-- pipeline (Web Speech for live preview, Gemini for the persisted ground
-- truth), and threads a single drill recommendation back so the NEXT
-- practice plan starts from the loss instead of pretending it didn't
-- happen.
--
-- Mirrors 062_season_opener_shares.sql header style. Differs on: (1) the
-- idempotency key is (session_id, coach_id) — re-recording REPLACES the
-- transcript + the recommendation, never piles up dead rows; (2) the row
-- carries `consumed_at` + `consumed_plan_id` so the next plan generation
-- can mark it consumed and the SAME decompression never re-fires.
--
-- COPPA: this table references a session + a coach + a team — NEVER a
-- player, a guardian, a contact email, a date of birth, a medical line,
-- a biometric. The transcript field is COACH-AUTHORED prose (the coach
-- may mention a player's first name on the recording; the route does
-- NOT solicit any structured per-minor data, the public-facing
-- recommendation `why` line goes through a defensive last-name strip
-- per LESSONS#0061). The header comment names the COPPA fields we
-- deliberately do NOT add so the LESSONS#0088 banned-token scan
-- (which strips `--` comment lines) still reads only DDL.
--
-- Migration prefix uniqueness (LESSONS#0006): 062 is taken by
-- season_opener_shares, so the next free prefix is 063. Confirmed via
-- `ls supabase/migrations/` at pickup.

CREATE TABLE IF NOT EXISTS game_decompressions (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  coach_id                 UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  team_id                  UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  transcript               TEXT        NOT NULL,
  duration_seconds         INT         NOT NULL,
  recommended_drill_name   TEXT,
  recommended_drill_setup  TEXT[],
  recommended_drill_why    TEXT,
  consumed_at              TIMESTAMPTZ,
  consumed_plan_id         UUID        REFERENCES plans(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, coach_id),
  CHECK (duration_seconds BETWEEN 1 AND 60),
  CHECK (length(transcript) BETWEEN 1 AND 1200)
);

-- The "carry into next plan" lookup is keyed by (coach_id, created_at DESC):
-- the plan generator reads the coach's most recent unconsumed decompression
-- at the start of every practice-plan POST.
CREATE INDEX IF NOT EXISTS idx_game_decompressions_coach_created
  ON game_decompressions (coach_id, created_at DESC);

-- A partial index on (team_id, consumed_at) WHERE consumed_at IS NULL keeps
-- the unconsumed-for-team query fast (the rows scanned are only the live
-- ones; consumed rows fall out of the index after they fire).
CREATE INDEX IF NOT EXISTS idx_game_decompressions_team_unconsumed
  ON game_decompressions (team_id, consumed_at)
  WHERE consumed_at IS NULL;
