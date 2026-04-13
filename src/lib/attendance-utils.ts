import type { AttendanceStatus } from '@/types/database';
import type { PlayerAttendanceStat, RecentSession, TeamAttendanceStats } from '@/app/api/attendance-stats/route';

// ─── Input shapes ─────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  status: AttendanceStatus;
  date: string;
  type: string;
}

export interface PlayerInfo {
  id: string;
  name: string;
  jersey_number: number | null;
}

export interface TeamAttendanceRow {
  player_id: string;
  status: AttendanceStatus;
  session_id: string;
  date: string;
  type: string;
}

// ─── computePlayerStat ────────────────────────────────────────────────────────

/**
 * Given sorted (newest-first) attendance records for a single player, compute
 * their attendance stats. Pure function — testable without Supabase.
 */
export function computePlayerStat(
  player: PlayerInfo,
  records: AttendanceRecord[],
  recentLimit = 8,
): PlayerAttendanceStat {
  // Sort by date descending
  const sorted = [...records].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );

  const present = sorted.filter((r) => r.status === 'present').length;
  const absent = sorted.filter((r) => r.status === 'absent').length;
  const excused = sorted.filter((r) => r.status === 'excused').length;
  const total = sorted.length;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;

  const recentSessions: RecentSession[] = sorted.slice(0, recentLimit).map((r) => ({
    date: r.date,
    type: r.type,
    status: r.status,
  }));

  return {
    id: player.id,
    name: player.name,
    jersey_number: player.jersey_number,
    totalSessions: total,
    present,
    absent,
    excused,
    pct,
    recentSessions,
  };
}

// ─── computeTeamStats ─────────────────────────────────────────────────────────

/**
 * Given a list of players and all their attendance rows, compute team-level stats.
 * Pure function — testable without Supabase.
 */
export function computeTeamStats(
  players: PlayerInfo[],
  rows: TeamAttendanceRow[],
): TeamAttendanceStats {
  if (players.length === 0) {
    return { totalTrackedSessions: 0, avgAttendancePct: 0, players: [] };
  }

  // Count distinct sessions that have any attendance records
  const trackedSessionIds = new Set(rows.map((r) => r.session_id).filter(Boolean));
  const totalTrackedSessions = trackedSessionIds.size;

  // Build per-player record lists
  const recordsMap = new Map<string, AttendanceRecord[]>(players.map((p) => [p.id, []]));

  for (const row of rows) {
    if (!recordsMap.has(row.player_id)) continue;
    recordsMap.get(row.player_id)!.push({
      status: row.status,
      date: row.date,
      type: row.type,
    });
  }

  // Compute per-player stats
  const playerStats: PlayerAttendanceStat[] = players.map((player) =>
    computePlayerStat(player, recordsMap.get(player.id) ?? []),
  );

  // Sort: lowest % first, no-data players last
  playerStats.sort((a, b) => {
    if (a.totalSessions === 0 && b.totalSessions === 0) return 0;
    if (a.totalSessions === 0) return 1;
    if (b.totalSessions === 0) return -1;
    return a.pct - b.pct;
  });

  const withData = playerStats.filter((p) => p.totalSessions > 0);
  const avgAttendancePct =
    withData.length > 0
      ? Math.round(withData.reduce((sum, p) => sum + p.pct, 0) / withData.length)
      : 0;

  return { totalTrackedSessions, avgAttendancePct, players: playerStats };
}
