'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { query, mutate } from '@/lib/api';
import { Dumbbell, ChevronRight, X, Target, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  selectDrillOfDay,
  hasEnoughDataForDrillOfDay,
  getDrillCategoryLabel,
  getDrillDurationLabel,
  getDrillCues,
  getDrillPlayerCountLabel,
  buildDrillDismissKey,
  buildDrillViewUrl,
} from '@/lib/drill-of-day-utils';
import { getWeeklyFocus } from '@/lib/weekly-focus-utils';
import { useActiveTeam } from '@/hooks/use-active-team';
import type { Drill } from '@/types/database';

interface DrillOfDayCardProps {
  teamId: string;
  sportId: string;
}

interface ObsRow {
  category: string | null;
  sentiment: string;
}

function computeTopNeedsWorkCategory(obs: ObsRow[]): string | null {
  const counts = new Map<string, number>();
  for (const o of obs) {
    if (o.sentiment === 'needs-work' && o.category) {
      counts.set(o.category, (counts.get(o.category) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  let topCat = '';
  let topCount = 0;
  for (const [cat, count] of counts) {
    if (count > topCount) {
      topCat = cat;
      topCount = count;
    }
  }
  return topCat || null;
}

export function DrillOfDayCard({ teamId, sportId }: DrillOfDayCardProps) {
  const today = useMemo(() => new Date(), []);
  const [dismissed, setDismissed] = useState(false);
  const [weeklyFocusCategory, setWeeklyFocusCategory] = useState<string | null>(null);
  const [startingPractice, setStartingPractice] = useState(false);

  const router = useRouter();
  const { activeTeam, coach } = useActiveTeam();

  useEffect(() => {
    try {
      const key = buildDrillDismissKey(teamId, today.toISOString().split('T')[0]);
      if (localStorage.getItem(key) === '1') setDismissed(true);
    } catch {}
    try {
      const focus = getWeeklyFocus(teamId);
      setWeeklyFocusCategory(focus?.category ?? null);
    } catch {}
  }, [teamId, today]);

  const cutoff = useMemo(() => {
    return new Date(Date.now() - 30 * 86_400_000).toISOString();
  }, []);

  const { data: drills = [] } = useQuery<Drill[]>({
    queryKey: ['drills-for-dotd', sportId],
    queryFn: () =>
      query<Drill[]>({
        table: 'drills',
        select: 'id, name, description, category, duration_minutes, player_count_min, player_count_max, teaching_cues, source',
        filters: { sport_id: sportId },
        order: { column: 'name', ascending: true },
      }).then((r) => r ?? []),
    staleTime: 30 * 60_000,
  });

  const { data: recentObs = [] } = useQuery<ObsRow[]>({
    queryKey: ['dotd-obs', teamId, cutoff],
    queryFn: () =>
      query<ObsRow[]>({
        table: 'observations',
        select: 'category, sentiment',
        filters: {
          team_id: teamId,
          sentiment: 'needs-work',
          created_at: { op: 'gte', value: cutoff },
        },
        limit: 300,
      }).then((r) => r ?? []),
    staleTime: 5 * 60_000,
    enabled: drills.length > 0,
  });

  const { topCategory, drill } = useMemo(() => {
    const topCat = computeTopNeedsWorkCategory(recentObs);
    if (!hasEnoughDataForDrillOfDay(topCat, drills.length)) {
      return { topCategory: null, drill: null };
    }
    return {
      topCategory: topCat,
      drill: selectDrillOfDay(drills, topCat!, teamId, today),
    };
  }, [drills, recentObs, teamId, today]);

  const matchesFocus = !!(topCategory && weeklyFocusCategory && topCategory === weeklyFocusCategory);

  async function handleRunDrill() {
    if (!activeTeam || !coach || !drill || startingPractice) return;
    setStartingPractice(true);
    try {
      const session = await mutate<{ id: string }>({
        table: 'sessions',
        operation: 'insert',
        data: {
          team_id: activeTeam.id,
          coach_id: coach.id,
          type: 'practice',
          date: new Date().toISOString().split('T')[0],
          notes: `Auto-created: ${drill.name}`,
        },
        select: 'id',
      });
      const id = Array.isArray(session) ? (session as any)[0]?.id : (session as any)?.id;
      if (id) {
        router.push(`/sessions/${id}/timer?drillId=${drill.id}`);
      } else {
        setStartingPractice(false);
      }
    } catch {
      setStartingPractice(false);
    }
  }

  function handleDismiss() {
    try {
      localStorage.setItem(
        buildDrillDismissKey(teamId, today.toISOString().split('T')[0]),
        '1'
      );
    } catch {}
    setDismissed(true);
  }

  if (dismissed || !drill || !topCategory) return null;

  const cues = getDrillCues(drill, 2);
  const duration = getDrillDurationLabel(drill.duration_minutes);
  const playerCount = getDrillPlayerCountLabel(drill.player_count_min, drill.player_count_max);
  const categoryLabel = getDrillCategoryLabel(topCategory);
  const viewUrl = buildDrillViewUrl(topCategory);

  return (
    <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/15">
            <Dumbbell className="h-4 w-4 text-teal-400" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-400">
              Drill of the Day
            </p>
            <p className="text-[10px] text-zinc-500">
              Top gap: <span className="text-zinc-400">{categoryLabel}</span>
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-zinc-600 hover:text-zinc-400 transition-colors p-1"
          aria-label="Dismiss drill of the day"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div>
        <div className="flex items-start gap-2 flex-wrap">
          <p className="text-base font-bold text-zinc-100 leading-snug">{drill.name}</p>
          {matchesFocus && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/20 shrink-0 mt-0.5">
              <Target className="h-2.5 w-2.5" />
              Matches your focus
            </span>
          )}
        </div>
        {drill.description && (
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{drill.description}</p>
        )}
      </div>

      {cues.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            Key coaching cues
          </p>
          {cues.map((cue, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="mt-0.5 text-teal-500">›</span>
              <p className="text-xs text-zinc-300">{cue}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px] text-zinc-500">
        {duration && <span>⏱ {duration}</span>}
        <span>👥 {playerCount}</span>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          onClick={handleRunDrill}
          disabled={startingPractice || !coach}
          className="w-full h-9 gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold"
        >
          {startingPractice ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Starting practice…
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Start Practice with This Drill
            </>
          )}
        </Button>
        <Link href={viewUrl} className="text-center text-[11px] text-zinc-500 hover:text-teal-400 transition-colors flex items-center justify-center gap-1">
          See all {categoryLabel} drills
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
