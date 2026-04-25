import { describe, it, expect } from 'vitest';
import {
  buildCategoryBreakdown,
  getTopStrengths,
  getTopChallenges,
  calculateHealthScore,
  calculateEffortRatio,
  calculateTeamworkRatio,
  calculateSessionQualityAvg,
  hasEnoughDataForPersonality,
  getTraitBarWidth,
  getTraitColor,
  getTraitTextColor,
  getPersonalityAccentClasses,
  buildPersonalityShareText,
  isValidTeamType,
  isValidTrait,
  countTraits,
  getHighestTrait,
  getLowestTrait,
  getAverageTraitScore,
  hasStrongIdentity,
  buildStatsBadgeLabel,
  formatCoachingPatternLabel,
  selectSampleObservations,
} from '@/lib/team-personality-utils';
import type { TeamPersonality } from '@/lib/ai/schemas';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function obs(category: string, sentiment: string, text = 'observation'): { category: string; sentiment: string; text: string } {
  return { category, sentiment, text };
}

const POSITIVE_OBS = Array.from({ length: 15 }, (_, i) =>
  obs(i % 3 === 0 ? 'passing' : i % 3 === 1 ? 'effort' : 'defense', 'positive', `good play ${i}`)
);
const NEEDSWORK_OBS = Array.from({ length: 10 }, (_, i) =>
  obs(i % 2 === 0 ? 'shooting' : 'dribbling', 'needs-work', `needs work ${i}`)
);
const ALL_OBS = [...POSITIVE_OBS, ...NEEDSWORK_OBS];

const SESSIONS_5 = Array.from({ length: 5 }, () => ({}));
const SESSIONS_10 = Array.from({ length: 10 }, (_, i) => ({
  quality_rating: i < 7 ? 4 : null,
}));

const PERSONALITY: TeamPersonality = {
  team_type: 'The Grinders',
  type_emoji: '💪',
  tagline: 'Hard work is their superpower',
  description: 'This team brings maximum effort to every drill.',
  traits: [
    { name: 'Work Ethic', score: 88, description: 'Observed hustle in 30% of all observations.' },
    { name: 'Passing', score: 72, description: 'Strong passing sequences noted in multiple sessions.' },
    { name: 'Shooting', score: 42, description: 'Consistent needs-work tags on shooting form.' },
  ],
  strengths: ['Effort', 'Defense'],
  growth_areas: ['Shooting', 'Dribbling'],
  coaching_tips: ['Use competitive drills to leverage work ethic.', 'Praise effort first, then technique.'],
  team_motto: 'Leave it all on the court',
};

// ── buildCategoryBreakdown ────────────────────────────────────────────────────

describe('buildCategoryBreakdown', () => {
  it('returns empty array for no observations', () => {
    expect(buildCategoryBreakdown([])).toEqual([]);
  });

  it('aggregates by category correctly', () => {
    const result = buildCategoryBreakdown([
      obs('passing', 'positive'),
      obs('passing', 'positive'),
      obs('passing', 'needs-work'),
      obs('defense', 'positive'),
    ]);
    const passing = result.find((c) => c.category === 'passing');
    expect(passing?.total).toBe(3);
    expect(passing?.positive).toBe(2);
    expect(passing?.needsWork).toBe(1);
  });

  it('sorts by total descending', () => {
    const result = buildCategoryBreakdown([
      obs('a', 'positive'),
      obs('b', 'positive'), obs('b', 'positive'), obs('b', 'positive'),
      obs('c', 'positive'), obs('c', 'positive'),
    ]);
    expect(result[0].category).toBe('b');
    expect(result[1].category).toBe('c');
    expect(result[2].category).toBe('a');
  });

  it('handles unknown category as general', () => {
    const result = buildCategoryBreakdown([{ category: '', sentiment: 'positive', text: 'test' }]);
    expect(result[0].category).toBe('general');
  });
});

// ── getTopStrengths ───────────────────────────────────────────────────────────

describe('getTopStrengths', () => {
  it('returns empty array when no category meets threshold', () => {
    const breakdown = buildCategoryBreakdown([obs('shooting', 'needs-work')]);
    expect(getTopStrengths(breakdown)).toEqual([]);
  });

  it('returns categories with ≥60% positive ratio and ≥2 obs', () => {
    const breakdown = buildCategoryBreakdown([
      obs('passing', 'positive'), obs('passing', 'positive'), obs('passing', 'positive'),
      obs('defense', 'positive'), obs('defense', 'needs-work'),
    ]);
    const strengths = getTopStrengths(breakdown);
    expect(strengths).toContain('passing');
  });

  it('respects maxCount limit', () => {
    const breakdown = buildCategoryBreakdown([
      ...Array.from({ length: 3 }, () => obs('a', 'positive')),
      ...Array.from({ length: 3 }, () => obs('b', 'positive')),
      ...Array.from({ length: 3 }, () => obs('c', 'positive')),
      ...Array.from({ length: 3 }, () => obs('d', 'positive')),
    ]);
    expect(getTopStrengths(breakdown, 2).length).toBeLessThanOrEqual(2);
  });
});

// ── getTopChallenges ──────────────────────────────────────────────────────────

describe('getTopChallenges', () => {
  it('returns empty array when no challenges meet threshold', () => {
    const breakdown = buildCategoryBreakdown([obs('passing', 'positive'), obs('passing', 'positive')]);
    expect(getTopChallenges(breakdown)).toEqual([]);
  });

  it('returns categories with ≥40% needs-work ratio and ≥2 obs', () => {
    const breakdown = buildCategoryBreakdown([
      obs('shooting', 'needs-work'), obs('shooting', 'needs-work'), obs('shooting', 'positive'),
    ]);
    expect(getTopChallenges(breakdown)).toContain('shooting');
  });

  it('respects maxCount limit', () => {
    const breakdown = buildCategoryBreakdown([
      ...Array.from({ length: 3 }, () => obs('x', 'needs-work')),
      ...Array.from({ length: 3 }, () => obs('y', 'needs-work')),
      ...Array.from({ length: 3 }, () => obs('z', 'needs-work')),
      ...Array.from({ length: 3 }, () => obs('w', 'needs-work')),
    ]);
    expect(getTopChallenges(breakdown, 2).length).toBeLessThanOrEqual(2);
  });
});

// ── calculateHealthScore ──────────────────────────────────────────────────────

describe('calculateHealthScore', () => {
  it('returns 0 for empty observations', () => {
    expect(calculateHealthScore([])).toBe(0);
  });

  it('calculates correct percentage', () => {
    const observations = [
      obs('a', 'positive'), obs('a', 'positive'),
      obs('a', 'needs-work'),
    ];
    expect(calculateHealthScore(observations)).toBe(67);
  });

  it('returns 100 for all-positive observations', () => {
    const observations = Array.from({ length: 10 }, () => obs('a', 'positive'));
    expect(calculateHealthScore(observations)).toBe(100);
  });

  it('returns 0 for all-needs-work observations', () => {
    const observations = Array.from({ length: 5 }, () => obs('a', 'needs-work'));
    expect(calculateHealthScore(observations)).toBe(0);
  });
});

// ── calculateEffortRatio ──────────────────────────────────────────────────────

describe('calculateEffortRatio', () => {
  it('returns 0 for empty observations', () => {
    expect(calculateEffortRatio([])).toBe(0);
  });

  it('counts effort, hustle, attitude, coachability categories', () => {
    const observations = [
      obs('effort', 'positive'), obs('hustle', 'positive'),
      obs('passing', 'positive'), obs('passing', 'positive'),
    ];
    expect(calculateEffortRatio(observations)).toBe(0.5);
  });

  it('is case-insensitive for category matching', () => {
    const observations = [obs('Effort', 'positive'), obs('passing', 'positive')];
    expect(calculateEffortRatio(observations)).toBe(0.5);
  });
});

// ── calculateTeamworkRatio ────────────────────────────────────────────────────

describe('calculateTeamworkRatio', () => {
  it('returns 0 for empty observations', () => {
    expect(calculateTeamworkRatio([])).toBe(0);
  });

  it('counts teamwork, passing, communication, leadership, awareness', () => {
    const observations = [
      obs('teamwork', 'positive'),
      obs('passing', 'positive'),
      obs('shooting', 'positive'),
    ];
    expect(calculateTeamworkRatio(observations)).toBeCloseTo(0.667, 2);
  });
});

// ── calculateSessionQualityAvg ────────────────────────────────────────────────

describe('calculateSessionQualityAvg', () => {
  it('returns null when no sessions have ratings', () => {
    expect(calculateSessionQualityAvg([{}, { quality_rating: null }])).toBeNull();
  });

  it('ignores sessions with null or missing quality_rating', () => {
    expect(calculateSessionQualityAvg([{ quality_rating: 4 }, {}])).toBe(4);
  });

  it('calculates average correctly', () => {
    const sessions = [
      { quality_rating: 5 }, { quality_rating: 3 }, { quality_rating: 4 },
    ];
    expect(calculateSessionQualityAvg(sessions)).toBeCloseTo(4, 5);
  });

  it('returns null for empty sessions array', () => {
    expect(calculateSessionQualityAvg([])).toBeNull();
  });
});

// ── hasEnoughDataForPersonality ───────────────────────────────────────────────

describe('hasEnoughDataForPersonality', () => {
  it('returns false when fewer than 20 observations', () => {
    const obs10 = Array.from({ length: 10 }, () => ({ category: 'a', sentiment: 'positive', text: 'x' }));
    expect(hasEnoughDataForPersonality(obs10, SESSIONS_5)).toBe(false);
  });

  it('returns false when fewer than 5 sessions', () => {
    const obs20 = Array.from({ length: 20 }, () => ({ category: 'a', sentiment: 'positive', text: 'x' }));
    const sessions3 = [{ }, { }, { }];
    expect(hasEnoughDataForPersonality(obs20, sessions3)).toBe(false);
  });

  it('returns true when both thresholds are met', () => {
    expect(hasEnoughDataForPersonality(ALL_OBS, SESSIONS_5)).toBe(true);
  });
});

// ── getTraitBarWidth ──────────────────────────────────────────────────────────

describe('getTraitBarWidth', () => {
  it('returns percentage string', () => {
    expect(getTraitBarWidth(75)).toBe('75%');
  });

  it('clamps to 0% minimum', () => {
    expect(getTraitBarWidth(-10)).toBe('0%');
  });

  it('clamps to 100% maximum', () => {
    expect(getTraitBarWidth(120)).toBe('100%');
  });
});

// ── getTraitColor ─────────────────────────────────────────────────────────────

describe('getTraitColor', () => {
  it('returns emerald for score ≥ 75', () => {
    expect(getTraitColor(75)).toBe('bg-emerald-500');
    expect(getTraitColor(100)).toBe('bg-emerald-500');
  });

  it('returns orange for score 50-74', () => {
    expect(getTraitColor(50)).toBe('bg-orange-500');
    expect(getTraitColor(74)).toBe('bg-orange-500');
  });

  it('returns amber for score 30-49', () => {
    expect(getTraitColor(30)).toBe('bg-amber-500');
    expect(getTraitColor(49)).toBe('bg-amber-500');
  });

  it('returns zinc for score < 30', () => {
    expect(getTraitColor(0)).toBe('bg-zinc-500');
    expect(getTraitColor(29)).toBe('bg-zinc-500');
  });
});

// ── getTraitTextColor ─────────────────────────────────────────────────────────

describe('getTraitTextColor', () => {
  it('matches color thresholds', () => {
    expect(getTraitTextColor(80)).toBe('text-emerald-400');
    expect(getTraitTextColor(60)).toBe('text-orange-400');
    expect(getTraitTextColor(35)).toBe('text-amber-400');
    expect(getTraitTextColor(10)).toBe('text-zinc-400');
  });
});

// ── getPersonalityAccentClasses ───────────────────────────────────────────────

describe('getPersonalityAccentClasses', () => {
  it('returns an object with all required keys', () => {
    const classes = getPersonalityAccentClasses();
    expect(classes).toHaveProperty('border');
    expect(classes).toHaveProperty('bg');
    expect(classes).toHaveProperty('badge');
    expect(classes).toHaveProperty('heading');
  });

  it('uses violet accent', () => {
    const classes = getPersonalityAccentClasses();
    expect(classes.border).toContain('violet');
    expect(classes.heading).toContain('violet');
  });
});

// ── buildPersonalityShareText ─────────────────────────────────────────────────

describe('buildPersonalityShareText', () => {
  it('includes team type and tagline', () => {
    const text = buildPersonalityShareText(PERSONALITY, 'Panthers');
    expect(text).toContain('The Grinders');
    expect(text).toContain('Hard work is their superpower');
  });

  it('includes team motto', () => {
    const text = buildPersonalityShareText(PERSONALITY);
    expect(text).toContain('Leave it all on the court');
  });

  it('includes SportsIQ attribution', () => {
    const text = buildPersonalityShareText(PERSONALITY);
    expect(text).toContain('SportsIQ');
  });

  it('includes trait info', () => {
    const text = buildPersonalityShareText(PERSONALITY);
    expect(text).toContain('Work Ethic');
  });

  it('works without team name', () => {
    const text = buildPersonalityShareText(PERSONALITY);
    expect(text).toContain('The Grinders');
  });
});

// ── isValidTeamType ───────────────────────────────────────────────────────────

describe('isValidTeamType', () => {
  it('returns true for valid string', () => {
    expect(isValidTeamType('The Grinders')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidTeamType('')).toBe(false);
  });

  it('returns false for non-string', () => {
    expect(isValidTeamType(42)).toBe(false);
    expect(isValidTeamType(null)).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isValidTeamType('   ')).toBe(false);
  });
});

// ── isValidTrait ──────────────────────────────────────────────────────────────

describe('isValidTrait', () => {
  it('returns true for valid trait', () => {
    expect(isValidTrait({ name: 'Work Ethic', score: 88, description: 'Observed hustle consistently.' })).toBe(true);
  });

  it('returns false for missing name', () => {
    expect(isValidTrait({ score: 88, description: 'Something happening here ok.' })).toBe(false);
  });

  it('returns false for score out of range', () => {
    expect(isValidTrait({ name: 'X', score: 150, description: 'Something happening here ok.' })).toBe(false);
    expect(isValidTrait({ name: 'X', score: -5, description: 'Something happening here ok.' })).toBe(false);
  });

  it('returns false for short description', () => {
    expect(isValidTrait({ name: 'Work Ethic', score: 50, description: 'Short' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidTrait(null)).toBe(false);
  });
});

// ── countTraits ───────────────────────────────────────────────────────────────

describe('countTraits', () => {
  it('returns correct count', () => {
    expect(countTraits(PERSONALITY)).toBe(3);
  });

  it('returns 0 for empty traits', () => {
    expect(countTraits({ ...PERSONALITY, traits: [] })).toBe(0);
  });
});

// ── getHighestTrait ───────────────────────────────────────────────────────────

describe('getHighestTrait', () => {
  it('returns the trait with highest score', () => {
    const highest = getHighestTrait(PERSONALITY);
    expect(highest?.name).toBe('Work Ethic');
    expect(highest?.score).toBe(88);
  });

  it('returns null for empty traits', () => {
    expect(getHighestTrait({ ...PERSONALITY, traits: [] })).toBeNull();
  });
});

// ── getLowestTrait ────────────────────────────────────────────────────────────

describe('getLowestTrait', () => {
  it('returns the trait with lowest score', () => {
    const lowest = getLowestTrait(PERSONALITY);
    expect(lowest?.name).toBe('Shooting');
    expect(lowest?.score).toBe(42);
  });

  it('returns null for empty traits', () => {
    expect(getLowestTrait({ ...PERSONALITY, traits: [] })).toBeNull();
  });
});

// ── getAverageTraitScore ──────────────────────────────────────────────────────

describe('getAverageTraitScore', () => {
  it('calculates average correctly', () => {
    // (88 + 72 + 42) / 3 = 67.33 → rounded = 67
    expect(getAverageTraitScore(PERSONALITY)).toBe(67);
  });

  it('returns 0 for empty traits', () => {
    expect(getAverageTraitScore({ ...PERSONALITY, traits: [] })).toBe(0);
  });
});

// ── hasStrongIdentity ─────────────────────────────────────────────────────────

describe('hasStrongIdentity', () => {
  it('returns true when highest trait score ≥ 70', () => {
    expect(hasStrongIdentity(PERSONALITY)).toBe(true);
  });

  it('returns false when all traits score < 70', () => {
    const weak = {
      ...PERSONALITY,
      traits: [
        { name: 'A', score: 60, description: 'Something about trait A happening here.' },
        { name: 'B', score: 55, description: 'Something about trait B happening here.' },
      ],
    };
    expect(hasStrongIdentity(weak)).toBe(false);
  });

  it('returns false for empty traits', () => {
    expect(hasStrongIdentity({ ...PERSONALITY, traits: [] })).toBe(false);
  });
});

// ── buildStatsBadgeLabel ──────────────────────────────────────────────────────

describe('buildStatsBadgeLabel', () => {
  it('formats correctly', () => {
    expect(buildStatsBadgeLabel(150, 12, 8)).toBe('150 obs · 12 sessions · 8 players');
  });
});

// ── formatCoachingPatternLabel ────────────────────────────────────────────────

describe('formatCoachingPatternLabel', () => {
  it('returns balanced observer when no categories', () => {
    expect(formatCoachingPatternLabel(0, '')).toBe('balanced observer');
  });

  it('includes top category when present', () => {
    expect(formatCoachingPatternLabel(3, 'defense')).toBe('primary focus: defense');
  });
});

// ── selectSampleObservations ──────────────────────────────────────────────────

describe('selectSampleObservations', () => {
  it('returns at most maxCount observations', () => {
    const obsWithNames = Array.from({ length: 30 }, (_, i) => ({
      category: 'passing',
      sentiment: i < 20 ? 'positive' : 'needs-work',
      text: `obs ${i}`,
      playerName: `Player${i}`,
    }));
    const result = selectSampleObservations(obsWithNames, 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('includes both positive and needs-work observations', () => {
    const obsWithNames = [
      ...Array.from({ length: 10 }, (_, i) => ({
        category: 'defense', sentiment: 'positive', text: `pos ${i}`, playerName: 'A',
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        category: 'shooting', sentiment: 'needs-work', text: `nw ${i}`, playerName: 'B',
      })),
    ];
    const result = selectSampleObservations(obsWithNames, 15);
    const positives = result.filter((o) => o.sentiment === 'positive').length;
    const needsWork = result.filter((o) => o.sentiment === 'needs-work').length;
    expect(positives).toBeGreaterThan(0);
    expect(needsWork).toBeGreaterThan(0);
  });

  it('fills in default playerName when missing', () => {
    const obsWithNames = [
      { category: 'passing', sentiment: 'positive', text: 'good pass' },
    ];
    const result = selectSampleObservations(obsWithNames);
    expect(result[0].playerName).toBe('Player');
  });
});

// ── calculateSessionQualityAvg with SESSIONS_10 ───────────────────────────────

describe('calculateSessionQualityAvg with mixed data', () => {
  it('only averages sessions with valid ratings', () => {
    const avg = calculateSessionQualityAvg(SESSIONS_10);
    expect(avg).toBe(4); // 7 sessions with quality_rating=4 / 7
  });
});
