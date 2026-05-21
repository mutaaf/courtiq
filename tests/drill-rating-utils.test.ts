import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildRatingKey,
  buildTeamRatingsPrefix,
  getDrillRating,
  setDrillRating,
  clearDrillRating,
  toggleDrillRating,
  isUpvoted,
  isDownvoted,
  isRated,
  hasRating,
  getRatingSortKey,
  sortDrillsByRating,
  filterUpvotedDrills,
  filterDownvotedDrills,
  getRatingIcon,
  getRatingLabel,
  getRatingAriaLabel,
  formatRatingPrompt,
  countUpvotedDrills,
  countDownvotedDrills,
  countRatedDrills,
  type DrillRating,
  type RatableItem,
} from '@/lib/drill-rating-utils';

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
  localStorageMock.clear();
});

afterEach(() => {
  localStorageMock.clear();
});

const TEAM = 'team-abc';
const DRILL = 'drill-123';

// ── Key helpers ───────────────────────────────────────────────────────────────

describe('buildRatingKey', () => {
  it('includes teamId and drillId', () => {
    const key = buildRatingKey('t1', 'd1');
    expect(key).toContain('t1');
    expect(key).toContain('d1');
  });

  it('different teams produce different keys', () => {
    expect(buildRatingKey('t1', 'd1')).not.toBe(buildRatingKey('t2', 'd1'));
  });

  it('different drills produce different keys', () => {
    expect(buildRatingKey('t1', 'd1')).not.toBe(buildRatingKey('t1', 'd2'));
  });
});

describe('buildTeamRatingsPrefix', () => {
  it('returns a prefix string containing the teamId', () => {
    expect(buildTeamRatingsPrefix('t1')).toContain('t1');
  });
});

// ── Read / write ──────────────────────────────────────────────────────────────

describe('getDrillRating', () => {
  it('returns null when no rating stored', () => {
    expect(getDrillRating(TEAM, DRILL)).toBeNull();
  });

  it('returns "up" after storing up', () => {
    setDrillRating(TEAM, DRILL, 'up');
    expect(getDrillRating(TEAM, DRILL)).toBe('up');
  });

  it('returns "down" after storing down', () => {
    setDrillRating(TEAM, DRILL, 'down');
    expect(getDrillRating(TEAM, DRILL)).toBe('down');
  });

  it('returns null for unknown rating values', () => {
    localStorageMock.setItem(buildRatingKey(TEAM, DRILL), 'invalid');
    expect(getDrillRating(TEAM, DRILL)).toBeNull();
  });
});

describe('setDrillRating', () => {
  it('persists up rating', () => {
    setDrillRating(TEAM, DRILL, 'up');
    expect(localStorageMock.getItem(buildRatingKey(TEAM, DRILL))).toBe('up');
  });

  it('overwrites previous rating', () => {
    setDrillRating(TEAM, DRILL, 'up');
    setDrillRating(TEAM, DRILL, 'down');
    expect(getDrillRating(TEAM, DRILL)).toBe('down');
  });
});

describe('clearDrillRating', () => {
  it('removes rating from storage', () => {
    setDrillRating(TEAM, DRILL, 'up');
    clearDrillRating(TEAM, DRILL);
    expect(getDrillRating(TEAM, DRILL)).toBeNull();
  });

  it('does not throw when key does not exist', () => {
    expect(() => clearDrillRating(TEAM, 'nonexistent')).not.toThrow();
  });
});

describe('toggleDrillRating', () => {
  it('sets rating when none exists', () => {
    const result = toggleDrillRating(TEAM, DRILL, 'up');
    expect(result).toBe('up');
    expect(getDrillRating(TEAM, DRILL)).toBe('up');
  });

  it('removes rating when same rating is toggled again', () => {
    setDrillRating(TEAM, DRILL, 'up');
    const result = toggleDrillRating(TEAM, DRILL, 'up');
    expect(result).toBeNull();
    expect(getDrillRating(TEAM, DRILL)).toBeNull();
  });

  it('changes rating from up to down', () => {
    setDrillRating(TEAM, DRILL, 'up');
    const result = toggleDrillRating(TEAM, DRILL, 'down');
    expect(result).toBe('down');
    expect(getDrillRating(TEAM, DRILL)).toBe('down');
  });

  it('changes rating from down to up', () => {
    setDrillRating(TEAM, DRILL, 'down');
    const result = toggleDrillRating(TEAM, DRILL, 'up');
    expect(result).toBe('up');
  });
});

// ── Predicates ────────────────────────────────────────────────────────────────

describe('isUpvoted', () => {
  it('returns true when rated up', () => {
    setDrillRating(TEAM, DRILL, 'up');
    expect(isUpvoted(TEAM, DRILL)).toBe(true);
  });

  it('returns false when rated down', () => {
    setDrillRating(TEAM, DRILL, 'down');
    expect(isUpvoted(TEAM, DRILL)).toBe(false);
  });

  it('returns false when not rated', () => {
    expect(isUpvoted(TEAM, DRILL)).toBe(false);
  });
});

describe('isDownvoted', () => {
  it('returns true when rated down', () => {
    setDrillRating(TEAM, DRILL, 'down');
    expect(isDownvoted(TEAM, DRILL)).toBe(true);
  });

  it('returns false when rated up', () => {
    setDrillRating(TEAM, DRILL, 'up');
    expect(isDownvoted(TEAM, DRILL)).toBe(false);
  });

  it('returns false when not rated', () => {
    expect(isDownvoted(TEAM, DRILL)).toBe(false);
  });
});

describe('isRated', () => {
  it('returns true when rated up', () => {
    setDrillRating(TEAM, DRILL, 'up');
    expect(isRated(TEAM, DRILL)).toBe(true);
  });

  it('returns true when rated down', () => {
    setDrillRating(TEAM, DRILL, 'down');
    expect(isRated(TEAM, DRILL)).toBe(true);
  });

  it('returns false when not rated', () => {
    expect(isRated(TEAM, DRILL)).toBe(false);
  });
});

describe('hasRating', () => {
  it('returns true for "up"', () => {
    expect(hasRating('up')).toBe(true);
  });

  it('returns true for "down"', () => {
    expect(hasRating('down')).toBe(true);
  });

  it('returns false for null', () => {
    expect(hasRating(null)).toBe(false);
  });
});

// ── Sorting ───────────────────────────────────────────────────────────────────

describe('getRatingSortKey', () => {
  it('returns -1 for upvoted drills', () => {
    setDrillRating(TEAM, DRILL, 'up');
    expect(getRatingSortKey(TEAM, DRILL)).toBe(-1);
  });

  it('returns 1 for downvoted drills', () => {
    setDrillRating(TEAM, DRILL, 'down');
    expect(getRatingSortKey(TEAM, DRILL)).toBe(1);
  });

  it('returns 0 for unrated drills', () => {
    expect(getRatingSortKey(TEAM, DRILL)).toBe(0);
  });
});

describe('sortDrillsByRating', () => {
  it('puts upvoted drills first', () => {
    const drills: RatableItem[] = [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ];
    setDrillRating(TEAM, 'b', 'up');
    const sorted = sortDrillsByRating(drills, TEAM);
    expect(sorted[0].id).toBe('b');
  });

  it('puts downvoted drills last', () => {
    const drills: RatableItem[] = [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ];
    setDrillRating(TEAM, 'a', 'down');
    const sorted = sortDrillsByRating(drills, TEAM);
    expect(sorted[sorted.length - 1].id).toBe('a');
  });

  it('does not mutate the input array', () => {
    const drills: RatableItem[] = [{ id: 'a' }, { id: 'b' }];
    setDrillRating(TEAM, 'b', 'up');
    const original = [...drills];
    sortDrillsByRating(drills, TEAM);
    expect(drills[0].id).toBe(original[0].id);
  });

  it('returns same order when no ratings exist', () => {
    const drills: RatableItem[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const sorted = sortDrillsByRating(drills, TEAM);
    expect(sorted.map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles empty array', () => {
    expect(sortDrillsByRating([], TEAM)).toHaveLength(0);
  });
});

describe('filterUpvotedDrills', () => {
  it('returns only upvoted drills', () => {
    const drills: RatableItem[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    setDrillRating(TEAM, 'a', 'up');
    setDrillRating(TEAM, 'b', 'down');
    const result = filterUpvotedDrills(drills, TEAM);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('returns empty array when no upvotes', () => {
    const drills: RatableItem[] = [{ id: 'a' }, { id: 'b' }];
    expect(filterUpvotedDrills(drills, TEAM)).toHaveLength(0);
  });
});

describe('filterDownvotedDrills', () => {
  it('returns only downvoted drills', () => {
    const drills: RatableItem[] = [{ id: 'a' }, { id: 'b' }];
    setDrillRating(TEAM, 'b', 'down');
    const result = filterDownvotedDrills(drills, TEAM);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });
});

// ── Display helpers ───────────────────────────────────────────────────────────

describe('getRatingIcon', () => {
  it('returns 👍 for up', () => {
    expect(getRatingIcon('up')).toBe('👍');
  });

  it('returns 👎 for down', () => {
    expect(getRatingIcon('down')).toBe('👎');
  });

  it('returns empty string for null', () => {
    expect(getRatingIcon(null)).toBe('');
  });
});

describe('getRatingLabel', () => {
  it('returns a non-empty label for up', () => {
    expect(getRatingLabel('up').length).toBeGreaterThan(0);
  });

  it('returns a non-empty label for down', () => {
    expect(getRatingLabel('down').length).toBeGreaterThan(0);
  });

  it('returns empty string for null', () => {
    expect(getRatingLabel(null)).toBe('');
  });
});

describe('getRatingAriaLabel', () => {
  it('indicates active state when already rated', () => {
    const label = getRatingAriaLabel('up', 'up');
    expect(label.toLowerCase()).toContain('remove');
  });

  it('describes action when not rated', () => {
    const label = getRatingAriaLabel('up', null);
    expect(label.toLowerCase()).not.toContain('remove');
  });

  it('handles down rating not active', () => {
    const label = getRatingAriaLabel('down', null);
    expect(label.length).toBeGreaterThan(0);
  });

  it('handles down rating active', () => {
    const label = getRatingAriaLabel('down', 'down');
    expect(label.toLowerCase()).toContain('remove');
  });
});

describe('formatRatingPrompt', () => {
  it('returns a non-empty string', () => {
    expect(formatRatingPrompt('Figure 8 Dribble').length).toBeGreaterThan(0);
  });

  it('works with empty drill name', () => {
    expect(formatRatingPrompt('')).toBeTruthy();
  });
});

// ── Counts ────────────────────────────────────────────────────────────────────

describe('countUpvotedDrills', () => {
  it('counts drills rated up', () => {
    const drills: RatableItem[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    setDrillRating(TEAM, 'a', 'up');
    setDrillRating(TEAM, 'b', 'up');
    expect(countUpvotedDrills(drills, TEAM)).toBe(2);
  });

  it('returns 0 when no upvotes', () => {
    const drills: RatableItem[] = [{ id: 'a' }];
    expect(countUpvotedDrills(drills, TEAM)).toBe(0);
  });
});

describe('countDownvotedDrills', () => {
  it('counts drills rated down', () => {
    const drills: RatableItem[] = [{ id: 'a' }, { id: 'b' }];
    setDrillRating(TEAM, 'a', 'down');
    expect(countDownvotedDrills(drills, TEAM)).toBe(1);
  });
});

describe('countRatedDrills', () => {
  it('counts all rated drills (up + down)', () => {
    const drills: RatableItem[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    setDrillRating(TEAM, 'a', 'up');
    setDrillRating(TEAM, 'b', 'down');
    expect(countRatedDrills(drills, TEAM)).toBe(2);
  });

  it('returns 0 when nothing rated', () => {
    const drills: RatableItem[] = [{ id: 'a' }, { id: 'b' }];
    expect(countRatedDrills(drills, TEAM)).toBe(0);
  });
});
