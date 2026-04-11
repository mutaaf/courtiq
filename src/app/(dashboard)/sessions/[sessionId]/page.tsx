'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  MapPin,
  Mic,
  Clock,
  Save,
  Loader2,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
  ImagePlus,
  X,
  Sparkles,
  Star,
  Target,
  Lightbulb,
  Dumbbell,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ClipboardList,
  BarChart2,
  Play,
  Shuffle,
  Repeat2,
} from 'lucide-react';
import Link from 'next/link';
import type { Session, Observation, Player, Media, SessionType, Sentiment } from '@/types/database';
import type { SessionDebriefResult } from '@/app/api/ai/session-debrief/route';

const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  practice: 'Practice',
  game: 'Game',
  scrimmage: 'Scrimmage',
  tournament: 'Tournament',
  training: 'Training',
};

const SENTIMENT_CONFIG: Record<Sentiment, { icon: typeof CheckCircle2; color: string }> = {
  positive: { icon: CheckCircle2, color: 'text-emerald-400' },
  'needs-work': { icon: AlertCircle, color: 'text-amber-400' },
  neutral: { icon: MinusCircle, color: 'text-zinc-400' },
};

const TONE_CONFIG: Record<
  SessionDebriefResult['overall_tone'],
  { label: string; color: string; bg: string; border: string }
> = {
  great: {
    label: 'Great Session',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
  good: {
    label: 'Good Session',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
  developing: {
    label: 'Developing',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
  struggling: {
    label: 'Needs Focus',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
  },
};

function AIDebriefCard({
  sessionId,
  teamId,
  observationCount,
  savedDebrief,
  onDebriefSaved,
}: {
  sessionId: string;
  teamId: string;
  observationCount: number;
  savedDebrief: SessionDebriefResult | null;
  onDebriefSaved: () => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localDebrief, setLocalDebrief] = useState<SessionDebriefResult | null>(savedDebrief);

  // Practice plan creation state
  const [isPlanGenerating, setIsPlanGenerating] = useState(false);
  const [planCreated, setPlanCreated] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const debrief = localDebrief || savedDebrief;

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    // Reset plan state when regenerating
    setPlanCreated(false);
    setPlanError(null);
    try {
      const res = await fetch('/api/ai/session-debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, teamId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate analysis');
      }
      const data = await res.json();
      setLocalDebrief(data.debrief);
      onDebriefSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCreatePlan() {
    if (!debrief || debrief.next_practice_focus.length === 0) return;
    setIsPlanGenerating(true);
    setPlanError(null);

    const focusSkills = debrief.next_practice_focus.map((f) => f.focus);
    try {
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, type: 'practice', focusSkills }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create practice plan');
      }
      setPlanCreated(true);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsPlanGenerating(false);
    }
  }

  const toneConfig = debrief ? TONE_CONFIG[debrief.overall_tone] : null;

  return (
    <Card className={debrief ? `border-orange-500/20` : 'border-zinc-800'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-400" />
            AI Post-Session Analysis
          </CardTitle>
          {debrief && (
            <button
              onClick={handleGenerate}
              disabled={isGenerating || observationCount === 0}
              className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-40"
            >
              {isGenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Regenerate
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!debrief && !isGenerating && (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
              <Sparkles className="h-7 w-7 text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">Analyze this session with AI</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                Get player highlights, areas to improve, and next-practice suggestions based on your{' '}
                {observationCount} observation{observationCount !== 1 ? 's' : ''}.
              </p>
            </div>
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 max-w-sm">
                {error}
              </p>
            )}
            <Button
              onClick={handleGenerate}
              disabled={observationCount === 0}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Sparkles className="h-4 w-4" />
              Generate Analysis
            </Button>
            {observationCount === 0 && (
              <p className="text-xs text-zinc-600">Add observations to this session first</p>
            )}
          </div>
        )}

        {isGenerating && !debrief && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
            <p className="text-sm text-zinc-400">Analyzing session data...</p>
          </div>
        )}

        {debrief && (
          <div className="space-y-5">
            {/* Tone badge + summary */}
            {toneConfig && (
              <div
                className={`flex items-start gap-3 rounded-xl border p-3 ${toneConfig.bg} ${toneConfig.border}`}
              >
                <TrendingUp className={`h-5 w-5 mt-0.5 shrink-0 ${toneConfig.color}`} />
                <div>
                  <p className={`text-sm font-semibold ${toneConfig.color}`}>{toneConfig.label}</p>
                  <p className="text-sm text-zinc-300 mt-1 leading-relaxed">{debrief.session_summary}</p>
                </div>
              </div>
            )}

            {/* Trend note vs prior sessions */}
            {debrief.trend_note && (
              <div className="flex items-start gap-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20 px-3 py-2.5">
                <TrendingDown className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-400/70 mb-0.5">
                    Trend vs Recent Sessions
                  </p>
                  <p className="text-xs text-zinc-300 leading-relaxed">{debrief.trend_note}</p>
                </div>
              </div>
            )}

            {/* Player Highlights */}
            {debrief.player_highlights.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5" />
                  Player Highlights
                </h4>
                <div className="space-y-2">
                  {debrief.player_highlights.map((h, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-semibold text-emerald-400">{h.player_name}</span>
                        <p className="text-xs text-zinc-300 mt-0.5">{h.highlight}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Areas to Improve */}
            {debrief.areas_to_improve.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5" />
                  Areas to Improve
                </h4>
                <div className="space-y-2">
                  {debrief.areas_to_improve.map((area, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2.5 rounded-lg p-3 ${
                        area.is_recurring
                          ? 'bg-red-500/5 border border-red-500/20'
                          : 'bg-amber-500/5 border border-amber-500/15'
                      }`}
                    >
                      <AlertCircle className={`h-4 w-4 shrink-0 mt-0.5 ${area.is_recurring ? 'text-red-400' : 'text-amber-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold capitalize ${area.is_recurring ? 'text-red-400' : 'text-amber-400'}`}>
                            {area.skill_area}
                          </span>
                          {area.is_recurring && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/25 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                              <Repeat2 className="h-2.5 w-2.5" />
                              Recurring
                            </span>
                          )}
                          {area.player_count > 0 && (
                            <span className="text-[10px] text-zinc-600">
                              {area.player_count} player{area.player_count !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-300 mt-0.5">{area.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Practice Focus */}
            {debrief.next_practice_focus.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                  <Dumbbell className="h-3.5 w-3.5" />
                  Next Practice Focus
                </h4>
                <div className="space-y-2">
                  {debrief.next_practice_focus.map((item, i) => (
                    <div
                      key={i}
                      className="rounded-lg bg-blue-500/5 border border-blue-500/15 p-3 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-400 shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-xs font-semibold text-blue-300">{item.focus}</span>
                      </div>
                      <p className="text-xs text-zinc-400 pl-7">{item.rationale}</p>
                      <div className="flex items-center gap-1.5 pl-7">
                        <Dumbbell className="h-3 w-3 text-zinc-600 shrink-0" />
                        <p className="text-[11px] text-zinc-500 italic">{item.suggested_drill}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recurring focus areas summary */}
            {debrief.recurring_focus_areas && debrief.recurring_focus_areas.length > 0 && (
              <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Repeat2 className="h-3.5 w-3.5 text-red-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                    Persistent Focus Areas
                  </p>
                </div>
                <p className="text-xs text-zinc-400">
                  These areas have appeared across multiple recent sessions — consider dedicating extra drill time:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {debrief.recurring_focus_areas.map((area, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-medium text-red-400 capitalize"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Coaching Tip */}
            {debrief.coaching_tip && (
              <div className="flex items-start gap-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 p-3">
                <Lightbulb className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-yellow-400/70 mb-1">
                    Coach Tip
                  </p>
                  <p className="text-xs text-zinc-300 leading-relaxed">{debrief.coaching_tip}</p>
                </div>
              </div>
            )}

            {/* ── Create Practice Plan CTA ─────────────────────────────────── */}
            {debrief.next_practice_focus.length > 0 && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <ClipboardList className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-300">Ready for next practice?</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Build a full AI practice plan targeting the{' '}
                      {debrief.next_practice_focus.length} focus area
                      {debrief.next_practice_focus.length !== 1 ? 's' : ''} above.
                    </p>
                  </div>
                </div>

                {/* Focus skill chips */}
                <div className="flex flex-wrap gap-1.5">
                  {debrief.next_practice_focus.map((item, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-400"
                    >
                      {item.focus}
                    </span>
                  ))}
                </div>

                {planCreated ? (
                  <div className="flex items-center gap-2.5">
                    <div className="flex flex-1 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-400">
                        Practice plan created!
                      </span>
                    </div>
                    <Link href="/plans" className="shrink-0">
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white min-h-[44px] px-4">
                        View Plan
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    {planError && (
                      <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                        {planError}
                      </p>
                    )}
                    <Button
                      onClick={handleCreatePlan}
                      disabled={isPlanGenerating}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white min-h-[44px]"
                      size="sm"
                    >
                      {isPlanGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Creating practice plan…
                        </>
                      ) : (
                        <>
                          <ClipboardList className="h-4 w-4" />
                          Create Practice Plan from Debrief
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();

  const [debrief, setDebrief] = useState('');
  const [debriefInitialized, setDebriefInitialized] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const data = await query<Session>({
        table: 'sessions',
        select: '*',
        filters: { id: sessionId },
        single: true,
      });
      if (!debriefInitialized && data) {
        setDebrief(data.coach_debrief_text || '');
        setDebriefInitialized(true);
      }
      return data;
    },
    ...CACHE_PROFILES.sessions,
  });

  const { data: observations, isLoading: obsLoading } = useQuery({
    queryKey: queryKeys.observations.session(sessionId),
    queryFn: async () => {
      const data = await query<any[]>({
        table: 'observations',
        select: '*, players:player_id(name)',
        filters: { session_id: sessionId },
        order: { column: 'created_at', ascending: false },
      });
      return data || [];
    },
    ...CACHE_PROFILES.observations,
  });

  const { data: sessionMedia = [] } = useQuery({
    queryKey: ['session-media', sessionId],
    queryFn: async () => {
      const data = await query<Media[]>({
        table: 'media',
        select: '*',
        filters: { session_id: sessionId },
        order: { column: 'created_at', ascending: false },
      });
      return data || [];
    },
    enabled: !!sessionId,
  });

  const { data: rosterPlayers = [] } = useQuery({
    queryKey: queryKeys.players.all(activeTeam?.id ?? ''),
    queryFn: async () => {
      const data = await query<Player[]>({
        table: 'players',
        select: 'id, name, jersey_number',
        filters: { team_id: activeTeam!.id, is_active: true },
        order: { column: 'name', ascending: true },
      });
      return data || [];
    },
    enabled: !!activeTeam,
  });

  const handleMediaUpload = async (files: FileList) => {
    if (!activeTeam || !session) return;
    setMediaUploading(true);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionId', sessionId);
        formData.append('teamId', activeTeam.id);
        if (selectedPlayerIds.length > 0) {
          formData.append('playerIds', selectedPlayerIds.join(','));
        }

        await fetch('/api/media/upload', {
          method: 'POST',
          body: formData,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['session-media', sessionId] });
      setSelectedPlayerIds([]);
    } catch (err) {
      console.error('Media upload failed:', err);
    } finally {
      setMediaUploading(false);
    }
  };

  const togglePlayerTag = (playerId: string) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]
    );
  };

  const debriefMutation = useMutation({
    mutationFn: async (text: string) => {
      await mutate({
        table: 'sessions',
        operation: 'update',
        data: { coach_debrief_text: text },
        filters: { id: sessionId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatTime(time: string | null) {
    if (!time) return null;
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${ampm}`;
  }

  const isLoading = sessionLoading || obsLoading;

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-zinc-400">Session not found</p>
        <Link href="/sessions" className="mt-4">
          <Button variant="outline">Back to Sessions</Button>
        </Link>
      </div>
    );
  }

  const savedDebrief = session.coach_debrief_extracts as SessionDebriefResult | null;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/sessions">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">
              {SESSION_TYPE_LABELS[session.type]}
            </h1>
            {session.opponent && (
              <span className="text-lg text-zinc-400">vs {session.opponent}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(session.type === 'game' || session.type === 'scrimmage' || session.type === 'tournament') && (
            <>
              <Link href={`/sessions/${sessionId}/subs`}>
                <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 hover:bg-zinc-800">
                  <Shuffle className="h-4 w-4" />
                  <span className="hidden sm:inline">Subs</span>
                </Button>
              </Link>
              <Link href={`/sessions/${sessionId}/game-tracker`}>
                <Button variant="outline" size="sm" className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10">
                  <BarChart2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Game Stats</span>
                </Button>
              </Link>
            </>
          )}
          {(session.type === 'practice' || session.type === 'training' || session.type === 'scrimmage') && (
            <Link href={`/sessions/${sessionId}/timer`}>
              <Button variant="outline" size="sm" className="hidden sm:flex">
                <Dumbbell className="h-4 w-4" />
                Timer
              </Button>
            </Link>
          )}
          <Link href={`/sessions/${sessionId}/replay`}>
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 hover:bg-zinc-800">
              <Play className="h-4 w-4" />
              <span className="hidden sm:inline">Replay</span>
            </Button>
          </Link>
          <Link href={`/capture?sessionId=${sessionId}`}>
            <Button>
              <Mic className="h-4 w-4" />
              Capture
            </Button>
          </Link>
        </div>
      </div>

      {/* Session info card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatDate(session.date)}
            </span>
            {session.start_time && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {formatTime(session.start_time)}
                {session.end_time && ` - ${formatTime(session.end_time)}`}
              </span>
            )}
            {session.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {session.location}
              </span>
            )}
          </div>
          {session.curriculum_week && (
            <Badge variant="secondary">Curriculum Week {session.curriculum_week}</Badge>
          )}
          {session.result && (
            <p className="text-sm text-zinc-300">Result: {session.result}</p>
          )}
        </CardContent>
      </Card>

      {/* Observations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-orange-500" />
            Observations
            <Badge variant="secondary">{observations?.length || 0}</Badge>
          </h2>
        </div>

        {observations?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <MessageSquare className="h-10 w-10 text-zinc-600 mb-3" />
              <p className="text-sm text-zinc-400">No observations yet</p>
              <Link href={`/capture?sessionId=${sessionId}`} className="mt-3">
                <Button variant="outline" size="sm">
                  <Mic className="h-4 w-4" />
                  Start capturing
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {observations?.map((obs: any) => {
              const sentimentConfig = SENTIMENT_CONFIG[obs.sentiment as Sentiment];
              const SentimentIcon = sentimentConfig?.icon || MinusCircle;

              return (
                <Card key={obs.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <SentimentIcon
                        className={`h-5 w-5 mt-0.5 shrink-0 ${sentimentConfig?.color || 'text-zinc-400'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {obs.players?.name && (
                            <span className="text-sm font-medium text-orange-400">
                              {obs.players.name}
                            </span>
                          )}
                          <Badge variant="secondary" className="text-[10px]">
                            {obs.category}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {obs.source}
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-300">{obs.text}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Post-Session Analysis */}
      {activeTeam && (
        <AIDebriefCard
          sessionId={sessionId}
          teamId={activeTeam.id}
          observationCount={observations?.length || 0}
          savedDebrief={savedDebrief}
          onDebriefSaved={() =>
            queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
          }
        />
      )}

      {/* Media Upload Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ImagePlus className="h-5 w-5 text-orange-500" />
              Photos & Videos
              {sessionMedia.length > 0 && (
                <Badge variant="secondary">{sessionMedia.length}</Badge>
              )}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => mediaInputRef.current?.click()}
              disabled={mediaUploading}
            >
              {mediaUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <ImagePlus className="h-4 w-4" />
                  Add Photos/Videos
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleMediaUpload(e.target.files);
              }
              e.target.value = '';
            }}
          />

          {/* Player tag selector */}
          {rosterPlayers.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2">Tag players (optional):</p>
              <div className="flex flex-wrap gap-1.5">
                {rosterPlayers.map((player: Player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => togglePlayerTag(player.id)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      selectedPlayerIds.includes(player.id)
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
                    }`}
                  >
                    {player.jersey_number ? `#${player.jersey_number} ` : ''}
                    {player.name}
                    {selectedPlayerIds.includes(player.id) && (
                      <X className="inline h-3 w-3 ml-1" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Media Grid */}
          {sessionMedia.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {sessionMedia.map((media: Media) => (
                <div
                  key={media.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900"
                >
                  {media.type === 'video' ? (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-900">
                      <div className="text-center">
                        <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800">
                          <svg className="h-4 w-4 text-zinc-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                        <p className="text-[10px] text-zinc-500">Video</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-900">
                      <ImagePlus className="h-6 w-6 text-zinc-700" />
                    </div>
                  )}
                  {media.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                      <p className="text-[10px] text-zinc-300 line-clamp-2">{media.caption}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <ImagePlus className="h-8 w-8 text-zinc-700 mb-2" />
              <p className="text-sm text-zinc-500">No media uploaded yet</p>
              <p className="text-xs text-zinc-600 mt-1">Tap the button above to add photos or videos</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coach Debrief */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coach Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Post-session notes: what went well, what to work on, player highlights..."
            value={debrief}
            onChange={(e) => setDebrief(e.target.value)}
            rows={5}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              {debriefMutation.isSuccess && 'Saved'}
              {debriefMutation.isError && 'Failed to save'}
            </p>
            <Button
              size="sm"
              onClick={() => debriefMutation.mutate(debrief)}
              disabled={debriefMutation.isPending}
            >
              {debriefMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Notes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
