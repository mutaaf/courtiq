'use client';
import { useActiveTeam } from './use-active-team';
import { TIER_LIMITS, canAccess, type Tier } from '@/lib/tier';

export function useTier() {
  const { coach } = useActiveTeam();
  const tier = ((coach as any)?.organizations?.tier || 'free') as Tier;
  const limits = TIER_LIMITS[tier];
  const subscriptionStatus = ((coach as any)?.organizations?.subscription_status || null) as string | null;
  const cancelAtPeriodEnd = ((coach as any)?.organizations?.cancel_at_period_end || false) as boolean;
  const currentPeriodEnd = ((coach as any)?.organizations?.current_period_end || null) as string | null;

  return {
    tier,
    limits,
    subscriptionStatus,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    canAccess: (feature: string) => canAccess(tier, feature),
    isPro: tier === 'pro_coach' || tier === 'organization',
    isOrg: tier === 'organization',
  };
}
