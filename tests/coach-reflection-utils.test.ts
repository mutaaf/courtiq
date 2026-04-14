import { describe, it, expect } from 'vitest';
import {
  isValidReflectionAnswer,
  countAnsweredQuestions,
  hasAllAnswers,
  hasAnyAnswer,
  truncateAnswer,
  getCategoryLabel,
  getCategoryColor,
  isValidCategory,
  countBySentiment,
  calculateHealthScore,
  countObservedPlayers,
  getUnobservedPlayerIds,
  aggregateByCategory,
  buildReflectionShareText,
  buildReflectionPreview,
  reflectionProgress,
  groupQuestionsByCategory,
  type CoachReflectionContent,
  type ObservationRow,
  type ReflectionQuestion,
} from '../src/lib/coach-reflection-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeQuestion = (overrides?: Partial<ReflectionQuestion>): ReflectionQuestion => ({
  id: 'q1',
  question: 'What worked well in the defensive drills today?',
  context: 'Your team had 7 positive defense observations.',
  category: 'session_design',
  ...overrides,
});

const makeReflection = (overrides?: Partial<CoachReflectionContent>): CoachReflectionContent => ({
  session_summary: 'Solid practice. The team showed improvement in ball handling and defensive positioning.',
  questions: [
    makeQuestion({ id: 'q1', category: 'player_development' }),
    makeQuestion({ id: 'q2', category: 'team_dynamics' }),
    makeQuestion({ id: 'q3', category: 'coaching_approach' }),
    makeQuestion({ id: 'q4', category: 'session_design' }),
  ],
  growth_focus: 'Focus on weak-side defensive help next session.',
  answers: {},
  ...overrides,
});

const makeObs = (overrides?: Partial<ObservationRow>): ObservationRow => ({
  player_id: 'player-1',
  sentiment: 'positive',
  category: 'Defense',
  text: 'Great closeout on the perimeter.',
  ...overrides,
});

// ─── isValidReflectionAnswer ──────────────────────────────────────────────────

describe('isValidReflectionAnswer', () => {
  it('returns true for non-empty string', () => {
    expect(isValidReflectionAnswer('I focused on positioning.')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidReflectionAnswer('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isValidReflectionAnswer('   ')).toBe(false);
  });

  it('returns false for non-string value', () => {
    expect(isValidReflectionAnswer(null as any)).toBe(false);
  });

  it('returns true for single character', () => {
    expect(isValidReflectionAnswer('x')).toBe(true);
  });
});

// ─── countAnsweredQuestions ───────────────────────────────────────────────────

describe('countAnsweredQuestions', () => {
  it('returns 0 when answers is empty object', () => {
    const r = makeReflection({ answers: {} });
    expect(countAnsweredQuestions(r)).toBe(0);
  });

  it('returns 0 when answers is undefined', () => {
    const r = makeReflection({ answers: undefined });
    expect(countAnsweredQuestions(r)).toBe(0);
  });

  it('counts only non-empty answers', () => {
    const r = makeReflection({
      answers: { q1: 'Great practice.', q2: '', q3: '  ', q4: 'Need to work on rotations.' },
    });
    expect(countAnsweredQuestions(r)).toBe(2);
  });

  it('returns full count when all answered', () => {
    const r = makeReflection({
      answers: { q1: 'A', q2: 'B', q3: 'C', q4: 'D' },
    });
    expect(countAnsweredQuestions(r)).toBe(4);
  });
});

// ─── hasAllAnswers ────────────────────────────────────────────────────────────

describe('hasAllAnswers', () => {
  it('returns false when no answers', () => {
    expect(hasAllAnswers(makeReflection())).toBe(false);
  });

  it('returns false when some answered', () => {
    const r = makeReflection({ answers: { q1: 'Yes', q2: 'No' } });
    expect(hasAllAnswers(r)).toBe(false);
  });

  it('returns true when all 4 questions answered', () => {
    const r = makeReflection({ answers: { q1: 'A', q2: 'B', q3: 'C', q4: 'D' } });
    expect(hasAllAnswers(r)).toBe(true);
  });

  it('returns false for empty questions array', () => {
    const r = makeReflection({ questions: [], answers: {} });
    expect(hasAllAnswers(r)).toBe(false);
  });
});

// ─── hasAnyAnswer ─────────────────────────────────────────────────────────────

describe('hasAnyAnswer', () => {
  it('returns false when no answers', () => {
    expect(hasAnyAnswer(makeReflection())).toBe(false);
  });

  it('returns true when at least one answered', () => {
    const r = makeReflection({ answers: { q1: 'Something.' } });
    expect(hasAnyAnswer(r)).toBe(true);
  });
});

// ─── truncateAnswer ───────────────────────────────────────────────────────────

describe('truncateAnswer', () => {
  it('returns the original string when short enough', () => {
    expect(truncateAnswer('Short answer.', 50)).toBe('Short answer.');
  });

  it('truncates and appends ellipsis when too long', () => {
    const long = 'A'.repeat(100);
    const result = truncateAnswer(long, 20);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(21);
  });

  it('handles empty string', () => {
    expect(truncateAnswer('', 10)).toBe('');
  });

  it('handles exact-length string without truncation', () => {
    expect(truncateAnswer('12345', 5)).toBe('12345');
  });
});

// ─── getCategoryLabel ─────────────────────────────────────────────────────────

describe('getCategoryLabel', () => {
  it('returns human-readable label for player_development', () => {
    expect(getCategoryLabel('player_development')).toBe('Player Development');
  });

  it('returns human-readable label for team_dynamics', () => {
    expect(getCategoryLabel('team_dynamics')).toBe('Team Dynamics');
  });

  it('returns human-readable label for coaching_approach', () => {
    expect(getCategoryLabel('coaching_approach')).toBe('Coaching Approach');
  });

  it('returns human-readable label for session_design', () => {
    expect(getCategoryLabel('session_design')).toBe('Session Design');
  });

  it('returns the raw string for unknown category', () => {
    expect(getCategoryLabel('unknown_cat')).toBe('unknown_cat');
  });
});

// ─── getCategoryColor ─────────────────────────────────────────────────────────

describe('getCategoryColor', () => {
  it('returns a color class for each known category', () => {
    const categories = ['player_development', 'team_dynamics', 'coaching_approach', 'session_design'];
    for (const cat of categories) {
      const color = getCategoryColor(cat);
      expect(color).toMatch(/^text-/);
    }
  });

  it('returns zinc fallback for unknown category', () => {
    expect(getCategoryColor('mystery')).toBe('text-zinc-400');
  });
});

// ─── isValidCategory ─────────────────────────────────────────────────────────

describe('isValidCategory', () => {
  it('returns true for all valid categories', () => {
    expect(isValidCategory('player_development')).toBe(true);
    expect(isValidCategory('team_dynamics')).toBe(true);
    expect(isValidCategory('coaching_approach')).toBe(true);
    expect(isValidCategory('session_design')).toBe(true);
  });

  it('returns false for invalid string', () => {
    expect(isValidCategory('invalid')).toBe(false);
    expect(isValidCategory('')).toBe(false);
  });
});

// ─── countBySentiment ────────────────────────────────────────────────────────

describe('countBySentiment', () => {
  it('returns zeros for empty array', () => {
    expect(countBySentiment([])).toEqual({ positive: 0, needsWork: 0, neutral: 0 });
  });

  it('counts each sentiment correctly', () => {
    const obs = [
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'needs-work' }),
      makeObs({ sentiment: 'neutral' }),
    ];
    expect(countBySentiment(obs)).toEqual({ positive: 2, needsWork: 1, neutral: 1 });
  });

  it('handles all-positive observations', () => {
    const obs = [makeObs(), makeObs(), makeObs()];
    expect(countBySentiment(obs)).toEqual({ positive: 3, needsWork: 0, neutral: 0 });
  });
});

// ─── calculateHealthScore ─────────────────────────────────────────────────────

describe('calculateHealthScore', () => {
  it('returns 0 for empty array', () => {
    expect(calculateHealthScore([])).toBe(0);
  });

  it('returns 100 when all player observations are positive', () => {
    const obs = [makeObs(), makeObs(), makeObs()];
    expect(calculateHealthScore(obs)).toBe(100);
  });

  it('returns 0 when all player observations are needs-work', () => {
    const obs = [makeObs({ sentiment: 'needs-work' }), makeObs({ sentiment: 'needs-work' })];
    expect(calculateHealthScore(obs)).toBe(0);
  });

  it('calculates correctly with mix', () => {
    const obs = [
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'needs-work' }),
      makeObs({ sentiment: 'needs-work' }),
    ];
    expect(calculateHealthScore(obs)).toBe(50);
  });

  it('ignores team observations (null player_id)', () => {
    const obs = [
      makeObs({ player_id: null, sentiment: 'needs-work' }),
      makeObs({ sentiment: 'positive' }),
    ];
    // Only 1 player obs (positive) → 100%
    expect(calculateHealthScore(obs)).toBe(100);
  });
});

// ─── countObservedPlayers ─────────────────────────────────────────────────────

describe('countObservedPlayers', () => {
  it('returns 0 for empty array', () => {
    expect(countObservedPlayers([])).toBe(0);
  });

  it('counts unique players', () => {
    const obs = [
      makeObs({ player_id: 'p1' }),
      makeObs({ player_id: 'p1' }),
      makeObs({ player_id: 'p2' }),
      makeObs({ player_id: null }),
    ];
    expect(countObservedPlayers(obs)).toBe(2);
  });
});

// ─── getUnobservedPlayerIds ───────────────────────────────────────────────────

describe('getUnobservedPlayerIds', () => {
  it('returns empty array when all players observed', () => {
    const obs = [makeObs({ player_id: 'p1' }), makeObs({ player_id: 'p2' })];
    expect(getUnobservedPlayerIds(obs, ['p1', 'p2'])).toEqual([]);
  });

  it('returns unobserved player IDs', () => {
    const obs = [makeObs({ player_id: 'p1' })];
    expect(getUnobservedPlayerIds(obs, ['p1', 'p2', 'p3'])).toEqual(['p2', 'p3']);
  });

  it('returns all roster IDs when no observations', () => {
    expect(getUnobservedPlayerIds([], ['p1', 'p2'])).toEqual(['p1', 'p2']);
  });
});

// ─── aggregateByCategory ──────────────────────────────────────────────────────

describe('aggregateByCategory', () => {
  it('returns empty array for empty obs', () => {
    expect(aggregateByCategory([])).toEqual([]);
  });

  it('aggregates correctly and sorts by total descending', () => {
    const obs = [
      makeObs({ category: 'Defense', sentiment: 'positive' }),
      makeObs({ category: 'Defense', sentiment: 'needs-work' }),
      makeObs({ category: 'Defense', sentiment: 'positive' }),
      makeObs({ category: 'Offense', sentiment: 'positive' }),
    ];
    const result = aggregateByCategory(obs);
    expect(result[0].category).toBe('Defense');
    expect(result[0].total).toBe(3);
    expect(result[0].positive).toBe(2);
    expect(result[0].needsWork).toBe(1);
    expect(result[1].category).toBe('Offense');
    expect(result[1].total).toBe(1);
  });

  it('uses General for observations with empty category', () => {
    const obs = [makeObs({ category: '' })];
    const result = aggregateByCategory(obs);
    expect(result[0].category).toBe('General');
  });
});

// ─── buildReflectionShareText ─────────────────────────────────────────────────

describe('buildReflectionShareText', () => {
  it('includes session label and summary', () => {
    const r = makeReflection();
    const text = buildReflectionShareText(r, 'Practice — Apr 14');
    expect(text).toContain('Coach Reflection — Practice — Apr 14');
    expect(text).toContain(r.session_summary);
  });

  it('includes question text and answer', () => {
    const r = makeReflection({
      answers: { q1: 'We worked on closeouts well.' },
    });
    const text = buildReflectionShareText(r, 'Session');
    expect(text).toContain('We worked on closeouts well.');
  });

  it('marks unanswered questions', () => {
    const r = makeReflection({ answers: {} });
    const text = buildReflectionShareText(r, 'Session');
    expect(text).toContain('(not yet answered)');
  });

  it('includes growth focus', () => {
    const r = makeReflection();
    const text = buildReflectionShareText(r, 'Session');
    expect(text).toContain(r.growth_focus);
  });
});

// ─── buildReflectionPreview ───────────────────────────────────────────────────

describe('buildReflectionPreview', () => {
  it('shows not-yet-answered when no answers', () => {
    const r = makeReflection({ answers: {} });
    expect(buildReflectionPreview(r)).toContain('Not yet answered');
  });

  it('shows all-answered when complete', () => {
    const r = makeReflection({ answers: { q1: 'A', q2: 'B', q3: 'C', q4: 'D' } });
    expect(buildReflectionPreview(r)).toContain('All questions answered');
  });

  it('shows partial count when some answered', () => {
    const r = makeReflection({ answers: { q1: 'A', q2: 'B' } });
    expect(buildReflectionPreview(r)).toContain('2/4 questions answered');
  });
});

// ─── reflectionProgress ───────────────────────────────────────────────────────

describe('reflectionProgress', () => {
  it('returns 0 when no questions', () => {
    expect(reflectionProgress(makeReflection({ questions: [], answers: {} }))).toBe(0);
  });

  it('returns 0 when no answers', () => {
    expect(reflectionProgress(makeReflection())).toBe(0);
  });

  it('returns 0.5 when half answered', () => {
    const r = makeReflection({ answers: { q1: 'A', q2: 'B' } });
    expect(reflectionProgress(r)).toBe(0.5);
  });

  it('returns 1 when all answered', () => {
    const r = makeReflection({ answers: { q1: 'A', q2: 'B', q3: 'C', q4: 'D' } });
    expect(reflectionProgress(r)).toBe(1);
  });
});

// ─── groupQuestionsByCategory ─────────────────────────────────────────────────

describe('groupQuestionsByCategory', () => {
  it('groups questions into correct buckets', () => {
    const questions = makeReflection().questions;
    const grouped = groupQuestionsByCategory(questions);
    expect(grouped.player_development).toHaveLength(1);
    expect(grouped.team_dynamics).toHaveLength(1);
    expect(grouped.coaching_approach).toHaveLength(1);
    expect(grouped.session_design).toHaveLength(1);
  });

  it('returns empty arrays for categories with no questions', () => {
    const grouped = groupQuestionsByCategory([
      makeQuestion({ id: 'q1', category: 'player_development' }),
    ]);
    expect(grouped.team_dynamics).toHaveLength(0);
    expect(grouped.coaching_approach).toHaveLength(0);
    expect(grouped.session_design).toHaveLength(0);
  });

  it('handles empty array gracefully', () => {
    const grouped = groupQuestionsByCategory([]);
    expect(grouped.player_development).toHaveLength(0);
    expect(grouped.team_dynamics).toHaveLength(0);
  });
});
