'use client';
import { useActiveTeam } from './use-active-team';
import { TIER_LIMITS, canAccess, type Tier } from '@/lib/tier';

export function useTier() {
  const { coach } = useActiveTeam();
  const tier = ((coach as any)?.organizations?.tier || 'free') as Tier;
  const limits = TIER_LIMITS[tier];
  const subscriptionStatus = ((coach as any)?.organizations?.subscription_status || null) as string | null;

  return {
    tier,
    limits,
    subscriptionStatus,
    canAccess: (feature: string) => canAccess(tier, feature),
    isPro: tier === 'pro_coach' || tier === 'organization',
    isOrg: tier === 'organization',
  };
}
