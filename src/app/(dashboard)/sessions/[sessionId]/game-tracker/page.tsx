'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  RotateCcw,
  Trophy,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import type { Player, Session } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatType = 'made_shot' | 'miss' | 'rebound' | 'assist' | 'steal' | 'turnover';

interface StatConfig {
  label: string;
  short: string;
  sentiment: 'positive' | 'needs-work' | 'neutral';
  pts: number;
  colorClass: string;
  bgClass: string;
}

const STAT_CONFIG: Record<StatType, StatConfig> = {
  made_shot: {
    label: 'Made Shot',
    short: 'FGM',
    sentiment: 'positive',
    pts: 2,
    colorClass: 'text-emerald-300',
    bgClass: 'bg-emerald-500/20 border-emerald-500/40 hover:bg-emerald-500/30 active:scale-95',
  },
  miss: {
    label: 'Miss',
    short: 'FGA',
    sentiment: 'needs-work',
    pts: 0,
    colorClass: 'text-red-300',
    bgClass: 'bg-red-500/20 border-red-500/40 hover:bg-red-500/30 active:scale-95',
  },
  rebound: {
    label: 'Rebound',
    short: 'REB',
    sentiment: 'positive',
    pts: 0,
    colorClass: 'text-blue-300',
    bgClass: 'bg-blue-500/20 border-blue-500/40 hover:bg-blue-500/30 active:scale-95',
  },
  assist: {
    label: 'Assist',
    short: 'AST',
    sentiment: 'positive',
    pts: 0,
    colorClass: 'text-purple-300',
    bgClass: 'bg-purple-500/20 border-purple-500/40 hover:bg-purple-500/30 active:scale-95',
  },
  steal: {
    label: 'Steal',
    short: 'STL',
    sentiment: 'positive',
    pts: 0,
    colorClass: 'text-yellow-300',
    bgClass: 'bg-yellow-500/20 border-yellow-500/40 hover:bg-yellow-500/30 active:scale-95',
  },
  turnover: {
    label: 'Turnover',
    short: 'TO',
    sentiment: 'needs-work',
    pts: 0,
    colorClass: 'text-orange-300',
    bgClass: 'bg-orange-500/20 border-orange-500/40 hover:bg-orange-500/30 active:scale-95',
  },
};

const STAT_ORDER: StatType[] = ['made_shot', 'miss', 'rebound', 'assist', 'steal', 'turnover'];

// ─── Box Score Computation ────────────────────────────────────────────────────

interface PlayerStats {
  fgm: number;
  fga: number;
  reb: number;
  ast: number;
  stl: number;
  to: number;
  pts: number;
}

function emptyStats(): PlayerStats {
  return { fgm: 0, fga: 0, reb: 0, ast: 0, stl: 0, to: 0, pts: 0 };
}

function computeBoxScore(observations: any[], players: Player[]): Record<string, PlayerStats> {
  const stats: Record<string, PlayerStats> = {};
  for (const p of players) stats[p.id] = emptyStats();

  for (const obs of observations) {
    if (!obs.player_id || !stats[obs.player_id]) continue;
    const s = stats[obs.player_id];
    switch (obs.event_type as StatType) {
      case 'made_shot': s.fgm++; s.fga++; s.pts += 2; break;
      case 'miss':      s.fga++; break;
      case 'rebound':   s.reb++; break;
      case 'assist':    s.ast++; break;
      case 'steal':     s.stl++; break;
      case 'turnover':  s.to++;  break;
    }
  }

  return stats;
}

function teamScore(boxScore: Record<string, PlayerStats>): number {
  return Object.values(boxScore).reduce((sum, s) => sum + s.pts, 0);
}

// ─── Scoreboard ──────────────────────────────────────────────────────────────

function Scoreboard({ ourScore, opponent, opponentScore }: {
  ourScore: number;
  opponent: string | null;
  opponentScore: number;
}) {
  return (
    <div className="flex items-center justify-center gap-4 rounded-2xl border border-zinc-700 bg-zinc-900 px-6 py-4">
      <div className="text-center flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">Us</p>
        <p className="text-5xl font-black tabular-nums text-zinc-100">{ourScore}</p>
      </div>
      <div className="text-zinc-600 text-2xl font-bold">vs</div>
      <div className="text-center flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">
          {opponent || 'Them'}
        </p>
        <div className="flex items-center justify-center gap-2">
          <p className="text-5xl font-black tabular-nums text-zinc-400">{opponentScore}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Box Score Table ──────────────────────────────────────────────────────────

function BoxScoreTable({ players, boxScore }: { players: Player[]; boxScore: Record<string, PlayerStats> }) {
  const activePlayers = players.filter((p) => {
    const s = boxScore[p.id];
    return s && (s.fga > 0 || s.reb > 0 || s.ast > 0 || s.stl > 0 || s.to > 0);
  });

  if (activePlayers.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-600 py-3">No stats recorded yet</p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left pb-2 pl-1 font-medium">Player</th>
            <th className="pb-2 text-right font-medium text-emerald-400">PTS</th>
            <th className="pb-2 text-right font-medium">FG</th>
            <th className="pb-2 text-right font-medium text-blue-400">REB</th>
            <th className="pb-2 text-right font-medium text-purple-400">AST</th>
            <th className="pb-2 text-right font-medium text-yellow-400">STL</th>
            <th className="pb-2 text-right font-medium text-orange-400 pr-1">TO</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {activePlayers.map((p) => {
            const s = boxScore[p.id];
            return (
              <tr key={p.id}>
                <td className="py-2 pl-1">
                  <span className="font-medium text-zinc-200">
                    {p.jersey_number != null ? `#${p.jersey_number} ` : ''}{p.name.split(' ')[0]}
                  </span>
                </td>
                <td className="py-2 text-right font-bold text-emerald-400">{s.pts}</td>
                <td className="py-2 text-right text-zinc-400">{s.fgm}/{s.fga}</td>
                <td className="py-2 text-right text-blue-400">{s.reb}</td>
                <td className="py-2 text-right text-purple-400">{s.ast}</td>
                <td className="py-2 text-right text-yellow-400">{s.stl}</td>
                <td className="py-2 text-right text-orange-400 pr-1">{s.to}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GameTrackerPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [opponentScore, setOpponentScore] = useState(0);
  const [savedResult, setSavedResult] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () =>
      query<Session>({
        table: 'sessions',
        select: '*',
        filters: { id: sessionId },
        single: true,
      }),
  });

  const { data: players = [], isLoading: playersLoading } = useQuery({
    queryKey: ['players', activeTeam?.id],
    queryFn: () =>
      query<Player[]>({
        table: 'players',
        select: 'id, name, jersey_number',
        filters: { team_id: activeTeam!.id, is_active: true },
        order: { column: 'jersey_number', ascending: true },
      }),
    enabled: !!activeTeam,
  });

  const { data: statObs = [] } = useQuery({
    queryKey: ['game-stats', sessionId],
    queryFn: () =>
      query<any[]>({
        table: 'observations',
        select: 'id, player_id, event_type, created_at',
        filters: { session_id: sessionId, category: 'Game Stats' },
        order: { column: 'created_at', ascending: false },
      }),
    enabled: !!sessionId,
    refetchInterval: 5000, // keep live during game
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addStatMutation = useMutation({
    mutationFn: async ({ playerId, stat }: { playerId: string; stat: StatType }) => {
      const config = STAT_CONFIG[stat];
      const player = players.find((p) => p.id === playerId);
      await mutate({
        table: 'observations',
        operation: 'insert',
        data: {
          player_id: playerId,
          team_id: activeTeam!.id,
          coach_id: 'auto', // will be set by RLS/service role
          session_id: sessionId,
          category: 'Game Stats',
          event_type: stat,
          sentiment: config.sentiment,
          source: 'typed',
          ai_parsed: false,
          coach_edited: false,
          is_synced: false,
          text: `${player?.name ?? 'Player'}: ${config.label}`,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game-stats', sessionId] });
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (obsId: string) => {
      await mutate({
        table: 'observations',
        operation: 'delete',
        filters: { id: obsId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game-stats', sessionId] });
    },
  });

  const saveResultMutation = useMutation({
    mutationFn: async ({ ourScore, theirScore }: { ourScore: number; theirScore: number }) => {
      const result = ourScore > theirScore
        ? `W ${ourScore}-${theirScore}`
        : ourScore < theirScore
        ? `L ${ourScore}-${theirScore}`
        : `T ${ourScore}-${theirScore}`;
      await mutate({
        table: 'sessions',
        operation: 'update',
        data: { result },
        filters: { id: sessionId },
      });
    },
    onSuccess: () => {
      setSavedResult(true);
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  // ── Derived State ──────────────────────────────────────────────────────────

  const boxScore = computeBoxScore(statObs, players);
  const ourScore = teamScore(boxScore);
  const lastStat = statObs[0]; // most recent observation (sorted desc)
  const lastStatPlayer = lastStat ? players.find((p) => p.id === lastStat.player_id) : null;

  const handleStatTap = useCallback(
    (stat: StatType) => {
      if (!selectedPlayerId || !activeTeam) return;
      // haptic feedback on supported devices
      if ('vibrate' in navigator) navigator.vibrate(30);
      addStatMutation.mutate({ playerId: selectedPlayerId, stat });
    },
    [selectedPlayerId, activeTeam, addStatMutation]
  );

  const isLoading = sessionLoading || playersLoading;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 space-y-4 max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/sessions/${sessionId}`}>
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-zinc-100 truncate">
            Game Stats
            {session?.opponent ? ` — vs ${session.opponent}` : ''}
          </h1>
          <p className="text-xs text-zinc-500">Tap a player, then log stats</p>
        </div>
        {savedResult && (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shrink-0">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Saved
          </Badge>
        )}
      </div>

      {/* Scoreboard */}
      <Scoreboard
        ourScore={ourScore}
        opponent={session?.opponent ?? null}
        opponentScore={opponentScore}
      />

      {/* Opponent score controls */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-zinc-500 mr-1">Opp score:</span>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0 text-lg font-bold border-zinc-700"
          onClick={() => setOpponentScore((s) => Math.max(0, s - 1))}
        >
          −
        </Button>
        <span className="text-sm font-bold tabular-nums w-8 text-center text-zinc-200">
          {opponentScore}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0 text-lg font-bold border-zinc-700"
          onClick={() => setOpponentScore((s) => s + 1)}
        >
          +
        </Button>
      </div>

      {/* Player Selector */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
          Select Player
        </p>
        <div className="flex flex-wrap gap-2">
          {players.map((player) => (
            <button
              key={player.id}
              onClick={() => setSelectedPlayerId(player.id === selectedPlayerId ? null : player.id)}
              className={`touch-manipulation rounded-xl border px-3 py-2 text-sm font-medium transition-all min-h-[44px] ${
                selectedPlayerId === player.id
                  ? 'border-orange-500 bg-orange-500/20 text-orange-300 shadow-lg shadow-orange-500/10'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600 active:scale-95'
              }`}
            >
              {player.jersey_number != null ? (
                <span className="text-zinc-500 text-xs mr-1">#{player.jersey_number}</span>
              ) : null}
              {player.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Buttons */}
      {selectedPlayerId ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
            Log Stat — {players.find((p) => p.id === selectedPlayerId)?.name}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {STAT_ORDER.map((stat) => {
              const cfg = STAT_CONFIG[stat];
              return (
                <button
                  key={stat}
                  onClick={() => handleStatTap(stat)}
                  disabled={addStatMutation.isPending}
                  className={`touch-manipulation flex flex-col items-center justify-center rounded-2xl border py-5 transition-all min-h-[80px] font-semibold ${cfg.bgClass} ${cfg.colorClass} disabled:opacity-50`}
                >
                  <span className="text-2xl font-black">{cfg.short}</span>
                  <span className="text-xs mt-1 opacity-75">{cfg.label}</span>
                  {cfg.pts > 0 && (
                    <span className="text-[10px] mt-0.5 opacity-50">+{cfg.pts} pts</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-10 text-center">
          <p className="text-sm text-zinc-500">Select a player above to log stats</p>
        </div>
      )}

      {/* Last Action + Undo */}
      {lastStat && lastStatPlayer && (
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Last stat</p>
            <p className="text-sm font-medium text-zinc-200">
              <span className="text-orange-400">{lastStatPlayer.name.split(' ')[0]}</span>
              {' — '}
              {STAT_CONFIG[lastStat.event_type as StatType]?.label ?? lastStat.event_type}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => undoMutation.mutate(lastStat.id)}
            disabled={undoMutation.isPending}
            className="text-zinc-400 hover:text-red-400 gap-1.5"
          >
            {undoMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Undo
          </Button>
        </div>
      )}

      {/* Box Score */}
      <Card className="border-zinc-800">
        <CardContent className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">
            Box Score
          </p>
          <BoxScoreTable players={players} boxScore={boxScore} />
        </CardContent>
      </Card>

      {/* End Game */}
      <div className="space-y-3 pt-2">
        {!savedResult ? (
          <Button
            onClick={() =>
              saveResultMutation.mutate({ ourScore, theirScore: opponentScore })
            }
            disabled={saveResultMutation.isPending || statObs.length === 0}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white min-h-[52px] text-base font-bold"
          >
            {saveResultMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Trophy className="h-5 w-5" />
                End Game & Save Score
              </>
            )}
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <p className="text-sm font-bold text-emerald-400">
                  {ourScore > opponentScore ? 'Win!' : ourScore < opponentScore ? 'Loss' : "Tie"}{' '}
                  {ourScore}–{opponentScore}
                </p>
                <p className="text-xs text-zinc-500">Score saved to session</p>
              </div>
            </div>
            <Link href={`/sessions/${sessionId}`}>
              <Button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 min-h-[44px]">
                View Session
              </Button>
            </Link>
          </div>
        )}
        {statObs.length === 0 && !savedResult && (
          <p className="text-center text-xs text-zinc-600">Log at least one stat to save score</p>
        )}
      </div>
    </div>
  );
}
