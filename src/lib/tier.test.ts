import { describe, it, expect } from 'vitest';
import { TIER_LIMITS, canAccess, getTierLimit, getAudioLimit, type Tier } from './tier';

const TIERS: Tier[] = ['free', 'coach', 'pro_coach', 'organization'];

// ─── TIER_LIMITS shape ────────────────────────────────────────────────────────

describe('TIER_LIMITS', () => {
  it('defines all four tiers', () => {
    expect(Object.keys(TIER_LIMITS)).toEqual(expect.arrayContaining(TIERS));
  });

  it.each(TIERS)('%s has required numeric limits', (tier) => {
    const limits = TIER_LIMITS[tier];
    expect(typeof limits.maxTeams).toBe('number');
    expect(typeof limits.maxSports).toBe('number');
    expect(typeof limits.maxPlayersPerTeam).toBe('number');
    expect(typeof limits.maxAICallsPerMonth).toBe('number');
    expect(Array.isArray(limits.features)).toBe(true);
  });

  it('free tier has the most restrictive team/player limits', () => {
    expect(TIER_LIMITS.free.maxTeams).toBeLessThan(TIER_LIMITS.coach.maxTeams);
    expect(TIER_LIMITS.free.maxPlayersPerTeam).toBeLessThan(TIER_LIMITS.coach.maxPlayersPerTeam);
    expect(TIER_LIMITS.free.maxAICallsPerMonth).toBeLessThan(TIER_LIMITS.coach.maxAICallsPerMonth);
  });

  it('free tier AI call limit is 5', () => {
    expect(TIER_LIMITS.free.maxAICallsPerMonth).toBe(5);
  });

  it('paid tiers have generous AI limits', () => {
    for (const tier of ['coach', 'pro_coach', 'organization'] as Tier[]) {
      expect(TIER_LIMITS[tier].maxAICallsPerMonth).toBeGreaterThan(100);
    }
  });
});

// ─── canAccess ────────────────────────────────────────────────────────────────

describe('canAccess', () => {
  // Every tier should have capture + roster
  it.each(TIERS)('%s can access capture', (tier) => {
    expect(canAccess(tier, 'capture')).toBe(true);
  });

  it.each(TIERS)('%s can access roster', (tier) => {
    expect(canAccess(tier, 'roster')).toBe(true);
  });

  // Free-tier gates
  it('free tier cannot access plans', () => {
    expect(canAccess('free', 'plans')).toBe(false);
  });

  it('free tier cannot access report_cards', () => {
    expect(canAccess('free', 'report_cards')).toBe(false);
  });

  it('free tier cannot access parent_sharing', () => {
    expect(canAccess('free', 'parent_sharing')).toBe(false);
  });

  it('free tier cannot access analytics', () => {
    expect(canAccess('free', 'analytics')).toBe(false);
  });

  it('free tier cannot access media_upload', () => {
    expect(canAccess('free', 'media_upload')).toBe(false);
  });

  it('free tier cannot access assistant', () => {
    expect(canAccess('free', 'assistant')).toBe(false);
  });

  it('free tier cannot access long_session_audio', () => {
    expect(canAccess('free', 'long_session_audio')).toBe(false);
  });

  // Coach tier gates
  it('coach tier can access plans', () => {
    expect(canAccess('coach', 'plans')).toBe(true);
  });

  it('coach tier can access report_cards', () => {
    expect(canAccess('coach', 'report_cards')).toBe(true);
  });

  it('coach tier can access parent_sharing', () => {
    expect(canAccess('coach', 'parent_sharing')).toBe(true);
  });

  it('coach tier can access long_session_audio', () => {
    expect(canAccess('coach', 'long_session_audio')).toBe(true);
  });

  it('coach tier cannot access analytics', () => {
    expect(canAccess('coach', 'analytics')).toBe(false);
  });

  it('coach tier cannot access media_upload', () => {
    expect(canAccess('coach', 'media_upload')).toBe(false);
  });

  it('coach tier cannot access assistant', () => {
    expect(canAccess('coach', 'assistant')).toBe(false);
  });

  it('coach tier cannot access multi_coach', () => {
    expect(canAccess('coach', 'multi_coach')).toBe(false);
  });

  // Pro coach tier
  it('pro_coach can access analytics', () => {
    expect(canAccess('pro_coach', 'analytics')).toBe(true);
  });

  it('pro_coach can access media_upload', () => {
    expect(canAccess('pro_coach', 'media_upload')).toBe(true);
  });

  it('pro_coach can access assistant', () => {
    expect(canAccess('pro_coach', 'assistant')).toBe(true);
  });

  it('pro_coach can access custom_prompts', () => {
    expect(canAccess('pro_coach', 'custom_prompts')).toBe(true);
  });

  it('pro_coach cannot access multi_coach', () => {
    expect(canAccess('pro_coach', 'multi_coach')).toBe(false);
  });

  it('pro_coach cannot access org_analytics', () => {
    expect(canAccess('pro_coach', 'org_analytics')).toBe(false);
  });

  it('pro_coach cannot access custom_branding', () => {
    expect(canAccess('pro_coach', 'custom_branding')).toBe(false);
  });

  // Organization tier — superset
  it('organization can access multi_coach', () => {
    expect(canAccess('organization', 'multi_coach')).toBe(true);
  });

  it('organization can access org_analytics', () => {
    expect(canAccess('organization', 'org_analytics')).toBe(true);
  });

  it('organization can access custom_branding', () => {
    expect(canAccess('organization', 'custom_branding')).toBe(true);
  });

  // Unknown feature
  it('returns false for an unknown feature on any tier', () => {
    for (const tier of TIERS) {
      expect(canAccess(tier, 'nonexistent_feature_xyz')).toBe(false);
    }
  });
});

// ─── Feature escalation ───────────────────────────────────────────────────────
// Note: free tier has `basic_plans`; paid tiers replace it with the full `plans`
// feature. Higher tiers accumulate features rather than literally including every
// lower-tier name verbatim.

describe('feature escalation', () => {
  const COACH_FEATURES = TIER_LIMITS.coach.features;
  const PRO_FEATURES = TIER_LIMITS.pro_coach.features;
  const ORG_FEATURES = TIER_LIMITS.organization.features;

  // Free's `basic_plans` is intentionally replaced by the full `plans` in paid tiers.
  // Verify core free features (excluding basic_plans) are present in coach tier.
  it('coach includes core free features (capture, roster)', () => {
    expect(COACH_FEATURES).toContain('capture');
    expect(COACH_FEATURES).toContain('roster');
  });

  it('free tier gets basic_plans, not the full plans feature', () => {
    expect(TIER_LIMITS.free.features).toContain('basic_plans');
    expect(TIER_LIMITS.free.features).not.toContain('plans');
  });

  it('coach tier gets full plans, not basic_plans', () => {
    expect(COACH_FEATURES).toContain('plans');
    expect(COACH_FEATURES).not.toContain('basic_plans');
  });

  it('pro_coach includes all coach features', () => {
    for (const f of COACH_FEATURES) {
      expect(PRO_FEATURES).toContain(f);
    }
  });

  it('organization includes all pro_coach features', () => {
    for (const f of PRO_FEATURES) {
      expect(ORG_FEATURES).toContain(f);
    }
  });
});

// ─── getTierLimit ─────────────────────────────────────────────────────────────

describe('getTierLimit', () => {
  it.each(TIERS)('returns the limits object for %s', (tier) => {
    const limits = getTierLimit(tier);
    expect(limits).toBe(TIER_LIMITS[tier]);
  });

  it('free limits have maxTeams of 1', () => {
    expect(getTierLimit('free').maxTeams).toBe(1);
  });

  it('free limits have maxPlayersPerTeam of 10', () => {
    expect(getTierLimit('free').maxPlayersPerTeam).toBe(10);
  });
});

// ─── getAudioLimit ────────────────────────────────────────────────────────────

describe('getAudioLimit', () => {
  it.each(TIERS)('%s returns required audio limit shape', (tier) => {
    const limit = getAudioLimit(tier);
    expect(typeof limit.maxMinutesPerUpload).toBe('number');
    expect(typeof limit.maxLongSessionsPerMonth).toBe('number');
    expect(typeof limit.longSessionThresholdSec).toBe('number');
  });

  it('always includes the 600-second long-session threshold', () => {
    for (const tier of TIERS) {
      expect(getAudioLimit(tier).longSessionThresholdSec).toBe(600);
    }
  });

  it('free tier has no long session quota', () => {
    expect(getAudioLimit('free').maxLongSessionsPerMonth).toBe(0);
  });

  it('free tier has the shortest upload limit', () => {
    const freeMin = getAudioLimit('free').maxMinutesPerUpload;
    for (const tier of ['coach', 'pro_coach', 'organization'] as Tier[]) {
      expect(getAudioLimit(tier).maxMinutesPerUpload).toBeGreaterThan(freeMin);
    }
  });

  it('pro_coach has the largest upload limit', () => {
    expect(getAudioLimit('pro_coach').maxMinutesPerUpload).toBeGreaterThanOrEqual(
      getAudioLimit('coach').maxMinutesPerUpload
    );
  });

  it('organization matches pro_coach audio limits', () => {
    const pro = getAudioLimit('pro_coach');
    const org = getAudioLimit('organization');
    expect(org.maxMinutesPerUpload).toBe(pro.maxMinutesPerUpload);
    expect(org.maxLongSessionsPerMonth).toBe(pro.maxLongSessionsPerMonth);
  });
});
