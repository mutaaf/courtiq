import { describe, it, expect } from 'vitest';
import {
  formatPlayerFirstName,
  getPlayerObs,
  getPositiveObs,
  getNeedsWorkObs,
  hasEnoughDataForLetter,
  getTopCategory,
  selectHighlightObs,
  selectGrowthObs,
  getObsCountForPlayer,
  isValidLetterText,
  getLetterPreview,
  countParagraphs,
  buildLetterShareText,
  buildLetterWhatsAppUrl,
  buildLetterPayload,
  buildLetterSummaryLabel,
  getCategoryDisplayLabel,
  type LetterObservation,
  type LetterPlayer,
  type LetterAchievement,
} from '../src/lib/season-letter-utils';

const PLAYER_ID = 'player-1';

function makeObs(
  sentiment: 'positive' | 'needs-work' | 'neutral',
  category: string,
  text: string,
  playerId: string | null = PLAYER_ID,
  daysAgo = 1,
): LetterObservation {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    player_id: playerId,
    category,
    sentiment,
    text,
    created_at: d.toISOString(),
  };
}

const POSITIVE_OBS_SET: LetterObservation[] = [
  makeObs('positive', 'dribbling', 'Great left-hand crossover at half speed — best I have seen this season', PLAYER_ID, 10),
  makeObs('positive', 'defense', 'Excellent closeout on the perimeter shooter, stayed low and active the whole possession', PLAYER_ID, 8),
  makeObs('positive', 'dribbling', 'Beat his defender off the dribble and drew the foul — big improvement', PLAYER_ID, 5),
  makeObs('positive', 'hustle', 'Sprinted back on defense after turnover and forced a contested shot', PLAYER_ID, 3),
];

const NEEDS_WORK_OBS_SET: LetterObservation[] = [
  makeObs('needs-work', 'defense', 'Slow feet on closeout — catching flat-footed on drive', PLAYER_ID, 30),
  makeObs('needs-work', 'dribbling', 'Still defaulting to right hand when under pressure', PLAYER_ID, 20),
];

const ALL_OBS = [...POSITIVE_OBS_SET, ...NEEDS_WORK_OBS_SET];

const PLAYER: LetterPlayer = { id: PLAYER_ID, name: 'Marcus Johnson', jersey_number: 7 };

describe('formatPlayerFirstName', () => {
  it('extracts first name from full name', () => {
    expect(formatPlayerFirstName('Marcus Johnson')).toBe('Marcus');
  });
  it('returns single name unchanged', () => {
    expect(formatPlayerFirstName('Marcus')).toBe('Marcus');
  });
  it('handles triple-barrelled name', () => {
    expect(formatPlayerFirstName('Sarah Jane Smith')).toBe('Sarah');
  });
  it('handles empty string gracefully', () => {
    expect(formatPlayerFirstName('')).toBe('');
  });
});

describe('getPlayerObs', () => {
  it('returns only obs for the given player', () => {
    const other = makeObs('positive', 'dribbling', 'Good pass', 'player-2');
    const result = getPlayerObs([...ALL_OBS, other], PLAYER_ID);
    expect(result.every((o) => o.player_id === PLAYER_ID)).toBe(true);
    expect(result.length).toBe(ALL_OBS.length);
  });
  it('returns empty when no matching obs', () => {
    expect(getPlayerObs(ALL_OBS, 'player-999')).toHaveLength(0);
  });
  it('excludes null player_id obs', () => {
    const teamObs = makeObs('positive', 'teamwork', 'Great team energy', null);
    expect(getPlayerObs([teamObs, ...ALL_OBS], PLAYER_ID).length).toBe(ALL_OBS.length);
  });
});

describe('getPositiveObs / getNeedsWorkObs', () => {
  it('getPositiveObs filters correctly', () => {
    const result = getPositiveObs(ALL_OBS);
    expect(result.every((o) => o.sentiment === 'positive')).toBe(true);
    expect(result.length).toBe(4);
  });
  it('getNeedsWorkObs filters correctly', () => {
    const result = getNeedsWorkObs(ALL_OBS);
    expect(result.every((o) => o.sentiment === 'needs-work')).toBe(true);
    expect(result.length).toBe(2);
  });
  it('neutral obs are excluded from both', () => {
    const neutral = makeObs('neutral', 'general', 'OK session');
    const obs = [...ALL_OBS, neutral];
    expect(getPositiveObs(obs)).not.toContain(neutral);
    expect(getNeedsWorkObs(obs)).not.toContain(neutral);
  });
});

describe('hasEnoughDataForLetter', () => {
  it('returns true with 3+ positive obs', () => {
    expect(hasEnoughDataForLetter(ALL_OBS)).toBe(true);
  });
  it('returns false with only 2 positive obs', () => {
    expect(hasEnoughDataForLetter(POSITIVE_OBS_SET.slice(0, 2))).toBe(false);
  });
  it('returns false with 0 obs', () => {
    expect(hasEnoughDataForLetter([])).toBe(false);
  });
  it('returns false with only needs-work obs', () => {
    expect(hasEnoughDataForLetter(NEEDS_WORK_OBS_SET)).toBe(false);
  });
  it('returns true with exactly 3 positive obs', () => {
    const threePositive = POSITIVE_OBS_SET.slice(0, 3);
    expect(hasEnoughDataForLetter(threePositive)).toBe(true);
  });
});

describe('getTopCategory', () => {
  it('returns the most frequent category', () => {
    expect(getTopCategory(POSITIVE_OBS_SET)).toBe('dribbling'); // 2x dribbling
  });
  it('returns general for empty array', () => {
    expect(getTopCategory([])).toBe('general');
  });
  it('returns single category for single obs', () => {
    const single = [makeObs('positive', 'passing', 'Nice pass')];
    expect(getTopCategory(single)).toBe('passing');
  });
});

describe('selectHighlightObs', () => {
  it('returns up to maxCount obs', () => {
    const result = selectHighlightObs(ALL_OBS, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });
  it('returns only positive obs text', () => {
    const result = selectHighlightObs(ALL_OBS);
    const positiveTexts = POSITIVE_OBS_SET.map((o) => o.text);
    result.forEach((text) => expect(positiveTexts).toContain(text));
  });
  it('returns empty for no positive obs', () => {
    expect(selectHighlightObs(NEEDS_WORK_OBS_SET)).toHaveLength(0);
  });
  it('sorts by text length (longer = more specific) descending', () => {
    const result = selectHighlightObs(POSITIVE_OBS_SET, 4);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].length).toBeGreaterThanOrEqual(result[i].length);
    }
  });
});

describe('selectGrowthObs', () => {
  it('returns oldest needs-work obs first', () => {
    const result = selectGrowthObs(ALL_OBS, 2);
    expect(result.length).toBeLessThanOrEqual(2);
    // Oldest needs-work was 30 days ago (defense)
    expect(result[0]).toContain('flat-footed');
  });
  it('returns empty for no needs-work obs', () => {
    expect(selectGrowthObs(POSITIVE_OBS_SET)).toHaveLength(0);
  });
});

describe('getObsCountForPlayer', () => {
  it('counts only this player obs', () => {
    const otherObs = makeObs('positive', 'shooting', 'Nice shot', 'player-2');
    expect(getObsCountForPlayer([...ALL_OBS, otherObs], PLAYER_ID)).toBe(ALL_OBS.length);
  });
  it('returns 0 for unknown player', () => {
    expect(getObsCountForPlayer(ALL_OBS, 'nobody')).toBe(0);
  });
});

describe('isValidLetterText', () => {
  it('returns true for letter with 100+ chars', () => {
    expect(isValidLetterText('a'.repeat(100))).toBe(true);
  });
  it('returns false for short text', () => {
    expect(isValidLetterText('hello')).toBe(false);
  });
  it('returns false for empty string', () => {
    expect(isValidLetterText('')).toBe(false);
  });
  it('handles whitespace-only string', () => {
    expect(isValidLetterText(' '.repeat(200))).toBe(false);
  });
});

describe('getLetterPreview', () => {
  it('returns full text when shorter than maxChars', () => {
    const text = 'Short letter text';
    expect(getLetterPreview(text, 50)).toBe(text);
  });
  it('truncates at last word boundary', () => {
    const text = 'This is a long letter that should be truncated at a word boundary not in the middle of a word';
    const preview = getLetterPreview(text, 40);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(42); // +1 for ellipsis
    expect(preview).not.toMatch(/\s…$/); // no trailing space before ellipsis
  });
  it('defaults to 120 chars', () => {
    const text = 'a '.repeat(100);
    const preview = getLetterPreview(text);
    expect(preview.length).toBeLessThanOrEqual(122);
  });
});

describe('countParagraphs', () => {
  it('counts double-newline separated paragraphs', () => {
    const text = 'Para one.\n\nPara two.\n\nPara three.';
    expect(countParagraphs(text)).toBe(3);
  });
  it('returns 1 for single paragraph', () => {
    expect(countParagraphs('Just one paragraph here.')).toBe(1);
  });
  it('ignores empty trailing newlines', () => {
    const text = 'Para one.\n\nPara two.\n\n';
    expect(countParagraphs(text)).toBe(2);
  });
  it('handles empty string', () => {
    expect(countParagraphs('')).toBe(0);
  });
});

describe('buildLetterShareText', () => {
  it('includes player name and season label', () => {
    const letter = {
      player_name: 'Marcus',
      season_label: 'Spring 2025',
      letter: 'It was a great season.',
      coach_name: 'Coach Sarah',
    };
    const text = buildLetterShareText(letter);
    expect(text).toContain('Marcus');
    expect(text).toContain('Spring 2025');
    expect(text).toContain('Coach Sarah');
    expect(text).toContain('It was a great season.');
  });
  it('signs off with coach name', () => {
    const letter = {
      player_name: 'Jordan',
      season_label: 'Fall 2024',
      letter: 'You had a wonderful season.',
      coach_name: 'Coach Mike',
    };
    expect(buildLetterShareText(letter)).toContain('— Coach Mike');
  });
});

describe('buildLetterWhatsAppUrl', () => {
  it('uses wa.me with encoded text when no phone', () => {
    const letter = { player_name: 'Marcus', season_label: 'Spring', letter: 'Great season.', coach_name: 'Coach' };
    const url = buildLetterWhatsAppUrl(letter);
    expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
  it('uses direct phone URL when phone provided', () => {
    const letter = { player_name: 'Marcus', season_label: 'Spring', letter: 'Great season.', coach_name: 'Coach' };
    const url = buildLetterWhatsAppUrl(letter, '+1 (555) 123-4567');
    expect(url).toContain('https://wa.me/15551234567');
  });
  it('strips non-digit chars from phone', () => {
    const letter = { player_name: 'A', season_label: 'S', letter: 'T'.repeat(100), coach_name: 'C' };
    const url = buildLetterWhatsAppUrl(letter, '(444) 999-0000');
    expect(url).toContain('wa.me/4449990000');
  });
});

describe('buildLetterPayload', () => {
  const achievements: LetterAchievement[] = [
    { badge_type: 'first_star', awarded_at: new Date().toISOString() },
    { badge_type: 'grinder', awarded_at: new Date().toISOString() },
  ];

  it('includes player name and first name', () => {
    const payload = buildLetterPayload(PLAYER, ALL_OBS, 10, achievements, 'Coach Sarah', 'YMCA Rockets', 'Basketball', 'Spring 2025 Season');
    expect(payload.playerName).toBe('Marcus Johnson');
    expect(payload.firstName).toBe('Marcus');
  });
  it('counts positive obs correctly', () => {
    const payload = buildLetterPayload(PLAYER, ALL_OBS, 10, achievements, 'Coach', 'Team', 'sport', 'Season');
    expect(payload.positiveObsCount).toBe(4);
  });
  it('includes badge types', () => {
    const payload = buildLetterPayload(PLAYER, ALL_OBS, 10, achievements, 'Coach', 'Team', 'sport', 'Season');
    expect(payload.badges).toContain('first_star');
    expect(payload.badges).toContain('grinder');
  });
  it('sets sessionCount from parameter', () => {
    const payload = buildLetterPayload(PLAYER, ALL_OBS, 15, achievements, 'Coach', 'Team', 'sport', 'Season');
    expect(payload.sessionCount).toBe(15);
  });
  it('builds highlight observations from player obs only', () => {
    const otherPlayerObs = makeObs('positive', 'defense', 'Another player obs', 'player-2');
    const payload = buildLetterPayload(PLAYER, [...ALL_OBS, otherPlayerObs], 10, achievements, 'Coach', 'Team', 'sport', 'Season');
    const allHighlightTexts = payload.highlightObservations;
    expect(allHighlightTexts.every((t) => POSITIVE_OBS_SET.map((o) => o.text).includes(t))).toBe(true);
  });
  it('topStrength is the top category of positive obs', () => {
    const payload = buildLetterPayload(PLAYER, ALL_OBS, 10, achievements, 'Coach', 'Team', 'sport', 'Season');
    expect(payload.topStrength).toBe('dribbling');
  });
});

describe('buildLetterSummaryLabel', () => {
  it('pluralizes session correctly', () => {
    expect(buildLetterSummaryLabel(10, 1)).toBe('10 observations across 1 session');
    expect(buildLetterSummaryLabel(5, 3)).toBe('5 observations across 3 sessions');
  });
  it('handles 0 sessions', () => {
    expect(buildLetterSummaryLabel(7, 0)).toBe('7 observations across 0 sessions');
  });
});

describe('getCategoryDisplayLabel', () => {
  it('returns human-readable label for known categories', () => {
    expect(getCategoryDisplayLabel('dribbling')).toBe('Ball Handling');
    expect(getCategoryDisplayLabel('defense')).toBe('Defense');
    expect(getCategoryDisplayLabel('hustle')).toBe('Hustle & Effort');
    expect(getCategoryDisplayLabel('teamwork')).toBe('Teamwork');
  });
  it('capitalizes unknown categories', () => {
    expect(getCategoryDisplayLabel('unknown')).toBe('Unknown');
  });
  it('handles general category', () => {
    expect(getCategoryDisplayLabel('general')).toBe('Overall Development');
  });
});
