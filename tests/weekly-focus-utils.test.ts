import { describe, it, expect, beforeEach } from 'vitest';
import {
  FOCUS_CATEGORIES,
  getWeeklyFocusKey,
  isValidFocusCategory,
  getFocusCategoryConfig,
  isWeeklyFocusExpired,
  getDaysRemaining,
  categoryMatchesFocus,
  formatFocusAge,
  type WeeklyFocus,
  type FocusCategory,
} from '../src/lib/weekly-focus-utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgoDate(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().split('T')[0];
}

function makeFocus(category: FocusCategory, daysAgo: number): WeeklyFocus {
  return { category, setAt: daysAgoDate(daysAgo) };
}

// ── FOCUS_CATEGORIES ──────────────────────────────────────────────────────────

describe('FOCUS_CATEGORIES', () => {
  it('has exactly 10 entries', () => {
    expect(FOCUS_CATEGORIES.length).toBe(10);
  });

  it('all entries have id, label, and emoji', () => {
    for (const c of FOCUS_CATEGORIES) {
      expect(typeof c.id).toBe('string');
      expect(c.id.length).toBeGreaterThan(0);
      expect(typeof c.label).toBe('string');
      expect(c.label.length).toBeGreaterThan(0);
      expect(typeof c.emoji).toBe('string');
      expect(c.emoji.length).toBeGreaterThan(0);
    }
  });

  it('all ids are unique', () => {
    const ids = FOCUS_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes all expected skill categories', () => {
    const ids = FOCUS_CATEGORIES.map((c) => c.id);
    expect(ids).toContain('shooting');
    expect(ids).toContain('defense');
    expect(ids).toContain('dribbling');
    expect(ids).toContain('passing');
    expect(ids).toContain('hustle');
    expect(ids).toContain('awareness');
    expect(ids).toContain('teamwork');
    expect(ids).toContain('footwork');
    expect(ids).toContain('conditioning');
    expect(ids).toContain('leadership');
  });
});

// ── getWeeklyFocusKey ─────────────────────────────────────────────────────────

describe('getWeeklyFocusKey', () => {
  it('returns expected localStorage key format', () => {
    expect(getWeeklyFocusKey('team-abc')).toBe('weekly-focus-team-abc');
  });

  it('different teams produce different keys', () => {
    expect(getWeeklyFocusKey('team-1')).not.toBe(getWeeklyFocusKey('team-2'));
  });

  it('handles empty teamId gracefully', () => {
    expect(getWeeklyFocusKey('')).toBe('weekly-focus-');
  });
});

// ── isValidFocusCategory ──────────────────────────────────────────────────────

describe('isValidFocusCategory', () => {
  it('returns true for all valid categories', () => {
    for (const c of FOCUS_CATEGORIES) {
      expect(isValidFocusCategory(c.id)).toBe(true);
    }
  });

  it('returns false for unknown category', () => {
    expect(isValidFocusCategory('unknown')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidFocusCategory('')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(isValidFocusCategory('Shooting')).toBe(false);
    expect(isValidFocusCategory('DEFENSE')).toBe(false);
  });
});

// ── getFocusCategoryConfig ────────────────────────────────────────────────────

describe('getFocusCategoryConfig', () => {
  it('returns config for valid category', () => {
    const config = getFocusCategoryConfig('defense');
    expect(config).not.toBeNull();
    expect(config?.id).toBe('defense');
    expect(config?.label).toBe('Defense');
    expect(config?.emoji).toBe('🛡️');
  });

  it('returns null for unknown category', () => {
    expect(getFocusCategoryConfig('unknown')).toBeNull();
  });

  it('returns config for conditioning', () => {
    const config = getFocusCategoryConfig('conditioning');
    expect(config?.label).toBe('Conditioning');
    expect(config?.emoji).toBe('💪');
  });

  it('returns config for dribbling with correct label', () => {
    const config = getFocusCategoryConfig('dribbling');
    expect(config?.label).toBe('Ball Handling');
  });
});

// ── isWeeklyFocusExpired ──────────────────────────────────────────────────────

describe('isWeeklyFocusExpired', () => {
  it('returns false for focus set today', () => {
    const focus = makeFocus('defense', 0);
    expect(isWeeklyFocusExpired(focus)).toBe(false);
  });

  it('returns false for focus set 6 days ago', () => {
    const focus = makeFocus('shooting', 6);
    expect(isWeeklyFocusExpired(focus)).toBe(false);
  });

  it('returns true for focus set 8 days ago', () => {
    const focus = makeFocus('passing', 8);
    expect(isWeeklyFocusExpired(focus)).toBe(true);
  });

  it('returns true for focus set 14 days ago', () => {
    const focus = makeFocus('hustle', 14);
    expect(isWeeklyFocusExpired(focus)).toBe(true);
  });

  it('returns true for focus set exactly 8 days ago', () => {
    const focus = makeFocus('teamwork', 8);
    expect(isWeeklyFocusExpired(focus)).toBe(true);
  });
});

// ── getDaysRemaining ──────────────────────────────────────────────────────────

describe('getDaysRemaining', () => {
  it('returns ~7 for focus set today', () => {
    const focus = makeFocus('defense', 0);
    const remaining = getDaysRemaining(focus);
    // noon anchor can push remaining to 8 early in the day
    expect(remaining).toBeGreaterThanOrEqual(6);
    expect(remaining).toBeLessThanOrEqual(8);
  });

  it('returns around 1 for focus set 6 days ago', () => {
    const focus = makeFocus('shooting', 6);
    const remaining = getDaysRemaining(focus);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeLessThanOrEqual(2);
  });

  it('returns 0 for expired focus', () => {
    const focus = makeFocus('passing', 8);
    expect(getDaysRemaining(focus)).toBe(0);
  });

  it('never returns negative', () => {
    const focus = makeFocus('hustle', 30);
    expect(getDaysRemaining(focus)).toBe(0);
  });
});

// ── categoryMatchesFocus ──────────────────────────────────────────────────────

describe('categoryMatchesFocus', () => {
  const focus = makeFocus('defense', 1);

  it('returns true when category matches focus', () => {
    expect(categoryMatchesFocus('defense', focus)).toBe(true);
  });

  it('returns false when category does not match focus', () => {
    expect(categoryMatchesFocus('shooting', focus)).toBe(false);
  });

  it('returns false when focus is null', () => {
    expect(categoryMatchesFocus('defense', null)).toBe(false);
  });

  it('returns false when category is null', () => {
    expect(categoryMatchesFocus(null, focus)).toBe(false);
  });

  it('returns false when category is undefined', () => {
    expect(categoryMatchesFocus(undefined, focus)).toBe(false);
  });

  it('returns false when both are null', () => {
    expect(categoryMatchesFocus(null, null)).toBe(false);
  });
});

// ── formatFocusAge ────────────────────────────────────────────────────────────

describe('formatFocusAge', () => {
  it('returns "Today" when set today', () => {
    const focus = makeFocus('teamwork', 0);
    expect(formatFocusAge(focus)).toBe('Today');
  });

  it('returns "Yesterday" when set 1 day ago', () => {
    const focus = makeFocus('hustle', 1);
    expect(formatFocusAge(focus)).toBe('Yesterday');
  });

  it('returns "N days ago" when set multiple days ago', () => {
    const focus = makeFocus('passing', 3);
    expect(formatFocusAge(focus)).toBe('3 days ago');
  });

  it('returns "5 days ago" when set 5 days ago', () => {
    const focus = makeFocus('dribbling', 5);
    expect(formatFocusAge(focus)).toBe('5 days ago');
  });
});
