'use client';

import { useMemo } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Users, Eye, Calendar, Target, AlertTriangle, CheckCircle2, Activity } from 'lucide-react';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import type { Observation, Player, Session, Sentiment } from '@/types/database';

// --- Helpers ---

function getISOWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function weekLabel(weekKey: string): string {
  const [year, w] = weekKey.split('-W');
  const jan4 = new Date(Number(year), 0, 4);
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (Number(w) - 1) * 7);
  return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// SVG progress ring
function ProgressRing({
  value,
  max = 100,
  size = 96,
  stroke = 10,
  color = '#F97316',
  children,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  const offset = circ * (1 - pct);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#27272a" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

// Stacked bar segment
function StackedBar({
  positive,
  neutral,
  needsWork,
  total,
  label,
}: {
  positive: number;
  neutral: number;
  needsWork: number;
  total: number;
  label: string;
}) {
  const pPct = total > 0 ? (positive / total) * 100 : 0;
  const nPct = total > 0 ? (neutral / total) * 100 : 0;
  const nwPct = total > 0 ? (needsWork / total) * 100 : 0;

  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className="w-full flex flex-col-reverse rounded overflow-hidden" style={{ height: 64 }}>
        {total === 0 ? (
          <div className="w-full h-full bg-zinc-800/40" />
        ) : (
          <>
            <div className="w-full bg-emerald-500/80 transition-all" style={{ height: `${pPct}%` }} />
            <div className="w-full bg-zinc-500/60 transition-all" style={{ height: `${nPct}%` }} />
            <div className="w-full bg-amber-500/80 transition-all" style={{ height: `${nwPct}%` }} />
          </>
        )}
      </div>
      <span className="text-[9px] text-zinc-500 text-center">{label}</span>
      {total > 0 && <span className="text-[9px] text-zinc-600">{total}</span>}
    </div>
  );
}

interface WeekBucket {
  weekKey: string;
  positive: number;
  neutral: number;
  needsWork: number;
  total: number;
}

export default function AnalyticsPage() {
  const { activeTeam } = useActiveTeam();

  const { data: observations = [], isLoading: obsLoading } = useQuery({
    queryKey: ['analytics-observations', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Observation[]>({
        table: 'observations',
        select: 'id, player_id, sentiment, category, skill_id, created_at',
        filters: { team_id: activeTeam.id },
        order: { column: 'created_at', ascending: false },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  const { data: players = [], isLoading: playersLoading } = useQuery({
    queryKey: ['analytics-players', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Pick<Player, 'id' | 'name' | 'position' | 'jersey_number'>[]>({
        table: 'players',
        select: 'id, name, position, jersey_number',
        filters: { team_id: activeTeam.id, is_active: true },
        order: { column: 'name', ascending: true },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['analytics-sessions', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Pick<Session, 'id' | 'type' | 'date'>[]>({
        table: 'sessions',
        select: 'id, type, date',
        filters: { team_id: activeTeam.id },
        order: { column: 'date', ascending: false },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = obsLoading || playersLoading || sessionsLoading;

  // ── Derived analytics ──────────────────────────────────────────────────────

  const analytics = useMemo(() => {
    const total = observations.length;
    const positive = observations.filter((o) => o.sentiment === 'positive').length;
    const needsWork = observations.filter((o) => o.sentiment === 'needs-work').length;
    const neutral = observations.filter((o) => o.sentiment === 'neutral').length;

    // Health score: positive / (positive + needsWork), ignore neutral
    const scored = positive + needsWork;
    const healthScore = scored > 0 ? Math.round((positive / scored) * 100) : 0;

    // Last 30 days vs prior 30 days trend
    const now = Date.now();
    const day = 86400000;
    const last30 = observations.filter((o) => now - new Date(o.created_at).getTime() < 30 * day);
    const prior30 = observations.filter((o) => {
      const age = now - new Date(o.created_at).getTime();
      return age >= 30 * day && age < 60 * day;
    });
    const last30Scored = last30.filter((o) => o.sentiment !== 'neutral');
    const last30Health =
      last30Scored.length > 0
        ? Math.round((last30.filter((o) => o.sentiment === 'positive').length / last30Scored.length) * 100)
        : null;
    const prior30Scored = prior30.filter((o) => o.sentiment !== 'neutral');
    const prior30Health =
      prior30Scored.length > 0
        ? Math.round((prior30.filter((o) => o.sentiment === 'positive').length / prior30Scored.length) * 100)
        : null;

    let healthTrend: 'up' | 'down' | 'flat' = 'flat';
    if (last30Health !== null && prior30Health !== null) {
      const delta = last30Health - prior30Health;
      if (delta >= 5) healthTrend = 'up';
      else if (delta <= -5) healthTrend = 'down';
    }

    // Weekly buckets — last 8 weeks
    const weekKeys: string[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now - i * 7 * day);
      weekKeys.push(getISOWeekKey(d));
    }
    const uniqueWeekKeys = [...new Set(weekKeys)];

    const weekBuckets: WeekBucket[] = uniqueWeekKeys.map((wk) => ({
      weekKey: wk,
      positive: 0,
      neutral: 0,
      needsWork: 0,
      total: 0,
    }));
    const weekMap = new Map(weekBuckets.map((b) => [b.weekKey, b]));

    observations.forEach((o) => {
      const wk = getISOWeekKey(new Date(o.created_at));
      const bucket = weekMap.get(wk);
      if (bucket) {
        bucket.total++;
        if (o.sentiment === 'positive') bucket.positive++;
        else if (o.sentiment === 'needs-work') bucket.needsWork++;
        else bucket.neutral++;
      }
    });

    // Player observation counts
    const playerCounts = new Map<string, { positive: number; needsWork: number; neutral: number; total: number }>();
    players.forEach((p) => {
      playerCounts.set(p.id, { positive: 0, needsWork: 0, neutral: 0, total: 0 });
    });
    observations.forEach((o) => {
      if (o.player_id) {
        const c = playerCounts.get(o.player_id);
        if (c) {
          c.total++;
          if (o.sentiment === 'positive') c.positive++;
          else if (o.sentiment === 'needs-work') c.needsWork++;
          else c.neutral++;
        }
      }
    });
    const maxPlayerObs = Math.max(1, ...Array.from(playerCounts.values()).map((c) => c.total));

    // Category breakdown
    const categoryCounts = new Map<string, { positive: number; needsWork: number; neutral: number; total: number }>();
    observations.forEach((o) => {
      if (!o.category) return;
      if (!categoryCounts.has(o.category)) {
        categoryCounts.set(o.category, { positive: 0, needsWork: 0, neutral: 0, total: 0 });
      }
      const c = categoryCounts.get(o.category)!;
      c.total++;
      if (o.sentiment === 'positive') c.positive++;
      else if (o.sentiment === 'needs-work') c.needsWork++;
      else c.neutral++;
    });
    const sortedCategories = [...categoryCounts.entries()]
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.total - a.total);
    const maxCategoryTotal = Math.max(1, ...sortedCategories.map((c) => c.total));

    // Top needs-work areas (category)
    const needsWorkByCategory = sortedCategories
      .filter((c) => c.needsWork > 0)
      .sort((a, b) => b.needsWork - a.needsWork)
      .slice(0, 5);

    return {
      total,
      positive,
      needsWork,
      neutral,
      healthScore,
      healthTrend,
      last30Health,
      weekBuckets,
      playerCounts,
      maxPlayerObs,
      sortedCategories,
      maxCategoryTotal,
      needsWorkByCategory,
    };
  }, [observations, players]);

  if (!activeTeam) {
    return (
      <div className="flex items-center justify-center p-8 min-h-[60vh]">
        <p className="text-zinc-400">Select a team to view analytics</p>
      </div>
    );
  }

  const TrendIcon =
    analytics.healthTrend === 'up'
      ? TrendingUp
      : analytics.healthTrend === 'down'
      ? TrendingDown
      : Minus;
  const trendColor =
    analytics.healthTrend === 'up'
      ? 'text-emerald-400'
      : analytics.healthTrend === 'down'
      ? 'text-red-400'
      : 'text-zinc-400';

  const healthRingColor =
    analytics.healthScore >= 70
      ? '#10b981'
      : analytics.healthScore >= 50
      ? '#F97316'
      : '#f59e0b';

  return (
    <UpgradeGate feature="analytics" featureLabel="Team Analytics">
    <div className="p-4 lg:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Team Analytics</h1>
        <p className="text-zinc-400 text-sm">
          {activeTeam.name} &middot; Season {activeTeam.season || 'N/A'} &middot; Week{' '}
          {activeTeam.current_week}
        </p>
      </div>

      {/* Top stats row */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Health Score */}
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="flex flex-col items-center justify-center p-4 gap-2">
              <ProgressRing value={analytics.healthScore} color={healthRingColor} size={88} stroke={9}>
                <span className="text-xl font-bold text-zinc-100">{analytics.healthScore}%</span>
              </ProgressRing>
              <div className="text-center">
                <p className="text-xs font-medium text-zinc-300">Health Score</p>
                <div className={`flex items-center justify-center gap-1 mt-0.5 ${trendColor}`}>
                  <TrendIcon className="h-3 w-3" />
                  <span className="text-[10px] font-medium">
                    {analytics.healthTrend === 'flat' ? 'Stable' : analytics.healthTrend === 'up' ? 'Improving' : 'Declining'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Observations */}
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-4 gap-1 h-full">
              <Eye className="h-6 w-6 text-orange-500" />
              <p className="text-3xl font-bold text-orange-500">{analytics.total}</p>
              <p className="text-xs text-zinc-400 text-center">Total Observations</p>
            </CardContent>
          </Card>

          {/* Players */}
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-4 gap-1 h-full">
              <Users className="h-6 w-6 text-blue-500" />
              <p className="text-3xl font-bold text-blue-500">{players.length}</p>
              <p className="text-xs text-zinc-400 text-center">Active Players</p>
            </CardContent>
          </Card>

          {/* Sessions */}
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-4 gap-1 h-full">
              <Calendar className="h-6 w-6 text-purple-500" />
              <p className="text-3xl font-bold text-purple-500">{sessions.length}</p>
              <p className="text-xs text-zinc-400 text-center">Sessions</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sentiment breakdown strip */}
      {!isLoading && analytics.total > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-200">Sentiment Breakdown</p>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Positive
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" />
                  Neutral
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Needs Work
                </span>
              </div>
            </div>
            {/* Stacked bar strip */}
            <div className="flex h-5 w-full overflow-hidden rounded-full">
              {analytics.total > 0 && (
                <>
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${(analytics.positive / analytics.total) * 100}%` }}
                  />
                  <div
                    className="bg-zinc-500 transition-all"
                    style={{ width: `${(analytics.neutral / analytics.total) * 100}%` }}
                  />
                  <div
                    className="bg-amber-500 transition-all"
                    style={{ width: `${(analytics.needsWork / analytics.total) * 100}%` }}
                  />
                </>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-emerald-400">{analytics.positive}</p>
                <p className="text-[10px] text-zinc-500">
                  {analytics.total > 0
                    ? `${Math.round((analytics.positive / analytics.total) * 100)}%`
                    : '—'}{' '}
                  Positive
                </p>
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-400">{analytics.neutral}</p>
                <p className="text-[10px] text-zinc-500">
                  {analytics.total > 0
                    ? `${Math.round((analytics.neutral / analytics.total) * 100)}%`
                    : '—'}{' '}
                  Neutral
                </p>
              </div>
              <div>
                <p className="text-lg font-bold text-amber-400">{analytics.needsWork}</p>
                <p className="text-[10px] text-zinc-500">
                  {analytics.total > 0
                    ? `${Math.round((analytics.needsWork / analytics.total) * 100)}%`
                    : '—'}{' '}
                  Needs Work
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly trend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-orange-400" />
            8-Week Observation Trend
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : (
            <div className="flex items-end gap-1.5">
              {analytics.weekBuckets.map((bucket) => (
                <StackedBar
                  key={bucket.weekKey}
                  positive={bucket.positive}
                  neutral={bucket.neutral}
                  needsWork={bucket.needsWork}
                  total={bucket.total}
                  label={weekLabel(bucket.weekKey)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two-column: Player attention + Category breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Player Attention */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-400" />
              Player Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded" />
                ))}
              </div>
            ) : players.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-4">No players on roster</p>
            ) : (
              [...players]
                .sort((a, b) => {
                  const ac = analytics.playerCounts.get(a.id)?.total ?? 0;
                  const bc = analytics.playerCounts.get(b.id)?.total ?? 0;
                  return bc - ac;
                })
                .slice(0, 10)
                .map((player) => {
                  const counts = analytics.playerCounts.get(player.id) ?? {
                    total: 0, positive: 0, needsWork: 0, neutral: 0,
                  };
                  const pct = (counts.total / analytics.maxPlayerObs) * 100;
                  const positivePct = counts.total > 0 ? (counts.positive / counts.total) * 100 : 0;

                  const barColor =
                    counts.total === 0
                      ? 'bg-zinc-700'
                      : positivePct >= 70
                      ? 'bg-emerald-500'
                      : positivePct >= 40
                      ? 'bg-orange-500'
                      : 'bg-amber-500';

                  return (
                    <div key={player.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] text-zinc-600 shrink-0">
                            #{player.jersey_number ?? '?'}
                          </span>
                          <span className="text-xs font-medium text-zinc-300 truncate">
                            {player.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
                          {counts.total} obs
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-zinc-800">
                        <div
                          className={`h-1.5 rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
            )}
            {!isLoading && players.length > 10 && (
              <p className="text-[10px] text-zinc-600 text-center pt-1">
                +{players.length - 10} more players
              </p>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-400" />
              Skill Category Coverage
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded" />
                ))}
              </div>
            ) : analytics.sortedCategories.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-4">No observations yet</p>
            ) : (
              analytics.sortedCategories.map((cat) => {
                const pct = (cat.total / analytics.maxCategoryTotal) * 100;
                const posPct = cat.total > 0 ? Math.round((cat.positive / cat.total) * 100) : 0;

                return (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-300 capitalize">{cat.name}</span>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                        <span className="text-emerald-400">{posPct}% pos</span>
                        <span>{cat.total} obs</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-800 flex overflow-hidden">
                      <div
                        className="h-full bg-emerald-500/80 transition-all"
                        style={{ width: `${(cat.positive / analytics.maxCategoryTotal) * 100}%` }}
                      />
                      <div
                        className="h-full bg-zinc-500/60 transition-all"
                        style={{ width: `${(cat.neutral / analytics.maxCategoryTotal) * 100}%` }}
                      />
                      <div
                        className="h-full bg-amber-500/80 transition-all"
                        style={{ width: `${(cat.needsWork / analytics.maxCategoryTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Focus Areas: Top Needs-Work Categories */}
      {!isLoading && analytics.needsWorkByCategory.length > 0 && (
        <Card className="border-amber-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Top Focus Areas
              <Badge variant="secondary" className="text-[10px]">
                Most needs-work observations
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {analytics.needsWorkByCategory.map((cat, i) => {
                const rank = i + 1;
                const rankColor = rank === 1 ? 'text-amber-400' : rank === 2 ? 'text-zinc-400' : 'text-zinc-600';
                return (
                  <div
                    key={cat.name}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3"
                  >
                    <span className={`text-xl font-bold tabular-nums ${rankColor}`}>#{rank}</span>
                    <div>
                      <p className="text-sm font-medium text-zinc-200 capitalize">{cat.name}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {cat.needsWork} needs-work &middot; {cat.total} total obs
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Positive highlights: top positive areas */}
      {!isLoading && analytics.sortedCategories.filter((c) => c.positive > 0).length > 0 && (
        <Card className="border-emerald-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Strengths
              <Badge variant="secondary" className="text-[10px]">
                Top positive areas
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {analytics.sortedCategories
                .filter((c) => c.positive > 0)
                .sort((a, b) => b.positive - a.positive)
                .slice(0, 3)
                .map((cat, i) => (
                  <div
                    key={cat.name}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3"
                  >
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-zinc-200 capitalize">{cat.name}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {cat.positive} positive &middot;{' '}
                        {cat.total > 0 ? Math.round((cat.positive / cat.total) * 100) : 0}% pos rate
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && analytics.total === 0 && (
        <Card className="border-dashed border-zinc-700">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Activity className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-semibold text-zinc-300">No observations yet</h3>
            <p className="text-zinc-500 text-sm mt-2 max-w-sm">
              Start capturing observations during practice or games — analytics will appear here as
              data comes in.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
    </UpgradeGate>
  );
}
