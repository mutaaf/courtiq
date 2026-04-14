import { describe, it, expect } from 'vitest';
import {
  countPositiveObs,
  getUniqueCategoriesCount,
  hasMultipleDays,
  isEligibleForSpotlight,
  calculatePlayerScore,
  rankPlayersByScore,
  selectWeeklyStarCandidate,
  getWeekLabel,
  buildSpotlightShareText,
  groupObsByPlayer,
  positiveRatio,
  filterPositiveObs,
  isCurrentWeekStar,
  type SpotlightObs,
  type WeeklyStarData,
} from '../src/lib/player-spotlight-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeObs(overrides: Partial<SpotlightObs> = {}): SpotlightObs {
  return {
    player_id: 'p1',
    player_name: 'Marcus',
    sentiment: 'positive',
    category: 'Offense',
    text: 'Great dribble penetration',
    created_at: '2026-04-10T10:00:00Z',
    ...overrides,
  };
}

const POSITIVE_OBS = makeObs({ sentiment: 'positive' });
const NEEDS_WORK_OBS = makeObs({ sentiment: 'needs-work' });
const NEUTRAL_OBS = makeObs({ sentiment: 'neutral' });

// ─── countPositiveObs ─────────────────────────────────────────────────────────

describe('countPositiveObs', () => {
  it('counts positive observations', () => {
    expect(countPositiveObs([POSITIVE_OBS, POSITIVE_OBS, NEEDS_WORK_OBS])).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(countPositiveObs([])).toBe(0);
  });

  it('returns 0 when all are needs-work', () => {
    expect(countPositiveObs([NEEDS_WORK_OBS, NEEDS_WORK_OBS])).toBe(0);
  });

  it('ignores neutral observations', () => {
    expect(countPositiveObs([NEUTRAL_OBS, POSITIVE_OBS])).toBe(1);
  });
});

// ─── getUniqueCategoriesCount ─────────────────────────────────────────────────

describe('getUniqueCategoriesCount', () => {
  it('counts unique categories', () => {
    const obs = [
      makeObs({ category: 'Offense' }),
      makeObs({ category: 'Defense' }),
      makeObs({ category: 'Offense' }),
    ];
    expect(getUniqueCategoriesCount(obs)).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(getUniqueCategoriesCount([])).toBe(0);
  });

  it('returns 1 when all same category', () => {
    expect(getUniqueCategoriesCount([makeObs(), makeObs(), makeObs()])).toBe(1);
  });

  it('counts all distinct categories', () => {
    const obs = [
      makeObs({ category: 'Offense' }),
      makeObs({ category: 'Defense' }),
      makeObs({ category: 'IQ' }),
      makeObs({ category: 'Effort' }),
    ];
    expect(getUniqueCategoriesCount(obs)).toBe(4);
  });
});

// ─── hasMultipleDays ──────────────────────────────────────────────────────────

describe('hasMultipleDays', () => {
  it('returns false for single day', () => {
    const obs = [makeObs({ created_at: '2026-04-10T10:00:00Z' }), makeObs({ created_at: '2026-04-10T15:00:00Z' })];
    expect(hasMultipleDays(obs)).toBe(false);
  });

  it('returns true for multiple days', () => {
    const obs = [makeObs({ created_at: '2026-04-10T10:00:00Z' }), makeObs({ created_at: '2026-04-11T10:00:00Z' })];
    expect(hasMultipleDays(obs)).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(hasMultipleDays([])).toBe(false);
  });

  it('returns true for three different days', () => {
    const obs = [
      makeObs({ created_at: '2026-04-10T10:00:00Z' }),
      makeObs({ created_at: '2026-04-11T10:00:00Z' }),
      makeObs({ created_at: '2026-04-12T10:00:00Z' }),
    ];
    expect(hasMultipleDays(obs)).toBe(true);
  });
});

// ─── isEligibleForSpotlight ───────────────────────────────────────────────────

describe('isEligibleForSpotlight', () => {
  it('requires at least 2 observations', () => {
    expect(isEligibleForSpotlight(0)).toBe(false);
    expect(isEligibleForSpotlight(1)).toBe(false);
    expect(isEligibleForSpotlight(2)).toBe(true);
    expect(isEligibleForSpotlight(10)).toBe(true);
  });
});

// ─── calculatePlayerScore ─────────────────────────────────────────────────────

describe('calculatePlayerScore', () => {
  it('returns 0 for empty observations', () => {
    expect(calculatePlayerScore([])).toBe(0);
  });

  it('scores based on positive count', () => {
    // 2 positives × 3 = 6, 1 category × 2 = 2, no multi-day = 0 → 8
    const obs = [makeObs({ sentiment: 'positive' }), makeObs({ sentiment: 'positive' })];
    expect(calculatePlayerScore(obs)).toBe(6 + 2); // 2*3 + 1*2
  });

  it('adds bonus for multiple days', () => {
    const obs = [
      makeObs({ sentiment: 'positive', created_at: '2026-04-10T10:00:00Z' }),
      makeObs({ sentiment: 'positive', created_at: '2026-04-11T10:00:00Z' }),
    ];
    // 2 positives × 3 = 6, 1 category × 2 = 2, multi-day +2 → 10
    expect(calculatePlayerScore(obs)).toBe(10);
  });

  it('scores category breadth', () => {
    const obs = [
      makeObs({ category: 'Offense', sentiment: 'positive' }),
      makeObs({ category: 'Defense', sentiment: 'positive' }),
      makeObs({ category: 'IQ', sentiment: 'positive' }),
    ];
    // 3 positives × 3 = 9, 3 categories × 2 = 6, no multi-day = 0 → 15
    expect(calculatePlayerScore(obs)).toBe(15);
  });

  it('needs-work observations contribute 0 to positive score', () => {
    const obs = [makeObs({ sentiment: 'needs-work' }), makeObs({ sentiment: 'needs-work' })];
    // 0 positives × 3 = 0, 1 category × 2 = 2 → 2
    expect(calculatePlayerScore(obs)).toBe(2);
  });
});

// ─── rankPlayersByScore ───────────────────────────────────────────────────────

describe('rankPlayersByScore', () => {
  it('returns empty array when no players', () => {
    expect(rankPlayersByScore({})).toEqual([]);
  });

  it('filters out players with less than 2 observations', () => {
    const playerObs = {
      p1: [makeObs({ player_id: 'p1' })], // 1 obs — ineligible
    };
    expect(rankPlayersByScore(playerObs)).toHaveLength(0);
  });

  it('sorts players by score descending', () => {
    const playerObs = {
      low: [
        makeObs({ player_id: 'low', player_name: 'Low', sentiment: 'needs-work' }),
        makeObs({ player_id: 'low', player_name: 'Low', sentiment: 'needs-work' }),
      ],
      high: [
        makeObs({ player_id: 'high', player_name: 'High', sentiment: 'positive' }),
        makeObs({ player_id: 'high', player_name: 'High', sentiment: 'positive' }),
        makeObs({ player_id: 'high', player_name: 'High', sentiment: 'positive' }),
      ],
    };
    const ranked = rankPlayersByScore(playerObs);
    expect(ranked[0].player_id).toBe('high');
    expect(ranked[1].player_id).toBe('low');
  });

  it('includes score and obs in result', () => {
    const playerObs = {
      p1: [makeObs({ player_id: 'p1', player_name: 'Alice' }), makeObs({ player_id: 'p1', player_name: 'Alice' })],
    };
    const [result] = rankPlayersByScore(playerObs);
    expect(result.player_id).toBe('p1');
    expect(result.player_name).toBe('Alice');
    expect(typeof result.score).toBe('number');
    expect(result.obs).toHaveLength(2);
  });
});

// ─── selectWeeklyStarCandidate ────────────────────────────────────────────────

describe('selectWeeklyStarCandidate', () => {
  it('returns null for empty input', () => {
    expect(selectWeeklyStarCandidate({})).toBeNull();
  });

  it('returns null when no player is eligible', () => {
    const playerObs = {
      p1: [makeObs()], // only 1 obs
    };
    expect(selectWeeklyStarCandidate(playerObs)).toBeNull();
  });

  it('returns the top-ranked player', () => {
    const playerObs = {
      p1: [
        makeObs({ player_id: 'p1', player_name: 'Star', sentiment: 'positive' }),
        makeObs({ player_id: 'p1', player_name: 'Star', sentiment: 'positive' }),
        makeObs({ player_id: 'p1', player_name: 'Star', sentiment: 'positive' }),
      ],
      p2: [
        makeObs({ player_id: 'p2', player_name: 'Runner', sentiment: 'needs-work' }),
        makeObs({ player_id: 'p2', player_name: 'Runner', sentiment: 'needs-work' }),
      ],
    };
    const winner = selectWeeklyStarCandidate(playerObs);
    expect(winner?.player_name).toBe('Star');
  });
});

// ─── getWeekLabel ─────────────────────────────────────────────────────────────

describe('getWeekLabel', () => {
  it('returns a Monday date label for a Wednesday', () => {
    // 2026-04-15 is a Wednesday → Monday is 2026-04-13
    const label = getWeekLabel(new Date('2026-04-15T12:00:00'));
    expect(label).toBe('Apr 13');
  });

  it('returns the same Monday for a Monday', () => {
    // 2026-04-13 is a Monday
    const label = getWeekLabel(new Date('2026-04-13T12:00:00'));
    expect(label).toBe('Apr 13');
  });

  it('returns Monday for a Sunday (week back)', () => {
    // 2026-04-12 is a Sunday → Monday is 2026-04-06
    const label = getWeekLabel(new Date('2026-04-12T12:00:00'));
    expect(label).toBe('Apr 6');
  });

  it('returns a non-empty string for any date', () => {
    const label = getWeekLabel(new Date('2026-01-01T00:00:00'));
    expect(label).toBeTruthy();
    expect(typeof label).toBe('string');
  });
});

// ─── buildSpotlightShareText ──────────────────────────────────────────────────

describe('buildSpotlightShareText', () => {
  const spotlight: WeeklyStarData = {
    player_name: 'Marcus',
    week_label: 'Apr 7',
    headline: 'Showed up big all week!',
    achievement: 'Marcus put in incredible work this week.',
    growth_moment: 'His dribble penetration opened up the offense.',
    challenge_ahead: 'Keep working on ball-handling under pressure.',
    coach_shoutout: 'Marcus brings it every single rep.',
  };

  it('includes the player name', () => {
    expect(buildSpotlightShareText(spotlight)).toContain('Marcus');
  });

  it('includes the week label', () => {
    expect(buildSpotlightShareText(spotlight)).toContain('Apr 7');
  });

  it('includes the headline', () => {
    expect(buildSpotlightShareText(spotlight)).toContain('Showed up big all week!');
  });

  it('includes the achievement', () => {
    expect(buildSpotlightShareText(spotlight)).toContain('Marcus put in incredible work');
  });

  it('wraps the shoutout in quotes', () => {
    expect(buildSpotlightShareText(spotlight)).toContain('"Marcus brings it every single rep."');
  });

  it('includes the SportsIQ attribution', () => {
    expect(buildSpotlightShareText(spotlight)).toContain('SportsIQ');
  });
});

// ─── groupObsByPlayer ─────────────────────────────────────────────────────────

describe('groupObsByPlayer', () => {
  it('groups observations by player_id', () => {
    const obs = [
      makeObs({ player_id: 'p1' }),
      makeObs({ player_id: 'p2' }),
      makeObs({ player_id: 'p1' }),
    ];
    const grouped = groupObsByPlayer(obs);
    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped['p1']).toHaveLength(2);
    expect(grouped['p2']).toHaveLength(1);
  });

  it('returns empty object for empty array', () => {
    expect(groupObsByPlayer([])).toEqual({});
  });

  it('skips observations without player_id', () => {
    const obs = [makeObs({ player_id: '' }), makeObs({ player_id: 'p1' })];
    const grouped = groupObsByPlayer(obs);
    expect(Object.keys(grouped)).toHaveLength(1);
    expect(grouped['p1']).toHaveLength(1);
  });
});

// ─── positiveRatio ────────────────────────────────────────────────────────────

describe('positiveRatio', () => {
  it('returns 0 for empty array', () => {
    expect(positiveRatio([])).toBe(0);
  });

  it('returns 1 when all positive', () => {
    expect(positiveRatio([makeObs({ sentiment: 'positive' }), makeObs({ sentiment: 'positive' })])).toBe(1);
  });

  it('returns 0.5 for half positive', () => {
    expect(positiveRatio([
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'needs-work' }),
    ])).toBe(0.5);
  });

  it('returns 0 when all needs-work', () => {
    expect(positiveRatio([makeObs({ sentiment: 'needs-work' })])).toBe(0);
  });
});

// ─── filterPositiveObs ────────────────────────────────────────────────────────

describe('filterPositiveObs', () => {
  it('returns only positive observations', () => {
    const obs = [POSITIVE_OBS, NEEDS_WORK_OBS, NEUTRAL_OBS];
    expect(filterPositiveObs(obs)).toHaveLength(1);
    expect(filterPositiveObs(obs)[0].sentiment).toBe('positive');
  });

  it('returns empty array when none are positive', () => {
    expect(filterPositiveObs([NEEDS_WORK_OBS, NEUTRAL_OBS])).toHaveLength(0);
  });

  it('returns all when all are positive', () => {
    expect(filterPositiveObs([POSITIVE_OBS, POSITIVE_OBS])).toHaveLength(2);
  });
});

// ─── isCurrentWeekStar ────────────────────────────────────────────────────────

describe('isCurrentWeekStar', () => {
  it('returns true for a plan created moments ago', () => {
    const now = Date.now();
    const createdAt = new Date(now - 1000).toISOString(); // 1 second ago
    expect(isCurrentWeekStar(createdAt, now)).toBe(true);
  });

  it('returns true for a plan created 6 days ago', () => {
    const now = Date.now();
    const sixDaysAgo = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString();
    expect(isCurrentWeekStar(sixDaysAgo, now)).toBe(true);
  });

  it('returns false for a plan created exactly 8 days ago', () => {
    const now = Date.now();
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(isCurrentWeekStar(eightDaysAgo, now)).toBe(false);
  });

  it('returns false for a plan created 30 days ago', () => {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isCurrentWeekStar(thirtyDaysAgo, now)).toBe(false);
  });

  it('uses Date.now() by default', () => {
    const recentDate = new Date(Date.now() - 60_000).toISOString();
    expect(isCurrentWeekStar(recentDate)).toBe(true);
  });
});
