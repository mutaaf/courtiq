'use client';

import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Mic,
  Users,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Calendar,
  Plus,
  Sparkles,
  ArrowRight,
  Minus,
  Zap,
  AlertTriangle,
  Target,
  Lightbulb,
  Star,
  ChevronRight,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { TestimonialPrompt } from '@/components/onboarding/testimonial-prompt';
import { FreemiumNudge } from '@/components/ui/freemium-nudge';

// ─── AI Coaching Tips ─────────────────────────────────────────────────────────

interface CoachingTip {
  type: 'alert' | 'suggestion' | 'praise';
  message: string;
  action_label?: string;
  action_href?: string;
}

const TIP_CONFIG: Record<
  CoachingTip['type'],
  { icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string }
> = {
  alert: {
    icon: AlertTriangle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-l-red-500',
  },
  suggestion: {
    icon: Lightbulb,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-l-blue-500',
  },
  praise: {
    icon: Star,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-l-amber-500',
  },
};

function CoachingTipsCard({ teamId }: { teamId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['coaching-tips', teamId],
    queryFn: async (): Promise<CoachingTip[]> => {
      const res = await fetch('/api/ai/coaching-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });
      if (!res.ok) throw new Error('Failed to load tips');
      const json = await res.json();
      return json.tips || [];
    },
    staleTime: 4 * 60 * 60 * 1000, // 4 hours — regenerate once per session block
    retry: false,
  });

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-zinc-800">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-4 w-28 rounded" />
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-3">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <Card className="overflow-hidden border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15">
            <Sparkles className="h-4 w-4 text-orange-400" />
          </div>
          AI Coach Tips
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-2.5">
        {data.map((tip, i) => {
          const cfg = TIP_CONFIG[tip.type] ?? TIP_CONFIG.suggestion;
          const Icon = cfg.icon;
          return (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-xl border border-l-4 border-zinc-800 ${cfg.border} p-3.5`}
            >
              <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
                <Icon className={`h-4 w-4 ${cfg.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200 leading-snug">{tip.message}</p>
                {tip.action_label && tip.action_href && (
                  <Link
                    href={tip.action_href}
                    className={`mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium ${cfg.color} hover:underline`}
                  >
                    {tip.action_label}
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Team Pulse ────────────────────────────────────────────────────────────────

interface PulseStats {
  obs14dCount: number;
  obs7dCount: number;
  thisWeekHealth: number | null;
  lastWeekHealth: number | null;
  healthTrend: 'up' | 'down' | 'stable';
  unobservedPlayers: Array<{ id: string; name: string; jersey_number: number | null }>;
  totalPlayers: number;
  topFocusArea: { category: string; count: number } | null;
}

function TeamPulseCard({ pulse }: { pulse: PulseStats }) {
  const TrendIcon =
    pulse.healthTrend === 'up'
      ? TrendingUp
      : pulse.healthTrend === 'down'
      ? TrendingDown
      : Minus;

  const trendColor =
    pulse.healthTrend === 'up'
      ? 'text-emerald-400'
      : pulse.healthTrend === 'down'
      ? 'text-red-400'
      : 'text-zinc-400';

  const trendBg =
    pulse.healthTrend === 'up'
      ? 'bg-emerald-500/10'
      : pulse.healthTrend === 'down'
      ? 'bg-red-500/10'
      : 'bg-zinc-800';

  const healthPct = pulse.thisWeekHealth ?? 0;
  const healthColor =
    healthPct >= 70 ? '#10b981' : healthPct >= 50 ? '#F97316' : '#ef4444';

  const observedPct = pulse.totalPlayers > 0
    ? Math.round(((pulse.totalPlayers - pulse.unobservedPlayers.length) / pulse.totalPlayers) * 100)
    : 0;

  // Large SVG progress ring
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - healthPct / 100);

  return (
    <Card className="overflow-hidden border-orange-500/20">
      {/* Header with gradient accent */}
      <div className="relative bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-transparent px-5 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/20">
              <Zap className="h-4.5 w-4.5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Team Pulse</h3>
              <p className="text-xs text-zinc-500">Last 14 days</p>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${trendBg} ${trendColor}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            {pulse.healthTrend === 'stable' ? 'Stable' : pulse.healthTrend === 'up' ? 'Improving' : 'Declining'}
          </div>
        </div>
      </div>

      <CardContent className="space-y-5 px-5 pb-5 pt-2">
        {/* Main stats row */}
        <div className="grid grid-cols-3 gap-3">
          {/* Health ring */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative" style={{ width: 88, height: 88 }}>
              <svg width={88} height={88} className="-rotate-90">
                <circle cx={44} cy={44} r={r} fill="none" stroke="#27272a" strokeWidth={6} />
                <circle
                  cx={44} cy={44} r={r}
                  fill="none"
                  stroke={healthColor}
                  strokeWidth={6}
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-zinc-100">{healthPct}%</span>
                <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Health</span>
              </div>
            </div>
            {pulse.lastWeekHealth !== null && (
              <p className="text-[10px] text-zinc-500">vs {pulse.lastWeekHealth}% last week</p>
            )}
          </div>

          {/* Observations stat */}
          <div className="flex flex-col items-center justify-center rounded-xl bg-zinc-800/50 p-3">
            <span className="text-2xl font-bold text-zinc-100">{pulse.obs7dCount}</span>
            <span className="text-[10px] text-zinc-500 text-center mt-0.5">this week</span>
            <span className="text-[10px] text-zinc-600 mt-1">{pulse.obs14dCount} in 14 days</span>
          </div>

          {/* Coverage stat */}
          <div className="flex flex-col items-center justify-center rounded-xl bg-zinc-800/50 p-3">
            <span className="text-2xl font-bold" style={{ color: observedPct >= 80 ? '#10b981' : observedPct >= 50 ? '#F97316' : '#ef4444' }}>
              {observedPct}%
            </span>
            <span className="text-[10px] text-zinc-500 text-center mt-0.5">coverage</span>
            <span className="text-[10px] text-zinc-600 mt-1">
              {pulse.totalPlayers - pulse.unobservedPlayers.length}/{pulse.totalPlayers} players
            </span>
          </div>
        </div>

        {/* Unobserved players */}
        {pulse.unobservedPlayers.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
            <p className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Needs attention — {pulse.unobservedPlayers.length} player{pulse.unobservedPlayers.length !== 1 ? 's' : ''} not observed
            </p>
            <div className="flex flex-wrap gap-2">
              {pulse.unobservedPlayers.slice(0, 8).map((p) => (
                <Link key={p.id} href={`/roster/${p.id}`}>
                  <span className="touch-manipulation inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition-all hover:bg-amber-500/20 hover:scale-105 active:scale-95">
                    {p.jersey_number != null && (
                      <span className="text-amber-500/70">#{p.jersey_number}</span>
                    )}
                    {p.name.split(' ')[0]}
                  </span>
                </Link>
              ))}
              {pulse.unobservedPlayers.length > 8 && (
                <span className="inline-flex items-center rounded-full bg-zinc-800 px-3 py-1.5 text-xs text-zinc-500">
                  +{pulse.unobservedPlayers.length - 8} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Top focus area — action card */}
        {pulse.topFocusArea && (
          <Link href="/plans" className="block">
            <div className="group flex items-center justify-between gap-3 rounded-xl border border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-transparent p-4 transition-all hover:border-orange-500/40 hover:from-orange-500/15 active:scale-[0.98]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20">
                  <Target className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-200">
                    Top focus:{' '}
                    <span className="capitalize text-orange-400">{pulse.topFocusArea.category}</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {pulse.topFocusArea.count} needs-work observation{pulse.topFocusArea.count !== 1 ? 's' : ''} — tap to plan
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-orange-500/50 transition-transform group-hover:translate-x-1 group-hover:text-orange-400" />
            </div>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { activeTeam, teams, coach } = useActiveTeam();

  const { data: stats, isLoading: isLoadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['home-stats', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return null;
      const [players, observations, sessions] = await Promise.all([
        query<{ id: string }[]>({
          table: 'players',
          select: 'id',
          filters: { team_id: activeTeam.id, is_active: true },
        }),
        query<{ id: string }[]>({
          table: 'observations',
          select: 'id',
          filters: { team_id: activeTeam.id },
        }),
        query<{ id: string }[]>({
          table: 'sessions',
          select: 'id',
          filters: { team_id: activeTeam.id },
        }),
      ]);
      return {
        players: players.length,
        observations: observations.length,
        sessions: sessions.length,
      };
    },
    enabled: !!activeTeam,
  });

  // Team Pulse: 14-day observation analytics for coaching intelligence
  const { data: pulse, isLoading: isLoadingPulse, refetch: refetchPulse } = useQuery({
    queryKey: ['home-pulse', activeTeam?.id],
    queryFn: async (): Promise<PulseStats | null> => {
      if (!activeTeam) return null;

      const now = Date.now();
      const day = 86_400_000;
      const fourteenDaysAgo = new Date(now - 14 * day).toISOString();

      const [playersData, recentObs] = await Promise.all([
        query<{ id: string; name: string; jersey_number: number | null }[]>({
          table: 'players',
          select: 'id, name, jersey_number',
          filters: { team_id: activeTeam.id, is_active: true },
          order: { column: 'name', ascending: true },
        }),
        query<
          { player_id: string | null; sentiment: string; category: string; created_at: string }[]
        >({
          table: 'observations',
          select: 'player_id, sentiment, category, created_at',
          filters: {
            team_id: activeTeam.id,
            created_at: { op: 'gte', value: fourteenDaysAgo },
          },
          order: { column: 'created_at', ascending: false },
          limit: 500,
        }),
      ]);

      if (!playersData?.length || !recentObs?.length) return null;

      // Split into this-week (0–7d) and last-week (7–14d) buckets
      const obs7d = recentObs.filter((o) => now - new Date(o.created_at).getTime() < 7 * day);
      const obs7to14d = recentObs.filter(
        (o) => now - new Date(o.created_at).getTime() >= 7 * day
      );

      // Health score = positive / (positive + needs-work), ignoring neutral
      const calcHealth = (obs: typeof recentObs): number | null => {
        const scored = obs.filter((o) => o.sentiment !== 'neutral');
        if (!scored.length) return null;
        return Math.round(
          (obs.filter((o) => o.sentiment === 'positive').length / scored.length) * 100
        );
      };

      const thisWeekHealth = calcHealth(obs7d);
      const lastWeekHealth = calcHealth(obs7to14d);

      let healthTrend: 'up' | 'down' | 'stable' = 'stable';
      if (thisWeekHealth !== null && lastWeekHealth !== null) {
        const delta = thisWeekHealth - lastWeekHealth;
        if (delta >= 5) healthTrend = 'up';
        else if (delta <= -5) healthTrend = 'down';
      }

      // Players with no observations in the last 7 days
      const observedIds = new Set(
        obs7d.filter((o) => o.player_id).map((o) => o.player_id as string)
      );
      const unobservedPlayers = playersData.filter((p) => !observedIds.has(p.id));

      // Most common needs-work category in the 14-day window
      const needsWorkCounts = new Map<string, number>();
      recentObs
        .filter((o) => o.sentiment === 'needs-work' && o.category)
        .forEach((o) => {
          needsWorkCounts.set(o.category, (needsWorkCounts.get(o.category) ?? 0) + 1);
        });
      const topEntry = [...needsWorkCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const topFocusArea = topEntry ? { category: topEntry[0], count: topEntry[1] } : null;

      return {
        obs14dCount: recentObs.length,
        obs7dCount: obs7d.length,
        thisWeekHealth,
        lastWeekHealth,
        healthTrend,
        unobservedPlayers,
        totalPlayers: playersData.length,
        topFocusArea,
      };
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  if (!activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[60vh]">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500/10 p-3">
          <Image src="/logo.svg" alt="SportsIQ" width={48} height={48} />
        </div>
        <h1 className="text-2xl font-bold">Welcome to SportsIQ</h1>
        <p className="mt-2 text-zinc-400 max-w-sm">
          Your AI-powered coaching assistant. Create your first team to start tracking players,
          capturing observations, and generating practice plans.
        </p>
        <Link href="/onboarding/team">
          <Button className="mt-6" size="lg">
            <Plus className="h-5 w-5" />
            Create Team
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
    <PullToRefresh onRefresh={async () => { await Promise.all([refetchStats(), refetchPulse()]); }}>
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{activeTeam.name}</h1>
        <p className="text-zinc-400">
          Season {activeTeam.season || 'Not set'} &middot; Week {activeTeam.current_week}
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/capture">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50 active:scale-[0.97] touch-manipulation">
            <CardContent className="flex flex-col items-center gap-3 p-5 sm:p-4 sm:gap-2">
              <div className="flex h-14 w-14 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-orange-500/20">
                <Mic className="h-7 w-7 sm:h-6 sm:w-6 text-orange-500" />
              </div>
              <span className="text-sm font-medium">Capture</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/roster">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50 active:scale-[0.97] touch-manipulation">
            <CardContent className="flex flex-col items-center gap-3 p-5 sm:p-4 sm:gap-2">
              <div className="flex h-14 w-14 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-blue-500/20">
                <Users className="h-7 w-7 sm:h-6 sm:w-6 text-blue-500" />
              </div>
              <span className="text-sm font-medium">Roster</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/plans">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50 active:scale-[0.97] touch-manipulation">
            <CardContent className="flex flex-col items-center gap-3 p-5 sm:p-4 sm:gap-2">
              <div className="flex h-14 w-14 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-emerald-500/20">
                <ClipboardList className="h-7 w-7 sm:h-6 sm:w-6 text-emerald-500" />
              </div>
              <span className="text-sm font-medium">Plans</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/sessions/new">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50 active:scale-[0.97] touch-manipulation">
            <CardContent className="flex flex-col items-center gap-3 p-5 sm:p-4 sm:gap-2">
              <div className="flex h-14 w-14 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-purple-500/20">
                <Calendar className="h-7 w-7 sm:h-6 sm:w-6 text-purple-500" />
              </div>
              <span className="text-sm font-medium">New Session</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {isLoadingStats ? (
          <>
            {(['Players', 'Observations', 'Sessions'] as const).map((label) => (
              <Card key={label}>
                <CardContent className="p-5 sm:p-4 flex flex-col items-center gap-2">
                  <Skeleton className="h-8 w-10 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <Card>
              <CardContent className="p-5 sm:p-4 text-center">
                <p className="text-3xl sm:text-2xl font-bold text-orange-500">
                  {stats?.players ?? 0}
                </p>
                <p className="text-xs text-zinc-400 mt-1">Players</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 sm:p-4 text-center">
                <p className="text-3xl sm:text-2xl font-bold text-blue-500">
                  {stats?.observations ?? 0}
                </p>
                <p className="text-xs text-zinc-400 mt-1">Observations</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 sm:p-4 text-center">
                <p className="text-3xl sm:text-2xl font-bold text-emerald-500">
                  {stats?.sessions ?? 0}
                </p>
                <p className="text-xs text-zinc-400 mt-1">Sessions</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Freemium upgrade nudge — shown for free-tier coaches once there's some data */}
      {!isLoadingStats && stats && (
        <FreemiumNudge
          playerCount={stats.players}
          observationCount={stats.observations}
        />
      )}

      {/* Team Pulse — coaching intelligence card, shown once there's observation data */}
      {isLoadingPulse ? (
        <Card className="overflow-hidden border-orange-500/20">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
          <CardContent className="px-5 pb-5 pt-2">
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          </CardContent>
        </Card>
      ) : (
        pulse && <TeamPulseCard pulse={pulse} />
      )}

      {/* AI Coaching Tips — proactive suggestions shown when there's enough data */}
      {!isLoadingStats && stats && stats.observations >= 5 && (
        <CoachingTipsCard teamId={activeTeam.id} />
      )}

      {/* Empty state prompt for new users — only shown after data loads */}
      {!isLoadingStats && stats && stats.players === 0 && stats.observations === 0 && stats.sessions === 0 && (
        <Card className="border-dashed border-zinc-700 overflow-hidden">
          <CardContent className="flex flex-col items-center text-center p-8 sm:p-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10 mb-5">
              <Sparkles className="h-8 w-8 text-orange-500" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-200">Get started in 3 steps</h3>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-lg">
              <Link href="/roster/add" className="group">
                <div className="rounded-xl border border-zinc-800 p-4 text-center hover:border-blue-500/50 transition-colors">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 mb-2">
                    <Users className="h-5 w-5 text-blue-500" />
                  </div>
                  <p className="text-sm font-medium">Add Players</p>
                  <p className="text-xs text-zinc-500 mt-1">Build your roster</p>
                </div>
              </Link>
              <Link href="/capture" className="group">
                <div className="rounded-xl border border-zinc-800 p-4 text-center hover:border-orange-500/50 transition-colors">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/20 mb-2">
                    <Mic className="h-5 w-5 text-orange-500" />
                  </div>
                  <p className="text-sm font-medium">Capture</p>
                  <p className="text-xs text-zinc-500 mt-1">Record observations</p>
                </div>
              </Link>
              <Link href="/plans" className="group">
                <div className="rounded-xl border border-zinc-800 p-4 text-center hover:border-emerald-500/50 transition-colors">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 mb-2">
                    <ClipboardList className="h-5 w-5 text-emerald-500" />
                  </div>
                  <p className="text-sm font-medium">Plan</p>
                  <p className="text-xs text-zinc-500 mt-1">Generate AI plans</p>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </PullToRefresh>

    {/* Testimonial prompt — shown after 10 observations */}
    {coach && !isLoadingStats && stats && (
      <TestimonialPrompt
        coachId={coach.id}
        observationCount={stats.observations}
      />
    )}
    </>
  );
}
