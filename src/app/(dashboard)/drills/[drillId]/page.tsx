'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Clock,
  Users,
  Dumbbell,
  ListChecks,
  Settings2,
  PackageOpen,
  Video,
  CheckCircle2,
  ChevronRight,
  BarChart2,
  CalendarClock,
  ThumbsUp,
  ThumbsDown,
  Play,
  Loader2,
  Timer,
} from 'lucide-react';
import Link from 'next/link';
import type { Drill, Observation, Player } from '@/types/database';
import {
  buildDrillUsageSummary,
  buildUsageSummaryLabel,
  formatLastUsed,
  getLastUsedColor,
  getSentimentClasses,
  getRecentObservations,
  resolvePlayerName,
  hasUsageData,
} from '@/lib/drill-usage-utils';

export default function DrillDetailPage({
  params,
}: {
  params: Promise<{ drillId: string }>;
}) {
  const { drillId } = use(params);
  const router = useRouter();
  const { activeTeam, coach } = useActiveTeam();
  const practiceActive = useAppStore((s) => s.practiceActive);
  const practiceSessionId = useAppStore((s) => s.practiceSessionId);
  const [startingPractice, setStartingPractice] = useState(false);

  const { data: drill, isLoading } = useQuery({
    queryKey: queryKeys.drills.detail(drillId),
    queryFn: async () => {
      const data = await query<Drill>({
        table: 'drills',
        select: '*',
        filters: { id: drillId },
        single: true,
      });
      return data;
    },
    ...CACHE_PROFILES.drills,
  });

  const { data: drillObs = [] } = useQuery({
    queryKey: queryKeys.drills.usage(drillId, activeTeam?.id ?? ''),
    queryFn: async () => {
      if (!activeTeam) return [] as Observation[];
      return query<Observation[]>({
        table: 'observations',
        select: 'id,player_id,sentiment,text,created_at,session_id',
        filters: { team_id: activeTeam.id, drill_id: drillId },
        order: { column: 'created_at', ascending: false },
        limit: 30,
      });
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  const { data: rosterPlayers = [] } = useQuery({
    queryKey: queryKeys.players.all(activeTeam?.id ?? ''),
    queryFn: async () => {
      if (!activeTeam) return [] as Player[];
      return query<Player[]>({
        table: 'players',
        select: 'id,name',
        filters: { team_id: activeTeam.id, is_active: true },
      });
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  async function handleStartPractice() {
    if (!activeTeam || !coach || startingPractice) return;
    setStartingPractice(true);
    try {
      if (practiceActive && practiceSessionId) {
        router.push(`/sessions/${practiceSessionId}/timer?drillId=${drillId}`);
        return;
      }
      const session = await mutate<{ id: string }>({
        table: 'sessions',
        operation: 'insert',
        data: {
          team_id: activeTeam.id,
          coach_id: coach.id,
          type: 'practice',
          date: new Date().toISOString().split('T')[0],
          notes: drill ? `Auto-created: ${drill.name}` : 'Auto-created practice session',
        },
        select: 'id',
      });
      const id = Array.isArray(session) ? (session as any)[0]?.id : (session as any)?.id;
      if (id) {
        router.push(`/sessions/${id}/timer?drillId=${drillId}`);
      } else {
        setStartingPractice(false);
      }
    } catch {
      setStartingPractice(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 space-y-4 pb-8 max-w-2xl mx-auto">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-9 w-2/3 rounded-lg" />
        <Skeleton className="h-5 w-32 rounded-full" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!drill) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[60vh] text-center">
        <Dumbbell className="h-12 w-12 text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold text-zinc-200">Drill not found</h2>
        <p className="text-zinc-500 text-sm mt-1">This drill may have been removed.</p>
        <Link href="/drills" className="mt-6">
          <Button variant="outline">Back to Drills</Button>
        </Link>
      </div>
    );
  }

  const playerCountText =
    drill.player_count_max
      ? `${drill.player_count_min}–${drill.player_count_max} players`
      : `${drill.player_count_min}+ players`;

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-5 pb-24">
      {/* Back nav */}
      <Link
        href="/drills"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Drills Library
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="capitalize text-xs">
            {drill.category}
          </Badge>
          {drill.source !== 'seeded' && (
            <Badge variant="outline" className="text-xs capitalize">
              {drill.source}
            </Badge>
          )}
        </div>
        <h1 className="text-2xl font-bold text-zinc-100 leading-tight">{drill.name}</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">{drill.description}</p>
      </div>

      {/* Start Practice CTA */}
      {activeTeam && coach && (
        <Button
          onClick={handleStartPractice}
          disabled={startingPractice}
          className="w-full gap-2 bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-80"
          size="lg"
        >
          {startingPractice ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Starting practice…
            </>
          ) : practiceActive ? (
            <>
              <Timer className="h-5 w-5" />
              Add to Current Practice
            </>
          ) : (
            <>
              <Play className="h-5 w-5" />
              Start Practice with This Drill
            </>
          )}
        </Button>
      )}

      {/* Key stats */}
      <div className="grid grid-cols-3 gap-3">
        {drill.duration_minutes && (
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <Clock className="h-5 w-5 text-orange-400" />
            <span className="text-lg font-bold text-zinc-100">{drill.duration_minutes}</span>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide">minutes</span>
          </div>
        )}
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <Users className="h-5 w-5 text-blue-400" />
          <span className="text-sm font-bold text-zinc-100 leading-tight">{playerCountText}</span>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">players</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <Dumbbell className="h-5 w-5 text-emerald-400" />
          <span className="text-sm font-bold text-zinc-100 leading-tight">
            {drill.age_groups.length > 0 ? drill.age_groups[0] : 'All ages'}
          </span>
          {drill.age_groups.length > 1 && (
            <span className="text-[10px] text-zinc-500">+{drill.age_groups.length - 1} more</span>
          )}
          {drill.age_groups.length <= 1 && (
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide">age group</span>
          )}
        </div>
      </div>

      {/* Age groups (full list) */}
      {drill.age_groups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {drill.age_groups.map((ag) => (
            <span
              key={ag}
              className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400"
            >
              {ag}
            </span>
          ))}
        </div>
      )}

      {/* Equipment */}
      {drill.equipment && drill.equipment.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <PackageOpen className="h-4 w-4 text-amber-400" />
              Equipment Needed
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              {drill.equipment.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-sm text-zinc-300"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  {item}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Setup Instructions */}
      {drill.setup_instructions && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-purple-400" />
              Setup
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
              {drill.setup_instructions}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Teaching Cues */}
      {drill.teaching_cues && drill.teaching_cues.length > 0 && (
        <Card className="border-orange-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-orange-400" />
              Coaching Cues
              <Badge variant="secondary" className="text-[10px] ml-auto">
                Say these during the drill
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {drill.teaching_cues.map((cue, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-xs font-bold text-orange-400">
                  {idx + 1}
                </span>
                <p className="text-sm text-zinc-200 leading-relaxed pt-0.5">{cue}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Video */}
      {drill.video_url && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Video className="h-4 w-4 text-blue-400" />
              Demo Video
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <a
              href={drill.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-blue-400 hover:border-blue-500/40 hover:text-blue-300 transition-colors w-full"
            >
              <Video className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">Watch demo video</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </a>
          </CardContent>
        </Card>
      )}

      {/* ── Drill History ─────────────────────────────────────────────────────── */}
      {(() => {
        const usage = buildDrillUsageSummary(drillObs);
        const recent = getRecentObservations(drillObs, 5);
        const lastUsedColor = getLastUsedColor(usage.lastUsedAt);

        return (
          <Card className="border-zinc-800/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-indigo-400" />
                Your Team&apos;s Experience
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              {!hasUsageData(drillObs) ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <Dumbbell className="h-8 w-8 text-zinc-700" />
                  <p className="text-sm text-zinc-400">
                    Run this drill in your practice timer to track your team&apos;s feedback.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1"
                    onClick={handleStartPractice}
                    disabled={startingPractice}
                  >
                    {startingPractice ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        Starting…
                      </>
                    ) : practiceActive ? (
                      <>
                        <Timer className="h-3.5 w-3.5 mr-1.5" />
                        Add to Current Practice
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 mr-1.5" />
                        Start Practice with This Drill
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  {/* Stats strip */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-center">
                      <CalendarClock className="h-4 w-4 text-indigo-400" />
                      <span className={`text-xs font-semibold ${lastUsedColor}`}>
                        {formatLastUsed(usage.lastUsedAt)}
                      </span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Last used</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-center">
                      <ThumbsUp className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-bold text-emerald-400">{usage.positiveCount}</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Positive</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-center">
                      <ThumbsDown className="h-4 w-4 text-red-400" />
                      <span className="text-sm font-bold text-red-400">{usage.needsWorkCount}</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Needs Work</span>
                    </div>
                  </div>

                  {usage.sessionCount > 0 && (
                    <p className="text-xs text-zinc-500 text-center">
                      {buildUsageSummaryLabel(usage.sessionCount)}
                    </p>
                  )}

                  {/* Recent observations */}
                  {recent.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Recent Observations</p>
                      {recent.map((obs) => {
                        const playerName = resolvePlayerName(obs.player_id, rosterPlayers);
                        const ago = formatLastUsed(obs.created_at);
                        return (
                          <div
                            key={obs.id}
                            className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5 space-y-1.5"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${getSentimentClasses(obs.sentiment)}`}
                              >
                                {obs.sentiment === 'positive' ? '👍 Positive' : obs.sentiment === 'needs-work' ? '👎 Needs Work' : '— Neutral'}
                              </span>
                              {playerName && (
                                <span className="text-xs font-medium text-zinc-300">{playerName}</span>
                              )}
                              <span className="ml-auto text-[10px] text-zinc-600">{ago}</span>
                            </div>
                            <p className="text-sm text-zinc-300 leading-snug">{obs.text}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* CTA — generate a practice plan using this drill */}
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 lg:static lg:bottom-auto lg:pt-2 p-4 lg:p-0 bg-zinc-950/95 lg:bg-transparent backdrop-blur-sm lg:backdrop-blur-none border-t border-zinc-800 lg:border-0">
        <Link href={`/plans?drill=${encodeURIComponent(drill.name)}`} className="block">
          <Button className="w-full h-12 lg:h-10 text-base lg:text-sm gap-2">
            <Dumbbell className="h-5 w-5 lg:h-4 lg:w-4" />
            Use in a Practice Plan
          </Button>
        </Link>
      </div>
    </div>
  );
}
