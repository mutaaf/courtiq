import { describe, it, expect } from 'vitest';
import {
  getImprovingSkills,
  getDecliningSkills,
  getPlateauSkills,
  getMostImprovedSkill,
  countImprovingSkills,
  countDecliningSkills,
  hasAnyImprovingSkill,
  formatProficiencyLabel,
  groupObsByCategory,
  getObsAfterDate,
  getObsBeforeDate,
  getObsBetweenDates,
  getMostActiveCategory,
  buildSkillActivityData,
  getMostSurgingCategory,
  buildSeasonStats,
  formatCategoryLabel,
  buildProgressMessage,
  getTrendIcon,
  getTrendColor,
  sortSkillsByImprovingFirst,
  filterSkillsWithTrend,
  hasEnoughDataForJourney,
} from '../src/lib/skill-journey-utils';
import type { SkillProgress, ShareObservation } from '../src/lib/skill-journey-utils';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function skill(overrides: Partial<SkillProgress> = {}): SkillProgress {
  return {
    skill_id: 'dribbling',
    skill_name: 'Dribbling',
    proficiency_level: 'practicing',
    success_rate: 0.6,
    trend: null,
    category: 'dribbling',
    ...overrides,
  };
}

const now = new Date('2025-04-23T12:00:00Z');
const daysAgo = (d: number) =>
  new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

function obs(overrides: Partial<ShareObservation> = {}): ShareObservation {
  return {
    category: 'dribbling',
    sentiment: 'positive',
    text: 'Great dribbling',
    created_at: daysAgo(3),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getImprovingSkills
// ---------------------------------------------------------------------------

describe('getImprovingSkills', () => {
  it('returns only improving skills', () => {
    const skills = [
      skill({ trend: 'improving' }),
      skill({ skill_id: 'passing', trend: 'plateau' }),
      skill({ skill_id: 'defense', trend: 'declining' }),
    ];
    expect(getImprovingSkills(skills)).toHaveLength(1);
    expect(getImprovingSkills(skills)[0].skill_id).toBe('dribbling');
  });

  it('returns empty array when no improving skills', () => {
    expect(getImprovingSkills([skill({ trend: 'plateau' })])).toHaveLength(0);
  });

  it('handles empty array', () => {
    expect(getImprovingSkills([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getDecliningSkills / getPlateauSkills
// ---------------------------------------------------------------------------

describe('getDecliningSkills', () => {
  it('filters correctly', () => {
    const skills = [skill({ trend: 'declining' }), skill({ skill_id: 'x', trend: 'improving' })];
    expect(getDecliningSkills(skills)).toHaveLength(1);
  });
});

describe('getPlateauSkills', () => {
  it('filters correctly', () => {
    const skills = [skill({ trend: 'plateau' }), skill({ skill_id: 'x', trend: null })];
    expect(getPlateauSkills(skills)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getMostImprovedSkill
// ---------------------------------------------------------------------------

describe('getMostImprovedSkill', () => {
  it('returns null when no improving skills', () => {
    expect(getMostImprovedSkill([skill({ trend: 'plateau' })])).toBeNull();
  });

  it('returns single improving skill', () => {
    const s = skill({ trend: 'improving' });
    expect(getMostImprovedSkill([s])).toBe(s);
  });

  it('prefers higher proficiency level as tiebreaker', () => {
    const gr = skill({ skill_id: 'a', trend: 'improving', proficiency_level: 'game_ready' });
    const pr = skill({ skill_id: 'b', trend: 'improving', proficiency_level: 'practicing' });
    expect(getMostImprovedSkill([pr, gr])?.skill_id).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// countImprovingSkills / countDecliningSkills / hasAnyImprovingSkill
// ---------------------------------------------------------------------------

describe('countImprovingSkills', () => {
  it('counts correctly', () => {
    const skills = [skill({ trend: 'improving' }), skill({ skill_id: 'x', trend: 'improving' }), skill({ skill_id: 'y', trend: 'plateau' })];
    expect(countImprovingSkills(skills)).toBe(2);
  });
});

describe('countDecliningSkills', () => {
  it('counts correctly', () => {
    expect(countDecliningSkills([skill({ trend: 'declining' })])).toBe(1);
    expect(countDecliningSkills([skill({ trend: 'improving' })])).toBe(0);
  });
});

describe('hasAnyImprovingSkill', () => {
  it('returns true when at least one improving', () => {
    expect(hasAnyImprovingSkill([skill({ trend: 'improving' })])).toBe(true);
  });
  it('returns false when none improving', () => {
    expect(hasAnyImprovingSkill([skill({ trend: 'plateau' })])).toBe(false);
  });
  it('returns false on empty array', () => {
    expect(hasAnyImprovingSkill([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatProficiencyLabel
// ---------------------------------------------------------------------------

describe('formatProficiencyLabel', () => {
  it('maps all known levels', () => {
    expect(formatProficiencyLabel('exploring')).toBe('Exploring');
    expect(formatProficiencyLabel('practicing')).toBe('Practicing');
    expect(formatProficiencyLabel('got_it')).toBe('Got It!');
    expect(formatProficiencyLabel('game_ready')).toBe('Game Ready');
  });
  it('defaults to Exploring for unknown', () => {
    expect(formatProficiencyLabel('unknown')).toBe('Exploring');
    expect(formatProficiencyLabel(null)).toBe('Exploring');
  });
});

// ---------------------------------------------------------------------------
// groupObsByCategory
// ---------------------------------------------------------------------------

describe('groupObsByCategory', () => {
  it('groups observations by category', () => {
    const observations = [
      obs({ category: 'dribbling' }),
      obs({ category: 'passing' }),
      obs({ category: 'dribbling' }),
    ];
    const groups = groupObsByCategory(observations);
    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups['dribbling']).toHaveLength(2);
    expect(groups['passing']).toHaveLength(1);
  });

  it('uses "general" for null category', () => {
    const observations = [obs({ category: null })];
    const groups = groupObsByCategory(observations);
    expect(groups['general']).toHaveLength(1);
  });

  it('returns empty object for empty array', () => {
    expect(groupObsByCategory([])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// getObsAfterDate / getObsBeforeDate / getObsBetweenDates
// ---------------------------------------------------------------------------

describe('getObsAfterDate', () => {
  it('returns obs on or after the date', () => {
    const threshold = new Date(daysAgo(5));
    const observations = [obs({ created_at: daysAgo(3) }), obs({ created_at: daysAgo(10) })];
    expect(getObsAfterDate(observations, threshold)).toHaveLength(1);
  });
});

describe('getObsBeforeDate', () => {
  it('returns obs before the date', () => {
    const threshold = new Date(daysAgo(5));
    const observations = [obs({ created_at: daysAgo(3) }), obs({ created_at: daysAgo(10) })];
    expect(getObsBeforeDate(observations, threshold)).toHaveLength(1);
  });
});

describe('getObsBetweenDates', () => {
  it('returns obs within range', () => {
    const from = new Date(daysAgo(15));
    const to = new Date(daysAgo(5));
    const observations = [
      obs({ created_at: daysAgo(3) }),  // too recent
      obs({ created_at: daysAgo(10) }), // in range
      obs({ created_at: daysAgo(20) }), // too old
    ];
    expect(getObsBetweenDates(observations, from, to)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getMostActiveCategory
// ---------------------------------------------------------------------------

describe('getMostActiveCategory', () => {
  it('returns the category with most observations', () => {
    const observations = [
      obs({ category: 'dribbling' }),
      obs({ category: 'dribbling' }),
      obs({ category: 'passing' }),
    ];
    expect(getMostActiveCategory(observations)).toBe('dribbling');
  });

  it('returns null for empty array', () => {
    expect(getMostActiveCategory([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildSkillActivityData
// ---------------------------------------------------------------------------

describe('buildSkillActivityData', () => {
  it('computes recent and prior counts correctly', () => {
    const observations = [
      obs({ category: 'dribbling', created_at: daysAgo(5) }),   // recent
      obs({ category: 'dribbling', created_at: daysAgo(5) }),   // recent
      obs({ category: 'dribbling', created_at: daysAgo(20) }),  // prior
      obs({ category: 'passing', created_at: daysAgo(20) }),    // prior
    ];
    const activity = buildSkillActivityData(observations, now);
    const dribbling = activity.find((a) => a.category === 'dribbling')!;
    expect(dribbling.recentCount).toBe(2);
    expect(dribbling.priorCount).toBe(1);
    expect(dribbling.delta).toBe(1);
  });

  it('sorts by recent count descending', () => {
    const observations = [
      obs({ category: 'passing', created_at: daysAgo(5) }),
      obs({ category: 'dribbling', created_at: daysAgo(5) }),
      obs({ category: 'dribbling', created_at: daysAgo(5) }),
    ];
    const activity = buildSkillActivityData(observations, now);
    expect(activity[0].category).toBe('dribbling');
  });

  it('returns empty array for no observations', () => {
    expect(buildSkillActivityData([], now)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getMostSurgingCategory
// ---------------------------------------------------------------------------

describe('getMostSurgingCategory', () => {
  it('returns category with highest positive delta', () => {
    const data = [
      { category: 'dribbling', recentCount: 5, priorCount: 1, delta: 4 },
      { category: 'passing', recentCount: 3, priorCount: 2, delta: 1 },
    ];
    expect(getMostSurgingCategory(data)?.category).toBe('dribbling');
  });

  it('returns null for empty array', () => {
    expect(getMostSurgingCategory([])).toBeNull();
  });

  it('returns null when all recent counts are zero', () => {
    const data = [{ category: 'dribbling', recentCount: 0, priorCount: 2, delta: -2 }];
    expect(getMostSurgingCategory(data)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildSeasonStats
// ---------------------------------------------------------------------------

describe('buildSeasonStats', () => {
  it('computes all fields correctly', () => {
    const observations = [
      obs({ category: 'dribbling', created_at: daysAgo(5) }),
      obs({ category: 'dribbling', created_at: daysAgo(10) }),
      obs({ category: 'passing', created_at: daysAgo(20) }),
    ];
    const skills = [skill({ trend: 'improving' }), skill({ skill_id: 'x', trend: 'plateau' })];
    const stats = buildSeasonStats(observations, skills, now);
    expect(stats.totalObservations).toBe(3);
    expect(stats.improvingSkillCount).toBe(1);
    expect(stats.mostActiveCategory).toBe('dribbling');
    expect(stats.recentObsCount).toBe(2); // last 14 days: daysAgo(5) and daysAgo(10)
  });

  it('handles empty inputs', () => {
    const stats = buildSeasonStats([], [], now);
    expect(stats.totalObservations).toBe(0);
    expect(stats.improvingSkillCount).toBe(0);
    expect(stats.mostActiveCategory).toBeNull();
    expect(stats.recentObsCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatCategoryLabel
// ---------------------------------------------------------------------------

describe('formatCategoryLabel', () => {
  it('capitalises first letter', () => {
    expect(formatCategoryLabel('dribbling')).toBe('Dribbling');
  });
  it('replaces underscores with spaces', () => {
    expect(formatCategoryLabel('ball_handling')).toBe('Ball handling');
  });
  it('returns "General" for null', () => {
    expect(formatCategoryLabel(null)).toBe('General');
  });
});

// ---------------------------------------------------------------------------
// buildProgressMessage
// ---------------------------------------------------------------------------

describe('buildProgressMessage', () => {
  it('returns improving-focused message when 2+ improving skills', () => {
    const improving = [
      skill({ trend: 'improving' }),
      skill({ skill_id: 'x', trend: 'improving' }),
    ];
    const msg = buildProgressMessage('Emma', improving, 10);
    expect(msg).toContain('2 skill areas');
  });

  it('returns single-skill message when 1 improving skill', () => {
    const improving = [skill({ trend: 'improving', category: 'dribbling' })];
    const msg = buildProgressMessage('Emma', improving, 10);
    expect(msg).toContain('Emma');
    expect(msg).toContain('Dribbling');
  });

  it('falls back to observation count when no improving skills', () => {
    const msg = buildProgressMessage('Emma', [], 15);
    expect(msg).toContain('15');
  });

  it('handles zero observations and no improving skills', () => {
    const msg = buildProgressMessage('Emma', [], 0);
    expect(msg).toContain('getting started');
  });
});

// ---------------------------------------------------------------------------
// getTrendIcon / getTrendColor
// ---------------------------------------------------------------------------

describe('getTrendIcon', () => {
  it('maps improving to up arrow', () => {
    expect(getTrendIcon('improving')).toBe('↑');
  });
  it('maps declining to down arrow', () => {
    expect(getTrendIcon('declining')).toBe('↓');
  });
  it('defaults to right arrow', () => {
    expect(getTrendIcon(null)).toBe('→');
    expect(getTrendIcon('plateau')).toBe('→');
  });
});

describe('getTrendColor', () => {
  it('maps improving to emerald', () => {
    expect(getTrendColor('improving')).toBe('emerald');
  });
  it('maps declining to amber', () => {
    expect(getTrendColor('declining')).toBe('amber');
  });
  it('defaults to gray', () => {
    expect(getTrendColor(null)).toBe('gray');
  });
});

// ---------------------------------------------------------------------------
// sortSkillsByImprovingFirst
// ---------------------------------------------------------------------------

describe('sortSkillsByImprovingFirst', () => {
  it('sorts improving before plateau before null before declining', () => {
    const skills = [
      skill({ skill_id: 'd', trend: 'declining' }),
      skill({ skill_id: 'n', trend: null }),
      skill({ skill_id: 'p', trend: 'plateau' }),
      skill({ skill_id: 'i', trend: 'improving' }),
    ];
    const sorted = sortSkillsByImprovingFirst(skills);
    expect(sorted[0].skill_id).toBe('i');
    expect(sorted[3].skill_id).toBe('d');
  });

  it('does not mutate original array', () => {
    const original = [skill({ trend: 'declining' }), skill({ skill_id: 'x', trend: 'improving' })];
    sortSkillsByImprovingFirst(original);
    expect(original[0].trend).toBe('declining');
  });
});

// ---------------------------------------------------------------------------
// filterSkillsWithTrend
// ---------------------------------------------------------------------------

describe('filterSkillsWithTrend', () => {
  it('excludes skills with null trend', () => {
    const skills = [
      skill({ trend: 'improving' }),
      skill({ skill_id: 'x', trend: null }),
      skill({ skill_id: 'y', trend: 'plateau' }),
    ];
    expect(filterSkillsWithTrend(skills)).toHaveLength(2);
  });

  it('returns empty array when all null', () => {
    expect(filterSkillsWithTrend([skill({ trend: null })])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// hasEnoughDataForJourney
// ---------------------------------------------------------------------------

describe('hasEnoughDataForJourney', () => {
  it('returns true when 3+ observations', () => {
    const observations = [obs(), obs(), obs()];
    expect(hasEnoughDataForJourney(observations, [])).toBe(true);
  });

  it('returns true when 1+ skills even with < 3 obs', () => {
    expect(hasEnoughDataForJourney([obs()], [skill()])).toBe(true);
  });

  it('returns false when < 3 obs and no skills', () => {
    expect(hasEnoughDataForJourney([obs(), obs()], [])).toBe(false);
  });

  it('returns false for empty inputs', () => {
    expect(hasEnoughDataForJourney([], [])).toBe(false);
  });
});
