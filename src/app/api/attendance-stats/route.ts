import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import type { AttendanceStatus } from '@/types/database';
import { computePlayerStat, computeTeamStats } from '@/lib/attendance-utils';

// ─── Exported Types ──────────────────────────────────────────────────────────

export interface RecentSession {
  date: string;
  type: string;
  status: AttendanceStatus;
}

export interface PlayerAttendanceStat {
  id: string;
  name: string;
  jersey_number: number | null;
  totalSessions: number;
  present: number;
  absent: number;
  excused: number;
  pct: number; // present / total * 100 (rounded)
  recentSessions: RecentSession[]; // last 8 sessions, newest first
}

export interface TeamAttendanceStats {
  totalTrackedSessions: number; // sessions that have any attendance records
  avgAttendancePct: number;     // team average across all players
  players: PlayerAttendanceStat[];
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');
  const playerId = searchParams.get('player_id');

  if (!teamId && !playerId) {
    return NextResponse.json({ error: 'team_id or player_id required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // ── Player mode ──────────────────────────────────────────────────────────
  if (playerId && !teamId) {
    const { data: playerRow } = await admin
      .from('players')
      .select('id, name, jersey_number, team_id')
      .eq('id', playerId)
      .single();

    if (!playerRow) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

    const { data: membership } = await admin
      .from('team_coaches')
      .select('id')
      .eq('team_id', playerRow.team_id)
      .eq('coach_id', user.id)
      .single();

    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: rows } = await admin
      .from('session_attendance')
      .select('status, sessions(date, type)')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(50);

    const records = (rows || []).map((r) => ({
      status: r.status as AttendanceStatus,
      date: (r.sessions as any)?.date ?? '',
      type: (r.sessions as any)?.type ?? 'practice',
    }));

    const stat = computePlayerStat(
      { id: playerRow.id, name: playerRow.name, jersey_number: playerRow.jersey_number },
      records,
    );

    return NextResponse.json(stat);
  }

  // ── Team mode ────────────────────────────────────────────────────────────
  const { data: membership } = await admin
    .from('team_coaches')
    .select('id')
    .eq('team_id', teamId!)
    .eq('coach_id', user.id)
    .single();

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: players } = await admin
    .from('players')
    .select('id, name, jersey_number')
    .eq('team_id', teamId!)
    .eq('is_active', true)
    .order('name');

  if (!players || players.length === 0) {
    return NextResponse.json({
      totalTrackedSessions: 0,
      avgAttendancePct: 0,
      players: [],
    } satisfies TeamAttendanceStats);
  }

  const { data: attendanceRows } = await admin
    .from('session_attendance')
    .select('player_id, status, sessions!inner(id, date, type, team_id)')
    .eq('sessions.team_id', teamId!)
    .order('created_at', { ascending: false });

  const rows = (attendanceRows || []).map((r) => ({
    player_id: r.player_id,
    status: r.status as AttendanceStatus,
    session_id: (r.sessions as any)?.id ?? '',
    date: (r.sessions as any)?.date ?? '',
    type: (r.sessions as any)?.type ?? 'practice',
  }));

  const teamStats = computeTeamStats(players, rows);

  return NextResponse.json(teamStats satisfies TeamAttendanceStats);
}
