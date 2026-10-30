import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(key, {
      apiVersion: '2026-04-22.dahlia',
    });
  }
  return _stripe;
}

export const PRICE_IDS = {
  coach: {
    monthly: process.env.STRIPE_PRICE_COACH_MONTHLY ?? '',
    annual: process.env.STRIPE_PRICE_COACH_ANNUAL ?? '',
  },
  pro_coach: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? '',
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? '',
  },
  organization: {
    monthly: process.env.STRIPE_PRICE_ORG_MONTHLY ?? '',
    annual: process.env.STRIPE_PRICE_ORG_ANNUAL ?? '',
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

// Chalk Talk AI, its own subscription on the same org (src/lib/chalk-talk-ai.ts). $9.99 list; the launch
// coupon ($5 off, forever) keeps early subscribers at $4.99 for as long as they stay.
export const CHALK_TALK_AI_PRICE = () => process.env.STRIPE_PRICE_CHALK_TALK_AI ?? '';
export const CHALK_TALK_AI_LAUNCH_COUPON = () => process.env.STRIPE_COUPON_CHALK_TALK_LAUNCH ?? '';
export const isChalkTalkAIPrice = (priceId: string | null | undefined) => !!priceId && priceId === CHALK_TALK_AI_PRICE();
