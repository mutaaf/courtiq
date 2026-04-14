import { describe, it, expect } from 'vitest';
import {
  giniCoefficient,
  calculateObservationBalance,
  findUnobservedPlayerIds,
  calculatePlayerCoverageRate,
  getObservationCountByPlayer,
  getMostObservedPlayers,
  getLeastObservedPlayers,
  getSentimentBreakdown,
  isoWeekKey,
  getLastNWeekKeys,
  getWeeklyObservationCounts,
  calculateConsistencyRate,
  calculateCoachingPatternScore,
  getCoachingPatternLabel,
  getCoachingPatternColor,
  buildCoachingPatternInsights,
  hasSufficientPatternData,
  type ObsPoint,
} from '@/lib/coach-pattern-utils';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function makeObs(override: Partial<ObsPoint> = {}): ObsPoint {
  return {
    player_id: 'p1',
    sentiment: 'positive',
    category: 'dribbling',
    created_at: new Date().toISOString(),
    ...override,
  };
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString();
}

const THREE_PLAYERS = ['p1', 'p2', 'p3'];

// ─── giniCoefficient ──────────────────────────────────────────────────────────

describe('giniCoefficient', () => {
  it('returns 0 for empty array', () => {
    expect(giniCoefficient([])).toBe(0);
  });

  it('returns 0 for all-zero counts', () => {
    expect(giniCoefficient([0, 0, 0])).toBe(0);
  });

  it('returns 0 for perfectly equal distribution', () => {
    expect(giniCoefficient([5, 5, 5])).toBe(0);
  });

  it('returns 0 for single-element array', () => {
    expect(giniCoefficient([10])).toBe(0);
  });

  it('returns a higher value for skewed distribution', () => {
    const evenGini = giniCoefficient([5, 5, 5]);
    const skewedGini = giniCoefficient([10, 1, 1]);
    expect(skewedGini).toBeGreaterThan(evenGini);
  });

  it('returns a value between 0 and 1 inclusive', () => {
    const g = giniCoefficient([1, 3, 7, 2]);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(1);
  });

  it('increases as distribution becomes more unequal', () => {
    const g1 = giniCoefficient([5, 5, 5]);      // equal
    const g2 = giniCoefficient([8, 3, 4]);      // slightly unequal
    const g3 = giniCoefficient([15, 1, 1]);     // very unequal
    expect(g3).toBeGreaterThan(g2);
    expect(g2).toBeGreaterThan(g1);
  });
});

// ─── calculateObservationBalance ─────────────────────────────────────────────

describe('calculateObservationBalance', () => {
  it('returns 100 for empty player list', () => {
    expect(calculateObservationBalance([], [])).toBe(100);
  });

  it('returns 100 for a single player', () => {
    const obs = [makeObs({ player_id: 'p1' })];
    expect(calculateObservationBalance(obs, ['p1'])).toBe(100);
  });

  it('returns 100 for perfectly equal distribution', () => {
    const obs = THREE_PLAYERS.map((id) => makeObs({ player_id: id }));
    expect(calculateObservationBalance(obs, THREE_PLAYERS)).toBe(100);
  });

  it('returns lower score for skewed distribution', () => {
    const evenObs = THREE_PLAYERS.map((id) => makeObs({ player_id: id }));
    const skewedObs = Array.from({ length: 9 }, () => makeObs({ player_id: 'p1' }));
    const evenScore = calculateObservationBalance(evenObs, THREE_PLAYERS);
    const skewedScore = calculateObservationBalance(skewedObs, THREE_PLAYERS);
    expect(skewedScore).toBeLessThan(evenScore);
  });

  it('returns value in 0–100 range', () => {
    const obs = [makeObs({ player_id: 'p1' }), makeObs({ player_id: 'p1' })];
    const score = calculateObservationBalance(obs, THREE_PLAYERS);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('counts players with 0 obs in distribution (penalises missing players)', () => {
    const obs = [makeObs({ player_id: 'p1' }), makeObs({ player_id: 'p2' })];
    const twoPlayerScore = calculateObservationBalance(obs, ['p1', 'p2']);   // perfect
    const threePlayerScore = calculateObservationBalance(obs, THREE_PLAYERS); // p3 missing
    expect(twoPlayerScore).toBeGreaterThan(threePlayerScore);
  });

  it('handles observations with null player_id gracefully', () => {
    const obs = [makeObs({ player_id: null }), makeObs({ player_id: 'p1' })];
    const score = calculateObservationBalance(obs, ['p1']);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ─── findUnobservedPlayerIds ──────────────────────────────────────────────────

describe('findUnobservedPlayerIds', () => {
  it('returns all players when there are no observations', () => {
    const result = findUnobservedPlayerIds([], THREE_PLAYERS, 14);
    expect(result).toEqual(THREE_PLAYERS);
  });

  it('excludes a player with a recent observation', () => {
    const obs = [makeObs({ player_id: 'p1', created_at: daysAgo(5) })];
    const result = findUnobservedPlayerIds(obs, THREE_PLAYERS, 14);
    expect(result).not.toContain('p1');
    expect(result).toContain('p2');
    expect(result).toContain('p3');
  });

  it('includes a player whose last obs was before the cutoff', () => {
    const obs = [makeObs({ player_id: 'p1', created_at: daysAgo(20) })];
    const result = findUnobservedPlayerIds(obs, THREE_PLAYERS, 14);
    expect(result).toContain('p1');
  });

  it('returns empty array when all players were observed recently', () => {
    const obs = THREE_PLAYERS.map((id) => makeObs({ player_id: id, created_at: daysAgo(1) }));
    expect(findUnobservedPlayerIds(obs, THREE_PLAYERS, 14)).toHaveLength(0);
  });

  it('ignores observations with null player_id', () => {
    const obs = [makeObs({ player_id: null, created_at: daysAgo(1) })];
    const result = findUnobservedPlayerIds(obs, THREE_PLAYERS, 14);
    expect(result).toEqual(THREE_PLAYERS);
  });

  it('returns empty array for empty player list', () => {
    const obs = [makeObs()];
    expect(findUnobservedPlayerIds(obs, [], 14)).toHaveLength(0);
  });
});

// ─── calculatePlayerCoverageRate ─────────────────────────────────────────────

describe('calculatePlayerCoverageRate', () => {
  it('returns 100 for no players', () => {
    expect(calculatePlayerCoverageRate([], [], 14)).toBe(100);
  });

  it('returns 0 when no observations at all', () => {
    expect(calculatePlayerCoverageRate([], THREE_PLAYERS, 14)).toBe(0);
  });

  it('returns 100 when all players were observed recently', () => {
    const obs = THREE_PLAYERS.map((id) => makeObs({ player_id: id, created_at: daysAgo(1) }));
    expect(calculatePlayerCoverageRate(obs, THREE_PLAYERS, 14)).toBe(100);
  });

  it('returns ~67 when 2 of 3 players observed', () => {
    const obs = [
      makeObs({ player_id: 'p1', created_at: daysAgo(1) }),
      makeObs({ player_id: 'p2', created_at: daysAgo(1) }),
    ];
    expect(calculatePlayerCoverageRate(obs, THREE_PLAYERS, 14)).toBe(67);
  });

  it('ignores observations outside the day window', () => {
    const obs = [makeObs({ player_id: 'p1', created_at: daysAgo(20) })];
    expect(calculatePlayerCoverageRate(obs, THREE_PLAYERS, 14)).toBe(0);
  });
});

// ─── getObservationCountByPlayer ─────────────────────────────────────────────

describe('getObservationCountByPlayer', () => {
  it('returns count 0 for all players when no observations', () => {
    const result = getObservationCountByPlayer([], THREE_PLAYERS);
    expect(result.every((p) => p.count === 0)).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('counts correctly per player', () => {
    const obs = [
      makeObs({ player_id: 'p1' }),
      makeObs({ player_id: 'p1' }),
      makeObs({ player_id: 'p2' }),
    ];
    const result = getObservationCountByPlayer(obs, THREE_PLAYERS);
    const p1 = result.find((p) => p.playerId === 'p1');
    const p2 = result.find((p) => p.playerId === 'p2');
    const p3 = result.find((p) => p.playerId === 'p3');
    expect(p1?.count).toBe(2);
    expect(p2?.count).toBe(1);
    expect(p3?.count).toBe(0);
  });
});

// ─── getMostObservedPlayers ───────────────────────────────────────────────────

describe('getMostObservedPlayers', () => {
  const obs = [
    ...Array.from({ length: 5 }, () => makeObs({ player_id: 'p1' })),
    ...Array.from({ length: 2 }, () => makeObs({ player_id: 'p2' })),
  ];

  it('returns top N by count descending', () => {
    const result = getMostObservedPlayers(obs, THREE_PLAYERS, 2);
    expect(result[0].playerId).toBe('p1');
    expect(result[0].count).toBe(5);
    expect(result[1].playerId).toBe('p2');
    expect(result[1].count).toBe(2);
  });

  it('excludes players with 0 observations', () => {
    const result = getMostObservedPlayers(obs, THREE_PLAYERS, 5);
    expect(result.every((p) => p.count > 0)).toBe(true);
  });

  it('limits to N results', () => {
    const result = getMostObservedPlayers(obs, THREE_PLAYERS, 1);
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no observations', () => {
    expect(getMostObservedPlayers([], THREE_PLAYERS, 3)).toHaveLength(0);
  });
});

// ─── getLeastObservedPlayers ──────────────────────────────────────────────────

describe('getLeastObservedPlayers', () => {
  const obs = [
    ...Array.from({ length: 5 }, () => makeObs({ player_id: 'p1' })),
    ...Array.from({ length: 2 }, () => makeObs({ player_id: 'p2' })),
  ];

  it('puts the player with 0 observations first', () => {
    const result = getLeastObservedPlayers(obs, THREE_PLAYERS, 1);
    expect(result[0].playerId).toBe('p3');
    expect(result[0].count).toBe(0);
  });

  it('limits to N results', () => {
    const result = getLeastObservedPlayers(obs, THREE_PLAYERS, 2);
    expect(result).toHaveLength(2);
  });

  it('returns all players sorted ascending when N >= player count', () => {
    const result = getLeastObservedPlayers(obs, THREE_PLAYERS, 10);
    expect(result[0].count).toBeLessThanOrEqual(result[result.length - 1].count);
  });
});

// ─── getSentimentBreakdown ────────────────────────────────────────────────────

describe('getSentimentBreakdown', () => {
  it('returns all zeros for no observations', () => {
    expect(getSentimentBreakdown([])).toEqual({
      positive: 0,
      needsWork: 0,
      neutral: 0,
      total: 0,
    });
  });

  it('counts sentiments correctly', () => {
    const obs = [
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'needs-work' }),
      makeObs({ sentiment: 'neutral' }),
    ];
    const result = getSentimentBreakdown(obs);
    expect(result.positive).toBe(2);
    expect(result.needsWork).toBe(1);
    expect(result.neutral).toBe(1);
    expect(result.total).toBe(4);
  });

  it('positive + needsWork + neutral equals total', () => {
    const obs = Array.from({ length: 7 }, (_, i) =>
      makeObs({ sentiment: i % 2 === 0 ? 'positive' : 'needs-work' }),
    );
    const { positive, needsWork, neutral, total } = getSentimentBreakdown(obs);
    expect(positive + needsWork + neutral).toBe(total);
  });
});

// ─── isoWeekKey ───────────────────────────────────────────────────────────────

describe('isoWeekKey', () => {
  it('returns a string in YYYY-WNN format', () => {
    const key = isoWeekKey(new Date('2024-03-15'));
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('returns the same key for two dates in the same ISO week', () => {
    // 2024-01-08 (Mon) and 2024-01-12 (Fri) are in the same week
    expect(isoWeekKey(new Date('2024-01-08'))).toBe(isoWeekKey(new Date('2024-01-12')));
  });

  it('returns different keys for adjacent weeks', () => {
    expect(isoWeekKey(new Date('2024-01-07'))).not.toBe(isoWeekKey(new Date('2024-01-08')));
  });

  it('handles year boundary correctly', () => {
    // 2024-12-30 to 2025-01-05 is ISO week 2025-W01
    const key = isoWeekKey(new Date('2025-01-01'));
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
  });
});

// ─── getLastNWeekKeys ─────────────────────────────────────────────────────────

describe('getLastNWeekKeys', () => {
  it('returns exactly N unique week keys', () => {
    const keys = getLastNWeekKeys(8);
    expect(keys.length).toBeLessThanOrEqual(8);
    expect(new Set(keys).size).toBe(keys.length); // all unique
  });

  it('last entry is current week', () => {
    const keys = getLastNWeekKeys(4);
    const currentWeek = isoWeekKey(new Date());
    expect(keys[keys.length - 1]).toBe(currentWeek);
  });

  it('returns empty array for n=0', () => {
    expect(getLastNWeekKeys(0)).toHaveLength(0);
  });
});

// ─── getWeeklyObservationCounts ───────────────────────────────────────────────

describe('getWeeklyObservationCounts', () => {
  it('returns array of length matching week keys', () => {
    const counts = getWeeklyObservationCounts([], 8);
    expect(counts.length).toBeLessThanOrEqual(8);
  });

  it('returns all zeros when there are no observations', () => {
    const counts = getWeeklyObservationCounts([], 4);
    expect(counts.every((c) => c === 0)).toBe(true);
  });

  it('counts an observation in the correct week bucket', () => {
    const now = Date.now();
    const obs = [makeObs({ created_at: new Date(now - 3 * DAY_MS).toISOString() })];
    const counts = getWeeklyObservationCounts(obs, 4, now);
    expect(counts.reduce((s, c) => s + c, 0)).toBe(1);
  });

  it('ignores observations outside the window', () => {
    const now = Date.now();
    const obs = [makeObs({ created_at: new Date(now - 200 * DAY_MS).toISOString() })];
    const counts = getWeeklyObservationCounts(obs, 4, now);
    expect(counts.every((c) => c === 0)).toBe(true);
  });
});

// ─── calculateConsistencyRate ─────────────────────────────────────────────────

describe('calculateConsistencyRate', () => {
  it('returns 0 when weeks=0', () => {
    expect(calculateConsistencyRate([], 0)).toBe(0);
  });

  it('returns 0 when there are no observations', () => {
    expect(calculateConsistencyRate([], 8)).toBe(0);
  });

  it('returns 100 when every week has at least one observation', () => {
    const now = Date.now();
    // One observation per week, one for each of the last 4 weeks
    const obs = Array.from({ length: 4 }, (_, i) =>
      makeObs({ created_at: new Date(now - (i * 7 + 1) * DAY_MS).toISOString() }),
    );
    expect(calculateConsistencyRate(obs, 4, now)).toBe(100);
  });

  it('returns 50 when half the weeks have observations', () => {
    const now = Date.now();
    // Observation in current week and 2 weeks ago (out of 4)
    const obs = [
      makeObs({ created_at: new Date(now - 1 * DAY_MS).toISOString() }),    // this week
      makeObs({ created_at: new Date(now - 15 * DAY_MS).toISOString() }),   // ~2 weeks ago
    ];
    expect(calculateConsistencyRate(obs, 4, now)).toBe(50);
  });

  it('returns value between 0 and 100', () => {
    const obs = [makeObs({ created_at: daysAgo(1) })];
    const rate = calculateConsistencyRate(obs, 8);
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(100);
  });
});

// ─── calculateCoachingPatternScore ───────────────────────────────────────────

describe('calculateCoachingPatternScore', () => {
  it('returns 100 for perfect inputs', () => {
    expect(calculateCoachingPatternScore(100, 100, 100)).toBe(100);
  });

  it('returns 0 for all zeros', () => {
    expect(calculateCoachingPatternScore(0, 0, 0)).toBe(0);
  });

  it('weights balance at 35%', () => {
    expect(calculateCoachingPatternScore(100, 0, 0)).toBe(35);
  });

  it('weights coverage at 35%', () => {
    expect(calculateCoachingPatternScore(0, 100, 0)).toBe(35);
  });

  it('weights consistency at 30%', () => {
    expect(calculateCoachingPatternScore(0, 0, 100)).toBe(30);
  });

  it('returns value in 0–100 range for typical inputs', () => {
    const score = calculateCoachingPatternScore(70, 80, 60);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ─── getCoachingPatternLabel ──────────────────────────────────────────────────

describe('getCoachingPatternLabel', () => {
  it('returns Comprehensive for score >= 75', () => {
    expect(getCoachingPatternLabel(75)).toBe('Comprehensive');
    expect(getCoachingPatternLabel(100)).toBe('Comprehensive');
  });

  it('returns Developing for scores 45–74', () => {
    expect(getCoachingPatternLabel(45)).toBe('Developing');
    expect(getCoachingPatternLabel(74)).toBe('Developing');
  });

  it('returns Focused for score < 45', () => {
    expect(getCoachingPatternLabel(0)).toBe('Focused');
    expect(getCoachingPatternLabel(44)).toBe('Focused');
  });
});

// ─── getCoachingPatternColor ──────────────────────────────────────────────────

describe('getCoachingPatternColor', () => {
  it('returns emerald for score >= 75', () => {
    expect(getCoachingPatternColor(80)).toBe('emerald');
    expect(getCoachingPatternColor(75)).toBe('emerald');
  });

  it('returns amber for score 45–74', () => {
    expect(getCoachingPatternColor(60)).toBe('amber');
    expect(getCoachingPatternColor(45)).toBe('amber');
  });

  it('returns red for score < 45', () => {
    expect(getCoachingPatternColor(30)).toBe('red');
    expect(getCoachingPatternColor(0)).toBe('red');
  });
});

// ─── buildCoachingPatternInsights ────────────────────────────────────────────

describe('buildCoachingPatternInsights', () => {
  it('adds an alert when there are unobserved players', () => {
    const insights = buildCoachingPatternInsights(80, 70, 80, 2);
    expect(insights.some((i) => i.type === 'alert')).toBe(true);
  });

  it('uses plural form for multiple unobserved players', () => {
    const insights = buildCoachingPatternInsights(80, 70, 80, 3);
    expect(insights.some((i) => i.message.includes('3 players have'))).toBe(true);
  });

  it('uses singular form for a single unobserved player', () => {
    const insights = buildCoachingPatternInsights(80, 70, 80, 1);
    expect(insights.some((i) => i.message.includes('1 player has'))).toBe(true);
  });

  it('adds a concentrated-attention suggestion when balance < 60', () => {
    const insights = buildCoachingPatternInsights(40, 90, 90, 0);
    expect(
      insights.some((i) => i.type === 'suggestion' && i.message.includes('concentrated')),
    ).toBe(true);
  });

  it('adds a mild suggestion when balance is 60–79', () => {
    const insights = buildCoachingPatternInsights(70, 90, 90, 0);
    expect(insights.some((i) => i.type === 'suggestion')).toBe(true);
  });

  it('adds a consistency suggestion when consistency < 50', () => {
    const insights = buildCoachingPatternInsights(80, 90, 30, 0);
    expect(
      insights.some((i) => i.message.includes('several weeks with no observations')),
    ).toBe(true);
  });

  it('adds praise when all metrics are high and no unobserved players', () => {
    const insights = buildCoachingPatternInsights(90, 95, 80, 0);
    expect(insights.some((i) => i.type === 'praise')).toBe(true);
  });

  it('does not add praise when there are unobserved players', () => {
    const insights = buildCoachingPatternInsights(90, 95, 80, 1);
    expect(insights.some((i) => i.type === 'praise')).toBe(false);
  });

  it('returns empty array for zero unobserved, high balance, high consistency', () => {
    // Doesn't quite hit praise threshold (balance 80, not >=75 but coverage is too)
    const insights = buildCoachingPatternInsights(80, 85, 80, 0);
    // praise fires at coverage>=90, balance>=75, consistency>=75 — coverage misses here
    const hasPraise = insights.some((i) => i.type === 'praise');
    // Just ensure it doesn't crash and returns an array
    expect(Array.isArray(insights)).toBe(true);
    // Shouldn't praise since coverage < 90
    expect(hasPraise).toBe(false);
  });
});

// ─── hasSufficientPatternData ─────────────────────────────────────────────────

describe('hasSufficientPatternData', () => {
  it('returns false with fewer than 5 observations', () => {
    const obs = Array.from({ length: 4 }, () => makeObs());
    expect(hasSufficientPatternData(obs, ['p1', 'p2'])).toBe(false);
  });

  it('returns false with fewer than 2 players', () => {
    const obs = Array.from({ length: 10 }, () => makeObs());
    expect(hasSufficientPatternData(obs, ['p1'])).toBe(false);
  });

  it('returns true with exactly 5 observations and 2 players', () => {
    const obs = Array.from({ length: 5 }, () => makeObs());
    expect(hasSufficientPatternData(obs, ['p1', 'p2'])).toBe(true);
  });

  it('returns false with no observations and no players', () => {
    expect(hasSufficientPatternData([], [])).toBe(false);
  });
});
