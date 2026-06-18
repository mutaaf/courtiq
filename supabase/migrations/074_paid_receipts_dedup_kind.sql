-- Migration 074 — ticket 0089. Day-60 paid-coach receipts surface.
--
-- This migration does two structural things:
--
--   (1) Widens the CHECK enum on coach_first_signal_celebrations
--       (created by ticket 0088, migration 073) by appending exactly
--       one new literal: 'paid_receipts_d60'. The same per-coach
--       dedup table now serves BOTH the activation card (0088) AND
--       the retention card (0089) — sharing the primitive avoids
--       fragmenting the dedup log into two near-identical tables.
--
--   (2) Adds an additive paid_since_at TIMESTAMPTZ column on
--       organizations so the GET /api/coach/paid-receipts route has
--       a stable per-org first-paid timestamp to compute
--       daysSincePaid against. Schema-wins-over-prose (LESSONS#0096):
--       the ticket prose said the route would derive paidSinceMs
--       from the earliest stripe_webhook_events row for the org, but
--       the real stripe_webhook_events shape (migration 028) is a
--       minimal idempotency log with NO org link and NO event_data
--       column — there is no path from a webhook event to the org
--       on the existing schema. Adding ONE additive timestamp column
--       on organizations is the smallest-blast-radius primitive that
--       gives the route a deterministic value to read without
--       touching the Stripe webhook handler (the AC requires the
--       webhook stays byte-identical, and a BEFORE UPDATE trigger
--       below satisfies that — the webhook code itself is unchanged).
--
-- Migration prefix uniqueness (LESSONS#0006): 073 is taken by
-- coach_first_signal_celebrations (ticket 0088); 074 is the next
-- free prefix on disk. Confirmed via ls supabase/migrations/ at
-- pickup.
--
-- COPPA: this migration NEVER references a player, parent, or
-- observation. The widened enum carries only adult-billing signals
-- (paid_receipts_d60). The paid_since_at column is a per-org
-- billing-state timestamp — no minor data anywhere.
--
-- Tier posture: NO new tier feature key. The receipts card is a FREE
-- affordance for PAID coaches (server-gated on subscription_status).
-- The widen and the column are pure data-shape changes; no
-- entitlement vocabulary moves.
--
-- LESSONS#0087: NO partial index with a NOW() predicate (Postgres
-- rejects STABLE function references inside index predicates with
-- 42P17). The route filters by subscription_status inside its WHERE
-- clause; no new index is needed because organizations.id is the
-- only column the route reads against.
--
-- LESSONS#0094: service-role GRANT block at the end re-grants the
-- explicit posture every public table relies on. Idempotent.

-- ── (1) Widen the CHECK enum on coach_first_signal_celebrations ────
--
-- Postgres has no ALTER CHECK CONSTRAINT statement; the canonical
-- pattern is DROP + ADD. The original constraint name follows the
-- Supabase default scheme: <table>_<column>_check. We drop by name
-- (IF EXISTS so a re-run is idempotent) and re-add the widened set
-- in one transaction.

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
    'paid_receipts_d60'
  ));

-- ── (2) Add organizations.paid_since_at ────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS paid_since_at TIMESTAMPTZ;

-- One-time backfill for organizations that are ALREADY in a paid-grace
-- status at the time of this migration. The fallback ladder is:
--   1. current_period_end - 30 days (= start of the current billing
--      period for active orgs);
--   2. organizations.created_at (a safe outer bound).
-- New orgs going forward get paid_since_at stamped by the trigger
-- below the FIRST time subscription_status transitions to a paid
-- status — so the Stripe webhook handler stays byte-identical (the
-- trigger fires inside the same UPDATE the webhook already issues).
UPDATE organizations
SET paid_since_at = COALESCE(
  current_period_end - INTERVAL '30 days',
  created_at
)
WHERE paid_since_at IS NULL
  AND subscription_status IN ('active', 'past_due', 'trialing');

-- ── (3) Trigger: stamp paid_since_at on first paid transition ──────
--
-- Fires BEFORE UPDATE on organizations whenever subscription_status
-- transitions FROM a non-paid value TO a paid-grace value AND
-- paid_since_at is still NULL. This keeps the Stripe webhook handler
-- byte-identical: the webhook does its usual UPDATE
-- (subscription_status = 'active', ...), and the trigger silently sets
-- paid_since_at = NOW() on the SAME row at the same time.

CREATE OR REPLACE FUNCTION set_organizations_paid_since_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.paid_since_at IS NULL
     AND NEW.subscription_status IN ('active', 'past_due', 'trialing')
     AND (OLD.subscription_status IS NULL
          OR OLD.subscription_status NOT IN ('active', 'past_due', 'trialing'))
  THEN
    NEW.paid_since_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_set_paid_since_at ON organizations;
CREATE TRIGGER trg_organizations_set_paid_since_at
  BEFORE UPDATE OF subscription_status ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION set_organizations_paid_since_at();

-- ── (4) Service-role GRANTs (LESSONS#0094) ─────────────────────────
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
