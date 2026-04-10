export type Tier = 'free' | 'coach' | 'pro_coach' | 'organization';

export const TIER_LIMITS: Record<Tier, {
  maxTeams: number;
  maxSports: number;
  maxPlayersPerTeam: number;
  maxAICallsPerMonth: number;
  features: string[];
}> = {
  free: {
    maxTeams: 1,
    maxSports: 1,
    maxPlayersPerTeam: 10,
    maxAICallsPerMonth: 5,
    features: ['capture', 'roster', 'basic_plans'],
  },
  coach: {
    maxTeams: 3,
    maxSports: 1,
    maxPlayersPerTeam: 999,
    maxAICallsPerMonth: 999999,
    features: ['capture', 'roster', 'plans', 'report_cards', 'parent_sharing', 'sessions'],
  },
  pro_coach: {
    maxTeams: 999,
    maxSports: 999,
    maxPlayersPerTeam: 999,
    maxAICallsPerMonth: 999999,
    features: ['capture', 'roster', 'plans', 'report_cards', 'parent_sharing', 'sessions', 'assistant', 'analytics', 'media_upload', 'custom_prompts', 'tendencies'],
  },
  organization: {
    maxTeams: 999,
    maxSports: 999,
    maxPlayersPerTeam: 999,
    maxAICallsPerMonth: 999999,
    features: ['capture', 'roster', 'plans', 'report_cards', 'parent_sharing', 'sessions', 'assistant', 'analytics', 'media_upload', 'custom_prompts', 'tendencies', 'multi_coach', 'org_analytics', 'custom_branding'],
  },
};

export function canAccess(tier: Tier, feature: string): boolean {
  return TIER_LIMITS[tier].features.includes(feature);
}

export function getTierLimit(tier: Tier) {
  return TIER_LIMITS[tier];
}
