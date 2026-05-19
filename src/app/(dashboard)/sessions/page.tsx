'use client';

import { useState, useEffect, useRef } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, MapPin, Eye, Plus, Filter, Mic, ArrowRight, Loader2, Star, Sparkles, Trophy, Share2, X, History, Dumbbell, Zap } from 'lucide-react';
import Link from 'next/link';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { RecurringSessionsPanel } from '@/components/sessions/recurring-sessions-panel';
import { AnnouncementsPanel } from '@/components/sessions/announcements-panel';
import type { Session, SessionType } from '@/types/database';
import {
  parseResult,
  getResultBadgeClasses,
  getResultLabel,
  buildResultString,
  isGameType,
  type ResultValue,
} from '@/lib/season-record-utils';

const SESSION_TYPE_CONFIG: Record<SessionType, { label: string; color: string; icon: any }> = {
  practice: { label: 'Practice', color: 'bg-blue-500/20 text-blue-400', icon: Dumbbell },
  game: { label: 'Game', color: 'bg-emerald-500/20 text-emerald-400', icon: Trophy },
  scrimmage: { label: 'Scrimmage', color: 'bg-purple-500/20 text-purple-400', icon: Zap },
  tournament: { label: 'Tournament', color: 'bg-amber-500/20 text-amber-400', icon: Star },
  training: { label: 'Training', color: 'bg-orange-500/20 text-orange-400', icon: Sparkles },
};

const FILTER_OPTIONS: { value: SessionType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'practice', label: 'Practice' },
  { value: 'game', label: 'Game' },
  { value: 'scrimmage', label: 'Scrimmage' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'training', label: 'Training' },
];

const RESULT_BUTTONS: { outcome: ResultValue; label: string; classes: string }[] = [
  {
    outcome: 'win',
    label: 'W',
    classes: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 active:scale-95',
  },
  {
    outcome: 'loss',
    label: 'L',
    classes: 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/30 active:scale-95',
  },
  {
    outcome: 'tie',
    label: 'T',
    classes: 'bg-zinc-600/30 text-zinc-400 border border-zinc-600/50 hover:bg-zinc-600/50 active:scale-95',
  },
];

type WinCelebration = {
  teamName: string;
  opponent: string | null;
  sessionType: string;
  coachName: string | null;
};

function buildWinMessage(c: WinCelebration): string {
  const vs = c.opponent ? ` against ${c.opponent}` : '';
  const coach = c.coachName ? `\n— Coach ${c.coachName.split(' ')[0]}` : '';
  const emoji = c.sessionType === 'tournament' ? '🏅' : '🏆';
  return `${emoji} ${c.teamName} won${vs} today! Great team effort — every player stepped up.${coach}`;
}

export default function SessionsPage() {
  const { activeTeam, coach } = useActiveTeam();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<SessionType | 'all'>('all');
  // Optimistic result overrides keyed by session ID
  const [localResults, setLocalResults] = useState<Record<string, string>>({});
  // Tracks which session + outcome is currently being saved
  const [savingResult, setSavingResult] = useState<{ sessionId: string; outcome: ResultValue } | null>(null);
  // Win celebration bottom sheet
  const [celebration, setCelebration] = useState<WinCelebration | null>(null);
  const [shareState, setShareState] = useState<'idle' | 'shared'>('idle');
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss celebration after 6 seconds
  useEffect(() => {
    if (celebration) {
      dismissTimer.current = setTimeout(() => setCelebration(null), 6000);
    }
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [celebration]);

  function dismissCelebration() {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setCelebration(null);
    setShareState('idle');
  }

  async function handleShareWin() {
    if (!celebration) return;
    const text = buildWinMessage(celebration);
    if (navigator.share) {
      try {
        await navigator.share({ text });
        setShareState('shared');
        setTimeout(dismissCelebration, 1500);
      } catch {
        // user cancelled share
      }
    } else {
      await navigator.clipboard.writeText(text);
      setShareState('shared');
      setTimeout(dismissCelebration, 1500);
    }
  }

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: [...queryKeys.sessions.all(activeTeam?.id || ''), typeFilter],
    queryFn: async () => {
      if (!activeTeam) return [];
      const filters: Record<string, unknown> = { team_id: activeTeam.id };
      if (typeFilter !== 'all') {
        filters.type = typeFilter;
      }
      const data = await query<any[]>({
        table: 'sessions',
        select: 'id, type, date, start_time, end_time, location, opponent, result, curriculum_week, quality_rating, coach_debrief_text, coach_debrief_extracts, observations:observations(count)',
        filters,
        order: { column: 'date', ascending: false },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.sessions,
  });

  async function handleQuickResult(
    e: React.MouseEvent,
    sessionId: string,
    outcome: ResultValue,
    sessionMeta: { opponent: string | null; type: string },
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (savingResult) return;

    const resultStr = buildResultString(outcome);
    setSavingResult({ sessionId, outcome });
    setLocalResults((prev) => ({ ...prev, [sessionId]: resultStr }));

    try {
      await mutate({
        table: 'sessions',
        operation: 'update',
        data: { result: resultStr },
        filters: { id: sessionId },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(activeTeam?.id || '') });

      if (outcome === 'win' && activeTeam) {
        setShareState('idle');
        setCelebration({
          teamName: activeTeam.name,
          opponent: sessionMeta.opponent,
          sessionType: sessionMeta.type,
          coachName: coach?.full_name ?? null,
        });
      }
    } catch {
      // Rollback optimistic update on failure
      setLocalResults((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
    } finally {
      setSavingResult(null);
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays > 0 && diffDays < 7) return `${diffDays} days ago`;
    if (diffDays >= 7 && diffDays < 14) return 'Last week';
    if (diffDays < 0 && diffDays > -7) return `In ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''}`;
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
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

  function formatSessionDuration(startTime: string | null, endTime: string | null): string | null {
    if (!startTime || !endTime) return null;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const totalMins = (eh * 60 + em) - (sh * 60 + sm);
    if (totalMins <= 0) return null;
    if (totalMins < 60) return `${totalMins} min`;
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
  }

  return (
    <PullToRefresh onRefresh={async () => { await refetch(); }}>
    <div className="p-4 lg:p-8 space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sessions</h1>
          <p className="text-zinc-400 text-sm">
            {sessions?.length || 0} session{sessions?.length !== 1 ? 's' : ''} recorded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/sessions/backfill" title="Catch up — add past sessions you coached before joining SportsIQ">
            <Button variant="outline" size="sm" className="hidden sm:inline-flex h-10 px-3 text-sm text-zinc-400 border-zinc-700 hover:text-zinc-200 hover:border-zinc-600">
              <History className="h-4 w-4" />
              Catch up
            </Button>
          </Link>
          <Link href="/sessions/new">
            <Button className="h-12 px-5 sm:h-10 sm:px-4 text-base sm:text-sm">
              <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
              New Session
            </Button>
          </Link>
        </div>
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        <Filter className="h-4 w-4 text-zinc-500 shrink-0" />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTypeFilter(opt.value)}
            aria-pressed={typeFilter === opt.value}
            className={`shrink-0 rounded-full px-4 py-2 sm:px-3 sm:py-1 text-sm sm:text-xs font-medium transition-colors touch-manipulation ${
              typeFilter === opt.value
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Sessions list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : sessions?.length === 0 ? (
        <Card className="border-dashed border-zinc-700">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-purple-500/10 mb-6">
              <Calendar className="h-10 w-10 text-purple-500/60" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-200">No sessions yet</h3>
            <p className="text-zinc-500 text-sm mt-2 max-w-sm text-center leading-relaxed">
              Sessions track your practices, games, and scrimmages. Create a session to start logging observations and measuring your team&apos;s progress over time.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Link href="/sessions/new" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto h-12 sm:h-10 text-base sm:text-sm">
                  <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
                  Create First Session
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/capture" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto h-12 sm:h-10 text-base sm:text-sm">
                  <Mic className="h-5 w-5 sm:h-4 sm:w-4" />
                  Quick Capture
                </Button>
              </Link>
            </div>
            <div className="mt-6 pt-6 border-t border-zinc-800 w-full text-center">
              <p className="text-xs text-zinc-600 mb-2">Coaching before you joined SportsIQ?</p>
              <Link href="/sessions/backfill">
                <button className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors touch-manipulation">
                  <History className="h-3.5 w-3.5" />
                  Import past sessions &rarr;
                </button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions?.map((session: any) => {
            const typeConfig = SESSION_TYPE_CONFIG[session.type as SessionType];
            const obsCount = session.observations?.[0]?.count || 0;
            // Use optimistic override if present, otherwise DB value
            const effectiveResult = localResults[session.id] ?? session.result;
            const parsedResult = parseResult(effectiveResult);
            const isGame = isGameType(session.type);
            const isSavingThis = savingResult?.sessionId === session.id;
            // Debrief pending: past session, ≥3 obs, no AI debrief yet
            const sessionDaysAgo = Math.round(
              (Date.now() - new Date(session.date + 'T00:00:00').getTime()) / 86_400_000
            );
            const debriefPending =
              sessionDaysAgo > 0 &&
              sessionDaysAgo <= 14 &&
              obsCount >= 3 &&
              !session.coach_debrief_extracts;

            // AI debrief summary for sessions that already have a debrief
            const debriefData = session.coach_debrief_extracts as {
              session_summary?: string;
              overall_tone?: 'great' | 'good' | 'developing' | 'struggling';
            } | null;
            const aiSummary = debriefData?.session_summary
              ? debriefData.session_summary.length > 72
                ? debriefData.session_summary.slice(0, 72) + '…'
                : debriefData.session_summary
              : null;
            const toneColor =
              debriefData?.overall_tone === 'great' || debriefData?.overall_tone === 'good'
                ? 'text-emerald-400'
                : debriefData?.overall_tone === 'developing'
                ? 'text-amber-400'
                : debriefData?.overall_tone === 'struggling'
                ? 'text-red-400'
                : 'text-zinc-400';

            return (
              <Link key={session.id} href={`/sessions/${session.id}`}>
                <Card className="transition-colors hover:border-zinc-700 cursor-pointer active:scale-[0.98] touch-manipulation">
                  <CardContent className="p-5 sm:p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeConfig.color}`}
                          >
                            <typeConfig.icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {typeConfig.label}
                          </span>
                          {parsedResult && (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${getResultBadgeClasses(parsedResult)}`}
                            >
                              {getResultLabel(parsedResult)}
                            </span>
                          )}
                          {session.opponent && (
                            <span className="text-sm text-zinc-300">
                              vs {session.opponent}
                            </span>
                          )}
                          {session.curriculum_week && (
                            <Badge variant="secondary">
                              Week {session.curriculum_week}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(session.date)}
                            {session.start_time && (
                              <span className="ml-1">
                                at {formatTime(session.start_time)}
                              </span>
                            )}
                            {formatSessionDuration(session.start_time, session.end_time) && (
                              <span className="ml-1 text-zinc-600">
                                · {formatSessionDuration(session.start_time, session.end_time)}
                              </span>
                            )}
                          </span>
                          {session.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {session.location}
                            </span>
                          )}
                        </div>

                        {/* Coach notes preview — one-line italic reminder of what the coach noted */}
                        {session.coach_debrief_text && (
                          <p className="text-xs text-zinc-500 italic truncate mt-0.5">
                            {session.coach_debrief_text.length > 70
                              ? session.coach_debrief_text.slice(0, 70) + '…'
                              : session.coach_debrief_text}
                          </p>
                        )}

                        {/* AI debrief summary — shown when AI debrief exists */}
                        {aiSummary && (
                          <p className={`flex items-center gap-1 text-xs truncate mt-0.5 ${toneColor}`}>
                            <Sparkles className="h-3 w-3 shrink-0" />
                            {aiSummary}
                          </p>
                        )}

                        {/* Inline quick-result entry: only for game types without a result */}
                        {isGame && !parsedResult && (
                          <div
                            className="flex items-center gap-2 pt-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-xs text-zinc-500 shrink-0">Log result:</span>
                            {RESULT_BUTTONS.map(({ outcome, label, classes }) => {
                              const isThisButton = isSavingThis && savingResult?.outcome === outcome;
                              return (
                                <button
                                  key={outcome}
                                  disabled={!!savingResult}
                                  onClick={(e) =>
                                    handleQuickResult(e, session.id, outcome, {
                                      opponent: session.opponent,
                                      type: session.type,
                                    })
                                  }
                                  aria-label={`Log ${outcome}`}
                                  className={`flex h-7 w-8 items-center justify-center rounded-md text-xs font-bold transition-all touch-manipulation disabled:opacity-50 ${classes}`}
                                >
                                  {isThisButton
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : label
                                  }
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Debrief pending — amber nudge for past sessions with enough obs but no AI debrief */}
                        {debriefPending && (
                          <Link
                            href={`/sessions/${session.id}?fromPractice=1&obsCount=${obsCount}&playerCount=0`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/15 transition-colors touch-manipulation active:scale-95 mt-1"
                            aria-label="AI debrief pending — tap to generate"
                          >
                            <Sparkles className="h-3 w-3" />
                            AI debrief pending
                          </Link>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
                        <div className="flex items-center gap-1 text-sm text-zinc-500">
                          <Eye className="h-3.5 w-3.5" />
                          {obsCount}
                        </div>
                        {session.quality_rating != null && session.quality_rating >= 1 && session.quality_rating <= 5 && (
                          <div className="flex items-center gap-0.5" title={`Session rated ${session.quality_rating}/5`}>
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-3 w-3 ${i < session.quality_rating ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      {/* Recurring Sessions */}
      <RecurringSessionsPanel />
      {/* Team Announcements */}
      <AnnouncementsPanel />
    </div>

    {/* Win Celebration Bottom Sheet */}
    {celebration && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={dismissCelebration}
          aria-hidden="true"
        />
        {/* Sheet */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Win celebration"
          className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-zinc-900 border-t border-zinc-800 p-6 pb-10 animate-in slide-in-from-bottom duration-300"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20">
                <Trophy className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {celebration.sessionType === 'tournament' ? 'Tournament win! 🏅' : 'Victory logged! 🏆'}
                </h2>
                <p className="text-sm text-zinc-400">
                  {celebration.opponent
                    ? `${celebration.teamName} beat ${celebration.opponent}`
                    : celebration.teamName}
                </p>
              </div>
            </div>
            <button
              onClick={dismissCelebration}
              aria-label="Dismiss"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors touch-manipulation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/50 p-4 mb-4">
            <p className="text-sm text-zinc-300 leading-relaxed">
              {buildWinMessage(celebration)}
            </p>
          </div>

          <Button
            onClick={handleShareWin}
            className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {shareState === 'shared' ? (
              <>✓ Sent!</>
            ) : (
              <>
                <Share2 className="h-5 w-5" />
                Share with Parents
              </>
            )}
          </Button>
          <p className="text-center text-xs text-zinc-600 mt-3">
            Opens your native share sheet · WhatsApp, SMS, or copy
          </p>
        </div>
      </>
    )}
    </PullToRefresh>
  );
}
