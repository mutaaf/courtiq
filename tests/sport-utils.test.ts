import { describe, it, expect } from 'vitest';
import {
  getSportEmoji,
  getSportExamplePhrase,
  getSportPreamble,
  getDrillBuilderCategories,
  SPORT_PREAMBLES,
} from '@/lib/sport-utils';

describe('getSportEmoji', () => {
  it('returns basketball emoji', () => expect(getSportEmoji('basketball')).toBe('🏀'));
  it('returns soccer emoji', () => expect(getSportEmoji('soccer')).toBe('⚽'));
  it('returns swimming emoji', () => expect(getSportEmoji('swimming')).toBe('🏊'));
  it('returns gymnastics emoji', () => expect(getSportEmoji('gymnastics')).toBe('🤸'));
  it('returns default for unknown slug', () => expect(getSportEmoji('cricket')).toBe('🏅'));
  it('returns default for undefined', () => expect(getSportEmoji(undefined)).toBe('🏅'));
  it('returns default for null', () => expect(getSportEmoji(null)).toBe('🏅'));
});

describe('getSportExamplePhrase', () => {
  it('returns basketball phrase', () => {
    expect(getSportExamplePhrase('basketball')).toContain('footwork');
  });
  it('returns swimming phrase', () => {
    expect(getSportExamplePhrase('swimming')).toContain('flip turn');
  });
  it('returns gymnastics phrase', () => {
    expect(getSportExamplePhrase('gymnastics')).toContain('handstand');
  });
  it('returns tennis phrase', () => {
    expect(getSportExamplePhrase('tennis')).toContain('backhand');
  });
  it('returns default phrase for unknown sport', () => {
    expect(getSportExamplePhrase('cricket')).toContain('footwork');
  });
  it('returns default phrase for null', () => {
    const phrase = getSportExamplePhrase(null);
    expect(typeof phrase).toBe('string');
    expect(phrase.length).toBeGreaterThan(0);
  });
});

describe('getSportPreamble', () => {
  it('returns a non-empty string for basketball', () => {
    const p = getSportPreamble('basketball');
    expect(p.length).toBeGreaterThan(0);
    expect(p).toContain('basketball');
  });

  it('returns a non-empty string for all 10 supported sports', () => {
    const sports = ['basketball', 'soccer', 'volleyball', 'flag_football', 'baseball', 'softball', 'lacrosse', 'swimming', 'tennis', 'gymnastics'];
    for (const sport of sports) {
      const p = getSportPreamble(sport);
      expect(p.length, `preamble for ${sport} should not be empty`).toBeGreaterThan(0);
    }
  });

  it('swimming preamble says swimmer not player', () => {
    const p = getSportPreamble('swimming');
    expect(p).toContain('swimmer');
    expect(p).toContain('NEVER');
  });

  it('gymnastics preamble says gymnast not player', () => {
    const p = getSportPreamble('gymnastics');
    expect(p).toContain('gymnast');
    expect(p).toContain('NEVER');
  });

  it('swimming preamble warns against basketball terms', () => {
    const p = getSportPreamble('swimming');
    expect(p).toContain('court');
  });

  it('gymnastics preamble warns against basketball terms', () => {
    const p = getSportPreamble('gymnastics');
    expect(p).toContain('court');
  });

  it('flag_football preamble uses flag football terms', () => {
    const p = getSportPreamble('flag_football');
    expect(p).toContain('flag');
  });

  it('lacrosse preamble uses lacrosse terms', () => {
    const p = getSportPreamble('lacrosse');
    expect(p).toContain('cradling');
  });

  it('returns empty string for unknown sport', () => {
    expect(getSportPreamble('cricket')).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(getSportPreamble(undefined)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(getSportPreamble(null)).toBe('');
  });

  it('SPORT_PREAMBLES covers all 10 sports', () => {
    const expected = ['basketball', 'soccer', 'volleyball', 'flag_football', 'baseball', 'softball', 'lacrosse', 'swimming', 'tennis', 'gymnastics'];
    for (const sport of expected) {
      expect(SPORT_PREAMBLES).toHaveProperty(sport);
    }
  });
});

describe('getDrillBuilderCategories', () => {
  it('returns basketball categories for basketball', () => {
    const cats = getDrillBuilderCategories('basketball');
    expect(cats).toContain('Shooting');
    expect(cats).toContain('Defense');
  });

  it('returns swimming-specific categories for swimming', () => {
    const cats = getDrillBuilderCategories('swimming');
    expect(cats).toContain('Stroke Technique');
    expect(cats).toContain('Flip Turns');
  });

  it('returns gymnastics-specific categories for gymnastics', () => {
    const cats = getDrillBuilderCategories('gymnastics');
    expect(cats).toContain('Tumbling');
    expect(cats).toContain('Balance');
  });

  it('returns default categories for unknown sport', () => {
    const cats = getDrillBuilderCategories('cricket');
    expect(cats.length).toBeGreaterThan(0);
  });

  it('returns default categories for null', () => {
    const cats = getDrillBuilderCategories(null);
    expect(cats.length).toBeGreaterThan(0);
  });
});
