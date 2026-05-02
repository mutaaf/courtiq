'use client';

import { useQuery } from '@tanstack/react-query';
import { Flame, Zap } from 'lucide-react';
import Link from 'next/link';
import {
  getNextMilestone,
  streakPercentToNextMilestone,
  getDaysToNextMilestone,
  isNewRecord,
  getEarnedMilestones,
  getStreakMessage,
  type StreakData,
} from '@/lib/streak-utils';

interface StreakCardProps {
  teamId: string;
  observationCount: number;
}

export function StreakCard({ teamId, observationCount }: StreakCardProps) {
  const { data } = useQuery<StreakData>({
    queryKey: ['coaching-streak', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/streak?team_id=${teamId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: observationCount > 0,
    staleTime: 5 * 60 * 1000,
  });

  if (observationCount === 0 || !data) return null;
  if (data.currentStreak === 0 && !data.lastActivityDate) return null;

  const nextMilestone = getNextMilestone(data.currentStreak);
  const pct = streakPercentToNextMilestone(data.currentStreak);
  const daysToNext = getDaysToNextMilestone(data.currentStreak);
  const newRecord = isNewRecord(data.currentStreak, data.longestStreak);
  const earned = getEarnedMilestones(data.currentStreak);
  const message = getStreakMessage(data.currentStreak, data.atRisk);

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 ${
        data.atRisk
          ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-zinc-800 bg-zinc-900/50'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              data.atRisk ? 'bg-amber-500/20' : 'bg-orange-500/20'
            }`}
          >
            <Flame
              className={`h-5 w-5 ${
                data.atRisk ? 'text-amber-400 animate-pulse' : 'text-orange-400'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-zinc-100">
                {data.currentStreak}
              </span>
              <span className="text-sm text-zinc-400">day streak</span>
              {newRecord && data.currentStreak > 1 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                  Best!
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500">{message}</p>
          </div>
        </div>
        {data.todayHasActivity && (
          <span className="text-lg" aria-label="Active today">
            ✅
          </span>
        )}
      </div>

      {/* Progress bar to next milestone */}
      {nextMilestone && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-500">
              {daysToNext} day{daysToNext !== 1 ? 's' : ''} to{' '}
              {nextMilestone.icon} {nextMilestone.label}
            </span>
            <span className="text-[11px] text-zinc-600">{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all ${
                data.atRisk ? 'bg-amber-500' : 'bg-orange-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Earned milestone badges */}
      {earned.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {earned.map((m) => (
            <span
              key={m.days}
              className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"
            >
              {m.icon} {m.label}
            </span>
          ))}
        </div>
      )}

      {/* At-risk CTA — one tap to keep the streak alive */}
      {data.atRisk && (
        <Link
          href="/capture?source=streak"
          className="flex items-center justify-center gap-2 w-full rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/20 active:scale-[0.97] transition-all touch-manipulation"
        >
          <Zap className="h-4 w-4 shrink-0" />
          Observe a player — keep your streak!
        </Link>
      )}
    </div>
  );
}
