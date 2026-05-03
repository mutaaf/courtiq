import { describe, it, expect } from 'vitest';
import {
  buildCalendarTitle,
  buildCalendarDescription,
  parseTime,
  toICSDateTime,
  addMinutesToDateTime,
  getSessionEnd,
  isAllDaySession,
  generateICSContent,
  buildGoogleCalendarUrl,
  getCalendarFileName,
} from '../src/lib/calendar-utils';

// Minimal session factory
function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abc-123',
    type: 'practice',
    date: '2025-05-05',
    start_time: '17:00',
    end_time: null,
    location: null,
    opponent: null,
    notes: null,
    ...overrides,
  } as Parameters<typeof generateICSContent>[0];
}

// ─── buildCalendarTitle ───────────────────────────────────────────────────────

describe('buildCalendarTitle', () => {
  it('returns type label for a basic session', () => {
    expect(buildCalendarTitle({ type: 'practice', opponent: null })).toBe('Practice');
  });

  it('appends team name when provided', () => {
    expect(buildCalendarTitle({ type: 'practice', opponent: null }, 'YMCA Rockets')).toBe(
      'Practice — YMCA Rockets',
    );
  });

  it('appends opponent for a game', () => {
    expect(buildCalendarTitle({ type: 'game', opponent: 'Lincoln' })).toBe('Game vs Lincoln');
  });

  it('includes both opponent and team name', () => {
    expect(
      buildCalendarTitle({ type: 'game', opponent: 'Lincoln' }, 'YMCA Rockets'),
    ).toBe('Game vs Lincoln — YMCA Rockets');
  });

  it('handles tournament type', () => {
    expect(buildCalendarTitle({ type: 'tournament', opponent: null })).toBe('Tournament');
  });

  it('handles scrimmage type', () => {
    expect(buildCalendarTitle({ type: 'scrimmage', opponent: 'East Side' })).toBe(
      'Scrimmage vs East Side',
    );
  });

  it('handles training type', () => {
    expect(buildCalendarTitle({ type: 'training', opponent: null })).toBe('Training');
  });

  it('falls back to raw type for unknown types', () => {
    expect(buildCalendarTitle({ type: 'unknown_type' as any, opponent: null })).toBe(
      'unknown_type',
    );
  });

  it('omits team name when null', () => {
    expect(buildCalendarTitle({ type: 'practice', opponent: null }, null)).toBe('Practice');
  });

  it('omits team name when undefined', () => {
    expect(buildCalendarTitle({ type: 'practice', opponent: null }, undefined)).toBe('Practice');
  });
});

// ─── buildCalendarDescription ─────────────────────────────────────────────────

describe('buildCalendarDescription', () => {
  it('always includes SportsIQ branding', () => {
    const desc = buildCalendarDescription({ type: 'practice', opponent: null, location: null, notes: null });
    expect(desc).toContain('SportsIQ');
  });

  it('includes team name when provided', () => {
    const desc = buildCalendarDescription(
      { type: 'practice', opponent: null, location: null, notes: null },
      'YMCA Rockets',
    );
    expect(desc).toContain('YMCA Rockets');
  });

  it('includes opponent when present', () => {
    const desc = buildCalendarDescription({
      type: 'game',
      opponent: 'Lincoln',
      location: null,
      notes: null,
    });
    expect(desc).toContain('Lincoln');
  });

  it('includes location when present', () => {
    const desc = buildCalendarDescription({
      type: 'practice',
      opponent: null,
      location: 'Northside Gym',
      notes: null,
    });
    expect(desc).toContain('Northside Gym');
  });
});

// ─── parseTime ────────────────────────────────────────────────────────────────

describe('parseTime', () => {
  it('parses HH:MM format', () => {
    expect(parseTime('17:00')).toEqual({ hours: 17, minutes: 0 });
  });

  it('parses single-digit hours', () => {
    expect(parseTime('9:30')).toEqual({ hours: 9, minutes: 30 });
  });

  it('parses midnight', () => {
    expect(parseTime('00:00')).toEqual({ hours: 0, minutes: 0 });
  });

  it('parses HH:MM:SS format', () => {
    expect(parseTime('17:00:00')).toEqual({ hours: 17, minutes: 0 });
  });

  it('returns null for invalid input', () => {
    expect(parseTime('invalid')).toBeNull();
  });

  it('returns null for hours > 23', () => {
    expect(parseTime('25:00')).toBeNull();
  });

  it('returns null for minutes > 59', () => {
    expect(parseTime('12:60')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTime('')).toBeNull();
  });
});

// ─── toICSDateTime ────────────────────────────────────────────────────────────

describe('toICSDateTime', () => {
  it('formats date + time as ICS timestamp', () => {
    expect(toICSDateTime('2025-05-05', '17:00')).toBe('20250505T170000');
  });

  it('returns date-only string when time is null', () => {
    expect(toICSDateTime('2025-05-05', null)).toBe('20250505');
  });

  it('pads hours and minutes correctly', () => {
    expect(toICSDateTime('2025-01-03', '09:05')).toBe('20250103T090500');
  });

  it('handles midnight', () => {
    expect(toICSDateTime('2025-12-31', '00:00')).toBe('20251231T000000');
  });

  it('returns date-only when time is unparseable', () => {
    expect(toICSDateTime('2025-05-05', 'bad')).toBe('20250505');
  });
});

// ─── addMinutesToDateTime ─────────────────────────────────────────────────────

describe('addMinutesToDateTime', () => {
  it('adds minutes within the same hour', () => {
    const result = addMinutesToDateTime('2025-05-05', '17:00', 30);
    expect(result).toEqual({ date: '2025-05-05', time: '17:30' });
  });

  it('adds 60 minutes (default session duration)', () => {
    const result = addMinutesToDateTime('2025-05-05', '17:00', 60);
    expect(result).toEqual({ date: '2025-05-05', time: '18:00' });
  });

  it('wraps across midnight', () => {
    const result = addMinutesToDateTime('2025-05-05', '23:30', 60);
    expect(result.time).toBe('00:30');
    expect(result.date).toBe('2025-05-06');
  });

  it('handles null time (adds minutes from midnight)', () => {
    const result = addMinutesToDateTime('2025-05-05', null, 60);
    expect(result.time).toBe('01:00');
  });

  it('adds 90 minutes spanning an hour boundary', () => {
    const result = addMinutesToDateTime('2025-05-05', '16:30', 90);
    expect(result).toEqual({ date: '2025-05-05', time: '18:00' });
  });
});

// ─── getSessionEnd ────────────────────────────────────────────────────────────

describe('getSessionEnd', () => {
  it('uses end_time when present', () => {
    const s = { date: '2025-05-05', start_time: '17:00', end_time: '18:30' };
    expect(getSessionEnd(s)).toEqual({ date: '2025-05-05', time: '18:30' });
  });

  it('defaults to start + 60 min when no end_time', () => {
    const s = { date: '2025-05-05', start_time: '17:00', end_time: null };
    expect(getSessionEnd(s)).toEqual({ date: '2025-05-05', time: '18:00' });
  });

  it('advances date for all-day event (no start_time)', () => {
    const s = { date: '2025-05-05', start_time: null, end_time: null };
    const result = getSessionEnd(s);
    expect(result.date).toBe('2025-05-06');
    expect(result.time).toBeNull();
  });
});

// ─── isAllDaySession ──────────────────────────────────────────────────────────

describe('isAllDaySession', () => {
  it('returns true when start_time is null', () => {
    expect(isAllDaySession({ start_time: null })).toBe(true);
  });

  it('returns false when start_time is set', () => {
    expect(isAllDaySession({ start_time: '17:00' })).toBe(false);
  });
});

// ─── generateICSContent ───────────────────────────────────────────────────────

describe('generateICSContent', () => {
  it('contains required ICS structure', () => {
    const content = generateICSContent(makeSession());
    expect(content).toContain('BEGIN:VCALENDAR');
    expect(content).toContain('BEGIN:VEVENT');
    expect(content).toContain('END:VEVENT');
    expect(content).toContain('END:VCALENDAR');
  });

  it('contains the session title as SUMMARY', () => {
    const content = generateICSContent(makeSession(), 'YMCA Rockets');
    expect(content).toContain('SUMMARY:Practice — YMCA Rockets');
  });

  it('contains DTSTART with correct value for timed session', () => {
    const content = generateICSContent(makeSession({ date: '2025-05-05', start_time: '17:00' }));
    expect(content).toContain('DTSTART:20250505T170000');
  });

  it('uses VALUE=DATE format for all-day sessions', () => {
    const content = generateICSContent(makeSession({ start_time: null }));
    expect(content).toContain('DTSTART;VALUE=DATE:');
    expect(content).not.toContain('DTSTART:2');
  });

  it('contains LOCATION when present', () => {
    const content = generateICSContent(makeSession({ location: 'Northside Gym' }));
    expect(content).toContain('LOCATION:Northside Gym');
  });

  it('omits LOCATION when absent', () => {
    const content = generateICSContent(makeSession({ location: null }));
    expect(content).not.toContain('LOCATION:');
  });

  it('uses UID with session id', () => {
    const content = generateICSContent(makeSession({ id: 'xyz-789' }));
    expect(content).toContain('UID:sportsiq-xyz-789@sportsiq.app');
  });

  it('uses CRLF line endings', () => {
    const content = generateICSContent(makeSession());
    expect(content).toContain('\r\n');
  });
});

// ─── buildGoogleCalendarUrl ───────────────────────────────────────────────────

describe('buildGoogleCalendarUrl', () => {
  it('starts with Google Calendar render URL', () => {
    const url = buildGoogleCalendarUrl(makeSession());
    expect(url).toContain('https://www.google.com/calendar/render');
  });

  it('contains action=TEMPLATE', () => {
    const url = buildGoogleCalendarUrl(makeSession());
    expect(url).toContain('action=TEMPLATE');
  });

  it('encodes the session title in the text param', () => {
    const url = buildGoogleCalendarUrl(makeSession(), 'YMCA Rockets');
    const params = new URL(url).searchParams;
    expect(params.get('text')).toBe('Practice — YMCA Rockets');
  });

  it('contains dates param with correct format', () => {
    const url = buildGoogleCalendarUrl(
      makeSession({ date: '2025-05-05', start_time: '17:00', end_time: '18:00' }),
    );
    const params = new URL(url).searchParams;
    expect(params.get('dates')).toBe('20250505T170000/20250505T180000');
  });

  it('includes location param when present', () => {
    const url = buildGoogleCalendarUrl(makeSession({ location: 'Northside Gym' }));
    const params = new URL(url).searchParams;
    expect(params.get('location')).toBe('Northside Gym');
  });

  it('omits location param when absent', () => {
    const url = buildGoogleCalendarUrl(makeSession({ location: null }));
    const params = new URL(url).searchParams;
    expect(params.get('location')).toBeNull();
  });
});

// ─── getCalendarFileName ──────────────────────────────────────────────────────

describe('getCalendarFileName', () => {
  it('ends with .ics', () => {
    const name = getCalendarFileName({ type: 'practice', date: '2025-05-05', opponent: null });
    expect(name).toMatch(/\.ics$/);
  });

  it('replaces spaces and special chars with underscores', () => {
    const name = getCalendarFileName(
      { type: 'game', date: '2025-05-05', opponent: 'Lincoln' },
      'YMCA Rockets',
    );
    expect(name).not.toMatch(/[\s—]/);
  });

  it('is lowercase', () => {
    const name = getCalendarFileName({ type: 'practice', date: '2025-05-05', opponent: null });
    expect(name).toBe(name.toLowerCase());
  });
});
