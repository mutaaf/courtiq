import { describe, it, expect } from 'vitest';
import {
  formatPlayerChipLabel,
  getUnobservedPlayers,
  countUnobservedPlayers,
  hasAllPlayersObserved,
  isUuid,
  type CoveragePlayer,
} from '../src/lib/capture-coverage-utils';

const makePlayer = (
  id: string,
  name: string,
  jersey_number: number | null = null
): CoveragePlayer => ({ id, name, jersey_number });

const p1 = makePlayer('a', 'Marcus Johnson', 7);
const p2 = makePlayer('b', 'Jordan Lee', null);
const p3 = makePlayer('c', 'Casey Brown', 12);
const p4 = makePlayer('d', 'Tyler Smith', null);
const p5 = makePlayer('e', 'Jean-Luc Picard', 1);
const roster = [p1, p2, p3, p4, p5];

describe('isUuid', () => {
  it('recognises a valid UUID v4', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
  it('rejects a plain first name', () => {
    expect(isUuid('Marcus')).toBe(false);
  });
  it('rejects a hyphenated name that is not a UUID', () => {
    expect(isUuid('Jean-Luc')).toBe(false);
  });
  it('rejects an empty string', () => {
    expect(isUuid('')).toBe(false);
  });
  it('rejects a partial UUID', () => {
    expect(isUuid('550e8400-e29b-41d4')).toBe(false);
  });
  it('is case-insensitive', () => {
    expect(isUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });
});

describe('formatPlayerChipLabel', () => {
  it('returns #N firstName when jersey is set', () => {
    expect(formatPlayerChipLabel('Marcus Johnson', 7)).toBe('#7 Marcus');
  });
  it('returns firstName when jersey is null', () => {
    expect(formatPlayerChipLabel('Jordan Lee', null)).toBe('Jordan');
  });
  it('handles a single-word name', () => {
    expect(formatPlayerChipLabel('Pelé', 10)).toBe('#10 Pelé');
  });
  it('handles a hyphenated first name', () => {
    expect(formatPlayerChipLabel('Jean-Luc Picard', 1)).toBe('#1 Jean-Luc');
  });
  it('handles jersey number zero', () => {
    expect(formatPlayerChipLabel('Alex Kim', 0)).toBe('#0 Alex');
  });
});

describe('getUnobservedPlayers', () => {
  it('returns players not in the observed set', () => {
    const observed = new Set(['a', 'c']);
    const result = getUnobservedPlayers(roster, observed);
    expect(result.map((p) => p.id)).toEqual(['b', 'd', 'e']);
  });

  it('caps at 4 by default', () => {
    const observed = new Set<string>();
    const result = getUnobservedPlayers(roster, observed);
    expect(result).toHaveLength(4);
  });

  it('respects a custom cap', () => {
    const observed = new Set<string>();
    expect(getUnobservedPlayers(roster, observed, 2)).toHaveLength(2);
    expect(getUnobservedPlayers(roster, observed, 10)).toHaveLength(roster.length);
  });

  it('returns empty array when all players are observed', () => {
    const observed = new Set(['a', 'b', 'c', 'd', 'e']);
    expect(getUnobservedPlayers(roster, observed)).toEqual([]);
  });

  it('returns empty array for an empty roster', () => {
    expect(getUnobservedPlayers([], new Set())).toEqual([]);
  });

  it('does not mutate the roster order', () => {
    const observed = new Set(['b']);
    const result = getUnobservedPlayers(roster, observed);
    expect(result[0].id).toBe('a');
  });
});

describe('countUnobservedPlayers', () => {
  it('counts players missing from the observed set', () => {
    const observed = new Set(['a', 'c']);
    expect(countUnobservedPlayers(roster, observed)).toBe(3);
  });

  it('returns 0 when everyone is observed', () => {
    const observed = new Set(['a', 'b', 'c', 'd', 'e']);
    expect(countUnobservedPlayers(roster, observed)).toBe(0);
  });

  it('returns full roster length when no one is observed', () => {
    expect(countUnobservedPlayers(roster, new Set())).toBe(roster.length);
  });

  it('handles unknown IDs in the observed set gracefully', () => {
    const observed = new Set(['z', 'a']);
    expect(countUnobservedPlayers(roster, observed)).toBe(4);
  });
});

describe('hasAllPlayersObserved', () => {
  it('returns true when every player is in the observed set', () => {
    const observed = new Set(['a', 'b', 'c', 'd', 'e']);
    expect(hasAllPlayersObserved(roster, observed)).toBe(true);
  });

  it('returns false when at least one player is missing', () => {
    const observed = new Set(['a', 'b', 'c', 'd']);
    expect(hasAllPlayersObserved(roster, observed)).toBe(false);
  });

  it('returns false for an empty roster', () => {
    expect(hasAllPlayersObserved([], new Set(['a']))).toBe(false);
  });

  it('returns false when observed set is empty', () => {
    expect(hasAllPlayersObserved(roster, new Set())).toBe(false);
  });

  it('ignores extra IDs in the observed set', () => {
    const observed = new Set(['a', 'b', 'c', 'd', 'e', 'z']);
    expect(hasAllPlayersObserved(roster, observed)).toBe(true);
  });
});
