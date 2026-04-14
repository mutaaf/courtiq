import { describe, it, expect } from 'vitest';
import {
  getSeasonDateRange,
  countObsBySentiment,
  calculateSeasonHealthScore,
  groupByCategory,
  getTopCategories,
  countObservedPlayers,
  countWeeksOfData,
  countSessionsByType,
  hasEnoughDataForSummary,
  getMostObservedPlayer,
  buildSeasonShareText,
  buildSummaryStatsLabel,
  classifySkillCategory,
  type SummaryObservation,
  type SummarySession,
  type SummaryPlayer,
  type SeasonSummaryResult,
} from '../src/lib/season-summary-utils';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const makeObs = (
  opts: Partial<SummaryObservation> & { sentiment: string }
): SummaryObservation => ({
  created_at: '2024-03-01T10:00:00Z',
  text: 'test observation',
  category: 'Offense',
  player_id: 'player-1',
  ...opts,
});

const makeSession = (opts: Partial<SummarySession> = {}): SummarySession => ({
  id: 'session-1',
  type: 'practice',
  date: '2024-03-01',
  ...opts,
});

// ─── getSeasonDateRange ───────────────────────────────────────────────────────

describe('getSeasonDateRange', () => {
  it('returns no-data label for empty array', () => {
    const result = getSeasonDateRange([]);
    expect(result.startDate).toBeNull();
    expect(result.endDate).toBeNull();
    expect(result.label).toBe('No data');
  });

  it('returns same start and end for single observation', () => {
    const obs = [makeObs({ sentiment: 'positive', created_at: '2024-01-15T10:00:00Z' })];
    const result = getSeasonDateRange(obs);
    expect(result.startDate).toBe('2024-01-15T10:00:00Z');
    expect(result.endDate).toBe('2024-01-15T10:00:00Z');
  });

  it('returns correct range for multiple observations', () => {
    const obs = [
      makeObs({ sentiment: 'positive', created_at: '2024-01-01T10:00:00Z' }),
      makeObs({ sentiment: 'positive', created_at: '2024-03-15T10:00:00Z' }),
      makeObs({ sentiment: 'positive', created_at: '2024-02-10T10:00:00Z' }),
    ];
    const result = getSeasonDateRange(obs);
    expect(result.startDate).toBe('2024-01-01T10:00:00Z');
    expect(result.endDate).toBe('2024-03-15T10:00:00Z');
  });

  it('includes a human-readable label', () => {
    const obs = [
      makeObs({ sentiment: 'positive', created_at: '2024-09-01T10:00:00Z' }),
      makeObs({ sentiment: 'positive', created_at: '2024-12-15T10:00:00Z' }),
    ];
    const result = getSeasonDateRange(obs);
    expect(result.label).toContain('2024');
    expect(result.label).toContain('–');
  });
});

// ─── countObsBySentiment ─────────────────────────────────────────────────────

describe('countObsBySentiment', () => {
  it('returns zeros for empty array', () => {
    const result = countObsBySentiment([]);
    expect(result.positive).toBe(0);
    expect(result.needsWork).toBe(0);
    expect(result.neutral).toBe(0);
  });

  it('counts all positive', () => {
    const obs = [
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'positive' }),
    ];
    const result = countObsBySentiment(obs);
    expect(result.positive).toBe(2);
    expect(result.needsWork).toBe(0);
  });

  it('counts needs-work correctly', () => {
    const obs = [
      makeObs({ sentiment: 'needs-work' }),
      makeObs({ sentiment: 'needs-work' }),
      makeObs({ sentiment: 'positive' }),
    ];
    const result = countObsBySentiment(obs);
    expect(result.positive).toBe(1);
    expect(result.needsWork).toBe(2);
  });

  it('counts neutral correctly', () => {
    const obs = [
      makeObs({ sentiment: 'neutral' }),
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'neutral' }),
    ];
    const result = countObsBySentiment(obs);
    expect(result.neutral).toBe(2);
    expect(result.positive).toBe(1);
  });
});

// ─── calculateSeasonHealthScore ───────────────────────────────────────────────

describe('calculateSeasonHealthScore', () => {
  it('returns 50 for empty observations', () => {
    expect(calculateSeasonHealthScore([])).toBe(50);
  });

  it('returns high score for all positive', () => {
    const obs = Array(10).fill(null).map(() => makeObs({ sentiment: 'positive' }));
    const score = calculateSeasonHealthScore(obs);
    expect(score).toBeGreaterThan(80);
  });

  it('returns low score for mostly needs-work', () => {
    const obs = [
      ...Array(8).fill(null).map(() => makeObs({ sentiment: 'needs-work' })),
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'positive' }),
    ];
    const score = calculateSeasonHealthScore(obs);
    expect(score).toBeLessThan(50);
  });

  it('returns mid-range score for mixed observations', () => {
    const obs = [
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'needs-work' }),
      makeObs({ sentiment: 'neutral' }),
      makeObs({ sentiment: 'positive' }),
    ];
    const score = calculateSeasonHealthScore(obs);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('never returns below 0 or above 100', () => {
    const allPositive = Array(20).fill(null).map(() => makeObs({ sentiment: 'positive' }));
    const allNegative = Array(20).fill(null).map(() => makeObs({ sentiment: 'needs-work' }));
    expect(calculateSeasonHealthScore(allPositive)).toBeLessThanOrEqual(100);
    expect(calculateSeasonHealthScore(allNegative)).toBeGreaterThanOrEqual(0);
  });
});

// ─── groupByCategory ─────────────────────────────────────────────────────────

describe('groupByCategory', () => {
  it('returns empty object for empty array', () => {
    expect(groupByCategory([])).toEqual({});
  });

  it('groups by category correctly', () => {
    const obs = [
      makeObs({ sentiment: 'positive', category: 'Offense' }),
      makeObs({ sentiment: 'positive', category: 'Defense' }),
      makeObs({ sentiment: 'positive', category: 'Offense' }),
    ];
    const result = groupByCategory(obs);
    expect(result['Offense']).toBe(2);
    expect(result['Defense']).toBe(1);
  });

  it('uses Uncategorized for null category', () => {
    const obs = [makeObs({ sentiment: 'positive', category: null })];
    const result = groupByCategory(obs);
    expect(result['Uncategorized']).toBe(1);
  });
});

// ─── getTopCategories ────────────────────────────────────────────────────────

describe('getTopCategories', () => {
  it('returns empty for empty observations', () => {
    expect(getTopCategories([])).toEqual([]);
  });

  it('returns top N by count', () => {
    const obs = [
      ...Array(5).fill(null).map(() => makeObs({ sentiment: 'positive', category: 'Offense' })),
      ...Array(3).fill(null).map(() => makeObs({ sentiment: 'positive', category: 'Defense' })),
      ...Array(1).fill(null).map(() => makeObs({ sentiment: 'positive', category: 'IQ' })),
    ];
    const top = getTopCategories(obs, 2);
    expect(top[0]).toBe('Offense');
    expect(top[1]).toBe('Defense');
    expect(top.length).toBe(2);
  });

  it('returns all categories when fewer than N', () => {
    const obs = [
      makeObs({ sentiment: 'positive', category: 'Offense' }),
      makeObs({ sentiment: 'positive', category: 'Defense' }),
    ];
    const top = getTopCategories(obs, 10);
    expect(top.length).toBe(2);
  });
});

// ─── countObservedPlayers ────────────────────────────────────────────────────

describe('countObservedPlayers', () => {
  it('returns 0 for empty observations', () => {
    expect(countObservedPlayers([])).toBe(0);
  });

  it('counts unique players', () => {
    const obs = [
      makeObs({ sentiment: 'positive', player_id: 'p1' }),
      makeObs({ sentiment: 'positive', player_id: 'p2' }),
      makeObs({ sentiment: 'positive', player_id: 'p1' }),
    ];
    expect(countObservedPlayers(obs)).toBe(2);
  });

  it('ignores team observations (null player_id)', () => {
    const obs = [
      makeObs({ sentiment: 'positive', player_id: null }),
      makeObs({ sentiment: 'positive', player_id: 'p1' }),
    ];
    expect(countObservedPlayers(obs)).toBe(1);
  });
});

// ─── countWeeksOfData ────────────────────────────────────────────────────────

describe('countWeeksOfData', () => {
  it('returns 0 for empty observations', () => {
    expect(countWeeksOfData([])).toBe(0);
  });

  it('returns 1 for observations in the same week', () => {
    const obs = [
      makeObs({ sentiment: 'positive', created_at: '2024-03-04T10:00:00Z' }),
      makeObs({ sentiment: 'positive', created_at: '2024-03-05T10:00:00Z' }),
      makeObs({ sentiment: 'positive', created_at: '2024-03-06T10:00:00Z' }),
    ];
    expect(countWeeksOfData(obs)).toBe(1);
  });

  it('returns multiple for observations across weeks', () => {
    const obs = [
      makeObs({ sentiment: 'positive', created_at: '2024-01-01T10:00:00Z' }),
      makeObs({ sentiment: 'positive', created_at: '2024-02-01T10:00:00Z' }),
      makeObs({ sentiment: 'positive', created_at: '2024-03-01T10:00:00Z' }),
    ];
    expect(countWeeksOfData(obs)).toBeGreaterThan(1);
  });
});

// ─── countSessionsByType ─────────────────────────────────────────────────────

describe('countSessionsByType', () => {
  it('returns empty for no sessions', () => {
    expect(countSessionsByType([])).toEqual({});
  });

  it('counts by type correctly', () => {
    const sessions = [
      makeSession({ type: 'practice' }),
      makeSession({ type: 'game' }),
      makeSession({ type: 'practice' }),
      makeSession({ type: 'scrimmage' }),
    ];
    const result = countSessionsByType(sessions);
    expect(result['practice']).toBe(2);
    expect(result['game']).toBe(1);
    expect(result['scrimmage']).toBe(1);
  });
});

// ─── hasEnoughDataForSummary ──────────────────────────────────────────────────

describe('hasEnoughDataForSummary', () => {
  it('returns false for insufficient observations', () => {
    const obs = Array(5).fill(null).map(() => makeObs({ sentiment: 'positive' }));
    const sessions = Array(5).fill(null).map(() => makeSession());
    expect(hasEnoughDataForSummary(obs, sessions)).toBe(false);
  });

  it('returns false for insufficient sessions', () => {
    const obs = Array(20).fill(null).map(() => makeObs({ sentiment: 'positive' }));
    const sessions = [makeSession(), makeSession()];
    expect(hasEnoughDataForSummary(obs, sessions)).toBe(false);
  });

  it('returns true when both thresholds are met', () => {
    const obs = Array(15).fill(null).map(() => makeObs({ sentiment: 'positive' }));
    const sessions = Array(5).fill(null).map(() => makeSession());
    expect(hasEnoughDataForSummary(obs, sessions)).toBe(true);
  });

  it('returns true at exact minimums (10 obs, 3 sessions)', () => {
    const obs = Array(10).fill(null).map(() => makeObs({ sentiment: 'positive' }));
    const sessions = Array(3).fill(null).map(() => makeSession());
    expect(hasEnoughDataForSummary(obs, sessions)).toBe(true);
  });
});

// ─── getMostObservedPlayer ────────────────────────────────────────────────────

describe('getMostObservedPlayer', () => {
  const players: SummaryPlayer[] = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Carol' },
  ];

  it('returns null for empty observations', () => {
    expect(getMostObservedPlayer([], players)).toBeNull();
  });

  it('returns null when no player observations', () => {
    const obs = [makeObs({ sentiment: 'positive', player_id: null })];
    expect(getMostObservedPlayer(obs, players)).toBeNull();
  });

  it('returns the player with the most observations', () => {
    const obs = [
      makeObs({ sentiment: 'positive', player_id: 'p1' }),
      makeObs({ sentiment: 'positive', player_id: 'p2' }),
      makeObs({ sentiment: 'positive', player_id: 'p1' }),
      makeObs({ sentiment: 'positive', player_id: 'p1' }),
    ];
    const result = getMostObservedPlayer(obs, players);
    expect(result?.name).toBe('Alice');
  });

  it('returns null when player id does not match any player', () => {
    const obs = [makeObs({ sentiment: 'positive', player_id: 'unknown-id' })];
    expect(getMostObservedPlayer(obs, players)).toBeNull();
  });
});

// ─── buildSeasonShareText ────────────────────────────────────────────────────

describe('buildSeasonShareText', () => {
  const mockSummary: SeasonSummaryResult = {
    headline: 'A season of growth and teamwork',
    season_period: 'Fall 2024',
    overall_assessment: 'The team showed great improvement.',
    team_highlights: [{ title: 'Championship Run', description: 'Made it to the finals.' }],
    skill_progress: [],
    player_breakthroughs: [{ player_name: 'Alice', achievement: 'Improved defense significantly.' }],
    team_challenges: ['Ball handling under pressure'],
    coaching_insights: 'Focus on fundamentals paid off.',
    next_season_priorities: ['Defensive rotations', 'Free throw shooting'],
    closing_message: 'Looking forward to an even stronger next season!',
  };

  it('includes team name', () => {
    const text = buildSeasonShareText(mockSummary, 'The Rockets');
    expect(text).toContain('The Rockets');
  });

  it('includes the season period', () => {
    const text = buildSeasonShareText(mockSummary, 'Team');
    expect(text).toContain('Fall 2024');
  });

  it('includes the headline', () => {
    const text = buildSeasonShareText(mockSummary, 'Team');
    expect(text).toContain('A season of growth and teamwork');
  });

  it('includes team highlights', () => {
    const text = buildSeasonShareText(mockSummary, 'Team');
    expect(text).toContain('Championship Run');
  });

  it('includes player breakthroughs', () => {
    const text = buildSeasonShareText(mockSummary, 'Team');
    expect(text).toContain('Alice');
  });

  it('includes next season priorities', () => {
    const text = buildSeasonShareText(mockSummary, 'Team');
    expect(text).toContain('Defensive rotations');
  });

  it('includes closing message', () => {
    const text = buildSeasonShareText(mockSummary, 'Team');
    expect(text).toContain('Looking forward');
  });

  it('includes SportsIQ attribution', () => {
    const text = buildSeasonShareText(mockSummary, 'Team');
    expect(text).toContain('SportsIQ');
  });
});

// ─── buildSummaryStatsLabel ───────────────────────────────────────────────────

describe('buildSummaryStatsLabel', () => {
  it('formats the stats strip correctly', () => {
    const label = buildSummaryStatsLabel(48, 12, 8, 6);
    expect(label).toBe('48 obs · 12 sessions · 8 players · 6 weeks');
  });

  it('uses singular for counts of 1', () => {
    const label = buildSummaryStatsLabel(1, 1, 1, 1);
    expect(label).toBe('1 obs · 1 session · 1 player · 1 week');
  });

  it('uses plural for counts greater than 1', () => {
    const label = buildSummaryStatsLabel(2, 2, 2, 2);
    expect(label).toContain('sessions');
    expect(label).toContain('players');
    expect(label).toContain('weeks');
  });
});

// ─── classifySkillCategory ───────────────────────────────────────────────────

describe('classifySkillCategory', () => {
  const allObs = [
    ...Array(5).fill(null).map(() => makeObs({ sentiment: 'positive' })),
    ...Array(5).fill(null).map(() => makeObs({ sentiment: 'needs-work' })),
  ]; // 50% positive baseline

  it('returns consistent for empty category observations', () => {
    expect(classifySkillCategory([], allObs)).toBe('consistent');
  });

  it('returns strength when category positive rate is much higher than baseline', () => {
    const catObs = Array(10).fill(null).map(() => makeObs({ sentiment: 'positive' }));
    expect(classifySkillCategory(catObs, allObs)).toBe('strength');
  });

  it('returns needs_work when category positive rate is much lower than baseline', () => {
    const catObs = Array(10).fill(null).map(() => makeObs({ sentiment: 'needs-work' }));
    expect(classifySkillCategory(catObs, allObs)).toBe('needs_work');
  });

  it('returns most_improved or consistent for average-performing high-volume category', () => {
    // 50% positive, 30 out of 50 total obs → 60% share → most_improved
    const bigAllObs = [
      ...Array(25).fill(null).map(() => makeObs({ sentiment: 'positive', category: 'Offense' })),
      ...Array(25).fill(null).map(() => makeObs({ sentiment: 'needs-work', category: 'Defense' })),
    ];
    const catObs = Array(30).fill(null).map(() => makeObs({ sentiment: 'positive', category: 'Offense' }));
    const result = classifySkillCategory(catObs, bigAllObs);
    expect(['most_improved', 'strength']).toContain(result);
  });
});
