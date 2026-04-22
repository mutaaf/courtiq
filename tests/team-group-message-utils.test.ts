import { describe, it, expect } from 'vitest';
import {
  getSessionEmoji,
  getSessionTypeLabel,
  buildSessionLabel,
  getPositiveObsCount,
  getNeedsWorkObsCount,
  extractFocusAreas,
  hasEnoughDataForGroupMessage,
  countChars,
  truncateMessage,
  buildPreviewText,
  isValidGroupMessage,
  formatGroupMessage,
  buildShareText,
  buildWhatsAppUrl,
  countFocusAreas,
  hasNextSessionNote,
} from '@/lib/team-group-message-utils';
import type { TeamGroupMessage } from '@/lib/team-group-message-utils';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_MESSAGE: TeamGroupMessage = {
  message: 'Great energy from the whole team today. Everyone worked hard on their defensive positioning.',
  session_label: "Tuesday's Practice — Apr 22",
  team_highlight: 'The team held their defensive stance for the full drill.',
  coaching_focus: ['Defense', 'Footwork'],
  encouragement: 'Keep up the effort and we will see big improvements by next game!',
};

const FULL_MESSAGE: TeamGroupMessage = {
  ...BASE_MESSAGE,
  next_session_note: 'Next practice is Thursday at 4 pm — bring water!',
};

const GAME_SESSION_OBS = [
  { sentiment: 'positive', category: 'Defense' },
  { sentiment: 'positive', category: 'Offense' },
  { sentiment: 'needs-work', category: 'Defense' },
  { sentiment: 'neutral', category: 'Effort' },
];

// ── getSessionEmoji ────────────────────────────────────────────────────────────

describe('getSessionEmoji', () => {
  it('returns trophy for game', () => {
    expect(getSessionEmoji('game')).toBe('🏆');
  });

  it('returns crossed swords for scrimmage', () => {
    expect(getSessionEmoji('scrimmage')).toBe('⚔️');
  });

  it('returns medal for tournament', () => {
    expect(getSessionEmoji('tournament')).toBe('🥇');
  });

  it('returns flex for training', () => {
    expect(getSessionEmoji('training')).toBe('💪');
  });

  it('returns basketball for practice', () => {
    expect(getSessionEmoji('practice')).toBe('🏀');
  });

  it('returns basketball for unknown type', () => {
    expect(getSessionEmoji('unknown')).toBe('🏀');
  });
});

// ── getSessionTypeLabel ────────────────────────────────────────────────────────

describe('getSessionTypeLabel', () => {
  it('labels game sessions', () => expect(getSessionTypeLabel('game')).toBe('Game'));
  it('labels scrimmage sessions', () => expect(getSessionTypeLabel('scrimmage')).toBe('Scrimmage'));
  it('labels tournament sessions', () => expect(getSessionTypeLabel('tournament')).toBe('Tournament'));
  it('labels training sessions', () => expect(getSessionTypeLabel('training')).toBe('Training'));
  it('defaults to Practice', () => expect(getSessionTypeLabel('practice')).toBe('Practice'));
  it('defaults unknown types to Practice', () => expect(getSessionTypeLabel('other')).toBe('Practice'));
});

// ── buildSessionLabel ──────────────────────────────────────────────────────────

describe('buildSessionLabel', () => {
  it('builds a practice label with weekday and date', () => {
    const label = buildSessionLabel('practice', '2026-04-22');
    expect(label).toContain('Practice');
    expect(label).toContain('Apr 22');
  });

  it('includes opponent for game sessions', () => {
    const label = buildSessionLabel('game', '2026-04-22', 'Northside');
    expect(label).toContain('Game vs Northside');
  });

  it('includes opponent for scrimmage sessions', () => {
    const label = buildSessionLabel('scrimmage', '2026-04-22', 'West Side');
    expect(label).toContain('Scrimmage vs West Side');
  });

  it('omits opponent for practice sessions even if provided', () => {
    const label = buildSessionLabel('practice', '2026-04-22', 'Some Team');
    expect(label).not.toContain('vs');
  });

  it('omits opponent when null', () => {
    const label = buildSessionLabel('game', '2026-04-22', null);
    expect(label).not.toContain('vs');
  });

  it('includes the date in short format', () => {
    const label = buildSessionLabel('training', '2026-04-22');
    expect(label).toContain('Apr 22');
  });
});

// ── getPositiveObsCount ────────────────────────────────────────────────────────

describe('getPositiveObsCount', () => {
  it('counts positive observations', () => {
    expect(getPositiveObsCount(GAME_SESSION_OBS)).toBe(2);
  });

  it('returns 0 when no positive observations', () => {
    expect(getPositiveObsCount([{ sentiment: 'needs-work' }])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(getPositiveObsCount([])).toBe(0);
  });
});

// ── getNeedsWorkObsCount ───────────────────────────────────────────────────────

describe('getNeedsWorkObsCount', () => {
  it('counts needs-work observations', () => {
    expect(getNeedsWorkObsCount(GAME_SESSION_OBS)).toBe(1);
  });

  it('returns 0 for empty array', () => {
    expect(getNeedsWorkObsCount([])).toBe(0);
  });
});

// ── extractFocusAreas ─────────────────────────────────────────────────────────

describe('extractFocusAreas', () => {
  it('returns unique categories', () => {
    const areas = extractFocusAreas(GAME_SESSION_OBS);
    expect(areas).toContain('Defense');
    expect(areas).toContain('Offense');
    expect(areas).toContain('Effort');
    // Defense appears twice but should only be listed once
    expect(areas.filter((a) => a === 'Defense')).toHaveLength(1);
  });

  it('limits results to 4 categories', () => {
    const obs = [
      { category: 'A' }, { category: 'B' }, { category: 'C' },
      { category: 'D' }, { category: 'E' },
    ];
    expect(extractFocusAreas(obs)).toHaveLength(4);
  });

  it('handles observations without category', () => {
    const obs = [{ category: 'Defense' }, { category: undefined }];
    const areas = extractFocusAreas(obs);
    expect(areas).toEqual(['Defense']);
  });

  it('returns empty array for empty input', () => {
    expect(extractFocusAreas([])).toEqual([]);
  });
});

// ── hasEnoughDataForGroupMessage ───────────────────────────────────────────────

describe('hasEnoughDataForGroupMessage', () => {
  it('returns true for 1 observation', () => {
    expect(hasEnoughDataForGroupMessage(1)).toBe(true);
  });

  it('returns true for many observations', () => {
    expect(hasEnoughDataForGroupMessage(20)).toBe(true);
  });

  it('returns false for 0 observations', () => {
    expect(hasEnoughDataForGroupMessage(0)).toBe(false);
  });
});

// ── countChars ────────────────────────────────────────────────────────────────

describe('countChars', () => {
  it('counts characters correctly', () => {
    expect(countChars('hello')).toBe(5);
  });

  it('returns 0 for empty string', () => {
    expect(countChars('')).toBe(0);
  });
});

// ── truncateMessage ───────────────────────────────────────────────────────────

describe('truncateMessage', () => {
  it('returns message unchanged when within limit', () => {
    expect(truncateMessage('hello', 10)).toBe('hello');
  });

  it('truncates and appends ellipsis', () => {
    const result = truncateMessage('hello world', 8);
    expect(result).toBe('hello...');
    expect(result.length).toBe(8);
  });

  it('handles exact length', () => {
    expect(truncateMessage('hello', 5)).toBe('hello');
  });
});

// ── buildPreviewText ──────────────────────────────────────────────────────────

describe('buildPreviewText', () => {
  it('uses default max length of 80', () => {
    const long = 'x'.repeat(100);
    expect(buildPreviewText(long).length).toBe(80);
  });

  it('uses custom max length', () => {
    const long = 'x'.repeat(50);
    expect(buildPreviewText(long, 30).length).toBe(30);
  });

  it('returns short messages unchanged', () => {
    expect(buildPreviewText('short')).toBe('short');
  });
});

// ── isValidGroupMessage ───────────────────────────────────────────────────────

describe('isValidGroupMessage', () => {
  it('returns true for a complete valid message', () => {
    expect(isValidGroupMessage(BASE_MESSAGE)).toBe(true);
  });

  it('returns true when next_session_note is absent', () => {
    const { next_session_note: _, ...noNote } = FULL_MESSAGE;
    expect(isValidGroupMessage(noNote)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidGroupMessage(null)).toBe(false);
  });

  it('returns false for missing message field', () => {
    const { message: _, ...noMsg } = BASE_MESSAGE;
    expect(isValidGroupMessage(noMsg)).toBe(false);
  });

  it('returns false for empty message', () => {
    expect(isValidGroupMessage({ ...BASE_MESSAGE, message: '' })).toBe(false);
  });

  it('returns false when coaching_focus is not an array', () => {
    expect(isValidGroupMessage({ ...BASE_MESSAGE, coaching_focus: 'Defense' })).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isValidGroupMessage('string')).toBe(false);
    expect(isValidGroupMessage(42)).toBe(false);
  });
});

// ── formatGroupMessage ────────────────────────────────────────────────────────

describe('formatGroupMessage', () => {
  it('includes session label with emoji', () => {
    const text = formatGroupMessage(BASE_MESSAGE);
    expect(text).toContain("🏀 Tuesday's Practice");
  });

  it('includes the main message', () => {
    const text = formatGroupMessage(BASE_MESSAGE);
    expect(text).toContain(BASE_MESSAGE.message);
  });

  it('includes coaching focus areas', () => {
    const text = formatGroupMessage(BASE_MESSAGE);
    expect(text).toContain('Defense');
    expect(text).toContain('Footwork');
  });

  it('includes encouragement', () => {
    const text = formatGroupMessage(BASE_MESSAGE);
    expect(text).toContain(BASE_MESSAGE.encouragement);
  });

  it('includes coach name when provided', () => {
    const text = formatGroupMessage(BASE_MESSAGE, 'Johnson');
    expect(text).toContain('Coach Johnson');
  });

  it('includes team name when provided', () => {
    const text = formatGroupMessage(BASE_MESSAGE, 'Johnson', 'Tigers');
    expect(text).toContain('Tigers');
  });

  it('includes next session note when present', () => {
    const text = formatGroupMessage(FULL_MESSAGE);
    expect(text).toContain(FULL_MESSAGE.next_session_note!);
    expect(text).toContain('📅');
  });

  it('omits next session note when absent', () => {
    const text = formatGroupMessage(BASE_MESSAGE);
    expect(text).not.toContain('📅');
  });
});

// ── buildShareText ────────────────────────────────────────────────────────────

describe('buildShareText', () => {
  it('returns same result as formatGroupMessage', () => {
    expect(buildShareText(BASE_MESSAGE, 'Lee', 'Stars')).toBe(
      formatGroupMessage(BASE_MESSAGE, 'Lee', 'Stars')
    );
  });
});

// ── buildWhatsAppUrl ──────────────────────────────────────────────────────────

describe('buildWhatsAppUrl', () => {
  it('starts with wa.me', () => {
    const url = buildWhatsAppUrl('Hello team!');
    expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  it('URL-encodes the message', () => {
    const url = buildWhatsAppUrl('Hello & goodbye');
    expect(url).toContain(encodeURIComponent('Hello & goodbye'));
  });
});

// ── countFocusAreas ───────────────────────────────────────────────────────────

describe('countFocusAreas', () => {
  it('counts coaching focus areas', () => {
    expect(countFocusAreas(BASE_MESSAGE)).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(countFocusAreas({ ...BASE_MESSAGE, coaching_focus: [] })).toBe(0);
  });
});

// ── hasNextSessionNote ────────────────────────────────────────────────────────

describe('hasNextSessionNote', () => {
  it('returns true when note is present', () => {
    expect(hasNextSessionNote(FULL_MESSAGE)).toBe(true);
  });

  it('returns false when note is absent', () => {
    expect(hasNextSessionNote(BASE_MESSAGE)).toBe(false);
  });

  it('returns false when note is empty string', () => {
    expect(hasNextSessionNote({ ...BASE_MESSAGE, next_session_note: '' })).toBe(false);
  });

  it('returns false when note is whitespace only', () => {
    expect(hasNextSessionNote({ ...BASE_MESSAGE, next_session_note: '   ' })).toBe(false);
  });
});
