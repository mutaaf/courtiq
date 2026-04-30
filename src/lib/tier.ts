export type Tier = 'free' | 'coach' | 'pro_coach' | 'organization';

export const TIER_LIMITS: Record<Tier, {
  maxTeams: number;
  maxSports: number;
  maxPlayersPerTeam: number;
  maxAICallsPerMonth: number;
  /** Hard cap on the duration of a single uploaded audio file, in minutes. */
  maxAudioMinutesPerUpload: number;
  /** Long sessions = uploads over 10 minutes. Caps the count per calendar month. */
  maxLongSessionsPerMonth: number;
  features: string[];
}> = {
  free: {
    maxTeams: 1,
    maxSports: 1,
    maxPlayersPerTeam: 10,
    maxAICallsPerMonth: 5,
    maxAudioMinutesPerUpload: 10,
    maxLongSessionsPerMonth: 0,
    features: ['capture', 'roster', 'basic_plans'],
  },
  coach: {
    maxTeams: 3,
    maxSports: 1,
    maxPlayersPerTeam: 999,
    maxAICallsPerMonth: 999999,
    maxAudioMinutesPerUpload: 30,
    maxLongSessionsPerMonth: 5,
    features: ['capture', 'roster', 'plans', 'report_cards', 'parent_sharing', 'sessions', 'long_session_audio'],
  },
  pro_coach: {
    maxTeams: 999,
    maxSports: 999,
    maxPlayersPerTeam: 999,
    maxAICallsPerMonth: 999999,
    maxAudioMinutesPerUpload: 240,
    maxLongSessionsPerMonth: 999,
    features: ['capture', 'roster', 'plans', 'report_cards', 'parent_sharing', 'sessions', 'assistant', 'analytics', 'media_upload', 'custom_prompts', 'tendencies', 'curriculum_publish', 'long_session_audio'],
  },
  organization: {
    maxTeams: 999,
    maxSports: 999,
    maxPlayersPerTeam: 999,
    maxAICallsPerMonth: 999999,
    maxAudioMinutesPerUpload: 240,
    maxLongSessionsPerMonth: 999,
    features: ['capture', 'roster', 'plans', 'report_cards', 'parent_sharing', 'sessions', 'assistant', 'analytics', 'media_upload', 'custom_prompts', 'tendencies', 'multi_coach', 'org_analytics', 'custom_branding', 'curriculum_publish', 'long_session_audio'],
  },
};

export function canAccess(tier: Tier, feature: string): boolean {
  return TIER_LIMITS[tier].features.includes(feature);
}

export function getTierLimit(tier: Tier) {
  return TIER_LIMITS[tier];
}

/**
 * Audio upload limits for a tier.
 *   maxMinutesPerUpload  hard cap on a single recording
 *   maxLongSessionsPerMonth  count of >10-min uploads in the current calendar month
 *   longSessionThresholdSec  recordings longer than this count toward the monthly cap
 */
export function getAudioLimit(tier: Tier) {
  const limit = TIER_LIMITS[tier];
  return {
    maxMinutesPerUpload: limit.maxAudioMinutesPerUpload,
    maxLongSessionsPerMonth: limit.maxLongSessionsPerMonth,
    longSessionThresholdSec: 600,
  };
}
