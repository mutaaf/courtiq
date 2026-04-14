import { describe, it, expect } from 'vitest';
import {
  isValidSentiment,
  parseSnapObservation,
  filterValidObservations,
  groupObservationsByPlayer,
  countBySentiment,
  sortObservationsByValence,
  hasObservations,
  buildObservationSummary,
  deduplicateObservations,
  isLikelyNonSportsPhoto,
  type RawSnapObservation,
  type ValidSnapObservation,
} from '@/lib/snap-observation-utils';

// ── isValidSentiment ─────────────────��──────────────────────���─────────────────

describe('isValidSentiment', () => {
  it('accepts positive', () => expect(isValidSentiment('positive')).toBe(true));
  it('accepts needs-work', () => expect(isValidSentiment('needs-work')).toBe(true));
  it('accepts neutral', () => expect(isValidSentiment('neutral')).toBe(true));
  it('rejects empty string', () => expect(isValidSentiment('')).toBe(false));
  it('rejects arbitrary string', () => expect(isValidSentiment('great')).toBe(false));
  it('is case-sensitive', () => expect(isValidSentiment('Positive')).toBe(false));
});

// ── parseSnapObservation ─────────────────────��──────────────────────────��─────

const VALID_RAW: RawSnapObservation = {
  player_name: 'Marcus',
  category: 'Defense',
  sentiment: 'positive',
  text: 'Wide defensive stance with arms active',
};

describe('parseSnapObservation', () => {
  it('returns a valid observation for a well-formed input', () => {
    const result = parseSnapObservation(VALID_RAW);
    expect(result).not.toBeNull();
    expect(result?.player_name).toBe('Marcus');
    expect(result?.skill_id).toBeNull();
  });

  it('trims whitespace from all string fields', () => {
    const raw = { ...VALID_RAW, player_name: '  Marcus  ', category: ' Defense ', text: '  Wide stance  ' };
    const result = parseSnapObservation(raw);
    expect(result?.player_name).toBe('Marcus');
    expect(result?.category).toBe('Defense');
    expect(result?.text).toBe('Wide stance');
  });

  it('returns null for empty player_name', () => {
    expect(parseSnapObservation({ ...VALID_RAW, player_name: '' })).toBeNull();
  });

  it('returns null for whitespace-only player_name', () => {
    expect(parseSnapObservation({ ...VALID_RAW, player_name: '   ' })).toBeNull();
  });

  it('returns null for empty category', () => {
    expect(parseSnapObservation({ ...VALID_RAW, category: '' })).toBeNull();
  });

  it('returns null for text shorter than 5 chars', () => {
    expect(parseSnapObservation({ ...VALID_RAW, text: 'ok' })).toBeNull();
  });

  it('returns null for invalid sentiment', () => {
    expect(parseSnapObservation({ ...VALID_RAW, sentiment: 'bad' })).toBeNull();
  });

  it('preserves skill_id when provided', () => {
    const raw = { ...VALID_RAW, skill_id: 'dribbling' };
    expect(parseSnapObservation(raw)?.skill_id).toBe('dribbling');
  });

  it('coerces undefined skill_id to null', () => {
    expect(parseSnapObservation(VALID_RAW)?.skill_id).toBeNull();
  });
});

// ── filterValidObservations ───────────────────────────��───────────────────────

describe('filterValidObservations', () => {
  it('filters out invalid observations', () => {
    const raws: RawSnapObservation[] = [
      VALID_RAW,
      { ...VALID_RAW, player_name: '' },
      { ...VALID_RAW, text: 'short' },
    ];
    expect(filterValidObservations(raws)).toHaveLength(2); // 'short' is 5 chars, valid; '' is invalid
  });

  it('returns empty array for all-invalid input', () => {
    expect(filterValidObservations([{ player_name: '', category: '', sentiment: '', text: '' }])).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(filterValidObservations([])).toHaveLength(0);
  });

  it('keeps observations with exactly 5 chars text', () => {
    const raw = { ...VALID_RAW, text: 'hello' }; // exactly 5 chars
    expect(filterValidObservations([raw])).toHaveLength(1);
  });
});

// ── groupObservationsByPlayer ─────────────────────────────────────────────────

const makeObs = (player_name: string, sentiment: 'positive' | 'needs-work' | 'neutral' = 'neutral'): ValidSnapObservation => ({
  player_name,
  category: 'Offense',
  sentiment,
  text: 'Some observation text here',
  skill_id: null,
});

describe('groupObservationsByPlayer', () => {
  it('groups observations by player_name', () => {
    const obs = [makeObs('Alice'), makeObs('Bob'), makeObs('Alice')];
    const groups = groupObservationsByPlayer(obs);
    expect(groups['Alice']).toHaveLength(2);
    expect(groups['Bob']).toHaveLength(1);
  });

  it('handles Team observations', () => {
    const obs = [makeObs('Team'), makeObs('Alice')];
    const groups = groupObservationsByPlayer(obs);
    expect(groups['Team']).toHaveLength(1);
  });

  it('returns empty object for empty input', () => {
    expect(groupObservationsByPlayer([])).toEqual({});
  });
});

// ── countBySentiment ──────────────────────────────────────────────��───────────

describe('countBySentiment', () => {
  it('counts each sentiment type', () => {
    const obs = [
      makeObs('A', 'positive'),
      makeObs('B', 'positive'),
      makeObs('C', 'needs-work'),
      makeObs('D', 'neutral'),
    ];
    const counts = countBySentiment(obs);
    expect(counts.positive).toBe(2);
    expect(counts['needs-work']).toBe(1);
    expect(counts.neutral).toBe(1);
  });

  it('returns zeros for all sentiments on empty input', () => {
    const counts = countBySentiment([]);
    expect(counts.positive).toBe(0);
    expect(counts['needs-work']).toBe(0);
    expect(counts.neutral).toBe(0);
  });
});

// ── sortObservationsByValence ─────────────────────────────��───────────────────

describe('sortObservationsByValence', () => {
  it('orders positive → neutral → needs-work', () => {
    const obs = [
      makeObs('A', 'needs-work'),
      makeObs('B', 'neutral'),
      makeObs('C', 'positive'),
    ];
    const sorted = sortObservationsByValence(obs);
    expect(sorted[0].sentiment).toBe('positive');
    expect(sorted[1].sentiment).toBe('neutral');
    expect(sorted[2].sentiment).toBe('needs-work');
  });

  it('does not mutate the original array', () => {
    const obs = [makeObs('A', 'needs-work'), makeObs('B', 'positive')];
    const sorted = sortObservationsByValence(obs);
    expect(obs[0].sentiment).toBe('needs-work'); // original unchanged
    expect(sorted[0].sentiment).toBe('positive');
  });

  it('handles empty array', () => {
    expect(sortObservationsByValence([])).toEqual([]);
  });
});

// ── hasObservations ───────────────────────────────────────────────────────────

describe('hasObservations', () => {
  it('returns true when at least one valid observation exists', () => {
    expect(hasObservations([VALID_RAW])).toBe(true);
  });

  it('returns false for all-invalid observations', () => {
    expect(hasObservations([{ player_name: '', category: '', sentiment: '', text: '' }])).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(hasObservations([])).toBe(false);
  });
});

// ── buildObservationSummary ───────────────────────────────────────────────────

describe('buildObservationSummary', () => {
  it('returns "No observations" for empty input', () => {
    expect(buildObservationSummary([])).toBe('No observations');
  });

  it('formats a single positive observation', () => {
    const obs = [makeObs('A', 'positive')];
    const summary = buildObservationSummary(obs);
    expect(summary).toContain('1 observation');
    expect(summary).toContain('1 positive');
  });

  it('formats mixed sentiments', () => {
    const obs = [makeObs('A', 'positive'), makeObs('B', 'positive'), makeObs('C', 'needs-work')];
    const summary = buildObservationSummary(obs);
    expect(summary).toContain('3 observations');
    expect(summary).toContain('2 positive');
    expect(summary).toContain('1 needs-work');
  });

  it('omits zero-count sentiments', () => {
    const obs = [makeObs('A', 'neutral')];
    const summary = buildObservationSummary(obs);
    expect(summary).not.toContain('positive');
    expect(summary).not.toContain('needs-work');
    expect(summary).toContain('neutral');
  });
});

// ── deduplicateObservations ───────────────────────────────────��───────────────

describe('deduplicateObservations', () => {
  it('removes duplicate text (case-insensitive)', () => {
    const obs: ValidSnapObservation[] = [
      { ...makeObs('A'), text: 'Good defensive stance here' },
      { ...makeObs('B'), text: 'GOOD DEFENSIVE STANCE HERE' },
      { ...makeObs('C'), text: 'Different observation text' },
    ];
    const result = deduplicateObservations(obs);
    expect(result).toHaveLength(2);
  });

  it('keeps first occurrence on duplicate', () => {
    const obs: ValidSnapObservation[] = [
      { ...makeObs('Alice'), text: 'Great footwork throughout' },
      { ...makeObs('Bob'), text: 'Great footwork throughout' },
    ];
    const result = deduplicateObservations(obs);
    expect(result[0].player_name).toBe('Alice');
  });

  it('returns all items when no duplicates', () => {
    const obs: ValidSnapObservation[] = [
      { ...makeObs('A'), text: 'First unique observation here' },
      { ...makeObs('B'), text: 'Second unique observation here' },
    ];
    expect(deduplicateObservations(obs)).toHaveLength(2);
  });

  it('handles empty array', () => {
    expect(deduplicateObservations([])).toEqual([]);
  });
});

// ── isLikelyNonSportsPhoto ──────────────────────────────────���─────────────────

describe('isLikelyNonSportsPhoto', () => {
  it('returns true for "not a sports photo" description', () => {
    expect(isLikelyNonSportsPhoto('This is not a sports photo, it shows a landscape.')).toBe(true);
  });

  it('returns true for blurry description', () => {
    expect(isLikelyNonSportsPhoto('The image is blurry and indistinct.')).toBe(true);
  });

  it('returns true for "no players" description', () => {
    expect(isLikelyNonSportsPhoto('No players are visible in this image.')).toBe(true);
  });

  it('returns false for a normal practice description', () => {
    expect(isLikelyNonSportsPhoto('Players in a defensive drill on the basketball court.')).toBe(false);
  });

  it('returns false for empty description', () => {
    expect(isLikelyNonSportsPhoto('')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isLikelyNonSportsPhoto('BLURRY IMAGE')).toBe(true);
  });
});
