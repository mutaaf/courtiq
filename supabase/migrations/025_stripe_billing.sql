-- Add Stripe billing fields to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'none';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer ON organizations(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_sub ON organizations(stripe_subscription_id);
