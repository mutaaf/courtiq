import { describe, it, expect } from 'vitest';
import {
  normalizeCategory,
  countObsByPlayerForCategory,
  getFirstName,
  getPlayerFocusForCategory,
  hasEnoughObsForFocus,
  buildFocusLabel,
  buildLastObsByPlayer,
  formatLastObsTime,
  truncateObsText,
  type NeedsWorkObs,
  type PlayerRef,
  type RecentObs,
  type SessionNote,
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

// ─── Helpers for new tests ────────────────────────────────────────────────────

function recentObs(
  player_id: string,
  text: string,
  sentiment: string,
  category: string,
  created_at: string
): RecentObs {
  return { player_id, text, sentiment, category, created_at };
}

function sessionNote(playerId: string, note: string, sentiment = 'positive', category = 'dribbling'): SessionNote {
  return { playerId, note, sentiment, category };
}

const DAY_MS = 86_400_000;
const NOW = new Date('2024-06-15T12:00:00Z').getTime();

// ─── buildLastObsByPlayer ─────────────────────────────────────────────────────

describe('buildLastObsByPlayer', () => {
  it('returns empty record when no notes and no recentObs', () => {
    expect(buildLastObsByPlayer([], [], NOW)).toEqual({});
  });

  it('uses current-session note for a player', () => {
    const notes = [sessionNote('p1', 'Good cut to basket', 'positive', 'offense')];
    const result = buildLastObsByPlayer(notes, [], NOW);
    expect(result['p1']).toMatchObject({
      text: 'Good cut to basket',
      sentiment: 'positive',
      category: 'offense',
      daysAgo: 0,
      fromCurrentSession: true,
    });
  });

  it('uses DB observation for a player not in current session', () => {
    const dbObs = [
      recentObs('p2', 'Needs work on footwork', 'needs-work', 'defense', new Date(NOW - 2 * DAY_MS).toISOString()),
    ];
    const result = buildLastObsByPlayer([], dbObs, NOW);
    expect(result['p2']).toMatchObject({
      text: 'Needs work on footwork',
      sentiment: 'needs-work',
      daysAgo: 2,
      fromCurrentSession: false,
    });
  });

  it('current-session note overrides DB observation for same player', () => {
    const notes = [sessionNote('p1', 'Improved dribbling today', 'positive', 'dribbling')];
    const dbObs = [
      recentObs('p1', 'Old observation from DB', 'needs-work', 'dribbling', new Date(NOW - 5 * DAY_MS).toISOString()),
    ];
    const result = buildLastObsByPlayer(notes, dbObs, NOW);
    expect(result['p1'].text).toBe('Improved dribbling today');
    expect(result['p1'].fromCurrentSession).toBe(true);
  });

  it('picks most recent DB observation when multiple exist for same player', () => {
    const dbObs = [
      recentObs('p1', 'Older obs', 'positive', 'defense', new Date(NOW - 10 * DAY_MS).toISOString()),
      recentObs('p1', 'Newer obs', 'needs-work', 'offense', new Date(NOW - 2 * DAY_MS).toISOString()),
      recentObs('p1', 'Middle obs', 'positive', 'dribbling', new Date(NOW - 5 * DAY_MS).toISOString()),
    ];
    const result = buildLastObsByPlayer([], dbObs, NOW);
    expect(result['p1'].text).toBe('Newer obs');
    expect(result['p1'].daysAgo).toBe(2);
  });

  it('handles multiple players independently', () => {
    const notes = [sessionNote('p1', 'Note for p1')];
    const dbObs = [
      recentObs('p2', 'DB note for p2', 'positive', 'passing', new Date(NOW - 1 * DAY_MS).toISOString()),
    ];
    const result = buildLastObsByPlayer(notes, dbObs, NOW);
    expect(result['p1'].fromCurrentSession).toBe(true);
    expect(result['p2'].fromCurrentSession).toBe(false);
    expect(result['p2'].text).toBe('DB note for p2');
  });

  it('last session note wins when player has multiple current-session notes', () => {
    const notes = [
      sessionNote('p1', 'First note'),
      sessionNote('p1', 'Second note'),
      sessionNote('p1', 'Third note'),
    ];
    const result = buildLastObsByPlayer(notes, [], NOW);
    expect(result['p1'].text).toBe('Third note');
  });

  it('ignores session notes without a playerId', () => {
    const notes = [{ note: 'Team note', sentiment: 'positive', category: 'general', playerId: undefined }];
    const result = buildLastObsByPlayer(notes, [], NOW);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('calculates daysAgo = 0 for today DB obs', () => {
    const dbObs = [
      recentObs('p1', 'Today obs', 'positive', 'dribbling', new Date(NOW - 3600_000).toISOString()),
    ];
    const result = buildLastObsByPlayer([], dbObs, NOW);
    expect(result['p1'].daysAgo).toBe(0);
  });

  it('calculates daysAgo correctly for 7-day-old obs', () => {
    const dbObs = [
      recentObs('p1', 'Week old obs', 'positive', 'dribbling', new Date(NOW - 7 * DAY_MS).toISOString()),
    ];
    const result = buildLastObsByPlayer([], dbObs, NOW);
    expect(result['p1'].daysAgo).toBe(7);
  });

  it('handles empty recentObs array', () => {
    const result = buildLastObsByPlayer([], [], NOW);
    expect(result).toEqual({});
  });
});

// ─── formatLastObsTime ────────────────────────────────────────────────────────

describe('formatLastObsTime', () => {
  it('returns "This session" for current-session obs', () => {
    expect(formatLastObsTime(0, true)).toBe('This session');
  });

  it('returns "This session" even when daysAgo > 0 and fromCurrentSession is true', () => {
    expect(formatLastObsTime(5, true)).toBe('This session');
  });

  it('returns "Today" for 0 days ago (not current session)', () => {
    expect(formatLastObsTime(0, false)).toBe('Today');
  });

  it('returns "Yesterday" for 1 day ago', () => {
    expect(formatLastObsTime(1, false)).toBe('Yesterday');
  });

  it('returns "Xd ago" for 2-6 days', () => {
    expect(formatLastObsTime(2, false)).toBe('2d ago');
    expect(formatLastObsTime(6, false)).toBe('6d ago');
  });

  it('returns "1 week ago" for exactly 7 days', () => {
    expect(formatLastObsTime(7, false)).toBe('1 week ago');
  });

  it('returns "X weeks ago" for 14+ days', () => {
    expect(formatLastObsTime(14, false)).toBe('2 weeks ago');
    expect(formatLastObsTime(21, false)).toBe('3 weeks ago');
  });

  it('returns "1 week ago" for 8-13 days', () => {
    expect(formatLastObsTime(8, false)).toBe('1 week ago');
    expect(formatLastObsTime(13, false)).toBe('1 week ago');
  });
});

// ─── truncateObsText ──────────────────────────────────────────────────────────

describe('truncateObsText', () => {
  it('returns text unchanged when shorter than maxLen', () => {
    expect(truncateObsText('Short text', 80)).toBe('Short text');
  });

  it('returns text unchanged when exactly maxLen', () => {
    const text = 'a'.repeat(72);
    expect(truncateObsText(text)).toBe(text);
  });

  it('truncates and appends ellipsis when longer than maxLen', () => {
    const text = 'a'.repeat(100);
    const result = truncateObsText(text, 72);
    expect(result).toHaveLength(72);
    expect(result.endsWith('…')).toBe(true);
  });

  it('uses default maxLen of 72', () => {
    const text = 'Good footwork and balance during the layup drill, showing real improvement';
    const result = truncateObsText(text);
    expect(result.length).toBeLessThanOrEqual(72);
    expect(result.endsWith('…')).toBe(true);
  });

  it('handles empty string', () => {
    expect(truncateObsText('', 72)).toBe('');
  });

  it('does not truncate at exactly maxLen characters', () => {
    const text = 'a'.repeat(72);
    expect(truncateObsText(text, 72)).toBe(text);
  });

  it('truncates at custom maxLen', () => {
    const result = truncateObsText('Hello world', 8);
    expect(result.length).toBeLessThanOrEqual(8);
    expect(result.endsWith('…')).toBe(true);
  });
});
