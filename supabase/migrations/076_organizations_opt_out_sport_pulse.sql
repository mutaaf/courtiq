-- Migration 076 — ticket 0091. Program-scoped opt-out switch for the
-- sport-wide convergence pulse. When TRUE, the program is honored in
-- the count aggregate (the quantity signal is honest — "25 programs
-- across basketball are working closeouts this week") but the program
-- is EXCLUDED from the rendered named list ("Hawks Basketball and
-- Riverside U10 published 6 closeout plans this week"). The opt-out
-- is program-scoped only — the director owns the program's
-- appearance. Privacy trumps growth.
--
-- COPPA boundary: opt-out is a program-scoped switch; no player data
-- is involved. The new boolean lives on `organizations`, which has
-- never carried a per-minor field. The migration adds NO column to
-- `players`, `coaches`, `teams`, `observations`, or `plans`.
--
-- Migration prefix uniqueness (LESSONS#0006): 075 is taken by
-- program_drill_canon (ticket 0090); 076 is the next free prefix on
-- disk. Confirmed via `ls supabase/migrations/` at pickup.
--
-- LESSONS#0087: the column is NOT a partial index; no `WHERE NOW()`
-- predicate. A regular column read filtered in the route's WHERE
-- clause is the simplest correct surface.
--
-- LESSONS#0094: a service-role GRANT block is appended at the end of
-- this file so the explicit-grant pattern every public table relies
-- on stays intact for the new column write path.
--
-- LESSONS#0009 / #0054: the existing `coach_first_signal_celebrations`
-- CHECK enum (migration 073 + widen in 075) is widened again here via
-- DROP + ADD to include the new `sport_pulse_named` kind, so the
-- celebration AC can fire on the same activation card the rest of
-- the first-cross-coach-signal kinds share.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS opted_out_of_sport_pulse BOOLEAN NOT NULL DEFAULT FALSE;

-- Widen the celebrations CHECK enum (LESSONS#0009 / #0054). The DROP +
-- ADD pattern preserves all 7 prior kinds and adds the new one.
ALTER TABLE coach_first_signal_celebrations
  DROP CONSTRAINT IF EXISTS coach_first_signal_celebrations_kind_check;
ALTER TABLE coach_first_signal_celebrations
  ADD CONSTRAINT coach_first_signal_celebrations_kind_check
  CHECK (kind IN (
    'clone',
    'thank',
    'parent_forward',
    'parent_forward_cross_team',
    'reaction_cross_team',
    'paid_receipts_d60',
    'program_canon_inherited',
    'sport_pulse_named'
  ));

-- Service-role GRANTs (LESSONS#0094). Keeps the explicit-grant pattern
-- intact for the new column write path on organizations.
GRANT USAGE ON SCHEMA public TO service_role, authenticated, anon;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO service_role;
