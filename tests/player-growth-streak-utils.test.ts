import { describe, it, expect } from 'vitest';
import {
  groupObsBySession,
  sortBucketsDesc,
  calculateCurrentStreak,
  calculateLongestStreak,
  countPositiveSessions,
  getLastPositiveAt,
  buildGrowthStreakData,
  hasEnoughDataForGrowthStreak,
  getStreakEmoji,
  getStreakLabel,
  formatStreakCount,
  getStreakBadgeClasses,
  getStreakTextColor,
  isHotStreak,
  isStreakActive,
  buildShareText,
  buildParentMessage,
  getStreakSummaryLine,
  type GrowthObs,
} from '@/lib/player-growth-streak-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function obs(
  sessionId: string | null,
  sentiment: 'positive' | 'needs-work' | 'neutral',
  createdAt: string,
): GrowthObs {
  return { session_id: sessionId, sentiment, created_at: createdAt };
}

const SESSION_A = 'session-a';
const SESSION_B = 'session-b';
const SESSION_C = 'session-c';
const SESSION_D = 'session-d';

// ─── groupObsBySession ────────────────────────────────────────────────────────

describe('groupObsBySession', () => {
  it('returns empty array for no observations', () => {
    expect(groupObsBySession([])).toEqual([]);
  });

  it('groups observations from the same session', () => {
    const result = groupObsBySession([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_A, 'needs-work', '2025-05-01T10:05:00Z'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].sessionKey).toBe(SESSION_A);
    expect(result[0].obsCount).toBe(2);
    expect(result[0].hasPositive).toBe(true);
    expect(result[0].hasNeedsWork).toBe(true);
  });

  it('creates separate buckets for different sessions', () => {
    const result = groupObsBySession([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'needs-work', '2025-05-03T10:00:00Z'),
    ]);
    expect(result).toHaveLength(2);
  });

  it('uses latest created_at as latestAt', () => {
    const result = groupObsBySession([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_A, 'neutral', '2025-05-01T10:30:00Z'),
    ]);
    expect(result[0].latestAt).toBe('2025-05-01T10:30:00Z');
  });

  it('creates unique keys for null-session observations', () => {
    const result = groupObsBySession([
      obs(null, 'positive', '2025-05-01T10:00:00Z'),
      obs(null, 'needs-work', '2025-05-03T10:00:00Z'),
    ]);
    // Each null-session obs gets its own bucket
    expect(result).toHaveLength(2);
    expect(result[0].sessionKey).not.toBe(result[1].sessionKey);
  });

  it('sets hasPositive true only when a positive obs is present', () => {
    const result = groupObsBySession([
      obs(SESSION_A, 'needs-work', '2025-05-01T10:00:00Z'),
      obs(SESSION_A, 'neutral', '2025-05-01T10:05:00Z'),
    ]);
    expect(result[0].hasPositive).toBe(false);
    expect(result[0].hasNeedsWork).toBe(true);
  });

  it('counts obs correctly', () => {
    const result = groupObsBySession([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_A, 'positive', '2025-05-01T10:10:00Z'),
      obs(SESSION_A, 'needs-work', '2025-05-01T10:20:00Z'),
    ]);
    expect(result[0].obsCount).toBe(3);
  });
});

// ─── sortBucketsDesc ──────────────────────────────────────────────────────────

describe('sortBucketsDesc', () => {
  it('sorts buckets most-recent first', () => {
    const buckets = groupObsBySession([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-08T10:00:00Z'),
      obs(SESSION_C, 'positive', '2025-05-03T10:00:00Z'),
    ]);
    const sorted = sortBucketsDesc(buckets);
    expect(sorted[0].sessionKey).toBe(SESSION_B);
    expect(sorted[2].sessionKey).toBe(SESSION_A);
  });

  it('does not mutate the original array', () => {
    const buckets = groupObsBySession([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-08T10:00:00Z'),
    ]);
    const original = [...buckets];
    sortBucketsDesc(buckets);
    expect(buckets).toEqual(original);
  });

  it('handles single bucket', () => {
    const buckets = groupObsBySession([obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z')]);
    expect(sortBucketsDesc(buckets)).toHaveLength(1);
  });
});

// ─── calculateCurrentStreak ───────────────────────────────────────────────────

describe('calculateCurrentStreak', () => {
  it('returns 0 for empty input', () => {
    expect(calculateCurrentStreak([])).toBe(0);
  });

  it('returns 1 for a single positive session', () => {
    const sorted = sortBucketsDesc(
      groupObsBySession([obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z')])
    );
    expect(calculateCurrentStreak(sorted)).toBe(1);
  });

  it('returns 0 for a single needs-work session', () => {
    const sorted = sortBucketsDesc(
      groupObsBySession([obs(SESSION_A, 'needs-work', '2025-05-01T10:00:00Z')])
    );
    expect(calculateCurrentStreak(sorted)).toBe(0);
  });

  it('counts consecutive positive sessions from most recent', () => {
    const sorted = sortBucketsDesc(
      groupObsBySession([
        obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
        obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
        obs(SESSION_C, 'positive', '2025-05-05T10:00:00Z'),
      ])
    );
    expect(calculateCurrentStreak(sorted)).toBe(3);
  });

  it('stops at first non-positive session', () => {
    const sorted = sortBucketsDesc(
      groupObsBySession([
        obs(SESSION_A, 'needs-work', '2025-05-01T10:00:00Z'), // oldest
        obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
        obs(SESSION_C, 'positive', '2025-05-05T10:00:00Z'),   // most recent
      ])
    );
    // sorted desc: C, B, A — streak = 2 (C and B are positive, then A breaks it)
    expect(calculateCurrentStreak(sorted)).toBe(2);
  });

  it('returns 0 when most recent session has no positive obs', () => {
    const sorted = sortBucketsDesc(
      groupObsBySession([
        obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
        obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
        obs(SESSION_C, 'needs-work', '2025-05-05T10:00:00Z'), // most recent breaks streak
      ])
    );
    expect(calculateCurrentStreak(sorted)).toBe(0);
  });

  it('handles mixed positive and needs-work in same session (hasPositive wins)', () => {
    const sorted = sortBucketsDesc(
      groupObsBySession([
        obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
        obs(SESSION_A, 'needs-work', '2025-05-01T10:10:00Z'),
      ])
    );
    expect(calculateCurrentStreak(sorted)).toBe(1);
  });
});

// ─── calculateLongestStreak ───────────────────────────────────────────────────

describe('calculateLongestStreak', () => {
  it('returns 0 for empty input', () => {
    expect(calculateLongestStreak([])).toBe(0);
  });

  it('returns longest run of positive sessions', () => {
    const sorted = sortBucketsDesc(
      groupObsBySession([
        obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
        obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
        obs(SESSION_C, 'needs-work', '2025-05-05T10:00:00Z'), // break
        obs(SESSION_D, 'positive', '2025-05-07T10:00:00Z'),
      ])
    );
    // desc order: D(+), C(-), B(+), A(+) → runs: [1], [2]  → longest = 2
    expect(calculateLongestStreak(sorted)).toBe(2);
  });

  it('returns total length when all sessions are positive', () => {
    const sorted = sortBucketsDesc(
      groupObsBySession([
        obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
        obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
        obs(SESSION_C, 'positive', '2025-05-05T10:00:00Z'),
        obs(SESSION_D, 'positive', '2025-05-07T10:00:00Z'),
      ])
    );
    expect(calculateLongestStreak(sorted)).toBe(4);
  });

  it('returns 0 when all sessions are non-positive', () => {
    const sorted = sortBucketsDesc(
      groupObsBySession([
        obs(SESSION_A, 'needs-work', '2025-05-01T10:00:00Z'),
        obs(SESSION_B, 'needs-work', '2025-05-03T10:00:00Z'),
      ])
    );
    expect(calculateLongestStreak(sorted)).toBe(0);
  });
});

// ─── countPositiveSessions ────────────────────────────────────────────────────

describe('countPositiveSessions', () => {
  it('returns 0 for empty input', () => {
    expect(countPositiveSessions([])).toBe(0);
  });

  it('counts sessions with at least one positive observation', () => {
    const buckets = groupObsBySession([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'needs-work', '2025-05-03T10:00:00Z'),
      obs(SESSION_C, 'positive', '2025-05-05T10:00:00Z'),
    ]);
    expect(countPositiveSessions(buckets)).toBe(2);
  });
});

// ─── getLastPositiveAt ────────────────────────────────────────────────────────

describe('getLastPositiveAt', () => {
  it('returns null for empty input', () => {
    expect(getLastPositiveAt([])).toBeNull();
  });

  it('returns null when no positive obs exist', () => {
    expect(getLastPositiveAt([obs(SESSION_A, 'needs-work', '2025-05-01T10:00:00Z')])).toBeNull();
  });

  it('returns the latest positive observation timestamp', () => {
    const result = getLastPositiveAt([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-05T10:00:00Z'),
      obs(SESSION_C, 'needs-work', '2025-05-10T10:00:00Z'),
    ]);
    expect(result).toBe('2025-05-05T10:00:00Z');
  });
});

// ─── buildGrowthStreakData ────────────────────────────────────────────────────

describe('buildGrowthStreakData', () => {
  it('returns zeros for empty input', () => {
    const data = buildGrowthStreakData([]);
    expect(data.currentStreak).toBe(0);
    expect(data.longestStreak).toBe(0);
    expect(data.totalObservedSessions).toBe(0);
    expect(data.positiveSessionCount).toBe(0);
    expect(data.lastPositiveAt).toBeNull();
    expect(data.hasAnyPositive).toBe(false);
  });

  it('computes streak of 3 from 3 consecutive positive sessions', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
      obs(SESSION_C, 'positive', '2025-05-05T10:00:00Z'),
    ]);
    expect(data.currentStreak).toBe(3);
    expect(data.longestStreak).toBe(3);
    expect(data.totalObservedSessions).toBe(3);
    expect(data.positiveSessionCount).toBe(3);
    expect(data.hasAnyPositive).toBe(true);
  });

  it('resets current streak when most-recent session has no positive', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
      obs(SESSION_C, 'needs-work', '2025-05-05T10:00:00Z'),
    ]);
    expect(data.currentStreak).toBe(0);
    expect(data.longestStreak).toBe(2);
    expect(data.hasAnyPositive).toBe(true);
  });

  it('longest streak can exceed current streak', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
      obs(SESSION_C, 'positive', '2025-05-05T10:00:00Z'),
      obs(SESSION_D, 'needs-work', '2025-05-10T10:00:00Z'), // most recent breaks streak
    ]);
    expect(data.currentStreak).toBe(0);
    expect(data.longestStreak).toBe(3);
  });

  it('sets lastPositiveAt correctly', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'needs-work', '2025-05-05T10:00:00Z'),
    ]);
    expect(data.lastPositiveAt).toBe('2025-05-01T10:00:00Z');
  });
});

// ─── hasEnoughDataForGrowthStreak ─────────────────────────────────────────────

describe('hasEnoughDataForGrowthStreak', () => {
  it('returns false for empty input', () => {
    expect(hasEnoughDataForGrowthStreak([])).toBe(false);
  });

  it('returns false for a single session', () => {
    expect(hasEnoughDataForGrowthStreak([obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z')])).toBe(false);
  });

  it('returns true for observations from 2 distinct sessions', () => {
    expect(hasEnoughDataForGrowthStreak([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
    ])).toBe(true);
  });

  it('returns false for multiple obs in the same session', () => {
    expect(hasEnoughDataForGrowthStreak([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_A, 'needs-work', '2025-05-01T10:10:00Z'),
    ])).toBe(false);
  });
});

// ─── getStreakEmoji ───────────────────────────────────────────────────────────

describe('getStreakEmoji', () => {
  it('returns empty string for 0', () => {
    expect(getStreakEmoji(0)).toBe('');
  });
  it('returns seedling for 1', () => {
    expect(getStreakEmoji(1)).toBe('🌱');
  });
  it('returns leaf for 2', () => {
    expect(getStreakEmoji(2)).toBe('🌿');
  });
  it('returns fire for 3-4', () => {
    expect(getStreakEmoji(3)).toBe('🔥');
    expect(getStreakEmoji(4)).toBe('🔥');
  });
  it('returns lightning for 5-7', () => {
    expect(getStreakEmoji(5)).toBe('⚡');
    expect(getStreakEmoji(7)).toBe('⚡');
  });
  it('returns trophy for 8+', () => {
    expect(getStreakEmoji(8)).toBe('🏆');
    expect(getStreakEmoji(20)).toBe('🏆');
  });
});

// ─── getStreakLabel ───────────────────────────────────────────────────────────

describe('getStreakLabel', () => {
  it('returns empty for 0', () => {
    expect(getStreakLabel(0)).toBe('');
  });
  it('returns first-session label for 1', () => {
    expect(getStreakLabel(1)).toBe('First positive session!');
  });
  it('returns "Two in a row!" for 2', () => {
    expect(getStreakLabel(2)).toBe('Two in a row!');
  });
  it('returns "Three in a row!" for 3', () => {
    expect(getStreakLabel(3)).toBe('Three in a row!');
  });
  it('returns "On a roll!" for 4-5', () => {
    expect(getStreakLabel(4)).toBe('On a roll!');
    expect(getStreakLabel(5)).toBe('On a roll!');
  });
  it('returns "Hot streak!" for 6-9', () => {
    expect(getStreakLabel(6)).toBe('Hot streak!');
    expect(getStreakLabel(9)).toBe('Hot streak!');
  });
  it('returns "Unstoppable!" for 10+', () => {
    expect(getStreakLabel(10)).toBe('Unstoppable!');
  });
});

// ─── formatStreakCount ────────────────────────────────────────────────────────

describe('formatStreakCount', () => {
  it('returns singular for 1', () => {
    expect(formatStreakCount(1)).toBe('1 session');
  });
  it('returns plural for 2+', () => {
    expect(formatStreakCount(2)).toBe('2 sessions');
    expect(formatStreakCount(10)).toBe('10 sessions');
  });
});

// ─── getStreakBadgeClasses ────────────────────────────────────────────────────

describe('getStreakBadgeClasses', () => {
  it('returns muted classes for 0', () => {
    expect(getStreakBadgeClasses(0)).toContain('zinc');
  });
  it('returns emerald for low streak (1-2)', () => {
    expect(getStreakBadgeClasses(1)).toContain('emerald');
    expect(getStreakBadgeClasses(2)).toContain('emerald');
  });
  it('returns orange for medium streak (3-4)', () => {
    expect(getStreakBadgeClasses(3)).toContain('orange');
    expect(getStreakBadgeClasses(4)).toContain('orange');
  });
  it('returns amber for high streak (5+)', () => {
    expect(getStreakBadgeClasses(5)).toContain('amber');
    expect(getStreakBadgeClasses(10)).toContain('amber');
  });
});

// ─── getStreakTextColor ───────────────────────────────────────────────────────

describe('getStreakTextColor', () => {
  it('returns zinc for 0', () => {
    expect(getStreakTextColor(0)).toContain('zinc');
  });
  it('returns emerald for 1-2', () => {
    expect(getStreakTextColor(1)).toContain('emerald');
  });
  it('returns orange for 3-4', () => {
    expect(getStreakTextColor(3)).toContain('orange');
  });
  it('returns amber for 5+', () => {
    expect(getStreakTextColor(5)).toContain('amber');
  });
});

// ─── isHotStreak ─────────────────────────────────────────────────────────────

describe('isHotStreak', () => {
  it('returns false for streak < 3', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
    ]);
    expect(isHotStreak(data)).toBe(false);
  });

  it('returns true for streak >= 3', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
      obs(SESSION_C, 'positive', '2025-05-05T10:00:00Z'),
    ]);
    expect(isHotStreak(data)).toBe(true);
  });
});

// ─── isStreakActive ───────────────────────────────────────────────────────────

describe('isStreakActive', () => {
  it('returns false when streak is 0', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'needs-work', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'needs-work', '2025-05-03T10:00:00Z'),
    ]);
    expect(isStreakActive(data)).toBe(false);
  });

  it('returns true when streak is >= 1', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
    ]);
    expect(isStreakActive(data)).toBe(true);
  });
});

// ─── buildShareText ───────────────────────────────────────────────────────────

describe('buildShareText', () => {
  it('includes player first name', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
      obs(SESSION_C, 'positive', '2025-05-05T10:00:00Z'),
    ]);
    expect(buildShareText(data, 'Marcus Johnson')).toContain('Marcus');
  });

  it('includes hot-streak emoji for streak >= 3', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
      obs(SESSION_C, 'positive', '2025-05-05T10:00:00Z'),
    ]);
    expect(buildShareText(data, 'Marcus')).toContain('🔥');
  });

  it('returns generic message for streak 0', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'needs-work', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'needs-work', '2025-05-03T10:00:00Z'),
    ]);
    const text = buildShareText(data, 'Marcus');
    expect(text).toContain('Marcus');
    expect(text.length).toBeGreaterThan(10);
  });
});

// ─── buildParentMessage ───────────────────────────────────────────────────────

describe('buildParentMessage', () => {
  it('returns encouraging message for hot streak', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
      obs(SESSION_C, 'positive', '2025-05-05T10:00:00Z'),
    ]);
    const msg = buildParentMessage(data, 'Marcus');
    expect(msg).toContain('Marcus');
    expect(msg).toContain('3 sessions');
  });

  it('mentions 2 sessions for streak of 2', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
    ]);
    const msg = buildParentMessage(data, 'Sofia');
    expect(msg).toContain('Sofia');
  });

  it('gives encouraging message for streak 0', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'needs-work', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'needs-work', '2025-05-03T10:00:00Z'),
    ]);
    const msg = buildParentMessage(data, 'Tyler');
    expect(msg).toContain('Tyler');
    expect(msg.length).toBeGreaterThan(10);
  });
});

// ─── getStreakSummaryLine ─────────────────────────────────────────────────────

describe('getStreakSummaryLine', () => {
  it('returns "No positive sessions yet" when no positives', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'needs-work', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'needs-work', '2025-05-03T10:00:00Z'),
    ]);
    expect(getStreakSummaryLine(data)).toBe('No positive sessions yet');
  });

  it('shows current streak when active', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
    ]);
    expect(getStreakSummaryLine(data)).toBe('2 sessions in a row');
  });

  it('shows best streak when current is 0 but had prior positives', () => {
    const data = buildGrowthStreakData([
      obs(SESSION_A, 'positive', '2025-05-01T10:00:00Z'),
      obs(SESSION_B, 'positive', '2025-05-03T10:00:00Z'),
      obs(SESSION_C, 'needs-work', '2025-05-05T10:00:00Z'),
    ]);
    expect(getStreakSummaryLine(data)).toContain('Best streak');
  });
});
