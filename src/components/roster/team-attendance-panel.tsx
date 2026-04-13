'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, CalendarCheck, TrendingDown, CheckCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import type { PlayerAttendanceStat, TeamAttendanceStats } from '@/app/api/attendance-stats/route';

interface TeamAttendancePanelProps {
  teamId: string;
}

// ─── Session dots ────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  present: 'bg-emerald-500',
  absent: 'bg-red-500',
  excused: 'bg-amber-400',
};

function SessionDots({ sessions }: { sessions: PlayerAttendanceStat['recentSessions'] }) {
  if (sessions.length === 0) {
    return <span className="text-xs text-zinc-600">no data</span>;
  }
  return (
    <div className="flex items-center gap-1" aria-label="Recent session attendance">
      {sessions.map((s, i) => (
        <span
          key={i}
          title={`${s.date}: ${s.status}`}
          className={`h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_DOT[s.status] ?? 'bg-zinc-600'}`}
        />
      ))}
    </div>
  );
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

function SummaryBar({ stats }: { stats: TeamAttendanceStats }) {
  const { avgAttendancePct, players, totalTrackedSessions } = stats;
  const tracked = players.filter((p) => p.totalSessions > 0);
  const lowAttendance = tracked.filter((p) => p.pct < 70);

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-32">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-zinc-400">
            {avgAttendancePct}% avg team attendance
          </span>
          <span className="text-xs text-zinc-500">
            {totalTrackedSessions} session{totalTrackedSessions !== 1 ? 's' : ''} tracked
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={[
              'h-full rounded-full transition-all',
              avgAttendancePct >= 80
                ? 'bg-emerald-500'
                : avgAttendancePct >= 60
                  ? 'bg-amber-400'
                  : 'bg-red-500',
            ].join(' ')}
            style={{ width: `${avgAttendancePct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        {avgAttendancePct >= 80 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="h-3 w-3" />
            Strong attendance
          </span>
        )}
        {lowAttendance.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="h-3 w-3" />
            {lowAttendance.length} player{lowAttendance.length !== 1 ? 's' : ''} &lt;70%
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Player row ───────────────────────────────────────────────────────────────

function PlayerAttendanceRow({ player }: { player: PlayerAttendanceStat }) {
  if (player.totalSessions === 0) {
    return (
      <div className="flex items-center gap-3 py-2.5 border-b border-zinc-800/50 last:border-0">
        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300">
          {player.jersey_number !== null ? `#${player.jersey_number}` : player.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">{player.name}</p>
          <p className="text-xs text-zinc-600">No attendance recorded yet</p>
        </div>
        <Link
          href={`/roster/${player.id}`}
          className="flex-shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors touch-manipulation"
          aria-label={`View ${player.name}`}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  const pctColor =
    player.pct >= 80
      ? 'text-emerald-400'
      : player.pct >= 60
        ? 'text-amber-400'
        : 'text-red-400';

  const barColor =
    player.pct >= 80
      ? 'bg-emerald-500'
      : player.pct >= 60
        ? 'bg-amber-400'
        : 'bg-red-500';

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-zinc-800/50 last:border-0">
      {/* Avatar */}
      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300">
        {player.jersey_number !== null ? `#${player.jersey_number}` : player.name.charAt(0).toUpperCase()}
      </div>

      {/* Name + recent dots */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-zinc-200 truncate">{player.name}</p>
        <SessionDots sessions={player.recentSessions} />
      </div>

      {/* Bar + % */}
      <div className="flex-shrink-0 w-24 space-y-1">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold tabular-nums ${pctColor}`}>{player.pct}%</span>
          <span className="text-[10px] text-zinc-600">{player.present}/{player.totalSessions}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${player.pct}%` }}
          />
        </div>
      </div>

      {/* Link */}
      <Link
        href={`/roster/${player.id}`}
        className="flex-shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors touch-manipulation"
        aria-label={`View ${player.name}`}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function TeamAttendancePanel({ teamId }: TeamAttendancePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery<TeamAttendanceStats>({
    queryKey: ['attendance-stats-team', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/attendance-stats?team_id=${teamId}`);
      if (!res.ok) throw new Error('Failed to load attendance data');
      return res.json();
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: !!teamId,
  });

  // Don't render until we have data with at least one tracked session
  if (isLoading || !data || data.totalTrackedSessions === 0) return null;

  const { players } = data;
  const lowAttendancePlayers = players.filter((p) => p.totalSessions > 0 && p.pct < 70);
  const visiblePlayers = showAll ? players : lowAttendancePlayers.slice(0, 5);

  return (
    <Card className="border-zinc-800/60">
      <CardHeader className="p-4 pb-0">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="team-attendance-panel"
          className="flex items-center justify-between w-full text-left touch-manipulation"
        >
          <CardTitle className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-orange-400" />
            Attendance
          </CardTitle>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-zinc-500" />
          )}
        </button>

        {/* Always-visible summary bar */}
        <div className="mt-3 pb-4">
          <SummaryBar stats={data} />
        </div>
      </CardHeader>

      {expanded && (
        <CardContent id="team-attendance-panel" className="p-4 pt-0 space-y-3">
          {/* Filter toggle */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={!showAll ? 'default' : 'outline'}
              onClick={() => setShowAll(false)}
              className={`h-7 text-xs ${!showAll ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}`}
            >
              <TrendingDown className="h-3 w-3 mr-1" />
              Needs attention ({lowAttendancePlayers.length})
            </Button>
            <Button
              size="sm"
              variant={showAll ? 'default' : 'outline'}
              onClick={() => setShowAll(true)}
              className={`h-7 text-xs ${showAll ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}`}
            >
              All ({players.length})
            </Button>
          </div>

          {/* Player list */}
          {visiblePlayers.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-zinc-300 font-medium">Attendance is looking great!</p>
              <p className="text-xs text-zinc-500 mt-1">No players below 70% attendance.</p>
            </div>
          ) : (
            <div>
              {visiblePlayers.map((player) => (
                <PlayerAttendanceRow key={player.id} player={player} />
              ))}
              {!showAll && lowAttendancePlayers.length > 5 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="mt-2 text-xs text-orange-400 hover:text-orange-300 underline underline-offset-2"
                >
                  Show all {lowAttendancePlayers.length} players needing attention
                </button>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 pt-2 border-t border-zinc-800/50 text-[10px] text-zinc-600">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Present</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> Excused</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" /> Absent</span>
            <span className="text-zinc-700 ml-auto">Dots = recent sessions →</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
