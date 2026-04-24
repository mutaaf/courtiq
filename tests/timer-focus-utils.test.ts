import { describe, it, expect } from 'vitest';
import {
  normalizeCategory,
  countObsByPlayerForCategory,
  getFirstName,
  getPlayerFocusForCategory,
  hasEnoughObsForFocus,
  buildFocusLabel,
  type NeedsWorkObs,
  type PlayerRef,
} from '@/lib/timer-focus-utils';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PLAYERS: PlayerRef[] = [
  { id: 'p1', name: 'Marcus Johnson', jersey_number: '5' },
  { id: 'p2', name: 'Jordan Lee', jersey_number: null },
  { id: 'p3', name: 'Aisha Williams', jersey_number: '12' },
  { id: 'p4', name: 'Tyler Chen', jersey_number: '7' },
];

function obs(player_id: string | null, category: string): NeedsWorkObs {
  return { player_id, category };
}

// ─── normalizeCategory ───────────────────────────────────────────────────────

describe('normalizeCategory', () => {
  it('lowercases', () => {
    expect(normalizeCategory('Dribbling')).toBe('dribbling');
  });

  it('trims whitespace', () => {
    expect(normalizeCategory('  passing  ')).toBe('passing');
  });

  it('handles already lowercase', () => {
    expect(normalizeCategory('defense')).toBe('defense');
  });

  it('handles mixed case', () => {
    expect(normalizeCategory('SHOOTING')).toBe('shooting');
  });
});

// ─── countObsByPlayerForCategory ─────────────────────────────────────────────

describe('countObsByPlayerForCategory', () => {
  it('counts obs for matching category', () => {
    const observations = [
      obs('p1', 'dribbling'),
      obs('p1', 'dribbling'),
      obs('p2', 'dribbling'),
    ];
    const counts = countObsByPlayerForCategory('dribbling', observations);
    expect(counts).toEqual({ p1: 2, p2: 1 });
  });

  it('ignores null player_id', () => {
    const observations = [obs(null, 'dribbling'), obs('p1', 'dribbling')];
    const counts = countObsByPlayerForCategory('dribbling', observations);
    expect(counts).toEqual({ p1: 1 });
  });

  it('ignores other categories', () => {
    const observations = [obs('p1', 'passing'), obs('p1', 'defense')];
    const counts = countObsByPlayerForCategory('dribbling', observations);
    expect(counts).toEqual({});
  });

  it('is case-insensitive', () => {
    const observations = [obs('p1', 'Dribbling'), obs('p1', 'DRIBBLING')];
    const counts = countObsByPlayerForCategory('dribbling', observations);
    expect(counts).toEqual({ p1: 2 });
  });

  it('returns empty object for empty observations', () => {
    expect(countObsByPlayerForCategory('dribbling', [])).toEqual({});
  });
});

// ─── getFirstName ─────────────────────────────────────────────────────────────

describe('getFirstName', () => {
  it('returns first word', () => {
    expect(getFirstName('Marcus Johnson')).toBe('Marcus');
  });

  it('handles single-word name', () => {
    expect(getFirstName('Jordan')).toBe('Jordan');
  });

  it('handles multi-word name', () => {
    expect(getFirstName('Mary Jane Watson')).toBe('Mary');
  });

  it('handles empty string', () => {
    expect(getFirstName('')).toBe('');
  });
});

// ─── getPlayerFocusForCategory ────────────────────────────────────────────────

describe('getPlayerFocusForCategory', () => {
  it('returns top players sorted by count descending', () => {
    const observations = [
      obs('p1', 'dribbling'),
      obs('p1', 'dribbling'),
      obs('p1', 'dribbling'),
      obs('p2', 'dribbling'),
      obs('p2', 'dribbling'),
      obs('p3', 'dribbling'),
    ];
    const result = getPlayerFocusForCategory('dribbling', observations, PLAYERS);
    expect(result[0].playerId).toBe('p1');
    expect(result[0].count).toBe(3);
    expect(result[1].playerId).toBe('p2');
    expect(result[1].count).toBe(2);
  });

  it('respects maxResults', () => {
    const observations = [
      obs('p1', 'dribbling'),
      obs('p2', 'dribbling'),
      obs('p3', 'dribbling'),
    ];
    const result = getPlayerFocusForCategory('dribbling', observations, PLAYERS, 1);
    expect(result).toHaveLength(1);
  });

  it('defaults to 2 results', () => {
    const observations = [
      obs('p1', 'dribbling'),
      obs('p2', 'dribbling'),
      obs('p3', 'dribbling'),
    ];
    const result = getPlayerFocusForCategory('dribbling', observations, PLAYERS);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('excludes players not in roster', () => {
    const observations = [
      obs('unknown-player', 'dribbling'),
      obs('p1', 'dribbling'),
    ];
    const result = getPlayerFocusForCategory('dribbling', observations, PLAYERS);
    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe('p1');
  });

  it('returns empty array when category is undefined', () => {
    const result = getPlayerFocusForCategory(undefined, [obs('p1', 'dribbling')], PLAYERS);
    expect(result).toEqual([]);
  });

  it('returns empty array when no observations', () => {
    const result = getPlayerFocusForCategory('dribbling', [], PLAYERS);
    expect(result).toEqual([]);
  });

  it('returns empty array when no players', () => {
    const result = getPlayerFocusForCategory('dribbling', [obs('p1', 'dribbling')], []);
    expect(result).toEqual([]);
  });

  it('returns empty array when no obs match category', () => {
    const result = getPlayerFocusForCategory('shooting', [obs('p1', 'dribbling')], PLAYERS);
    expect(result).toEqual([]);
  });

  it('populates playerName from first name', () => {
    const result = getPlayerFocusForCategory('dribbling', [obs('p1', 'dribbling')], PLAYERS);
    expect(result[0].playerName).toBe('Marcus');
  });

  it('populates jerseyNumber', () => {
    const result = getPlayerFocusForCategory('dribbling', [obs('p1', 'dribbling')], PLAYERS);
    expect(result[0].jerseyNumber).toBe('5');
  });

  it('jerseyNumber is null when not set', () => {
    const result = getPlayerFocusForCategory('dribbling', [obs('p2', 'dribbling')], PLAYERS);
    expect(result[0].jerseyNumber).toBeNull();
  });

  it('is case-insensitive on category match', () => {
    const result = getPlayerFocusForCategory('Dribbling', [obs('p1', 'dribbling')], PLAYERS);
    expect(result).toHaveLength(1);
  });

  it('only counts obs for specified category, ignores others', () => {
    const observations = [
      obs('p1', 'passing'),
      obs('p1', 'passing'),
      obs('p2', 'dribbling'),
    ];
    const result = getPlayerFocusForCategory('dribbling', observations, PLAYERS);
    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe('p2');
  });

  it('returns at most maxResults entries', () => {
    const observations = PLAYERS.map((p) => obs(p.id, 'defense'));
    const result = getPlayerFocusForCategory('defense', observations, PLAYERS, 2);
    expect(result).toHaveLength(2);
  });
});

// ─── hasEnoughObsForFocus ─────────────────────────────────────────────────────

describe('hasEnoughObsForFocus', () => {
  it('returns true when a player has 2+ obs in one category', () => {
    expect(
      hasEnoughObsForFocus([obs('p1', 'dribbling'), obs('p1', 'dribbling')])
    ).toBe(true);
  });

  it('returns false when no player has 2+ obs in same category', () => {
    expect(
      hasEnoughObsForFocus([obs('p1', 'dribbling'), obs('p1', 'passing')])
    ).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(hasEnoughObsForFocus([])).toBe(false);
  });

  it('ignores null player_id', () => {
    expect(hasEnoughObsForFocus([obs(null, 'dribbling'), obs(null, 'dribbling')])).toBe(false);
  });

  it('counts different players separately', () => {
    expect(
      hasEnoughObsForFocus([obs('p1', 'dribbling'), obs('p2', 'dribbling')])
    ).toBe(false);
  });
});

// ─── buildFocusLabel ─────────────────────────────────────────────────────────

describe('buildFocusLabel', () => {
  it('shows name only when count < 3', () => {
    expect(
      buildFocusLabel({ playerId: 'p1', playerName: 'Marcus', jerseyNumber: null, count: 2 })
    ).toBe('Marcus');
  });

  it('shows count when count >= 3', () => {
    expect(
      buildFocusLabel({ playerId: 'p1', playerName: 'Marcus', jerseyNumber: null, count: 3 })
    ).toBe('Marcus · needs work ×3');
  });

  it('includes jersey number when present', () => {
    expect(
      buildFocusLabel({ playerId: 'p1', playerName: 'Marcus', jerseyNumber: '5', count: 2 })
    ).toBe('#5 Marcus');
  });

  it('includes jersey number and count when both apply', () => {
    expect(
      buildFocusLabel({ playerId: 'p1', playerName: 'Marcus', jerseyNumber: '5', count: 4 })
    ).toBe('#5 Marcus · needs work ×4');
  });

  it('handles count exactly 1', () => {
    expect(
      buildFocusLabel({ playerId: 'p2', playerName: 'Jordan', jerseyNumber: null, count: 1 })
    ).toBe('Jordan');
  });
});
