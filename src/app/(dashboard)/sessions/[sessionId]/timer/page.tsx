'use client';

import { use, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
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
  ChevronUp,
  ChevronDown,
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
  ClipboardList,
  Layers,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Mic,
  MicOff,
  Star,
  Repeat2,
  Shuffle,
  Target,
  Volume2,
  VolumeX,
  Users,
  BookOpen,
} from 'lucide-react';
import Link from 'next/link';
import type { Drill, Player, Session, Plan } from '@/types/database';
import type { Sentiment } from '@/types/database';
import {
  getTemplatesForSport,
  getTemplateById,
  rankTemplates,
  buildTemplateSummary,
  type PracticeTemplate,
  type TemplateDrill,
} from '@/lib/practice-templates';
import { getPhraseByIndex, hasPhrases } from '@/lib/coaching-phrases';
import { OBSERVATION_TEMPLATES } from '@/lib/observation-templates';
import {
  getPlayerFocusForCategory,
  hasEnoughObsForFocus,
  buildFocusLabel,
  buildLastObsByPlayer,
  formatLastObsTime,
  truncateObsText,
  type NeedsWorkObs,
  type RecentObs,
  type LastObsInfo,
} from '@/lib/timer-focus-utils';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { useAnnouncer } from '@/hooks/use-announcer';
import {
  buildDrillAnnouncement,
  buildBreakAnnouncement,
  buildPracticeCompleteAnnouncement,
} from '@/lib/announcer-utils';
import type { PlayerAvailability } from '@/types/database';
import { getRatingLabel, getRatingColor } from '@/lib/session-quality-utils';
import {
  buildGroupsForDrill,
  hasSkillDataForGrouping,
  buildGroupingBasisLabel,
  formatGroupPlayerLabel,
  type DrillGroup,
} from '@/lib/player-grouping-utils';
import { isFavorited, sortWithFavoritesFirst } from '@/lib/drill-favorites-utils';
import {
  getDrillRating,
  toggleDrillRating,
  sortDrillsByRating,
  getRatingIcon,
  formatRatingPrompt,
  getRatingAriaLabel,
  type DrillRating,
} from '@/lib/drill-rating-utils';
import {
  listSavedQueues,
  saveQueue,
  deleteQueue,
  hasSavedQueues,
  isValidQueueName,
  formatQueueDuration,
  getQueuePreview,
  formatSavedAt,
  type SavedQueueItem,
  type SavedQueue as SavedQueueEntry,
} from '@/lib/saved-queue-utils';
import {
  recordDrillRun,
  getDrillRunRecord,
  sortDrillsByFreshness,
  formatLastRun,
  buildRunCountLabel,
} from '@/lib/drill-run-history-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string; // unique local id
  drillId?: string; // from library
  name: string;
  durationSecs: number;
  cues: string[];
  description: string;
  category?: string; // skill category (from drill library or template)
}

type TimerMode = 'setup' | 'running' | 'break' | 'done';

interface CapturedNote {
  drillName: string;
  drillId?: string;
  note: string;
  playerName?: string;
  playerId?: string;
  sentiment: Sentiment;
  category: string;
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

function buildQuickParentUpdate(notes: CapturedNote[], coachFirstName: string, teamName: string): string {
  const positive = notes.filter((n) => n.sentiment === 'positive').length;
  const needsWork = notes.filter((n) => n.sentiment === 'needs-work').length;
  const playerCount = new Set(notes.filter((n) => n.playerId).map((n) => n.playerId!)).size;

  const catCounts: Record<string, number> = {};
  for (const n of notes) {
    if (n.category && n.category !== 'general') {
      catCounts[n.category] = (catCounts[n.category] || 0) + 1;
    }
  }
  const topCats = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([cat]) => cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' '));

  const lines: string[] = [];
  lines.push(`📋 Practice update from Coach ${coachFirstName}!`);
  lines.push('');
  if (playerCount > 0) {
    lines.push(
      `Great session! ${positive > 0 ? `${positive} great moment${positive !== 1 ? 's' : ''} captured` : `${notes.length} observation${notes.length !== 1 ? 's' : ''} captured`} across ${playerCount} player${playerCount !== 1 ? 's' : ''}.`,
    );
  } else {
    lines.push(`Great practice today! ${notes.length} coaching observation${notes.length !== 1 ? 's' : ''} captured.`);
  }
  if (topCats.length > 0) {
    lines.push(`We focused on: ${topCats.join(' & ')}.`);
  }
  if (needsWork > 0) {
    lines.push('Keep practising at home to stay sharp!');
  }
  lines.push('');
  lines.push(`— Coach ${coachFirstName}, ${teamName}`);
  return lines.join('\n');
}

// ─── Break Screen (observation capture) ─────────────────────────────────────

function BreakScreen({
  drillJustFinished,
  drillId,
  teamId,
  drillCategory,
  nextDrillName,
  players,
  onSave,
  onSkip,
  capturedPlayerIds,
  lastObsByPlayer = {},
  playerGroups,
  groupsLabel,
}: {
  drillJustFinished: string;
  drillId?: string;
  teamId?: string;
  drillCategory?: string;
  nextDrillName?: string;
  players: Player[];
  onSave: (note: string, playerId?: string, playerName?: string, sentiment?: Sentiment, category?: string) => void;
  onSkip: () => void;
  capturedPlayerIds?: Set<string>;
  lastObsByPlayer?: Record<string, LastObsInfo>;
  playerGroups?: DrillGroup[];
  groupsLabel?: string;
}) {
  const [note, setNote] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [sentiment, setSentiment] = useState<Sentiment>('positive');
  const [templateCategory, setTemplateCategory] = useState<string | undefined>(undefined);
  const [showGroups, setShowGroups] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const voice = useVoiceInput();

  // Drill rating state — persisted in localStorage per teamId:drillId
  const [drillRating, setDrillRatingState] = useState<DrillRating | null>(() => {
    if (!teamId || !drillId) return null;
    return getDrillRating(teamId, drillId);
  });

  const handleRateDrill = (rating: DrillRating) => {
    if (!teamId || !drillId) return;
    const next = toggleDrillRating(teamId, drillId, rating);
    setDrillRatingState(next);
  };

  // ── Auto-advance countdown ────────────────────────────────────────────────
  const AUTO_ADVANCE_SECS = 60;
  const [countdown, setCountdown] = useState(AUTO_ADVANCE_SECS);
  // Pause when coach is actively composing an observation
  const countdownPaused = note.trim() !== '' || voice.isRecording;
  const onSkipRef = useRef(onSkip);
  useEffect(() => { onSkipRef.current = onSkip; }, [onSkip]);

  // Tick down every second while not paused
  useEffect(() => {
    if (countdownPaused || countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown, countdownPaused]);

  // Fire skip when countdown reaches zero
  useEffect(() => {
    if (countdown <= 0 && !countdownPaused) {
      onSkipRef.current();
    }
  }, [countdown, countdownPaused]);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  const handleMicToggle = () => {
    if (voice.isRecording) {
      const result = voice.stop();
      if (result.trim()) {
        setNote(result.trim());
        setTemplateCategory(undefined);
      }
    } else {
      voice.start();
    }
  };

  // Live display: while recording show accumulated + interim transcript
  const voiceLiveText = voice.isRecording
    ? [voice.transcript, voice.interimTranscript].filter(Boolean).join(' ')
    : '';

  const handleSave = () => {
    if (!note.trim()) { onSkip(); return; }
    const player = players.find((p) => p.id === selectedPlayer);
    onSave(note.trim(), player?.id, player?.name, sentiment, templateCategory);
  };

  const visibleTemplates = (() => {
    const bySentiment = OBSERVATION_TEMPLATES.filter((t) => t.sentiment === sentiment);
    if (!drillCategory) return bySentiment.slice(0, 5);
    const cat = drillCategory.toLowerCase();
    const match = bySentiment.find((t) => t.category.toLowerCase() === cat);
    if (!match) return bySentiment.slice(0, 5);
    const rest = bySentiment.filter((t) => t.id !== match.id);
    return [match, ...rest].slice(0, 5);
  })();

  return (
    <div className="relative flex flex-col min-h-screen bg-zinc-950 p-6">
      {/* Auto-advance progress bar — drains from full to empty over 60 s */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-amber-500/60 transition-all duration-1000 ease-linear"
          style={{ width: `${(countdown / AUTO_ADVANCE_SECS) * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between mb-8">
        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-sm px-3 py-1">
          Break
          {countdown > 0 && !countdownPaused && (
            <span className="ml-1.5 text-amber-400/70 font-normal">{countdown}s</span>
          )}
          {countdownPaused && countdown > 0 && (
            <span className="ml-1.5 text-zinc-500 font-normal">paused</span>
          )}
        </Badge>
        {nextDrillName && (
          <span className="text-xs text-zinc-500">
            Next: {nextDrillName}
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-5 max-w-xl mx-auto w-full">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 mb-1">
            What did you observe?
          </h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-zinc-500 shrink-0">
              Drill: <span className="text-zinc-300">{drillJustFinished}</span>
            </p>
            {drillId && teamId && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[10px] text-zinc-600">{formatRatingPrompt('')}</span>
                <button
                  type="button"
                  aria-label={getRatingAriaLabel('up', drillRating)}
                  aria-pressed={drillRating === 'up'}
                  onClick={() => handleRateDrill('up')}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg text-base transition-all touch-manipulation ${
                    drillRating === 'up'
                      ? 'bg-emerald-500/25 ring-1 ring-emerald-500/50 scale-110'
                      : 'bg-zinc-800 hover:bg-zinc-700'
                  }`}
                >
                  👍
                </button>
                <button
                  type="button"
                  aria-label={getRatingAriaLabel('down', drillRating)}
                  aria-pressed={drillRating === 'down'}
                  onClick={() => handleRateDrill('down')}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg text-base transition-all touch-manipulation ${
                    drillRating === 'down'
                      ? 'bg-red-500/25 ring-1 ring-red-500/50 scale-110'
                      : 'bg-zinc-800 hover:bg-zinc-700'
                  }`}
                >
                  👎
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sentiment toggle */}
        <div>
          <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">Observation type</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setSentiment('positive'); setNote(''); setTemplateCategory(undefined); }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all touch-manipulation active:scale-[0.98] ${
                sentiment === 'positive'
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                  : 'bg-zinc-900 border border-zinc-700 text-zinc-500 hover:border-zinc-600'
              }`}
            >
              <ThumbsUp className="h-4 w-4" />
              Positive
            </button>
            <button
              type="button"
              onClick={() => { setSentiment('needs-work'); setNote(''); setTemplateCategory(undefined); }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all touch-manipulation active:scale-[0.98] ${
                sentiment === 'needs-work'
                  ? 'bg-red-500/20 border border-red-500/40 text-red-300'
                  : 'bg-zinc-900 border border-zinc-700 text-zinc-500 hover:border-zinc-600'
              }`}
            >
              <ThumbsDown className="h-4 w-4" />
              Needs Work
            </button>
          </div>
        </div>

        {/* Quick templates */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Quick templates</p>
            {drillCategory && visibleTemplates[0]?.category.toLowerCase() === drillCategory.toLowerCase() && (
              <span className="text-[10px] text-orange-400/70 font-medium">
                {drillCategory} drill — top match first
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {visibleTemplates.map((t, idx) => {
              const isDrillMatch = idx === 0 && drillCategory &&
                t.category.toLowerCase() === drillCategory.toLowerCase();
              const isSelected = note === t.text && templateCategory === t.category;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setNote(t.text);
                    setTemplateCategory(t.category);
                    textRef.current?.focus();
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors touch-manipulation active:scale-[0.97] ${
                    isSelected
                      ? sentiment === 'positive'
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                        : 'bg-red-500/20 border border-red-500/40 text-red-300'
                      : isDrillMatch
                        ? 'bg-orange-500/10 border border-orange-500/30 text-orange-300 hover:border-orange-500/50'
                        : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                  }`}
                >
                  <span>{t.emoji}</span>
                  {t.text}
                </button>
              );
            })}
          </div>
        </div>

        {/* Player selector */}
        {players.length > 0 && (
          <div>
            {(() => {
              const observedCount = capturedPlayerIds ? players.filter(p => capturedPlayerIds.has(p.id)).length : 0;
              const unobservedCount = players.length - observedCount;
              // Sort: unobserved players first so coaches instantly see who they've missed
              const sortedPlayers = capturedPlayerIds
                ? [...players].sort((a, b) => {
                    const aObs = capturedPlayerIds.has(a.id) ? 1 : 0;
                    const bObs = capturedPlayerIds.has(b.id) ? 1 : 0;
                    return aObs - bObs;
                  })
                : players;
              return (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">Player (optional)</p>
                    {capturedPlayerIds && players.length > 0 && observedCount > 0 && (
                      <span className={`text-xs font-medium ${unobservedCount === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {unobservedCount === 0 ? '✓ All players observed' : `${observedCount}/${players.length} observed`}
                      </span>
                    )}
                  </div>
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
                    {sortedPlayers.map((p) => {
                      const isObserved = capturedPlayerIds?.has(p.id) ?? false;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelectedPlayer(p.id === selectedPlayer ? '' : p.id)}
                          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                            selectedPlayer === p.id
                              ? 'bg-orange-500 text-white'
                              : isObserved
                                ? 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700 ring-1 ring-emerald-500/40'
                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          {p.jersey_number ? `#${p.jersey_number} ` : ''}{p.name.split(' ')[0]}
                          {isObserved && selectedPlayer !== p.id && (
                            <span className="ml-1 text-emerald-500">✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Last observation context — shown when a specific player is selected */}
        {selectedPlayer && lastObsByPlayer[selectedPlayer] && (() => {
          const obs = lastObsByPlayer[selectedPlayer];
          const timeLabel = formatLastObsTime(obs.daysAgo, obs.fromCurrentSession);
          const isPositive = obs.sentiment === 'positive';
          return (
            <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs border ${
              obs.fromCurrentSession
                ? 'bg-orange-500/10 border-orange-500/20 text-orange-200'
                : isPositive
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-200'
            }`}>
              <span className="shrink-0 mt-0.5" aria-hidden="true">
                {obs.fromCurrentSession ? '📝' : isPositive ? '✓' : '!'}
              </span>
              <div className="min-w-0">
                <span className="font-semibold mr-1 opacity-70">{timeLabel}:</span>
                <span>{truncateObsText(obs.text)}</span>
                {obs.category && (
                  <span className="ml-1 opacity-50">· {obs.category}</span>
                )}
              </div>
            </div>
          );
        })()}

        <div className="relative">
          <Textarea
            ref={textRef}
            placeholder={voice.isSupported ? 'Tap 🎤 to speak, or type…' : 'Type an observation… or tap a template above'}
            value={voice.isRecording ? voiceLiveText : note}
            readOnly={voice.isRecording}
            onChange={(e) => {
              if (!voice.isRecording) {
                setNote(e.target.value);
                setTemplateCategory(undefined);
              }
            }}
            rows={4}
            className={`min-h-[80px] text-base bg-zinc-900 border-zinc-700 resize-none pr-12 transition-colors ${
              voice.isRecording ? 'border-red-500/50 text-zinc-400' : ''
            }`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && note.trim()) {
                handleSave();
              }
            }}
          />
          {voice.isSupported && (
            <button
              type="button"
              onClick={handleMicToggle}
              aria-label={voice.isRecording ? 'Stop voice input' : 'Start voice input'}
              aria-pressed={voice.isRecording}
              className={`absolute right-3 top-3 rounded-full p-2 transition-colors touch-manipulation active:scale-95 ${
                voice.isRecording
                  ? 'bg-red-500/20 text-red-400 animate-pulse'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {voice.isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
        </div>
        {voice.isRecording && (
          <div className="flex items-center gap-2 -mt-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-xs text-red-400">Listening…</span>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            className={`flex-1 h-12 font-semibold text-white ${
              sentiment === 'needs-work'
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
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

        {/* Smart player groups — for the next drill */}
        {playerGroups && playerGroups.length > 1 && (
          <div>
            <button
              type="button"
              onClick={() => setShowGroups((v) => !v)}
              className="w-full flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors touch-manipulation"
            >
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                <span className="font-medium text-zinc-300">
                  Groups for {nextDrillName ?? 'next drill'}
                </span>
                {groupsLabel && (
                  <span className="text-xs text-zinc-600 hidden sm:inline">
                    · {groupsLabel}
                  </span>
                )}
              </span>
              {showGroups ? (
                <ChevronUp className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" />
              )}
            </button>

            {showGroups && (
              <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(playerGroups.length, 2)}, 1fr)` }}>
                {playerGroups.map((group) => (
                  <div
                    key={group.label}
                    className={`rounded-xl border p-3 ${group.colorClass}`}
                  >
                    <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-80">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.players.map((p) => (
                        <span
                          key={p.id}
                          className="inline-block rounded-full bg-zinc-900/60 px-2.5 py-1 text-xs font-medium text-zinc-200"
                        >
                          {formatGroupPlayerLabel(p)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showGroups && groupsLabel && (
              <p className="mt-1.5 text-center text-xs text-zinc-600 sm:hidden">
                {groupsLabel}
              </p>
            )}
          </div>
        )}
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
  isRecovered,
  onStartFresh,
  presentPlayers,
  onAddNote,
  saveSuccess,
  coachName,
  teamName,
}: {
  drillsRun: QueueItem[];
  notes: CapturedNote[];
  isSaving: boolean;
  saveError: string | null;
  onSave: () => void;
  sessionId: string;
  isRecovered?: boolean;
  onStartFresh?: () => void;
  presentPlayers?: { id: string; name: string }[];
  onAddNote?: (playerId: string, playerName: string, sentiment: Sentiment, note: string) => void;
  saveSuccess?: boolean;
  coachName?: string;
  teamName?: string;
}) {
  const [rating, setRating] = useState<number>(0);
  const [ratingSaved, setRatingSaved] = useState(false);
  const [expandedPlayer, setExpandedPlayer] = useState<{ id: string; name: string } | null>(null);
  const [quickSentiment, setQuickSentiment] = useState<Sentiment>('positive');
  const [quickNote, setQuickNote] = useState('');
  const [parentMsgShared, setParentMsgShared] = useState(false);

  async function handleRate(n: number) {
    setRating(n);
    try {
      await mutate({
        table: 'sessions',
        operation: 'update',
        data: { quality_rating: n },
        filters: { id: sessionId },
      });
      setRatingSaved(true);
    } catch {
      // Silently fail — coach can still rate from the session detail page
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 p-6">
      <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-xl mx-auto w-full text-center">

        {/* Recovery banner — shown when session was restored from a crash */}
        {isRecovered && (
          <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3 text-left">
            <RotateCcw className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-300">
                Recovered {notes.length} observation{notes.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-amber-400/70 mt-0.5">
                The app was closed before these were saved. Save them now to keep them.
              </p>
            </div>
            {onStartFresh && (
              <button
                onClick={onStartFresh}
                className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 underline"
              >
                Discard
              </button>
            )}
          </div>
        )}

        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
          <Trophy className="h-10 w-10 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-zinc-100">Practice Done!</h2>
          <p className="text-zinc-400 mt-2">
            {drillsRun.length > 0
              ? `${drillsRun.length} drill${drillsRun.length !== 1 ? 's' : ''} • ${fmt(totalDuration(drillsRun))} total`
              : `${notes.length} observation${notes.length !== 1 ? 's' : ''} captured`}
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

        {notes.length > 0 && (() => {
          // Group observations by drill name
          const drillOrder: string[] = [];
          const byDrill: Record<string, CapturedNote[]> = {};
          for (const n of notes) {
            if (!byDrill[n.drillName]) {
              drillOrder.push(n.drillName);
              byDrill[n.drillName] = [];
            }
            byDrill[n.drillName].push(n);
          }
          return (
            <div className="w-full text-left space-y-3">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">
                {notes.length} Observation{notes.length !== 1 ? 's' : ''} Captured
              </p>
              {drillOrder.map((drillName) => {
                const group = byDrill[drillName];
                const pos = group.filter((n) => n.sentiment === 'positive').length;
                const nw = group.filter((n) => n.sentiment === 'needs-work').length;
                return (
                  <div key={drillName} className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                    {/* Drill header */}
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-900">
                      <Dumbbell className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                      <span className="text-xs font-semibold text-zinc-300 flex-1 truncate">{drillName}</span>
                      {pos > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                          👍 {pos}
                        </span>
                      )}
                      {nw > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                          👎 {nw}
                        </span>
                      )}
                    </div>
                    {/* Observations for this drill */}
                    <div className="divide-y divide-zinc-800/50">
                      {group.map((n, i) => (
                        <div key={i} className="px-4 py-2.5 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              n.sentiment === 'positive'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : n.sentiment === 'needs-work'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-zinc-700 text-zinc-400'
                            }`}>
                              {n.sentiment === 'positive' ? '👍' : n.sentiment === 'needs-work' ? '👎' : '—'}
                              {n.sentiment === 'positive' ? 'Positive' : n.sentiment === 'needs-work' ? 'Needs Work' : 'Neutral'}
                            </span>
                            {n.playerName && (
                              <span className="text-xs text-zinc-500">{n.playerName}</span>
                            )}
                          </div>
                          <p className="text-sm text-zinc-200">{n.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Session quality rating — capture it at the natural end-of-practice moment */}
        <div className="w-full rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-2.5">
          <p className="text-sm font-semibold text-zinc-300 text-center">How did practice go?</p>
          <div className="flex items-center justify-center gap-2">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button
                key={n}
                aria-label={`Rate practice ${n} star${n !== 1 ? 's' : ''}`}
                onClick={() => handleRate(n)}
                className="h-12 w-12 flex items-center justify-center rounded-lg transition-all touch-manipulation active:scale-90 hover:bg-zinc-800"
              >
                <Star
                  className={`h-8 w-8 transition-colors ${
                    n <= rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'
                  }`}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className={`text-sm font-medium text-center ${getRatingColor(rating)}`}>
              {getRatingLabel(rating as 1 | 2 | 3 | 4 | 5)}
              {ratingSaved && <span className="ml-2 text-xs text-zinc-500 font-normal">Saved</span>}
            </p>
          )}
          {rating === 0 && (
            <p className="text-xs text-zinc-600 text-center">Tap a star — helps track session quality over time</p>
          )}
        </div>

        {/* Unobserved players strip — tappable chips open an inline quick-note form */}
        {(() => {
          if (!presentPlayers || presentPlayers.length === 0) return null;
          const observedIds = new Set(notes.filter((n) => n.playerId).map((n) => n.playerId!));
          const unobserved = presentPlayers.filter((p) => !observedIds.has(p.id));
          if (unobserved.length === 0) return null;

          function handleChipTap(p: { id: string; name: string }) {
            if (!onAddNote) return;
            if (expandedPlayer?.id === p.id) {
              setExpandedPlayer(null);
            } else {
              setExpandedPlayer(p);
              setQuickSentiment('positive');
              setQuickNote('');
            }
          }

          function handleQuickAdd() {
            if (!expandedPlayer || !onAddNote) return;
            const fallback = quickSentiment === 'positive' ? 'Participated in practice' : 'Needs follow-up next session';
            onAddNote(expandedPlayer.id, expandedPlayer.name, quickSentiment, quickNote.trim() || fallback);
            setExpandedPlayer(null);
            setQuickNote('');
            setQuickSentiment('positive');
          }

          return (
            <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3 text-left">
              <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {unobserved.length} player{unobserved.length !== 1 ? 's' : ''} not yet observed
                {onAddNote && (
                  <span className="ml-auto text-[10px] font-normal text-amber-400/60">
                    tap a name to add a quick note
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unobserved.map((p) => (
                  onAddNote ? (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleChipTap(p)}
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors touch-manipulation active:scale-95 ${
                        expandedPlayer?.id === p.id
                          ? 'bg-amber-500/40 border-amber-400 text-amber-100'
                          : 'bg-amber-500/20 border-amber-500/30 text-amber-200 hover:bg-amber-500/30'
                      }`}
                    >
                      {p.name.split(' ')[0]}
                    </button>
                  ) : (
                    <span
                      key={p.id}
                      className="inline-flex items-center rounded-full bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 text-xs font-medium text-amber-200"
                    >
                      {p.name.split(' ')[0]}
                    </span>
                  )
                ))}
              </div>

              {/* Inline quick-note form — appears when a player chip is tapped */}
              {expandedPlayer && onAddNote && (
                <div className="rounded-lg border border-amber-500/40 bg-zinc-900/80 p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-zinc-200">
                    Quick note for <span className="text-amber-300">{expandedPlayer.name.split(' ')[0]}</span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickSentiment('positive')}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors touch-manipulation ${
                        quickSentiment === 'positive'
                          ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      👍 Positive
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickSentiment('needs-work')}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors touch-manipulation ${
                        quickSentiment === 'needs-work'
                          ? 'bg-red-500/25 text-red-300 border border-red-500/40'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      👎 Needs Work
                    </button>
                  </div>
                  <textarea
                    value={quickNote}
                    onChange={(e) => setQuickNote(e.target.value)}
                    placeholder={quickSentiment === 'positive' ? 'e.g. Hustled all practice (optional)' : 'e.g. Follow up on footwork (optional)'}
                    rows={2}
                    className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none focus:border-amber-500/60"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleQuickAdd}
                      className="flex-1 rounded-lg bg-amber-500 py-2 text-xs font-semibold text-white hover:bg-amber-600 transition-colors touch-manipulation active:scale-[0.98]"
                    >
                      Add Note
                    </button>
                    <button
                      type="button"
                      onClick={() => { setExpandedPlayer(null); setQuickNote(''); }}
                      className="px-4 rounded-lg bg-zinc-800 py-2 text-xs text-zinc-400 hover:bg-zinc-700 transition-colors touch-manipulation"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!onAddNote && (
                <p className="text-[10px] text-amber-400/60">
                  Focus on these players next session to maintain even coverage.
                </p>
              )}
            </div>
          );
        })()}

        {saveError && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-lg px-4 py-3 w-full">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {saveError}
          </div>
        )}

        {saveSuccess && coachName && teamName ? (
          /* ── Post-save success state ── */
          <div className="w-full space-y-3">
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <p className="text-sm font-semibold text-emerald-300">
                {notes.length} observation{notes.length !== 1 ? 's' : ''} saved!
              </p>
            </div>

            {/* Quick parent update card — pre-built message, zero AI, instant display */}
            <div className="w-full rounded-xl border border-teal-500/30 bg-teal-500/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-teal-400 shrink-0" />
                <p className="text-sm font-semibold text-teal-300">Quick parent update ready</p>
              </div>
              <p className="text-xs text-teal-400/70 leading-relaxed whitespace-pre-line line-clamp-4">
                {buildQuickParentUpdate(notes, coachName.split(' ')[0], teamName)}
              </p>
              <button
                type="button"
                onClick={async () => {
                  const msg = buildQuickParentUpdate(notes, coachName.split(' ')[0], teamName);
                  if (typeof navigator !== 'undefined' && navigator.share) {
                    try { await navigator.share({ text: msg }); } catch { /* dismissed */ }
                  } else {
                    try { await navigator.clipboard.writeText(msg); } catch { /* ignore */ }
                  }
                  setParentMsgShared(true);
                  setTimeout(() => setParentMsgShared(false), 2500);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-500 hover:bg-teal-600 active:scale-[0.98] px-4 py-2.5 text-sm font-semibold text-white transition-colors touch-manipulation"
              >
                {parentMsgShared ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    {typeof navigator !== 'undefined' && !navigator.share ? 'Copied!' : 'Sent!'}
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4" />
                    Send to parent group chat
                  </>
                )}
              </button>
            </div>

            <Link
              href={`/sessions/${sessionId}?fromPractice=1&obsCount=${notes.length}&playerCount=${new Set(notes.filter((n) => n.playerId).map((n) => n.playerId!)).size}`}
              className="w-full"
            >
              <Button className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold">
                View Session &amp; AI Debrief →
              </Button>
            </Link>
          </div>
        ) : (
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
        )}
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
  const searchParams = useSearchParams();
  const planId = searchParams.get('planId');
  const arcSessionParam = searchParams.get('arcSession');
  const arcSessionIndex = arcSessionParam !== null ? parseInt(arcSessionParam, 10) : null;
  const templateIdParam = searchParams.get('templateId');
  const { activeTeam, coach } = useActiveTeam();

  // ── Persistence keys ─────────────────────────────────────────────────────
  const NOTES_KEY = `practice-timer-notes-v1-${sessionId}`;
  const QUEUE_KEY = `practice-timer-queue-v1-${sessionId}`;

  // ── State ────────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState<CapturedNote[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(`practice-timer-notes-v1-${sessionId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as any[];
      return parsed.map((n) => ({ ...n, timestamp: new Date(n.timestamp) }));
    } catch { return []; }
  });
  const [isRecovered, setIsRecovered] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem(`practice-timer-notes-v1-${sessionId}`);
      if (!raw) return false;
      return (JSON.parse(raw) as any[]).length > 0;
    } catch { return false; }
  });
  const [mode, setMode] = useState<TimerMode>(() => {
    if (typeof window === 'undefined') return 'setup';
    try {
      const raw = localStorage.getItem(`practice-timer-notes-v1-${sessionId}`);
      if (!raw) return 'setup';
      return (JSON.parse(raw) as any[]).length > 0 ? 'done' : 'setup';
    } catch { return 'setup'; }
  });
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const notesRaw = localStorage.getItem(`practice-timer-notes-v1-${sessionId}`);
      const hasNotes = notesRaw && (JSON.parse(notesRaw) as any[]).length > 0;
      if (hasNotes) return [];
      const raw = localStorage.getItem(`practice-timer-queue-v1-${sessionId}`);
      if (!raw) return [];
      return JSON.parse(raw) as QueueItem[];
    } catch { return []; }
  });
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [cueIdx, setCueIdx] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadedPlanTitle, setLoadedPlanTitle] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [showSwapSheet, setShowSwapSheet] = useState(false);

  // Setup state
  const [drillSearch, setDrillSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [customDuration, setCustomDuration] = useState('10');
  const [showDrillPicker, setShowDrillPicker] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [loadedTemplateName, setLoadedTemplateName] = useState<string | null>(null);
  const [lastPracticeQueue, setLastPracticeQueue] = useState<QueueItem[] | null>(null);
  const [showSavedQueues, setShowSavedQueues] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveFormName, setSaveFormName] = useState('');
  const [savedQueues, setSavedQueues] = useState<SavedQueueEntry[]>(() => {
    if (!activeTeam?.id || typeof window === 'undefined') return [];
    return listSavedQueues(activeTeam.id);
  });

  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const raw = localStorage.getItem('coach-audio-enabled');
      return raw === null ? true : raw === 'true';
    } catch { return true; }
  });

  const [bgAdjustMsg, setBgAdjustMsg] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cueIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track wall-clock time when page goes hidden so we can compensate on return.
  const hiddenAtRef = useRef<number | null>(null);
  // Mirror timeLeft in a ref so visibility handler can read it synchronously.
  const timeLeftRef = useRef(0);
  // Stable refs so the announcement effect can read latest values without
  // being re-triggered by note/queue mutations during a drill.
  const queueRef = useRef(queue);
  const notesRef = useRef(notes);

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

  // Fetch player availability so injured/absent players are excluded from the break-screen picker.
  const { data: availabilityMap = {} } = useQuery<Record<string, PlayerAvailability>>({
    queryKey: ['player-availability', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return {};
      const res = await fetch(`/api/player-availability?team_id=${activeTeam.id}`);
      if (!res.ok) return {};
      const d = await res.json();
      return (d.availability ?? {}) as Record<string, PlayerAvailability>;
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  // Players who are injured / sick / unavailable should be hidden from the observation picker.
  // 'limited' players can still participate and be observed.
  const EXCLUDED_STATUSES = new Set(['injured', 'sick', 'unavailable']);
  const presentPlayers = players.filter(
    (p) => !availabilityMap[p.id] || !EXCLUDED_STATUSES.has(availabilityMap[p.id].status)
  );
  const absentPlayers = players.filter(
    (p) => availabilityMap[p.id] && EXCLUDED_STATUSES.has(availabilityMap[p.id].status)
  );

  // Fetch recent needs-work observations (last 30 days) for player focus callouts.
  // Loaded once on mount; cached for 5 minutes so it doesn't slow drill transitions.
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: needsWorkObs = [] } = useQuery({
    queryKey: ['timer-needs-work-obs', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<NeedsWorkObs[]>({
        table: 'observations',
        select: 'player_id, category',
        filters: {
          team_id: activeTeam.id,
          sentiment: 'needs-work',
          created_at: { op: 'gte', value: thirtyDaysAgo.toISOString() },
        },
        limit: 300,
      });
      return data || [];
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch recent observations (all sentiments, last 30 days) for last-obs context
  // on the break screen. Piggybacked at the same staleTime so no extra round-trip
  // when the focus-callout data is already warm.
  const { data: recentObs = [] } = useQuery({
    queryKey: ['timer-recent-obs', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<RecentObs[]>({
        table: 'observations',
        select: 'player_id, text, sentiment, category, created_at',
        filters: {
          team_id: activeTeam.id,
          created_at: { op: 'gte', value: thirtyDaysAgo.toISOString() },
        },
        order: { column: 'created_at', ascending: false },
        limit: 300,
      });
      return (data || []).filter((o): o is RecentObs => !!o.player_id && !!o.text);
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  const { data: favoritesData } = useQuery({
    queryKey: ['drill-favorites'],
    queryFn: async () => {
      const res = await fetch('/api/drill-favorites');
      if (!res.ok) return { favorites: [] as string[] };
      return res.json() as Promise<{ favorites: string[] }>;
    },
    staleTime: 60 * 1000,
  });
  const favoriteIds: string[] = favoritesData?.favorites ?? [];

  // Fetch the most recent session that has a completed AI debrief — used in setup
  // to show coaches exactly what to focus on in THIS practice based on last time.
  const { data: lastDebriefSession } = useQuery({
    queryKey: ['timer-last-debrief', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return null;
      const data = await query<Session[]>({
        table: 'sessions',
        select: 'id, date, coach_debrief_extracts',
        filters: {
          team_id: activeTeam.id,
          coach_debrief_extracts: { op: 'neq', value: null },
        },
        order: { column: 'date', ascending: false },
        limit: 2,
      });
      return (data || []).find((s) => s.id !== sessionId) ?? null;
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  const lastDebriefInsights = useMemo(() => {
    if (!lastDebriefSession?.coach_debrief_extracts) return null;
    const debrief = lastDebriefSession.coach_debrief_extracts as any;
    const focuses: Array<{ focus: string; suggested_drill?: string }> =
      (debrief.next_practice_focus || []).slice(0, 2);
    const recurring: string[] = (debrief.recurring_focus_areas || []).slice(0, 3);
    if (focuses.length === 0 && recurring.length === 0) return null;
    return { date: lastDebriefSession.date as string, focuses, recurring };
  }, [lastDebriefSession]);

  // Build a lookup of the most recent observation per player for break-screen context.
  // Current-session notes take priority over DB observations so coaches see the most
  // relevant context ("You just said Marcus was doing great — is he still on a roll?").
  const lastObsByPlayer = useMemo(
    () =>
      buildLastObsByPlayer(
        notes.map((n) => ({ playerId: n.playerId, note: n.note, sentiment: n.sentiment, category: n.category })),
        recentObs
      ),
    [notes, recentObs]
  );

  // ── Load plan queue from planId search param ─────────────────────────────
  // ── Load last practice queue from localStorage ───────────────────────────
  useEffect(() => {
    if (!activeTeam) return;
    try {
      const raw = localStorage.getItem(`last-practice-queue-${activeTeam.id}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as QueueItem[];
      if (parsed.length > 0) setLastPracticeQueue(parsed);
    } catch { /* ignore */ }
  }, [activeTeam?.id]);

  useEffect(() => {
    if (!planId || queue.length > 0 || isRecovered) return;

    setPlanLoading(true);
    query<Plan>({
      table: 'plans',
      select: '*',
      filters: { id: planId },
      single: true,
    })
      .then((plan) => {
        if (!plan?.content_structured) return;
        const s = plan.content_structured as any;
        const items: QueueItem[] = [];

        // Determine the source of drills — either a regular practice plan or one
        // session within a practice_arc plan (selected via ?arcSession=N).
        const isArc = plan.type === 'practice_arc' && arcSessionIndex !== null;
        const sessionData = isArc
          ? (Array.isArray(s.sessions) ? s.sessions[arcSessionIndex!] : null)
          : null;
        const src = sessionData ?? s;

        if (src.warmup?.name) {
          items.push({
            id: `warmup-${Date.now()}`,
            name: src.warmup.name,
            durationSecs: Math.max(60, (src.warmup.duration_minutes ?? 5) * 60),
            cues: [],
            description: src.warmup.description || '',
          });
        }

        (src.drills || []).forEach((d: any, i: number) => {
          items.push({
            id: `plan-drill-${i}-${Date.now()}`,
            name: d.name,
            durationSecs: Math.max(60, (d.duration_minutes ?? 10) * 60),
            cues: Array.isArray(d.coaching_cues) ? d.coaching_cues : [],
            description: d.description || '',
          });
        });

        if (src.scrimmage?.duration_minutes) {
          items.push({
            id: `scrimmage-${Date.now()}`,
            name: src.scrimmage.focus ? `Scrimmage: ${src.scrimmage.focus}` : 'Scrimmage',
            durationSecs: Math.max(60, src.scrimmage.duration_minutes * 60),
            cues: [],
            description: '',
          });
        }

        if (src.cooldown?.duration_minutes) {
          items.push({
            id: `cooldown-${Date.now()}`,
            name: 'Cool Down',
            durationSecs: Math.max(60, src.cooldown.duration_minutes * 60),
            cues: [],
            description: src.cooldown.notes || '',
          });
        }

        if (items.length > 0) {
          const sessionNum = isArc ? arcSessionIndex! + 1 : null;
          const arcTitle = plan.title || 'Practice Series';
          const totalSessions = isArc && Array.isArray(s.sessions) ? s.sessions.length : 0;
          const titleSuffix = isArc ? ` — Session ${sessionNum} of ${totalSessions}` : '';
          setQueue(items);
          setLoadedPlanTitle((arcTitle) + titleSuffix);

          // Advance arc-progress so the ContinueArcCard on the home dashboard
          // points to the NEXT session in the series.
          if (isArc && activeTeam && Array.isArray(s.sessions)) {
            const nextIdx = arcSessionIndex! + 1;
            if (nextIdx < s.sessions.length) {
              const nextSession = s.sessions[nextIdx];
              try {
                localStorage.setItem(`arc-progress-${activeTeam.id}`, JSON.stringify({
                  planId,
                  arcTitle,
                  nextSession: nextIdx + 1,
                  totalSessions,
                  nextSessionTitle: nextSession?.session_label || nextSession?.session_goal || `Session ${nextIdx + 1}`,
                  savedAt: new Date().toISOString(),
                }));
              } catch { /* ignore */ }
            } else {
              // All sessions completed — clear the progress card and write a
              // completion record so ArcCompleteCard can show a celebration.
              try {
                localStorage.removeItem(`arc-progress-${activeTeam.id}`);
                localStorage.setItem(`arc-complete-${activeTeam.id}`, JSON.stringify({
                  planId,
                  arcTitle,
                  totalSessions,
                  completedAt: new Date().toISOString(),
                }));
              } catch { /* ignore */ }
            }
          }
        }
      })
      .catch(() => {/* silently ignore */})
      .finally(() => setPlanLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  // ── Auto-load template from templateId URL param (from FirstPracticeLauncher) ──
  useEffect(() => {
    if (!templateIdParam || queue.length > 0 || isRecovered) return;
    const template = getTemplateById(templateIdParam);
    if (!template) return;
    const items: QueueItem[] = template.drills.map((d: TemplateDrill, i: number) => ({
      id: `tpl-${template.id}-${i}-${Date.now()}`,
      name: d.name,
      durationSecs: d.durationMins * 60,
      cues: d.cues,
      description: d.description,
    }));
    setQueue(items);
    setLoadedTemplateName(template.name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateIdParam]);

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
    return () => {
      clearIntervals();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [clearIntervals]);

  // ── Audio announcements ──────────────────────────────────────────────────
  const { speak } = useAnnouncer(audioEnabled);
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);
  // Keep refs in sync so the mode-change effect reads latest data without
  // triggering on every note/queue mutation.
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { notesRef.current = notes; }, [notes]);

  // Persist audio toggle preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem('coach-audio-enabled', String(audioEnabled)); } catch { /* ignore */ }
  }, [audioEnabled]);

  // Announce each drill start, break prompt, and practice-complete moment.
  // Uses refs so this effect only fires on mode/drill transitions, not on
  // every note saved or queue reorder.
  useEffect(() => {
    const drill = queueRef.current[currentIdx];
    if (mode === 'running' && drill) {
      speakRef.current(buildDrillAnnouncement(drill.name, drill.durationSecs, drill.cues[0]));
    } else if (mode === 'break') {
      speakRef.current(buildBreakAnnouncement());
    } else if (mode === 'done') {
      speakRef.current(buildPracticeCompleteAnnouncement(notesRef.current.length));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentIdx]);

  // Keep timeLeftRef in sync so the visibility handler can read it synchronously.
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  // Page Visibility: compensate for time elapsed while the app was backgrounded.
  // Mobile browsers throttle or freeze setInterval when the screen locks, so the
  // countdown would fall behind real time. On return we subtract wall-clock elapsed.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (mode !== 'running' || isPaused) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current !== null) {
        const elapsedSecs = Math.floor((Date.now() - hiddenAtRef.current) / 1000);
        hiddenAtRef.current = null;
        if (elapsedSecs < 1) return;

        const adjusted = timeLeftRef.current - elapsedSecs;
        if (adjusted <= 0) {
          clearIntervals();
          setTimeLeft(0);
          setMode('break');
        } else {
          setTimeLeft(adjusted);
          if (elapsedSecs >= 10) {
            const mins = Math.floor(elapsedSecs / 60);
            const secs = elapsedSecs % 60;
            const label = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
            setBgAdjustMsg(`Timer adjusted ${label} for background`);
            setTimeout(() => setBgAdjustMsg(null), 3000);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [mode, isPaused, clearIntervals]);

  // Auto-persist captured notes so they survive accidental app closes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (notes.length > 0) {
        localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
      }
    } catch { /* quota errors are non-fatal */ }
  }, [notes, NOTES_KEY]);

  // Auto-persist drill queue so setup isn't lost on accidental close
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (queue.length > 0 && mode === 'setup') {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      }
    } catch { /* quota errors are non-fatal */ }
  }, [queue, mode, QUEUE_KEY]);

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

  const handleAdjustTime = (deltaSecs: number) => {
    setTimeLeft((prev) => {
      const next = Math.max(10, prev + deltaSecs);
      // Keep durationSecs in sync so the progress bar stays 0–100%
      setQueue((q) =>
        q.map((d, i) =>
          i === currentIdx ? { ...d, durationSecs: Math.max(10, d.durationSecs + deltaSecs) } : d
        )
      );
      return next;
    });
    if (navigator.vibrate) navigator.vibrate(30);
  };

  const handleBreakSave = (note: string, playerId?: string, playerName?: string, sentiment: Sentiment = 'positive', category?: string) => {
    const drill = queue[currentIdx];
    setNotes((prev) => [
      ...prev,
      {
        drillName: drill.name,
        drillId: drill.drillId,
        note,
        playerId,
        playerName,
        sentiment,
        category: category || drill.category || 'general',
        timestamp: new Date(),
      },
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
      if (activeTeam?.id && queue[next]?.drillId) {
        recordDrillRun(activeTeam.id, queue[next].drillId);
      }
    }
  };

  const handleStart = () => {
    if (queue.length === 0) return;
    setCurrentIdx(0);
    setMode('running');
    startTimerForDrill(0, queue);
    if (activeTeam?.id && queue[0]?.drillId) {
      recordDrillRun(activeTeam.id, queue[0].drillId);
    }
  };

  // ── Save observations ────────────────────────────────────────────────────
  const handleSaveObservations = async () => {
    if (!activeTeam || !coach || notes.length === 0) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const rows = notes.map((n) => ({
        team_id: activeTeam.id,
        coach_id: coach.id,
        session_id: sessionId,
        player_id: n.playerId || null,
        drill_id: n.drillId || null,
        text: n.note,
        raw_text: n.note,
        category: n.category,
        sentiment: n.sentiment,
        source: 'typed' as const,
        ai_parsed: false,
        coach_edited: false,
      }));

      await mutate({
        table: 'observations',
        operation: 'insert',
        data: rows,
      });

      // Persist this queue as "last practice" so coach can repeat it next time
      if (activeTeam && queue.length > 0) {
        try {
          localStorage.setItem(`last-practice-queue-${activeTeam.id}`, JSON.stringify(queue));
        } catch { /* ignore */ }
      }
      // Clear persisted data — observations are now in the DB
      try {
        localStorage.removeItem(NOTES_KEY);
        localStorage.removeItem(QUEUE_KEY);
      } catch { /* ignore */ }
      setSaveSuccess(true);
      setIsSaving(false);
      // Coach sees success state with parent update card; navigates via "View Session & AI Debrief" button.
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save observations');
      setIsSaving(false);
    }
  };

  // ── Discard recovered data and start fresh ───────────────────────────────
  const handleStartFresh = () => {
    try {
      localStorage.removeItem(NOTES_KEY);
      localStorage.removeItem(QUEUE_KEY);
    } catch { /* ignore */ }
    setNotes([]);
    setQueue([]);
    setIsRecovered(false);
    setMode('setup');
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
      category: drill.category,
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

  // ── Saved queue templates ─────────────────────────────────────────────────
  const handleSaveQueue = () => {
    if (!activeTeam?.id || !isValidQueueName(saveFormName) || queue.length === 0) return;
    const items: SavedQueueItem[] = queue.map((q) => ({
      id: q.id,
      drillId: q.drillId,
      name: q.name,
      durationSecs: q.durationSecs,
      cues: q.cues,
      description: q.description,
      category: q.category,
    }));
    saveQueue(activeTeam.id, saveFormName, items);
    setSavedQueues(listSavedQueues(activeTeam.id));
    setSaveFormName('');
    setShowSaveForm(false);
  };

  const handleLoadSavedQueue = (entry: SavedQueueEntry) => {
    const items: QueueItem[] = entry.items.map((i) => ({
      ...i,
      id: `${i.id}-${Date.now()}`,
    }));
    setQueue(items);
    setShowSavedQueues(false);
    setLoadedTemplateName(entry.name);
  };

  const handleDeleteSavedQueue = (queueId: string) => {
    if (!activeTeam?.id) return;
    deleteQueue(activeTeam.id, queueId);
    setSavedQueues(listSavedQueues(activeTeam.id));
  };

  const moveQueueItem = (id: string, direction: 'up' | 'down') => {
    setQueue((prev) => {
      const idx = prev.findIndex((d) => d.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  const updateDuration = (id: string, mins: string) => {
    const secs = Math.max(60, parseInt(mins || '1') * 60);
    setQueue((prev) => prev.map((d) => (d.id === id ? { ...d, durationSecs: secs } : d)));
  };

  // ── Swap drill ────────────────────────────────────────────────────────────
  // Returns up to 4 drills with the same category as the current drill,
  // excluding any drill already in the queue (by id or name to catch custom items).
  const swapAlternatives = useMemo((): Drill[] => {
    const current = queue[currentIdx];
    if (!current || !drills.length) return [];
    const category = current.category;
    const queuedIds = new Set(queue.map((q) => q.drillId).filter(Boolean));
    const queuedNames = new Set(queue.map((q) => q.name.toLowerCase()));
    return drills
      .filter(
        (d) =>
          d.id !== current.drillId &&
          !queuedIds.has(d.id) &&
          !queuedNames.has(d.name.toLowerCase()) &&
          (!category || d.category?.toLowerCase() === category?.toLowerCase())
      )
      .slice(0, 4);
  }, [queue, currentIdx, drills]);

  const handleSwapDrill = (replacement: Drill) => {
    const newItem: QueueItem = {
      id: `${replacement.id}-${Date.now()}`,
      drillId: replacement.id,
      name: replacement.name,
      durationSecs: (replacement.duration_minutes ?? 10) * 60,
      cues: replacement.teaching_cues || [],
      description: replacement.description,
      category: replacement.category,
    };
    setQueue((prev) => prev.map((item, idx) => (idx === currentIdx ? newItem : item)));
    setShowSwapSheet(false);
    // Restart countdown for the new drill
    startTimerForDrill(currentIdx, queue.map((item, idx) => (idx === currentIdx ? newItem : item)));
  };

  // ── Filtered drills ──────────────────────────────────────────────────────
  // Favorites sort to the top when no search is active; favorites-only toggle filters further.
  const filteredDrills = useMemo(() => {
    let list = drills.filter(
      (d) =>
        !drillSearch ||
        d.name.toLowerCase().includes(drillSearch.toLowerCase()) ||
        d.category.toLowerCase().includes(drillSearch.toLowerCase())
    );
    if (showFavoritesOnly) {
      list = list.filter((d) => isFavorited(d.id, favoriteIds));
    } else if (!drillSearch) {
      // Favorites first, then well-rated, then fresh (never/rarely run), poorly-rated last
      list = sortWithFavoritesFirst(list, favoriteIds);
      if (activeTeam?.id) {
        list = sortDrillsByFreshness(list, activeTeam.id);
        list = sortDrillsByRating(list, activeTeam.id);
      }
    }
    return list;
  }, [drills, drillSearch, showFavoritesOnly, favoriteIds, activeTeam?.id]);

  // ── Skill-gap drill suggestions for the empty queue screen ───────────────
  // Uses already-fetched needsWorkObs + drills — no extra API call.
  const suggestedDrills = useMemo(() => {
    if (!drills.length || !needsWorkObs.length) return [] as Drill[];
    const counts: Record<string, number> = {};
    for (const obs of needsWorkObs) {
      if (obs.category) counts[obs.category] = (counts[obs.category] ?? 0) + 1;
    }
    const topGaps = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([cat]) => cat.toLowerCase());
    if (!topGaps.length) return [] as Drill[];
    const queuedIds = new Set(queue.map((q) => q.drillId).filter(Boolean));
    return drills
      .filter((d) => topGaps.includes(d.category.toLowerCase()) && !queuedIds.has(d.id))
      .sort((a, b) => {
        const ai = topGaps.indexOf(a.category.toLowerCase());
        const bi = topGaps.indexOf(b.category.toLowerCase());
        return ai - bi;
      })
      .slice(0, 3);
  }, [drills, needsWorkObs, queue]);

  // ── Coaching phrase fallback ─────────────────────────────────────────────
  // When the current drill has no teaching cues, surface a sport- and
  // category-specific phrase from the static coaching-phrases library so
  // coaches always have something concrete to SAY to players.
  const sportSlug = (coach?.organizations as any)?.sport_config?.default_sport_slug ?? 'basketball';

  const fallbackCue = useMemo(() => {
    const drill = queue[currentIdx];
    if (!drill || drill.cues.length > 0) return null; // real cues available — no fallback needed
    const nameLower = drill.name.toLowerCase();
    // Infer a structural category from the drill name when no category is stored
    let cat: string | undefined = drill.category;
    if (!cat) {
      if (nameLower.includes('warm')) cat = 'warmup';
      else if (nameLower.includes('scrimmage') || nameLower.includes('game')) cat = 'scrimmage';
    }
    if (!hasPhrases(cat, sportSlug)) return null;
    return getPhraseByIndex(cat, sportSlug, cueIdx);
  }, [queue, currentIdx, cueIdx, sportSlug]);

  // ── Practice templates ───────────────────────────────────────────────────
  const availableTemplates = rankTemplates(
    getTemplatesForSport(activeTeam?.sport_id || ''),
    activeTeam?.sport_id || '',
    activeTeam?.age_group || ''
  );

  const loadTemplate = (template: PracticeTemplate) => {
    const items: QueueItem[] = template.drills.map((d, i) => ({
      id: `tpl-${template.id}-${i}-${Date.now()}`,
      name: d.name,
      durationSecs: d.durationMins * 60,
      cues: d.cues,
      description: d.description,
    }));
    setQueue(items);
    setLoadedTemplateName(template.name);
    setLoadedPlanTitle(null);
    setShowTemplatePicker(false);
  };

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
        isRecovered={isRecovered}
        onStartFresh={handleStartFresh}
        presentPlayers={presentPlayers}
        onAddNote={(playerId, playerName, sentiment, note) => {
          setNotes((prev) => [
            ...prev,
            {
              drillName: 'Post-Practice',
              note,
              playerId,
              playerName,
              sentiment,
              category: 'general',
              timestamp: new Date(),
            },
          ]);
        }}
        saveSuccess={saveSuccess}
        coachName={coach?.full_name ?? undefined}
        teamName={activeTeam?.name ?? undefined}
      />
    );
  }

  // Break
  if (mode === 'break') {
    const drill = queue[currentIdx];
    const nextDrill = queue[currentIdx + 1];
    const capturedPlayerIds = new Set(notes.filter(n => n.playerId).map(n => n.playerId!));
    // Build balanced groups for the next drill using obs history (already fetched).
    const nextCategory = nextDrill?.category;
    const obsForGrouping = recentObs.map((o) => ({
      player_id: o.player_id,
      category: o.category,
      sentiment: o.sentiment,
    }));
    const playerGroups = nextDrill
      ? buildGroupsForDrill(presentPlayers, nextCategory, obsForGrouping)
      : undefined;
    const hasData = nextDrill
      ? hasSkillDataForGrouping(presentPlayers, nextCategory, obsForGrouping)
      : false;
    const groupsLabel = nextDrill
      ? buildGroupingBasisLabel(nextCategory, hasData)
      : undefined;
    return (
      <BreakScreen
        drillJustFinished={drill?.name ?? ''}
        drillId={drill?.drillId}
        teamId={activeTeam?.id}
        drillCategory={drill?.category}
        nextDrillName={nextDrill?.name}
        players={presentPlayers}
        onSave={handleBreakSave}
        onSkip={handleBreakSkip}
        capturedPlayerIds={capturedPlayerIds}
        lastObsByPlayer={lastObsByPlayer}
        playerGroups={playerGroups}
        groupsLabel={groupsLabel}
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
    const currentCue = drill?.cues[cueIdx] || fallbackCue;
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAudioEnabled((prev) => !prev)}
              className={`flex items-center gap-1 transition-colors ${
                audioEnabled ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-600 hover:text-zinc-400'
              }`}
              aria-label={audioEnabled ? 'Disable audio announcements' : 'Enable audio announcements'}
              aria-pressed={audioEnabled}
            >
              {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              onClick={handleSkipDrill}
              className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
            >
              Skip
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-zinc-900">
          <div
            className="h-full bg-orange-500 transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Background compensation notice */}
        {bgAdjustMsg && (
          <div className="mx-5 mt-2 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 text-xs text-amber-400 text-center">
            {bgAdjustMsg}
          </div>
        )}

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

          {/* Time adjustment buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleAdjustTime(-60)}
              className="flex items-center gap-1 rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all touch-manipulation px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
              aria-label="Subtract 1 minute"
            >
              −1 min
            </button>
            <button
              onClick={() => handleAdjustTime(120)}
              className="flex items-center gap-1 rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all touch-manipulation px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
              aria-label="Add 2 minutes"
            >
              +2 min
            </button>
          </div>

          {/* Coaching cue */}
          {currentCue && (
            <div className="flex items-start gap-3 bg-zinc-900/80 rounded-xl px-5 py-4 max-w-sm w-full">
              <Lightbulb className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-zinc-200 leading-relaxed">{currentCue}</p>
            </div>
          )}

          {/* Player focus callouts — who to watch based on recent needs-work obs */}
          {(() => {
            if (!hasEnoughObsForFocus(needsWorkObs)) return null;
            const focus = getPlayerFocusForCategory(drill?.category, needsWorkObs, presentPlayers);
            if (focus.length === 0) return null;
            return (
              <div className="flex flex-col items-center gap-2 max-w-sm w-full">
                <p className="text-xs text-zinc-600 uppercase tracking-wide flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  Watch closely
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {focus.map((f) => (
                    <span
                      key={f.playerId}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 text-sm font-medium text-amber-300"
                    >
                      {buildFocusLabel(f)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Next drill preview */}
          {nextDrill && (
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <ChevronRight className="h-3.5 w-3.5" />
              Next: {nextDrill.name} ({fmt(nextDrill.durationSecs)})
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-6 flex gap-4 justify-center items-center">
          {swapAlternatives.length > 0 && (
            <button
              onClick={() => setShowSwapSheet(true)}
              className="flex flex-col items-center gap-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Swap this drill for an alternative"
            >
              <Shuffle className="h-5 w-5" />
              <span className="text-xs">Swap</span>
            </button>
          )}
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
          {/* spacer to balance the Swap button */}
          {swapAlternatives.length > 0 && <div className="w-9" />}
        </div>

        {/* Swap Drill bottom sheet */}
        {showSwapSheet && (
          <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label="Swap drill">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setShowSwapSheet(false)}
            />
            <div className="relative w-full bg-zinc-900 rounded-t-2xl border-t border-zinc-800 p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-zinc-100">Swap drill</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {queue[currentIdx]?.category
                      ? `Same skill: ${queue[currentIdx].category}`
                      : 'Choose a replacement drill'}
                  </p>
                </div>
                <button
                  onClick={() => setShowSwapSheet(false)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-2">
                {swapAlternatives.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => handleSwapDrill(d)}
                    className="w-full text-left rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] transition-all p-4 space-y-1 touch-manipulation"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-100 text-sm">{d.name}</span>
                      <span className="text-xs text-zinc-500">{d.duration_minutes ?? 10} min</span>
                    </div>
                    {d.description && (
                      <p className="text-xs text-zinc-500 line-clamp-2">{d.description}</p>
                    )}
                    {d.teaching_cues?.[0] && (
                      <p className="text-xs text-amber-400/80 flex items-center gap-1">
                        <Lightbulb className="h-3 w-3 shrink-0" />
                        {d.teaching_cues[0]}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Setup
  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8 max-w-2xl mx-auto">
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

      {/* Plan loaded banner */}
      {planLoading && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm text-blue-300">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          Loading plan…
        </div>
      )}
      {loadedPlanTitle && !planLoading && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm text-blue-300">
          <ClipboardList className="h-4 w-4 shrink-0" />
          Loaded from plan: <span className="font-medium">{loadedPlanTitle}</span>
        </div>
      )}

      {/* Template loaded banner */}
      {loadedTemplateName && !loadedPlanTitle && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300">
          <Layers className="h-4 w-4 shrink-0" />
          Loaded template: <span className="font-medium">{loadedTemplateName}</span>
        </div>
      )}

      {/* Absent/unavailable players banner */}
      {absentPlayers.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <span className="font-medium">
              {absentPlayers.length === 1
                ? absentPlayers[0].name
                : `${absentPlayers.slice(0, 2).map((p) => p.name).join(', ')}${absentPlayers.length > 2 ? ` +${absentPlayers.length - 2} more` : ''}`}
            </span>{' '}
            {absentPlayers.length === 1 ? 'is' : 'are'} marked unavailable and won&apos;t appear in your observation picker.
          </span>
        </div>
      )}

      {/* From Last Session insights */}
      {lastDebriefInsights && (
        <div className="rounded-xl border border-indigo-700/30 bg-indigo-500/5 px-4 py-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">
              From last session ·{' '}
              {new Date(lastDebriefInsights.date + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
          {lastDebriefInsights.focuses.length > 0 && (
            <div className="space-y-1">
              {lastDebriefInsights.focuses.map((f, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-zinc-300">
                  <ChevronRight className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="font-medium">{f.focus}</span>
                    {f.suggested_drill && (
                      <span className="text-zinc-500"> · try {f.suggested_drill}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          {lastDebriefInsights.recurring.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-xs text-zinc-600">Recurring:</span>
              {lastDebriefInsights.recurring.map((skill) => (
                <span
                  key={skill}
                  className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Repeat Last Practice */}
      {queue.length === 0 && !planLoading && lastPracticeQueue && lastPracticeQueue.length > 0 && (
        <button
          onClick={() => {
            setQueue(lastPracticeQueue.map((item) => ({ ...item, id: `${item.id}-r${Date.now()}` })));
          }}
          className="flex items-center gap-2 w-full rounded-xl border border-dashed border-amber-700/50 bg-amber-500/5 px-4 py-3 text-sm font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
        >
          <Repeat2 className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Repeat Last Practice</span>
          <span className="text-xs text-amber-600 font-normal">
            {lastPracticeQueue.length} drill{lastPracticeQueue.length !== 1 ? 's' : ''} · {fmt(totalDuration(lastPracticeQueue))}
          </span>
        </button>
      )}

      {/* My Saved Templates */}
      {queue.length === 0 && !planLoading && savedQueues.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowSavedQueues((v) => !v)}
            className="flex items-center gap-2 w-full rounded-xl border border-dashed border-orange-700/50 bg-orange-500/5 px-4 py-3 text-sm font-medium text-orange-400 hover:bg-orange-500/10 transition-colors"
            aria-expanded={showSavedQueues}
          >
            <Save className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">My Saved Templates</span>
            <span className="text-xs text-orange-600 font-normal">
              {showSavedQueues ? 'Close' : `${savedQueues.length} saved`}
            </span>
          </button>

          {showSavedQueues && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
              <div className="divide-y divide-zinc-800">
                {savedQueues.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 px-4 py-4 group"
                  >
                    <button
                      onClick={() => handleLoadSavedQueue(entry)}
                      className="flex-1 flex items-start gap-3 text-left hover:opacity-80 transition-opacity"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 group-hover:bg-orange-500/25 transition-colors mt-0.5">
                        <Save className="h-4 w-4 text-orange-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium text-zinc-100">
                            {entry.name}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {entry.items.length} drill{entry.items.length !== 1 ? 's' : ''} · {formatQueueDuration(entry.items)}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {getQueuePreview(entry).join(' → ')}
                          {entry.items.length > 3 ? ` +${entry.items.length - 3} more` : ''}
                        </p>
                        <p className="text-[10px] text-zinc-600 mt-1">
                          Saved {formatSavedAt(entry.savedAt)}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeleteSavedQueue(entry.id)}
                      aria-label={`Delete ${entry.name} template`}
                      className="shrink-0 text-zinc-700 hover:text-red-400 transition-colors mt-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Template Picker */}
      {queue.length === 0 && !planLoading && (
        <div className="space-y-3">
          <button
            onClick={() => setShowTemplatePicker((v) => !v)}
            className="flex items-center gap-2 w-full rounded-xl border border-dashed border-emerald-700/50 bg-emerald-500/5 px-4 py-3 text-sm font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            aria-expanded={showTemplatePicker}
          >
            <Layers className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Use a Practice Template</span>
            <span className="text-xs text-emerald-600 font-normal">
              {showTemplatePicker ? 'Close' : 'Pick one to start instantly'}
            </span>
          </button>

          {showTemplatePicker && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-xs text-zinc-500">
                  Pre-built drill queues — load one and hit Start. You can still edit drills after loading.
                </p>
              </div>
              <div className="divide-y divide-zinc-800">
                {availableTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => loadTemplate(tpl)}
                    className="flex items-start gap-3 w-full px-4 py-4 text-left hover:bg-zinc-800/60 transition-colors group"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 group-hover:bg-emerald-500/25 transition-colors mt-0.5">
                      <Layers className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-medium text-zinc-100">
                          {tpl.name}
                        </span>
                        <span className="text-xs text-zinc-500">{tpl.ageLabel}</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed line-clamp-2">
                        {tpl.description}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-emerald-500 font-medium">
                          {buildTemplateSummary(tpl)}
                        </span>
                        <div className="flex gap-1">
                          {tpl.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
            Drill Queue
          </h2>
          {queue.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                Total: {fmt(totalDuration(queue))}
              </span>
              <button
                onClick={() => { setShowSaveForm((v) => !v); setSaveFormName(''); }}
                aria-label="Save queue as template"
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-orange-400 transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </button>
            </div>
          )}
        </div>

        {showSaveForm && queue.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/5 px-3 py-2">
            <input
              type="text"
              placeholder="Template name…"
              value={saveFormName}
              onChange={(e) => setSaveFormName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveQueue(); if (e.key === 'Escape') setShowSaveForm(false); }}
              maxLength={60}
              autoFocus
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
            />
            <button
              onClick={handleSaveQueue}
              disabled={!isValidQueueName(saveFormName)}
              className="text-xs font-medium text-orange-400 hover:text-orange-300 disabled:opacity-40 disabled:cursor-default transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setShowSaveForm(false)}
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {queue.length === 0 ? (
          <div className="space-y-3">
            {suggestedDrills.length > 0 && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Suggested for today · based on your team&apos;s skill gaps
                </p>
                <div className="flex flex-col gap-2">
                  {suggestedDrills.map((drill) => (
                    <button
                      key={drill.id}
                      onClick={() => addFromLibrary(drill)}
                      className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-left hover:border-orange-500/30 hover:bg-zinc-800/60 transition-colors group touch-manipulation active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 group-hover:bg-orange-500/20 transition-colors">
                          <Target className="h-4 w-4 text-orange-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-200 truncate">{drill.name}</p>
                          <p className="text-xs text-zinc-500">
                            {drill.category} · {drill.duration_minutes ?? 10} min
                          </p>
                        </div>
                      </div>
                      <Plus className="h-4 w-4 text-zinc-600 group-hover:text-orange-400 shrink-0 transition-colors" />
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-xl py-8 gap-2 text-center">
              <Dumbbell className="h-8 w-8 text-zinc-700" />
              <p className="text-sm text-zinc-500">
                {suggestedDrills.length > 0
                  ? 'Or pick any drill from the library below'
                  : 'Add drills to get started'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {queue.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3"
              >
                {/* Reorder buttons */}
                <div className="flex flex-col shrink-0">
                  <button
                    onClick={() => moveQueueItem(item.id, 'up')}
                    disabled={idx === 0}
                    aria-label={`Move ${item.name} up`}
                    className="text-zinc-600 hover:text-zinc-300 disabled:opacity-20 disabled:cursor-default transition-colors"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => moveQueueItem(item.id, 'down')}
                    disabled={idx === queue.length - 1}
                    aria-label={`Move ${item.name} down`}
                    className="text-zinc-600 hover:text-zinc-300 disabled:opacity-20 disabled:cursor-default transition-colors"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="text-xs text-zinc-600 w-4 shrink-0">{idx + 1}</span>
                <Dumbbell className="h-4 w-4 text-orange-500 shrink-0" />
                <span className="flex-1 text-sm text-zinc-200 truncate">{item.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Clock className="h-3.5 w-3.5 text-zinc-600" />
                  <input
                    type="number"
                    min="1"
                    max="60"
                    aria-label={`Duration for ${item.name} in minutes`}
                    value={Math.round(item.durationSecs / 60)}
                    onChange={(e) => updateDuration(item.id, e.target.value)}
                    className="w-10 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300 text-center"
                  />
                  <span className="text-xs text-zinc-600">min</span>
                </div>
                <button
                  onClick={() => removeFromQueue(item.id)}
                  aria-label={`Remove ${item.name} from queue`}
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
            <div className="p-3 border-b border-zinc-800 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Search drills…"
                  value={drillSearch}
                  onChange={(e) => { setDrillSearch(e.target.value); setShowFavoritesOnly(false); }}
                  className="pl-9 h-9 text-sm bg-zinc-800 border-zinc-700"
                  autoFocus
                />
              </div>
              {favoriteIds.length > 0 && (
                <button
                  onClick={() => { setShowFavoritesOnly((v) => !v); setDrillSearch(''); }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors touch-manipulation ${
                    showFavoritesOnly
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-amber-500/40 hover:text-amber-400'
                  }`}
                >
                  <Star className={`h-3 w-3 ${showFavoritesOnly ? 'fill-amber-400 text-amber-400' : 'text-zinc-500'}`} />
                  Favorites ({favoriteIds.length})
                </button>
              )}
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-zinc-800">
              {filteredDrills.length === 0 ? (
                <p className="text-sm text-zinc-500 p-4 text-center">
                  {showFavoritesOnly ? 'No favorites yet — star drills in the Drill Library' : 'No drills found'}
                </p>
              ) : (
                filteredDrills.slice(0, 30).map((drill) => {
                  const starred = isFavorited(drill.id, favoriteIds);
                  const rating = activeTeam?.id ? getDrillRating(activeTeam.id, drill.id) : null;
                  const runRecord = activeTeam?.id ? getDrillRunRecord(activeTeam.id, drill.id) : null;
                  return (
                    <button
                      key={drill.id}
                      onClick={() => addFromLibrary(drill)}
                      className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-zinc-800 transition-colors group"
                    >
                      {starred ? (
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400 shrink-0" />
                      ) : rating === 'up' ? (
                        <span className="shrink-0 text-base leading-none" aria-label="Works for your team">👍</span>
                      ) : rating === 'down' ? (
                        <span className="shrink-0 text-base leading-none opacity-40" aria-label="Needs adjustment">👎</span>
                      ) : (
                        <Dumbbell className="h-4 w-4 text-zinc-600 group-hover:text-orange-500 transition-colors shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${rating === 'down' ? 'text-zinc-500' : 'text-zinc-200'}`}>{drill.name}</p>
                        <p className="text-xs text-zinc-500">
                          {drill.category}
                          {runRecord && (
                            <span className="ml-1.5 text-zinc-600">
                              · {formatLastRun(runRecord.lastUsedAt)} · {buildRunCountLabel(runRecord.count)}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-zinc-600 shrink-0">
                        {drill.duration_minutes ?? 10} min
                      </span>
                    </button>
                  );
                })
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
