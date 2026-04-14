import { describe, it, expect } from 'vitest';
import {
  isFavorited,
  toggleFavorite,
  addFavorite,
  removeFavorite,
  sortWithFavoritesFirst,
  filterToFavorites,
  countFavorites,
  parseFavoritedDrills,
} from '@/lib/drill-favorites-utils';
import type { Drill } from '@/types/database';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDrill(id: string, overrides: Partial<Drill> = {}): Drill {
  return {
    id,
    sport_id: 'sport-1',
    org_id: null,
    coach_id: null,
    curriculum_skill_id: null,
    name: `Drill ${id}`,
    description: `Description for ${id}`,
    category: 'Offense',
    age_groups: ['U12'],
    duration_minutes: 10,
    player_count_min: 2,
    player_count_max: null,
    equipment: null,
    video_url: null,
    diagram_url: null,
    cv_eval_config: null,
    setup_instructions: null,
    teaching_cues: null,
    source: 'seeded',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isFavorited
// ---------------------------------------------------------------------------

describe('isFavorited', () => {
  it('returns true when drill is in the list', () => {
    expect(isFavorited('a', ['a', 'b', 'c'])).toBe(true);
  });

  it('returns false when drill is not in the list', () => {
    expect(isFavorited('z', ['a', 'b', 'c'])).toBe(false);
  });

  it('returns false for empty favorites list', () => {
    expect(isFavorited('a', [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toggleFavorite
// ---------------------------------------------------------------------------

describe('toggleFavorite', () => {
  it('adds drill when not present', () => {
    const result = toggleFavorite('c', ['a', 'b']);
    expect(result).toContain('c');
    expect(result).toHaveLength(3);
  });

  it('removes drill when already present', () => {
    const result = toggleFavorite('b', ['a', 'b', 'c']);
    expect(result).not.toContain('b');
    expect(result).toHaveLength(2);
  });

  it('does not mutate the original array (add case)', () => {
    const original = ['a', 'b'];
    const result = toggleFavorite('c', original);
    expect(original).toHaveLength(2);
    expect(result).not.toBe(original);
  });

  it('does not mutate the original array (remove case)', () => {
    const original = ['a', 'b', 'c'];
    const result = toggleFavorite('b', original);
    expect(original).toHaveLength(3);
    expect(result).not.toBe(original);
  });

  it('works on an empty list', () => {
    const result = toggleFavorite('a', []);
    expect(result).toEqual(['a']);
  });
});

// ---------------------------------------------------------------------------
// addFavorite
// ---------------------------------------------------------------------------

describe('addFavorite', () => {
  it('adds the drill when not present', () => {
    expect(addFavorite('d', ['a', 'b'])).toEqual(['a', 'b', 'd']);
  });

  it('returns the same array reference when already present', () => {
    const original = ['a', 'b'];
    expect(addFavorite('a', original)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// removeFavorite
// ---------------------------------------------------------------------------

describe('removeFavorite', () => {
  it('removes the drill when present', () => {
    expect(removeFavorite('b', ['a', 'b', 'c'])).toEqual(['a', 'c']);
  });

  it('returns the same array reference when not present', () => {
    const original = ['a', 'c'];
    expect(removeFavorite('z', original)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// sortWithFavoritesFirst
// ---------------------------------------------------------------------------

describe('sortWithFavoritesFirst', () => {
  const drills = [makeDrill('1'), makeDrill('2'), makeDrill('3'), makeDrill('4')];

  it('places favorited drills first', () => {
    const result = sortWithFavoritesFirst(drills, ['3', '1']);
    expect(result[0].id).toBe('1');
    expect(result[1].id).toBe('3');
    expect(result[2].id).toBe('2');
    expect(result[3].id).toBe('4');
  });

  it('preserves order within favorited group', () => {
    const result = sortWithFavoritesFirst(drills, ['4', '2']);
    expect(result[0].id).toBe('2');
    expect(result[1].id).toBe('4');
  });

  it('returns all drills unchanged when no favorites', () => {
    const result = sortWithFavoritesFirst(drills, []);
    expect(result.map((d) => d.id)).toEqual(['1', '2', '3', '4']);
  });

  it('returns only favorited drills first when all are favorited', () => {
    const result = sortWithFavoritesFirst(drills, ['1', '2', '3', '4']);
    expect(result).toHaveLength(4);
  });

  it('does not mutate the original array', () => {
    const original = [...drills];
    sortWithFavoritesFirst(drills, ['3']);
    expect(drills.map((d) => d.id)).toEqual(original.map((d) => d.id));
  });
});

// ---------------------------------------------------------------------------
// filterToFavorites
// ---------------------------------------------------------------------------

describe('filterToFavorites', () => {
  const drills = [makeDrill('a'), makeDrill('b'), makeDrill('c')];

  it('returns only drills in the favorites list', () => {
    const result = filterToFavorites(drills, ['a', 'c']);
    expect(result.map((d) => d.id)).toEqual(['a', 'c']);
  });

  it('returns empty array when no favorites match', () => {
    expect(filterToFavorites(drills, ['z'])).toHaveLength(0);
  });

  it('returns empty array when favorites list is empty', () => {
    expect(filterToFavorites(drills, [])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// countFavorites
// ---------------------------------------------------------------------------

describe('countFavorites', () => {
  it('counts unique IDs', () => {
    expect(countFavorites(['a', 'b', 'c'])).toBe(3);
  });

  it('deduplicates repeated IDs', () => {
    expect(countFavorites(['a', 'a', 'b'])).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(countFavorites([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseFavoritedDrills
// ---------------------------------------------------------------------------

describe('parseFavoritedDrills', () => {
  it('extracts string array from valid preferences', () => {
    expect(parseFavoritedDrills({ favorited_drills: ['x', 'y'] })).toEqual(['x', 'y']);
  });

  it('returns empty array when favorited_drills is missing', () => {
    expect(parseFavoritedDrills({ other_key: true })).toEqual([]);
  });

  it('returns empty array when favorited_drills is not an array', () => {
    expect(parseFavoritedDrills({ favorited_drills: 'string' })).toEqual([]);
    expect(parseFavoritedDrills({ favorited_drills: 42 })).toEqual([]);
  });

  it('filters out non-string values from mixed array', () => {
    expect(parseFavoritedDrills({ favorited_drills: ['a', 1, null, 'b'] })).toEqual(['a', 'b']);
  });

  it('returns empty array when preferences is null', () => {
    expect(parseFavoritedDrills(null)).toEqual([]);
  });

  it('returns empty array when preferences is undefined', () => {
    expect(parseFavoritedDrills(undefined)).toEqual([]);
  });

  it('returns empty array when preferences is a string', () => {
    expect(parseFavoritedDrills('bad')).toEqual([]);
  });

  it('returns empty array when preferences is a number', () => {
    expect(parseFavoritedDrills(0)).toEqual([]);
  });
});
