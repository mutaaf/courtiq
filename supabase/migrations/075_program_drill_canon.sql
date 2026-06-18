-- Migration 075 — ticket 0090. The program_drill_canon table is the
-- institutional artifact a director publishes ONCE per program: the
-- top 5-10 drills 3+ of the program's coaches have thumbed up. Every
-- new coach who joins the program post-publish inherits these drill
-- ids into their personal coach_drill_signals (the 0039 cross-team
-- thumb persistence), so the program's institutional knowledge stops
-- living in six coaches' heads and starts living on the platform.
--
-- Migration prefix uniqueness (LESSONS#0006): 074
-- (paid_receipts_dedup_kind, ticket 0089) is the latest on disk; 075
-- is the next free prefix. Confirmed via `ls supabase/migrations/`
-- at pickup.
--
-- COPPA boundary: this table never references a player, parent,
-- observation, sport-derived child metric, or any minor-derived
-- field. It carries ONLY (org_id, published_by_coach_id, drill_ids,
-- published_at, superseded_at) — the program's institutional drill
-- library, not the data of any minor. No player data, only drill
-- ids and organizational metadata.
--
-- Tier posture: NO new tier feature key. The route reuses the
-- existing `organization` tier in src/lib/tier.ts (LESSONS#0023
-- family — the feature prop is the TIER KEY, not the ticket's
-- shorthand; an Org-tier program is gated by the existing
-- TIER_LIMITS['organization'] features list — no edit). The card
-- and inheritance edge are server-gated on
-- `organizations.tier = 'organization'` AND
-- `subscription_status IN ('active','past_due','trialing')`.
--
-- LESSONS#0087: NO partial index with a NOW() predicate (Postgres
-- rejects STABLE function references inside index predicates with
-- 42P17). The "most recent active canon per org" lookup uses the
-- regular composite index (org_id, superseded_at) — the route
-- filters with `WHERE superseded_at IS NULL ORDER BY published_at
-- DESC LIMIT 1`, which the composite covers cleanly.
--
-- LESSONS#0094: a service-role GRANT block is appended at the end
-- of this file so that the explicit-grant pattern every public
-- table relies on is in place for this table from row zero.
--
-- LESSONS#0009 / #0054 — the existing `coach_first_signal_celebrations`
-- table (ticket 0088, migration 073) has a CHECK constraint pinning
-- `kind` to a closed enum; this migration WIDENS that enum to include
-- 'program_canon_inherited' so the /plans inheritance banner can use
-- the same dedup primitive. DROP + ADD pattern (Postgres does not
-- support ALTER ... ADD on a CHECK constraint inline).

CREATE TABLE IF NOT EXISTS program_drill_canon (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  published_by_coach_id   UUID        NOT NULL REFERENCES coaches(id) ON DELETE SET NULL,
  drill_ids               JSONB       NOT NULL,
  published_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at           TIMESTAMPTZ
);

-- Composite index for the "most recent active canon for this org"
-- lookup. (org_id, superseded_at) covers the route's
-- `WHERE org_id = $1 AND superseded_at IS NULL ORDER BY published_at
-- DESC LIMIT 1` query without a partial WHERE predicate.
CREATE INDEX IF NOT EXISTS idx_program_drill_canon_org_active
  ON program_drill_canon (org_id, superseded_at);

-- Per-org timeline for the "publish history" audit read on the admin
-- card.
CREATE INDEX IF NOT EXISTS idx_program_drill_canon_org_time
  ON program_drill_canon (org_id, published_at DESC);

-- ─── Widen coach_first_signal_celebrations.kind enum ───────────────────
-- The /plans inheritance banner reuses the 0088 dedup primitive with a
-- new kind. DROP + ADD the CHECK constraint (LESSONS#0009 / #0054). The
-- existing five kinds stay byte-identical; one new kind is added
-- additively. No new column; the table's column shape is unchanged.

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
    'program_canon_inherited'
  ));

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
