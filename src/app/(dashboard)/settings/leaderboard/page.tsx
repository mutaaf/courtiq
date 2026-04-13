'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Trophy, Eye, EyeOff, Loader2, Star, Medal, Award, Zap } from 'lucide-react';
import Link from 'next/link';

// ─── Badge config ────────────────────────────────────────────────────────────

const BADGE_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; class: string }> = {
  'Elite Coach': { icon: Trophy, class: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  'Experienced Coach': { icon: Award, class: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  'Developing Coach': { icon: Medal, class: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  'Rookie Coach': { icon: Star, class: 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30' },
};

const SCORE_HINT = 'Score = observations × 1 + plans × 5 + shares × 3';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  coachId: string;
  name: string;
  isSelf: boolean;
  obs: number;
  plans: number;
  shares: number;
  score: number;
  badge: string;
  badgeColor: string;
}

interface LeaderboardData {
  entries: LeaderboardEntry[];
  me: {
    optedIn: boolean;
    obs: number;
    plans: number;
    shares: number;
    score: number;
    badge: string;
    badgeColor: string;
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const queryClient = useQueryClient();
  const [optimisticOptIn, setOptimisticOptIn] = useState<boolean | null>(null);

  const { data, isLoading } = useQuery<LeaderboardData>({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) throw new Error('Failed to load leaderboard');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const optInMutation = useMutation({
    mutationFn: async (optIn: boolean) => {
      setOptimisticOptIn(optIn);
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optIn }),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: () => {
      setOptimisticOptIn(null);
    },
    onSettled: () => {
      setOptimisticOptIn(null);
    },
  });

  const isOptedIn = optimisticOptIn !== null ? optimisticOptIn : (data?.me?.optedIn ?? false);
  const me = data?.me;
  const entries = data?.entries ?? [];

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" aria-label="Back to settings">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Coach Leaderboard</h1>
          <p className="text-zinc-400 text-sm">Opt-in to see how you rank among coaches in your org</p>
        </div>
      </div>

      {/* My Stats Card */}
      <Card className={isOptedIn ? 'border-orange-500/30 bg-orange-500/5' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-orange-400" />
            Your Stats
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-32" />
              <div className="grid grid-cols-3 gap-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            </div>
          ) : me ? (
            <>
              {/* Badge */}
              <BadgeChip badge={me.badge} />

              {/* Stat grid */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <StatCell label="Observations" value={me.obs} icon="👁" />
                <StatCell label="Plans" value={me.plans} icon="📋" />
                <StatCell label="Shares" value={me.shares} icon="🔗" />
              </div>

              {/* Score */}
              <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
                <span className="text-xs text-zinc-500">{SCORE_HINT}</span>
                <span className="text-lg font-bold text-orange-400">{me.score} pts</span>
              </div>
            </>
          ) : null}

          {/* Opt-in toggle */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-sm font-medium">
                {isOptedIn ? 'Visible on leaderboard' : 'Hidden from leaderboard'}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {isOptedIn
                  ? 'Your stats appear with anonymized name'
                  : 'Join to compete with coaches in your org'}
              </p>
            </div>
            <Button
              variant={isOptedIn ? 'outline' : 'default'}
              size="sm"
              className={isOptedIn ? '' : 'bg-orange-500 hover:bg-orange-600 text-white'}
              disabled={optInMutation.isPending}
              onClick={() => optInMutation.mutate(!isOptedIn)}
            >
              {optInMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isOptedIn ? (
                <>
                  <EyeOff className="h-4 w-4" />
                  Hide me
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Join leaderboard
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Medal className="h-4 w-4 text-zinc-400" />
              Org Rankings
            </span>
            {entries.length > 0 && (
              <span className="text-xs font-normal text-zinc-500">{entries.length} coach{entries.length !== 1 ? 'es' : ''}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Zap className="h-8 w-8 text-zinc-700 mx-auto" />
              <p className="text-sm text-zinc-500">No coaches have joined yet</p>
              <p className="text-xs text-zinc-600">Be the first to join the leaderboard!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry, idx) => (
                <LeaderboardRow key={entry.coachId} entry={entry} rank={idx + 1} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score breakdown */}
      <Card className="border-zinc-800/50">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-zinc-400 mb-3">How scores are calculated</p>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="space-y-1">
              <div className="text-base font-bold text-zinc-200">×1</div>
              <div className="text-zinc-500">per observation</div>
            </div>
            <div className="space-y-1">
              <div className="text-base font-bold text-orange-400">×5</div>
              <div className="text-zinc-500">per plan</div>
            </div>
            <div className="space-y-1">
              <div className="text-base font-bold text-emerald-400">×3</div>
              <div className="text-zinc-500">per parent share</div>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-xs text-zinc-500">
            <div className="flex justify-between">
              <span>🥉 Rookie Coach</span><span>0–49 pts</span>
            </div>
            <div className="flex justify-between">
              <span>🥈 Developing Coach</span><span>50–199 pts</span>
            </div>
            <div className="flex justify-between">
              <span>🏅 Experienced Coach</span><span>200–499 pts</span>
            </div>
            <div className="flex justify-between">
              <span>🏆 Elite Coach</span><span>500+ pts</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BadgeChip({ badge }: { badge: string }) {
  const cfg = BADGE_CONFIG[badge] ?? BADGE_CONFIG['Rookie Coach'];
  const Icon = cfg.icon;
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${cfg.class}`}>
      <Icon className="h-4 w-4" />
      {badge}
    </div>
  );
}

function StatCell({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="rounded-lg bg-zinc-800/50 p-3 space-y-1">
      <div className="text-lg font-bold">{value.toLocaleString()}</div>
      <div className="text-xs text-zinc-500 leading-tight">{icon} {label}</div>
    </div>
  );
}

function LeaderboardRow({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const cfg = BADGE_CONFIG[entry.badge] ?? BADGE_CONFIG['Rookie Coach'];
  const Icon = cfg.icon;
  const medalEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg p-3 transition-colors ${
        entry.isSelf ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-zinc-800/30'
      }`}
    >
      {/* Rank */}
      <div className="w-8 text-center shrink-0">
        {medalEmoji ? (
          <span className="text-base">{medalEmoji}</span>
        ) : (
          <span className="text-sm text-zinc-500 font-mono">#{rank}</span>
        )}
      </div>

      {/* Name + badge */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${entry.isSelf ? 'text-orange-300' : ''}`}>
            {entry.name}
            {entry.isSelf && <span className="ml-1 text-xs text-orange-400/70">(you)</span>}
          </span>
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${cfg.class}`}>
            <Icon className="h-3 w-3" />
            {entry.badge}
          </span>
        </div>
        <div className="flex gap-3 mt-0.5 text-xs text-zinc-500">
          <span>{entry.obs} obs</span>
          <span>{entry.plans} plans</span>
          <span>{entry.shares} shares</span>
        </div>
      </div>

      {/* Score */}
      <div className="text-right shrink-0">
        <div className="text-sm font-bold text-zinc-200">{entry.score.toLocaleString()}</div>
        <div className="text-xs text-zinc-600">pts</div>
      </div>
    </div>
  );
}
