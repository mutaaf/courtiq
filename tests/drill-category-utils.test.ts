import { describe, it, expect } from 'vitest';
import {
  extractCategories,
  normalizeCategoryName,
  countDrillsInCategory,
  isCategoryFromSkillGap,
  getCategoriesForSkillGaps,
  matchesCategoryFilter,
  sortCategoriesByGap,
  buildCategoryChips,
  getCategoryIcon,
  hasMultipleCategories,
  getAllCategoryLabels,
  getGapCategoryChips,
  countTotalDrillsInChips,
  computeTopGapCategories,
  type CategoryChip,
} from '@/lib/drill-category-utils';

const DRILLS = [
  { category: 'Dribbling' },
  { category: 'dribbling' },
  { category: 'Passing' },
  { category: 'Shooting' },
  { category: '' },
];

// ── normalizeCategoryName ─────────────────────────────────────────────────────

describe('normalizeCategoryName', () => {
  it('capitalizes first letter and lowercases rest', () => {
    expect(normalizeCategoryName('DRIBBLING')).toBe('Dribbling');
    expect(normalizeCategoryName('passing')).toBe('Passing');
    expect(normalizeCategoryName('ShOoTiNg')).toBe('Shooting');
  });

  it('trims whitespace', () => {
    expect(normalizeCategoryName('  Dribbling  ')).toBe('Dribbling');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeCategoryName('')).toBe('');
    expect(normalizeCategoryName('   ')).toBe('');
  });

  it('handles single character', () => {
    expect(normalizeCategoryName('a')).toBe('A');
  });
});

// ── extractCategories ─────────────────────────────────────────────────────────

describe('extractCategories', () => {
  it('deduplicates categories (case-insensitive)', () => {
    const cats = extractCategories(DRILLS);
    expect(cats.filter((c) => c === 'Dribbling')).toHaveLength(1);
  });

  it('excludes empty categories', () => {
    const cats = extractCategories(DRILLS);
    expect(cats).not.toContain('');
  });

  it('returns normalized names', () => {
    const cats = extractCategories([{ category: 'PASSING' }]);
    expect(cats).toContain('Passing');
  });

  it('returns empty array for empty input', () => {
    expect(extractCategories([])).toEqual([]);
  });

  it('preserves order of first occurrence', () => {
    const drills = [
      { category: 'Shooting' },
      { category: 'Dribbling' },
      { category: 'Passing' },
    ];
    const cats = extractCategories(drills);
    expect(cats[0]).toBe('Shooting');
    expect(cats[1]).toBe('Dribbling');
  });
});

// ── countDrillsInCategory ─────────────────────────────────────────────────────

describe('countDrillsInCategory', () => {
  it('counts drills in a category (case-insensitive)', () => {
    expect(countDrillsInCategory(DRILLS, 'Dribbling')).toBe(2);
    expect(countDrillsInCategory(DRILLS, 'dribbling')).toBe(2);
  });

  it('returns 0 for non-existent category', () => {
    expect(countDrillsInCategory(DRILLS, 'Defense')).toBe(0);
  });

  it('counts a single-category drill correctly', () => {
    expect(countDrillsInCategory(DRILLS, 'Shooting')).toBe(1);
  });

  it('handles empty drill array', () => {
    expect(countDrillsInCategory([], 'Dribbling')).toBe(0);
  });
});

// ── isCategoryFromSkillGap ────────────────────────────────────────────────────

describe('isCategoryFromSkillGap', () => {
  it('returns true when category matches a gap exactly', () => {
    expect(isCategoryFromSkillGap('Dribbling', ['dribbling', 'passing'])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isCategoryFromSkillGap('PASSING', ['passing'])).toBe(true);
  });

  it('returns false when no gaps match', () => {
    expect(isCategoryFromSkillGap('Shooting', ['dribbling', 'passing'])).toBe(false);
  });

  it('returns false when gaps array is empty', () => {
    expect(isCategoryFromSkillGap('Dribbling', [])).toBe(false);
  });

  it('handles partial matches (substring)', () => {
    expect(isCategoryFromSkillGap('Dribbling', ['Dribbl'])).toBe(true);
    expect(isCategoryFromSkillGap('Drib', ['Dribbling'])).toBe(true);
  });
});

// ── getCategoriesForSkillGaps ─────────────────────────────────────────────────

describe('getCategoriesForSkillGaps', () => {
  it('returns categories matching the gaps', () => {
    const result = getCategoriesForSkillGaps(
      ['dribbling'],
      ['Dribbling', 'Passing', 'Shooting'],
    );
    expect(result).toContain('Dribbling');
    expect(result).not.toContain('Passing');
  });

  it('returns empty array when no matches', () => {
    expect(
      getCategoriesForSkillGaps(['defense'], ['Dribbling', 'Passing']),
    ).toEqual([]);
  });

  it('handles empty available categories', () => {
    expect(getCategoriesForSkillGaps(['dribbling'], [])).toEqual([]);
  });
});

// ── matchesCategoryFilter ─────────────────────────────────────────────────────

describe('matchesCategoryFilter', () => {
  it('returns true when no filter is selected', () => {
    expect(matchesCategoryFilter({ category: 'Dribbling' }, null)).toBe(true);
  });

  it('returns true when drill matches the selected category', () => {
    expect(matchesCategoryFilter({ category: 'Dribbling' }, 'Dribbling')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesCategoryFilter({ category: 'dribbling' }, 'Dribbling')).toBe(true);
    expect(matchesCategoryFilter({ category: 'Dribbling' }, 'dribbling')).toBe(true);
  });

  it('returns false when drill does not match', () => {
    expect(matchesCategoryFilter({ category: 'Passing' }, 'Dribbling')).toBe(false);
  });
});

// ── sortCategoriesByGap ───────────────────────────────────────────────────────

describe('sortCategoriesByGap', () => {
  it('places gap categories first', () => {
    const cats = ['Shooting', 'Dribbling', 'Passing'];
    const sorted = sortCategoriesByGap(cats, ['passing']);
    expect(sorted[0]).toBe('Passing');
  });

  it('sorts alphabetically within each group', () => {
    const cats = ['Shooting', 'Dribbling', 'Conditioning', 'Passing'];
    const sorted = sortCategoriesByGap(cats, ['dribbling', 'passing']);
    expect(sorted[0]).toBe('Dribbling');
    expect(sorted[1]).toBe('Passing');
    // Non-gap should be alpha: Conditioning before Shooting
    expect(sorted.indexOf('Conditioning')).toBeLessThan(sorted.indexOf('Shooting'));
  });

  it('does not mutate input array', () => {
    const cats = ['Shooting', 'Dribbling'];
    sortCategoriesByGap(cats, ['shooting']);
    expect(cats[0]).toBe('Shooting');
  });

  it('handles empty arrays', () => {
    expect(sortCategoriesByGap([], [])).toEqual([]);
  });
});

// ── buildCategoryChips ────────────────────────────────────────────────────────

describe('buildCategoryChips', () => {
  it('builds chips with correct count and gap flag', () => {
    const drills = [
      { category: 'Dribbling' },
      { category: 'Dribbling' },
      { category: 'Passing' },
    ];
    const chips = buildCategoryChips(drills, ['dribbling']);
    const drib = chips.find((c) => c.label === 'Dribbling');
    const pass = chips.find((c) => c.label === 'Passing');
    expect(drib?.count).toBe(2);
    expect(drib?.isGap).toBe(true);
    expect(pass?.isGap).toBe(false);
  });

  it('returns empty array for empty drills', () => {
    expect(buildCategoryChips([], [])).toEqual([]);
  });

  it('gap chips appear first in the result', () => {
    const drills = [
      { category: 'Shooting' },
      { category: 'Dribbling' },
    ];
    const chips = buildCategoryChips(drills, ['shooting']);
    expect(chips[0].label).toBe('Shooting');
  });
});

// ── getCategoryIcon ───────────────────────────────────────────────────────────

describe('getCategoryIcon', () => {
  it('returns 🏀 for dribbling', () => {
    expect(getCategoryIcon('Dribbling')).toBe('🏀');
    expect(getCategoryIcon('dribbling')).toBe('🏀');
  });

  it('returns 🤝 for passing', () => {
    expect(getCategoryIcon('Passing')).toBe('🤝');
  });

  it('returns 🎯 for shooting', () => {
    expect(getCategoryIcon('Shooting')).toBe('🎯');
  });

  it('returns 🛡️ for defense', () => {
    expect(getCategoryIcon('Defense')).toBe('🛡️');
  });

  it('returns 🔥 for warmup', () => {
    expect(getCategoryIcon('Warmup')).toBe('🔥');
    expect(getCategoryIcon('warm-up')).toBe('🔥');
  });

  it('returns a fallback for unknown categories', () => {
    expect(getCategoryIcon('UnknownXYZ').length).toBeGreaterThan(0);
  });
});

// ── hasMultipleCategories ─────────────────────────────────────────────────────

describe('hasMultipleCategories', () => {
  it('returns false for empty drills', () => {
    expect(hasMultipleCategories([])).toBe(false);
  });

  it('returns false for single category', () => {
    expect(hasMultipleCategories([{ category: 'Dribbling' }, { category: 'dribbling' }])).toBe(false);
  });

  it('returns true for multiple categories', () => {
    expect(hasMultipleCategories([{ category: 'Dribbling' }, { category: 'Passing' }])).toBe(true);
  });
});

// ── getAllCategoryLabels ───────────────────────────────────────────────────────

describe('getAllCategoryLabels', () => {
  it('extracts labels from chips', () => {
    const chips: CategoryChip[] = [
      { label: 'Dribbling', count: 3, isGap: true },
      { label: 'Passing', count: 2, isGap: false },
    ];
    expect(getAllCategoryLabels(chips)).toEqual(['Dribbling', 'Passing']);
  });

  it('returns empty array for empty chips', () => {
    expect(getAllCategoryLabels([])).toEqual([]);
  });
});

// ── getGapCategoryChips ───────────────────────────────────────────────────────

describe('getGapCategoryChips', () => {
  it('returns only gap chips', () => {
    const chips: CategoryChip[] = [
      { label: 'Dribbling', count: 3, isGap: true },
      { label: 'Passing', count: 2, isGap: false },
      { label: 'Shooting', count: 1, isGap: true },
    ];
    const gaps = getGapCategoryChips(chips);
    expect(gaps).toHaveLength(2);
    expect(gaps.every((c) => c.isGap)).toBe(true);
  });

  it('returns empty array when no gaps', () => {
    const chips: CategoryChip[] = [{ label: 'Passing', count: 2, isGap: false }];
    expect(getGapCategoryChips(chips)).toHaveLength(0);
  });
});

// ── countTotalDrillsInChips ───────────────────────────────────────────────────

describe('countTotalDrillsInChips', () => {
  it('sums all counts', () => {
    const chips: CategoryChip[] = [
      { label: 'Dribbling', count: 3, isGap: true },
      { label: 'Passing', count: 2, isGap: false },
    ];
    expect(countTotalDrillsInChips(chips)).toBe(5);
  });

  it('returns 0 for empty chips', () => {
    expect(countTotalDrillsInChips([])).toBe(0);
  });
});

// ── computeTopGapCategories ───────────────────────────────────────────────────

describe('computeTopGapCategories', () => {
  it('returns top categories by observation count', () => {
    const obs = [
      { category: 'Dribbling' },
      { category: 'Dribbling' },
      { category: 'Dribbling' },
      { category: 'Passing' },
      { category: 'Passing' },
      { category: 'Shooting' },
    ];
    const result = computeTopGapCategories(obs, 2);
    expect(result[0]).toBe('Dribbling');
    expect(result[1]).toBe('Passing');
    expect(result).toHaveLength(2);
  });

  it('defaults to top 3 when limit omitted', () => {
    const obs = [
      { category: 'A' },
      { category: 'B' },
      { category: 'C' },
      { category: 'D' },
    ];
    expect(computeTopGapCategories(obs)).toHaveLength(3);
  });

  it('returns empty array when no observations', () => {
    expect(computeTopGapCategories([])).toEqual([]);
  });

  it('skips observations with null or missing category', () => {
    const obs = [
      { category: null },
      { category: undefined },
      { category: 'Dribbling' },
    ];
    const result = computeTopGapCategories(obs);
    expect(result).toEqual(['Dribbling']);
  });

  it('returns fewer than limit when not enough distinct categories', () => {
    const obs = [{ category: 'Dribbling' }, { category: 'Passing' }];
    const result = computeTopGapCategories(obs, 5);
    expect(result).toHaveLength(2);
  });

  it('preserves the original category string (no normalization)', () => {
    const obs = [{ category: 'dribbling' }, { category: 'dribbling' }];
    expect(computeTopGapCategories(obs)[0]).toBe('dribbling');
  });

  it('handles limit of 1', () => {
    const obs = [
      { category: 'Passing' },
      { category: 'Dribbling' },
      { category: 'Dribbling' },
    ];
    const result = computeTopGapCategories(obs, 1);
    expect(result).toEqual(['Dribbling']);
  });
});
