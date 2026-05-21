import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SESSION_EMOJI,
  SESSION_LABEL,
  formatSessionDate,
  isCompetitiveSession,
  getSessionEmoji,
  getSessionLabel,
} from '@/lib/upcoming-session-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pin `new Date()` so Today/Tomorrow labels are deterministic. */
function mockToday(isoDate: string) {
  const fixed = new Date(`${isoDate}T12:00:00`);
  vi.useFakeTimers();
  vi.setSystemTime(fixed);
}

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// SESSION_EMOJI / SESSION_LABEL maps
// ---------------------------------------------------------------------------

describe('SESSION_EMOJI', () => {
  it('covers all five session types', () => {
    expect(Object.keys(SESSION_EMOJI)).toEqual(
      expect.arrayContaining(['practice', 'game', 'scrimmage', 'tournament', 'training'])
    );
  });

  it('returns distinct emojis for each type', () => {
    const values = Object.values(SESSION_EMOJI);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('SESSION_LABEL', () => {
  it('covers all five session types', () => {
    expect(Object.keys(SESSION_LABEL)).toEqual(
      expect.arrayContaining(['practice', 'game', 'scrimmage', 'tournament', 'training'])
    );
  });

  it('labels are Title Case strings', () => {
    for (const label of Object.values(SESSION_LABEL)) {
      expect(label[0]).toBe(label[0].toUpperCase());
    }
  });
});

// ---------------------------------------------------------------------------
// formatSessionDate — day label
// ---------------------------------------------------------------------------

describe('formatSessionDate — day labels', () => {
  it('returns "Today" when the date matches today', () => {
    mockToday('2026-05-20');
    expect(formatSessionDate('2026-05-20', null)).toBe('Today');
  });

  it('returns "Tomorrow" when the date is one day ahead', () => {
    mockToday('2026-05-20');
    expect(formatSessionDate('2026-05-21', null)).toBe('Tomorrow');
  });

  it('returns a weekday label for dates further in the future', () => {
    mockToday('2026-05-20');
    const label = formatSessionDate('2026-05-25', null); // Monday
    expect(label).toMatch(/Monday/);
    expect(label).toMatch(/May/);
    expect(label).toMatch(/25/);
  });

  it('does not return "Today" or "Tomorrow" for two days out', () => {
    mockToday('2026-05-20');
    const label = formatSessionDate('2026-05-22', null);
    expect(label).not.toBe('Today');
    expect(label).not.toBe('Tomorrow');
  });
});

// ---------------------------------------------------------------------------
// formatSessionDate — time formatting
// ---------------------------------------------------------------------------

describe('formatSessionDate — time formatting', () => {
  it('returns only the day label when timeStr is null', () => {
    mockToday('2026-05-20');
    expect(formatSessionDate('2026-05-20', null)).toBe('Today');
  });

  it('suppresses :00 minutes on the hour (renders "4 PM" not "4:00 PM")', () => {
    mockToday('2026-05-20');
    expect(formatSessionDate('2026-05-20', '16:00:00')).toBe('Today · 4 PM');
  });

  it('includes minutes when they are non-zero', () => {
    mockToday('2026-05-20');
    expect(formatSessionDate('2026-05-20', '16:30')).toBe('Today · 4:30 PM');
  });

  it('pads single-digit minutes with a leading zero', () => {
    mockToday('2026-05-20');
    expect(formatSessionDate('2026-05-20', '09:05')).toBe('Today · 9:05 AM');
  });

  it('converts noon (12:00) correctly', () => {
    mockToday('2026-05-20');
    expect(formatSessionDate('2026-05-20', '12:00')).toBe('Today · 12 PM');
  });

  it('converts midnight (00:00) correctly', () => {
    mockToday('2026-05-20');
    expect(formatSessionDate('2026-05-20', '00:00')).toBe('Today · 12 AM');
  });

  it('converts a morning time correctly (AM)', () => {
    mockToday('2026-05-20');
    expect(formatSessionDate('2026-05-21', '10:30')).toBe('Tomorrow · 10:30 AM');
  });

  it('converts an afternoon time correctly (PM)', () => {
    mockToday('2026-05-20');
    expect(formatSessionDate('2026-05-21', '14:00')).toBe('Tomorrow · 2 PM');
  });

  it('handles "HH:MM:SS" format (with seconds)', () => {
    mockToday('2026-05-20');
    // seconds are ignored — only HH:MM matter
    expect(formatSessionDate('2026-05-20', '18:45:00')).toBe('Today · 6:45 PM');
  });
});

// ---------------------------------------------------------------------------
// isCompetitiveSession
// ---------------------------------------------------------------------------

describe('isCompetitiveSession', () => {
  it.each(['game', 'scrimmage', 'tournament'])(
    'returns true for "%s"',
    (type) => expect(isCompetitiveSession(type)).toBe(true)
  );

  it.each(['practice', 'training', 'unknown'])(
    'returns false for "%s"',
    (type) => expect(isCompetitiveSession(type)).toBe(false)
  );
});

// ---------------------------------------------------------------------------
// getSessionEmoji / getSessionLabel
// ---------------------------------------------------------------------------

describe('getSessionEmoji', () => {
  it('returns the mapped emoji for known types', () => {
    expect(getSessionEmoji('practice')).toBe(SESSION_EMOJI.practice);
    expect(getSessionEmoji('game')).toBe(SESSION_EMOJI.game);
  });

  it('falls back to 📅 for unknown types', () => {
    expect(getSessionEmoji('unknown')).toBe('📅');
  });
});

describe('getSessionLabel', () => {
  it('returns the mapped label for known types', () => {
    expect(getSessionLabel('practice')).toBe('Practice');
    expect(getSessionLabel('tournament')).toBe('Tournament');
  });

  it('falls back to the raw type string for unknown types', () => {
    expect(getSessionLabel('unknown_type')).toBe('unknown_type');
  });
});
