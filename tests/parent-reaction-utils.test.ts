import { describe, it, expect } from 'vitest';
import type { ParentReaction } from '@/types/database';
import {
  ALLOWED_REACTIONS,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
  isValidReaction,
  isValidMessage,
  isValidParentName,
  getReactionLabel,
  formatReactionTime,
  buildDisplayName,
  countReactionsByType,
  countUnread,
  hasUnread,
  getRecentReactions,
  sortNewest,
  hasReactions,
  getTotalReactionCount,
  getReactionsWithMessages,
  getMostUsedReaction,
  buildSummaryLine,
  groupReactionsByPlayer,
} from '@/lib/parent-reaction-utils';

function makeReaction(overrides: Partial<ParentReaction> = {}): ParentReaction {
  return {
    id: 'r1',
    share_token: 'tok123',
    player_id: 'p1',
    team_id: 't1',
    coach_id: 'c1',
    reaction: '❤️',
    message: null,
    parent_name: null,
    is_read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── isValidReaction ──────────────────────────────────────────────────────────

describe('isValidReaction', () => {
  it('accepts all ALLOWED_REACTIONS', () => {
    for (const emoji of ALLOWED_REACTIONS) {
      expect(isValidReaction(emoji)).toBe(true);
    }
  });

  it('rejects unlisted emojis', () => {
    expect(isValidReaction('😊')).toBe(false);
    expect(isValidReaction('')).toBe(false);
    expect(isValidReaction('thumbs')).toBe(false);
  });
});

// ─── isValidMessage ───────────────────────────────────────────────────────────

describe('isValidMessage', () => {
  it('accepts null/undefined as valid (optional)', () => {
    expect(isValidMessage(null)).toBe(true);
    expect(isValidMessage(undefined)).toBe(true);
  });

  it('accepts empty string as valid', () => {
    expect(isValidMessage('')).toBe(true);
    expect(isValidMessage('   ')).toBe(true);
  });

  it('accepts message within limit', () => {
    expect(isValidMessage('Great coach!')).toBe(true);
    expect(isValidMessage('x'.repeat(MAX_MESSAGE_LENGTH))).toBe(true);
  });

  it('rejects message exceeding limit', () => {
    expect(isValidMessage('x'.repeat(MAX_MESSAGE_LENGTH + 1))).toBe(false);
  });
});

// ─── isValidParentName ────────────────────────────────────────────────────────

describe('isValidParentName', () => {
  it('accepts null/undefined as valid (optional)', () => {
    expect(isValidParentName(null)).toBe(true);
    expect(isValidParentName(undefined)).toBe(true);
  });

  it('accepts name within limit', () => {
    expect(isValidParentName('Jane Doe')).toBe(true);
    expect(isValidParentName('x'.repeat(MAX_NAME_LENGTH))).toBe(true);
  });

  it('rejects name exceeding limit', () => {
    expect(isValidParentName('x'.repeat(MAX_NAME_LENGTH + 1))).toBe(false);
  });
});

// ─── getReactionLabel ─────────────────────────────────────────────────────────

describe('getReactionLabel', () => {
  it('returns label for each known reaction', () => {
    expect(getReactionLabel('❤️')).toBe('Love it');
    expect(getReactionLabel('👏')).toBe('Great work');
    expect(getReactionLabel('🌟')).toBe('Star coach');
    expect(getReactionLabel('🙌')).toBe('Awesome');
    expect(getReactionLabel('🔥')).toBe('On fire');
  });

  it('returns fallback for unknown emoji', () => {
    expect(getReactionLabel('😎')).toBe('Thanks');
  });
});

// ─── formatReactionTime ───────────────────────────────────────────────────────

describe('formatReactionTime', () => {
  it('returns "just now" for very recent', () => {
    const ts = new Date().toISOString();
    expect(formatReactionTime(ts)).toBe('just now');
  });

  it('returns minutes for recent reactions', () => {
    const ts = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(formatReactionTime(ts)).toBe('30m ago');
  });

  it('returns hours for same-day reactions', () => {
    const ts = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    expect(formatReactionTime(ts)).toBe('3h ago');
  });

  it('returns "yesterday" for prior-day reaction', () => {
    const ts = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    expect(formatReactionTime(ts)).toBe('yesterday');
  });

  it('returns days for within a week', () => {
    const ts = new Date(Date.now() - 4 * 86400 * 1000).toISOString();
    expect(formatReactionTime(ts)).toBe('4d ago');
  });
});

// ─── buildDisplayName ─────────────────────────────────────────────────────────

describe('buildDisplayName', () => {
  it('returns parent_name when present', () => {
    const r = makeReaction({ parent_name: 'Maria Lopez' });
    expect(buildDisplayName(r)).toBe('Maria Lopez');
  });

  it('returns "A parent" when name is null', () => {
    const r = makeReaction({ parent_name: null });
    expect(buildDisplayName(r)).toBe('A parent');
  });

  it('trims whitespace from name', () => {
    const r = makeReaction({ parent_name: '  John  ' });
    expect(buildDisplayName(r)).toBe('John');
  });
});

// ─── countReactionsByType ─────────────────────────────────────────────────────

describe('countReactionsByType', () => {
  it('counts each emoji type', () => {
    const reactions = [
      makeReaction({ reaction: '❤️' }),
      makeReaction({ id: 'r2', reaction: '❤️' }),
      makeReaction({ id: 'r3', reaction: '👏' }),
    ];
    const counts = countReactionsByType(reactions);
    expect(counts['❤️']).toBe(2);
    expect(counts['👏']).toBe(1);
    expect(counts['🌟']).toBeUndefined();
  });

  it('returns empty object for empty array', () => {
    expect(countReactionsByType([])).toEqual({});
  });
});

// ─── countUnread / hasUnread ──────────────────────────────────────────────────

describe('countUnread', () => {
  it('counts unread reactions', () => {
    const reactions = [
      makeReaction({ is_read: false }),
      makeReaction({ id: 'r2', is_read: true }),
      makeReaction({ id: 'r3', is_read: false }),
    ];
    expect(countUnread(reactions)).toBe(2);
  });

  it('returns 0 when all read', () => {
    const reactions = [makeReaction({ is_read: true })];
    expect(countUnread(reactions)).toBe(0);
  });
});

describe('hasUnread', () => {
  it('returns true if any unread', () => {
    expect(hasUnread([makeReaction({ is_read: false })])).toBe(true);
  });

  it('returns false if all read', () => {
    expect(hasUnread([makeReaction({ is_read: true })])).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(hasUnread([])).toBe(false);
  });
});

// ─── getRecentReactions ───────────────────────────────────────────────────────

describe('getRecentReactions', () => {
  it('returns only reactions within N days', () => {
    const now = new Date();
    const old = new Date(now);
    old.setDate(old.getDate() - 10);

    const reactions = [
      makeReaction({ id: 'recent', created_at: now.toISOString() }),
      makeReaction({ id: 'old', created_at: old.toISOString() }),
    ];

    const result = getRecentReactions(reactions, 7);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('recent');
  });

  it('returns all when all are recent', () => {
    const reactions = [makeReaction(), makeReaction({ id: 'r2' })];
    expect(getRecentReactions(reactions, 7)).toHaveLength(2);
  });
});

// ─── sortNewest ───────────────────────────────────────────────────────────────

describe('sortNewest', () => {
  it('sorts reactions newest first', () => {
    const old = makeReaction({ id: 'old', created_at: new Date(Date.now() - 10000).toISOString() });
    const fresh = makeReaction({ id: 'fresh', created_at: new Date().toISOString() });
    const sorted = sortNewest([old, fresh]);
    expect(sorted[0].id).toBe('fresh');
    expect(sorted[1].id).toBe('old');
  });

  it('does not mutate the input', () => {
    const arr = [makeReaction()];
    const sorted = sortNewest(arr);
    expect(sorted).not.toBe(arr);
  });
});

// ─── hasReactions / getTotalReactionCount ─────────────────────────────────────

describe('hasReactions', () => {
  it('returns true for non-empty array', () => {
    expect(hasReactions([makeReaction()])).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(hasReactions([])).toBe(false);
  });
});

describe('getTotalReactionCount', () => {
  it('returns correct count', () => {
    expect(getTotalReactionCount([makeReaction(), makeReaction({ id: 'r2' })])).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(getTotalReactionCount([])).toBe(0);
  });
});

// ─── getReactionsWithMessages ─────────────────────────────────────────────────

describe('getReactionsWithMessages', () => {
  it('filters to only reactions with non-empty message', () => {
    const reactions = [
      makeReaction({ id: 'msg', message: 'Great job!' }),
      makeReaction({ id: 'nomsg', message: null }),
      makeReaction({ id: 'empty', message: '' }),
    ];
    const result = getReactionsWithMessages(reactions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('msg');
  });
});

// ─── getMostUsedReaction ──────────────────────────────────────────────────────

describe('getMostUsedReaction', () => {
  it('returns the most common emoji', () => {
    const reactions = [
      makeReaction({ reaction: '❤️' }),
      makeReaction({ id: 'r2', reaction: '❤️' }),
      makeReaction({ id: 'r3', reaction: '👏' }),
    ];
    expect(getMostUsedReaction(reactions)).toBe('❤️');
  });

  it('returns null for empty array', () => {
    expect(getMostUsedReaction([])).toBeNull();
  });
});

// ─── buildSummaryLine ─────────────────────────────────────────────────────────

describe('buildSummaryLine', () => {
  it('returns "No reactions yet" for empty', () => {
    expect(buildSummaryLine([])).toBe('No reactions yet');
  });

  it('includes count and emoji for reactions without messages', () => {
    const result = buildSummaryLine([makeReaction()]);
    expect(result).toContain('1 reaction');
    expect(result).toContain('❤️');
  });

  it('includes message count when messages present', () => {
    const reactions = [
      makeReaction({ message: 'Thanks!' }),
      makeReaction({ id: 'r2', message: null }),
    ];
    const result = buildSummaryLine(reactions);
    expect(result).toContain('1 message');
  });

  it('uses correct pluralization', () => {
    const reactions = [
      makeReaction({ message: 'A' }),
      makeReaction({ id: 'r2', message: 'B' }),
    ];
    const result = buildSummaryLine(reactions);
    expect(result).toContain('2 reactions');
    expect(result).toContain('2 messages');
  });
});

// ─── groupReactionsByPlayer ───────────────────────────────────────────────────

describe('groupReactionsByPlayer', () => {
  it('groups reactions by player_id', () => {
    const reactions = [
      makeReaction({ id: 'r1', player_id: 'p1' }),
      makeReaction({ id: 'r2', player_id: 'p1' }),
      makeReaction({ id: 'r3', player_id: 'p2' }),
    ];
    const groups = groupReactionsByPlayer(reactions);
    expect(groups['p1']).toHaveLength(2);
    expect(groups['p2']).toHaveLength(1);
  });

  it('uses "unknown" key for null player_id', () => {
    const r = makeReaction({ player_id: null });
    const groups = groupReactionsByPlayer([r]);
    expect(groups['unknown']).toHaveLength(1);
  });
});
