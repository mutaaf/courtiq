import { describe, it, expect } from 'vitest';
import {
  positiveRatio,
  calculateSentimentFactor,
  countObservedSessions,
  calculateConsistencyFactor,
  calculateSkillTrendFactor,
  calculateGoalProgressFactor,
  calculateMomentumScore,
  getMomentumTier,
  getMomentumLabel,
  getMomentumColor,
  getMomentumBadgeClasses,
  getMomentumDirection,
  formatMomentumScore,
  sortByMomentum,
  filterByTier,
  getTopMomentumPlayer,
  getRisingPlayers,
  getNeedsAttentionPlayers,
  averageMomentumScore,
  buildMomentumSummary,
  isHotStreak,
  type MomentumObs,
  type MomentumProficiency,
  type MomentumGoal,
  type PlayerMomentum,
} from '@/lib/momentum-utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeObs = (sentiment: MomentumObs['sentiment'], session_id = 'sess-1'): MomentumObs => ({
  player_id: 'p1',
  sentiment,
  session_id,
  created_at: new Date().toISOString(),
});

const makeProf = (trend: MomentumProficiency['trend']): MomentumProficiency => ({
  player_id: 'p1',
  trend,
  proficiency_level: 'practicing',
});

const makeGoal = (
  status: MomentumGoal['status'],
  target_date: string | null = null,
): MomentumGoal => ({
  player_id: 'p1',
  status,
  target_date,
});

const makePlayer = (
  id: string,
  score: number,
): PlayerMomentum => ({
  player_id: id,
  player_name: `Player ${id}`,
  score,
  tier: getMomentumTier(score),
  factors: [],
});

// ─── positiveRatio ────────────────────────────────────────────────────────────

describe('positiveRatio', () => {
  it('returns 0 for empty list', () => {
    expect(positiveRatio([])).toBe(0);
  });

  it('returns 1 when all observations are positive', () => {
    const obs = [makeObs('positive'), makeObs('positive')];
    expect(positiveRatio(obs)).toBe(1);
  });

  it('returns 0 when no observations are positive', () => {
    const obs = [makeObs('needs-work'), makeObs('neutral')];
    expect(positiveRatio(obs)).toBe(0);
  });

  it('calculates fractional ratio', () => {
    const obs = [makeObs('positive'), makeObs('needs-work'), makeObs('neutral'), makeObs('positive')];
    expect(positiveRatio(obs)).toBeCloseTo(0.5);
  });
});

// ─── calculateSentimentFactor ─────────────────────────────────────────────────

describe('calculateSentimentFactor', () => {
  it('scores 0 for empty observations', () => {
    const factor = calculateSentimentFactor([]);
    expect(factor.score).toBe(0);
    expect(factor.name).toBe('Sentiment');
    expect(factor.max).toBe(25);
  });

  it('scores 25 for all positive', () => {
    const obs = [makeObs('positive'), makeObs('positive'), makeObs('positive')];
    expect(calculateSentimentFactor(obs).score).toBe(25);
  });

  it('scores 0 for all needs-work', () => {
    const obs = [makeObs('needs-work'), makeObs('needs-work')];
    expect(calculateSentimentFactor(obs).score).toBe(0);
  });

  it('scores 13 for 50% positive (rounds ~12.5)', () => {
    const obs = [makeObs('positive'), makeObs('needs-work')];
    expect(calculateSentimentFactor(obs).score).toBe(13);
  });

  it('includes detail with count and percentage', () => {
    const obs = [makeObs('positive'), makeObs('positive'), makeObs('needs-work')];
    const { detail } = calculateSentimentFactor(obs);
    expect(detail).toContain('67%');
    expect(detail).toContain('2 of 3');
  });
});

// ─── countObservedSessions ────────────────────────────────────────────────────

describe('countObservedSessions', () => {
  it('returns 0 for empty list', () => {
    expect(countObservedSessions([])).toBe(0);
  });

  it('counts unique sessions (ignores nulls)', () => {
    const obs = [
      makeObs('positive', 'sess-1'),
      makeObs('positive', 'sess-1'),
      makeObs('positive', 'sess-2'),
      makeObs('positive', null as any),
    ];
    expect(countObservedSessions(obs)).toBe(2);
  });

  it('counts each unique session_id once', () => {
    const obs = [makeObs('positive', 'a'), makeObs('positive', 'b'), makeObs('positive', 'c')];
    expect(countObservedSessions(obs)).toBe(3);
  });
});

// ─── calculateConsistencyFactor ───────────────────────────────────────────────

describe('calculateConsistencyFactor', () => {
  it('scores 0 when player has no observations', () => {
    const factor = calculateConsistencyFactor([], 5);
    expect(factor.score).toBe(0);
  });

  it('scores 10 when observed in exactly 1 session', () => {
    const obs = [makeObs('positive', 'sess-1'), makeObs('positive', 'sess-1')];
    expect(calculateConsistencyFactor(obs, 5).score).toBe(10);
  });

  it('scores 17 when observed in exactly 2 sessions', () => {
    const obs = [makeObs('positive', 'sess-1'), makeObs('positive', 'sess-2')];
    expect(calculateConsistencyFactor(obs, 5).score).toBe(17);
  });

  it('scores at least 25 when observed in many sessions', () => {
    const obs = Array.from({ length: 5 }, (_, i) => makeObs('positive', `sess-${i}`));
    const factor = calculateConsistencyFactor(obs, 5);
    expect(factor.score).toBe(25);
  });

  it('includes detail mentioning session count', () => {
    const obs = [makeObs('positive', 'sess-1'), makeObs('positive', 'sess-2')];
    const { detail } = calculateConsistencyFactor(obs, 4);
    expect(detail).toContain('2 of 4');
  });

  it('handles zero totalTeamSessions gracefully', () => {
    const obs = [makeObs('positive', 'sess-1')];
    expect(() => calculateConsistencyFactor(obs, 0)).not.toThrow();
  });
});

// ─── calculateSkillTrendFactor ────────────────────────────────────────────────

describe('calculateSkillTrendFactor', () => {
  it('returns neutral score for empty proficiency', () => {
    const factor = calculateSkillTrendFactor([]);
    expect(factor.score).toBe(12);
    expect(factor.detail).toContain('No proficiency data');
  });

  it('returns neutral score when all trends are null', () => {
    const prof = [makeProf(null), makeProf(null)];
    expect(calculateSkillTrendFactor(prof).score).toBe(12);
  });

  it('scores 25 for all-improving skills', () => {
    const prof = [makeProf('improving'), makeProf('improving'), makeProf('improving')];
    expect(calculateSkillTrendFactor(prof).score).toBe(25);
  });

  it('scores lower for plateau skills', () => {
    const allImproving = [makeProf('improving'), makeProf('improving')];
    const allPlateau = [makeProf('plateau'), makeProf('plateau')];
    const improvingScore = calculateSkillTrendFactor(allImproving).score;
    const plateauScore = calculateSkillTrendFactor(allPlateau).score;
    expect(improvingScore).toBeGreaterThan(plateauScore);
  });

  it('scores lowest for regressing skills', () => {
    const prof = [makeProf('regressing'), makeProf('regressing')];
    const factor = calculateSkillTrendFactor(prof);
    expect(factor.score).toBe(0);
  });

  it('mixes trends and scores between bounds', () => {
    const prof = [makeProf('improving'), makeProf('plateau'), makeProf('regressing')];
    const factor = calculateSkillTrendFactor(prof);
    expect(factor.score).toBeGreaterThan(0);
    expect(factor.score).toBeLessThan(25);
  });

  it('includes trend breakdown in detail', () => {
    const prof = [makeProf('improving'), makeProf('plateau')];
    const { detail } = calculateSkillTrendFactor(prof);
    expect(detail).toContain('improving');
    expect(detail).toContain('plateau');
  });
});

// ─── calculateGoalProgressFactor ─────────────────────────────────────────────

describe('calculateGoalProgressFactor', () => {
  it('returns neutral 12 when no goals', () => {
    expect(calculateGoalProgressFactor([]).score).toBe(12);
  });

  it('adds points for achieved goals', () => {
    const noGoals = calculateGoalProgressFactor([]);
    const withAchieved = calculateGoalProgressFactor([makeGoal('achieved')]);
    expect(withAchieved.score).toBeGreaterThan(noGoals.score);
  });

  it('deducts points for stalled goals', () => {
    const withStalled = calculateGoalProgressFactor([makeGoal('stalled')]);
    expect(withStalled.score).toBeLessThan(12);
  });

  it('penalises overdue active goals', () => {
    const pastDate = '2020-01-01';
    const futureDate = '2099-01-01';
    const overdue = calculateGoalProgressFactor([makeGoal('active', pastDate)]);
    const onTrack = calculateGoalProgressFactor([makeGoal('active', futureDate)]);
    expect(overdue.score).toBeLessThan(onTrack.score);
  });

  it('clamps score between 0 and 25', () => {
    const manyStalled = Array.from({ length: 10 }, () => makeGoal('stalled'));
    const factor = calculateGoalProgressFactor(manyStalled);
    expect(factor.score).toBeGreaterThanOrEqual(0);
    expect(factor.score).toBeLessThanOrEqual(25);
  });

  it('includes goal status breakdown in detail', () => {
    const goals = [makeGoal('achieved'), makeGoal('active'), makeGoal('stalled')];
    const { detail } = calculateGoalProgressFactor(goals);
    expect(detail).toContain('achieved');
    expect(detail).toContain('active');
    expect(detail).toContain('stalled');
  });
});

// ─── calculateMomentumScore ───────────────────────────────────────────────────

describe('calculateMomentumScore', () => {
  it('returns sum of all factor scores', () => {
    const factors = [
      { name: 'A', score: 20, max: 25 as const, detail: '' },
      { name: 'B', score: 15, max: 25 as const, detail: '' },
      { name: 'C', score: 10, max: 25 as const, detail: '' },
      { name: 'D', score: 5, max: 25 as const, detail: '' },
    ];
    expect(calculateMomentumScore(factors)).toBe(50);
  });

  it('returns 0 for empty factors', () => {
    expect(calculateMomentumScore([])).toBe(0);
  });

  it('returns 100 for max score', () => {
    const factors = Array.from({ length: 4 }, (_, i) => ({
      name: `F${i}`,
      score: 25,
      max: 25 as const,
      detail: '',
    }));
    expect(calculateMomentumScore(factors)).toBe(100);
  });
});

// ─── getMomentumTier ──────────────────────────────────────────────────────────

describe('getMomentumTier', () => {
  it('returns rising for score >= 70', () => {
    expect(getMomentumTier(70)).toBe('rising');
    expect(getMomentumTier(85)).toBe('rising');
    expect(getMomentumTier(100)).toBe('rising');
  });

  it('returns steady for score 40–69', () => {
    expect(getMomentumTier(40)).toBe('steady');
    expect(getMomentumTier(55)).toBe('steady');
    expect(getMomentumTier(69)).toBe('steady');
  });

  it('returns needs_attention for score < 40', () => {
    expect(getMomentumTier(0)).toBe('needs_attention');
    expect(getMomentumTier(20)).toBe('needs_attention');
    expect(getMomentumTier(39)).toBe('needs_attention');
  });
});

// ─── Display helpers ──────────────────────────────────────────────────────────

describe('getMomentumLabel', () => {
  it('returns correct label for each tier', () => {
    expect(getMomentumLabel('rising')).toBe('Rising');
    expect(getMomentumLabel('steady')).toBe('Steady');
    expect(getMomentumLabel('needs_attention')).toBe('Needs Attention');
  });
});

describe('getMomentumColor', () => {
  it('returns a Tailwind text colour class', () => {
    expect(getMomentumColor('rising')).toContain('text-');
    expect(getMomentumColor('steady')).toContain('text-');
    expect(getMomentumColor('needs_attention')).toContain('text-');
  });
});

describe('getMomentumBadgeClasses', () => {
  it('returns classes including bg-, border-, text-', () => {
    for (const tier of ['rising', 'steady', 'needs_attention'] as const) {
      const cls = getMomentumBadgeClasses(tier);
      expect(cls).toContain('bg-');
      expect(cls).toContain('border-');
      expect(cls).toContain('text-');
    }
  });
});

describe('getMomentumDirection', () => {
  it('returns up when current > previous by more than 2', () => {
    expect(getMomentumDirection(75, 70)).toBe('up');
  });

  it('returns down when current < previous by more than 2', () => {
    expect(getMomentumDirection(65, 70)).toBe('down');
  });

  it('returns same when difference is 2 or less', () => {
    expect(getMomentumDirection(70, 70)).toBe('same');
    expect(getMomentumDirection(71, 70)).toBe('same');
    expect(getMomentumDirection(72, 70)).toBe('same');
  });
});

describe('formatMomentumScore', () => {
  it('formats integer scores as strings', () => {
    expect(formatMomentumScore(75)).toBe('75');
    expect(formatMomentumScore(0)).toBe('0');
    expect(formatMomentumScore(100)).toBe('100');
  });

  it('clamps out-of-range values', () => {
    expect(formatMomentumScore(150)).toBe('100');
    expect(formatMomentumScore(-10)).toBe('0');
  });

  it('rounds decimal scores', () => {
    expect(formatMomentumScore(72.6)).toBe('73');
  });
});

// ─── Collection helpers ───────────────────────────────────────────────────────

describe('sortByMomentum', () => {
  it('returns empty array unchanged', () => {
    expect(sortByMomentum([])).toEqual([]);
  });

  it('sorts descending by score', () => {
    const players = [makePlayer('b', 50), makePlayer('a', 80), makePlayer('c', 30)];
    const sorted = sortByMomentum(players);
    expect(sorted.map((p) => p.score)).toEqual([80, 50, 30]);
  });

  it('does not mutate the original array', () => {
    const players = [makePlayer('a', 60), makePlayer('b', 80)];
    const original = [...players];
    sortByMomentum(players);
    expect(players).toEqual(original);
  });
});

describe('filterByTier', () => {
  it('returns only players in the requested tier', () => {
    const players = [makePlayer('a', 80), makePlayer('b', 55), makePlayer('c', 30)];
    const rising = filterByTier(players, 'rising');
    expect(rising).toHaveLength(1);
    expect(rising[0].player_id).toBe('a');
  });

  it('returns empty array when no match', () => {
    const players = [makePlayer('a', 80), makePlayer('b', 75)];
    expect(filterByTier(players, 'needs_attention')).toHaveLength(0);
  });
});

describe('getTopMomentumPlayer', () => {
  it('returns null for empty list', () => {
    expect(getTopMomentumPlayer([])).toBeNull();
  });

  it('returns the player with the highest score', () => {
    const players = [makePlayer('b', 60), makePlayer('a', 90), makePlayer('c', 40)];
    const top = getTopMomentumPlayer(players);
    expect(top?.player_id).toBe('a');
  });

  it('returns the only player in a single-element list', () => {
    const players = [makePlayer('solo', 55)];
    expect(getTopMomentumPlayer(players)?.player_id).toBe('solo');
  });
});

describe('getRisingPlayers', () => {
  it('returns only rising tier players, sorted descending', () => {
    const players = [makePlayer('a', 80), makePlayer('b', 50), makePlayer('c', 90)];
    const rising = getRisingPlayers(players);
    expect(rising.map((p) => p.player_id)).toEqual(['c', 'a']);
  });
});

describe('getNeedsAttentionPlayers', () => {
  it('returns only needs_attention tier players, sorted ascending (worst first)', () => {
    const players = [makePlayer('a', 25), makePlayer('b', 70), makePlayer('c', 10)];
    const attention = getNeedsAttentionPlayers(players);
    expect(attention.map((p) => p.player_id)).toEqual(['c', 'a']);
  });
});

describe('averageMomentumScore', () => {
  it('returns 0 for empty list', () => {
    expect(averageMomentumScore([])).toBe(0);
  });

  it('calculates average correctly', () => {
    const players = [makePlayer('a', 60), makePlayer('b', 80), makePlayer('c', 100)];
    expect(averageMomentumScore(players)).toBe(80);
  });

  it('rounds result', () => {
    const players = [makePlayer('a', 66), makePlayer('b', 67)];
    expect(averageMomentumScore(players)).toBe(67); // 66.5 rounds to 67
  });
});

describe('buildMomentumSummary', () => {
  it('returns "No players" for empty list', () => {
    expect(buildMomentumSummary([])).toBe('No players');
  });

  it('includes tier labels and counts', () => {
    const players = [
      makePlayer('a', 80),  // rising
      makePlayer('b', 55),  // steady
      makePlayer('c', 20),  // needs_attention
    ];
    const summary = buildMomentumSummary(players);
    expect(summary).toContain('1 rising');
    expect(summary).toContain('1 steady');
    expect(summary).toContain('1 need');
  });

  it('omits tiers with 0 players', () => {
    const players = [makePlayer('a', 80), makePlayer('b', 90)];
    const summary = buildMomentumSummary(players);
    expect(summary).not.toContain('steady');
    expect(summary).not.toContain('attention');
  });
});

describe('isHotStreak', () => {
  it('returns true for scores >= 80', () => {
    expect(isHotStreak(80)).toBe(true);
    expect(isHotStreak(95)).toBe(true);
    expect(isHotStreak(100)).toBe(true);
  });

  it('returns false for scores < 80', () => {
    expect(isHotStreak(79)).toBe(false);
    expect(isHotStreak(50)).toBe(false);
    expect(isHotStreak(0)).toBe(false);
  });
});
