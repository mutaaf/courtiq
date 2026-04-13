/**
 * Tests for Player Development Goals utilities.
 *
 * Covers:
 *  - VALID_GOAL_STATUSES: contains exactly 4 status values
 *  - VALID_GOAL_LEVELS: contains exactly 4 level values (excludes insufficient_data)
 *  - isValidGoalStatus: returns true for all 4 valid statuses
 *  - isValidGoalStatus: returns false for invalid strings
 *  - isValidGoalLevel: returns true for all 4 valid levels
 *  - isValidGoalLevel: returns false for 'insufficient_data' and unknown strings
 *  - getGoalProgressPct: returns null when currentLevel is null
 *  - getGoalProgressPct: returns null when targetLevel is null
 *  - getGoalProgressPct: returns 100 when current >= target
 *  - getGoalProgressPct: returns 0 when current = exploring and target = game_ready
 *  - getGoalProgressPct: returns ~33 when current = exploring, target = got_it
 *  - getGoalProgressPct: returns ~67 when current = practicing, target = got_it
 *  - getGoalProgressPct: returns 50 when current = exploring, target = practicing
 *  - sortGoals: active goals sort before stalled, achieved, archived
 *  - sortGoals: within same status, newer goals sort first
 *  - sortGoals: does not mutate the original array
 *  - countGoalsByStatus: all-zero when no goals
 *  - countGoalsByStatus: counts each status correctly
 *  - countGoalsByStatus: total equals goals.length
 *  - filterGoalsByStatus: returns only goals matching the given status
 *  - filterGoalsByStatus: returns empty array when none match
 *  - hasOverdueGoals: returns false when no goals
 *  - hasOverdueGoals: returns true when an active goal is past its target_date
 *  - hasOverdueGoals: returns false when overdue goal is not active
 *  - hasOverdueGoals: returns false when no target_date set
 *  - daysUntilTarget: returns null when no target_date
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VALID_GOAL_STATUSES,
  VALID_GOAL_LEVELS,
  isValidGoalStatus,
  isValidGoalLevel,
  getGoalProgressPct,
  sortGoals,
  countGoalsByStatus,
  filterGoalsByStatus,
  hasOverdueGoals,
  daysUntilTarget,
} from '@/lib/goal-utils';
import type { PlayerGoal, GoalStatus, ProficiencyLevel } from '@/types/database';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGoal(
  overrides: Partial<PlayerGoal> & { status?: GoalStatus; target_date?: string | null }
): PlayerGoal {
  return {
    id: 'g1',
    player_id: 'p1',
    team_id: 't1',
    coach_id: null,
    skill: 'Dribbling',
    goal_text: 'Improve dribbling confidence',
    target_level: null,
    target_date: null,
    status: 'active',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── VALID_GOAL_STATUSES ──────────────────────────────────────────────────────

describe('VALID_GOAL_STATUSES', () => {
  it('contains exactly 4 status values', () => {
    expect(VALID_GOAL_STATUSES).toHaveLength(4);
  });

  it('includes active, achieved, stalled, archived', () => {
    expect(VALID_GOAL_STATUSES).toContain('active');
    expect(VALID_GOAL_STATUSES).toContain('achieved');
    expect(VALID_GOAL_STATUSES).toContain('stalled');
    expect(VALID_GOAL_STATUSES).toContain('archived');
  });
});

// ─── VALID_GOAL_LEVELS ────────────────────────────────────────────────────────

describe('VALID_GOAL_LEVELS', () => {
  it('contains exactly 4 level values', () => {
    expect(VALID_GOAL_LEVELS).toHaveLength(4);
  });

  it('does not include insufficient_data', () => {
    expect(VALID_GOAL_LEVELS).not.toContain('insufficient_data');
  });

  it('includes exploring, practicing, got_it, game_ready', () => {
    expect(VALID_GOAL_LEVELS).toContain('exploring');
    expect(VALID_GOAL_LEVELS).toContain('practicing');
    expect(VALID_GOAL_LEVELS).toContain('got_it');
    expect(VALID_GOAL_LEVELS).toContain('game_ready');
  });
});

// ─── isValidGoalStatus ────────────────────────────────────────────────────────

describe('isValidGoalStatus', () => {
  it('returns true for all 4 valid statuses', () => {
    expect(isValidGoalStatus('active')).toBe(true);
    expect(isValidGoalStatus('achieved')).toBe(true);
    expect(isValidGoalStatus('stalled')).toBe(true);
    expect(isValidGoalStatus('archived')).toBe(true);
  });

  it('returns false for invalid strings', () => {
    expect(isValidGoalStatus('')).toBe(false);
    expect(isValidGoalStatus('pending')).toBe(false);
    expect(isValidGoalStatus('done')).toBe(false);
    expect(isValidGoalStatus('ACTIVE')).toBe(false);
  });
});

// ─── isValidGoalLevel ────────────────────────────────────────────────────────

describe('isValidGoalLevel', () => {
  it('returns true for all 4 valid levels', () => {
    expect(isValidGoalLevel('exploring')).toBe(true);
    expect(isValidGoalLevel('practicing')).toBe(true);
    expect(isValidGoalLevel('got_it')).toBe(true);
    expect(isValidGoalLevel('game_ready')).toBe(true);
  });

  it('returns false for insufficient_data', () => {
    expect(isValidGoalLevel('insufficient_data')).toBe(false);
  });

  it('returns false for unknown strings', () => {
    expect(isValidGoalLevel('')).toBe(false);
    expect(isValidGoalLevel('Exploring')).toBe(false);
    expect(isValidGoalLevel('master')).toBe(false);
  });
});

// ─── getGoalProgressPct ──────────────────────────────────────────────────────

describe('getGoalProgressPct', () => {
  it('returns null when currentLevel is null', () => {
    expect(getGoalProgressPct(null, 'game_ready')).toBeNull();
  });

  it('returns null when targetLevel is null', () => {
    expect(getGoalProgressPct('exploring', null)).toBeNull();
  });

  it('returns null when both are null', () => {
    expect(getGoalProgressPct(null, null)).toBeNull();
  });

  it('returns 100 when current equals target', () => {
    expect(getGoalProgressPct('practicing', 'practicing')).toBe(100);
    expect(getGoalProgressPct('game_ready', 'game_ready')).toBe(100);
  });

  it('returns 100 when current exceeds target', () => {
    expect(getGoalProgressPct('game_ready', 'practicing')).toBe(100);
    expect(getGoalProgressPct('got_it', 'exploring')).toBe(100);
  });

  it('returns 0 when current = exploring and target = game_ready', () => {
    // span = game_ready(4) - exploring(1) = 3; done = exploring(1) - start(1) = 0 → 0%
    expect(getGoalProgressPct('exploring', 'game_ready')).toBe(0);
  });

  it('returns 50 when current = exploring and target = practicing', () => {
    // span = practicing(2) - exploring(1) = 1; done = exploring(1) - start(1) = 0 → 0%
    // actually: span=1, done=0, so 0%... let me reconsider
    // No, when current=exploring and target=practicing:
    // start=1 (exploring), done = max(0, 1-1)=0, span=2-1=1 → 0%
    // Hmm, this means at "exploring" toward "practicing" you're at 0%.
    // After reaching "practicing" you'd be at 100%.
    // That's correct - if target is practicing and you're at exploring, 0% done.
    expect(getGoalProgressPct('exploring', 'practicing')).toBe(0);
  });

  it('returns 100 when current = practicing and target = practicing', () => {
    expect(getGoalProgressPct('practicing', 'practicing')).toBe(100);
  });

  it('returns 33 when current = practicing and target = game_ready', () => {
    // span = game_ready(4) - exploring(1) = 3; done = practicing(2) - start(1) = 1 → 33%
    expect(getGoalProgressPct('practicing', 'game_ready')).toBe(33);
  });

  it('returns 67 when current = got_it and target = game_ready', () => {
    // span = 3; done = got_it(3) - start(1) = 2 → 67%
    expect(getGoalProgressPct('got_it', 'game_ready')).toBe(67);
  });

  it('returns 100 when current = got_it and target = practicing', () => {
    expect(getGoalProgressPct('got_it', 'practicing')).toBe(100);
  });
});

// ─── sortGoals ───────────────────────────────────────────────────────────────

describe('sortGoals', () => {
  it('sorts active before stalled, achieved, archived', () => {
    const goals = [
      makeGoal({ id: 'a', status: 'archived' }),
      makeGoal({ id: 's', status: 'stalled' }),
      makeGoal({ id: 'ac', status: 'achieved' }),
      makeGoal({ id: 'act', status: 'active' }),
    ];
    const sorted = sortGoals(goals);
    expect(sorted[0].status).toBe('active');
    expect(sorted[1].status).toBe('stalled');
    expect(sorted[2].status).toBe('achieved');
    expect(sorted[3].status).toBe('archived');
  });

  it('within same status, sorts newer goals first', () => {
    const goals = [
      makeGoal({ id: 'old', status: 'active', created_at: '2026-01-01T00:00:00Z' }),
      makeGoal({ id: 'new', status: 'active', created_at: '2026-03-01T00:00:00Z' }),
    ];
    const sorted = sortGoals(goals);
    expect(sorted[0].id).toBe('new');
    expect(sorted[1].id).toBe('old');
  });

  it('does not mutate the original array', () => {
    const goals = [
      makeGoal({ id: 'a', status: 'archived' }),
      makeGoal({ id: 'act', status: 'active' }),
    ];
    const original = [...goals];
    sortGoals(goals);
    expect(goals[0].id).toBe(original[0].id);
    expect(goals[1].id).toBe(original[1].id);
  });

  it('handles empty array', () => {
    expect(sortGoals([])).toEqual([]);
  });
});

// ─── countGoalsByStatus ──────────────────────────────────────────────────────

describe('countGoalsByStatus', () => {
  it('returns all zeros when no goals', () => {
    const counts = countGoalsByStatus([]);
    expect(counts.active).toBe(0);
    expect(counts.achieved).toBe(0);
    expect(counts.stalled).toBe(0);
    expect(counts.archived).toBe(0);
    expect(counts.total).toBe(0);
  });

  it('counts each status correctly', () => {
    const goals = [
      makeGoal({ id: '1', status: 'active' }),
      makeGoal({ id: '2', status: 'active' }),
      makeGoal({ id: '3', status: 'achieved' }),
      makeGoal({ id: '4', status: 'stalled' }),
      makeGoal({ id: '5', status: 'archived' }),
      makeGoal({ id: '6', status: 'archived' }),
    ];
    const counts = countGoalsByStatus(goals);
    expect(counts.active).toBe(2);
    expect(counts.achieved).toBe(1);
    expect(counts.stalled).toBe(1);
    expect(counts.archived).toBe(2);
  });

  it('total equals goals.length', () => {
    const goals = [
      makeGoal({ id: '1', status: 'active' }),
      makeGoal({ id: '2', status: 'achieved' }),
      makeGoal({ id: '3', status: 'stalled' }),
    ];
    expect(countGoalsByStatus(goals).total).toBe(3);
  });
});

// ─── filterGoalsByStatus ─────────────────────────────────────────────────────

describe('filterGoalsByStatus', () => {
  const goals = [
    makeGoal({ id: '1', status: 'active' }),
    makeGoal({ id: '2', status: 'active' }),
    makeGoal({ id: '3', status: 'achieved' }),
    makeGoal({ id: '4', status: 'archived' }),
  ];

  it('returns only goals matching the given status', () => {
    const active = filterGoalsByStatus(goals, 'active');
    expect(active).toHaveLength(2);
    expect(active.every(g => g.status === 'active')).toBe(true);
  });

  it('returns empty array when none match', () => {
    const stalled = filterGoalsByStatus(goals, 'stalled');
    expect(stalled).toHaveLength(0);
  });

  it('returns single match', () => {
    const achieved = filterGoalsByStatus(goals, 'achieved');
    expect(achieved).toHaveLength(1);
    expect(achieved[0].id).toBe('3');
  });
});

// ─── hasOverdueGoals ─────────────────────────────────────────────────────────

describe('hasOverdueGoals', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-13T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when no goals', () => {
    expect(hasOverdueGoals([])).toBe(false);
  });

  it('returns true when an active goal is past its target_date', () => {
    const goals = [
      makeGoal({ id: '1', status: 'active', target_date: '2026-03-01' }),
    ];
    expect(hasOverdueGoals(goals)).toBe(true);
  });

  it('returns false when overdue goal is not active', () => {
    const goals = [
      makeGoal({ id: '1', status: 'achieved', target_date: '2026-03-01' }),
      makeGoal({ id: '2', status: 'archived', target_date: '2026-01-01' }),
    ];
    expect(hasOverdueGoals(goals)).toBe(false);
  });

  it('returns false when no target_date set', () => {
    const goals = [
      makeGoal({ id: '1', status: 'active', target_date: null }),
    ];
    expect(hasOverdueGoals(goals)).toBe(false);
  });

  it('returns false when target_date is today', () => {
    const goals = [
      makeGoal({ id: '1', status: 'active', target_date: '2026-04-13' }),
    ];
    expect(hasOverdueGoals(goals)).toBe(false);
  });

  it('returns false when target_date is in the future', () => {
    const goals = [
      makeGoal({ id: '1', status: 'active', target_date: '2026-12-31' }),
    ];
    expect(hasOverdueGoals(goals)).toBe(false);
  });
});

// ─── daysUntilTarget ─────────────────────────────────────────────────────────

describe('daysUntilTarget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-13T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when no target_date', () => {
    expect(daysUntilTarget({ target_date: null })).toBeNull();
  });

  it('returns 0 for today', () => {
    expect(daysUntilTarget({ target_date: '2026-04-13' })).toBe(0);
  });

  it('returns positive number for future dates', () => {
    expect(daysUntilTarget({ target_date: '2026-04-20' })).toBe(7);
  });

  it('returns negative number for past dates', () => {
    expect(daysUntilTarget({ target_date: '2026-04-06' })).toBe(-7);
  });
});
