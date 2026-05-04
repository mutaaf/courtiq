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
    features: ['capture', 'roster', 'plans', 'report_cards', 'parent_sharing', 'sessions', 'long_session_audio'],
  },
  pro_coach: {
    maxTeams: 999,
    maxSports: 999,
    maxPlayersPerTeam: 999,
    maxAICallsPerMonth: 999999,
    features: ['capture', 'roster', 'plans', 'report_cards', 'parent_sharing', 'sessions', 'assistant', 'analytics', 'media_upload', 'custom_prompts', 'tendencies', 'curriculum_publish', 'long_session_audio'],
  },
  organization: {
    maxTeams: 999,
    maxSports: 999,
    maxPlayersPerTeam: 999,
    maxAICallsPerMonth: 999999,
    features: ['capture', 'roster', 'plans', 'report_cards', 'parent_sharing', 'sessions', 'assistant', 'analytics', 'media_upload', 'custom_prompts', 'tendencies', 'multi_coach', 'org_analytics', 'custom_branding', 'curriculum_publish', 'long_session_audio'],
  },
};

export function canAccess(tier: Tier, feature: string): boolean {
  return TIER_LIMITS[tier].features.includes(feature);
}

export function getTierLimit(tier: Tier) {
  return TIER_LIMITS[tier];
}

const AUDIO_LIMITS: Record<Tier, { maxMinutesPerUpload: number; maxLongSessionsPerMonth: number }> = {
  free:         { maxMinutesPerUpload: 10, maxLongSessionsPerMonth: 0 },
  coach:        { maxMinutesPerUpload: 30, maxLongSessionsPerMonth: 5 },
  pro_coach:    { maxMinutesPerUpload: 90, maxLongSessionsPerMonth: 999 },
  organization: { maxMinutesPerUpload: 90, maxLongSessionsPerMonth: 999 },
};

export function getAudioLimit(tier: Tier) {
  const limit = AUDIO_LIMITS[tier];
  return { ...limit, longSessionThresholdSec: 600 };
}
