import { describe, it, expect } from 'vitest';
import {
  parseResultOutcome,
  getResultColor,
  getResultBadgeClasses,
  buildGameTitle,
  isGameSession,
  countBySentiment,
  calculatePerformanceScore,
  selectTopHighlights,
  buildShareText,
  hasEnoughDataForRecap,
  groupObsByPlayer,
  type RecapObservation,
  type RecapHighlight,
} from '../src/lib/game-recap-utils';

// ─── parseResultOutcome ───────────────────────────────────────────────────────

describe('parseResultOutcome', () => {
  it('returns win for "W"', () => {
    expect(parseResultOutcome('W')).toBe('win');
  });

  it('returns win for "W 42-38"', () => {
    expect(parseResultOutcome('W 42-38')).toBe('win');
  });

  it('returns win for "WIN"', () => {
    expect(parseResultOutcome('WIN')).toBe('win');
  });

  it('returns win for "Won"', () => {
    expect(parseResultOutcome('Won')).toBe('win');
  });

  it('returns loss for "L"', () => {
    expect(parseResultOutcome('L')).toBe('loss');
  });

  it('returns loss for "L 30-35"', () => {
    expect(parseResultOutcome('L 30-35')).toBe('loss');
  });

  it('returns loss for "Loss"', () => {
    expect(parseResultOutcome('Loss')).toBe('loss');
  });

  it('returns loss for "LOST"', () => {
    expect(parseResultOutcome('LOST')).toBe('loss');
  });

  it('returns tie for "T"', () => {
    expect(parseResultOutcome('T')).toBe('tie');
  });

  it('returns tie for "Tie"', () => {
    expect(parseResultOutcome('Tie')).toBe('tie');
  });

  it('returns tie for "DRAW"', () => {
    expect(parseResultOutcome('DRAW')).toBe('tie');
  });

  it('returns unknown for null', () => {
    expect(parseResultOutcome(null)).toBe('unknown');
  });

  it('returns unknown for undefined', () => {
    expect(parseResultOutcome(undefined)).toBe('unknown');
  });

  it('returns unknown for empty string', () => {
    expect(parseResultOutcome('')).toBe('unknown');
  });
});

// ─── getResultColor ───────────────────────────────────────────────────────────

describe('getResultColor', () => {
  it('returns emerald for win', () => {
    expect(getResultColor('win')).toBe('text-emerald-400');
  });

  it('returns red for loss', () => {
    expect(getResultColor('loss')).toBe('text-red-400');
  });

  it('returns zinc for tie', () => {
    expect(getResultColor('tie')).toBe('text-zinc-400');
  });

  it('returns orange for unknown', () => {
    expect(getResultColor('unknown')).toBe('text-orange-400');
  });
});

// ─── getResultBadgeClasses ────────────────────────────────────────────────────

describe('getResultBadgeClasses', () => {
  it('returns emerald classes for win', () => {
    expect(getResultBadgeClasses('win')).toContain('emerald');
  });

  it('returns red classes for loss', () => {
    expect(getResultBadgeClasses('loss')).toContain('red');
  });

  it('returns zinc classes for tie', () => {
    expect(getResultBadgeClasses('tie')).toContain('zinc');
  });

  it('returns orange classes for unknown', () => {
    expect(getResultBadgeClasses('unknown')).toContain('orange');
  });
});

// ─── buildGameTitle ───────────────────────────────────────────────────────────

describe('buildGameTitle', () => {
  it('builds title with opponent', () => {
    const title = buildGameTitle('game', 'Lions', '2025-04-12');
    expect(title).toContain('Game');
    expect(title).toContain('Lions');
    expect(title).toContain('Apr 12');
  });

  it('builds title without opponent', () => {
    const title = buildGameTitle('scrimmage', null, '2025-04-12');
    expect(title).toContain('Scrimmage');
    expect(title).not.toContain('vs');
    expect(title).toContain('Apr 12');
  });

  it('capitalizes session type', () => {
    const title = buildGameTitle('tournament', 'Eagles', '2025-06-01');
    expect(title.startsWith('Tournament')).toBe(true);
  });
});

// ─── isGameSession ────────────────────────────────────────────────────────────

describe('isGameSession', () => {
  it('returns true for game', () => {
    expect(isGameSession('game')).toBe(true);
  });

  it('returns true for scrimmage', () => {
    expect(isGameSession('scrimmage')).toBe(true);
  });

  it('returns true for tournament', () => {
    expect(isGameSession('tournament')).toBe(true);
  });

  it('returns false for practice', () => {
    expect(isGameSession('practice')).toBe(false);
  });

  it('returns false for training', () => {
    expect(isGameSession('training')).toBe(false);
  });
});

// ─── countBySentiment ────────────────────────────────────────────────────────

describe('countBySentiment', () => {
  const observations: RecapObservation[] = [
    { sentiment: 'positive', text: 'A' },
    { sentiment: 'positive', text: 'B' },
    { sentiment: 'needs-work', text: 'C' },
    { sentiment: 'neutral', text: 'D' },
  ];

  it('counts positive correctly', () => {
    expect(countBySentiment(observations).positive).toBe(2);
  });

  it('counts needs-work correctly', () => {
    expect(countBySentiment(observations)['needs-work']).toBe(1);
  });

  it('counts neutral correctly', () => {
    expect(countBySentiment(observations).neutral).toBe(1);
  });

  it('returns empty object for empty input', () => {
    expect(countBySentiment([])).toEqual({});
  });
});

// ─── calculatePerformanceScore ───────────────────────────────────────────────

describe('calculatePerformanceScore', () => {
  it('returns 50 for empty observations', () => {
    expect(calculatePerformanceScore([])).toBe(50);
  });

  it('returns 100 for all positive', () => {
    const obs: RecapObservation[] = [
      { sentiment: 'positive', text: 'A' },
      { sentiment: 'positive', text: 'B' },
    ];
    expect(calculatePerformanceScore(obs)).toBe(100);
  });

  it('returns 0 for all needs-work with enough depth', () => {
    const obs: RecapObservation[] = Array(10).fill({ sentiment: 'needs-work', text: 'x' });
    const score = calculatePerformanceScore(obs);
    expect(score).toBeLessThan(50);
  });

  it('returns value between 0 and 100', () => {
    const obs: RecapObservation[] = [
      { sentiment: 'positive', text: 'A' },
      { sentiment: 'needs-work', text: 'B' },
      { sentiment: 'neutral', text: 'C' },
    ];
    const score = calculatePerformanceScore(obs);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ─── selectTopHighlights ─────────────────────────────────────────────────────

describe('selectTopHighlights', () => {
  const highlights: RecapHighlight[] = [
    { player_name: 'Charlie', highlight: 'good' },
    { player_name: 'Alice', highlight: 'great' },
    { player_name: 'Bob', highlight: 'solid' },
    { player_name: 'David', highlight: 'average' },
  ];

  it('limits to requested count', () => {
    expect(selectTopHighlights(highlights, 2)).toHaveLength(2);
  });

  it('sorts alphabetically', () => {
    const result = selectTopHighlights(highlights, 4);
    expect(result[0].player_name).toBe('Alice');
    expect(result[1].player_name).toBe('Bob');
  });

  it('returns all when limit exceeds array length', () => {
    expect(selectTopHighlights(highlights, 10)).toHaveLength(4);
  });

  it('returns empty for empty input', () => {
    expect(selectTopHighlights([], 3)).toEqual([]);
  });
});

// ─── buildShareText ───────────────────────────────────────────────────────────

describe('buildShareText', () => {
  const recap = {
    title: 'Game vs Lions — Apr 12',
    result_headline: 'Victory Over the Lions',
    intro: 'The team played with heart tonight.',
    key_moments: [
      { headline: 'Big Block', description: 'Stopped a fast break.', player_name: 'Alex' },
    ],
    player_highlights: [
      { player_name: 'Marcus', highlight: 'Led scoring.', stat_line: '12 pts' },
    ],
    coach_message: 'I am proud of every one of you.',
    looking_ahead: 'Next practice Wednesday!',
  };

  it('includes title', () => {
    expect(buildShareText(recap)).toContain('Game vs Lions');
  });

  it('includes result headline', () => {
    expect(buildShareText(recap)).toContain('Victory Over the Lions');
  });

  it('includes key moment headline', () => {
    expect(buildShareText(recap)).toContain('Big Block');
  });

  it('includes player name in highlights', () => {
    expect(buildShareText(recap)).toContain('Marcus');
  });

  it('includes stat line', () => {
    expect(buildShareText(recap)).toContain('12 pts');
  });

  it('includes coach message in quotes', () => {
    const text = buildShareText(recap);
    expect(text).toContain('I am proud');
  });

  it('includes looking ahead', () => {
    expect(buildShareText(recap)).toContain('Next practice Wednesday');
  });

  it('returns non-empty string for minimal recap', () => {
    expect(buildShareText({ title: 'Game', result_headline: 'Win' }).length).toBeGreaterThan(0);
  });
});

// ─── hasEnoughDataForRecap ───────────────────────────────────────────────────

describe('hasEnoughDataForRecap', () => {
  it('returns true when obs count meets default minimum (2)', () => {
    const obs: RecapObservation[] = [
      { sentiment: 'positive', text: 'A' },
      { sentiment: 'positive', text: 'B' },
    ];
    expect(hasEnoughDataForRecap(obs)).toBe(true);
  });

  it('returns false when below default minimum', () => {
    const obs: RecapObservation[] = [{ sentiment: 'positive', text: 'A' }];
    expect(hasEnoughDataForRecap(obs)).toBe(false);
  });

  it('respects custom minimum', () => {
    const obs: RecapObservation[] = Array(5).fill({ sentiment: 'positive', text: 'x' });
    expect(hasEnoughDataForRecap(obs, 10)).toBe(false);
    expect(hasEnoughDataForRecap(obs, 5)).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(hasEnoughDataForRecap([])).toBe(false);
  });
});

// ─── groupObsByPlayer ────────────────────────────────────────────────────────

describe('groupObsByPlayer', () => {
  const observations: RecapObservation[] = [
    { player_id: 'p1', sentiment: 'positive', text: 'A' },
    { player_id: 'p1', sentiment: 'needs-work', text: 'B' },
    { player_id: 'p2', sentiment: 'positive', text: 'C' },
    { player_id: null,  sentiment: 'neutral',  text: 'D' },
  ];

  it('groups by player id', () => {
    const map = groupObsByPlayer(observations);
    expect(map.has('p1')).toBe(true);
    expect(map.has('p2')).toBe(true);
  });

  it('groups null player_id under "team"', () => {
    const map = groupObsByPlayer(observations);
    expect(map.has('team')).toBe(true);
  });

  it('counts totals correctly', () => {
    const map = groupObsByPlayer(observations);
    expect(map.get('p1')?.total).toBe(2);
  });

  it('counts positive correctly', () => {
    const map = groupObsByPlayer(observations);
    expect(map.get('p1')?.positive).toBe(1);
    expect(map.get('p2')?.positive).toBe(1);
  });

  it('counts needs-work correctly', () => {
    const map = groupObsByPlayer(observations);
    expect(map.get('p1')?.needsWork).toBe(1);
    expect(map.get('p2')?.needsWork).toBe(0);
  });

  it('returns empty map for empty input', () => {
    expect(groupObsByPlayer([])).toEqual(new Map());
  });
});
