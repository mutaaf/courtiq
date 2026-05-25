import { describe, it, expect } from 'vitest';
import { TIER_LIMITS, canAccess, getTierLimit, getAudioLimit, type Tier } from './tier';

const TIERS: Tier[] = ['free', 'coach', 'pro_coach', 'organization'];

// ─── TIER_LIMITS structure ────────────────────────────────────────────────────

describe('TIER_LIMITS', () => {
  it('defines all four tiers', () => {
    expect(TIER_LIMITS).toHaveProperty('free');
    expect(TIER_LIMITS).toHaveProperty('coach');
    expect(TIER_LIMITS).toHaveProperty('pro_coach');
    expect(TIER_LIMITS).toHaveProperty('organization');
  });

  it.each(TIERS)('%s tier has required numeric limits', (tier) => {
    const limits = TIER_LIMITS[tier];
    expect(typeof limits.maxTeams).toBe('number');
    expect(typeof limits.maxPlayersPerTeam).toBe('number');
    expect(typeof limits.maxAICallsPerMonth).toBe('number');
    expect(Array.isArray(limits.features)).toBe(true);
  });

  it('free tier has strictest team limit', () => {
    expect(TIER_LIMITS.free.maxTeams).toBeLessThan(TIER_LIMITS.coach.maxTeams);
    expect(TIER_LIMITS.free.maxTeams).toBeLessThan(TIER_LIMITS.pro_coach.maxTeams);
  });

  it('free tier has strictest player limit', () => {
    expect(TIER_LIMITS.free.maxPlayersPerTeam).toBeLessThan(TIER_LIMITS.coach.maxPlayersPerTeam);
  });

  it('free tier has strictest AI call limit', () => {
    expect(TIER_LIMITS.free.maxAICallsPerMonth).toBeLessThan(TIER_LIMITS.coach.maxAICallsPerMonth);
  });

  it('free tier limits are positive numbers', () => {
    expect(TIER_LIMITS.free.maxTeams).toBeGreaterThan(0);
    expect(TIER_LIMITS.free.maxPlayersPerTeam).toBeGreaterThan(0);
    expect(TIER_LIMITS.free.maxAICallsPerMonth).toBeGreaterThan(0);
  });

  it('all paid tiers include capture and roster', () => {
    for (const tier of (['coach', 'pro_coach', 'organization'] as const)) {
      expect(TIER_LIMITS[tier].features).toContain('capture');
      expect(TIER_LIMITS[tier].features).toContain('roster');
    }
  });

  it('free tier includes capture', () => {
    expect(TIER_LIMITS.free.features).toContain('capture');
  });

  it('pro_coach has all features that coach has', () => {
    const coachFeatures = new Set(TIER_LIMITS.coach.features);
    for (const feature of coachFeatures) {
      expect(TIER_LIMITS.pro_coach.features).toContain(feature);
    }
  });

  it('organization has all features that pro_coach has', () => {
    const proFeatures = new Set(TIER_LIMITS.pro_coach.features);
    for (const feature of proFeatures) {
      expect(TIER_LIMITS.organization.features).toContain(feature);
    }
  });

  it('organization has multi_coach feature', () => {
    expect(TIER_LIMITS.organization.features).toContain('multi_coach');
  });

  it('free tier does NOT have analytics', () => {
    expect(TIER_LIMITS.free.features).not.toContain('analytics');
  });

  it('free tier does NOT have media_upload', () => {
    expect(TIER_LIMITS.free.features).not.toContain('media_upload');
  });

  it('pro_coach has media_upload', () => {
    expect(TIER_LIMITS.pro_coach.features).toContain('media_upload');
  });
});

// ─── canAccess ────────────────────────────────────────────────────────────────

describe('canAccess', () => {
  it('allows free users to capture', () => {
    expect(canAccess('free', 'capture')).toBe(true);
  });

  it('allows free users to use roster', () => {
    expect(canAccess('free', 'roster')).toBe(true);
  });

  it('blocks free users from analytics', () => {
    expect(canAccess('free', 'analytics')).toBe(false);
  });

  it('blocks free users from media_upload', () => {
    expect(canAccess('free', 'media_upload')).toBe(false);
  });

  it('blocks free users from assistant', () => {
    expect(canAccess('free', 'assistant')).toBe(false);
  });

  it('allows coach tier to use plans', () => {
    expect(canAccess('coach', 'plans')).toBe(true);
  });

  it('allows coach tier to share parent reports', () => {
    expect(canAccess('coach', 'parent_sharing')).toBe(true);
  });

  it('blocks coach tier from analytics', () => {
    expect(canAccess('coach', 'analytics')).toBe(false);
  });

  it('blocks coach tier from media_upload', () => {
    expect(canAccess('coach', 'media_upload')).toBe(false);
  });

  it('allows pro_coach to use analytics', () => {
    expect(canAccess('pro_coach', 'analytics')).toBe(true);
  });

  it('allows pro_coach to upload media', () => {
    expect(canAccess('pro_coach', 'media_upload')).toBe(true);
  });

  it('allows pro_coach to use assistant', () => {
    expect(canAccess('pro_coach', 'assistant')).toBe(true);
  });

  it('blocks pro_coach from multi_coach', () => {
    expect(canAccess('pro_coach', 'multi_coach')).toBe(false);
  });

  it('allows organization to use multi_coach', () => {
    expect(canAccess('organization', 'multi_coach')).toBe(true);
  });

  it('allows organization to use org_analytics', () => {
    expect(canAccess('organization', 'org_analytics')).toBe(true);
  });

  it('returns false for unknown feature on any tier', () => {
    for (const tier of TIERS) {
      expect(canAccess(tier, 'nonexistent_feature_xyz')).toBe(false);
    }
  });

  // ── Ticket 0023 — weekly coaching digest (Coach+) ──────────────────────────
  it('blocks free users from the weekly digest', () => {
    expect(canAccess('free', 'feature_weekly_digest')).toBe(false);
  });

  it('allows coach, pro_coach, and organization to access the weekly digest', () => {
    expect(canAccess('coach', 'feature_weekly_digest')).toBe(true);
    expect(canAccess('pro_coach', 'feature_weekly_digest')).toBe(true);
    expect(canAccess('organization', 'feature_weekly_digest')).toBe(true);
  });

  it('organization can access everything pro_coach can', () => {
    for (const feature of TIER_LIMITS.pro_coach.features) {
      expect(canAccess('organization', feature)).toBe(true);
    }
  });

  // ── Ticket 0028 — program pulse (Organization tier ONLY) ───────────────────
  it('allows organization to access the program pulse', () => {
    expect(canAccess('organization', 'feature_program_pulse')).toBe(true);
  });

  it('blocks free, coach, and pro_coach from the program pulse (org roll-up surface)', () => {
    expect(canAccess('free', 'feature_program_pulse')).toBe(false);
    expect(canAccess('coach', 'feature_program_pulse')).toBe(false);
    expect(canAccess('pro_coach', 'feature_program_pulse')).toBe(false);
  });

  // ── Ticket 0031 — program weekly focus (Organization tier ONLY) ────────────
  it('allows organization to set the program weekly focus', () => {
    expect(canAccess('organization', 'feature_program_focus')).toBe(true);
  });

  it('blocks free, coach, and pro_coach from setting the program focus (org-direction surface)', () => {
    expect(canAccess('free', 'feature_program_focus')).toBe(false);
    expect(canAccess('coach', 'feature_program_focus')).toBe(false);
    expect(canAccess('pro_coach', 'feature_program_focus')).toBe(false);
  });
});

// ─── getTierLimit ─────────────────────────────────────────────────────────────

describe('getTierLimit', () => {
  it('returns the correct limits for free', () => {
    const limits = getTierLimit('free');
    expect(limits).toEqual(TIER_LIMITS.free);
  });

  it('returns the correct limits for coach', () => {
    const limits = getTierLimit('coach');
    expect(limits).toEqual(TIER_LIMITS.coach);
  });

  it('returns the correct limits for pro_coach', () => {
    const limits = getTierLimit('pro_coach');
    expect(limits).toEqual(TIER_LIMITS.pro_coach);
  });

  it('returns the correct limits for organization', () => {
    const limits = getTierLimit('organization');
    expect(limits).toEqual(TIER_LIMITS.organization);
  });

  it('returned object has features array', () => {
    const limits = getTierLimit('free');
    expect(Array.isArray(limits.features)).toBe(true);
  });
});

// ─── getAudioLimit ────────────────────────────────────────────────────────────

describe('getAudioLimit', () => {
  it('free tier has the lowest upload limit', () => {
    const free = getAudioLimit('free');
    const coach = getAudioLimit('coach');
    expect(free.maxMinutesPerUpload).toBeLessThan(coach.maxMinutesPerUpload);
  });

  it('free tier has no long session allowance', () => {
    const free = getAudioLimit('free');
    expect(free.maxLongSessionsPerMonth).toBe(0);
  });

  it('coach tier allows some long sessions', () => {
    const coach = getAudioLimit('coach');
    expect(coach.maxLongSessionsPerMonth).toBeGreaterThan(0);
  });

  it('pro_coach has higher upload limit than coach', () => {
    const coach = getAudioLimit('coach');
    const pro = getAudioLimit('pro_coach');
    expect(pro.maxMinutesPerUpload).toBeGreaterThanOrEqual(coach.maxMinutesPerUpload);
  });

  it('includes longSessionThresholdSec on all tiers', () => {
    for (const tier of TIERS) {
      const limits = getAudioLimit(tier);
      expect(typeof limits.longSessionThresholdSec).toBe('number');
      expect(limits.longSessionThresholdSec).toBeGreaterThan(0);
    }
  });

  it('organization matches pro_coach audio limits', () => {
    const pro = getAudioLimit('pro_coach');
    const org = getAudioLimit('organization');
    expect(org.maxMinutesPerUpload).toBe(pro.maxMinutesPerUpload);
    expect(org.maxLongSessionsPerMonth).toBe(pro.maxLongSessionsPerMonth);
  });
});
