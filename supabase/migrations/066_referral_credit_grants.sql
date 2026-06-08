-- Migration 066: referral_credit_grants (ticket 0074)
--
-- The INVITER-coach referral-credit primitive. ONE row per (inviter
-- coach, milestone kind) edge, written when the inviter's count of
-- qualified converted coaches crosses a documented threshold AND the
-- credit is applied. The /home referral-credit-card reads the
-- unconsumed row for the caller and renders the dollar amount + the
-- three first names; tapping "Got it" stamps notified_at.
--
-- COPPA: nothing readable about minors is added by this table. The
-- table references coaches(id) and stores a credit-grant edge:
--   - inviter_coach_id: who earned the credit.
--   - milestone_kind: which threshold fired (qualified_3 / 10 / 25).
--   - qualified_referral_coach_ids: the UUID[] of converted coaches at
--     the moment the milestone fired (audit trail per LESSONS#0044's
--     billing immutability norm — kept as a load-bearing AUDIT row
--     even after the converted coach later deletes their account; we
--     deliberately do NOT cascade-delete on that side).
--   - credit_amount_cents + credit_currency: the dollar amount written
--     to Stripe customer balance.
--   - stripe_customer_balance_txn_id: the Stripe txn id (NULL for a
--     pending grant on a free-tier inviter — they get the recognition
--     card with "upgrade to redeem", same posture as 0035 inline
--     upsell).
--   - granted_at / redeemed_period_end / notified_at: the bookmarks.
--
-- There is no parent first name, no parent phone, no parent email,
-- no date-of-birth, no medical-line, no biometric, no photo, no
-- nickname, no jersey-number, no relationship-label.
--
-- Tier posture: the credit-grant primitive is universal (every tier
-- gets a row). The Stripe customer-balance write is paid-tier only
-- because a Stripe customer balance must redeem against a future
-- invoice; a free-tier inviter's row stores stripe_customer_balance_txn_id
-- NULL and the card surfaces "upgrade to redeem" — the 0035 inline
-- upsell shape.
--
-- Migration prefix uniqueness (LESSONS#0006): 065 is taken by
-- coach_reputation_milestones, so 066 is the next free prefix.
-- Confirmed via `ls supabase/migrations/` at pickup.

CREATE TABLE IF NOT EXISTS referral_credit_grants (
  id                             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_coach_id               UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  milestone_kind                 TEXT        NOT NULL CHECK (milestone_kind IN (
                                               'qualified_3',
                                               'qualified_10',
                                               'qualified_25'
                                             )),
  qualified_referral_coach_ids   UUID[]      NOT NULL,
  credit_amount_cents            INT         NOT NULL CHECK (credit_amount_cents > 0 AND credit_amount_cents <= 10000),
  credit_currency                TEXT        NOT NULL DEFAULT 'usd',
  stripe_customer_balance_txn_id TEXT,
  granted_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_period_end            TIMESTAMPTZ,
  notified_at                    TIMESTAMPTZ,
  UNIQUE (inviter_coach_id, milestone_kind)
);

-- The /home card lookup is keyed by the inviter coach with
-- notified_at still null, most-recent-first. A partial index keeps
-- the index small (consumed rows fall out the moment notified_at
-- is stamped) and fast.
CREATE INDEX IF NOT EXISTS idx_referral_credit_grants_unnotified
  ON referral_credit_grants (inviter_coach_id, notified_at)
  WHERE notified_at IS NULL;

-- The audit-trail back-reference (LESSONS#0044): a future support
-- query that needs to confirm a Stripe customer-balance txn maps to
-- a grant row hits this partial index instead of a sequential scan.
CREATE INDEX IF NOT EXISTS idx_referral_credit_grants_by_stripe_txn
  ON referral_credit_grants (stripe_customer_balance_txn_id)
  WHERE stripe_customer_balance_txn_id IS NOT NULL;
