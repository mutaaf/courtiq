/**
 * Tests for Team Announcement utilities.
 *
 * Covers:
 *  - isValidTitle: returns false for empty string
 *  - isValidTitle: returns false for whitespace-only string
 *  - isValidTitle: returns true for normal title
 *  - isValidTitle: returns false when title exceeds MAX_TITLE_LENGTH
 *  - isValidTitle: returns true at exactly MAX_TITLE_LENGTH
 *  - isValidBody: returns false for empty string
 *  - isValidBody: returns false for whitespace-only string
 *  - isValidBody: returns true for normal body text
 *  - isValidBody: returns false when body exceeds MAX_BODY_LENGTH
 *  - isValidBody: returns true at exactly MAX_BODY_LENGTH
 *  - expiryToDate: returns null for "never"
 *  - expiryToDate: returns date 3 days from now for "3d"
 *  - expiryToDate: returns date 7 days from now for "7d"
 *  - expiryToDate: returns date 14 days from now for "14d"
 *  - expiryLabel: returns correct label for each expiry option
 *  - isActive: returns true when expires_at is null
 *  - isActive: returns true when expires_at is in the future
 *  - isActive: returns false when expires_at is in the past
 *  - filterActive: keeps only non-expired announcements
 *  - filterExpired: keeps only expired announcements
 *  - sortByNewest: sorts newest first
 *  - sortByNewest: does not mutate original array
 *  - timeUntilExpiry: returns "No expiry" when expires_at is null
 *  - timeUntilExpiry: returns "Expired" when past expires_at
 *  - timeUntilExpiry: returns days-remaining label when in future
 *  - countActive: returns 0 for empty array
 *  - countActive: counts only active announcements
 *  - hasAnnouncements: returns false for empty array
 *  - hasAnnouncements: returns true for non-empty array
 *  - hasActiveAnnouncements: returns false when all expired
 *  - hasActiveAnnouncements: returns true when at least one is active
 *  - truncateBody: returns original string when within limit
 *  - truncateBody: truncates and appends ellipsis when over limit
 *  - buildAnnouncementShareText: formats title and body
 *  - getLatestActive: returns null for empty array
 *  - getLatestActive: returns most recent active announcement
 *  - getLatestActive: skips expired announcements
 */

import { describe, it, expect } from 'vitest';
import {
  isValidTitle,
  isValidBody,
  expiryToDate,
  expiryLabel,
  isActive,
  filterActive,
  filterExpired,
  sortByNewest,
  timeUntilExpiry,
  countActive,
  hasAnnouncements,
  hasActiveAnnouncements,
  truncateBody,
  buildAnnouncementShareText,
  getLatestActive,
  MAX_TITLE_LENGTH,
  MAX_BODY_LENGTH,
} from '@/lib/announcement-utils';
import type { TeamAnnouncement } from '@/types/database';

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeAnnouncement(overrides: Partial<TeamAnnouncement> = {}): TeamAnnouncement {
  return {
    id: 'ann-1',
    team_id: 'team-1',
    created_by: 'coach-1',
    title: 'Practice tomorrow at 4pm',
    body: 'Please arrive 10 minutes early to warm up.',
    expires_at: null,
    created_at: '2026-04-14T10:00:00.000Z',
    ...overrides,
  };
}

const FUTURE = new Date('2030-01-01T00:00:00.000Z').toISOString();
const PAST   = new Date('2020-01-01T00:00:00.000Z').toISOString();
const NOW    = new Date('2026-04-14T12:00:00.000Z');

// ─── isValidTitle ─────────────────────────────────────────────────────────────

describe('isValidTitle', () => {
  it('returns false for empty string', () => {
    expect(isValidTitle('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isValidTitle('   ')).toBe(false);
  });

  it('returns true for normal title', () => {
    expect(isValidTitle('No practice on Friday')).toBe(true);
  });

  it('returns false when title exceeds MAX_TITLE_LENGTH', () => {
    expect(isValidTitle('x'.repeat(MAX_TITLE_LENGTH + 1))).toBe(false);
  });

  it('returns true at exactly MAX_TITLE_LENGTH', () => {
    expect(isValidTitle('x'.repeat(MAX_TITLE_LENGTH))).toBe(true);
  });
});

// ─── isValidBody ─────────────────────────────────────────────────────────────

describe('isValidBody', () => {
  it('returns false for empty string', () => {
    expect(isValidBody('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isValidBody('   ')).toBe(false);
  });

  it('returns true for normal body text', () => {
    expect(isValidBody('Bring your water bottles!')).toBe(true);
  });

  it('returns false when body exceeds MAX_BODY_LENGTH', () => {
    expect(isValidBody('x'.repeat(MAX_BODY_LENGTH + 1))).toBe(false);
  });

  it('returns true at exactly MAX_BODY_LENGTH', () => {
    expect(isValidBody('x'.repeat(MAX_BODY_LENGTH))).toBe(true);
  });
});

// ─── expiryToDate ─────────────────────────────────────────────────────────────

describe('expiryToDate', () => {
  const base = new Date('2026-04-14T00:00:00.000Z');

  it('returns null for "never"', () => {
    expect(expiryToDate('never', base)).toBeNull();
  });

  it('returns date 3 days from now for "3d"', () => {
    const result = expiryToDate('3d', base);
    expect(result).toBe(new Date('2026-04-17T00:00:00.000Z').toISOString());
  });

  it('returns date 7 days from now for "7d"', () => {
    const result = expiryToDate('7d', base);
    expect(result).toBe(new Date('2026-04-21T00:00:00.000Z').toISOString());
  });

  it('returns date 14 days from now for "14d"', () => {
    const result = expiryToDate('14d', base);
    expect(result).toBe(new Date('2026-04-28T00:00:00.000Z').toISOString());
  });
});

// ─── expiryLabel ─────────────────────────────────────────────────────────────

describe('expiryLabel', () => {
  it('returns correct label for each expiry option', () => {
    expect(expiryLabel('3d')).toBe('Expires in 3 days');
    expect(expiryLabel('7d')).toBe('Expires in 7 days');
    expect(expiryLabel('14d')).toBe('Expires in 14 days');
    expect(expiryLabel('never')).toBe('No expiry');
  });
});

// ─── isActive ────────────────────────────────────────────────────────────────

describe('isActive', () => {
  it('returns true when expires_at is null', () => {
    const a = makeAnnouncement({ expires_at: null });
    expect(isActive(a, NOW)).toBe(true);
  });

  it('returns true when expires_at is in the future', () => {
    const a = makeAnnouncement({ expires_at: FUTURE });
    expect(isActive(a, NOW)).toBe(true);
  });

  it('returns false when expires_at is in the past', () => {
    const a = makeAnnouncement({ expires_at: PAST });
    expect(isActive(a, NOW)).toBe(false);
  });
});

// ─── filterActive / filterExpired ────────────────────────────────────────────

describe('filterActive', () => {
  it('keeps only non-expired announcements', () => {
    const active  = makeAnnouncement({ id: 'a1', expires_at: null });
    const expired = makeAnnouncement({ id: 'a2', expires_at: PAST });
    const result  = filterActive([active, expired], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });
});

describe('filterExpired', () => {
  it('keeps only expired announcements', () => {
    const active  = makeAnnouncement({ id: 'a1', expires_at: null });
    const expired = makeAnnouncement({ id: 'a2', expires_at: PAST });
    const result  = filterExpired([active, expired], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a2');
  });
});

// ─── sortByNewest ────────────────────────────────────────────────────────────

describe('sortByNewest', () => {
  it('sorts newest first', () => {
    const older  = makeAnnouncement({ id: 'a1', created_at: '2026-04-01T00:00:00.000Z' });
    const newer  = makeAnnouncement({ id: 'a2', created_at: '2026-04-14T00:00:00.000Z' });
    const result = sortByNewest([older, newer]);
    expect(result[0].id).toBe('a2');
    expect(result[1].id).toBe('a1');
  });

  it('does not mutate original array', () => {
    const older = makeAnnouncement({ id: 'a1', created_at: '2026-04-01T00:00:00.000Z' });
    const newer = makeAnnouncement({ id: 'a2', created_at: '2026-04-14T00:00:00.000Z' });
    const orig  = [older, newer];
    sortByNewest(orig);
    expect(orig[0].id).toBe('a1');
  });
});

// ─── timeUntilExpiry ─────────────────────────────────────────────────────────

describe('timeUntilExpiry', () => {
  it('returns "No expiry" when expires_at is null', () => {
    const a = makeAnnouncement({ expires_at: null });
    expect(timeUntilExpiry(a, NOW)).toBe('No expiry');
  });

  it('returns "Expired" when past expires_at', () => {
    const a = makeAnnouncement({ expires_at: PAST });
    expect(timeUntilExpiry(a, NOW)).toBe('Expired');
  });

  it('returns days-remaining label when in future', () => {
    const soon = new Date(NOW);
    soon.setDate(soon.getDate() + 5);
    const a = makeAnnouncement({ expires_at: soon.toISOString() });
    expect(timeUntilExpiry(a, NOW)).toBe('Expires in 5 days');
  });
});

// ─── countActive ─────────────────────────────────────────────────────────────

describe('countActive', () => {
  it('returns 0 for empty array', () => {
    expect(countActive([], NOW)).toBe(0);
  });

  it('counts only active announcements', () => {
    const list = [
      makeAnnouncement({ id: 'a1', expires_at: null }),
      makeAnnouncement({ id: 'a2', expires_at: PAST }),
      makeAnnouncement({ id: 'a3', expires_at: FUTURE }),
    ];
    expect(countActive(list, NOW)).toBe(2);
  });
});

// ─── hasAnnouncements / hasActiveAnnouncements ───────────────────────────────

describe('hasAnnouncements', () => {
  it('returns false for empty array', () => {
    expect(hasAnnouncements([])).toBe(false);
  });

  it('returns true for non-empty array', () => {
    expect(hasAnnouncements([makeAnnouncement()])).toBe(true);
  });
});

describe('hasActiveAnnouncements', () => {
  it('returns false when all expired', () => {
    const list = [makeAnnouncement({ expires_at: PAST })];
    expect(hasActiveAnnouncements(list, NOW)).toBe(false);
  });

  it('returns true when at least one is active', () => {
    const list = [
      makeAnnouncement({ id: 'a1', expires_at: PAST }),
      makeAnnouncement({ id: 'a2', expires_at: null }),
    ];
    expect(hasActiveAnnouncements(list, NOW)).toBe(true);
  });
});

// ─── truncateBody ────────────────────────────────────────────────────────────

describe('truncateBody', () => {
  it('returns original string when within limit', () => {
    expect(truncateBody('Hello!', 120)).toBe('Hello!');
  });

  it('truncates and appends ellipsis when over limit', () => {
    const text = 'x'.repeat(130);
    const result = truncateBody(text, 120);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(120);
  });
});

// ─── buildAnnouncementShareText ──────────────────────────────────────────────

describe('buildAnnouncementShareText', () => {
  it('formats title and body', () => {
    const a = makeAnnouncement({ title: 'No practice', body: 'Field is closed.' });
    expect(buildAnnouncementShareText(a)).toBe('📢 No practice\n\nField is closed.');
  });
});

// ─── getLatestActive ─────────────────────────────────────────────────────────

describe('getLatestActive', () => {
  it('returns null for empty array', () => {
    expect(getLatestActive([], NOW)).toBeNull();
  });

  it('returns most recent active announcement', () => {
    const older = makeAnnouncement({ id: 'a1', created_at: '2026-04-01T00:00:00.000Z' });
    const newer = makeAnnouncement({ id: 'a2', created_at: '2026-04-14T00:00:00.000Z' });
    expect(getLatestActive([older, newer], NOW)?.id).toBe('a2');
  });

  it('skips expired announcements', () => {
    const expired = makeAnnouncement({ id: 'a1', created_at: '2026-04-14T00:00:00.000Z', expires_at: PAST });
    const active  = makeAnnouncement({ id: 'a2', created_at: '2026-04-01T00:00:00.000Z', expires_at: null });
    expect(getLatestActive([expired, active], NOW)?.id).toBe('a2');
  });
});
