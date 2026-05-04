import { describe, it, expect } from 'vitest';
import {
  isMatchSessionType,
  groupMatchObsByPlayer,
  countPositiveMatchObs,
  getUniqueMatchCategories,
  calculateMatchScore,
  getHighlightObs,
  rankMatchCandidates,
  selectMatchCandidate,
  hasEnoughDataForMatchMVP,
  buildMatchShareText,
  buildMatchSessionLabel,
  isValidMatchResult,
  getMatchAccentClasses,
  type MatchObs,
  type PlayerOfMatchResult,
} from '../src/lib/player-of-match-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeObs(overrides: Partial<MatchObs> = {}): MatchObs {
  return {
    player_id: 'player-1',
    player_name: 'Marcus',
    sentiment: 'positive',
    category: 'defense',
    text: 'Great defensive stance',
    ...overrides,
  };
}

const MARCUS_OBS: MatchObs[] = [
  makeObs({ text: 'Excellent defensive pressure on the ball' }),
  makeObs({ category: 'passing', text: 'Sharp cross-court pass under pressure' }),
  makeObs({ sentiment: 'needs-work', category: 'shooting', text: 'Missed two free throws' }),
];

const JORDAN_OBS: MatchObs[] = [
  makeObs({ player_id: 'player-2', player_name: 'Jordan', category: 'offense', text: 'Led fast break with confidence' }),
  makeObs({ player_id: 'player-2', player_name: 'Jordan', sentiment: 'needs-work', category: 'defense', text: 'Lost assignment on rotation' }),
];

// ─── isMatchSessionType ───────────────────────────────────────────────────────

describe('isMatchSessionType', () => {
  it('returns true for game', () => expect(isMatchSessionType('game')).toBe(true));
  it('returns true for scrimmage', () => expect(isMatchSessionType('scrimmage')).toBe(true));
  it('returns true for tournament', () => expect(isMatchSessionType('tournament')).toBe(true));
  it('returns false for practice', () => expect(isMatchSessionType('practice')).toBe(false));
  it('returns false for training', () => expect(isMatchSessionType('training')).toBe(false));
  it('returns false for empty string', () => expect(isMatchSessionType('')).toBe(false));
});

// ─── groupMatchObsByPlayer ────────────────────────────────────────────────────

describe('groupMatchObsByPlayer', () => {
  it('groups observations by player_id', () => {
    const all = [...MARCUS_OBS, ...JORDAN_OBS];
    const grouped = groupMatchObsByPlayer(all);
    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped['player-1']).toHaveLength(3);
    expect(grouped['player-2']).toHaveLength(2);
  });

  it('skips observations with no player_id', () => {
    const obs = [makeObs({ player_id: '' })];
    const grouped = groupMatchObsByPlayer(obs);
    expect(Object.keys(grouped)).toHaveLength(0);
  });

  it('returns empty object for empty input', () => {
    expect(groupMatchObsByPlayer([])).toEqual({});
  });
});

// ─── countPositiveMatchObs ────────────────────────────────────────────────────

describe('countPositiveMatchObs', () => {
  it('counts only positive observations', () => {
    expect(countPositiveMatchObs(MARCUS_OBS)).toBe(2);
  });

  it('returns 0 when no positive obs', () => {
    const obs = [makeObs({ sentiment: 'needs-work' }), makeObs({ sentiment: 'neutral' })];
    expect(countPositiveMatchObs(obs)).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(countPositiveMatchObs([])).toBe(0);
  });
});

// ─── getUniqueMatchCategories ─────────────────────────────────────────────────

describe('getUniqueMatchCategories', () => {
  it('returns unique category strings', () => {
    const cats = getUniqueMatchCategories(MARCUS_OBS);
    expect(cats).toContain('defense');
    expect(cats).toContain('passing');
    expect(cats).toContain('shooting');
    expect(cats).toHaveLength(3);
  });

  it('deduplicates repeated categories', () => {
    const obs = [makeObs({ category: 'defense' }), makeObs({ category: 'defense' })];
    expect(getUniqueMatchCategories(obs)).toEqual(['defense']);
  });

  it('filters out falsy categories', () => {
    const obs = [makeObs({ category: '' })];
    expect(getUniqueMatchCategories(obs)).toHaveLength(0);
  });
});

// ─── calculateMatchScore ──────────────────────────────────────────────────────

describe('calculateMatchScore', () => {
  it('scores positive obs × 3 + unique categories × 2 + total', () => {
    // Marcus: 2 positive, 3 categories, 3 total → 2×3 + 3×2 + 3 = 15
    expect(calculateMatchScore(MARCUS_OBS)).toBe(15);
  });

  it('returns 0 for empty input', () => {
    expect(calculateMatchScore([])).toBe(0);
  });

  it('scores a single positive obs', () => {
    const obs = [makeObs({ category: 'defense' })];
    // 1×3 + 1×2 + 1 = 6
    expect(calculateMatchScore(obs)).toBe(6);
  });

  it('scores zero positives as just categories + total', () => {
    const obs = [makeObs({ sentiment: 'needs-work', category: 'defense' })];
    // 0×3 + 1×2 + 1 = 3
    expect(calculateMatchScore(obs)).toBe(3);
  });
});

// ─── getHighlightObs ──────────────────────────────────────────────────────────

describe('getHighlightObs', () => {
  it('returns up to 3 positive observations by default', () => {
    const obs = getHighlightObs(MARCUS_OBS);
    expect(obs).toHaveLength(2); // Marcus has 2 positive
    expect(obs.every((o) => o.sentiment === 'positive')).toBe(true);
  });

  it('respects custom limit', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      makeObs({ text: `obs ${i}` })
    );
    expect(getHighlightObs(many, 2)).toHaveLength(2);
  });

  it('returns empty when no positive obs', () => {
    const obs = [makeObs({ sentiment: 'needs-work' })];
    expect(getHighlightObs(obs)).toHaveLength(0);
  });
});

// ─── rankMatchCandidates ──────────────────────────────────────────────────────

describe('rankMatchCandidates', () => {
  it('returns candidates sorted by score descending', () => {
    const grouped = groupMatchObsByPlayer([...MARCUS_OBS, ...JORDAN_OBS]);
    const ranked = rankMatchCandidates(grouped);
    // Marcus: 2 positive × 3 + 3 cats × 2 + 3 = 15
    // Jordan: 1 positive × 3 + 2 cats × 2 + 2 = 9
    expect(ranked[0].player_name).toBe('Marcus');
    expect(ranked[1].player_name).toBe('Jordan');
  });

  it('includes positive_count, total_count, and top_categories', () => {
    const grouped = groupMatchObsByPlayer(MARCUS_OBS);
    const ranked = rankMatchCandidates(grouped);
    expect(ranked[0].positive_count).toBe(2);
    expect(ranked[0].total_count).toBe(3);
    expect(ranked[0].top_categories).toContain('defense');
  });

  it('returns empty array for empty grouped input', () => {
    expect(rankMatchCandidates({})).toHaveLength(0);
  });
});

// ─── selectMatchCandidate ─────────────────────────────────────────────────────

describe('selectMatchCandidate', () => {
  it('returns the top-scoring player', () => {
    const grouped = groupMatchObsByPlayer([...MARCUS_OBS, ...JORDAN_OBS]);
    const candidate = selectMatchCandidate(grouped);
    expect(candidate?.player_name).toBe('Marcus');
    expect(candidate?.player_id).toBe('player-1');
  });

  it('returns null for empty input', () => {
    expect(selectMatchCandidate({})).toBeNull();
  });
});

// ─── hasEnoughDataForMatchMVP ─────────────────────────────────────────────────

describe('hasEnoughDataForMatchMVP', () => {
  it('returns true when ≥2 obs from ≥2 players', () => {
    const obs = [...MARCUS_OBS, ...JORDAN_OBS];
    expect(hasEnoughDataForMatchMVP(obs)).toBe(true);
  });

  it('returns false when only 1 observation', () => {
    expect(hasEnoughDataForMatchMVP([makeObs()])).toBe(false);
  });

  it('returns false when all obs are from the same player', () => {
    expect(hasEnoughDataForMatchMVP(MARCUS_OBS)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(hasEnoughDataForMatchMVP([])).toBe(false);
  });

  it('returns true with exactly 2 obs from 2 players', () => {
    const obs = [makeObs(), makeObs({ player_id: 'player-2', player_name: 'Jordan' })];
    expect(hasEnoughDataForMatchMVP(obs)).toBe(true);
  });
});

// ─── buildMatchShareText ──────────────────────────────────────────────────────

describe('buildMatchShareText', () => {
  const result: PlayerOfMatchResult = {
    player_name: 'Marcus',
    session_label: 'Game vs. Lincoln',
    headline: 'Locked down on defense all night',
    achievement: 'Marcus was outstanding in the second half.',
    key_moment: 'He forced two turnovers with smart hands.',
    coach_message: 'Marcus elevates the whole team.',
  };

  it('includes team name and player name', () => {
    const text = buildMatchShareText(result, 'YMCA Rockets', 'Coach Sarah');
    expect(text).toContain('YMCA Rockets');
    expect(text).toContain('Marcus');
  });

  it('includes the headline', () => {
    const text = buildMatchShareText(result, 'YMCA Rockets', 'Coach Sarah');
    expect(text).toContain('Locked down on defense all night');
  });

  it('includes coach name and SportsIQ branding', () => {
    const text = buildMatchShareText(result, 'YMCA Rockets', 'Coach Sarah');
    expect(text).toContain('Coach Sarah');
    expect(text).toContain('SportsIQ');
  });

  it('does not have triple newlines', () => {
    const text = buildMatchShareText(result, 'YMCA Rockets', 'Coach Sarah');
    expect(text).not.toContain('\n\n\n');
  });
});

// ─── buildMatchSessionLabel ───────────────────────────────────────────────────

describe('buildMatchSessionLabel', () => {
  it('includes vs. for game with opponent', () => {
    expect(buildMatchSessionLabel('game', 'Lincoln')).toContain('vs. Lincoln');
  });

  it('uses Tournament label for tournament type', () => {
    expect(buildMatchSessionLabel('tournament', null)).toBe('Tournament Day');
  });

  it('uses Scrimmage label for scrimmage with no opponent', () => {
    expect(buildMatchSessionLabel('scrimmage', null)).toBe('Scrimmage');
  });

  it('appends formatted date when provided', () => {
    const label = buildMatchSessionLabel('game', 'Lincoln', '2025-04-28');
    expect(label).toContain('Apr 28');
    expect(label).toContain('Lincoln');
  });

  it('handles null opponent for game type', () => {
    expect(buildMatchSessionLabel('game', null)).toBe('Game Day');
  });
});

// ─── isValidMatchResult ───────────────────────────────────────────────────────

describe('isValidMatchResult', () => {
  it('returns true for a complete valid result', () => {
    const result: PlayerOfMatchResult = {
      player_name: 'Marcus',
      session_label: 'Game Day',
      headline: 'Dominant performance',
      achievement: 'Was great all game.',
      key_moment: 'Hit the big shot.',
      coach_message: 'Amazing effort.',
    };
    expect(isValidMatchResult(result)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidMatchResult(null)).toBe(false);
  });

  it('returns false for missing player_name', () => {
    expect(isValidMatchResult({ headline: 'x', achievement: 'y', coach_message: 'z' })).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isValidMatchResult('string')).toBe(false);
  });
});

// ─── getMatchAccentClasses ────────────────────────────────────────────────────

describe('getMatchAccentClasses', () => {
  it('returns an object with card, header, badge, share keys', () => {
    const classes = getMatchAccentClasses();
    expect(classes).toHaveProperty('card');
    expect(classes).toHaveProperty('header');
    expect(classes).toHaveProperty('badge');
    expect(classes).toHaveProperty('share');
  });

  it('returns string values for all keys', () => {
    const classes = getMatchAccentClasses();
    Object.values(classes).forEach((v) => expect(typeof v).toBe('string'));
  });
});
