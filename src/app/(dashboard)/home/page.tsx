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
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

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
      : 'text-zinc-500';

  const healthPct = pulse.thisWeekHealth ?? 0;
  const healthColor =
    healthPct >= 70 ? '#10b981' : healthPct >= 50 ? '#F97316' : '#f59e0b';

  // SVG progress ring
  const r = 18;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - healthPct / 100);

  return (
    <Card className="border-orange-500/20 bg-zinc-900/60">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4 text-orange-400" />
          Team Pulse
          <Badge variant="secondary" className="ml-auto text-[10px]">
            Last 14 days
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        {/* Health summary row */}
        <div className="flex items-center gap-4">
          {pulse.thisWeekHealth !== null && (
            <div className="relative shrink-0" style={{ width: 52, height: 52 }}>
              <svg width={52} height={52} className="-rotate-90">
                <circle cx={26} cy={26} r={r} fill="none" stroke="#27272a" strokeWidth={5} />
                <circle
                  cx={26}
                  cy={26}
                  r={r}
                  fill="none"
                  stroke={healthColor}
                  strokeWidth={5}
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-zinc-100">{pulse.thisWeekHealth}%</span>
              </div>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-200">
              {pulse.obs7dCount} observation{pulse.obs7dCount !== 1 ? 's' : ''} this week
            </p>
            {pulse.thisWeekHealth !== null ? (
              <div className={`mt-0.5 flex items-center gap-1 text-xs ${trendColor}`}>
                <TrendIcon className="h-3 w-3" />
                <span>
                  {pulse.healthTrend === 'stable'
                    ? 'Stable'
                    : pulse.healthTrend === 'up'
                    ? 'Improving'
                    : 'Declining'}
                  {pulse.lastWeekHealth !== null
                    ? ` · vs ${pulse.lastWeekHealth}% last week`
                    : ''}
                </span>
              </div>
            ) : (
              <p className="mt-0.5 text-xs text-zinc-600">Not enough data to trend yet</p>
            )}
          </div>
        </div>

        {/* Players not observed this week */}
        {pulse.unobservedPlayers.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              Not observed this week · {pulse.unobservedPlayers.length}/{pulse.totalPlayers}{' '}
              players
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pulse.unobservedPlayers.slice(0, 6).map((p) => (
                <Link key={p.id} href={`/roster/${p.id}`}>
                  <span className="touch-manipulation inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 transition-colors hover:bg-amber-500/20">
                    {p.jersey_number != null ? `#${p.jersey_number} ` : ''}
                    {p.name.split(' ')[0]}
                  </span>
                </Link>
              ))}
              {pulse.unobservedPlayers.length > 6 && (
                <span className="inline-flex items-center rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-500">
                  +{pulse.unobservedPlayers.length - 6} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Top focus area */}
        {pulse.topFocusArea && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Target className="h-4 w-4 shrink-0 text-orange-400" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-300">
                  Top focus:{' '}
                  <span className="capitalize text-orange-400">
                    {pulse.topFocusArea.category}
                  </span>
                </p>
                <p className="text-[10px] text-zinc-500">
                  {pulse.topFocusArea.count} needs-work observations
                </p>
              </div>
            </div>
            <Link href="/plans" className="shrink-0">
              <span className="touch-manipulation flex items-center gap-1 px-1 py-1 text-xs font-medium text-orange-500 transition-colors hover:text-orange-400">
                Plan <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { activeTeam, teams } = useActiveTeam();

  const { data: stats } = useQuery({
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
  const { data: pulse } = useQuery({
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
          <Image src="/logo.svg" alt="CourtIQ" width={48} height={48} />
        </div>
        <h1 className="text-2xl font-bold">Welcome to CourtIQ</h1>
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
        <Card>
          <CardContent className="p-5 sm:p-4 text-center">
            <p className="text-3xl sm:text-2xl font-bold text-orange-500">
              {stats?.players || 0}
            </p>
            <p className="text-xs text-zinc-400 mt-1">Players</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 sm:p-4 text-center">
            <p className="text-3xl sm:text-2xl font-bold text-blue-500">
              {stats?.observations || 0}
            </p>
            <p className="text-xs text-zinc-400 mt-1">Observations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 sm:p-4 text-center">
            <p className="text-3xl sm:text-2xl font-bold text-emerald-500">
              {stats?.sessions || 0}
            </p>
            <p className="text-xs text-zinc-400 mt-1">Sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Team Pulse — coaching intelligence card, shown once there's observation data */}
      {pulse && <TeamPulseCard pulse={pulse} />}

      {/* Empty state prompt for new users */}
      {stats && stats.players === 0 && stats.observations === 0 && stats.sessions === 0 && (
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
  );
}
