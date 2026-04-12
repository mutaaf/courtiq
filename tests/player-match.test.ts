import { describe, it, expect } from 'vitest';
import { findPlayerByName, soundex, editDistance } from '@/lib/player-match';
import type { PlayerForMatch } from '@/lib/player-match';

// -----------------------------------------------------------------------
// Soundex unit tests
// -----------------------------------------------------------------------
describe('soundex', () => {
  it('returns empty string for empty input', () => {
    expect(soundex('')).toBe('');
  });

  it('pads short codes to 4 chars', () => {
    expect(soundex('A')).toBe('A000');
    expect(soundex('Al')).toBe('A400');
  });

  it('identical phonetic codes for common ASR confusions', () => {
    // Marcus / Marcos — same vowel transposition
    expect(soundex('Marcus')).toBe(soundex('Marcos'));
    // Jaylen / Jaylin / Jaylon
    expect(soundex('Jaylen')).toBe(soundex('Jaylin'));
    expect(soundex('Jaylen')).toBe(soundex('Jaylon'));
    // DeAndre / Deondre
    expect(soundex('DeAndre')).toBe(soundex('Deondre'));
    // Amin / Ameen — vowel variation
    expect(soundex('Amin')).toBe(soundex('Ameen'));
  });

  it('identical codes for ASR space-split variants (spaces stripped)', () => {
    // "a mean" stripped → "amean" should match "amin"
    expect(soundex('amean')).toBe(soundex('amin'));
    // "jam all" stripped → "jamall" should match "jamal"
    expect(soundex('jamall')).toBe(soundex('jamal'));
  });

  it('different codes for clearly different names', () => {
    expect(soundex('Smith')).not.toBe(soundex('Jones'));
    expect(soundex('Taylor')).not.toBe(soundex('Wilson'));
  });
});

// -----------------------------------------------------------------------
// Edit distance unit tests
// -----------------------------------------------------------------------
describe('editDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(editDistance('marcus', 'marcus')).toBe(0);
  });

  it('handles empty strings', () => {
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', '')).toBe(3);
  });

  it('returns 1 for single substitution', () => {
    expect(editDistance('Jaylen', 'Jaylon')).toBe(1);
  });

  it('returns 1 for single insertion', () => {
    expect(editDistance('Marcus', 'Marcuss')).toBe(1);
  });

  it('returns 1 for single deletion', () => {
    expect(editDistance('Jaylen', 'Jayln')).toBe(1);
  });

  it('returns correct distance for larger differences', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });
});

// -----------------------------------------------------------------------
// findPlayerByName integration tests
// -----------------------------------------------------------------------

const roster: PlayerForMatch[] = [
  {
    id: 'p1',
    name: 'Marcus Johnson',
    nickname: 'MJ',
    name_variants: ['marcuss johnson'],
  },
  {
    id: 'p2',
    name: 'DeAndre Williams',
    nickname: null,
    name_variants: ['the Andre', 'de andre'],
  },
  {
    id: 'p3',
    name: 'Jaylen Smith',
    nickname: 'Jay',
    name_variants: null,
  },
  {
    id: 'p4',
    name: 'Amin Hassan',
    nickname: null,
    name_variants: ['a mean', 'I mean', 'ah mean'],
  },
  {
    id: 'p5',
    name: 'Jamal Torres',
    nickname: null,
    name_variants: ['jam all'],
  },
  {
    id: 'p6',
    name: 'Zoe Chen',
    nickname: null,
    name_variants: null,
  },
];

describe('findPlayerByName', () => {
  // --- null / empty guard ---
  it('returns null for empty roster', () => {
    expect(findPlayerByName('Marcus', [])).toBeNull();
  });

  it('returns null for empty name', () => {
    expect(findPlayerByName('', roster)).toBeNull();
  });

  it('returns null for whitespace-only name', () => {
    expect(findPlayerByName('  ', roster)).toBeNull();
  });

  // --- exact match ---
  it('exact full name match', () => {
    expect(findPlayerByName('Marcus Johnson', roster)).toBe('p1');
  });

  it('exact match is case-insensitive', () => {
    expect(findPlayerByName('marcus johnson', roster)).toBe('p1');
    expect(findPlayerByName('JAYLEN SMITH', roster)).toBe('p3');
  });

  it('exact nickname match', () => {
    expect(findPlayerByName('MJ', roster)).toBe('p1');
    expect(findPlayerByName('Jay', roster)).toBe('p3');
  });

  // --- name_variants match ---
  it('matches ASR variants from name_variants list', () => {
    expect(findPlayerByName('a mean', roster)).toBe('p4');
    expect(findPlayerByName('I mean', roster)).toBe('p4');
    expect(findPlayerByName('the Andre', roster)).toBe('p2');
    expect(findPlayerByName('jam all', roster)).toBe('p5');
  });

  // --- substring match ---
  it('first-name substring match', () => {
    expect(findPlayerByName('Marcus', roster)).toBe('p1');
    expect(findPlayerByName('Zoe', roster)).toBe('p6');
  });

  // --- first-name-only unique match ---
  it('resolves first-name-only when unique in roster', () => {
    expect(findPlayerByName('Amin', roster)).toBe('p4');
    expect(findPlayerByName('Jamal', roster)).toBe('p5');
  });

  // --- soundex phonetic match ---
  it('soundex matches alternate vowel spellings (Marcos → Marcus)', () => {
    // "Marcos" should phonetically match "Marcus Johnson"
    expect(findPlayerByName('Marcos', roster)).toBe('p1');
  });

  it('soundex matches Deondre → DeAndre', () => {
    expect(findPlayerByName('Deondre', roster)).toBe('p2');
  });

  it('soundex matches Jaylin → Jaylen', () => {
    expect(findPlayerByName('Jaylin', roster)).toBe('p3');
  });

  // --- levenshtein near-miss ---
  it('levenshtein matches 1-char typo (Zoe → Zoo)', () => {
    expect(findPlayerByName('Zoo', roster)).toBe('p6');
  });

  it('levenshtein matches 1-char insertion (Marcuss → Marcus Johnson)', () => {
    // "Marcuss" (7 chars) → threshold 2; nearest is "marcus johnson" (14 chars)
    // but via substring "marcus" already catches it. Ensure it at least resolves:
    expect(findPlayerByName('Marcuss', roster)).toBe('p1');
  });

  // --- no match ---
  it('returns null for a completely unknown name', () => {
    expect(findPlayerByName('Bartholomew Xavier', roster)).toBeNull();
  });
});
