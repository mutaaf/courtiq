-- Migration 073 — ticket 0088. Per-coach, per-signal-kind dedup table
-- so the /home first-cross-coach-signal activation card fires EXACTLY
-- ONCE per coach per kind. The card is the moment a coach crosses
-- from "user of SportsIQ" to "person other coaches learn from"; the
-- product currently spreads each cross-coach event across its own
-- per-event card, so the first-of-its-kind moment slides past in the
-- noise of the 30 other home cards. This table is the persistence
-- log behind the activation card.
--
-- Migration prefix uniqueness (LESSONS#0006): 072 is taken by
-- org_card_snoozes (ticket 0087); 073 is the next free prefix on disk.
-- Confirmed via `ls supabase/migrations/` at pickup.
--
-- COPPA: this table never references a player, parent, observation,
-- team, or sport. It carries ONLY (coach_id, kind, fired_at,
-- celebrated_at, dismissed_at) — the activation log of one coach,
-- not the data of any minor. The signal SOURCES (drill_share_clones,
-- coach_thank_messages, parent_forward_signals, parent_reactions)
-- already exist and are untouched by this migration.
--
-- Tier posture: NO new tier feature key. The activation card is a
-- FREE affordance — the loop's first-stick moment is the most
-- leveraged Free → Coach conversion lever there is. Gating it would
-- defeat the entire growth thesis. The card renders for every tier.
--
-- LESSONS#0087: NO partial index with a NOW() predicate (Postgres
-- rejects STABLE function references inside index predicates with
-- 42P17). The route filters by dismissed_at NULL / NOT NULL inside
-- its WHERE clause; the regular composite index (coach_id, kind)
-- already supports the lookup via the UNIQUE constraint.
--
-- LESSONS#0094: a service-role GRANT block is appended at the end
-- of this file so that the explicit-grant pattern every public
-- table relies on is in place for this table from row zero.

CREATE TABLE IF NOT EXISTS coach_first_signal_celebrations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id       UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  kind           TEXT        NOT NULL CHECK (kind IN (
                                'clone',
                                'thank',
                                'parent_forward',
                                'parent_forward_cross_team',
                                'reaction_cross_team'
                              )),
  fired_at       TIMESTAMPTZ NOT NULL,
  celebrated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at   TIMESTAMPTZ,
  UNIQUE (coach_id, kind)
);

-- Per-coach lookup — the route reads "every celebration row for the
-- caller" into a Set<kind> in one shot.
CREATE INDEX IF NOT EXISTS idx_coach_first_signal_celebrations_coach
  ON coach_first_signal_celebrations (coach_id);

-- Service-role GRANTs — keep the explicit-grant pattern (LESSONS#0094)
-- intact for any subsequent CREATE TABLE in this migration window.
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
