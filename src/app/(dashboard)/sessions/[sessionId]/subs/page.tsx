'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Users,
  Play,
  Pause,
  RotateCcw,
  Check,
  SkipForward,
  Timer,
  Shuffle,
  ChevronRight,
  Circle,
} from 'lucide-react';
import Link from 'next/link';
import type { Player } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameFormat {
  periods: number;
  minutesPerPeriod: number;
  playersOnCourt: number;
}

interface RotationSegment {
  segmentIndex: number;
  period: number;
  segmentInPeriod: number;
  startMinute: number;
  endMinute: number;
  playerIds: string[];
}

interface RotationPlan {
  segments: RotationSegment[];
  minutesPerPlayer: Map<string, number>;
  totalMinutes: number;
  segmentsPerPeriod: number;
  format: GameFormat;
}

type Step = 'setup' | 'plan' | 'live';

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: '2 Halves', value: 2 },
  { label: '4 Quarters', value: 4 },
];

const DURATION_OPTIONS = [
  { label: '8 min', value: 8 },
  { label: '10 min', value: 10 },
  { label: '12 min', value: 12 },
  { label: '15 min', value: 15 },
  { label: '20 min', value: 20 },
];

const COURT_OPTIONS = [
  { label: '3 players', value: 3 },
  { label: '4 players', value: 4 },
  { label: '5 players', value: 5 },
  { label: '6 players', value: 6 },
];

// Player colors for live view (cycle through these)
const PLAYER_COLORS = [
  'bg-orange-500/20 border-orange-500/40 text-orange-300',
  'bg-blue-500/20 border-blue-500/40 text-blue-300',
  'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
  'bg-purple-500/20 border-purple-500/40 text-purple-300',
  'bg-yellow-500/20 border-yellow-500/40 text-yellow-300',
  'bg-pink-500/20 border-pink-500/40 text-pink-300',
  'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
  'bg-red-500/20 border-red-500/40 text-red-300',
];

// ─── Rotation Algorithm ───────────────────────────────────────────────────────

function generateRotation(players: Player[], format: GameFormat): RotationPlan {
  const { periods, minutesPerPeriod, playersOnCourt } = format;
  const segmentsPerPeriod = 2;
  const totalSegments = periods * segmentsPerPeriod;
  const minutesPerSegment = minutesPerPeriod / segmentsPerPeriod;
  const totalMinutes = periods * minutesPerPeriod;
  const n = players.length;
  const k = Math.min(playersOnCourt, n);

  // If all players fit on court simultaneously — everyone plays full game
  if (n <= k) {
    const allIds = players.map((p) => p.id);
    const segments: RotationSegment[] = Array.from({ length: totalSegments }, (_, s) => ({
      segmentIndex: s,
      period: Math.floor(s / segmentsPerPeriod) + 1,
      segmentInPeriod: s % segmentsPerPeriod,
      startMinute: s * minutesPerSegment,
      endMinute: (s + 1) * minutesPerSegment,
      playerIds: allIds,
    }));
    return {
      segments,
      minutesPerPlayer: new Map(players.map((p) => [p.id, totalMinutes])),
      totalMinutes,
      segmentsPerPeriod,
      format,
    };
  }

  // Greedy fair rotation: each segment picks the k players with fewest minutes so far.
  // Ties broken by stable player index for full determinism.
  const minutesMap = new Map(players.map((p) => [p.id, 0]));
  const indexMap = new Map(players.map((p, i) => [p.id, i]));
  const segments: RotationSegment[] = [];

  for (let s = 0; s < totalSegments; s++) {
    const ranked = [...players].sort((a, b) => {
      const mDiff = minutesMap.get(a.id)! - minutesMap.get(b.id)!;
      return mDiff !== 0 ? mDiff : indexMap.get(a.id)! - indexMap.get(b.id)!;
    });

    const chosen = ranked.slice(0, k).map((p) => p.id);
    chosen.forEach((id) => minutesMap.set(id, minutesMap.get(id)! + minutesPerSegment));

    segments.push({
      segmentIndex: s,
      period: Math.floor(s / segmentsPerPeriod) + 1,
      segmentInPeriod: s % segmentsPerPeriod,
      startMinute: s * minutesPerSegment,
      endMinute: (s + 1) * minutesPerSegment,
      playerIds: chosen,
    });
  }

  return { segments, minutesPerPlayer: minutesMap, totalMinutes, segmentsPerPeriod, format };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtMin(minutes: number): string {
  return `${Math.round(minutes)} min`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { activeTeam } = useActiveTeam();

  // Setup state
  const [periods, setPeriods] = useState(4);
  const [minutesPerPeriod, setMinutesPerPeriod] = useState(8);
  const [playersOnCourt, setPlayersOnCourt] = useState(5);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Flow state
  const [step, setStep] = useState<Step>('setup');
  const [rotation, setRotation] = useState<RotationPlan | null>(null);

  // Live tracking state
  const [clockSecs, setClockSecs] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [currentSegIdx, setCurrentSegIdx] = useState(0);
  const [period, setPeriod] = useState(1);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch players
  const { data: players = [], isLoading } = useQuery({
    queryKey: ['players-subs', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Player[]>({
        table: 'players',
        select: 'id, name, jersey_number, position',
        filters: { team_id: activeTeam.id, is_active: true },
        order: { column: 'name', ascending: true },
      });
      return data || [];
    },
    enabled: !!activeTeam,
  });

  // Select all players by default when loaded
  useEffect(() => {
    if (players.length > 0 && selectedIds.size === 0) {
      setSelectedIds(new Set(players.map((p) => p.id)));
    }
  }, [players, selectedIds.size]);

  // Clock tick
  useEffect(() => {
    if (isRunning) {
      clockRef.current = setInterval(() => setClockSecs((s) => s + 1), 1000);
    } else {
      if (clockRef.current) clearInterval(clockRef.current);
    }
    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [isRunning]);

  // Auto-advance segment when clock passes the segment boundary
  useEffect(() => {
    if (!rotation || !isRunning) return;
    const seg = rotation.segments[currentSegIdx];
    if (!seg) return;
    const segEndSecs = seg.endMinute * 60;
    if (clockSecs >= segEndSecs && currentSegIdx < rotation.segments.length - 1) {
      setCurrentSegIdx((i) => i + 1);
      // Haptic feedback on supported devices
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
    }
  }, [clockSecs, rotation, currentSegIdx, isRunning]);

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const colorMap = new Map(players.map((p, i) => [p.id, PLAYER_COLORS[i % PLAYER_COLORS.length]]));

  const togglePlayer = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Must keep at least playersOnCourt players selected
        if (next.size > playersOnCourt) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleGenerate = () => {
    const available = players.filter((p) => selectedIds.has(p.id));
    if (available.length < playersOnCourt) return;
    const plan = generateRotation(available, { periods, minutesPerPeriod, playersOnCourt });
    setRotation(plan);
    setStep('plan');
  };

  const handleStartLive = () => {
    setClockSecs(0);
    setCurrentSegIdx(0);
    setPeriod(1);
    setIsRunning(false);
    setStep('live');
  };

  const handleNextSub = () => {
    if (!rotation) return;
    const nextIdx = Math.min(currentSegIdx + 1, rotation.segments.length - 1);
    setCurrentSegIdx(nextIdx);
    const nextSeg = rotation.segments[nextIdx];
    if (nextSeg) {
      setClockSecs(nextSeg.startMinute * 60);
      setPeriod(nextSeg.period);
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    setClockSecs(0);
    setCurrentSegIdx(0);
    setPeriod(1);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (step === 'live' && rotation) {
    const seg = rotation.segments[currentSegIdx];
    const nextSeg = rotation.segments[currentSegIdx + 1];
    const currentPlayers = seg.playerIds.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
    const nextPlayers = nextSeg
      ? nextSeg.playerIds.map((id) => playerMap.get(id)).filter(Boolean) as Player[]
      : [];
    const benchPlayers = players
      .filter((p) => selectedIds.has(p.id) && !seg.playerIds.includes(p.id));

    const segEndSecs = seg.endMinute * 60;
    const timeInSeg = clockSecs - seg.startMinute * 60;
    const segDurationSecs = (seg.endMinute - seg.startMinute) * 60;
    const progressPct = Math.min(100, (timeInSeg / segDurationSecs) * 100);
    const isLastSeg = currentSegIdx === rotation.segments.length - 1;

    return (
      <div className="flex flex-col min-h-screen bg-zinc-950 p-4 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => { setIsRunning(false); setStep('plan'); }}
            className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors touch-manipulation"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm">Back</span>
          </button>
          <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/40">
            Period {seg.period}
          </Badge>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 touch-manipulation"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {/* Clock */}
        <div className="text-center mb-6">
          <p className="text-7xl font-mono font-bold text-zinc-100 tabular-nums tracking-tight">
            {fmtClock(clockSecs)}
          </p>
          <p className="text-sm text-zinc-500 mt-1">
            Sub at {fmtClock(segEndSecs)} &middot; Seg {currentSegIdx + 1}/{rotation.segments.length}
          </p>
          {/* Segment progress bar */}
          <div className="mt-3 h-1.5 w-full max-w-xs mx-auto rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-1000"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Clock controls */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <Button
            onClick={() => setIsRunning((r) => !r)}
            size="lg"
            className="h-14 w-14 rounded-full bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/20"
          >
            {isRunning ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </Button>
          {!isLastSeg && (
            <Button
              onClick={handleNextSub}
              variant="outline"
              size="lg"
              className="h-14 px-5 rounded-full border-zinc-700 hover:bg-zinc-800"
            >
              <SkipForward className="h-5 w-5 mr-2" />
              Next Sub
            </Button>
          )}
        </div>

        {/* On Court */}
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-2">
            <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
            On Court ({currentPlayers.length})
          </p>
          <div className="grid grid-cols-2 gap-2">
            {currentPlayers.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 rounded-xl border p-3 ${colorMap.get(p.id)}`}
              >
                <span className="text-xl font-bold tabular-nums w-8 text-center opacity-70">
                  {p.jersey_number ?? '?'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                  <p className="text-[10px] opacity-60 uppercase">{p.position}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Next lineup */}
        {nextPlayers.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-2">
              <ChevronRight className="h-3 w-3" />
              Coming Up Next
            </p>
            <div className="flex flex-wrap gap-2">
              {nextPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-1.5"
                >
                  <span className="text-xs font-bold text-zinc-400">#{p.jersey_number ?? '?'}</span>
                  <span className="text-sm text-zinc-300">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bench */}
        {benchPlayers.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-2">
              Bench ({benchPlayers.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {benchPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-1.5 opacity-60"
                >
                  <span className="text-xs text-zinc-500">#{p.jersey_number ?? '?'}</span>
                  <span className="text-xs text-zinc-500">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isLastSeg && (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
            <p className="text-sm font-semibold text-emerald-300">Final segment — great game!</p>
          </div>
        )}
      </div>
    );
  }

  if (step === 'plan' && rotation) {
    const availablePlayers = players.filter((p) => selectedIds.has(p.id));
    const periodNumbers = [...new Set(rotation.segments.map((s) => s.period))];

    return (
      <div className="p-4 lg:p-8 space-y-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep('setup')}
              className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors touch-manipulation"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Rotation Plan</h1>
              <p className="text-sm text-zinc-500">
                {rotation.format.periods} {rotation.format.periods === 2 ? 'halves' : 'quarters'} &times;{' '}
                {rotation.format.minutesPerPeriod} min &middot; {availablePlayers.length} players
              </p>
            </div>
          </div>
          <Button onClick={handleStartLive} className="bg-orange-500 hover:bg-orange-600 gap-2">
            <Timer className="h-4 w-4" />
            Go Live
          </Button>
        </div>

        {/* Player minutes summary */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-400" />
              Planned Minutes Per Player
            </p>
            <div className="space-y-2">
              {availablePlayers
                .sort((a, b) => (rotation.minutesPerPlayer.get(b.id) ?? 0) - (rotation.minutesPerPlayer.get(a.id) ?? 0))
                .map((p) => {
                  const mins = rotation.minutesPerPlayer.get(p.id) ?? 0;
                  const pct = (mins / rotation.totalMinutes) * 100;
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-500 w-6 shrink-0">#{p.jersey_number ?? '?'}</span>
                      <span className="text-sm text-zinc-300 w-24 truncate shrink-0">{p.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${colorMap.get(p.id)?.includes('orange') ? 'bg-orange-500' : colorMap.get(p.id)?.includes('blue') ? 'bg-blue-500' : colorMap.get(p.id)?.includes('emerald') ? 'bg-emerald-500' : colorMap.get(p.id)?.includes('purple') ? 'bg-purple-500' : 'bg-zinc-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-400 shrink-0 w-12 text-right">
                        {fmtMin(mins)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* Period grid */}
        {periodNumbers.map((p) => {
          const periodSegs = rotation.segments.filter((s) => s.period === p);
          return (
            <Card key={p}>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-semibold text-zinc-300">
                  {rotation.format.periods === 2 ? `Half ${p}` : `Quarter ${p}`}
                </p>
                <div className="space-y-2">
                  {periodSegs.map((seg) => {
                    const segPlayers = seg.playerIds.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
                    return (
                      <div key={seg.segmentIndex} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-zinc-500">
                            {seg.startMinute}:{String(0).padStart(2, '0')} – {seg.endMinute}:{String(0).padStart(2, '0')}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            Sub {seg.segmentIndex + 1}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {segPlayers.map((pl) => (
                            <span
                              key={pl.id}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${colorMap.get(pl.id)}`}
                            >
                              #{pl.jersey_number ?? '?'} {pl.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Regenerate */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleGenerate}
            className="flex-1 gap-2 border-zinc-700"
          >
            <Shuffle className="h-4 w-4" />
            Regenerate
          </Button>
          <Button onClick={handleStartLive} className="flex-1 bg-orange-500 hover:bg-orange-600 gap-2">
            <Timer className="h-4 w-4" />
            Start Live Tracking
          </Button>
        </div>
      </div>
    );
  }

  // ─── Setup Step ──────────────────────────────────────────────────────────────

  const available = players.filter((p) => selectedIds.has(p.id));
  const canGenerate = available.length >= playersOnCourt;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/sessions/${sessionId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Sub Planner</h1>
          <p className="text-zinc-400 text-sm">Fair rotation for equal playing time</p>
        </div>
      </div>

      {/* Game Format */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-semibold text-zinc-200">Game Format</p>

          {/* Periods */}
          <div className="space-y-1.5">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Periods</p>
            <div className="flex gap-2">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPeriods(opt.value)}
                  className={`flex-1 rounded-xl border py-3 text-sm font-medium transition-all touch-manipulation active:scale-[0.98] ${
                    periods === opt.value
                      ? 'border-orange-500/60 bg-orange-500/15 text-orange-300'
                      : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration per period */}
          <div className="space-y-1.5">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">
              Minutes per {periods === 2 ? 'half' : 'quarter'}
            </p>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMinutesPerPeriod(opt.value)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all touch-manipulation active:scale-[0.98] ${
                    minutesPerPeriod === opt.value
                      ? 'border-orange-500/60 bg-orange-500/15 text-orange-300'
                      : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Players on court */}
          <div className="space-y-1.5">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Players on court</p>
            <div className="flex flex-wrap gap-2">
              {COURT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPlayersOnCourt(opt.value)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all touch-manipulation active:scale-[0.98] ${
                    playersOnCourt === opt.value
                      ? 'border-orange-500/60 bg-orange-500/15 text-orange-300'
                      : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Game length summary */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-sm text-zinc-400">
            Total game time:{' '}
            <span className="text-zinc-200 font-semibold">{periods * minutesPerPeriod} minutes</span>
            {available.length >= playersOnCourt && (
              <>
                {' '}· Each player gets ~
                <span className="text-orange-300 font-semibold">
                  {' '}
                  {fmtMin(
                    Math.round((periods * minutesPerPeriod * playersOnCourt) / available.length)
                  )}
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Player selection */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-400" />
              Available Players
            </p>
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setSelectedIds(new Set(players.map((p) => p.id)))}
                className="text-orange-400 hover:text-orange-300 touch-manipulation"
              >
                All
              </button>
              <span className="text-zinc-700">|</span>
              <button
                onClick={() => {
                  // Keep only minimum needed
                  const topK = players.slice(0, playersOnCourt);
                  setSelectedIds(new Set(topK.map((p) => p.id)));
                }}
                className="text-zinc-500 hover:text-zinc-300 touch-manipulation"
              >
                Min
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : players.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">No players on roster</p>
          ) : (
            <div className="space-y-2">
              {players.map((p) => {
                const isSelected = selectedIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlayer(p.id)}
                    className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all touch-manipulation active:scale-[0.98] ${
                      isSelected
                        ? 'border-orange-500/40 bg-orange-500/10'
                        : 'border-zinc-800 bg-zinc-900/30 opacity-50'
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                        isSelected
                          ? 'border-orange-500/50 bg-orange-500/20 text-orange-300'
                          : 'border-zinc-700 bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {p.jersey_number ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isSelected ? 'text-zinc-200' : 'text-zinc-500'}`}>
                        {p.name}
                      </p>
                      <p className="text-xs text-zinc-600">{p.position}</p>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-orange-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {!canGenerate && available.length > 0 && (
            <p className="text-xs text-amber-400 text-center">
              Select at least {playersOnCourt} players to generate a rotation
            </p>
          )}
        </CardContent>
      </Card>

      {/* Generate button */}
      <Button
        onClick={handleGenerate}
        disabled={!canGenerate || isLoading}
        className="w-full h-14 text-base bg-orange-500 hover:bg-orange-600 disabled:opacity-40 gap-3 rounded-2xl touch-manipulation"
      >
        <Shuffle className="h-5 w-5" />
        Generate Rotation
      </Button>
    </div>
  );
}
