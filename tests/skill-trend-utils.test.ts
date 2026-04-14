import { describe, it, expect } from 'vitest';
import {
  formatSkillLabel,
  filterByCategory,
  filterNeedsWork,
  filterPositive,
  filterScored,
  calcPositiveRatio,
  getCategories,
  countByCategory,
  getTrendDirection,
  formatTrendDelta,
  getTrendColor,
  getTrendBgColor,
  isSignificantTrend,
  hasEnoughDataForTrends,
  buildSkillTrendForCategory,
  buildSkillTrends,
  getTopImprovingSkills,
  getTopDecliningSkills,
  sortByAbsoluteDelta,
  filterHasEnoughData,
  calculateTeamSkillProfile,
  buildTrendSummary,
  type ObsSlice,
  type SkillTrend,
} from '@/lib/skill-trend-utils';

// ─── helpers ─────────────────────────────────────────────────────────────────

function obs(category: string | null, sentiment: string): ObsSlice {
  return { category, sentiment };
}

const shootingPos = obs('shooting', 'positive');
const shootingNW  = obs('shooting', 'needs-work');
const defensePos  = obs('defense', 'positive');
const defenseNW   = obs('defense', 'needs-work');
const dribblingPos = obs('dribbling', 'positive');
const dribblingNW  = obs('dribbling', 'needs-work');
const neutral     = obs('shooting', 'neutral');
const noCategory  = obs(null, 'positive');

// ─── formatSkillLabel ────────────────────────────────────────────────────────

describe('formatSkillLabel', () => {
  it('maps known slugs to readable labels', () => {
    expect(formatSkillLabel('shooting')).toBe('Shooting');
    expect(formatSkillLabel('dribbling')).toBe('Ball Handling');
    expect(formatSkillLabel('awareness')).toBe('Court Vision');
    expect(formatSkillLabel('teamwork')).toBe('Teamwork');
    expect(formatSkillLabel('conditioning')).toBe('Conditioning');
  });

  it('capitalises unknown slugs', () => {
    expect(formatSkillLabel('rebounding')).toBe('Rebounding');
    expect(formatSkillLabel('blocking')).toBe('Blocking');
  });
});

// ─── filterByCategory ────────────────────────────────────────────────────────

describe('filterByCategory', () => {
  it('returns only observations matching the category', () => {
    const result = filterByCategory([shootingPos, defensePos, shootingNW], 'shooting');
    expect(result).toHaveLength(2);
    expect(result.every((o) => o.category === 'shooting')).toBe(true);
  });

  it('is case-insensitive', () => {
    const upper = obs('Shooting', 'positive');
    const result = filterByCategory([upper, defensePos], 'shooting');
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no match', () => {
    expect(filterByCategory([defensePos], 'shooting')).toHaveLength(0);
  });
});

// ─── filterNeedsWork / filterPositive / filterScored ─────────────────────────

describe('filterNeedsWork', () => {
  it('keeps only needs-work obs', () => {
    const result = filterNeedsWork([shootingPos, shootingNW, neutral]);
    expect(result).toEqual([shootingNW]);
  });
});

describe('filterPositive', () => {
  it('keeps only positive obs', () => {
    const result = filterPositive([shootingPos, shootingNW, neutral]);
    expect(result).toEqual([shootingPos]);
  });
});

describe('filterScored', () => {
  it('excludes neutral observations', () => {
    const result = filterScored([shootingPos, shootingNW, neutral, noCategory]);
    expect(result).toHaveLength(3);
    expect(result.every((o) => o.sentiment !== 'neutral')).toBe(true);
  });
});

// ─── calcPositiveRatio ───────────────────────────────────────────────────────

describe('calcPositiveRatio', () => {
  it('returns 1 when all obs are positive', () => {
    expect(calcPositiveRatio([shootingPos, defensePos])).toBe(1);
  });

  it('returns 0 when all obs are needs-work', () => {
    expect(calcPositiveRatio([shootingNW, defenseNW])).toBe(0);
  });

  it('returns 0.5 for equal split', () => {
    expect(calcPositiveRatio([shootingPos, shootingNW])).toBe(0.5);
  });

  it('ignores neutral observations', () => {
    // 2 positive, 0 needs-work, 1 neutral → ratio = 1
    expect(calcPositiveRatio([shootingPos, defensePos, neutral])).toBe(1);
  });

  it('returns null for empty array', () => {
    expect(calcPositiveRatio([])).toBeNull();
  });

  it('returns null when only neutrals', () => {
    expect(calcPositiveRatio([neutral, neutral])).toBeNull();
  });
});

// ─── getCategories ───────────────────────────────────────────────────────────

describe('getCategories', () => {
  it('returns unique category slugs', () => {
    const cats = getCategories([shootingPos, shootingNW, defensePos]);
    expect(cats.sort()).toEqual(['defense', 'shooting']);
  });

  it('excludes null categories', () => {
    expect(getCategories([noCategory, shootingPos])).toEqual(['shooting']);
  });

  it('returns empty array for empty input', () => {
    expect(getCategories([])).toEqual([]);
  });
});

// ─── countByCategory ─────────────────────────────────────────────────────────

describe('countByCategory', () => {
  it('counts observations per category', () => {
    const map = countByCategory([shootingPos, shootingNW, defensePos]);
    expect(map.get('shooting')).toBe(2);
    expect(map.get('defense')).toBe(1);
  });

  it('ignores null categories', () => {
    const map = countByCategory([noCategory, shootingPos]);
    expect(map.size).toBe(1);
    expect(map.get('shooting')).toBe(1);
  });
});

// ─── getTrendDirection ───────────────────────────────────────────────────────

describe('getTrendDirection', () => {
  it('returns improving for delta >= 0.05', () => {
    expect(getTrendDirection(0.05)).toBe('improving');
    expect(getTrendDirection(0.3)).toBe('improving');
  });

  it('returns declining for delta <= -0.05', () => {
    expect(getTrendDirection(-0.05)).toBe('declining');
    expect(getTrendDirection(-0.8)).toBe('declining');
  });

  it('returns stable for small deltas', () => {
    expect(getTrendDirection(0)).toBe('stable');
    expect(getTrendDirection(0.04)).toBe('stable');
    expect(getTrendDirection(-0.04)).toBe('stable');
  });
});

// ─── formatTrendDelta ────────────────────────────────────────────────────────

describe('formatTrendDelta', () => {
  it('formats a positive delta correctly', () => {
    expect(formatTrendDelta(0.12)).toBe('+12%');
  });

  it('formats a negative delta correctly', () => {
    expect(formatTrendDelta(-0.08)).toBe('−8%');
  });

  it('returns stable for small delta', () => {
    expect(formatTrendDelta(0.03)).toBe('stable');
    expect(formatTrendDelta(-0.02)).toBe('stable');
  });
});

// ─── getTrendColor / getTrendBgColor ─────────────────────────────────────────

describe('getTrendColor', () => {
  it('returns emerald for improving', () => {
    expect(getTrendColor('improving')).toContain('emerald');
  });
  it('returns red for declining', () => {
    expect(getTrendColor('declining')).toContain('red');
  });
  it('returns zinc for stable', () => {
    expect(getTrendColor('stable')).toContain('zinc');
  });
});

describe('getTrendBgColor', () => {
  it('returns emerald bg for improving', () => {
    expect(getTrendBgColor('improving')).toContain('emerald');
  });
  it('returns red bg for declining', () => {
    expect(getTrendBgColor('declining')).toContain('red');
  });
});

// ─── isSignificantTrend ──────────────────────────────────────────────────────

describe('isSignificantTrend', () => {
  const improvingTrend: SkillTrend = {
    category: 'shooting', label: 'Shooting', recentRatio: 0.8, priorRatio: 0.5,
    delta: 0.3, direction: 'improving', recentCount: 5, priorCount: 4,
  };
  const stableTrend: SkillTrend = {
    ...improvingTrend, delta: 0.02, direction: 'stable',
  };
  const lowCountTrend: SkillTrend = {
    ...improvingTrend, recentCount: 1,
  };

  it('returns true for significant improving trend with enough obs', () => {
    expect(isSignificantTrend(improvingTrend)).toBe(true);
  });

  it('returns false for stable trend', () => {
    expect(isSignificantTrend(stableTrend)).toBe(false);
  });

  it('returns false when recentCount is below minObs', () => {
    expect(isSignificantTrend(lowCountTrend, 3)).toBe(false);
  });
});

// ─── hasEnoughDataForTrends ──────────────────────────────────────────────────

describe('hasEnoughDataForTrends', () => {
  it('returns true when recent has enough obs', () => {
    const obs5 = Array(5).fill(shootingPos);
    expect(hasEnoughDataForTrends(obs5, [])).toBe(true);
  });

  it('returns true when prior has enough obs', () => {
    const obs5 = Array(5).fill(shootingPos);
    expect(hasEnoughDataForTrends([], obs5)).toBe(true);
  });

  it('returns false when both windows are too small', () => {
    expect(hasEnoughDataForTrends([shootingPos], [shootingPos])).toBe(false);
  });
});

// ─── buildSkillTrendForCategory ──────────────────────────────────────────────

describe('buildSkillTrendForCategory', () => {
  it('calculates improving trend correctly', () => {
    const recent = [shootingPos, shootingPos, shootingPos, shootingNW]; // 75%
    const prior  = [shootingPos, shootingNW, shootingNW];                // 33%
    const trend = buildSkillTrendForCategory('shooting', recent, prior);
    expect(trend.direction).toBe('improving');
    expect(trend.delta).toBeGreaterThan(0);
    expect(trend.category).toBe('shooting');
    expect(trend.label).toBe('Shooting');
  });

  it('calculates declining trend correctly', () => {
    const recent = [shootingNW, shootingNW, shootingPos];                // 33%
    const prior  = [shootingPos, shootingPos, shootingPos, shootingNW]; // 75%
    const trend = buildSkillTrendForCategory('shooting', recent, prior);
    expect(trend.direction).toBe('declining');
    expect(trend.delta).toBeLessThan(0);
  });

  it('handles no prior data by using 0.5 baseline', () => {
    const recent = [shootingPos, shootingPos, shootingPos]; // 100%
    const trend = buildSkillTrendForCategory('shooting', recent, []);
    // delta = 1.0 - 0.5 = 0.5
    expect(trend.delta).toBeCloseTo(0.5);
    expect(trend.direction).toBe('improving');
    expect(trend.priorRatio).toBeNull();
  });

  it('handles no recent data by using 0.5 baseline', () => {
    const prior = [shootingPos, shootingPos, shootingPos]; // 100%
    const trend = buildSkillTrendForCategory('shooting', [], prior);
    // delta = 0.5 - 1.0 = -0.5
    expect(trend.delta).toBeCloseTo(-0.5);
    expect(trend.direction).toBe('declining');
    expect(trend.recentRatio).toBeNull();
  });

  it('includes correct observation counts', () => {
    const recent = [shootingPos, shootingPos, shootingNW];
    const prior  = [shootingNW, shootingNW];
    const trend = buildSkillTrendForCategory('shooting', recent, prior);
    expect(trend.recentCount).toBe(3);
    expect(trend.priorCount).toBe(2);
  });
});

// ─── buildSkillTrends ────────────────────────────────────────────────────────

describe('buildSkillTrends', () => {
  it('returns one trend per unique category', () => {
    const recent = [shootingPos, defensePos, dribblingNW];
    const prior  = [shootingNW, defenseNW];
    const trends = buildSkillTrends(recent, prior);
    const cats = trends.map((t) => t.category).sort();
    expect(cats).toContain('shooting');
    expect(cats).toContain('defense');
    expect(cats).toContain('dribbling');
  });

  it('includes categories from either window', () => {
    // dribbling only in prior
    const recent = [shootingPos];
    const prior  = [dribblingNW];
    const trends = buildSkillTrends(recent, prior);
    expect(trends.map((t) => t.category).sort()).toEqual(['dribbling', 'shooting']);
  });
});

// ─── getTopImprovingSkills / getTopDecliningSkills ────────────────────────────

describe('getTopImprovingSkills', () => {
  it('returns top N improving skills sorted by delta desc', () => {
    const trends: SkillTrend[] = [
      { category: 'shooting', label: 'Shooting', recentRatio: 0.9, priorRatio: 0.5, delta: 0.4, direction: 'improving', recentCount: 5, priorCount: 4 },
      { category: 'defense',  label: 'Defense',  recentRatio: 0.7, priorRatio: 0.5, delta: 0.2, direction: 'improving', recentCount: 4, priorCount: 3 },
      { category: 'passing',  label: 'Passing',  recentRatio: 0.6, priorRatio: 0.5, delta: 0.1, direction: 'improving', recentCount: 3, priorCount: 3 },
      { category: 'hustle',   label: 'Hustle',   recentRatio: 0.4, priorRatio: 0.45, delta: -0.05, direction: 'declining', recentCount: 4, priorCount: 3 },
    ];
    const top = getTopImprovingSkills(trends, 2);
    expect(top).toHaveLength(2);
    expect(top[0].category).toBe('shooting');
    expect(top[1].category).toBe('defense');
  });

  it('excludes trends below minObs threshold', () => {
    const trends: SkillTrend[] = [
      { category: 'shooting', label: 'Shooting', recentRatio: 0.9, priorRatio: 0.5, delta: 0.4, direction: 'improving', recentCount: 1, priorCount: 0 },
    ];
    expect(getTopImprovingSkills(trends, 3, 3)).toHaveLength(0);
  });
});

describe('getTopDecliningSkills', () => {
  it('returns top N declining skills sorted by delta asc (worst first)', () => {
    const trends: SkillTrend[] = [
      { category: 'shooting', label: 'Shooting', recentRatio: 0.2, priorRatio: 0.7, delta: -0.5, direction: 'declining', recentCount: 5, priorCount: 4 },
      { category: 'defense',  label: 'Defense',  recentRatio: 0.4, priorRatio: 0.6, delta: -0.2, direction: 'declining', recentCount: 4, priorCount: 3 },
      { category: 'hustle',   label: 'Hustle',   recentRatio: 0.9, priorRatio: 0.5, delta: 0.4,  direction: 'improving', recentCount: 4, priorCount: 3 },
    ];
    const top = getTopDecliningSkills(trends, 2);
    expect(top).toHaveLength(2);
    expect(top[0].category).toBe('shooting'); // worst delta first
    expect(top[1].category).toBe('defense');
  });
});

// ─── sortByAbsoluteDelta ─────────────────────────────────────────────────────

describe('sortByAbsoluteDelta', () => {
  it('sorts by |delta| descending', () => {
    const trends: SkillTrend[] = [
      { category: 'a', label: 'A', recentRatio: null, priorRatio: null, delta: 0.1, direction: 'improving', recentCount: 3, priorCount: 2 },
      { category: 'b', label: 'B', recentRatio: null, priorRatio: null, delta: -0.4, direction: 'declining', recentCount: 3, priorCount: 2 },
      { category: 'c', label: 'C', recentRatio: null, priorRatio: null, delta: 0.25, direction: 'improving', recentCount: 3, priorCount: 2 },
    ];
    const sorted = sortByAbsoluteDelta(trends);
    expect(sorted[0].category).toBe('b');
    expect(sorted[1].category).toBe('c');
    expect(sorted[2].category).toBe('a');
  });

  it('does not mutate the input array', () => {
    const trends: SkillTrend[] = [
      { category: 'a', label: 'A', recentRatio: null, priorRatio: null, delta: 0.1, direction: 'improving', recentCount: 3, priorCount: 2 },
    ];
    sortByAbsoluteDelta(trends);
    expect(trends[0].category).toBe('a');
  });
});

// ─── filterHasEnoughData ─────────────────────────────────────────────────────

describe('filterHasEnoughData', () => {
  it('filters out trends with low recent observation count', () => {
    const trends: SkillTrend[] = [
      { category: 'a', label: 'A', recentRatio: 0.8, priorRatio: 0.4, delta: 0.4, direction: 'improving', recentCount: 5, priorCount: 3 },
      { category: 'b', label: 'B', recentRatio: 0.3, priorRatio: 0.7, delta: -0.4, direction: 'declining', recentCount: 2, priorCount: 3 },
    ];
    const filtered = filterHasEnoughData(trends, 3);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category).toBe('a');
  });
});

// ─── calculateTeamSkillProfile ────────────────────────────────────────────────

describe('calculateTeamSkillProfile', () => {
  it('returns overall positive ratio', () => {
    const obs = [shootingPos, shootingPos, defenseNW, dribblingPos]; // 3/4 = 0.75
    expect(calculateTeamSkillProfile(obs)).toBeCloseTo(0.75);
  });

  it('returns null for empty obs', () => {
    expect(calculateTeamSkillProfile([])).toBeNull();
  });

  it('excludes neutrals from calculation', () => {
    const obs = [shootingPos, neutral]; // only 1 scored
    expect(calculateTeamSkillProfile(obs)).toBe(1);
  });
});

// ─── buildTrendSummary ───────────────────────────────────────────────────────

describe('buildTrendSummary', () => {
  const trend = (cat: string, dir: 'improving' | 'declining'): SkillTrend => ({
    category: cat, label: cat, recentRatio: 0.5, priorRatio: 0.5,
    delta: dir === 'improving' ? 0.2 : -0.2, direction: dir,
    recentCount: 5, priorCount: 4,
  });

  it('returns stable when both lists are empty', () => {
    expect(buildTrendSummary([], [])).toBe('stable');
  });

  it('includes improving count', () => {
    const summary = buildTrendSummary([trend('a', 'improving'), trend('b', 'improving')], []);
    expect(summary).toContain('2 improving');
  });

  it('includes declining count', () => {
    const summary = buildTrendSummary([], [trend('c', 'declining')]);
    expect(summary).toContain('1 declining');
  });

  it('includes both when present', () => {
    const summary = buildTrendSummary([trend('a', 'improving')], [trend('b', 'declining')]);
    expect(summary).toContain('improving');
    expect(summary).toContain('declining');
  });
});
