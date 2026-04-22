import { describe, it, expect } from 'vitest';
import {
  getDayKey,
  normalizeDates,
  calculateCurrentStreak,
  calculateLongestStreak,
  getEarnedMilestones,
  getNextMilestone,
  getDaysToNextMilestone,
  getStreakMessage,
  buildStreakData,
  formatStreakCount,
  isNewRecord,
  streakPercentToNextMilestone,
} from '@/lib/streak-utils';

// ─── getDayKey ────────────────────────────────────────────────────────────────

describe('getDayKey', () => {
  it('formats UTC date as YYYY-MM-DD', () => {
    const d = new Date('2025-06-15T12:00:00Z');
    expect(getDayKey(d)).toBe('2025-06-15');
  });

  it('pads month and day with zeros', () => {
    const d = new Date('2025-01-05T00:00:00Z');
    expect(getDayKey(d)).toBe('2025-01-05');
  });

  it('handles December 31', () => {
    const d = new Date('2025-12-31T23:59:59Z');
    expect(getDayKey(d)).toBe('2025-12-31');
  });
});

// ─── normalizeDates ───────────────────────────────────────────────────────────

describe('normalizeDates', () => {
  it('deduplicates dates', () => {
    const result = normalizeDates(['2025-06-01', '2025-06-01', '2025-06-02']);
    expect(result).toHaveLength(2);
  });

  it('sorts descending (newest first)', () => {
    const result = normalizeDates(['2025-06-01', '2025-06-03', '2025-06-02']);
    expect(result).toEqual(['2025-06-03', '2025-06-02', '2025-06-01']);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeDates([])).toEqual([]);
  });
});

// ─── calculateCurrentStreak ──────────────────────────────────────────────────

describe('calculateCurrentStreak', () => {
  it('returns 0 for empty dates', () => {
    expect(calculateCurrentStreak([], '2025-06-15')).toBe(0);
  });

  it('returns 1 when only today has activity', () => {
    expect(calculateCurrentStreak(['2025-06-15'], '2025-06-15')).toBe(1);
  });

  it('returns 1 when only yesterday has activity (streak not broken)', () => {
    expect(calculateCurrentStreak(['2025-06-14'], '2025-06-15')).toBe(1);
  });

  it('returns 0 when last activity was 2 days ago', () => {
    expect(calculateCurrentStreak(['2025-06-13'], '2025-06-15')).toBe(0);
  });

  it('counts consecutive days including today', () => {
    const dates = ['2025-06-15', '2025-06-14', '2025-06-13'];
    expect(calculateCurrentStreak(dates, '2025-06-15')).toBe(3);
  });

  it('counts consecutive days starting from yesterday', () => {
    const dates = ['2025-06-14', '2025-06-13', '2025-06-12'];
    expect(calculateCurrentStreak(dates, '2025-06-15')).toBe(3);
  });

  it('stops counting at a gap', () => {
    const dates = ['2025-06-15', '2025-06-14', '2025-06-12']; // gap at 13
    expect(calculateCurrentStreak(dates, '2025-06-15')).toBe(2);
  });

  it('handles duplicates correctly', () => {
    const dates = ['2025-06-15', '2025-06-15', '2025-06-14'];
    expect(calculateCurrentStreak(dates, '2025-06-15')).toBe(2);
  });

  it('returns 7 for a full week streak ending today', () => {
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date('2025-06-15T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - i);
      return getDayKey(d);
    });
    expect(calculateCurrentStreak(dates, '2025-06-15')).toBe(7);
  });

  it('returns 0 when last activity was 3 days ago', () => {
    expect(calculateCurrentStreak(['2025-06-12'], '2025-06-15')).toBe(0);
  });

  it('handles activity on same day from multiple records', () => {
    const dates = ['2025-06-15', '2025-06-15', '2025-06-15'];
    expect(calculateCurrentStreak(dates, '2025-06-15')).toBe(1);
  });
});

// ─── calculateLongestStreak ───────────────────────────────────────────────────

describe('calculateLongestStreak', () => {
  it('returns 0 for empty dates', () => {
    expect(calculateLongestStreak([])).toBe(0);
  });

  it('returns 1 for a single date', () => {
    expect(calculateLongestStreak(['2025-06-15'])).toBe(1);
  });

  it('returns correct longest streak across a gap', () => {
    // 3-day run, gap, 5-day run
    const dates = [
      '2025-06-15', '2025-06-14', '2025-06-13', // 3-day
      '2025-06-10', '2025-06-09', '2025-06-08', '2025-06-07', '2025-06-06', // 5-day
    ];
    expect(calculateLongestStreak(dates)).toBe(5);
  });

  it('returns 1 when all dates are non-consecutive', () => {
    const dates = ['2025-06-15', '2025-06-13', '2025-06-11'];
    expect(calculateLongestStreak(dates)).toBe(1);
  });

  it('handles 30-day streak', () => {
    const dates = Array.from({ length: 30 }, (_, i) => {
      const d = new Date('2025-06-30T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - i);
      return getDayKey(d);
    });
    expect(calculateLongestStreak(dates)).toBe(30);
  });

  it('handles duplicates in input', () => {
    const dates = ['2025-06-15', '2025-06-15', '2025-06-14', '2025-06-13'];
    expect(calculateLongestStreak(dates)).toBe(3);
  });
});

// ─── getEarnedMilestones ─────────────────────────────────────────────────────

describe('getEarnedMilestones', () => {
  it('returns empty for streak 0', () => {
    expect(getEarnedMilestones(0)).toHaveLength(0);
  });

  it('returns first milestone at day 3', () => {
    const m = getEarnedMilestones(3);
    expect(m).toHaveLength(1);
    expect(m[0].days).toBe(3);
  });

  it('returns all milestones at streak 100', () => {
    const m = getEarnedMilestones(100);
    expect(m.length).toBeGreaterThanOrEqual(6);
  });

  it('returns correct count at streak 14', () => {
    // 3, 7, 14 are earned
    const m = getEarnedMilestones(14);
    expect(m.length).toBe(3);
  });
});

// ─── getNextMilestone ────────────────────────────────────────────────────────

describe('getNextMilestone', () => {
  it('returns first milestone when streak is 0', () => {
    expect(getNextMilestone(0)?.days).toBe(3);
  });

  it('returns next milestone after earning one', () => {
    expect(getNextMilestone(3)?.days).toBe(7);
  });

  it('returns null when all milestones earned', () => {
    expect(getNextMilestone(100)).toBeNull();
  });

  it('returns null when streak exceeds all milestones', () => {
    expect(getNextMilestone(200)).toBeNull();
  });
});

// ─── getDaysToNextMilestone ───────────────────────────────────────────────────

describe('getDaysToNextMilestone', () => {
  it('returns 3 when streak is 0', () => {
    expect(getDaysToNextMilestone(0)).toBe(3);
  });

  it('returns correct days remaining', () => {
    expect(getDaysToNextMilestone(5)).toBe(2); // next is 7
  });

  it('returns null when no next milestone', () => {
    expect(getDaysToNextMilestone(100)).toBeNull();
  });
});

// ─── getStreakMessage ─────────────────────────────────────────────────────────

describe('getStreakMessage', () => {
  it('returns start message at 0', () => {
    expect(getStreakMessage(0, false)).toContain('Start');
  });

  it('includes at-risk warning when atRisk is true', () => {
    const msg = getStreakMessage(5, true);
    expect(msg).toContain('alive');
    expect(msg).toContain('5');
  });

  it('returns encouraging message for streaks 1–6', () => {
    expect(getStreakMessage(3, false)).toContain('3');
  });

  it('returns fire message for streaks 7–29', () => {
    expect(getStreakMessage(10, false)).toContain('fire');
  });

  it('returns incredible for streaks 30–99', () => {
    expect(getStreakMessage(45, false)).toContain('incredible');
  });

  it('returns legend for 100+', () => {
    expect(getStreakMessage(100, false)).toContain('legend');
  });
});

// ─── buildStreakData ──────────────────────────────────────────────────────────

describe('buildStreakData', () => {
  const today = '2025-06-15';

  it('returns zero streak for no activity', () => {
    const data = buildStreakData([], today);
    expect(data.currentStreak).toBe(0);
    expect(data.longestStreak).toBe(0);
    expect(data.lastActivityDate).toBeNull();
    expect(data.todayHasActivity).toBe(false);
    expect(data.atRisk).toBe(false);
  });

  it('marks todayHasActivity when today is in dates', () => {
    const data = buildStreakData([today], today);
    expect(data.todayHasActivity).toBe(true);
  });

  it('marks atRisk when yesterday had activity but today does not', () => {
    const data = buildStreakData(['2025-06-14'], today);
    expect(data.atRisk).toBe(true);
    expect(data.currentStreak).toBe(1);
  });

  it('does not mark atRisk when today has activity', () => {
    const data = buildStreakData(['2025-06-15', '2025-06-14'], today);
    expect(data.atRisk).toBe(false);
  });

  it('does not mark atRisk when streak is 0 (gap > 1 day)', () => {
    const data = buildStreakData(['2025-06-13'], today);
    expect(data.atRisk).toBe(false);
    expect(data.currentStreak).toBe(0);
  });

  it('computes correct longestStreak across multiple runs', () => {
    const dates = [
      '2025-06-15', '2025-06-14', // 2-day run
      '2025-06-10', '2025-06-09', '2025-06-08', '2025-06-07', // 4-day run
    ];
    const data = buildStreakData(dates, today);
    expect(data.longestStreak).toBe(4);
    expect(data.currentStreak).toBe(2);
  });

  it('sets lastActivityDate to most recent date', () => {
    const data = buildStreakData(['2025-06-10', '2025-06-15', '2025-06-12'], today);
    expect(data.lastActivityDate).toBe('2025-06-15');
  });
});

// ─── formatStreakCount ────────────────────────────────────────────────────────

describe('formatStreakCount', () => {
  it('formats numbers as strings', () => {
    expect(formatStreakCount(42)).toBe('42');
    expect(formatStreakCount(0)).toBe('0');
  });
});

// ─── isNewRecord ─────────────────────────────────────────────────────────────

describe('isNewRecord', () => {
  it('returns true when current equals longest and > 0', () => {
    expect(isNewRecord(7, 7)).toBe(true);
  });

  it('returns true when current exceeds longest', () => {
    expect(isNewRecord(8, 7)).toBe(true);
  });

  it('returns false when current is less than longest', () => {
    expect(isNewRecord(5, 7)).toBe(false);
  });

  it('returns false when streak is 0', () => {
    expect(isNewRecord(0, 0)).toBe(false);
  });
});

// ─── streakPercentToNextMilestone ────────────────────────────────────────────

describe('streakPercentToNextMilestone', () => {
  it('returns 0% at streak 0 (base 0, next 3)', () => {
    expect(streakPercentToNextMilestone(0)).toBe(0);
  });

  it('returns 100% when all milestones earned', () => {
    expect(streakPercentToNextMilestone(100)).toBe(100);
  });

  it('returns 33% at streak 1 (0→3 range)', () => {
    expect(streakPercentToNextMilestone(1)).toBe(33);
  });

  it('returns 50% at streak 5 (3→7 range)', () => {
    // (5-3)/(7-3) = 2/4 = 50%
    expect(streakPercentToNextMilestone(5)).toBe(50);
  });

  it('returns 100% at exactly the next milestone level (streak = 3)', () => {
    // At streak 3: earned 3-day. Next is 7. base=3, next=7. (3-3)/(7-3)=0%
    expect(streakPercentToNextMilestone(3)).toBe(0);
  });
});
