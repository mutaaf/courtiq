import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTodayKey,
  getDaysAgo,
  getReminderKey,
  hasAlreadySentReminder,
  isReminderDisabled,
  markReminderSent,
  buildSessionTypeLabel,
  buildSessionTimeLabel,
  getSessionEmoji,
  getLastObservationDate,
  getPlayersNotRecentlyObserved,
  hasEnoughDataForReminder,
  countObsByCategory,
  getTopCategories,
  buildLastSessionSummary,
  buildPracticeReminderHtml,
  buildPracticeReminderSubject,
  type ReminderObservation,
  type ReminderPlayer,
} from '@/lib/practice-reminder-utils';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PLAYERS: ReminderPlayer[] = [
  { id: 'p1', name: 'Marcus', jersey_number: 12 },
  { id: 'p2', name: 'Tyler', jersey_number: 7 },
  { id: 'p3', name: 'Sofia', jersey_number: 23 },
];

function obs(playerId: string, sentiment: string, category: string, daysAgo: number): ReminderObservation {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return { player_id: playerId, sentiment, category, created_at: d.toISOString() };
}

// ─── getTodayKey ──────────────────────────────────────────────────────────────

describe('getTodayKey', () => {
  it('returns YYYY-MM-DD format', () => {
    const key = getTodayKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── getDaysAgo ───────────────────────────────────────────────────────────────

describe('getDaysAgo', () => {
  it('returns 0 for a timestamp just now', () => {
    expect(getDaysAgo(new Date().toISOString())).toBe(0);
  });

  it('returns 1 for yesterday', () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(getDaysAgo(yesterday)).toBe(1);
  });

  it('returns 7 for one week ago', () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(getDaysAgo(weekAgo)).toBe(7);
  });
});

// ─── getReminderKey ───────────────────────────────────────────────────────────

describe('getReminderKey', () => {
  it('returns correct key format', () => {
    expect(getReminderKey('2025-04-28')).toBe('practice_reminder_2025-04-28');
  });
});

// ─── hasAlreadySentReminder ───────────────────────────────────────────────────

describe('hasAlreadySentReminder', () => {
  it('returns false when preferences is null', () => {
    expect(hasAlreadySentReminder(null, '2025-04-28')).toBe(false);
  });

  it('returns false when key not present', () => {
    expect(hasAlreadySentReminder({ other: true }, '2025-04-28')).toBe(false);
  });

  it('returns true when key is present and true', () => {
    const marked = markReminderSent({}, '2025-04-28');
    expect(hasAlreadySentReminder(marked, '2025-04-28')).toBe(true);
  });

  it('returns false for a different date', () => {
    const marked = markReminderSent({}, '2025-04-28');
    expect(hasAlreadySentReminder(marked, '2025-04-29')).toBe(false);
  });
});

// ─── isReminderDisabled ───────────────────────────────────────────────────────

describe('isReminderDisabled', () => {
  it('returns false when preferences is null', () => {
    expect(isReminderDisabled(null)).toBe(false);
  });

  it('returns false when flag not set', () => {
    expect(isReminderDisabled({ foo: 'bar' })).toBe(false);
  });

  it('returns true when disable flag is set', () => {
    expect(isReminderDisabled({ disable_practice_reminders: true })).toBe(true);
  });

  it('returns false when flag is false', () => {
    expect(isReminderDisabled({ disable_practice_reminders: false })).toBe(false);
  });
});

// ─── markReminderSent ─────────────────────────────────────────────────────────

describe('markReminderSent', () => {
  it('sets the key in an empty preferences object', () => {
    const result = markReminderSent({}, '2025-04-28');
    expect(result['practice_reminder_2025-04-28']).toBe(true);
  });

  it('preserves existing keys', () => {
    const result = markReminderSent({ drip_sent: ['d1'] }, '2025-04-28');
    expect(result['drip_sent']).toEqual(['d1']);
    expect(result['practice_reminder_2025-04-28']).toBe(true);
  });

  it('handles null preferences gracefully', () => {
    const result = markReminderSent(null, '2025-04-28');
    expect(result['practice_reminder_2025-04-28']).toBe(true);
  });
});

// ─── buildSessionTypeLabel ────────────────────────────────────────────────────

describe('buildSessionTypeLabel', () => {
  it.each([
    ['practice', 'Practice'],
    ['game', 'Game'],
    ['scrimmage', 'Scrimmage'],
    ['tournament', 'Tournament'],
    ['training', 'Training'],
  ])('maps %s to %s', (type, expected) => {
    expect(buildSessionTypeLabel(type)).toBe(expected);
  });

  it('capitalises unknown types', () => {
    expect(buildSessionTypeLabel('unknown')).toBe('Unknown');
  });
});

// ─── buildSessionTimeLabel ────────────────────────────────────────────────────

describe('buildSessionTimeLabel', () => {
  it('returns empty string for null', () => {
    expect(buildSessionTimeLabel(null)).toBe('');
  });

  it('converts 17:30:00 to 5:30 PM', () => {
    expect(buildSessionTimeLabel('17:30:00')).toBe('5:30 PM');
  });

  it('converts 09:00:00 to 9:00 AM', () => {
    expect(buildSessionTimeLabel('09:00:00')).toBe('9:00 AM');
  });

  it('converts 12:00:00 to 12:00 PM', () => {
    expect(buildSessionTimeLabel('12:00:00')).toBe('12:00 PM');
  });

  it('converts 00:00:00 to 12:00 AM', () => {
    expect(buildSessionTimeLabel('00:00:00')).toBe('12:00 AM');
  });
});

// ─── getSessionEmoji ──────────────────────────────────────────────────────────

describe('getSessionEmoji', () => {
  it('returns 🏃 for practice', () => {
    expect(getSessionEmoji('practice')).toBe('🏃');
  });

  it('returns 🏆 for game', () => {
    expect(getSessionEmoji('game')).toBe('🏆');
  });

  it('returns fallback for unknown type', () => {
    expect(getSessionEmoji('mystery')).toBe('📅');
  });
});

// ─── getLastObservationDate ───────────────────────────────────────────────────

describe('getLastObservationDate', () => {
  it('returns null when player has no observations', () => {
    expect(getLastObservationDate('p1', [])).toBeNull();
  });

  it('returns the most recent observation date', () => {
    const observations = [
      obs('p1', 'positive', 'dribbling', 5),
      obs('p1', 'positive', 'defense', 2),
      obs('p1', 'needs-work', 'passing', 10),
    ];
    const result = getLastObservationDate('p1', observations);
    // Most recent is 2 days ago
    const twoAgo = getDaysAgo(result!);
    expect(twoAgo).toBeLessThanOrEqual(3);
  });

  it('ignores observations for other players', () => {
    const observations = [obs('p2', 'positive', 'dribbling', 1)];
    expect(getLastObservationDate('p1', observations)).toBeNull();
  });
});

// ─── getPlayersNotRecentlyObserved ────────────────────────────────────────────

describe('getPlayersNotRecentlyObserved', () => {
  it('returns all players when no observations exist', () => {
    const result = getPlayersNotRecentlyObserved(PLAYERS, []);
    expect(result).toHaveLength(3);
  });

  it('excludes players observed within the cutoff', () => {
    const observations = [
      obs('p1', 'positive', 'dribbling', 3), // 3 days ago — within 7-day cutoff
    ];
    const result = getPlayersNotRecentlyObserved(PLAYERS, observations, 7);
    expect(result.map((p) => p.id)).not.toContain('p1');
    expect(result.map((p) => p.id)).toContain('p2');
    expect(result.map((p) => p.id)).toContain('p3');
  });

  it('includes players observed EXACTLY at the cutoff threshold', () => {
    const observations = [obs('p1', 'positive', 'dribbling', 7)];
    const result = getPlayersNotRecentlyObserved(PLAYERS, observations, 7);
    expect(result.map((p) => p.id)).toContain('p1');
  });

  it('returns empty array when all players observed recently', () => {
    const observations = PLAYERS.map((p) => obs(p.id, 'positive', 'dribbling', 1));
    const result = getPlayersNotRecentlyObserved(PLAYERS, observations, 7);
    expect(result).toHaveLength(0);
  });

  it('uses a custom cutoff', () => {
    const observations = [obs('p1', 'positive', 'dribbling', 3)];
    // 2-day cutoff: p1 was 3 days ago so should appear as neglected
    const result = getPlayersNotRecentlyObserved(PLAYERS, observations, 2);
    expect(result.map((p) => p.id)).toContain('p1');
  });
});

// ─── hasEnoughDataForReminder ─────────────────────────────────────────────────

describe('hasEnoughDataForReminder', () => {
  it('returns false with fewer than 2 players', () => {
    const onePlayer = [PLAYERS[0]];
    const observations = [obs('p1', 'positive', 'dribbling', 1)];
    expect(hasEnoughDataForReminder(onePlayer, observations)).toBe(false);
  });

  it('returns false with fewer than 3 observations', () => {
    const twoObs = [obs('p1', 'positive', 'dribbling', 1), obs('p2', 'positive', 'defense', 2)];
    expect(hasEnoughDataForReminder(PLAYERS, twoObs)).toBe(false);
  });

  it('returns true with enough players and observations', () => {
    const observations = PLAYERS.flatMap((p) => [obs(p.id, 'positive', 'dribbling', 1)]);
    expect(hasEnoughDataForReminder(PLAYERS, observations)).toBe(true);
  });
});

// ─── countObsByCategory ───────────────────────────────────────────────────────

describe('countObsByCategory', () => {
  it('returns empty object when no matching sentiment', () => {
    const observations = [obs('p1', 'positive', 'dribbling', 1)];
    expect(countObsByCategory(observations, 'needs-work')).toEqual({});
  });

  it('counts correctly by category', () => {
    const observations = [
      obs('p1', 'positive', 'dribbling', 1),
      obs('p2', 'positive', 'dribbling', 2),
      obs('p3', 'positive', 'defense', 3),
    ];
    const result = countObsByCategory(observations, 'positive');
    expect(result['dribbling']).toBe(2);
    expect(result['defense']).toBe(1);
  });

  it('uses "general" for null category', () => {
    const observations: ReminderObservation[] = [
      { player_id: 'p1', sentiment: 'positive', category: null, created_at: new Date().toISOString() },
    ];
    const result = countObsByCategory(observations, 'positive');
    expect(result['general']).toBe(1);
  });
});

// ─── getTopCategories ─────────────────────────────────────────────────────────

describe('getTopCategories', () => {
  it('returns empty array for empty input', () => {
    expect(getTopCategories({})).toEqual([]);
  });

  it('returns top N categories sorted by count', () => {
    const counts = { dribbling: 5, defense: 3, passing: 1 };
    expect(getTopCategories(counts, 2)).toEqual(['Dribbling', 'Defense']);
  });

  it('capitalises category names', () => {
    const counts = { 'free throws': 1 };
    expect(getTopCategories(counts, 1)).toEqual(['Free throws']);
  });
});

// ─── buildLastSessionSummary ──────────────────────────────────────────────────

describe('buildLastSessionSummary', () => {
  it('builds summary from observations', () => {
    const sessionDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const observations = [
      obs('p1', 'positive', 'defense', 2),
      obs('p1', 'positive', 'defense', 2),
      obs('p2', 'needs-work', 'dribbling', 2),
    ];
    const result = buildLastSessionSummary(sessionDate, observations, 10);
    expect(result.totalObs).toBe(3);
    expect(result.playerCount).toBe(2);
    expect(result.strongCategories).toContain('Defense');
    expect(result.weakCategories).toContain('Dribbling');
    expect(result.daysAgo).toBe(2);
  });

  it('caps playerCount at roster size', () => {
    const sessionDate = new Date().toISOString().slice(0, 10);
    const observations = Array.from({ length: 20 }, (_, i) => obs(`p${i}`, 'positive', 'defense', 0));
    const result = buildLastSessionSummary(sessionDate, observations, 5);
    expect(result.playerCount).toBeLessThanOrEqual(5);
  });
});

// ─── buildPracticeReminderSubject ─────────────────────────────────────────────

describe('buildPracticeReminderSubject', () => {
  it('includes emoji, session type, and team name', () => {
    const subject = buildPracticeReminderSubject('practice', '17:30:00', 'YMCA Rockets');
    expect(subject).toContain('🏃');
    expect(subject).toContain('Practice');
    expect(subject).toContain('5:30 PM');
    expect(subject).toContain('YMCA Rockets');
  });

  it('omits time when startTime is null', () => {
    const subject = buildPracticeReminderSubject('game', null, 'Tigers');
    expect(subject).toContain('Game');
    expect(subject).not.toContain('PM');
    expect(subject).not.toContain('AM');
  });
});

// ─── buildPracticeReminderHtml ────────────────────────────────────────────────

describe('buildPracticeReminderHtml', () => {
  const baseParams = {
    coachName: 'Sarah Johnson',
    teamName: 'YMCA Rockets',
    sessionType: 'practice',
    startTime: '17:30:00',
    sessionId: 'session-abc',
    players: PLAYERS,
    neglectedPlayers: [PLAYERS[0]],
    lastSession: null,
    appUrl: 'https://app.example.com',
  };

  it('returns a non-empty HTML string', () => {
    const html = buildPracticeReminderHtml(baseParams);
    expect(html).toBeTruthy();
    expect(html.length).toBeGreaterThan(200);
  });

  it('includes coach first name', () => {
    const html = buildPracticeReminderHtml(baseParams);
    expect(html).toContain('Sarah');
  });

  it('includes team name', () => {
    const html = buildPracticeReminderHtml(baseParams);
    expect(html).toContain('YMCA Rockets');
  });

  it('includes session time', () => {
    const html = buildPracticeReminderHtml(baseParams);
    expect(html).toContain('5:30 PM');
  });

  it('includes neglected player names', () => {
    const html = buildPracticeReminderHtml(baseParams);
    expect(html).toContain('Marcus');
  });

  it('includes timer deep-link', () => {
    const html = buildPracticeReminderHtml(baseParams);
    expect(html).toContain('/sessions/session-abc/timer');
  });

  it('shows all-covered message when neglectedPlayers is empty', () => {
    const html = buildPracticeReminderHtml({ ...baseParams, neglectedPlayers: [] });
    expect(html).toContain('all players observed recently');
  });

  it('includes last session summary when provided', () => {
    const html = buildPracticeReminderHtml({
      ...baseParams,
      lastSession: {
        totalObs: 12,
        playerCount: 8,
        strongCategories: ['Defense'],
        weakCategories: ['Dribbling'],
        daysAgo: 3,
      },
    });
    expect(html).toContain('12');
    expect(html).toContain('Defense');
    expect(html).toContain('Dribbling');
    expect(html).toContain('3 days ago');
  });

  it('does not include last session section when null', () => {
    const html = buildPracticeReminderHtml({ ...baseParams, lastSession: null });
    expect(html).not.toContain('Last session');
  });

  it('handles coach with single-word name gracefully', () => {
    const html = buildPracticeReminderHtml({ ...baseParams, coachName: 'Coach' });
    expect(html).toContain('Coach');
  });
});
