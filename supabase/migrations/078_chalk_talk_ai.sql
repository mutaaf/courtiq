-- Migration 078 — Chalk Talk AI as a product CourtIQ resells ("middle-man" AI).
--
-- Two plans, one ledger:
--   * included: every paid CourtIQ tier gets a monthly allowance of Chalk Talk AI (a USD cap on what the
--     calls cost us, set in src/lib/chalk-talk-ai.ts);
--   * ai_plan:  the standalone Chalk Talk AI subscription ($9.99 list, $4.99 launch price), a separate
--     Stripe subscription on the same org, with a larger fair-use cap.
-- Over the cap the board falls back to the free open-model AI, so nobody is stuck mid-practice.
--
-- organizations gets its own columns for the AI subscription: the existing stripe_subscription_id /
-- tier / subscription_status describe the MAIN plan and must never be touched by AI-plan events
-- (the webhook routes by price id).
--
-- ai_ledger is the audit trail: one immutable row per AI call (who, which org, which plan paid, model,
-- tokens in/out/cache, cost in integer micro-dollars at a named price-table version, the provider's
-- request id, latency, outcome). Monthly spend is SUM(cost_micros) for the org since the start of the
-- UTC month. Rows can be inserted, never updated or deleted (trigger below), so the numbers that gate
-- usage and the numbers anyone audits are the same numbers.
--
-- COPPA: no player data at all. The ledger records X's-and-O's AI calls about plays; it never stores the
-- prompt or the answer, only counts and costs.
--
-- LESSONS#0087: no partial index with NOW(); the (org_id, created_at) index serves the month-to-date sum.
-- LESSONS#0094: the explicit service-role GRANT block is appended at the end.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS chalk_talk_ai_status               TEXT,
  ADD COLUMN IF NOT EXISTS chalk_talk_ai_subscription_id      TEXT,
  ADD COLUMN IF NOT EXISTS chalk_talk_ai_period_end           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chalk_talk_ai_cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_organizations_chalk_talk_ai_sub
  ON organizations (chalk_talk_ai_subscription_id);

CREATE TABLE IF NOT EXISTS ai_ledger (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  org_id             UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  coach_id           UUID        REFERENCES coaches(id) ON DELETE SET NULL,
  product            TEXT        NOT NULL DEFAULT 'chalk_talk',
  plan               TEXT        NOT NULL CHECK (plan IN ('included', 'ai_plan')),
  task               TEXT        NOT NULL,
  model              TEXT        NOT NULL,
  input_tokens       INTEGER     NOT NULL DEFAULT 0,
  output_tokens      INTEGER     NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER     NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER     NOT NULL DEFAULT 0,
  cost_micros        BIGINT      NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  price_version      TEXT        NOT NULL,
  request_ids        TEXT[]      NOT NULL DEFAULT '{}',
  latency_ms         INTEGER     NOT NULL DEFAULT 0,
  status             TEXT        NOT NULL CHECK (status IN ('ok', 'error', 'refused'))
);

CREATE INDEX IF NOT EXISTS idx_ai_ledger_org_created ON ai_ledger (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_ledger_created ON ai_ledger (created_at DESC);

-- Append-only: the ledger is the audit record.
CREATE OR REPLACE FUNCTION ai_ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ai_ledger is append-only';
END;
$$;
DROP TRIGGER IF EXISTS ai_ledger_no_update ON ai_ledger;
CREATE TRIGGER ai_ledger_no_update BEFORE UPDATE OR DELETE ON ai_ledger
  FOR EACH ROW EXECUTE FUNCTION ai_ledger_immutable();

-- Month-to-date spend for an org, in micro-dollars (one round trip for the gate).
CREATE OR REPLACE FUNCTION ai_spend_since(p_org UUID, p_since TIMESTAMPTZ) RETURNS BIGINT
  LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(cost_micros), 0)::BIGINT FROM ai_ledger WHERE org_id = p_org AND created_at >= p_since;
$$;

-- Coaches can read their own org's ledger (the usage card); only the service role writes.
ALTER TABLE ai_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_ledger_read_own_org ON ai_ledger;
CREATE POLICY ai_ledger_read_own_org ON ai_ledger FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM coaches WHERE id = auth.uid()));

-- Service-role GRANTs (LESSONS#0094).
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
