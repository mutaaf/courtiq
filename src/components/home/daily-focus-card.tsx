'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Target, Mic, Dumbbell, UserCheck } from 'lucide-react';
import Link from 'next/link';
import {
  buildDailyFocusSuggestion,
  hasSufficientDataForFocus,
} from '@/lib/daily-focus-utils';
import type { PlayerObsSummary, RosterPlayer } from '@/lib/daily-focus-utils';
import { formatSkillLabel } from '@/lib/skill-trend-utils';

interface DailyFocusCardProps {
  teamId: string;
}

export function DailyFocusCard({ teamId }: DailyFocusCardProps) {
  const cutoff = useMemo(() => {
    const d = new Date(Date.now() - 30 * 86_400_000);
    return d.toISOString();
  }, []);

  const { data: players = [] } = useQuery<RosterPlayer[]>({
    queryKey: ['daily-focus-roster', teamId],
    queryFn: () =>
      query<RosterPlayer[]>({
        table: 'players',
        select: 'id, name',
        filters: { team_id: teamId, is_active: true },
      }).then((r) => r ?? []),
    staleTime: 5 * 60_000,
  });

  const { data: observations = [] } = useQuery<PlayerObsSummary[]>({
    queryKey: ['daily-focus-obs', teamId, cutoff],
    queryFn: () =>
      query<PlayerObsSummary[]>({
        table: 'observations',
        select: 'player_id, sentiment, category, created_at',
        filters: {
          team_id: teamId,
          created_at: { op: 'gte', value: cutoff },
        },
        order: { column: 'created_at', ascending: false },
        limit: 200,
      }).then((r) => r ?? []),
    staleTime: 3 * 60_000,
    enabled: players.length > 0,
  });

  const suggestion = useMemo(() => {
    if (!hasSufficientDataForFocus(players, observations)) return null;
    return buildDailyFocusSuggestion(players, observations, [], new Date());
  }, [players, observations]);

  if (!suggestion) return null;

  const skillLabel = suggestion.skillToFocus
    ? formatSkillLabel(suggestion.skillToFocus)
    : null;

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
          <Target className="h-4 w-4 text-blue-400" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400">
          Today's Focus
        </p>
      </div>

      {/* Suggestion */}
      <div>
        <p className="text-base font-bold text-zinc-100 leading-snug">
          Check in with{' '}
          <Link
            href={`/roster/${suggestion.playerId}`}
            className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
          >
            {suggestion.playerName}
          </Link>
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <UserCheck className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <p className="text-xs text-zinc-400">{suggestion.reason}</p>
        </div>
        {skillLabel && (
          <p className="text-xs text-zinc-500 mt-0.5 ml-5">
            Focus skill: <span className="text-zinc-300 font-medium">{skillLabel}</span>
          </p>
        )}
      </div>

      {/* CTAs */}
      <div className="flex gap-2 flex-wrap">
        <Link href={suggestion.captureHref}>
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs"
          >
            <Mic className="h-3.5 w-3.5" />
            Capture Obs
          </Button>
        </Link>
        {suggestion.skillToFocus && (
          <Link href={`/drills?category=${encodeURIComponent(suggestion.skillToFocus)}`}>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-xs"
            >
              <Dumbbell className="h-3.5 w-3.5" />
              Find Drills
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
