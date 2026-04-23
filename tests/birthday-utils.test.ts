import { describe, it, expect } from 'vitest';
import {
  isValidDob,
  parseDobMonthDay,
  hasDob,
  playersWithDob,
  getDaysUntilBirthday,
  isBirthdayToday,
  isBirthdaySoon,
  getAgeThisBirthday,
  filterBirthdaysToday,
  filterUpcomingBirthdays,
  filterAllUpcomingBirthdays,
  hasUpcomingBirthdays,
  countBirthdaysToday,
  countUpcomingBirthdays,
  sortByUpcomingBirthday,
  formatBirthdayLabel,
  buildBirthdayMessage,
  buildBirthdayShareText,
  buildWhatsAppUrl,
  buildBirthdayWhatsAppUrl,
  getBirthdayDismissKey,
  type BirthdayPlayer,
} from '@/lib/birthday-utils';

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const TODAY = new Date(2025, 5, 15); // June 15 2025 (month is 0-based)
const TEAM = 'team-abc';

function makePlayer(overrides: Partial<BirthdayPlayer> = {}): BirthdayPlayer {
  return {
    id: 'p1',
    name: 'Marcus',
    date_of_birth: null,
    parent_name: 'James',
    parent_phone: '+15551234567',
    ...overrides,
  };
}

// ─── isValidDob ───────────────────────────────────────────────────────────────

describe('isValidDob', () => {
  it('accepts a well-formed date', () => {
    expect(isValidDob('2015-06-15')).toBe(true);
  });
  it('accepts leap day', () => {
    expect(isValidDob('2000-02-29')).toBe(true);
  });
  it('rejects non-leap year Feb 29', () => {
    expect(isValidDob('2001-02-29')).toBe(false);
  });
  it('rejects empty string', () => {
    expect(isValidDob('')).toBe(false);
  });
  it('rejects null-like', () => {
    expect(isValidDob(null as any)).toBe(false);
  });
  it('rejects wrong format', () => {
    expect(isValidDob('15/06/2015')).toBe(false);
  });
  it('rejects invalid month 13', () => {
    expect(isValidDob('2015-13-01')).toBe(false);
  });
  it('rejects invalid day 32', () => {
    expect(isValidDob('2015-06-32')).toBe(false);
  });
  it('rejects day 0', () => {
    expect(isValidDob('2015-06-00')).toBe(false);
  });
});

// ─── parseDobMonthDay ─────────────────────────────────────────────────────────

describe('parseDobMonthDay', () => {
  it('parses month and day correctly', () => {
    expect(parseDobMonthDay('2015-06-15')).toEqual({ month: 6, day: 15 });
  });
  it('parses Jan 1', () => {
    expect(parseDobMonthDay('2000-01-01')).toEqual({ month: 1, day: 1 });
  });
  it('returns null for invalid dob', () => {
    expect(parseDobMonthDay('bad-date')).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(parseDobMonthDay('')).toBeNull();
  });
  it('parses Dec 31', () => {
    expect(parseDobMonthDay('2010-12-31')).toEqual({ month: 12, day: 31 });
  });
});

// ─── hasDob / playersWithDob ──────────────────────────────────────────────────

describe('hasDob', () => {
  it('returns true when valid dob set', () => {
    expect(hasDob(makePlayer({ date_of_birth: '2015-06-15' }))).toBe(true);
  });
  it('returns false when null', () => {
    expect(hasDob(makePlayer({ date_of_birth: null }))).toBe(false);
  });
  it('returns false when invalid', () => {
    expect(hasDob(makePlayer({ date_of_birth: 'bad' }))).toBe(false);
  });
});

describe('playersWithDob', () => {
  it('filters to only those with valid dob', () => {
    const players = [
      makePlayer({ id: 'p1', date_of_birth: '2015-06-15' }),
      makePlayer({ id: 'p2', date_of_birth: null }),
      makePlayer({ id: 'p3', date_of_birth: 'invalid' }),
    ];
    const result = playersWithDob(players);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });
  it('returns empty array when none have dob', () => {
    expect(playersWithDob([makePlayer()])).toHaveLength(0);
  });
});

// ─── getDaysUntilBirthday ─────────────────────────────────────────────────────

describe('getDaysUntilBirthday', () => {
  it('returns 0 when birthday is today', () => {
    // Today = June 15 2025, DOB month-day = June 15
    expect(getDaysUntilBirthday('2013-06-15', TODAY)).toBe(0);
  });
  it('returns 1 when birthday is tomorrow', () => {
    expect(getDaysUntilBirthday('2013-06-16', TODAY)).toBe(1);
  });
  it('returns 7 when birthday is in 7 days', () => {
    expect(getDaysUntilBirthday('2013-06-22', TODAY)).toBe(7);
  });
  it('rolls over to next year when birthday already passed this year', () => {
    // Today is June 15; Jan 1 birthday was earlier this year → counts to Jan 1 next year
    const daysToJan1 = getDaysUntilBirthday('2013-01-01', TODAY);
    // From June 15 to Jan 1 next year: 30d+31+31+30+31+30+1 = let's just check >0 and <366
    expect(daysToJan1).toBeGreaterThan(0);
    expect(daysToJan1).toBeLessThan(366);
  });
  it('returns 365 for invalid dob', () => {
    expect(getDaysUntilBirthday('bad-date', TODAY)).toBe(365);
  });
  it('handles year boundary (Dec 31 today, Jan 1 tomorrow)', () => {
    const dec31 = new Date(2025, 11, 31);
    expect(getDaysUntilBirthday('2010-01-01', dec31)).toBe(1);
  });
  it('handles Dec 31 birthday from early in year', () => {
    const jan10 = new Date(2025, 0, 10);
    expect(getDaysUntilBirthday('2010-12-31', jan10)).toBeGreaterThan(350);
  });
});

// ─── isBirthdayToday ──────────────────────────────────────────────────────────

describe('isBirthdayToday', () => {
  it('returns true when birthday matches today', () => {
    expect(isBirthdayToday('2013-06-15', TODAY)).toBe(true);
  });
  it('returns false for tomorrow', () => {
    expect(isBirthdayToday('2013-06-16', TODAY)).toBe(false);
  });
  it('returns false for yesterday', () => {
    expect(isBirthdayToday('2013-06-14', TODAY)).toBe(false);
  });
  it('returns false for invalid dob', () => {
    expect(isBirthdayToday('not-a-date', TODAY)).toBe(false);
  });
});

// ─── isBirthdaySoon ───────────────────────────────────────────────────────────

describe('isBirthdaySoon', () => {
  it('returns true for birthday today (within 7)', () => {
    expect(isBirthdaySoon('2013-06-15', 7, TODAY)).toBe(true);
  });
  it('returns true for birthday in 3 days (within 7)', () => {
    expect(isBirthdaySoon('2013-06-18', 7, TODAY)).toBe(true);
  });
  it('returns true on the boundary day', () => {
    expect(isBirthdaySoon('2013-06-22', 7, TODAY)).toBe(true);
  });
  it('returns false just beyond boundary', () => {
    expect(isBirthdaySoon('2013-06-23', 7, TODAY)).toBe(false);
  });
  it('returns false for invalid dob', () => {
    expect(isBirthdaySoon('bad', 7, TODAY)).toBe(false);
  });
});

// ─── getAgeThisBirthday ───────────────────────────────────────────────────────

describe('getAgeThisBirthday', () => {
  it('returns correct age when birthday is today', () => {
    // Born June 15 2013, today June 15 2025 → turns 12
    expect(getAgeThisBirthday('2013-06-15', TODAY)).toBe(12);
  });
  it('returns correct age for upcoming birthday', () => {
    // Born June 20 2013, birthday is in 5 days → next birthday year 2025, age = 12
    expect(getAgeThisBirthday('2013-06-20', TODAY)).toBe(12);
  });
  it('returns correct age for birthday already passed this year (next year)', () => {
    // Born June 10 2013, today June 15. Birthday passed. Next year 2026 → turns 13
    expect(getAgeThisBirthday('2013-06-10', TODAY)).toBe(13);
  });
  it('returns null for invalid dob', () => {
    expect(getAgeThisBirthday('bad', TODAY)).toBeNull();
  });
});

// ─── filterBirthdaysToday ─────────────────────────────────────────────────────

describe('filterBirthdaysToday', () => {
  it('returns only players with birthday today', () => {
    const players = [
      makePlayer({ id: 'p1', date_of_birth: '2013-06-15' }), // today
      makePlayer({ id: 'p2', date_of_birth: '2013-06-16' }), // tomorrow
      makePlayer({ id: 'p3', date_of_birth: null }),
    ];
    const result = filterBirthdaysToday(players, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });
  it('returns empty when no birthdays today', () => {
    const players = [makePlayer({ date_of_birth: '2013-06-20' })];
    expect(filterBirthdaysToday(players, TODAY)).toHaveLength(0);
  });
});

// ─── filterUpcomingBirthdays ──────────────────────────────────────────────────

describe('filterUpcomingBirthdays', () => {
  it('returns players with birthdays in range (exclusive of today)', () => {
    const players = [
      makePlayer({ id: 'p1', date_of_birth: '2013-06-15' }), // today — excluded
      makePlayer({ id: 'p2', date_of_birth: '2013-06-16' }), // 1 day — included
      makePlayer({ id: 'p3', date_of_birth: '2013-06-22' }), // 7 days — included
      makePlayer({ id: 'p4', date_of_birth: '2013-06-23' }), // 8 days — excluded
    ];
    const result = filterUpcomingBirthdays(players, 7, TODAY);
    expect(result.map((p) => p.id)).toEqual(['p2', 'p3']);
  });
  it('returns empty when all are today or beyond range', () => {
    const players = [
      makePlayer({ date_of_birth: '2013-06-15' }), // today
      makePlayer({ date_of_birth: '2013-06-25' }), // 10 days
    ];
    expect(filterUpcomingBirthdays(players, 7, TODAY)).toHaveLength(0);
  });
});

// ─── filterAllUpcomingBirthdays ───────────────────────────────────────────────

describe('filterAllUpcomingBirthdays', () => {
  it('includes today and future within range', () => {
    const players = [
      makePlayer({ id: 'p1', date_of_birth: '2013-06-15' }), // today
      makePlayer({ id: 'p2', date_of_birth: '2013-06-20' }), // 5 days
      makePlayer({ id: 'p3', date_of_birth: '2013-06-23' }), // 8 days — excluded
    ];
    const result = filterAllUpcomingBirthdays(players, 7, TODAY);
    expect(result.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});

// ─── hasUpcomingBirthdays / count ─────────────────────────────────────────────

describe('hasUpcomingBirthdays', () => {
  it('returns true when there is a birthday today', () => {
    const players = [makePlayer({ date_of_birth: '2013-06-15' })];
    expect(hasUpcomingBirthdays(players, 7, TODAY)).toBe(true);
  });
  it('returns false when no upcoming birthdays', () => {
    const players = [makePlayer({ date_of_birth: '2013-07-01' })];
    expect(hasUpcomingBirthdays(players, 7, TODAY)).toBe(false);
  });
  it('returns false for empty list', () => {
    expect(hasUpcomingBirthdays([], 7, TODAY)).toBe(false);
  });
});

describe('countBirthdaysToday', () => {
  it('counts multiple birthdays today', () => {
    const players = [
      makePlayer({ id: 'p1', date_of_birth: '2013-06-15' }),
      makePlayer({ id: 'p2', date_of_birth: '2014-06-15' }),
      makePlayer({ id: 'p3', date_of_birth: '2013-06-16' }),
    ];
    expect(countBirthdaysToday(players, TODAY)).toBe(2);
  });
  it('returns 0 when none today', () => {
    expect(countBirthdaysToday([makePlayer()], TODAY)).toBe(0);
  });
});

describe('countUpcomingBirthdays', () => {
  it('counts birthdays strictly after today within range', () => {
    const players = [
      makePlayer({ id: 'p1', date_of_birth: '2013-06-15' }), // today excluded
      makePlayer({ id: 'p2', date_of_birth: '2013-06-17' }), // 2 days
      makePlayer({ id: 'p3', date_of_birth: '2013-06-22' }), // 7 days
    ];
    expect(countUpcomingBirthdays(players, 7, TODAY)).toBe(2);
  });
});

// ─── sortByUpcomingBirthday ───────────────────────────────────────────────────

describe('sortByUpcomingBirthday', () => {
  it('sorts players by days until birthday (soonest first)', () => {
    const players = [
      makePlayer({ id: 'p3', date_of_birth: '2013-06-22' }), // 7 days
      makePlayer({ id: 'p1', date_of_birth: '2013-06-15' }), // 0 days (today)
      makePlayer({ id: 'p2', date_of_birth: '2013-06-16' }), // 1 day
    ];
    const sorted = sortByUpcomingBirthday(players, TODAY);
    expect(sorted.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
  it('pushes players without dob to the end', () => {
    const players = [
      makePlayer({ id: 'noDob', date_of_birth: null }),
      makePlayer({ id: 'hasDob', date_of_birth: '2013-06-16' }),
    ];
    const sorted = sortByUpcomingBirthday(players, TODAY);
    expect(sorted[0].id).toBe('hasDob');
    expect(sorted[1].id).toBe('noDob');
  });
  it('does not mutate the original array', () => {
    const players = [
      makePlayer({ id: 'a', date_of_birth: '2013-06-20' }),
      makePlayer({ id: 'b', date_of_birth: '2013-06-16' }),
    ];
    const original = [...players];
    sortByUpcomingBirthday(players, TODAY);
    expect(players[0].id).toBe('a');
    expect(original[0].id).toBe('a');
  });
});

// ─── formatBirthdayLabel ──────────────────────────────────────────────────────

describe('formatBirthdayLabel', () => {
  it('returns "Today!" for birthday today', () => {
    expect(formatBirthdayLabel('2013-06-15', TODAY)).toBe('Today!');
  });
  it('returns "Tomorrow" for birthday tomorrow', () => {
    expect(formatBirthdayLabel('2013-06-16', TODAY)).toBe('Tomorrow');
  });
  it('returns "in X days" for 2-6 days away', () => {
    expect(formatBirthdayLabel('2013-06-18', TODAY)).toBe('in 3 days');
    expect(formatBirthdayLabel('2013-06-21', TODAY)).toBe('in 6 days');
  });
  it('returns "Mon DD" format for 7+ days away', () => {
    expect(formatBirthdayLabel('2013-06-22', TODAY)).toBe('Jun 22');
  });
  it('handles cross-month boundaries', () => {
    expect(formatBirthdayLabel('2013-07-01', TODAY)).toBe('Jul 1');
  });
  it('returns empty string for invalid dob', () => {
    expect(formatBirthdayLabel('bad', TODAY)).toBe('');
  });
});

// ─── buildBirthdayMessage ─────────────────────────────────────────────────────

describe('buildBirthdayMessage', () => {
  it('includes player name and team name', () => {
    const msg = buildBirthdayMessage('Marcus', 12, 'Tigers U12');
    expect(msg).toContain('Marcus');
    expect(msg).toContain('Tigers U12');
  });
  it('includes age when provided', () => {
    const msg = buildBirthdayMessage('Marcus', 12, 'Tigers');
    expect(msg).toContain('turns 12');
  });
  it('omits age clause when null', () => {
    const msg = buildBirthdayMessage('Sofia', null, 'Wolves');
    expect(msg).not.toContain('turns');
    expect(msg).toContain('Sofia');
  });
  it('includes birthday emoji', () => {
    const msg = buildBirthdayMessage('Jay', 10, 'Eagles');
    expect(msg).toContain('🎂');
  });
});

// ─── buildBirthdayShareText ───────────────────────────────────────────────────

describe('buildBirthdayShareText', () => {
  it('matches buildBirthdayMessage output', () => {
    const msg = buildBirthdayMessage('Marcus', 12, 'Tigers');
    const share = buildBirthdayShareText('Marcus', 12, 'Tigers');
    expect(share).toBe(msg);
  });
});

// ─── buildWhatsAppUrl ─────────────────────────────────────────────────────────

describe('buildWhatsAppUrl', () => {
  it('builds a valid wa.me URL', () => {
    const url = buildWhatsAppUrl('+1 555-123-4567', 'Hello!');
    expect(url).toContain('wa.me/15551234567');
    expect(url).toContain(encodeURIComponent('Hello!'));
  });
  it('strips non-digit chars from phone', () => {
    const url = buildWhatsAppUrl('(555) 123-4567', 'Hi');
    expect(url).toContain('wa.me/5551234567');
  });
  it('encodes special chars in message', () => {
    const url = buildWhatsAppUrl('555', 'Hi & bye');
    expect(url).toContain(encodeURIComponent('Hi & bye'));
  });
});

// ─── buildBirthdayWhatsAppUrl ─────────────────────────────────────────────────

describe('buildBirthdayWhatsAppUrl', () => {
  it('returns a wa.me URL when player has phone and dob', () => {
    const player = makePlayer({ date_of_birth: '2013-06-15', parent_phone: '+15551234567' });
    const url = buildBirthdayWhatsAppUrl(player, 'Tigers', TODAY);
    expect(url).not.toBeNull();
    expect(url).toContain('wa.me/');
  });
  it('returns null when parent_phone is null', () => {
    const player = makePlayer({ date_of_birth: '2013-06-15', parent_phone: null });
    expect(buildBirthdayWhatsAppUrl(player, 'Tigers', TODAY)).toBeNull();
  });
  it('returns null when date_of_birth is null', () => {
    const player = makePlayer({ date_of_birth: null, parent_phone: '+15551234567' });
    expect(buildBirthdayWhatsAppUrl(player, 'Tigers', TODAY)).toBeNull();
  });
});

// ─── getBirthdayDismissKey ────────────────────────────────────────────────────

describe('getBirthdayDismissKey', () => {
  it('includes team ID', () => {
    const key = getBirthdayDismissKey('team-123', TODAY);
    expect(key).toContain('team-123');
  });
  it('includes the date', () => {
    const key = getBirthdayDismissKey('team-abc', TODAY);
    expect(key).toContain('2025-06-15');
  });
  it('changes on different days', () => {
    const day1 = getBirthdayDismissKey('team-abc', new Date(2025, 5, 15));
    const day2 = getBirthdayDismissKey('team-abc', new Date(2025, 5, 16));
    expect(day1).not.toBe(day2);
  });
  it('changes for different teams', () => {
    const t1 = getBirthdayDismissKey('team-1', TODAY);
    const t2 = getBirthdayDismissKey('team-2', TODAY);
    expect(t1).not.toBe(t2);
  });
  it('has expected format prefix', () => {
    const key = getBirthdayDismissKey('abc', TODAY);
    expect(key).toMatch(/^birthday-dismiss:/);
  });
});
