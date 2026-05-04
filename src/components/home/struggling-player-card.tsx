'use client';

import { useEffect, useState, useMemo } from 'react';
import { TrendingDown, Dumbbell, Zap, X } from 'lucide-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import {
  findStrugglingPlayers,
  hasEnoughDataForStruggling,
  getTopStrugglingPlayer,
  buildStrugglingLabel,
  buildCoachingTip,
  sortByStrugglingCount,
  type ObsForStruggling,
} from '@/lib/struggling-player-utils';

interface Props {
  teamId: string;
}

function getDismissKey(teamId: string): string {
  return `sportsiq:struggling-dismissed:${teamId}`;
}

function isDismissedToday(teamId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(getDismissKey(teamId));
    if (!raw) return false;
    const day = new Date(raw).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    return day === today;
  } catch {
    return false;
  }
}

function markDismissed(teamId: string): void {
  try {
    localStorage.setItem(getDismissKey(teamId), new Date().toISOString());
  } catch {
    // private/full storage — ignore
  }
}

export function StrugglingPlayerCard({ teamId }: Props) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDismissed(isDismissedToday(teamId));
  }, [teamId]);

  const since14d = useMemo(
    () => new Date(Date.now() - 14 * 86_400_000).toISOString(),
    [],
  );

  // Observations (last 14 days, needs-work + positive so we can check data sufficiency)
  const { data: recentObs = [] } = useQuery({
    queryKey: ['struggling-obs', teamId],
    queryFn: () =>
      query<ObsForStruggling[]>({
        table: 'observations',
        select: 'player_id, category, sentiment',
        filters: {
          team_id: teamId,
          created_at: { op: 'gte', value: since14d },
        },
      }),
    enabled: !!teamId && mounted && !dismissed,
    staleTime: 5 * 60 * 1000,
  });

  // Roster
  const { data: players = [] } = useQuery({
    queryKey: ['struggling-roster', teamId],
    queryFn: () =>
      query<{ id: string; name: string }[]>({
        table: 'players',
        select: 'id, name',
        filters: { team_id: teamId, is_active: true },
      }),
    enabled: !!teamId && mounted && !dismissed,
    staleTime: 10 * 60 * 1000,
  });

  const struggling = useMemo(() => {
    if (!recentObs.length || !players.length) return [];
    if (!hasEnoughDataForStruggling(recentObs)) return [];
    return sortByStrugglingCount(findStrugglingPlayers(recentObs, players, 3));
  }, [recentObs, players]);

  const top = getTopStrugglingPlayer(struggling);
  const othersCount = struggling.length - 1;

  function handleDismiss() {
    markDismissed(teamId);
    setDismissed(true);
  }

  if (!mounted || dismissed || !top) return null;

  return (
    <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-4 relative">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-red-900/50 rounded-lg">
            <TrendingDown className="h-4 w-4 text-red-400" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-300">Skill Struggle Alert</p>
            <p className="text-xs text-red-400/80">
              {buildStrugglingLabel(top.category, top.count)} this week
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="text-zinc-500 hover:text-zinc-300 p-1 -mr-1 -mt-1 touch-manipulation"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Player name + coaching tip */}
      <div className="mb-3">
        <p className="text-base font-bold text-zinc-100">{top.playerName}</p>
        <p className="text-sm text-zinc-400 mt-0.5">{buildCoachingTip(top)}</p>
        {othersCount > 0 && (
          <p className="text-xs text-red-400/70 mt-1">
            +{othersCount} other player{othersCount > 1 ? 's' : ''} also struggling
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Link
          href={top.drillUrl}
          className="flex-1 flex items-center justify-center gap-1.5 bg-red-800/60 hover:bg-red-700/60 text-red-100 text-sm font-medium py-2 px-3 rounded-lg transition-colors touch-manipulation"
        >
          <Dumbbell className="h-3.5 w-3.5" aria-hidden />
          Find Drills
        </Link>
        <Link
          href={top.captureUrl}
          className="flex-1 flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-medium py-2 px-3 rounded-lg transition-colors touch-manipulation"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden />
          Observe {top.playerName.split(' ')[0]}
        </Link>
      </div>
    </div>
  );
}
