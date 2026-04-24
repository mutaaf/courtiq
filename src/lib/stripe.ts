import Stripe from 'stripe';

let _stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-04-22.dahlia',
    });
  }
  return _stripe;
}

export const PRICE_IDS = {
  coach: {
    monthly: process.env.STRIPE_PRICE_COACH_MONTHLY!,
    annual: process.env.STRIPE_PRICE_COACH_ANNUAL!,
  },
  pro_coach: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL!,
  },
  organization: {
    monthly: process.env.STRIPE_PRICE_ORG_MONTHLY!,
    annual: process.env.STRIPE_PRICE_ORG_ANNUAL!,
  },
} as const;

export type BillingInterval = 'monthly' | 'annual';
export type PaidTier = 'coach' | 'pro_coach' | 'organization';

export function getPriceId(tier: PaidTier, interval: BillingInterval): string {
  return PRICE_IDS[tier][interval];
}

export function tierFromPriceId(priceId: string): PaidTier | null {
  for (const [tier, prices] of Object.entries(PRICE_IDS)) {
    if (prices.monthly === priceId || prices.annual === priceId) {
      return tier as PaidTier;
    }
  }
  return null;
}
