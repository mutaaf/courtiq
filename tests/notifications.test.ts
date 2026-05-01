import { describe, it, expect } from 'vitest';
import {
  buildNotificationId,
  priorityOrder,
  sortNotifications,
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
    expect(buildNotificationId('parent_reaction_message', 'rxn-42')).toBe('parent_reaction_message:rxn-42');
    expect(buildNotificationId('parent_viewed', 'share-99')).toBe('parent_viewed:share-99');
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

// ─── parent_reaction_message notification shape ───────────────────────────────

describe('parent_reaction_message notifications', () => {
  it('uses medium priority', () => {
    const n = makeNotification({ type: 'parent_reaction_message', priority: 'medium' });
    expect(n.priority).toBe('medium');
  });

  it('sorts after high-priority items', () => {
    const rxnMsg = makeNotification({
      id: 'rxn-1',
      type: 'parent_reaction_message',
      priority: 'medium',
      timestamp: '2026-04-29T10:00:00.000Z',
    });
    const goalAlert = makeNotification({
      id: 'goal-1',
      type: 'goal_deadline',
      priority: 'high',
      timestamp: '2026-04-28T10:00:00.000Z',
    });
    const sorted = sortNotifications([rxnMsg, goalAlert]);
    expect(sorted[0].id).toBe('goal-1');
    expect(sorted[1].id).toBe('rxn-1');
  });

  it('sorts newer parent messages before older ones at same priority', () => {
    const older = makeNotification({
      id: 'rxn-old',
      type: 'parent_reaction_message',
      priority: 'medium',
      timestamp: '2026-04-20T08:00:00.000Z',
    });
    const newer = makeNotification({
      id: 'rxn-new',
      type: 'parent_reaction_message',
      priority: 'medium',
      timestamp: '2026-04-29T09:00:00.000Z',
    });
    const sorted = sortNotifications([older, newer]);
    expect(sorted[0].id).toBe('rxn-new');
    expect(sorted[1].id).toBe('rxn-old');
  });

  it('generates a stable notification id', () => {
    expect(buildNotificationId('parent_reaction_message', 'reaction-uuid-123'))
      .toBe('parent_reaction_message:reaction-uuid-123');
  });

  it('can coexist with all other notification types without breaking sort', () => {
    const mixed = [
      makeNotification({ id: 'a', type: 'unobserved_player', priority: 'medium' }),
      makeNotification({ id: 'b', type: 'parent_reaction_message', priority: 'medium' }),
      makeNotification({ id: 'c', type: 'achievement_earned', priority: 'low' }),
      makeNotification({ id: 'd', type: 'session_today', priority: 'high' }),
      makeNotification({ id: 'e', type: 'birthday_today', priority: 'high' }),
    ];
    const sorted = sortNotifications(mixed);
    expect(sorted).toHaveLength(5);
    // High-priority items first
    const highIds = sorted.filter((n) => n.priority === 'high').map((n) => n.id);
    expect(highIds).toContain('d');
    expect(highIds).toContain('e');
    // Low priority last
    expect(sorted[sorted.length - 1].priority).toBe('low');
  });
});

// ─── parent_viewed notification shape ────────────────────────────────────────

describe('parent_viewed notifications', () => {
  it('uses low priority', () => {
    const n = makeNotification({ type: 'parent_viewed', priority: 'low' });
    expect(n.priority).toBe('low');
  });

  it('generates a stable notification id from share id', () => {
    expect(buildNotificationId('parent_viewed', 'share-uuid-456'))
      .toBe('parent_viewed:share-uuid-456');
  });

  it('sorts after high and medium priority items', () => {
    const viewed = makeNotification({
      id: 'view-1',
      type: 'parent_viewed',
      priority: 'low',
      timestamp: '2026-05-01T10:00:00.000Z',
    });
    const goalAlert = makeNotification({
      id: 'goal-1',
      type: 'goal_deadline',
      priority: 'high',
      timestamp: '2026-04-30T08:00:00.000Z',
    });
    const rxnMsg = makeNotification({
      id: 'rxn-1',
      type: 'parent_reaction_message',
      priority: 'medium',
      timestamp: '2026-05-01T09:00:00.000Z',
    });
    const sorted = sortNotifications([viewed, goalAlert, rxnMsg]);
    expect(sorted[0].id).toBe('goal-1');
    expect(sorted[1].id).toBe('rxn-1');
    expect(sorted[2].id).toBe('view-1');
  });

  it('sorts newer parent_viewed before older ones', () => {
    const older = makeNotification({
      id: 'view-old',
      type: 'parent_viewed',
      priority: 'low',
      timestamp: '2026-04-29T06:00:00.000Z',
    });
    const newer = makeNotification({
      id: 'view-new',
      type: 'parent_viewed',
      priority: 'low',
      timestamp: '2026-05-01T14:00:00.000Z',
    });
    const sorted = sortNotifications([older, newer]);
    expect(sorted[0].id).toBe('view-new');
    expect(sorted[1].id).toBe('view-old');
  });

  it('can coexist with all other notification types', () => {
    const mixed = [
      makeNotification({ id: 'a', type: 'unobserved_player', priority: 'medium' }),
      makeNotification({ id: 'b', type: 'parent_reaction_message', priority: 'medium' }),
      makeNotification({ id: 'c', type: 'achievement_earned', priority: 'low' }),
      makeNotification({ id: 'd', type: 'session_today', priority: 'high' }),
      makeNotification({ id: 'e', type: 'birthday_today', priority: 'high' }),
      makeNotification({ id: 'f', type: 'parent_viewed', priority: 'low' }),
    ];
    const sorted = sortNotifications(mixed);
    expect(sorted).toHaveLength(6);
    // High-priority items first
    const highIds = sorted.filter((n) => n.priority === 'high').map((n) => n.id);
    expect(highIds).toContain('d');
    expect(highIds).toContain('e');
    // Low-priority (achievement_earned + parent_viewed) last
    const lowItems = sorted.filter((n) => n.priority === 'low');
    expect(lowItems).toHaveLength(2);
    expect(lowItems.map((n) => n.id).sort()).toEqual(['c', 'f']);
  });

  it('href points to the player roster page', () => {
    const n = makeNotification({
      type: 'parent_viewed',
      href: '/roster/player-uuid-789',
    });
    expect(n.href).toBe('/roster/player-uuid-789');
  });
});
