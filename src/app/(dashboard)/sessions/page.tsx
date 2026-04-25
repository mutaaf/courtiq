'use client';

import { useState } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, MapPin, Eye, Plus, Filter, Mic, ArrowRight, Loader2 } from 'lucide-react';
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

const SESSION_TYPE_CONFIG: Record<SessionType, { label: string; color: string }> = {
  practice: { label: 'Practice', color: 'bg-blue-500/20 text-blue-400' },
  game: { label: 'Game', color: 'bg-emerald-500/20 text-emerald-400' },
  scrimmage: { label: 'Scrimmage', color: 'bg-purple-500/20 text-purple-400' },
  tournament: { label: 'Tournament', color: 'bg-amber-500/20 text-amber-400' },
  training: { label: 'Training', color: 'bg-orange-500/20 text-orange-400' },
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

export default function SessionsPage() {
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<SessionType | 'all'>('all');
  // Optimistic result overrides keyed by session ID
  const [localResults, setLocalResults] = useState<Record<string, string>>({});
  // Tracks which session + outcome is currently being saved
  const [savingResult, setSavingResult] = useState<{ sessionId: string; outcome: ResultValue } | null>(null);

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
        select: '*, observations:observations(count)',
        filters,
        order: { column: 'date', ascending: false },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.sessions,
  });

  async function handleQuickResult(e: React.MouseEvent, sessionId: string, outcome: ResultValue) {
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
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
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
        <Link href="/sessions/new">
          <Button className="h-12 px-5 sm:h-10 sm:px-4 text-base sm:text-sm">
            <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
            New Session
          </Button>
        </Link>
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

            return (
              <Link key={session.id} href={`/sessions/${session.id}`}>
                <Card className="transition-colors hover:border-zinc-700 cursor-pointer active:scale-[0.98] touch-manipulation">
                  <CardContent className="p-5 sm:p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeConfig.color}`}
                          >
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
                          </span>
                          {session.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {session.location}
                            </span>
                          )}
                        </div>

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
                                  onClick={(e) => handleQuickResult(e, session.id, outcome)}
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
                      </div>
                      <div className="flex items-center gap-1 text-sm text-zinc-500 shrink-0 ml-3">
                        <Eye className="h-3.5 w-3.5" />
                        {obsCount}
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
    </PullToRefresh>
  );
}
