-- Migration 028: Stripe webhook idempotency
-- Stripe retries deliveries on transient failures and can deliver the same
-- event_id twice. Without dedup, a "checkout.session.completed" replay would
-- re-apply tier upgrades / quota refreshes — silently incorrect billing.
--
-- The webhook handler INSERTs each event_id with ON CONFLICT DO NOTHING; if a
-- row already exists, the handler short-circuits with a 200 OK so Stripe stops
-- retrying.

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id     TEXT        PRIMARY KEY,
  event_type   TEXT        NOT NULL,
  livemode     BOOLEAN     NOT NULL DEFAULT FALSE,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  status       TEXT        NOT NULL DEFAULT 'received'
                           CHECK (status IN ('received', 'processed', 'failed')),
  error_message TEXT
);

-- Sweep query: failures + recent traffic
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status_received
  ON stripe_webhook_events (status, received_at DESC);
