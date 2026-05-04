import { describe, it, expect } from 'vitest';
import {
  groupNeedsWorkByPlayerCategory,
  findStrugglingPlayers,
  sortByStrugglingCount,
  getTopStrugglingPlayer,
  countStrugglingPlayers,
  hasEnoughDataForStruggling,
  buildStrugglingLabel,
  buildStrugglingNotificationTitle,
  buildStrugglingNotificationBody,
  buildCoachingTip,
  isStrugglingPlayer,
  getCategoryDrillUrl,
  formatStrugglingCategory,
  type ObsForStruggling,
} from '../src/lib/struggling-player-utils';

const makeObs = (
  player_id: string | null,
  category: string | null,
  sentiment: string | null,
): ObsForStruggling => ({ player_id, category, sentiment });

const PLAYERS = [
  { id: 'p1', name: 'Marcus' },
  { id: 'p2', name: 'Tyler' },
  { id: 'p3', name: 'Sarah' },
];

describe('getCategoryDrillUrl', () => {
  it('maps dribbling to Ball Handling drill URL', () => {
    expect(getCategoryDrillUrl('dribbling')).toBe('/drills?category=Ball%20Handling');
  });
  it('maps defense', () => {
    expect(getCategoryDrillUrl('defense')).toBe('/drills?category=Defense');
  });
  it('maps hustle to Conditioning', () => {
    expect(getCategoryDrillUrl('hustle')).toBe('/drills?category=Conditioning');
  });
  it('maps footwork to Conditioning', () => {
    expect(getCategoryDrillUrl('footwork')).toBe('/drills?category=Conditioning');
  });
  it('falls back to /drills for unknown category', () => {
    expect(getCategoryDrillUrl('unknown')).toBe('/drills');
  });
  it('maps leadership to /drills', () => {
    expect(getCategoryDrillUrl('leadership')).toBe('/drills');
  });
});

describe('formatStrugglingCategory', () => {
  it('maps dribbling to Ball Handling', () => {
    expect(formatStrugglingCategory('dribbling')).toBe('Ball Handling');
  });
  it('maps teamwork to Teamwork', () => {
    expect(formatStrugglingCategory('teamwork')).toBe('Teamwork');
  });
  it('capitalises unknown categories', () => {
    expect(formatStrugglingCategory('unknown')).toBe('Unknown');
  });
  it('maps awareness to Awareness', () => {
    expect(formatStrugglingCategory('awareness')).toBe('Awareness');
  });
});

describe('groupNeedsWorkByPlayerCategory', () => {
  it('counts needs-work obs grouped by player+category', () => {
    const obs = [
      makeObs('p1', 'dribbling', 'needs-work'),
      makeObs('p1', 'dribbling', 'needs-work'),
      makeObs('p1', 'defense', 'needs-work'),
      makeObs('p2', 'dribbling', 'needs-work'),
    ];
    const result = groupNeedsWorkByPlayerCategory(obs);
    expect(result.get('p1|dribbling')).toBe(2);
    expect(result.get('p1|defense')).toBe(1);
    expect(result.get('p2|dribbling')).toBe(1);
  });

  it('ignores positive and neutral observations', () => {
    const obs = [
      makeObs('p1', 'dribbling', 'positive'),
      makeObs('p1', 'dribbling', 'neutral'),
      makeObs('p1', 'dribbling', 'needs-work'),
    ];
    const result = groupNeedsWorkByPlayerCategory(obs);
    expect(result.get('p1|dribbling')).toBe(1);
  });

  it('ignores general category', () => {
    const obs = [
      makeObs('p1', 'general', 'needs-work'),
      makeObs('p1', 'general', 'needs-work'),
      makeObs('p1', 'general', 'needs-work'),
    ];
    const result = groupNeedsWorkByPlayerCategory(obs);
    expect(result.size).toBe(0);
  });

  it('ignores null player_id', () => {
    const obs = [makeObs(null, 'dribbling', 'needs-work')];
    const result = groupNeedsWorkByPlayerCategory(obs);
    expect(result.size).toBe(0);
  });

  it('ignores null category', () => {
    const obs = [makeObs('p1', null, 'needs-work')];
    const result = groupNeedsWorkByPlayerCategory(obs);
    expect(result.size).toBe(0);
  });

  it('returns empty map for empty obs array', () => {
    const result = groupNeedsWorkByPlayerCategory([]);
    expect(result.size).toBe(0);
  });
});

describe('findStrugglingPlayers', () => {
  it('returns players meeting the threshold', () => {
    const obs = [
      makeObs('p1', 'dribbling', 'needs-work'),
      makeObs('p1', 'dribbling', 'needs-work'),
      makeObs('p1', 'dribbling', 'needs-work'),
    ];
    const result = findStrugglingPlayers(obs, PLAYERS, 3);
    expect(result).toHaveLength(1);
    expect(result[0].playerName).toBe('Marcus');
    expect(result[0].category).toBe('dribbling');
    expect(result[0].count).toBe(3);
  });

  it('excludes players below threshold', () => {
    const obs = [
      makeObs('p1', 'dribbling', 'needs-work'),
      makeObs('p1', 'dribbling', 'needs-work'),
    ];
    const result = findStrugglingPlayers(obs, PLAYERS, 3);
    expect(result).toHaveLength(0);
  });

  it('picks worst category per player when multiple categories qualify', () => {
    const obs = [
      ...Array(5).fill(makeObs('p1', 'dribbling', 'needs-work')),
      ...Array(3).fill(makeObs('p1', 'defense', 'needs-work')),
    ];
    const result = findStrugglingPlayers(obs, PLAYERS, 3);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('dribbling');
    expect(result[0].count).toBe(5);
  });

  it('includes multiple players if both qualify', () => {
    const obs = [
      ...Array(3).fill(makeObs('p1', 'dribbling', 'needs-work')),
      ...Array(4).fill(makeObs('p2', 'defense', 'needs-work')),
    ];
    const result = findStrugglingPlayers(obs, PLAYERS, 3);
    expect(result).toHaveLength(2);
  });

  it('excludes players not on the roster', () => {
    const obs = Array(3).fill(makeObs('unknown-id', 'dribbling', 'needs-work'));
    const result = findStrugglingPlayers(obs, PLAYERS, 3);
    expect(result).toHaveLength(0);
  });

  it('sets captureUrl with playerId', () => {
    const obs = Array(3).fill(makeObs('p1', 'dribbling', 'needs-work'));
    const result = findStrugglingPlayers(obs, PLAYERS, 3);
    expect(result[0].captureUrl).toBe('/capture?playerId=p1');
  });

  it('returns empty array with no observations', () => {
    expect(findStrugglingPlayers([], PLAYERS, 3)).toHaveLength(0);
  });

  it('ignores general category obs', () => {
    const obs = Array(5).fill(makeObs('p1', 'general', 'needs-work'));
    expect(findStrugglingPlayers(obs, PLAYERS, 3)).toHaveLength(0);
  });
});

describe('sortByStrugglingCount', () => {
  it('sorts descending by count', () => {
    const players: ReturnType<typeof findStrugglingPlayers> = [
      { playerId: 'p1', playerName: 'A', category: 'x', count: 3, drillUrl: '/', captureUrl: '/' },
      { playerId: 'p2', playerName: 'B', category: 'x', count: 7, drillUrl: '/', captureUrl: '/' },
      { playerId: 'p3', playerName: 'C', category: 'x', count: 5, drillUrl: '/', captureUrl: '/' },
    ];
    const sorted = sortByStrugglingCount(players);
    expect(sorted[0].count).toBe(7);
    expect(sorted[1].count).toBe(5);
    expect(sorted[2].count).toBe(3);
  });

  it('does not mutate original array', () => {
    const players = [
      { playerId: 'p1', playerName: 'A', category: 'x', count: 3, drillUrl: '/', captureUrl: '/' },
    ];
    const original = [...players];
    sortByStrugglingCount(players);
    expect(players).toEqual(original);
  });
});

describe('getTopStrugglingPlayer', () => {
  it('returns null for empty array', () => {
    expect(getTopStrugglingPlayer([])).toBeNull();
  });

  it('returns player with highest count', () => {
    const players = [
      { playerId: 'p1', playerName: 'A', category: 'x', count: 3, drillUrl: '/', captureUrl: '/' },
      { playerId: 'p2', playerName: 'B', category: 'x', count: 7, drillUrl: '/', captureUrl: '/' },
    ];
    expect(getTopStrugglingPlayer(players)?.playerId).toBe('p2');
  });
});

describe('countStrugglingPlayers', () => {
  it('returns 0 for empty', () => {
    expect(countStrugglingPlayers([])).toBe(0);
  });
  it('returns correct count', () => {
    const players = Array(3).fill({ playerId: 'x', playerName: 'X', category: 'y', count: 3, drillUrl: '/', captureUrl: '/' });
    expect(countStrugglingPlayers(players)).toBe(3);
  });
});

describe('hasEnoughDataForStruggling', () => {
  it('returns false when fewer than 5 needs-work obs', () => {
    const obs = Array(4).fill(makeObs('p1', 'dribbling', 'needs-work'));
    expect(hasEnoughDataForStruggling(obs)).toBe(false);
  });

  it('returns true when 5+ needs-work obs', () => {
    const obs = Array(5).fill(makeObs('p1', 'dribbling', 'needs-work'));
    expect(hasEnoughDataForStruggling(obs)).toBe(true);
  });

  it('counts only needs-work, not positive/neutral', () => {
    const obs = [
      ...Array(10).fill(makeObs('p1', 'dribbling', 'positive')),
      ...Array(4).fill(makeObs('p1', 'defense', 'needs-work')),
    ];
    expect(hasEnoughDataForStruggling(obs)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(hasEnoughDataForStruggling([])).toBe(false);
  });
});

describe('buildStrugglingLabel', () => {
  it('includes count and category label', () => {
    expect(buildStrugglingLabel('dribbling', 4)).toBe('4× needs-work: Ball Handling');
  });
  it('uses capitalized unknown category', () => {
    expect(buildStrugglingLabel('unknown', 3)).toBe('3× needs-work: Unknown');
  });
});

describe('buildStrugglingNotificationTitle', () => {
  it('includes player name and category', () => {
    const data = { playerId: 'p1', playerName: 'Marcus', category: 'dribbling', count: 4, drillUrl: '/', captureUrl: '/' };
    expect(buildStrugglingNotificationTitle(data)).toBe('Marcus needs targeted Ball Handling work');
  });
});

describe('buildStrugglingNotificationBody', () => {
  it('includes count and category', () => {
    const data = { playerId: 'p1', playerName: 'Marcus', category: 'defense', count: 5, drillUrl: '/', captureUrl: '/' };
    const body = buildStrugglingNotificationBody(data);
    expect(body).toContain('5');
    expect(body).toContain('Defense');
  });
});

describe('buildCoachingTip', () => {
  it('returns escalated message for 6+ observations', () => {
    const data = { playerId: 'p1', playerName: 'Marcus', category: 'defense', count: 6, drillUrl: '/', captureUrl: '/' };
    expect(buildCoachingTip(data)).toContain('focused attention');
  });
  it('returns medium message for 4-5 observations', () => {
    const data = { playerId: 'p1', playerName: 'Marcus', category: 'defense', count: 4, drillUrl: '/', captureUrl: '/' };
    expect(buildCoachingTip(data)).toContain('4 times');
  });
  it('returns basic message for 3 observations', () => {
    const data = { playerId: 'p1', playerName: 'Marcus', category: 'defense', count: 3, drillUrl: '/', captureUrl: '/' };
    expect(buildCoachingTip(data)).toContain('3 times');
  });
});

describe('isStrugglingPlayer', () => {
  it('returns true when player meets threshold', () => {
    const obs = Array(3).fill(makeObs('p1', 'dribbling', 'needs-work'));
    expect(isStrugglingPlayer(obs, 'p1', 'dribbling', 3)).toBe(true);
  });
  it('returns false when below threshold', () => {
    const obs = Array(2).fill(makeObs('p1', 'dribbling', 'needs-work'));
    expect(isStrugglingPlayer(obs, 'p1', 'dribbling', 3)).toBe(false);
  });
  it('returns false for different category', () => {
    const obs = Array(3).fill(makeObs('p1', 'dribbling', 'needs-work'));
    expect(isStrugglingPlayer(obs, 'p1', 'defense', 3)).toBe(false);
  });
  it('returns false for different player', () => {
    const obs = Array(3).fill(makeObs('p1', 'dribbling', 'needs-work'));
    expect(isStrugglingPlayer(obs, 'p2', 'dribbling', 3)).toBe(false);
  });
});
