import { describe, it, expect } from 'vitest';
import {
  parseCommaSeparated,
  serializeToCommaSeparated,
  buildOpponentProfileStructured,
  extractFormFieldsFromProfile,
  findDuplicateProfile,
  filterOpponentProfiles,
  isProfileMeaningful,
  type OpponentProfileData,
} from '../src/lib/opponent-profile-utils';

// ─── parseCommaSeparated ─────────────────────────────────────────────────────

describe('parseCommaSeparated', () => {
  it('splits a comma-separated string into trimmed entries', () => {
    expect(parseCommaSeparated('fast breaks, press defense, strong post')).toEqual([
      'fast breaks',
      'press defense',
      'strong post',
    ]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseCommaSeparated('')).toEqual([]);
  });

  it('trims individual entries', () => {
    expect(parseCommaSeparated('  a , b ,c  ')).toEqual(['a', 'b', 'c']);
  });

  it('filters out blank tokens from double-commas', () => {
    expect(parseCommaSeparated('a,,b')).toEqual(['a', 'b']);
  });

  it('handles a single entry with no commas', () => {
    expect(parseCommaSeparated('press defense')).toEqual(['press defense']);
  });

  it('handles whitespace-only input as empty', () => {
    expect(parseCommaSeparated('   ')).toEqual([]);
  });
});

// ─── serializeToCommaSeparated ───────────────────────────────────────────────

describe('serializeToCommaSeparated', () => {
  it('joins array entries with ", "', () => {
    expect(serializeToCommaSeparated(['fast breaks', 'press defense'])).toBe('fast breaks, press defense');
  });

  it('returns empty string for empty array', () => {
    expect(serializeToCommaSeparated([])).toBe('');
  });

  it('returns single entry without trailing separator', () => {
    expect(serializeToCommaSeparated(['fast breaks'])).toBe('fast breaks');
  });
});

// ─── buildOpponentProfileStructured ─────────────────────────────────────────

describe('buildOpponentProfileStructured', () => {
  it('builds a complete profile from form strings', () => {
    const result = buildOpponentProfileStructured(
      'Riverside Hawks',
      'fast breaks, strong post',
      'weak perimeter shooting',
      '#23 tall center, #5 quick guard',
      'Home game on Tuesday'
    );
    expect(result).toEqual({
      name: 'Riverside Hawks',
      strengths: ['fast breaks', 'strong post'],
      weaknesses: ['weak perimeter shooting'],
      key_players: ['#23 tall center', '#5 quick guard'],
      notes: 'Home game on Tuesday',
    });
  });

  it('trims the opponent name', () => {
    const result = buildOpponentProfileStructured('  Lakeview Lions  ', '', '', '', '');
    expect(result.name).toBe('Lakeview Lions');
  });

  it('handles empty optional fields gracefully', () => {
    const result = buildOpponentProfileStructured('Team A', '', '', '', '');
    expect(result.strengths).toEqual([]);
    expect(result.weaknesses).toEqual([]);
    expect(result.key_players).toEqual([]);
    expect(result.notes).toBe('');
  });

  it('trims notes', () => {
    const result = buildOpponentProfileStructured('Team B', '', '', '', '  some notes  ');
    expect(result.notes).toBe('some notes');
  });
});

// ─── extractFormFieldsFromProfile ────────────────────────────────────────────

describe('extractFormFieldsFromProfile', () => {
  it('converts structured profile back to form-friendly strings', () => {
    const cs: OpponentProfileData = {
      name: 'Riverside Hawks',
      strengths: ['fast breaks', 'strong post'],
      weaknesses: ['weak perimeter shooting'],
      key_players: ['#23 tall center'],
      notes: 'Bring defensive assignments',
    };
    const fields = extractFormFieldsFromProfile(cs);
    expect(fields.opponent).toBe('Riverside Hawks');
    expect(fields.strengths).toBe('fast breaks, strong post');
    expect(fields.weaknesses).toBe('weak perimeter shooting');
    expect(fields.keyPlayers).toBe('#23 tall center');
    expect(fields.notes).toBe('Bring defensive assignments');
  });

  it('handles empty arrays as empty strings', () => {
    const cs: OpponentProfileData = {
      name: 'Team X',
      strengths: [],
      weaknesses: [],
      key_players: [],
      notes: '',
    };
    const fields = extractFormFieldsFromProfile(cs);
    expect(fields.strengths).toBe('');
    expect(fields.weaknesses).toBe('');
    expect(fields.keyPlayers).toBe('');
  });

  it('uses fallback empty string for missing name', () => {
    const cs = { strengths: [], weaknesses: [], key_players: [], notes: '' } as any;
    const fields = extractFormFieldsFromProfile(cs);
    expect(fields.opponent).toBe('');
  });
});

// ─── findDuplicateProfile ────────────────────────────────────────────────────

describe('findDuplicateProfile', () => {
  const plans = [
    { id: '1', title: 'Riverside Hawks', type: 'opponent_profile' },
    { id: '2', title: 'Lakeview Lions', type: 'opponent_profile' },
    { id: '3', title: 'Some Practice', type: 'practice' },
  ];

  it('finds a duplicate by exact name (case-insensitive)', () => {
    const dup = findDuplicateProfile(plans, 'riverside hawks');
    expect(dup?.id).toBe('1');
  });

  it('finds a duplicate by uppercase name', () => {
    const dup = findDuplicateProfile(plans, 'LAKEVIEW LIONS');
    expect(dup?.id).toBe('2');
  });

  it('returns undefined when no duplicate exists', () => {
    expect(findDuplicateProfile(plans, 'New Team')).toBeUndefined();
  });

  it('ignores non-opponent_profile entries with same name', () => {
    expect(findDuplicateProfile(plans, 'Some Practice')).toBeUndefined();
  });

  it('handles leading/trailing whitespace in the search name', () => {
    expect(findDuplicateProfile(plans, '  Riverside Hawks  ')?.id).toBe('1');
  });
});

// ─── filterOpponentProfiles ───────────────────────────────────────────────────

describe('filterOpponentProfiles', () => {
  const mixed = [
    { type: 'practice', created_at: '2026-01-03' },
    { type: 'opponent_profile', created_at: '2026-01-01' },
    { type: 'gameday', created_at: '2026-01-04' },
    { type: 'opponent_profile', created_at: '2026-01-05' },
    { type: 'opponent_profile', created_at: '2026-01-02' },
  ];

  it('filters to only opponent_profile entries', () => {
    const result = filterOpponentProfiles(mixed);
    expect(result.every((p) => p.type === 'opponent_profile')).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('sorts by created_at descending (newest first)', () => {
    const result = filterOpponentProfiles(mixed);
    expect(result[0].created_at).toBe('2026-01-05');
    expect(result[1].created_at).toBe('2026-01-02');
    expect(result[2].created_at).toBe('2026-01-01');
  });

  it('returns an empty array when no opponent profiles exist', () => {
    expect(filterOpponentProfiles([{ type: 'practice', created_at: '2026-01-01' }])).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [
      { type: 'opponent_profile', created_at: '2026-01-01' },
      { type: 'opponent_profile', created_at: '2026-01-03' },
    ];
    const inputCopy = [...input];
    filterOpponentProfiles(input);
    expect(input).toEqual(inputCopy);
  });
});

// ─── isProfileMeaningful ─────────────────────────────────────────────────────

describe('isProfileMeaningful', () => {
  it('returns true when strengths are present', () => {
    const p: OpponentProfileData = { name: 'A', strengths: ['fast'], weaknesses: [], key_players: [], notes: '' };
    expect(isProfileMeaningful(p)).toBe(true);
  });

  it('returns true when weaknesses are present', () => {
    const p: OpponentProfileData = { name: 'A', strengths: [], weaknesses: ['slow'], key_players: [], notes: '' };
    expect(isProfileMeaningful(p)).toBe(true);
  });

  it('returns true when key_players are present', () => {
    const p: OpponentProfileData = { name: 'A', strengths: [], weaknesses: [], key_players: ['#5'], notes: '' };
    expect(isProfileMeaningful(p)).toBe(true);
  });

  it('returns true when only notes are present', () => {
    const p: OpponentProfileData = { name: 'A', strengths: [], weaknesses: [], key_players: [], notes: 'some notes' };
    expect(isProfileMeaningful(p)).toBe(true);
  });

  it('returns false when all fields are empty', () => {
    const p: OpponentProfileData = { name: 'A', strengths: [], weaknesses: [], key_players: [], notes: '' };
    expect(isProfileMeaningful(p)).toBe(false);
  });

  it('returns false when notes is only whitespace', () => {
    const p: OpponentProfileData = { name: 'A', strengths: [], weaknesses: [], key_players: [], notes: '   ' };
    expect(isProfileMeaningful(p)).toBe(false);
  });
});
