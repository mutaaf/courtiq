-- Migration 077 — ticket 0092. Per-(coach, helper-identifier, team)
-- dedup table for the /home real-co-coach card "Not yet" dismiss
-- button. The card surfaces when a recurring observer has helped the
-- coach 2+ times across 2+ distinct practices in the last 14 days;
-- the coach can dismiss the prompt for a specific helper-team pair
-- without dismissing it for OTHER helpers (a coach may have one
-- recurring helper they want to invite and another they do not).
--
-- Why a new small table rather than reusing the 0088
-- coach_first_signal_celebrations widen: the existing
-- coach_first_signal_celebrations unique constraint is on
-- (coach_id, kind) — there is no per-helper, per-team composite key
-- on that table, so widening it for this surface would either
-- (a) require dropping the UNIQUE which breaks the 0088 / 0089 /
-- 0090 / 0091 dedup contract, or (b) encode the composite key into
-- a kind string and lose the structural-data shape future queries
-- want. A dedicated 3-column table is the smallest-blast-radius
-- primitive (LESSONS#0103 — additive widening; LESSONS#0066 — favor
-- existing select widen, but where the existing shape doesn't
-- carry the new key, a new narrow table beats a forced widen).
--
-- COPPA: this table references coach_id + team_id + an opaque
-- helper_identifier string. No player_id, no parent_email, no DOB,
-- no observation text. The helper_identifier is the same string
-- the route reads off the existing sub_handoffs.sub_first_name
-- column at pickup; it is NEVER a child name (per the 0067 voice
-- gate that already strips banned content from sub_first_name).
--
-- Migration prefix uniqueness (LESSONS#0006): 076 is taken by
-- organizations_opt_out_sport_pulse (ticket 0091); 077 is the next
-- free prefix on disk. Confirmed via ls supabase/migrations/ at
-- pickup.
--
-- LESSONS#0087: NO partial index with a NOW() predicate (Postgres
-- rejects STABLE function references inside index predicates with
-- 42P17). The route filters by dismissed_at inside its WHERE
-- clause; the regular composite index on (coach_id, helper_identifier,
-- team_id) supports the lookup directly.
--
-- LESSONS#0094: a service-role GRANT block is appended at the end
-- of this file so the explicit-grant pattern every public table
-- relies on stays intact for this new write path.

CREATE TABLE IF NOT EXISTS recurring_observer_dismissals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id            UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  helper_identifier   TEXT        NOT NULL,
  team_id             UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  dismissed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coach_id, helper_identifier, team_id)
);

-- The route reads "every dismissal row for the caller coach" in one
-- shot and intersects in-process; the per-coach index supports the
-- hot path.
CREATE INDEX IF NOT EXISTS idx_recurring_observer_dismissals_coach
  ON recurring_observer_dismissals (coach_id);

-- Service-role GRANTs — keep the explicit-grant pattern (LESSONS#0094)
-- intact for the new table's write path.
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
