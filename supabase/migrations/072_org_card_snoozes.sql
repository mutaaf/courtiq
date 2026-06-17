-- Migration 072: org_card_snoozes (ticket 0087)
--
-- The director-side "Maybe later" primitive. ONE row per (org_id,
-- card_kind) edge written when the program director taps the
-- secondary button on the new program-org-tier upgrade card; the
-- program-pulse route reads the row and keeps the card silent until
-- `snoozed_until` passes.
--
-- The CHECK enum on card_kind is intentionally small — v1 carries the
-- one kind this ticket needs. Future card kinds widen the CHECK in
-- their own migration (additive — LESSONS#0103).
--
-- COPPA: nothing readable about minors is added by this table. The
-- table references organizations(id) and coaches(id) only. There is no
-- name, no email, no phone, no note body, no date-of-birth, no jersey,
-- no medical line, no biometric, no photo, no relationship label.
--
-- The header lists what we deliberately do NOT add so the
-- LESSONS#0088 banned-token scan (which strips the comment lines)
-- reads only the executable DDL:
--   no jersey,
--   no nickname,
--   no parent first name,
--   no parent phone,
--   no parent email,
--   no date-of-birth,
--   no medical-line,
--   no biometric, no photo,
--   no relationship-label,
--   no kid name,
--   no team name,
--   no player id.
--
-- Tier posture: the snooze primitive is universal across tiers; the
-- gate on rendering the card itself is tier + role + active-snooze in
-- the program-pulse route. There is no new feature key on tier.ts.
--
-- Migration prefix uniqueness (LESSONS#0006): at pickup
-- `ls supabase/migrations/` shows 071 is the latest on disk
-- (071_parent_forward_signals_cross_team), so 072 is the next free
-- prefix.

CREATE TABLE IF NOT EXISTS org_card_snoozes (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  card_kind                TEXT        NOT NULL CHECK (card_kind IN ('program_org_tier')),
  snoozed_until            TIMESTAMPTZ NOT NULL,
  snoozed_by_coach_id      UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  snoozed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, card_kind)
);

-- Active-snooze lookup. We can NOT use a partial `WHERE snoozed_until >
-- NOW()` predicate here: postgres rejects partial-index predicates that
-- reference STABLE functions (NOW() is STABLE, not IMMUTABLE) with
-- SQLSTATE 42P17. Index instead on `snoozed_until DESC` so the route's
-- typical "is there an unexpired snooze for this (org_id, card_kind)?"
-- query — `WHERE org_id = $1 AND card_kind = $2 AND snoozed_until >
-- now()` — is satisfied by the index ordering. The UNIQUE constraint on
-- (org_id, card_kind) already gives a fast equality lookup; this index
-- is the secondary path the route relies on.
CREATE INDEX IF NOT EXISTS idx_org_card_snoozes_until
  ON org_card_snoozes (org_id, card_kind, snoozed_until DESC);

-- ---------------------------------------------------------------------------
-- Service-role grants (LESSONS#0094). The Supabase CLI version pulled by
-- `setup-cli@v1` (`version: latest`) skips the auto-grant on public tables
-- after a recent release, so every new public table needs its service-role
-- grants restored explicitly in the same migration. Idempotent — the
-- previous migrations already issued these statements, but re-running them
-- here is safe and pins the posture on the new table.
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
