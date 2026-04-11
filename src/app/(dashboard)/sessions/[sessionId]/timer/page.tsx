'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Plus,
  Play,
  Pause,
  SkipForward,
  CheckCircle2,
  Clock,
  Dumbbell,
  X,
  GripVertical,
  Lightbulb,
  MessageSquare,
  Trophy,
  ChevronRight,
  Save,
  Loader2,
  Timer,
  Search,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import type { Drill, Player, Session } from '@/types/database';

// ─── Types ──────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string; // unique local id
  drillId?: string; // from library
  name: string;
  durationSecs: number;
  cues: string[];
  description: string;
}

type TimerMode = 'setup' | 'running' | 'break' | 'done';

interface CapturedNote {
  drillName: string;
  note: string;
  playerName?: string;
  timestamp: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function totalDuration(queue: QueueItem[]) {
  return queue.reduce((sum, d) => sum + d.durationSecs, 0);
}

// ─── Break Screen (observation capture) ─────────────────────────────────────

function BreakScreen({
  drillJustFinished,
  nextDrillName,
  players,
  onSave,
  onSkip,
}: {
  drillJustFinished: string;
  nextDrillName?: string;
  players: Player[];
  onSave: (note: string, playerName?: string) => void;
  onSkip: () => void;
}) {
  const [note, setNote] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 p-6">
      <div className="flex items-center justify-between mb-8">
        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-sm px-3 py-1">
          Break
        </Badge>
        {nextDrillName && (
          <span className="text-xs text-zinc-500">
            Next: {nextDrillName}
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-6 max-w-xl mx-auto w-full">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 mb-1">
            What did you observe?
          </h2>
          <p className="text-sm text-zinc-500">
            Drill just finished: <span className="text-zinc-300">{drillJustFinished}</span>
          </p>
        </div>

        {/* Player selector */}
        {players.length > 0 && (
          <div>
            <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">Player (optional)</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedPlayer('')}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedPlayer === ''
                    ? 'bg-orange-500 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                Team
              </button>
              {players.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlayer(p.id === selectedPlayer ? '' : p.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedPlayer === p.id
                      ? 'bg-orange-500 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {p.jersey_number ? `#${p.jersey_number} ` : ''}{p.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        <Textarea
          ref={textRef}
          placeholder="Type an observation… (e.g. 'Great footwork on the pivot', 'Needs work on left-hand dribble')"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[120px] text-base bg-zinc-900 border-zinc-700 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && note.trim()) {
              const playerName = players.find((p) => p.id === selectedPlayer)?.name;
              onSave(note.trim(), playerName);
            }
          }}
        />

        <div className="flex gap-3">
          <Button
            onClick={() => {
              if (note.trim()) {
                const playerName = players.find((p) => p.id === selectedPlayer)?.name;
                onSave(note.trim(), playerName);
              } else {
                onSkip();
              }
            }}
            className="flex-1 h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold"
          >
            {note.trim() ? (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save &amp; Continue
              </>
            ) : (
              <>
                <SkipForward className="h-4 w-4 mr-2" />
                Skip
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-zinc-600 text-center">
          ⌘+Enter to save quickly
        </p>
      </div>
    </div>
  );
}

// ─── Done Screen ─────────────────────────────────────────────────────────────

function DoneScreen({
  drillsRun,
  notes,
  isSaving,
  saveError,
  onSave,
  sessionId,
}: {
  drillsRun: QueueItem[];
  notes: CapturedNote[];
  isSaving: boolean;
  saveError: string | null;
  onSave: () => void;
  sessionId: string;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 p-6">
      <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-xl mx-auto w-full text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
          <Trophy className="h-10 w-10 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-zinc-100">Practice Done!</h2>
          <p className="text-zinc-400 mt-2">
            {drillsRun.length} drill{drillsRun.length !== 1 ? 's' : ''} •{' '}
            {fmt(totalDuration(drillsRun))} total
          </p>
        </div>

        {/* Summary */}
        <div className="w-full space-y-2 text-left">
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Drills Run</p>
          {drillsRun.map((d) => (
            <div key={d.id} className="flex items-center gap-3 bg-zinc-900 rounded-lg px-4 py-3">
              <Dumbbell className="h-4 w-4 text-orange-500 shrink-0" />
              <span className="flex-1 text-sm text-zinc-200">{d.name}</span>
              <span className="text-xs text-zinc-500">{fmt(d.durationSecs)}</span>
            </div>
          ))}
        </div>

        {notes.length > 0 && (
          <div className="w-full space-y-2 text-left">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">
              {notes.length} Observation{notes.length !== 1 ? 's' : ''} Captured
            </p>
            {notes.map((n, i) => (
              <div key={i} className="bg-zinc-900 rounded-lg px-4 py-3 space-y-1">
                <p className="text-xs text-zinc-500">{n.drillName}{n.playerName ? ` · ${n.playerName}` : ''}</p>
                <p className="text-sm text-zinc-200">{n.note}</p>
              </div>
            ))}
          </div>
        )}

        {saveError && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-lg px-4 py-3 w-full">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {saveError}
          </div>
        )}

        <div className="flex flex-col gap-3 w-full">
          {notes.length > 0 && (
            <Button
              onClick={onSave}
              disabled={isSaving}
              className="h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold w-full"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {isSaving ? 'Saving…' : `Save ${notes.length} Observation${notes.length !== 1 ? 's' : ''}`}
            </Button>
          )}
          <Link href={`/sessions/${sessionId}`} className="w-full">
            <Button variant="outline" className="w-full h-12">
              Back to Session
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PracticeTimerPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const router = useRouter();
  const { activeTeam, coach } = useActiveTeam();

  // ── State ────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<TimerMode>('setup');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [cueIdx, setCueIdx] = useState(0);
  const [notes, setNotes] = useState<CapturedNote[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Setup state
  const [drillSearch, setDrillSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [customDuration, setCustomDuration] = useState('10');
  const [showDrillPicker, setShowDrillPicker] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cueIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const data = await query<Session>({
        table: 'sessions',
        select: '*',
        filters: { id: sessionId },
        single: true,
      });
      return data;
    },
  });

  const { data: drills = [] } = useQuery({
    queryKey: queryKeys.drills.all(activeTeam?.sport_id || ''),
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Drill[]>({
        table: 'drills',
        select: 'id, name, description, category, duration_minutes, teaching_cues',
        filters: { sport_id: activeTeam.sport_id },
        order: { column: 'name', ascending: true },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.drills,
  });

  const { data: players = [] } = useQuery({
    queryKey: queryKeys.players.all(activeTeam?.id ?? ''),
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Player[]>({
        table: 'players',
        select: 'id, name, jersey_number',
        filters: { team_id: activeTeam.id, is_active: true },
        order: { column: 'name', ascending: true },
      });
      return data || [];
    },
    enabled: !!activeTeam,
  });

  // ── Timer logic ──────────────────────────────────────────────────────────
  const clearIntervals = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (cueIntervalRef.current) clearInterval(cueIntervalRef.current);
  }, []);

  const startTimerForDrill = useCallback(
    (idx: number, queue: QueueItem[]) => {
      const drill = queue[idx];
      if (!drill) return;
      setTimeLeft(drill.durationSecs);
      setCueIdx(0);
      setIsPaused(false);

      clearIntervals();

      // Countdown
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearIntervals();
            // Move to break
            setMode('break');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Rotate coaching cues every 30s
      const cueCount = drill.cues.length;
      if (cueCount > 1) {
        cueIntervalRef.current = setInterval(() => {
          setCueIdx((prev) => (prev + 1) % cueCount);
        }, 30000);
      }
    },
    [clearIntervals]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => clearIntervals();
  }, [clearIntervals]);

  const handlePauseResume = () => {
    if (isPaused) {
      // Resume
      setIsPaused(false);
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearIntervals();
            setMode('break');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Pause
      setIsPaused(true);
      clearIntervals();
    }
  };

  const handleSkipDrill = () => {
    clearIntervals();
    setMode('break');
  };

  const handleBreakSave = (note: string, playerName?: string) => {
    const drill = queue[currentIdx];
    setNotes((prev) => [
      ...prev,
      { drillName: drill.name, note, playerName, timestamp: new Date() },
    ]);
    advanceToNextDrill();
  };

  const handleBreakSkip = () => {
    advanceToNextDrill();
  };

  const advanceToNextDrill = () => {
    const next = currentIdx + 1;
    if (next >= queue.length) {
      setMode('done');
    } else {
      setCurrentIdx(next);
      setMode('running');
      startTimerForDrill(next, queue);
    }
  };

  const handleStart = () => {
    if (queue.length === 0) return;
    setCurrentIdx(0);
    setMode('running');
    startTimerForDrill(0, queue);
  };

  // ── Save observations ────────────────────────────────────────────────────
  const handleSaveObservations = async () => {
    if (!activeTeam || !coach || notes.length === 0) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const rows = notes.map((n) => {
        const player = players.find((p) => p.name === n.playerName);
        return {
          team_id: activeTeam.id,
          coach_id: coach.id,
          session_id: sessionId,
          player_id: player?.id || null,
          text: n.note,
          raw_text: n.note,
          category: 'general',
          sentiment: 'neutral' as const,
          source: 'typed' as const,
          ai_parsed: false,
          coach_edited: false,
        };
      });

      await mutate({
        table: 'observations',
        operation: 'insert',
        data: rows,
      });

      setSaveSuccess(true);
      // Navigate back after brief success delay
      setTimeout(() => router.push(`/sessions/${sessionId}`), 1200);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save observations');
      setIsSaving(false);
    }
  };

  // ── Queue management ─────────────────────────────────────────────────────
  const addFromLibrary = (drill: Drill) => {
    const item: QueueItem = {
      id: `${drill.id}-${Date.now()}`,
      drillId: drill.id,
      name: drill.name,
      durationSecs: (drill.duration_minutes ?? 10) * 60,
      cues: drill.teaching_cues || [],
      description: drill.description,
    };
    setQueue((prev) => [...prev, item]);
    setShowDrillPicker(false);
    setDrillSearch('');
  };

  const addCustomDrill = () => {
    const name = customName.trim();
    const secs = Math.max(60, parseInt(customDuration || '10') * 60);
    if (!name) return;
    const item: QueueItem = {
      id: `custom-${Date.now()}`,
      name,
      durationSecs: secs,
      cues: [],
      description: '',
    };
    setQueue((prev) => [...prev, item]);
    setCustomName('');
    setCustomDuration('10');
  };

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((d) => d.id !== id));
  };

  const updateDuration = (id: string, mins: string) => {
    const secs = Math.max(60, parseInt(mins || '1') * 60);
    setQueue((prev) => prev.map((d) => (d.id === id ? { ...d, durationSecs: secs } : d)));
  };

  // ── Filtered drills ──────────────────────────────────────────────────────
  const filteredDrills = drills.filter(
    (d) =>
      !drillSearch ||
      d.name.toLowerCase().includes(drillSearch.toLowerCase()) ||
      d.category.toLowerCase().includes(drillSearch.toLowerCase())
  );

  // ── Render ───────────────────────────────────────────────────────────────

  // Done
  if (mode === 'done') {
    return (
      <DoneScreen
        drillsRun={queue.slice(0, currentIdx + 1)}
        notes={notes}
        isSaving={isSaving}
        saveError={saveError}
        onSave={handleSaveObservations}
        sessionId={sessionId}
      />
    );
  }

  // Break
  if (mode === 'break') {
    const drill = queue[currentIdx];
    const nextDrill = queue[currentIdx + 1];
    return (
      <BreakScreen
        drillJustFinished={drill?.name ?? ''}
        nextDrillName={nextDrill?.name}
        players={players}
        onSave={handleBreakSave}
        onSkip={handleBreakSkip}
      />
    );
  }

  // Running
  if (mode === 'running') {
    const drill = queue[currentIdx];
    const nextDrill = queue[currentIdx + 1];
    const progress = drill
      ? ((drill.durationSecs - timeLeft) / drill.durationSecs) * 100
      : 0;
    const currentCue = drill?.cues[cueIdx];
    const isLowTime = timeLeft <= 30 && timeLeft > 0;

    return (
      <div className="flex flex-col min-h-screen bg-zinc-950 select-none">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <button
            onClick={() => {
              clearIntervals();
              setMode('setup');
            }}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
          >
            <RotateCcw className="h-4 w-4" />
            Restart
          </button>
          <span className="text-xs text-zinc-600">
            Drill {currentIdx + 1} / {queue.length}
          </span>
          <button
            onClick={handleSkipDrill}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
          >
            Skip
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-zinc-900">
          <div
            className="h-full bg-orange-500 transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
          {/* Drill name */}
          <div className="text-center space-y-2">
            <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30">
              {drill?.name}
            </Badge>
            {drill?.description && (
              <p className="text-zinc-500 text-sm max-w-xs">{drill.description}</p>
            )}
          </div>

          {/* Timer */}
          <div className="text-center">
            <span
              className={`font-mono font-bold tabular-nums transition-colors ${
                isLowTime ? 'text-red-400 text-8xl' : 'text-zinc-100 text-9xl'
              }`}
            >
              {fmt(timeLeft)}
            </span>
          </div>

          {/* Coaching cue */}
          {currentCue && (
            <div className="flex items-start gap-3 bg-zinc-900/80 rounded-xl px-5 py-4 max-w-sm w-full">
              <Lightbulb className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-zinc-200 leading-relaxed">{currentCue}</p>
            </div>
          )}

          {/* Next drill preview */}
          {nextDrill && (
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <ChevronRight className="h-3.5 w-3.5" />
              Next: {nextDrill.name} ({fmt(nextDrill.durationSecs)})
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-6 flex gap-4 justify-center">
          <Button
            onClick={handlePauseResume}
            size="lg"
            className={`h-14 w-14 rounded-full p-0 ${
              isPaused
                ? 'bg-orange-500 hover:bg-orange-600'
                : 'bg-zinc-800 hover:bg-zinc-700'
            }`}
          >
            {isPaused ? <Play className="h-6 w-6" /> : <Pause className="h-6 w-6" />}
          </Button>
        </div>
      </div>
    );
  }

  // Setup
  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/sessions/${sessionId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Timer className="h-6 w-6 text-orange-500" />
            Practice Timer
          </h1>
          {session && (
            <p className="text-sm text-zinc-400 mt-0.5">
              {new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
              {session.location ? ` · ${session.location}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
            Drill Queue
          </h2>
          {queue.length > 0 && (
            <span className="text-xs text-zinc-500">
              Total: {fmt(totalDuration(queue))}
            </span>
          )}
        </div>

        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-xl py-10 gap-2 text-center">
            <Dumbbell className="h-8 w-8 text-zinc-700" />
            <p className="text-sm text-zinc-500">Add drills to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {queue.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3"
              >
                <GripVertical className="h-4 w-4 text-zinc-700 shrink-0" />
                <span className="text-xs text-zinc-600 w-4 shrink-0">{idx + 1}</span>
                <Dumbbell className="h-4 w-4 text-orange-500 shrink-0" />
                <span className="flex-1 text-sm text-zinc-200 truncate">{item.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Clock className="h-3.5 w-3.5 text-zinc-600" />
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={Math.round(item.durationSecs / 60)}
                    onChange={(e) => updateDuration(item.id, e.target.value)}
                    className="w-10 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300 text-center"
                  />
                  <span className="text-xs text-zinc-600">min</span>
                </div>
                <button
                  onClick={() => removeFromQueue(item.id)}
                  className="shrink-0 text-zinc-600 hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add drill buttons */}
      <div className="space-y-3">
        <button
          onClick={() => setShowDrillPicker((v) => !v)}
          className="flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300 transition-colors font-medium"
        >
          <Plus className="h-4 w-4" />
          Add from Drill Library
        </button>

        {showDrillPicker && (
          <div className="border border-zinc-800 rounded-xl bg-zinc-900/50 overflow-hidden">
            <div className="p-3 border-b border-zinc-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Search drills…"
                  value={drillSearch}
                  onChange={(e) => setDrillSearch(e.target.value)}
                  className="pl-9 h-9 text-sm bg-zinc-800 border-zinc-700"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-zinc-800">
              {filteredDrills.length === 0 ? (
                <p className="text-sm text-zinc-500 p-4 text-center">No drills found</p>
              ) : (
                filteredDrills.slice(0, 30).map((drill) => (
                  <button
                    key={drill.id}
                    onClick={() => addFromLibrary(drill)}
                    className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-zinc-800 transition-colors group"
                  >
                    <Dumbbell className="h-4 w-4 text-zinc-600 group-hover:text-orange-500 transition-colors shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{drill.name}</p>
                      <p className="text-xs text-zinc-500">{drill.category}</p>
                    </div>
                    <span className="text-xs text-zinc-600 shrink-0">
                      {drill.duration_minutes ?? 10} min
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Custom drill */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Custom drill name…"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="flex-1 h-10 text-sm bg-zinc-900 border-zinc-800"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customName.trim()) addCustomDrill();
            }}
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="number"
              min="1"
              max="60"
              value={customDuration}
              onChange={(e) => setCustomDuration(e.target.value)}
              className="w-12 h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-2 text-sm text-zinc-300 text-center"
            />
            <span className="text-xs text-zinc-500">min</span>
          </div>
          <Button
            onClick={addCustomDrill}
            disabled={!customName.trim()}
            size="sm"
            variant="outline"
            className="h-10 shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Start button */}
      <div className="pt-2">
        <Button
          onClick={handleStart}
          disabled={queue.length === 0}
          className="w-full h-14 text-lg font-bold bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Play className="h-5 w-5 mr-2" />
          Start Practice
          {queue.length > 0 && (
            <span className="ml-2 text-sm font-normal opacity-80">
              ({queue.length} drill{queue.length !== 1 ? 's' : ''}, {fmt(totalDuration(queue))})
            </span>
          )}
        </Button>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 bg-zinc-900/50 rounded-xl p-4">
        <MessageSquare className="h-4 w-4 text-zinc-500 mt-0.5 shrink-0" />
        <p className="text-xs text-zinc-500">
          After each drill, you&apos;ll be prompted to capture observations.
          They save directly to this session when you&apos;re done.
        </p>
      </div>
    </div>
  );
}
