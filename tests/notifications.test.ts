import { describe, it, expect } from 'vitest';
import {
  buildNotificationId,
  priorityOrder,
  sortNotifications,
  formatParentViewTimeLabel,
  formatParentViewBody,
} from '../src/app/api/notifications/route';
import type { AppNotification, NotificationPriority } from '../src/app/api/notifications/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNotification(
  overrides: Partial<AppNotification> = {}
): AppNotification {
  return {
    id: 'test:abc',
    type: 'unobserved_player',
    title: 'Test',
    body: 'Test body',
    href: '/roster/abc',
    priority: 'medium',
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── buildNotificationId ──────────────────────────────────────────────────────

describe('buildNotificationId', () => {
  it('combines type and entityId with a colon', () => {
    expect(buildNotificationId('unobserved_player', 'player-123')).toBe(
      'unobserved_player:player-123'
    );
  });

  it('works for every notification type', () => {
    expect(buildNotificationId('goal_deadline', 'goal-1')).toBe('goal_deadline:goal-1');
    expect(buildNotificationId('session_today', 'session-9')).toBe('session_today:session-9');
    expect(buildNotificationId('achievement_earned', 'ach-7')).toBe('achievement_earned:ach-7');
    expect(buildNotificationId('birthday_today', 'player-5')).toBe('birthday_today:player-5');
    expect(buildNotificationId('parent_viewed_report', 'share-42')).toBe('parent_viewed_report:share-42');
  });

  it('preserves UUIDs unchanged', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(buildNotificationId('goal_deadline', uuid)).toBe(`goal_deadline:${uuid}`);
  });
});

// ─── priorityOrder ───────────────────────────────────────────────────────────

describe('priorityOrder', () => {
  it('returns 0 for high', () => {
    expect(priorityOrder('high')).toBe(0);
  });

  it('returns 1 for medium', () => {
    expect(priorityOrder('medium')).toBe(1);
  });

  it('returns 2 for low', () => {
    expect(priorityOrder('low')).toBe(2);
  });

  it('respects the ordering contract (high < medium < low)', () => {
    expect(priorityOrder('high')).toBeLessThan(priorityOrder('medium'));
    expect(priorityOrder('medium')).toBeLessThan(priorityOrder('low'));
  });
});

// ─── sortNotifications ────────────────────────────────────────────────────────

describe('sortNotifications', () => {
  it('sorts high priority before medium before low', () => {
    const items = [
      makeNotification({ id: '1', priority: 'low' }),
      makeNotification({ id: '2', priority: 'high' }),
      makeNotification({ id: '3', priority: 'medium' }),
    ];
    const sorted = sortNotifications(items);
    expect(sorted.map((n) => n.id)).toEqual(['2', '3', '1']);
  });

  it('sorts newer timestamps first within the same priority', () => {
    const items = [
      makeNotification({ id: 'old', priority: 'medium', timestamp: '2026-01-01T00:00:00.000Z' }),
      makeNotification({ id: 'new', priority: 'medium', timestamp: '2026-01-10T00:00:00.000Z' }),
      makeNotification({ id: 'mid', priority: 'medium', timestamp: '2026-01-05T00:00:00.000Z' }),
    ];
    const sorted = sortNotifications(items);
    expect(sorted.map((n) => n.id)).toEqual(['new', 'mid', 'old']);
  });

  it('puts high+old before medium+new', () => {
    const items = [
      makeNotification({ id: 'med-new', priority: 'medium', timestamp: '2026-06-01T00:00:00.000Z' }),
      makeNotification({ id: 'high-old', priority: 'high', timestamp: '2025-01-01T00:00:00.000Z' }),
    ];
    const sorted = sortNotifications(items);
    expect(sorted[0].id).toBe('high-old');
  });

  it('does not mutate the original array', () => {
    const items = [
      makeNotification({ id: '1', priority: 'low' }),
      makeNotification({ id: '2', priority: 'high' }),
    ];
    const original = [...items];
    sortNotifications(items);
    expect(items.map((n) => n.id)).toEqual(original.map((n) => n.id));
  });

  it('handles empty array', () => {
    expect(sortNotifications([])).toEqual([]);
  });

  it('handles single item', () => {
    const n = makeNotification({ id: 'solo' });
    expect(sortNotifications([n])).toEqual([n]);
  });

  it('handles all same priority and same timestamp (stable)', () => {
    const items = [
      makeNotification({ id: 'a', priority: 'high' }),
      makeNotification({ id: 'b', priority: 'high' }),
      makeNotification({ id: 'c', priority: 'high' }),
    ];
    const sorted = sortNotifications(items);
    expect(sorted).toHaveLength(3);
    // All high priority — order among equals is defined by timestamp (same here), so
    // we just assert all ids are present.
    expect(sorted.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('handles mixed priorities and timestamps correctly', () => {
    const priorities: NotificationPriority[] = ['low', 'high', 'medium', 'high', 'low'];
    const timestamps = [
      '2026-01-05T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      '2026-01-03T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-01-06T00:00:00.000Z',
    ];
    const items = priorities.map((p, i) =>
      makeNotification({ id: String(i), priority: p, timestamp: timestamps[i] })
    );
    const sorted = sortNotifications(items);
    // First two should be high priority, sorted newest-first within high
    expect(sorted[0].priority).toBe('high');
    expect(sorted[1].priority).toBe('high');
    expect(new Date(sorted[0].timestamp) >= new Date(sorted[1].timestamp)).toBe(true);
    // Then medium
    expect(sorted[2].priority).toBe('medium');
    // Then low, newest-first
    expect(sorted[3].priority).toBe('low');
    expect(sorted[4].priority).toBe('low');
    expect(new Date(sorted[3].timestamp) >= new Date(sorted[4].timestamp)).toBe(true);
  });
});

// ─── formatParentViewTimeLabel ────────────────────────────────────────────────

describe('formatParentViewTimeLabel', () => {
  it('returns "0 min ago" for 0 minutes', () => {
    expect(formatParentViewTimeLabel(0)).toBe('0 min ago');
  });

  it('returns "X min ago" for values < 60', () => {
    expect(formatParentViewTimeLabel(1)).toBe('1 min ago');
    expect(formatParentViewTimeLabel(30)).toBe('30 min ago');
    expect(formatParentViewTimeLabel(59)).toBe('59 min ago');
  });

  it('returns "1 hr ago" at exactly 60 minutes', () => {
    expect(formatParentViewTimeLabel(60)).toBe('1 hr ago');
  });

  it('returns "X hr ago" for values >= 60', () => {
    expect(formatParentViewTimeLabel(61)).toBe('1 hr ago');
    expect(formatParentViewTimeLabel(119)).toBe('1 hr ago');
    expect(formatParentViewTimeLabel(120)).toBe('2 hr ago');
    expect(formatParentViewTimeLabel(180)).toBe('3 hr ago');
    expect(formatParentViewTimeLabel(1380)).toBe('23 hr ago');
  });

  it('truncates partial hours (floor, not round)', () => {
    // 89 minutes = 1.48 hours → should be "1 hr ago", not "2 hr ago"
    expect(formatParentViewTimeLabel(89)).toBe('1 hr ago');
  });
});

// ─── formatParentViewBody ─────────────────────────────────────────────────────

describe('formatParentViewBody', () => {
  it('shows "1 time" for view_count === 1', () => {
    expect(formatParentViewBody(1, '5 min ago')).toBe('Viewed 1 time · 5 min ago');
  });

  it('shows "N times" for view_count > 1', () => {
    expect(formatParentViewBody(2, '5 min ago')).toBe('Viewed 2 times · 5 min ago');
    expect(formatParentViewBody(10, '3 hr ago')).toBe('Viewed 10 times · 3 hr ago');
  });

  it('never produces "just now" (the removed copy)', () => {
    expect(formatParentViewBody(1, '45 min ago')).not.toContain('just now');
    expect(formatParentViewBody(1, '0 min ago')).not.toContain('just now');
  });

  it('always includes the time label', () => {
    expect(formatParentViewBody(1, '2 hr ago')).toContain('2 hr ago');
    expect(formatParentViewBody(5, '12 min ago')).toContain('12 min ago');
  });

  it('count label and time label are separated by " · "', () => {
    const body = formatParentViewBody(3, '10 min ago');
    expect(body).toMatch(/Viewed 3 times · 10 min ago/);
  });
});
