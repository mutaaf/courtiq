import { describe, it, expect } from 'vitest';
import {
  isGameLike,
  getGameTypeLabel,
  getGameTypeEmoji,
  findUpcomingGameSession,
  getGameUrgency,
  formatGameTime,
  getCountdownLabel,
  buildGameReminderMsg,
  countAvailabilityIssues,
  type GameSession,
} from './game-day-utils';

// ─── isGameLike ───────────────────────────────────────────────────────────

describe('isGameLike', () => {
  it('returns true for game', () => expect(isGameLike('game')).toBe(true));
  it('returns true for scrimmage', () => expect(isGameLike('scrimmage')).toBe(true));
  it('returns true for tournament', () => expect(isGameLike('tournament')).toBe(true));
  it('returns false for practice', () => expect(isGameLike('practice')).toBe(false));
  it('returns false for training', () => expect(isGameLike('training')).toBe(false));
  it('returns false for empty string', () => expect(isGameLike('')).toBe(false));
});

// ─── getGameTypeLabel ─────────────────────────────────────────────────────

describe('getGameTypeLabel', () => {
  it('labels game correctly', () => expect(getGameTypeLabel('game')).toBe('Game'));
  it('labels scrimmage correctly', () => expect(getGameTypeLabel('scrimmage')).toBe('Scrimmage'));
  it('labels tournament correctly', () => expect(getGameTypeLabel('tournament')).toBe('Tournament'));
  it('falls back to the raw type for unknown', () => expect(getGameTypeLabel('scrimmage_type')).toBe('scrimmage_type'));
});

// ─── getGameTypeEmoji ─────────────────────────────────────────────────────

describe('getGameTypeEmoji', () => {
  it('returns trophy for game', () => expect(getGameTypeEmoji('game')).toBe('🏆'));
  it('returns lightning for scrimmage', () => expect(getGameTypeEmoji('scrimmage')).toBe('⚡'));
  it('returns medal for tournament', () => expect(getGameTypeEmoji('tournament')).toBe('🏅'));
  it('returns fallback emoji for unknown', () => expect(getGameTypeEmoji('mystery')).toBe('🎮'));
});

// ─── findUpcomingGameSession ──────────────────────────────────────────────

const TODAY = '2026-05-13';
const TOMORROW = '2026-05-14';
const DAY_AFTER = '2026-05-15';

function makeSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: 's1',
    type: 'game',
    date: TODAY,
    start_time: '14:00',
    opponent: 'Eagles',
    location: 'Main Court',
    ...overrides,
  };
}

describe('findUpcomingGameSession', () => {
  it('returns null when sessions list is empty', () => {
    expect(findUpcomingGameSession([], TODAY, TOMORROW)).toBeNull();
  });

  it('returns null when no game-like sessions exist', () => {
    const sessions = [makeSession({ type: 'practice' }), makeSession({ type: 'training' })];
    expect(findUpcomingGameSession(sessions, TODAY, TOMORROW)).toBeNull();
  });

  it('finds a game scheduled today', () => {
    const session = makeSession({ date: TODAY, type: 'game' });
    expect(findUpcomingGameSession([session], TODAY, TOMORROW)).toEqual(session);
  });

  it('finds a scrimmage scheduled tomorrow', () => {
    const session = makeSession({ date: TOMORROW, type: 'scrimmage' });
    expect(findUpcomingGameSession([session], TODAY, TOMORROW)).toEqual(session);
  });

  it('finds a tournament scheduled today', () => {
    const session = makeSession({ date: TODAY, type: 'tournament' });
    expect(findUpcomingGameSession([session], TODAY, TOMORROW)).toEqual(session);
  });

  it('ignores games further than tomorrow', () => {
    const future = makeSession({ date: DAY_AFTER, type: 'game' });
    expect(findUpcomingGameSession([future], TODAY, TOMORROW)).toBeNull();
  });

  it('prefers today over tomorrow when both exist', () => {
    const todayGame = makeSession({ id: 'today', date: TODAY, type: 'game' });
    const tomorrowGame = makeSession({ id: 'tomorrow', date: TOMORROW, type: 'game' });
    const result = findUpcomingGameSession([tomorrowGame, todayGame], TODAY, TOMORROW);
    expect(result?.id).toBe('today');
  });

  it('picks earlier start_time when two games on same day', () => {
    const early = makeSession({ id: 'early', date: TODAY, start_time: '10:00' });
    const late = makeSession({ id: 'late', date: TODAY, start_time: '14:00' });
    const result = findUpcomingGameSession([late, early], TODAY, TOMORROW);
    expect(result?.id).toBe('early');
  });

  it('puts sessions without start_time after sessions with one', () => {
    const withTime = makeSession({ id: 'timed', date: TODAY, start_time: '08:00' });
    const noTime = makeSession({ id: 'untimed', date: TODAY, start_time: null });
    expect(findUpcomingGameSession([noTime, withTime], TODAY, TOMORROW)?.id).toBe('timed');
  });

  it('ignores practice sessions even when today', () => {
    const practice = makeSession({ type: 'practice', date: TODAY });
    const game = makeSession({ type: 'game', date: TOMORROW });
    expect(findUpcomingGameSession([practice, game], TODAY, TOMORROW)?.id).toBe('s1');
  });
});

// ─── getGameUrgency ───────────────────────────────────────────────────────

describe('getGameUrgency', () => {
  it('returns tomorrow for a session on tomorrowStr', () => {
    const session = makeSession({ date: TOMORROW });
    const now = new Date('2026-05-13T10:00:00');
    expect(getGameUrgency(session, TODAY, now)).toBe('tomorrow');
  });

  it('returns today for a session today with start_time > 2 hours away', () => {
    const session = makeSession({ date: TODAY, start_time: '15:00' });
    const now = new Date('2026-05-13T10:00:00');
    expect(getGameUrgency(session, TODAY, now)).toBe('today');
  });

  it('returns imminent for a session today starting within 2 hours', () => {
    const session = makeSession({ date: TODAY, start_time: '11:00' });
    const now = new Date('2026-05-13T10:00:00'); // 1 hour before
    expect(getGameUrgency(session, TODAY, now)).toBe('imminent');
  });

  it('returns imminent when game starts in exactly 2 hours', () => {
    const session = makeSession({ date: TODAY, start_time: '12:00' });
    const now = new Date('2026-05-13T10:00:00');
    expect(getGameUrgency(session, TODAY, now)).toBe('imminent');
  });

  it('returns today when no start_time is set', () => {
    const session = makeSession({ date: TODAY, start_time: null });
    const now = new Date('2026-05-13T10:00:00');
    expect(getGameUrgency(session, TODAY, now)).toBe('today');
  });
});

// ─── formatGameTime ───────────────────────────────────────────────────────

describe('formatGameTime', () => {
  it('returns empty string for null', () => expect(formatGameTime(null)).toBe(''));
  it('formats midnight correctly', () => expect(formatGameTime('00:00')).toBe('12:00 AM'));
  it('formats noon correctly', () => expect(formatGameTime('12:00')).toBe('12:00 PM'));
  it('formats 9:05 AM correctly', () => expect(formatGameTime('09:05')).toBe('9:05 AM'));
  it('formats 14:30 correctly', () => expect(formatGameTime('14:30')).toBe('2:30 PM'));
  it('formats 23:59 correctly', () => expect(formatGameTime('23:59')).toBe('11:59 PM'));
  it('formats 13:00 correctly', () => expect(formatGameTime('13:00')).toBe('1:00 PM'));
});

// ─── getCountdownLabel ────────────────────────────────────────────────────

describe('getCountdownLabel', () => {
  it('returns "Tomorrow at 2:30 PM" for a tomorrow session with time', () => {
    const session = makeSession({ date: TOMORROW, start_time: '14:30' });
    const now = new Date('2026-05-13T10:00:00');
    expect(getCountdownLabel(session, TODAY, now)).toBe('Tomorrow at 2:30 PM');
  });

  it('returns "Tomorrow" for a tomorrow session without time', () => {
    const session = makeSession({ date: TOMORROW, start_time: null });
    const now = new Date('2026-05-13T10:00:00');
    expect(getCountdownLabel(session, TODAY, now)).toBe('Tomorrow');
  });

  it('returns "Today" for a today session without time', () => {
    const session = makeSession({ date: TODAY, start_time: null });
    const now = new Date('2026-05-13T10:00:00');
    expect(getCountdownLabel(session, TODAY, now)).toBe('Today');
  });

  it('returns "in 30m" for 30 minutes away', () => {
    const session = makeSession({ date: TODAY, start_time: '10:30' });
    const now = new Date('2026-05-13T10:00:00');
    expect(getCountdownLabel(session, TODAY, now)).toBe('in 30m');
  });

  it('returns "in 3h" for exactly 3 hours away', () => {
    const session = makeSession({ date: TODAY, start_time: '13:00' });
    const now = new Date('2026-05-13T10:00:00');
    expect(getCountdownLabel(session, TODAY, now)).toBe('in 3h');
  });

  it('returns "in 2h 15m" for 2h 15m away', () => {
    const session = makeSession({ date: TODAY, start_time: '12:15' });
    const now = new Date('2026-05-13T10:00:00');
    expect(getCountdownLabel(session, TODAY, now)).toBe('in 2h 15m');
  });

  it('returns the time (not a negative countdown) when game has already started', () => {
    const session = makeSession({ date: TODAY, start_time: '09:00' });
    const now = new Date('2026-05-13T10:00:00'); // 1h past start
    expect(getCountdownLabel(session, TODAY, now)).toBe('Today at 9:00 AM');
  });
});

// ─── buildGameReminderMsg ─────────────────────────────────────────────────

describe('buildGameReminderMsg', () => {
  it('includes game type and date', () => {
    const session = makeSession({ type: 'game', date: TODAY, opponent: null, location: null, start_time: null });
    const msg = buildGameReminderMsg(session, 'Tigers');
    expect(msg).toContain('Game');
    expect(msg).toContain('Tigers');
  });

  it('includes opponent when set', () => {
    const session = makeSession({ opponent: 'Eagles', location: null, start_time: null });
    const msg = buildGameReminderMsg(session, 'Tigers');
    expect(msg).toContain('vs Eagles');
  });

  it('includes location when set', () => {
    const session = makeSession({ location: 'Main Gym', opponent: null, start_time: null });
    const msg = buildGameReminderMsg(session, 'Tigers');
    expect(msg).toContain('Main Gym');
  });

  it('includes start time when set', () => {
    const session = makeSession({ start_time: '14:00', opponent: null, location: null });
    const msg = buildGameReminderMsg(session, 'Tigers');
    expect(msg).toContain('2:00 PM');
  });

  it('includes coach name when provided', () => {
    const session = makeSession({ opponent: null, location: null, start_time: null });
    const msg = buildGameReminderMsg(session, 'Tigers', 'Coach Sam');
    expect(msg).toContain('Coach Sam');
  });

  it('omits coach name when not provided', () => {
    const session = makeSession({ opponent: null, location: null, start_time: null });
    const msg = buildGameReminderMsg(session, 'Tigers');
    expect(msg).not.toContain('undefined');
    expect(msg).not.toContain('null');
  });

  it('uses scrimmage emoji for scrimmage type', () => {
    const session = makeSession({ type: 'scrimmage', opponent: null, location: null, start_time: null });
    const msg = buildGameReminderMsg(session, 'Tigers');
    expect(msg).toContain('⚡');
  });

  it('uses tournament emoji for tournament type', () => {
    const session = makeSession({ type: 'tournament', opponent: null, location: null, start_time: null });
    const msg = buildGameReminderMsg(session, 'Tigers');
    expect(msg).toContain('🏅');
  });
});

// ─── countAvailabilityIssues ──────────────────────────────────────────────

describe('countAvailabilityIssues', () => {
  it('returns 0 for empty availability', () => {
    expect(countAvailabilityIssues({})).toBe(0);
  });

  it('returns 0 when all players are available', () => {
    const avail = { p1: { status: 'available' }, p2: { status: 'available' } };
    expect(countAvailabilityIssues(avail)).toBe(0);
  });

  it('counts injured players', () => {
    const avail = { p1: { status: 'injured' }, p2: { status: 'available' } };
    expect(countAvailabilityIssues(avail)).toBe(1);
  });

  it('counts sick players', () => {
    const avail = { p1: { status: 'sick' } };
    expect(countAvailabilityIssues(avail)).toBe(1);
  });

  it('counts unavailable players', () => {
    const avail = { p1: { status: 'unavailable' } };
    expect(countAvailabilityIssues(avail)).toBe(1);
  });

  it('does not count limited players as issues', () => {
    const avail = { p1: { status: 'limited' } };
    expect(countAvailabilityIssues(avail)).toBe(0);
  });

  it('counts multiple issue statuses correctly', () => {
    const avail = {
      p1: { status: 'injured' },
      p2: { status: 'sick' },
      p3: { status: 'unavailable' },
      p4: { status: 'available' },
      p5: { status: 'limited' },
    };
    expect(countAvailabilityIssues(avail)).toBe(3);
  });
});
