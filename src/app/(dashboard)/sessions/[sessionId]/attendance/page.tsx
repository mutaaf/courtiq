'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Loader2,
  Save,
  CheckSquare,
} from 'lucide-react';
import Link from 'next/link';
import type { Player, Session, SessionAttendance, AttendanceStatus } from '@/types/database';

// ─── Helpers ────────────────────────────────────────────────────────────────

export function computeAttendanceSummary(
  players: Player[],
  records: Record<string, AttendanceStatus>,
) {
  const present = players.filter((p) => records[p.id] === 'present').length;
  const absent = players.filter((p) => records[p.id] === 'absent').length;
  const excused = players.filter((p) => records[p.id] === 'excused').length;
  const total = players.length;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  return { present, absent, excused, total, pct };
}

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; icon: typeof CheckCircle2; activeClass: string; inactiveClass: string }
> = {
  present: {
    label: 'Present',
    icon: CheckCircle2,
    activeClass: 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300',
    inactiveClass: 'bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300',
  },
  absent: {
    label: 'Absent',
    icon: XCircle,
    activeClass: 'bg-red-500/20 border-red-500/60 text-red-300',
    inactiveClass: 'bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300',
  },
  excused: {
    label: 'Excused',
    icon: Clock,
    activeClass: 'bg-amber-500/20 border-amber-500/60 text-amber-300',
    inactiveClass: 'bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300',
  },
};

const ALL_STATUSES: AttendanceStatus[] = ['present', 'absent', 'excused'];

// ─── Player Row ──────────────────────────────────────────────────────────────

function PlayerAttendanceRow({
  player,
  status,
  onChange,
}: {
  player: Player;
  status: AttendanceStatus | undefined;
  onChange: (playerId: string, s: AttendanceStatus) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-zinc-800 last:border-0">
      {/* Avatar / initials */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-300">
        {player.name.charAt(0).toUpperCase()}
      </div>

      {/* Name */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-100">{player.name}</p>
        {player.position && (
          <p className="truncate text-xs text-zinc-500">{player.position}</p>
        )}
      </div>

      {/* Status buttons */}
      <div className="flex gap-1.5 shrink-0" role="group" aria-label={`Attendance for ${player.name}`}>
        {ALL_STATUSES.map((s) => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          const isActive = status === s;
          return (
            <button
              key={s}
              aria-pressed={isActive}
              aria-label={cfg.label}
              onClick={() => onChange(player.id, s)}
              className={[
                'flex h-9 min-w-[72px] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all active:scale-[0.97] touch-manipulation',
                isActive ? cfg.activeClass : cfg.inactiveClass,
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{cfg.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();

  // Local draft — player id → status
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [draftInitialised, setDraftInitialised] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Session ──
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: [...queryKeys.sessions.all(''), sessionId],
    queryFn: () =>
      query<Session>({
        table: 'sessions',
        filters: { id: sessionId },
        single: true,
      }),
    enabled: !!sessionId,
    ...CACHE_PROFILES.sessions,
  });

  // ── Players ──
  const { data: players = [], isLoading: playersLoading } = useQuery({
    queryKey: queryKeys.players.all(activeTeam?.id || ''),
    queryFn: () =>
      query<Player[]>({
        table: 'players',
        filters: { team_id: activeTeam!.id, is_active: true },
        order: { column: 'name', ascending: true },
      }),
    enabled: !!activeTeam,
    ...CACHE_PROFILES.roster,
  });

  // ── Existing attendance records ──
  const { data: existingRecords, isLoading: attendanceLoading } = useQuery<SessionAttendance[]>({
    queryKey: ['session_attendance', sessionId],
    queryFn: () =>
      query<SessionAttendance[]>({
        table: 'session_attendance',
        filters: { session_id: sessionId },
      }) as Promise<SessionAttendance[]>,
    enabled: !!sessionId,
  });

  // Initialise draft from saved records (or default everyone to 'present')
  useEffect(() => {
    if (draftInitialised || attendanceLoading || playersLoading) return;
    if (players.length === 0) return;

    if (existingRecords && existingRecords.length > 0) {
      const map: Record<string, AttendanceStatus> = {};
      for (const r of existingRecords) map[r.player_id] = r.status;
      setDraft(map);
    } else {
      // No saved records — default everyone to present
      const map: Record<string, AttendanceStatus> = {};
      for (const p of players) map[p.id] = 'present';
      setDraft(map);
    }
    setDraftInitialised(true);
  }, [draftInitialised, attendanceLoading, playersLoading, existingRecords, players]);

  // ── Save mutation — delete-then-insert for clean upsert ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Remove existing attendance for this session
      await mutate({
        table: 'session_attendance',
        operation: 'delete',
        filters: { session_id: sessionId },
      });

      // 2. Insert fresh records
      const records = players
        .filter((p) => draft[p.id] !== undefined)
        .map((p) => ({
          session_id: sessionId,
          player_id: p.id,
          status: draft[p.id],
        }));

      if (records.length === 0) return;

      await mutate({
        table: 'session_attendance',
        operation: 'insert',
        data: records,
        select: 'id',
      });
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['session_attendance', sessionId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  function handleChange(playerId: string, status: AttendanceStatus) {
    setDraft((prev) => ({ ...prev, [playerId]: status }));
    setSaved(false);
  }

  function markAll(status: AttendanceStatus) {
    const all: Record<string, AttendanceStatus> = {};
    for (const p of players) all[p.id] = status;
    setDraft(all);
    setSaved(false);
  }

  const isLoading = sessionLoading || playersLoading || attendanceLoading;
  const summary = computeAttendanceSummary(players, draft);

  const sessionLabel = session
    ? `${session.type.charAt(0).toUpperCase() + session.type.slice(1)} · ${new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'Session';

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/sessions/${sessionId}`}>
          <Button variant="ghost" size="icon" aria-label="Back to session">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-orange-400" />
            Attendance
          </h1>
          <p className="text-sm text-zinc-400">{sessionLabel}</p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || players.length === 0}
          size="sm"
          className={saved ? 'bg-emerald-600 hover:bg-emerald-600' : ''}
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <CheckSquare className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saved ? 'Saved' : 'Save'}
        </Button>
      </div>

      {/* Summary strip */}
      {!isLoading && players.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Present', value: summary.present, color: 'text-emerald-400' },
            { label: 'Absent', value: summary.absent, color: 'text-red-400' },
            { label: 'Excused', value: summary.excused, color: 'text-amber-400' },
            { label: 'Attendance', value: `${summary.pct}%`, color: 'text-orange-400' },
          ].map(({ label, value, color }) => (
            <Card key={label} className="border-zinc-800">
              <CardContent className="p-3 text-center">
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick-mark buttons */}
      {!isLoading && players.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 mr-1">Mark all:</span>
          {ALL_STATUSES.map((s) => {
            const cfg = STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => markAll(s)}
                className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Player list */}
      <Card className="border-zinc-800">
        <CardContent className="p-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <div className="flex gap-1.5">
                    <Skeleton className="h-9 w-[72px] rounded-lg" />
                    <Skeleton className="h-9 w-[72px] rounded-lg" />
                    <Skeleton className="h-9 w-[72px] rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : players.length === 0 ? (
            <div className="py-8 text-center">
              <Users className="mx-auto h-10 w-10 text-zinc-600 mb-3" />
              <p className="text-sm text-zinc-400">No active players on this team.</p>
              <Link href="/roster" className="mt-3 inline-block text-sm text-orange-400 hover:underline">
                Add players to your roster
              </Link>
            </div>
          ) : (
            players.map((player) => (
              <PlayerAttendanceRow
                key={player.id}
                player={player}
                status={draft[player.id]}
                onChange={handleChange}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Status legend */}
      {!isLoading && players.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
          {ALL_STATUSES.map((s) => {
            const cfg = STATUS_CONFIG[s];
            const Icon = cfg.icon;
            return (
              <span key={s} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {cfg.label}
              </span>
            );
          })}
        </div>
      )}

      {saveMutation.isError && (
        <p className="text-sm text-red-400 text-center">
          Failed to save attendance. Please try again.
        </p>
      )}
    </div>
  );
}
