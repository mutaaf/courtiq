import { describe, it, expect } from 'vitest';
import { computePlayerStat, computeTeamStats } from '@/lib/attendance-utils';
import type { PlayerInfo, AttendanceRecord, TeamAttendanceRow } from '@/lib/attendance-utils';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function player(id: string, name: string, jersey_number: number | null = null): PlayerInfo {
  return { id, name, jersey_number };
}

function record(
  status: 'present' | 'absent' | 'excused',
  date = '2024-09-01',
  type = 'practice',
): AttendanceRecord {
  return { status, date, type };
}

function teamRow(
  playerId: string,
  status: 'present' | 'absent' | 'excused',
  sessionId: string,
  date = '2024-09-01',
  type = 'practice',
): TeamAttendanceRow {
  return { player_id: playerId, status, session_id: sessionId, date, type };
}

// ─── computePlayerStat ───────────────────────────────────────────────────────

describe('computePlayerStat', () => {
  it('returns zero stats when no records', () => {
    const stat = computePlayerStat(player('p1', 'Alice'), []);
    expect(stat.totalSessions).toBe(0);
    expect(stat.present).toBe(0);
    expect(stat.absent).toBe(0);
    expect(stat.excused).toBe(0);
    expect(stat.pct).toBe(0);
    expect(stat.recentSessions).toHaveLength(0);
  });

  it('returns 100% when all sessions are present', () => {
    const records = [
      record('present', '2024-09-01'),
      record('present', '2024-09-03'),
      record('present', '2024-09-05'),
    ];
    const stat = computePlayerStat(player('p1', 'Alice'), records);
    expect(stat.totalSessions).toBe(3);
    expect(stat.present).toBe(3);
    expect(stat.pct).toBe(100);
  });

  it('returns 0% when all sessions are absent', () => {
    const records = [
      record('absent', '2024-09-01'),
      record('absent', '2024-09-03'),
    ];
    const stat = computePlayerStat(player('p1', 'Alice'), records);
    expect(stat.pct).toBe(0);
    expect(stat.absent).toBe(2);
  });

  it('rounds pct correctly: 2/3 = 67%', () => {
    const records = [
      record('present', '2024-09-01'),
      record('present', '2024-09-03'),
      record('absent', '2024-09-05'),
    ];
    const stat = computePlayerStat(player('p1', 'Alice'), records);
    expect(stat.pct).toBe(67);
  });

  it('counts excused correctly and excludes from % numerator', () => {
    const records = [
      record('present', '2024-09-01'),
      record('excused', '2024-09-03'),
      record('absent', '2024-09-05'),
    ];
    const stat = computePlayerStat(player('p1', 'Alice'), records);
    // present/total = 1/3 = 33%
    expect(stat.pct).toBe(33);
    expect(stat.excused).toBe(1);
    expect(stat.absent).toBe(1);
    expect(stat.present).toBe(1);
  });

  it('sorts recent sessions newest first', () => {
    const records = [
      record('present', '2024-09-01'),
      record('absent', '2024-09-10'),
      record('excused', '2024-09-05'),
    ];
    const stat = computePlayerStat(player('p1', 'Alice'), records);
    expect(stat.recentSessions[0].date).toBe('2024-09-10');
    expect(stat.recentSessions[1].date).toBe('2024-09-05');
    expect(stat.recentSessions[2].date).toBe('2024-09-01');
  });

  it('limits recentSessions to 8 by default', () => {
    const records = Array.from({ length: 12 }, (_, i) =>
      record('present', `2024-09-${String(i + 1).padStart(2, '0')}`),
    );
    const stat = computePlayerStat(player('p1', 'Alice'), records);
    expect(stat.recentSessions).toHaveLength(8);
    expect(stat.totalSessions).toBe(12);
  });

  it('respects custom recentLimit', () => {
    const records = [
      record('present', '2024-09-01'),
      record('present', '2024-09-02'),
      record('absent', '2024-09-03'),
    ];
    const stat = computePlayerStat(player('p1', 'Alice'), records, 2);
    expect(stat.recentSessions).toHaveLength(2);
  });

  it('preserves player identity fields', () => {
    const p = player('abc', 'Bob', 7);
    const stat = computePlayerStat(p, []);
    expect(stat.id).toBe('abc');
    expect(stat.name).toBe('Bob');
    expect(stat.jersey_number).toBe(7);
  });

  it('handles null jersey_number', () => {
    const stat = computePlayerStat(player('p1', 'Alice', null), []);
    expect(stat.jersey_number).toBeNull();
  });
});

// ─── computeTeamStats ────────────────────────────────────────────────────────

describe('computeTeamStats', () => {
  it('returns empty stats when no players', () => {
    const result = computeTeamStats([], []);
    expect(result.totalTrackedSessions).toBe(0);
    expect(result.avgAttendancePct).toBe(0);
    expect(result.players).toHaveLength(0);
  });

  it('returns zero stats when players exist but no attendance rows', () => {
    const players = [player('p1', 'Alice'), player('p2', 'Bob')];
    const result = computeTeamStats(players, []);
    expect(result.totalTrackedSessions).toBe(0);
    expect(result.avgAttendancePct).toBe(0);
    expect(result.players).toHaveLength(2);
    expect(result.players.every((p) => p.totalSessions === 0)).toBe(true);
  });

  it('counts distinct sessions correctly', () => {
    const players = [player('p1', 'Alice'), player('p2', 'Bob')];
    const rows: TeamAttendanceRow[] = [
      teamRow('p1', 'present', 's1', '2024-09-01'),
      teamRow('p2', 'present', 's1', '2024-09-01'), // same session
      teamRow('p1', 'present', 's2', '2024-09-03'),
    ];
    const result = computeTeamStats(players, rows);
    expect(result.totalTrackedSessions).toBe(2); // s1 + s2
  });

  it('computes avgAttendancePct across players with data', () => {
    const players = [player('p1', 'Alice'), player('p2', 'Bob')];
    const rows: TeamAttendanceRow[] = [
      teamRow('p1', 'present', 's1', '2024-09-01'),   // p1: 1/1 = 100%
      teamRow('p2', 'absent', 's1', '2024-09-01'),    // p2: 0/1 = 0%
    ];
    const result = computeTeamStats(players, rows);
    // avg = (100 + 0) / 2 = 50
    expect(result.avgAttendancePct).toBe(50);
  });

  it('excludes players with no data from avgAttendancePct', () => {
    const players = [player('p1', 'Alice'), player('p2', 'Bob'), player('p3', 'Carol')];
    const rows: TeamAttendanceRow[] = [
      teamRow('p1', 'present', 's1'), // 100%
      teamRow('p2', 'absent', 's1'),  // 0%
      // p3 has no rows
    ];
    const result = computeTeamStats(players, rows);
    // avg = (100 + 0) / 2 = 50 (p3 excluded)
    expect(result.avgAttendancePct).toBe(50);
  });

  it('sorts players lowest % first, no-data players last', () => {
    const players = [player('p1', 'Alice'), player('p2', 'Bob'), player('p3', 'Carol')];
    const rows: TeamAttendanceRow[] = [
      teamRow('p1', 'present', 's1', '2024-09-01'), // 100%
      teamRow('p1', 'present', 's2', '2024-09-03'), // 100%
      teamRow('p2', 'absent', 's1', '2024-09-01'),  // 0%
      teamRow('p2', 'absent', 's2', '2024-09-03'),  // 0%
      // p3: no data
    ];
    const result = computeTeamStats(players, rows);
    expect(result.players[0].name).toBe('Bob');   // 0% — lowest first
    expect(result.players[1].name).toBe('Alice'); // 100%
    expect(result.players[2].name).toBe('Carol'); // no data — last
  });

  it('ignores rows for unknown players', () => {
    const players = [player('p1', 'Alice')];
    const rows: TeamAttendanceRow[] = [
      teamRow('p1', 'present', 's1'),
      teamRow('unknown', 'present', 's1'), // not in roster
    ];
    const result = computeTeamStats(players, rows);
    expect(result.players).toHaveLength(1);
    expect(result.players[0].present).toBe(1);
  });

  it('accumulates multiple sessions for same player', () => {
    const players = [player('p1', 'Alice')];
    const rows: TeamAttendanceRow[] = [
      teamRow('p1', 'present', 's1', '2024-09-01'),
      teamRow('p1', 'present', 's2', '2024-09-03'),
      teamRow('p1', 'absent', 's3', '2024-09-05'),
      teamRow('p1', 'excused', 's4', '2024-09-07'),
    ];
    const result = computeTeamStats(players, rows);
    const stat = result.players[0];
    expect(stat.present).toBe(2);
    expect(stat.absent).toBe(1);
    expect(stat.excused).toBe(1);
    expect(stat.totalSessions).toBe(4);
    expect(stat.pct).toBe(50); // 2/4 = 50%
  });

  it('returns 100% avg when all players have perfect attendance', () => {
    const players = [player('p1', 'Alice'), player('p2', 'Bob')];
    const rows: TeamAttendanceRow[] = [
      teamRow('p1', 'present', 's1', '2024-09-01'),
      teamRow('p2', 'present', 's1', '2024-09-01'),
    ];
    const result = computeTeamStats(players, rows);
    expect(result.avgAttendancePct).toBe(100);
  });
});
