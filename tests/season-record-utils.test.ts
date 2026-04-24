import { describe, it, expect } from 'vitest';
import {
  isGameType,
  parseResult,
  extractScore,
  buildResultString,
  filterGameSessions,
  filterSessionsWithResults,
  sortSessionsByDate,
  getLastNGameSessions,
  calculateSeasonRecord,
  totalGamesPlayed,
  getWinPct,
  getWinPctLabel,
  hasEnoughDataForRecord,
  isWinningRecord,
  isUnbeatenRecord,
  hasTies,
  formatRecordString,
  getRecentFormArray,
  getRecentFormString,
  buildSeasonRecordSummary,
  getCurrentStreak,
  formatStreakLabel,
  getRecordLabel,
  getRecordColor,
  getResultBadgeClasses,
  getResultLabel,
  countBySessionType,
  type RecordSession,
  type SeasonRecord,
} from '@/lib/season-record-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSession(
  overrides: Partial<RecordSession> & { result?: string | null },
): RecordSession {
  return {
    id: 'sess-1',
    type: 'game',
    date: '2024-03-01',
    result: null,
    opponent: null,
    ...overrides,
  };
}

const win1 = makeSession({ id: 's1', date: '2024-03-01', result: 'win' });
const win2 = makeSession({ id: 's2', date: '2024-03-08', result: 'win' });
const win3 = makeSession({ id: 's3', date: '2024-03-15', result: 'win' });
const loss1 = makeSession({ id: 's4', date: '2024-03-22', result: 'loss' });
const loss2 = makeSession({ id: 's5', date: '2024-03-29', result: 'loss' });
const tie1 = makeSession({ id: 's6', date: '2024-04-05', result: 'tie' });
const noResult = makeSession({ id: 's7', date: '2024-04-12', result: null });
const practice = makeSession({ id: 's8', type: 'practice', date: '2024-04-19', result: null });
const scrimmage = makeSession({ id: 's9', type: 'scrimmage', date: '2024-04-01', result: 'win' });
const tournament = makeSession({ id: 's10', type: 'tournament', date: '2024-04-01', result: 'loss' });

// ─── isGameType ───────────────────────────────────────────────────────────────

describe('isGameType', () => {
  it('returns true for game', () => expect(isGameType('game')).toBe(true));
  it('returns true for scrimmage', () => expect(isGameType('scrimmage')).toBe(true));
  it('returns true for tournament', () => expect(isGameType('tournament')).toBe(true));
  it('returns false for practice', () => expect(isGameType('practice')).toBe(false));
  it('returns false for training', () => expect(isGameType('training')).toBe(false));
});

// ─── parseResult ──────────────────────────────────────────────────────────────

describe('parseResult', () => {
  it('parses "win"', () => expect(parseResult('win')).toBe('win'));
  it('parses "W"', () => expect(parseResult('W')).toBe('win'));
  it('parses "loss"', () => expect(parseResult('loss')).toBe('loss'));
  it('parses "L"', () => expect(parseResult('L')).toBe('loss'));
  it('parses "lose"', () => expect(parseResult('lose')).toBe('loss'));
  it('parses "tie"', () => expect(parseResult('tie')).toBe('tie'));
  it('parses "T"', () => expect(parseResult('T')).toBe('tie'));
  it('parses "draw"', () => expect(parseResult('draw')).toBe('tie'));
  it('parses "d"', () => expect(parseResult('d')).toBe('tie'));
  it('returns null for empty string', () => expect(parseResult('')).toBe(null));
  it('returns null for null', () => expect(parseResult(null)).toBe(null));
  it('returns null for unknown value', () => expect(parseResult('forfeit')).toBe(null));
  it('parses "win 42-38"', () => expect(parseResult('win 42-38')).toBe('win'));
  it('parses "loss 30-35"', () => expect(parseResult('loss 30-35')).toBe('loss'));
  it('parses "tie 28-28"', () => expect(parseResult('tie 28-28')).toBe('tie'));
  it('parses "w 15-10"', () => expect(parseResult('w 15-10')).toBe('win'));
  it('parses "l 8-12"', () => expect(parseResult('l 8-12')).toBe('loss'));
  it('parses "t 5-5"', () => expect(parseResult('t 5-5')).toBe('tie'));
});

// ─── extractScore ─────────────────────────────────────────────────────────────

describe('extractScore', () => {
  it('returns null for plain "win"', () => expect(extractScore('win')).toBe(null));
  it('returns null for null', () => expect(extractScore(null)).toBe(null));
  it('extracts score from "win 42-38"', () => expect(extractScore('win 42-38')).toBe('42-38'));
  it('extracts score from "loss 30-35"', () => expect(extractScore('loss 30-35')).toBe('30-35'));
  it('extracts score from "tie 28-28"', () => expect(extractScore('tie 28-28')).toBe('28-28'));
  it('handles multi-word score "win Final 42-38"', () => expect(extractScore('win Final 42-38')).toBe('Final 42-38'));
});

// ─── buildResultString ────────────────────────────────────────────────────────

describe('buildResultString', () => {
  it('returns just outcome when no score', () => expect(buildResultString('win')).toBe('win'));
  it('returns just outcome when score is empty', () => expect(buildResultString('win', '')).toBe('win'));
  it('returns outcome + score', () => expect(buildResultString('win', '42-38')).toBe('win 42-38'));
  it('trims score whitespace', () => expect(buildResultString('loss', '  30-35  ')).toBe('loss 30-35'));
  it('handles tie with score', () => expect(buildResultString('tie', '28-28')).toBe('tie 28-28'));
});

// ─── filterGameSessions ───────────────────────────────────────────────────────

describe('filterGameSessions', () => {
  const sessions = [win1, practice, scrimmage, tournament];
  it('keeps game, scrimmage, tournament', () => {
    const result = filterGameSessions(sessions);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.id)).not.toContain('s8');
  });
});

// ─── filterSessionsWithResults ────────────────────────────────────────────────

describe('filterSessionsWithResults', () => {
  it('excludes sessions with no result', () => {
    const result = filterSessionsWithResults([win1, noResult, practice]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s1');
  });
  it('excludes non-game sessions even with a result', () => {
    const trainingWithResult = makeSession({ type: 'training', result: 'win' });
    expect(filterSessionsWithResults([trainingWithResult])).toHaveLength(0);
  });
});

// ─── sortSessionsByDate ───────────────────────────────────────────────────────

describe('sortSessionsByDate', () => {
  it('sorts chronologically', () => {
    const sorted = sortSessionsByDate([loss1, win1, win2]);
    expect(sorted.map((s) => s.id)).toEqual(['s1', 's2', 's4']);
  });
  it('does not mutate original array', () => {
    const original = [loss1, win1];
    sortSessionsByDate(original);
    expect(original[0].id).toBe('s4');
  });
});

// ─── getLastNGameSessions ─────────────────────────────────────────────────────

describe('getLastNGameSessions', () => {
  const sessions = [win1, win2, loss1, loss2, tie1];
  it('returns last N sessions in date order', () => {
    const last3 = getLastNGameSessions(sessions, 3);
    expect(last3).toHaveLength(3);
    expect(last3[last3.length - 1].id).toBe('s6'); // tie1 is latest
  });
  it('returns all if N > total', () => {
    expect(getLastNGameSessions(sessions, 10)).toHaveLength(5);
  });
});

// ─── calculateSeasonRecord ────────────────────────────────────────────────────

describe('calculateSeasonRecord', () => {
  it('counts wins, losses, ties correctly', () => {
    const record = calculateSeasonRecord([win1, win2, loss1, tie1]);
    expect(record).toEqual({ wins: 2, losses: 1, ties: 1 });
  });
  it('ignores sessions with no result', () => {
    expect(calculateSeasonRecord([noResult])).toEqual({ wins: 0, losses: 0, ties: 0 });
  });
  it('ignores practice sessions', () => {
    expect(calculateSeasonRecord([practice])).toEqual({ wins: 0, losses: 0, ties: 0 });
  });
  it('handles empty input', () => {
    expect(calculateSeasonRecord([])).toEqual({ wins: 0, losses: 0, ties: 0 });
  });
});

// ─── totalGamesPlayed ────────────────────────────────────────────────────────

describe('totalGamesPlayed', () => {
  it('sums wins + losses + ties', () => {
    expect(totalGamesPlayed({ wins: 3, losses: 2, ties: 1 })).toBe(6);
  });
  it('returns 0 for empty record', () => {
    expect(totalGamesPlayed({ wins: 0, losses: 0, ties: 0 })).toBe(0);
  });
});

// ─── getWinPct ────────────────────────────────────────────────────────────────

describe('getWinPct', () => {
  it('calculates correctly', () => {
    expect(getWinPct({ wins: 3, losses: 1, ties: 0 })).toBeCloseTo(0.75);
  });
  it('returns 0 for zero games', () => {
    expect(getWinPct({ wins: 0, losses: 0, ties: 0 })).toBe(0);
  });
});

describe('getWinPctLabel', () => {
  it('formats as percentage', () => expect(getWinPctLabel(0.75)).toBe('75%'));
  it('rounds correctly', () => expect(getWinPctLabel(0.333)).toBe('33%'));
});

// ─── hasEnoughDataForRecord ───────────────────────────────────────────────────

describe('hasEnoughDataForRecord', () => {
  it('true when at least one game has a result', () => {
    expect(hasEnoughDataForRecord([win1])).toBe(true);
  });
  it('false when no results', () => {
    expect(hasEnoughDataForRecord([noResult, practice])).toBe(false);
  });
  it('false when empty', () => {
    expect(hasEnoughDataForRecord([])).toBe(false);
  });
});

// ─── Boolean checks ──────────────────────────────────────────────────────────

describe('isWinningRecord', () => {
  it('true when wins > losses', () => expect(isWinningRecord({ wins: 3, losses: 1, ties: 0 })).toBe(true));
  it('false when wins < losses', () => expect(isWinningRecord({ wins: 1, losses: 3, ties: 0 })).toBe(false));
  it('false when wins == losses', () => expect(isWinningRecord({ wins: 2, losses: 2, ties: 0 })).toBe(false));
});

describe('isUnbeatenRecord', () => {
  it('true when no losses and at least 1 game', () => {
    expect(isUnbeatenRecord({ wins: 3, losses: 0, ties: 1 })).toBe(true);
  });
  it('false when there are losses', () => {
    expect(isUnbeatenRecord({ wins: 3, losses: 1, ties: 0 })).toBe(false);
  });
  it('false when 0 games played', () => {
    expect(isUnbeatenRecord({ wins: 0, losses: 0, ties: 0 })).toBe(false);
  });
});

describe('hasTies', () => {
  it('true when ties > 0', () => expect(hasTies({ wins: 1, losses: 1, ties: 1 })).toBe(true));
  it('false when no ties', () => expect(hasTies({ wins: 2, losses: 1, ties: 0 })).toBe(false));
});

// ─── String formatting ────────────────────────────────────────────────────────

describe('formatRecordString', () => {
  it('includes ties when present and includeTies=true', () => {
    expect(formatRecordString({ wins: 3, losses: 1, ties: 2 })).toBe('3-1-2');
  });
  it('omits ties when includeTies=false', () => {
    expect(formatRecordString({ wins: 3, losses: 1, ties: 2 }, false)).toBe('3-1');
  });
  it('omits ties when no ties', () => {
    expect(formatRecordString({ wins: 3, losses: 1, ties: 0 })).toBe('3-1');
  });
});

describe('getRecentFormArray', () => {
  it('returns last 5 results in chronological order', () => {
    const form = getRecentFormArray([win1, win2, loss1, loss2, tie1, win3]);
    expect(form).toHaveLength(5);
    expect(form[form.length - 1]).toBe('tie');
  });
});

describe('getRecentFormString', () => {
  it('encodes results as W/L/T letters', () => {
    const form = getRecentFormString([win1, loss1, tie1]);
    expect(form).toBe('WLT');
  });
});

describe('buildSeasonRecordSummary', () => {
  it('returns no-games message when empty', () => {
    expect(buildSeasonRecordSummary({ wins: 0, losses: 0, ties: 0 })).toBe('No games recorded yet');
  });
  it('mentions unbeaten when appropriate', () => {
    const summary = buildSeasonRecordSummary({ wins: 5, losses: 0, ties: 0 });
    expect(summary).toContain('Unbeaten');
  });
  it('includes win rate', () => {
    const summary = buildSeasonRecordSummary({ wins: 3, losses: 1, ties: 0 });
    expect(summary).toContain('75%');
  });
});

// ─── Streak ──────────────────────────────────────────────────────────────────

describe('getCurrentStreak', () => {
  it('detects win streak', () => {
    const streak = getCurrentStreak([win1, win2, win3]);
    expect(streak).toEqual({ type: 'win', count: 3 });
  });
  it('detects loss streak after wins', () => {
    const streak = getCurrentStreak([win1, win2, loss1, loss2]);
    expect(streak).toEqual({ type: 'loss', count: 2 });
  });
  it('returns null for empty', () => {
    expect(getCurrentStreak([])).toBeNull();
  });
  it('handles single game', () => {
    expect(getCurrentStreak([win1])).toEqual({ type: 'win', count: 1 });
  });
});

describe('formatStreakLabel', () => {
  it('formats win streak', () => expect(formatStreakLabel({ type: 'win', count: 3 })).toBe('W3'));
  it('formats loss streak', () => expect(formatStreakLabel({ type: 'loss', count: 2 })).toBe('L2'));
  it('formats tie streak', () => expect(formatStreakLabel({ type: 'tie', count: 1 })).toBe('T1'));
  it('returns empty for null', () => expect(formatStreakLabel(null)).toBe(''));
});

// ─── Labels / colors ─────────────────────────────────────────────────────────

describe('getRecordLabel', () => {
  it('no games', () => expect(getRecordLabel({ wins: 0, losses: 0, ties: 0 })).toBe('No games yet'));
  it('perfect season', () => expect(getRecordLabel({ wins: 5, losses: 0, ties: 0 })).toBe('Perfect Season'));
  it('strong season', () => expect(getRecordLabel({ wins: 8, losses: 2, ties: 0 })).toBe('Strong Season'));
  it('winning record', () => expect(getRecordLabel({ wins: 3, losses: 2, ties: 0 })).toBe('Winning Record'));
  it('building', () => expect(getRecordLabel({ wins: 1, losses: 4, ties: 0 })).toBe('Building'));
});

describe('getRecordColor', () => {
  it('emerald for strong record', () => {
    expect(getRecordColor({ wins: 8, losses: 2, ties: 0 })).toBe('text-emerald-400');
  });
  it('orange for above 50%', () => {
    expect(getRecordColor({ wins: 3, losses: 2, ties: 0 })).toBe('text-orange-400');
  });
  it('red for under 50%', () => {
    expect(getRecordColor({ wins: 1, losses: 4, ties: 0 })).toBe('text-red-400');
  });
  it('zinc for no games', () => {
    expect(getRecordColor({ wins: 0, losses: 0, ties: 0 })).toBe('text-zinc-400');
  });
});

describe('getResultBadgeClasses', () => {
  it('returns emerald for win', () => expect(getResultBadgeClasses('win')).toContain('emerald'));
  it('returns red for loss', () => expect(getResultBadgeClasses('loss')).toContain('red'));
  it('returns zinc for tie', () => expect(getResultBadgeClasses('tie')).toContain('zinc'));
});

describe('getResultLabel', () => {
  it('W for win', () => expect(getResultLabel('win')).toBe('W'));
  it('L for loss', () => expect(getResultLabel('loss')).toBe('L'));
  it('T for tie', () => expect(getResultLabel('tie')).toBe('T'));
});

// ─── countBySessionType ───────────────────────────────────────────────────────

describe('countBySessionType', () => {
  it('groups by session type', () => {
    const breakdown = countBySessionType([win1, win2, scrimmage, tournament, noResult]);
    expect(breakdown.game).toEqual({ wins: 2, losses: 0, ties: 0 });
    expect(breakdown.scrimmage).toEqual({ wins: 1, losses: 0, ties: 0 });
    expect(breakdown.tournament).toEqual({ wins: 0, losses: 1, ties: 0 });
  });
  it('omits types with no results', () => {
    const breakdown = countBySessionType([noResult]);
    expect(Object.keys(breakdown)).toHaveLength(0);
  });
});
