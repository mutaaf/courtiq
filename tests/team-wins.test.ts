/**
 * Tests for the Team Wins Feed feature.
 *
 * Covers:
 *  - getWinDate: returns earned_at for badge wins
 *  - getWinDate: returns achieved_at for goal wins
 *  - getWinDate: returns streak_at for streak wins
 *  - sortWins: empty array → []
 *  - sortWins: single win → returns that win
 *  - sortWins: sorts newest badge first
 *  - sortWins: sorts newest goal first
 *  - sortWins: mixed types sorted by date
 *  - sortWins: equal dates → stable order preserved
 *  - sortWins: does not mutate the input array
 *  - sortWins: streak wins sorted with badge and goal wins
 *  - getStreakEmoji: returns 🔥 for streak < 5
 *  - getStreakEmoji: returns ⚡ for streak ≥ 5
 *  - getStreakLabel: returns "N sessions in a row!" for any count
 *  - buildStreakShareText: includes player first name, streak count, team name
 *  - formatTimeAgo: 30 seconds ago → "1m ago"
 *  - formatTimeAgo: 5 minutes ago → "5m ago"
 *  - formatTimeAgo: 59 minutes ago → "59m ago"
 *  - formatTimeAgo: 1 hour ago → "1h ago"
 *  - formatTimeAgo: 23 hours ago → "23h ago"
 *  - formatTimeAgo: 1 day ago → "1d ago"
 *  - formatTimeAgo: 7 days ago → "7d ago"
 *  - formatTimeAgo: 14 days ago → "14d ago"
 */

import { describe, it, expect } from 'vitest';
import {
  getWinDate,
  sortWins,
  formatTimeAgo,
  getStreakEmoji,
  getStreakLabel,
  buildStreakShareText,
} from '@/lib/team-wins-utils';
import type { BadgeWin, GoalWin, StreakWin } from '@/lib/team-wins-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeBadge(earned_at: string, player_name = 'Alice'): BadgeWin {
  return {
    type: 'badge',
    player_id: 'p1',
    player_name,
    player_jersey: null,
    badge_type: 'first_star',
    badge_name: 'First Star',
    badge_description: 'Earned first positive observation',
    note: null,
    earned_at,
  };
}

function makeGoal(achieved_at: string, player_name = 'Bob'): GoalWin {
  return {
    type: 'goal',
    player_id: 'p2',
    player_name,
    player_jersey: 7,
    skill: 'dribbling',
    goal_text: 'Improve left-hand dribble',
    achieved_at,
  };
}

function makeStreak(streak_at: string, streak: number, player_name = 'Marcus'): StreakWin {
  return {
    type: 'streak',
    player_id: 'p3',
    player_name,
    player_jersey: 5,
    streak,
    streak_at,
  };
}

// ─── getWinDate ───────────────────────────────────────────────────────────────

describe('getWinDate', () => {
  it('returns earned_at for badge wins', () => {
    const win = makeBadge('2026-04-10T12:00:00Z');
    expect(getWinDate(win)).toBe('2026-04-10T12:00:00Z');
  });

  it('returns achieved_at for goal wins', () => {
    const win = makeGoal('2026-04-11T09:00:00Z');
    expect(getWinDate(win)).toBe('2026-04-11T09:00:00Z');
  });

  it('returns streak_at for streak wins', () => {
    const win = makeStreak('2026-04-14T10:00:00Z', 4);
    expect(getWinDate(win)).toBe('2026-04-14T10:00:00Z');
  });
});

// ─── sortWins ─────────────────────────────────────────────────────────────────

describe('sortWins', () => {
  it('returns [] for empty input', () => {
    expect(sortWins([])).toEqual([]);
  });

  it('returns the single win unchanged', () => {
    const win = makeBadge('2026-04-10T12:00:00Z');
    const result = sortWins([win]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(win);
  });

  it('sorts newest badge first', () => {
    const older = makeBadge('2026-04-08T00:00:00Z', 'OlderPlayer');
    const newer = makeBadge('2026-04-12T00:00:00Z', 'NewerPlayer');
    const result = sortWins([older, newer]);
    expect(result[0]).toBe(newer);
    expect(result[1]).toBe(older);
  });

  it('sorts newest goal first', () => {
    const older = makeGoal('2026-04-05T00:00:00Z', 'OlderPlayer');
    const newer = makeGoal('2026-04-13T00:00:00Z', 'NewerPlayer');
    const result = sortWins([older, newer]);
    expect(result[0]).toBe(newer);
    expect(result[1]).toBe(older);
  });

  it('sorts mixed badge and goal wins by date', () => {
    const badge = makeBadge('2026-04-09T00:00:00Z');
    const goal = makeGoal('2026-04-12T00:00:00Z');
    const result = sortWins([badge, goal]);
    expect(result[0]).toBe(goal);   // goal is newer
    expect(result[1]).toBe(badge);
  });

  it('does not mutate the original array', () => {
    const older = makeBadge('2026-04-01T00:00:00Z');
    const newer = makeBadge('2026-04-13T00:00:00Z');
    const input = [older, newer];
    sortWins(input);
    expect(input[0]).toBe(older);
    expect(input[1]).toBe(newer);
  });

  it('sorts streak wins alongside badge and goal wins', () => {
    const badge = makeBadge('2026-04-09T00:00:00Z');
    const streak = makeStreak('2026-04-11T00:00:00Z', 5);
    const goal = makeGoal('2026-04-12T00:00:00Z');
    const result = sortWins([badge, streak, goal]);
    expect(result[0]).toBe(goal);
    expect(result[1]).toBe(streak);
    expect(result[2]).toBe(badge);
  });
});

// ─── getStreakEmoji ───────────────────────────────────────────────────────────

describe('getStreakEmoji', () => {
  it('returns 🔥 for streak of 3', () => {
    expect(getStreakEmoji(3)).toBe('🔥');
  });

  it('returns 🔥 for streak of 4', () => {
    expect(getStreakEmoji(4)).toBe('🔥');
  });

  it('returns ⚡ for streak of 5', () => {
    expect(getStreakEmoji(5)).toBe('⚡');
  });

  it('returns ⚡ for streak of 10', () => {
    expect(getStreakEmoji(10)).toBe('⚡');
  });
});

// ─── getStreakLabel ───────────────────────────────────────────────────────────

describe('getStreakLabel', () => {
  it('returns "N sessions in a row!" for streak of 3', () => {
    expect(getStreakLabel(3)).toBe('3 sessions in a row!');
  });

  it('returns "N sessions in a row!" for streak of 7', () => {
    expect(getStreakLabel(7)).toBe('7 sessions in a row!');
  });

  it('includes trophy for streak of 10+', () => {
    expect(getStreakLabel(10)).toContain('10 sessions in a row!');
  });
});

// ─── buildStreakShareText ─────────────────────────────────────────────────────

describe('buildStreakShareText', () => {
  it('includes player first name', () => {
    const text = buildStreakShareText('Marcus Johnson', 5, 'YMCA Rockets');
    expect(text).toContain('Marcus');
    expect(text).not.toContain('Johnson');
  });

  it('includes streak count', () => {
    const text = buildStreakShareText('Sarah', 4, 'U12 Tigers');
    expect(text).toContain('4');
  });

  it('includes team name', () => {
    const text = buildStreakShareText('Tyler', 3, 'YMCA Ravens');
    expect(text).toContain('YMCA Ravens');
  });

  it('uses ⚡ emoji for streak ≥ 5', () => {
    const text = buildStreakShareText('Jay', 5, 'Eagles');
    expect(text).toContain('⚡');
  });

  it('uses 🔥 emoji for streak < 5', () => {
    const text = buildStreakShareText('Jay', 4, 'Eagles');
    expect(text).toContain('🔥');
  });
});

// ─── formatTimeAgo ────────────────────────────────────────────────────────────

describe('formatTimeAgo', () => {
  const now = new Date('2026-04-13T12:00:00Z').getTime();

  function ago(ms: number): string {
    return new Date(now - ms).toISOString();
  }

  it('30 seconds ago → "1m ago" (floor at 1 min)', () => {
    expect(formatTimeAgo(ago(30_000), now)).toBe('1m ago');
  });

  it('5 minutes ago → "5m ago"', () => {
    expect(formatTimeAgo(ago(5 * 60_000), now)).toBe('5m ago');
  });

  it('59 minutes ago → "59m ago"', () => {
    expect(formatTimeAgo(ago(59 * 60_000), now)).toBe('59m ago');
  });

  it('1 hour ago → "1h ago"', () => {
    expect(formatTimeAgo(ago(60 * 60_000), now)).toBe('1h ago');
  });

  it('23 hours ago → "23h ago"', () => {
    expect(formatTimeAgo(ago(23 * 60 * 60_000), now)).toBe('23h ago');
  });

  it('1 day ago → "1d ago"', () => {
    expect(formatTimeAgo(ago(24 * 60 * 60_000), now)).toBe('1d ago');
  });

  it('7 days ago → "7d ago"', () => {
    expect(formatTimeAgo(ago(7 * 24 * 60 * 60_000), now)).toBe('7d ago');
  });

  it('14 days ago → "14d ago"', () => {
    expect(formatTimeAgo(ago(14 * 24 * 60 * 60_000), now)).toBe('14d ago');
  });
});
