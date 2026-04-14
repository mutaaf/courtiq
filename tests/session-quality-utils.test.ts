import { describe, it, expect } from 'vitest';
import {
  isValidRating,
  getRatingLabel,
  getRatingColor,
  getRatingBgColor,
  filterRated,
  filterByType,
  calculateAverageRating,
  countByRating,
  getHighQualityRate,
  getBestSession,
  getQualityTrend,
  formatTrendDelta,
  sortByQuality,
  getRollingAverageQuality,
  getQualityMotivationMessage,
  buildQualitySummary,
  getRatedFraction,
} from '@/lib/session-quality-utils';
import type { RatedSession } from '@/lib/session-quality-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSession(
  id: string,
  date: string,
  quality_rating: number | null,
  type = 'practice'
): RatedSession {
  return { id, date, type, quality_rating };
}

const FIVE   = makeSession('s5',   '2026-04-14', 5);
const FOUR   = makeSession('s4',   '2026-04-13', 4);
const THREE  = makeSession('s3',   '2026-04-12', 3);
const TWO    = makeSession('s2',   '2026-04-11', 2);
const ONE    = makeSession('s1',   '2026-04-10', 1);
const UNRATE = makeSession('sx',   '2026-04-09', null);

const ALL_RATED = [FIVE, FOUR, THREE, TWO, ONE];
const MIXED     = [...ALL_RATED, UNRATE];

// ─── isValidRating ────────────────────────────────────────────────────────────

describe('isValidRating', () => {
  it('accepts 1–5', () => {
    for (const v of [1, 2, 3, 4, 5]) expect(isValidRating(v)).toBe(true);
  });
  it('rejects 0, 6, -1, null, undefined, string', () => {
    for (const v of [0, 6, -1, null, undefined, '3', 3.5])
      expect(isValidRating(v)).toBe(false);
  });
});

// ─── getRatingLabel ───────────────────────────────────────────────────────────

describe('getRatingLabel', () => {
  it('returns correct labels', () => {
    expect(getRatingLabel(1)).toBe('Poor');
    expect(getRatingLabel(3)).toBe('Good');
    expect(getRatingLabel(5)).toBe('Excellent');
  });
});

// ─── getRatingColor / getRatingBgColor ────────────────────────────────────────

describe('getRatingColor', () => {
  it('returns emerald for 5', () => expect(getRatingColor(5)).toContain('emerald'));
  it('returns red for 1',     () => expect(getRatingColor(1)).toContain('red'));
  it('returns amber for 3',   () => expect(getRatingColor(3)).toContain('amber'));
});

describe('getRatingBgColor', () => {
  it('returns emerald bg for 5', () => expect(getRatingBgColor(5)).toContain('emerald'));
  it('returns red bg for 1',     () => expect(getRatingBgColor(1)).toContain('red'));
});

// ─── filterRated ──────────────────────────────────────────────────────────────

describe('filterRated', () => {
  it('excludes null-rated sessions', () => {
    expect(filterRated(MIXED)).toHaveLength(5);
  });
  it('returns empty array when all unrated', () => {
    expect(filterRated([UNRATE])).toHaveLength(0);
  });
  it('keeps all when all rated', () => {
    expect(filterRated(ALL_RATED)).toHaveLength(5);
  });
});

// ─── filterByType ─────────────────────────────────────────────────────────────

describe('filterByType', () => {
  const game = makeSession('g1', '2026-04-15', 4, 'game');
  it('filters to a given type', () => {
    expect(filterByType([...ALL_RATED, game], 'game')).toHaveLength(1);
  });
  it('returns empty when no match', () => {
    expect(filterByType(ALL_RATED, 'game')).toHaveLength(0);
  });
});

// ─── calculateAverageRating ───────────────────────────────────────────────────

describe('calculateAverageRating', () => {
  it('computes correct average', () => {
    // (5+4+3+2+1)/5 = 3
    expect(calculateAverageRating(ALL_RATED)).toBe(3);
  });
  it('ignores unrated sessions', () => {
    expect(calculateAverageRating(MIXED)).toBe(3);
  });
  it('returns null when no rated sessions', () => {
    expect(calculateAverageRating([UNRATE])).toBeNull();
  });
  it('rounds to one decimal', () => {
    const sessions = [makeSession('a', '2026-04-01', 4), makeSession('b', '2026-04-02', 3)];
    expect(calculateAverageRating(sessions)).toBe(3.5);
  });
});

// ─── countByRating ────────────────────────────────────────────────────────────

describe('countByRating', () => {
  it('counts each rating value', () => {
    const counts = countByRating(ALL_RATED);
    expect(counts[1]).toBe(1);
    expect(counts[5]).toBe(1);
  });
  it('returns 0 for absent ratings', () => {
    const counts = countByRating([FIVE]);
    expect(counts[1]).toBe(0);
    expect(counts[2]).toBe(0);
  });
  it('ignores null ratings', () => {
    const counts = countByRating([UNRATE]);
    expect(Object.values(counts).every((v) => v === 0)).toBe(true);
  });
});

// ─── getHighQualityRate ───────────────────────────────────────────────────────

describe('getHighQualityRate', () => {
  it('calculates % of 4+ sessions', () => {
    // 5 and 4 are "high" out of 5 rated → 40%
    expect(getHighQualityRate(ALL_RATED)).toBe(40);
  });
  it('returns 100 when all rated ≥4', () => {
    expect(getHighQualityRate([FOUR, FIVE])).toBe(100);
  });
  it('returns 0 when no rated sessions', () => {
    expect(getHighQualityRate([UNRATE])).toBe(0);
  });
});

// ─── getBestSession ───────────────────────────────────────────────────────────

describe('getBestSession', () => {
  it('returns the session with the highest rating', () => {
    expect(getBestSession(MIXED)?.id).toBe('s5');
  });
  it('returns null when no rated sessions', () => {
    expect(getBestSession([UNRATE])).toBeNull();
  });
});

// ─── getQualityTrend ──────────────────────────────────────────────────────────

describe('getQualityTrend', () => {
  it('returns stable with insufficient data', () => {
    expect(getQualityTrend([FIVE, FOUR], 5)).toBe('stable');
  });

  it('detects improving trend', () => {
    // recent window: 5,5,5,5,5 — prior: 2,2,2,2,2
    const recent = Array.from({ length: 5 }, (_, i) =>
      makeSession(`r${i}`, `2026-04-1${i}`, 5)
    );
    const prior = Array.from({ length: 5 }, (_, i) =>
      makeSession(`p${i}`, `2026-03-0${i + 1}`, 2)
    );
    expect(getQualityTrend([...recent, ...prior])).toBe('improving');
  });

  it('detects declining trend', () => {
    const recent = Array.from({ length: 5 }, (_, i) =>
      makeSession(`r${i}`, `2026-04-1${i}`, 2)
    );
    const prior = Array.from({ length: 5 }, (_, i) =>
      makeSession(`p${i}`, `2026-03-0${i + 1}`, 5)
    );
    expect(getQualityTrend([...recent, ...prior])).toBe('declining');
  });
});

// ─── formatTrendDelta ─────────────────────────────────────────────────────────

describe('formatTrendDelta', () => {
  it('returns null with insufficient data', () => {
    expect(formatTrendDelta([FIVE, FOUR], 5)).toBeNull();
  });
  it('returns a positive string for improvement', () => {
    const recent = Array.from({ length: 5 }, (_, i) =>
      makeSession(`r${i}`, `2026-04-1${i}`, 5)
    );
    const prior = Array.from({ length: 5 }, (_, i) =>
      makeSession(`p${i}`, `2026-03-0${i + 1}`, 3)
    );
    const delta = formatTrendDelta([...recent, ...prior]);
    expect(delta).toMatch(/^\+/);
  });
});

// ─── sortByQuality ────────────────────────────────────────────────────────────

describe('sortByQuality', () => {
  it('sorts highest rating first', () => {
    const sorted = sortByQuality(ALL_RATED);
    expect(sorted[0].quality_rating).toBe(5);
    expect(sorted[4].quality_rating).toBe(1);
  });
  it('places unrated sessions at the end', () => {
    const sorted = sortByQuality(MIXED);
    expect(sorted[sorted.length - 1].id).toBe('sx');
  });
  it('does not mutate input array', () => {
    const input = [ONE, THREE, FIVE];
    sortByQuality(input);
    expect(input[0].id).toBe('s1');
  });
});

// ─── getRollingAverageQuality ─────────────────────────────────────────────────

describe('getRollingAverageQuality', () => {
  it('returns one entry per session', () => {
    expect(getRollingAverageQuality(ALL_RATED)).toHaveLength(5);
  });
  it('first avg equals first rated value (window=1)', () => {
    const sorted = [...ALL_RATED].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const rolling = getRollingAverageQuality(sorted, 1);
    expect(rolling[0].avg).toBe(sorted[0].quality_rating);
  });
  it('null for entries with no prior ratings in window', () => {
    // With window=3 there's always a prior rated entry in ALL_RATED
    // Just verify shape
    const result = getRollingAverageQuality([UNRATE], 3);
    expect(result[0].avg).toBeNull();
  });
});

// ─── getQualityMotivationMessage ──────────────────────────────────────────────

describe('getQualityMotivationMessage', () => {
  it('returns a prompt to rate when null', () => {
    expect(getQualityMotivationMessage(null)).toContain('Rate');
  });
  it('returns outstanding message for ≥4.5', () => {
    expect(getQualityMotivationMessage(4.8)).toContain('Outstanding');
  });
  it('returns a message for low avg', () => {
    expect(getQualityMotivationMessage(1.5)).toBeTruthy();
  });
});

// ─── buildQualitySummary ──────────────────────────────────────────────────────

describe('buildQualitySummary', () => {
  it('includes avg and session count', () => {
    const summary = buildQualitySummary(ALL_RATED);
    expect(summary).toContain('3');
    expect(summary).toContain('5');
  });
  it('returns placeholder when nothing rated', () => {
    expect(buildQualitySummary([UNRATE])).toBe('No sessions rated yet.');
  });
  it('uses singular form for 1 session', () => {
    expect(buildQualitySummary([FIVE])).toContain('1 rated session');
  });
});

// ─── getRatedFraction ────────────────────────────────────────────────────────

describe('getRatedFraction', () => {
  it('returns 0 for empty list', () => {
    expect(getRatedFraction([])).toBe(0);
  });
  it('returns 100 when all rated', () => {
    expect(getRatedFraction(ALL_RATED)).toBe(100);
  });
  it('returns correct fraction', () => {
    // 5 rated + 1 unrated = 6 total → ~83%
    expect(getRatedFraction(MIXED)).toBe(83);
  });
});
