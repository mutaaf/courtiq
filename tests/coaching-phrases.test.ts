import { describe, it, expect } from 'vitest';
import {
  normaliseCategory,
  getPhrasesForCategory,
  hasPhrases,
  getPhraseForDay,
  getPhraseByIndex,
  countPhrases,
  getCategoriesWithPhrases,
  isStructuralCategory,
  getPhraseLabelForCategory,
} from '@/lib/coaching-phrases';

describe('normaliseCategory', () => {
  it('returns empty string for undefined', () => {
    expect(normaliseCategory(undefined)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(normaliseCategory(null)).toBe('');
  });

  it('lower-cases the input', () => {
    expect(normaliseCategory('Defense')).toBe('defense');
  });

  it('resolves aliases: ball handling → dribbling', () => {
    expect(normaliseCategory('ball handling')).toBe('dribbling');
  });

  it('resolves aliases: effort → hustle', () => {
    expect(normaliseCategory('effort')).toBe('hustle');
  });

  it('resolves aliases: court vision → awareness', () => {
    expect(normaliseCategory('court vision')).toBe('awareness');
  });

  it('resolves aliases: first touch → dribbling', () => {
    expect(normaliseCategory('first touch')).toBe('dribbling');
  });

  it('resolves aliases: flag pulling → defense', () => {
    expect(normaliseCategory('flag pulling')).toBe('defense');
  });

  it('trims whitespace', () => {
    expect(normaliseCategory('  dribbling  ')).toBe('dribbling');
  });

  it('returns unknown categories as-is (lowercase)', () => {
    expect(normaliseCategory('agility')).toBe('agility');
  });
});

describe('getPhrasesForCategory', () => {
  it('returns basketball dribbling phrases', () => {
    const phrases = getPhrasesForCategory('dribbling', 'basketball');
    expect(phrases.length).toBeGreaterThan(0);
    expect(phrases.every((p) => typeof p === 'string' && p.length > 5)).toBe(true);
  });

  it('returns soccer passing phrases', () => {
    const phrases = getPhrasesForCategory('passing', 'soccer');
    expect(phrases.length).toBeGreaterThan(0);
  });

  it('returns volleyball passing phrases', () => {
    const phrases = getPhrasesForCategory('passing', 'volleyball');
    expect(phrases.length).toBeGreaterThan(0);
    // Volleyball passing should mention platform
    expect(phrases.some((p) => p.toLowerCase().includes('platform'))).toBe(true);
  });

  it('falls back to generic when no sport-specific phrase', () => {
    const phrases = getPhrasesForCategory('warmup', 'basketball');
    expect(phrases.length).toBeGreaterThan(0);
  });

  it('falls back to generic for unknown sport', () => {
    const phrases = getPhrasesForCategory('teamwork', 'lacrosse');
    expect(phrases.length).toBeGreaterThan(0);
  });

  it('returns empty array for empty category', () => {
    expect(getPhrasesForCategory('', 'basketball')).toEqual([]);
  });

  it('returns empty array for null category', () => {
    expect(getPhrasesForCategory(null, 'basketball')).toEqual([]);
  });

  it('returns empty array for undefined category', () => {
    expect(getPhrasesForCategory(undefined, 'basketball')).toEqual([]);
  });

  it('resolves alias before lookup (ball handling → dribbling)', () => {
    const direct = getPhrasesForCategory('dribbling', 'basketball');
    const aliased = getPhrasesForCategory('ball handling', 'basketball');
    expect(direct).toEqual(aliased);
  });

  it('returns scrimmage generic phrases', () => {
    const phrases = getPhrasesForCategory('scrimmage', 'basketball');
    expect(phrases.length).toBeGreaterThan(0);
  });

  it('returns flagfootball defense phrases', () => {
    const phrases = getPhrasesForCategory('defense', 'flagfootball');
    expect(phrases.length).toBeGreaterThan(0);
  });

  it('handles null sport slug gracefully', () => {
    const phrases = getPhrasesForCategory('teamwork', null);
    expect(phrases.length).toBeGreaterThan(0);
  });
});

describe('hasPhrases', () => {
  it('returns true for known basketball dribbling', () => {
    expect(hasPhrases('dribbling', 'basketball')).toBe(true);
  });

  it('returns true for generic warmup category', () => {
    expect(hasPhrases('warmup', 'basketball')).toBe(true);
  });

  it('returns false for empty category', () => {
    expect(hasPhrases('', 'basketball')).toBe(false);
  });

  it('returns false for null category', () => {
    expect(hasPhrases(null, 'basketball')).toBe(false);
  });
});

describe('getPhraseForDay', () => {
  it('returns a string for a valid category', () => {
    const phrase = getPhraseForDay('dribbling', 'basketball', 0);
    expect(typeof phrase).toBe('string');
    expect(phrase.length).toBeGreaterThan(0);
  });

  it('returns empty string when no phrases', () => {
    expect(getPhraseForDay(null, 'basketball', 0)).toBe('');
  });

  it('is deterministic for the same seed', () => {
    const a = getPhraseForDay('defense', 'basketball', 42);
    const b = getPhraseForDay('defense', 'basketball', 42);
    expect(a).toBe(b);
  });

  it('can return different phrases for different seeds', () => {
    const phrases = getPhrasesForCategory('defense', 'basketball');
    if (phrases.length < 2) return; // skip if only 1 phrase
    const seen = new Set<string>();
    for (let i = 0; i < phrases.length * 3; i++) {
      seen.add(getPhraseForDay('defense', 'basketball', i));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('wraps around using modulo so index is always valid', () => {
    const phrases = getPhrasesForCategory('dribbling', 'basketball');
    const phrase = getPhraseForDay('dribbling', 'basketball', 1_000_000);
    expect(phrases).toContain(phrase);
  });
});

describe('getPhraseByIndex', () => {
  it('returns the first phrase at index 0', () => {
    const phrases = getPhrasesForCategory('passing', 'basketball');
    expect(getPhraseByIndex('passing', 'basketball', 0)).toBe(phrases[0]);
  });

  it('wraps around with modulo', () => {
    const phrases = getPhrasesForCategory('shooting', 'basketball');
    const index = phrases.length + 1;
    expect(getPhraseByIndex('shooting', 'basketball', index)).toBe(phrases[1]);
  });

  it('returns empty string for unknown category', () => {
    expect(getPhraseByIndex('unknown_xyz', 'basketball', 0)).toBe('');
  });

  it('handles negative index via abs()', () => {
    const phrase = getPhraseByIndex('defense', 'basketball', -1);
    expect(typeof phrase).toBe('string');
    expect(phrase.length).toBeGreaterThan(0);
  });
});

describe('countPhrases', () => {
  it('returns > 0 for known basketball dribbling', () => {
    expect(countPhrases('dribbling', 'basketball')).toBeGreaterThan(0);
  });

  it('returns 0 for null category', () => {
    expect(countPhrases(null, 'basketball')).toBe(0);
  });

  it('counts generic warmup phrases', () => {
    expect(countPhrases('warmup', null)).toBeGreaterThan(0);
  });
});

describe('getCategoriesWithPhrases', () => {
  it('returns non-empty array for basketball', () => {
    const cats = getCategoriesWithPhrases('basketball');
    expect(cats.length).toBeGreaterThan(0);
  });

  it('includes generic categories for any sport', () => {
    const cats = getCategoriesWithPhrases('soccer');
    expect(cats).toContain('teamwork');
    expect(cats).toContain('hustle');
  });

  it('includes sport-specific categories', () => {
    const cats = getCategoriesWithPhrases('basketball');
    expect(cats).toContain('dribbling');
    expect(cats).toContain('shooting');
  });

  it('returns deduplicated list', () => {
    const cats = getCategoriesWithPhrases('basketball');
    expect(new Set(cats).size).toBe(cats.length);
  });
});

describe('isStructuralCategory', () => {
  it('returns true for warmup', () => {
    expect(isStructuralCategory('warmup')).toBe(true);
  });

  it('returns true for scrimmage', () => {
    expect(isStructuralCategory('scrimmage')).toBe(true);
  });

  it('returns true for cooldown', () => {
    expect(isStructuralCategory('cooldown')).toBe(true);
  });

  it('returns false for dribbling', () => {
    expect(isStructuralCategory('dribbling')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isStructuralCategory(null)).toBe(false);
  });
});

describe('getPhraseLabelForCategory', () => {
  it('returns sport-specific label for basketball dribbling', () => {
    const label = getPhraseLabelForCategory('dribbling', 'basketball');
    expect(label).toContain('Basketball');
    expect(label).toContain('Dribbling');
  });

  it('returns generic label for unknown sport', () => {
    const label = getPhraseLabelForCategory('teamwork', 'lacrosse');
    expect(label).toContain('Teamwork');
    expect(label).not.toContain('Lacrosse');
  });

  it('returns warmup coaching for warmup category', () => {
    expect(getPhraseLabelForCategory('warmup', 'basketball')).toBe('Warmup coaching');
  });

  it('returns scrimmage coaching for scrimmage category', () => {
    expect(getPhraseLabelForCategory('scrimmage', 'soccer')).toBe('Scrimmage coaching');
  });

  it('returns fallback for null category', () => {
    expect(getPhraseLabelForCategory(null, 'basketball')).toBe('Coaching tip');
  });

  it('returns soccer-specific label for soccer passing', () => {
    const label = getPhraseLabelForCategory('passing', 'soccer');
    expect(label).toContain('Soccer');
    expect(label).toContain('Passing');
  });
});
