'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import {
  gatherAllActions,
  selectTopActions,
  filterUndismissedActions,
  hasSufficientDataForWins,
  dismissAction,
  getActionIcon,
  formatEstimatedTime,
  type ActionPlayer,
  type ActionSession,
  type QuickWinAction,
} from '@/lib/next-best-actions-utils';

interface QuickWinsCardProps {
  teamId: string;
  lastSession: ActionSession | null;
  obsCount: number;
  sessionCount: number;
  planGeneratedThisWeek: boolean;
}

export function QuickWinsCard({
  teamId,
  lastSession,
  obsCount,
  sessionCount,
  planGeneratedThisWeek,
}: QuickWinsCardProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  const [weeklyFocusSet, setWeeklyFocusSet] = useState(false);
  const [weeklyStarGeneratedThisWeek, setWeeklyStarGeneratedThisWeek] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check weekly focus (stored in localStorage by WeeklyFocusCard)
    try {
      const key = `weekly-focus:${teamId}`;
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.expiresAt && Date.now() < parsed.expiresAt) {
          setWeeklyFocusSet(true);
        }
      }
    } catch {
      // ignore
    }
    // Check weekly star (we consider "this week" = last 7 days; stored generation time)
    try {
      const key = `weekly-star-generated:${teamId}`;
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const ts = parseInt(raw, 10);
        if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000) {
          setWeeklyStarGeneratedThisWeek(true);
        }
      }
    } catch {
      // ignore
    }
  }, [teamId]);

  const { data: players = [] } = useQuery<ActionPlayer[]>({
    queryKey: ['quick-wins-roster', teamId],
    queryFn: () =>
      query<ActionPlayer[]>({
        table: 'players',
        select: 'id, name, jersey_number, parent_email, parent_phone',
        filters: { team_id: teamId, is_active: true },
      }).then((r) => r ?? []),
    enabled: hasSufficientDataForWins(obsCount, sessionCount),
    staleTime: 10 * 60 * 1000,
  });

  const allActions = useMemo(() => {
    if (!hasSufficientDataForWins(obsCount, sessionCount)) return [];
    return gatherAllActions({
      lastSession,
      players,
      obsCount,
      sessionCount,
      weeklyFocusSet,
      planGeneratedThisWeek,
      weeklyStarGeneratedThisWeek,
    });
  }, [
    lastSession,
    players,
    obsCount,
    sessionCount,
    weeklyFocusSet,
    planGeneratedThisWeek,
    weeklyStarGeneratedThisWeek,
  ]);

  const visibleActions = useMemo(() => {
    if (!mounted) return [];
    const undismissed = filterUndismissedActions(allActions, teamId).filter(
      (a) => !dismissed.has(a.type),
    );
    return selectTopActions(undismissed, 3);
  }, [allActions, teamId, dismissed, mounted]);

  if (!mounted || visibleActions.length === 0) return null;

  function handleDismiss(action: QuickWinAction) {
    dismissAction(action.type, teamId);
    setDismissed((prev) => new Set([...prev, action.type]));
  }

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
          Quick Wins
        </p>
        <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
          {visibleActions.length}
        </span>
      </div>

      <div className="space-y-2">
        {visibleActions.map((action) => (
          <div
            key={action.type}
            className="flex items-start gap-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-3"
          >
            <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden="true">
              {getActionIcon(action.type)}
            </span>
            <div className="flex-1 min-w-0">
              <Link
                href={action.href}
                className="text-sm font-semibold text-zinc-100 hover:text-emerald-300 transition-colors leading-snug block"
              >
                {action.title}
              </Link>
              <p className="text-xs text-zinc-500 mt-0.5 leading-snug">{action.subtitle}</p>
              <span className="mt-1 inline-block text-[10px] font-medium text-zinc-600">
                ~{formatEstimatedTime(action.estimatedSeconds)}
              </span>
            </div>
            <button
              onClick={() => handleDismiss(action)}
              aria-label={`Dismiss ${action.title}`}
              className="shrink-0 rounded-lg p-1 text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
