import { describe, it, expect } from 'vitest';
import {
  parseRosterPaste,
  buildSkippedWarning,
  deduplicateNames,
  findDuplicatesAgainstRoster,
  ROSTER_NAME_MIN,
  ROSTER_NAME_MAX,
} from '@/lib/roster-paste-utils';

describe('parseRosterPaste', () => {
  it('returns empty arrays for empty input', () => {
    expect(parseRosterPaste('')).toEqual({ names: [], skipped: [] });
    expect(parseRosterPaste('   \n  \n')).toEqual({ names: [], skipped: [] });
  });

  it('parses a clean roster list', () => {
    const text = 'Marcus Johnson\nSarah Williams\nJordan Lee';
    const { names, skipped } = parseRosterPaste(text);
    expect(names).toEqual(['Marcus Johnson', 'Sarah Williams', 'Jordan Lee']);
    expect(skipped).toHaveLength(0);
  });

  it('trims surrounding whitespace from each name', () => {
    const text = '  Marcus Johnson  \n  Sarah Williams\t';
    const { names } = parseRosterPaste(text);
    expect(names).toEqual(['Marcus Johnson', 'Sarah Williams']);
  });

  it('silently ignores blank / whitespace-only lines', () => {
    const text = 'Marcus Johnson\n\n   \nSarah Williams';
    const { names, skipped } = parseRosterPaste(text);
    expect(names).toEqual(['Marcus Johnson', 'Sarah Williams']);
    expect(skipped).toHaveLength(0);
  });

  it('skips lines that are too short (< MIN)', () => {
    const short = 'A'; // length 1 < 2
    const { names, skipped } = parseRosterPaste(`${short}\nMarcus Johnson`);
    expect(names).toEqual(['Marcus Johnson']);
    expect(skipped).toEqual([short]);
  });

  it('skips lines that are too long (> MAX) instead of silently dropping', () => {
    const longLine = 'A'.repeat(ROSTER_NAME_MAX + 1);
    const { names, skipped } = parseRosterPaste(`${longLine}\nMarcus Johnson`);
    expect(names).toEqual(['Marcus Johnson']);
    expect(skipped).toEqual([longLine]);
  });

  it('a line exactly at MIN is accepted', () => {
    const minName = 'Ab'; // length 2
    const { names, skipped } = parseRosterPaste(minName);
    expect(names).toEqual([minName]);
    expect(skipped).toHaveLength(0);
  });

  it('a line exactly at MAX is accepted', () => {
    const maxName = 'A'.repeat(ROSTER_NAME_MAX);
    const { names, skipped } = parseRosterPaste(maxName);
    expect(names).toEqual([maxName]);
    expect(skipped).toHaveLength(0);
  });

  it('handles mixed valid and invalid lines', () => {
    // Line > 60 chars — should be skipped and surface a warning
    const longLine = 'Firstname Middlename Lastname (parent jane@example.com / 555-1234)';
    const text = `Marcus Johnson\n${longLine}\nJordan Lee\nX`;
    const { names, skipped } = parseRosterPaste(text);
    expect(names).toEqual(['Marcus Johnson', 'Jordan Lee']);
    expect(skipped).toEqual([longLine, 'X']);
  });

  it('uses custom min/max overrides', () => {
    const { names, skipped } = parseRosterPaste('Hi\nMarcus', 3, 10);
    expect(names).toEqual(['Marcus']);
    expect(skipped).toEqual(['Hi']);
  });

  it('handles Windows-style line endings (CRLF)', () => {
    const text = 'Marcus Johnson\r\nSarah Williams\r\nJordan Lee';
    const { names } = parseRosterPaste(text);
    // \r at end of trimmed name — trim() removes it
    expect(names).toEqual(['Marcus Johnson', 'Sarah Williams', 'Jordan Lee']);
  });
});

describe('buildSkippedWarning', () => {
  it('returns null when no lines were skipped', () => {
    expect(buildSkippedWarning([])).toBeNull();
  });

  it('uses singular for one skipped line', () => {
    const msg = buildSkippedWarning(['toolong']);
    expect(msg).toMatch(/1 line was skipped/);
    expect(msg).toMatch(`${ROSTER_NAME_MIN}–${ROSTER_NAME_MAX}`);
  });

  it('uses plural for multiple skipped lines', () => {
    const msg = buildSkippedWarning(['a', 'b']);
    expect(msg).toMatch(/2 lines were skipped/);
  });
});

describe('deduplicateNames', () => {
  it('returns unique names preserving first occurrence', () => {
    const result = deduplicateNames(['Alice', 'Bob', 'alice', 'ALICE', 'Bob']);
    expect(result).toEqual(['Alice', 'Bob']);
  });

  it('returns original list when no duplicates', () => {
    const names = ['Alice', 'Bob', 'Charlie'];
    expect(deduplicateNames(names)).toEqual(names);
  });

  it('handles empty array', () => {
    expect(deduplicateNames([])).toEqual([]);
  });
});

describe('findDuplicatesAgainstRoster', () => {
  it('finds names already in the existing roster (case-insensitive)', () => {
    const existing = ['Marcus Johnson', 'Sarah Williams'];
    const incoming = ['marcus johnson', 'Jordan Lee', 'Sarah Williams'];
    const dups = findDuplicatesAgainstRoster(incoming, existing);
    expect(dups).toEqual(['marcus johnson', 'Sarah Williams']);
  });

  it('returns empty array when no overlap', () => {
    const dups = findDuplicatesAgainstRoster(['Jordan Lee'], ['Alice', 'Bob']);
    expect(dups).toHaveLength(0);
  });

  it('handles empty inputs', () => {
    expect(findDuplicatesAgainstRoster([], ['Alice'])).toHaveLength(0);
    expect(findDuplicatesAgainstRoster(['Alice'], [])).toHaveLength(0);
  });
});
