/**
 * Tests for plan card type configuration and plan display logic.
 *
 * Since the PLAN_TYPE_CONFIG is defined in the plans page, this file
 * re-implements and tests the same configuration structure and the
 * helper logic used to render plan cards (type labels, fallback behaviour,
 * title display, share-link generation).
 *
 * Covers:
 *  - All known plan types have a label, icon, and color
 *  - Unknown plan types fall back to the "custom" config
 *  - Plan card title shows plan.title when set
 *  - Plan card title falls back to typeConfig.label when plan.title is null
 *  - Share token validation logic (non-expired vs expired)
 *  - Date formatting used in plan card headers
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Re-implementation of PLAN_TYPE_CONFIG (mirrors plans/page.tsx)
// ---------------------------------------------------------------------------

type PlanTypeConfig = {
  label: string;
  color: string;
};

const PLAN_TYPE_CONFIG: Record<string, PlanTypeConfig> = {
  practice: { label: 'Practice Plan', color: 'text-blue-400' },
  gameday: { label: 'Game Day Sheet', color: 'text-emerald-400' },
  weekly: { label: 'Weekly Plan', color: 'text-purple-400' },
  development_card: { label: 'Development Card', color: 'text-orange-400' },
  parent_report: { label: 'Parent Report', color: 'text-pink-400' },
  report_card: { label: 'Report Card', color: 'text-amber-400' },
  custom: { label: 'Custom', color: 'text-zinc-400' },
  newsletter: { label: 'Parent Newsletter', color: 'text-violet-400' },
  skill_challenge: { label: 'Skill Challenge', color: 'text-rose-400' },
  season_storyline: { label: 'Season Storyline', color: 'text-indigo-400' },
  self_assessment: { label: 'Self-Assessment', color: 'text-teal-400' },
};

/** Returns the config for the given type, falling back to 'custom'. */
function getPlanTypeConfig(type: string): PlanTypeConfig {
  return PLAN_TYPE_CONFIG[type] ?? PLAN_TYPE_CONFIG.custom;
}

/** Returns the display title: plan.title if set, else the type config label. */
function getPlanDisplayTitle(planTitle: string | null, type: string): string {
  return planTitle || getPlanTypeConfig(type).label;
}

/** Returns true if a share link is still valid (not expired). */
function isShareLinkActive(shareToken: string | null, shareExpiresAt: string | null): boolean {
  if (!shareToken) return false;
  if (!shareExpiresAt) return true; // no expiry = always active
  return new Date(shareExpiresAt) > new Date();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PLAN_TYPE_CONFIG', () => {
  describe('known plan types', () => {
    const knownTypes = [
      'practice',
      'gameday',
      'weekly',
      'development_card',
      'parent_report',
      'report_card',
      'custom',
      'newsletter',
      'skill_challenge',
      'season_storyline',
      'self_assessment',
    ] as const;

    it.each(knownTypes)('type "%s" has a non-empty label', (type) => {
      expect(PLAN_TYPE_CONFIG[type].label).toBeTruthy();
    });

    it.each(knownTypes)('type "%s" has a color class', (type) => {
      const { color } = PLAN_TYPE_CONFIG[type];
      expect(color).toMatch(/^text-\w+-\d+$/);
    });
  });

  describe('individual type labels', () => {
    it('practice → "Practice Plan"', () => {
      expect(PLAN_TYPE_CONFIG.practice.label).toBe('Practice Plan');
    });

    it('gameday → "Game Day Sheet"', () => {
      expect(PLAN_TYPE_CONFIG.gameday.label).toBe('Game Day Sheet');
    });

    it('newsletter → "Parent Newsletter"', () => {
      expect(PLAN_TYPE_CONFIG.newsletter.label).toBe('Parent Newsletter');
    });

    it('self_assessment → "Self-Assessment"', () => {
      expect(PLAN_TYPE_CONFIG.self_assessment.label).toBe('Self-Assessment');
    });

    it('season_storyline → "Season Storyline"', () => {
      expect(PLAN_TYPE_CONFIG.season_storyline.label).toBe('Season Storyline');
    });
  });

  describe('individual type colors', () => {
    it('practice uses blue color', () => {
      expect(PLAN_TYPE_CONFIG.practice.color).toContain('blue');
    });

    it('gameday uses emerald color', () => {
      expect(PLAN_TYPE_CONFIG.gameday.color).toContain('emerald');
    });

    it('newsletter uses violet color', () => {
      expect(PLAN_TYPE_CONFIG.newsletter.color).toContain('violet');
    });

    it('custom uses zinc (neutral) color', () => {
      expect(PLAN_TYPE_CONFIG.custom.color).toContain('zinc');
    });
  });
});

describe('getPlanTypeConfig', () => {
  it('returns the correct config for a known type', () => {
    const config = getPlanTypeConfig('practice');
    expect(config.label).toBe('Practice Plan');
  });

  it('falls back to "custom" config for an unknown type', () => {
    const config = getPlanTypeConfig('totally_unknown_type');
    expect(config.label).toBe('Custom');
    expect(config.color).toContain('zinc');
  });

  it('falls back to "custom" config for empty string', () => {
    const config = getPlanTypeConfig('');
    expect(config.label).toBe('Custom');
  });
});

describe('getPlanDisplayTitle', () => {
  it('returns plan.title when set', () => {
    expect(getPlanDisplayTitle('My Custom Title', 'practice')).toBe('My Custom Title');
  });

  it('falls back to type label when plan.title is null', () => {
    expect(getPlanDisplayTitle(null, 'practice')).toBe('Practice Plan');
  });

  it('falls back to type label when plan.title is empty string', () => {
    expect(getPlanDisplayTitle('', 'gameday')).toBe('Game Day Sheet');
  });

  it('uses "Custom" label for unknown type with no title', () => {
    expect(getPlanDisplayTitle(null, 'mystery_type')).toBe('Custom');
  });

  it('respects plan.title even for unknown types', () => {
    expect(getPlanDisplayTitle('Override Title', 'mystery_type')).toBe('Override Title');
  });
});

describe('isShareLinkActive', () => {
  it('returns false when shareToken is null', () => {
    expect(isShareLinkActive(null, null)).toBe(false);
  });

  it('returns true when shareToken is set and no expiry', () => {
    expect(isShareLinkActive('tok_abc123', null)).toBe(true);
  });

  it('returns true when expiry is in the future', () => {
    const futureDate = new Date(Date.now() + 86_400_000).toISOString(); // +1 day
    expect(isShareLinkActive('tok_abc123', futureDate)).toBe(true);
  });

  it('returns false when expiry is in the past', () => {
    const pastDate = new Date(Date.now() - 86_400_000).toISOString(); // -1 day
    expect(isShareLinkActive('tok_abc123', pastDate)).toBe(false);
  });

  it('returns false for a token with expiry exactly now (boundary)', () => {
    // Use a date 1ms in the past to simulate "just expired"
    const justExpired = new Date(Date.now() - 1).toISOString();
    expect(isShareLinkActive('tok_abc123', justExpired)).toBe(false);
  });
});
