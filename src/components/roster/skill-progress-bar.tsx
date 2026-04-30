'use client';

import { cn } from '@/lib/utils';
import type { ProficiencyLevel, Trend } from '@/types/database';

interface SkillProgressBarProps {
  skillName: string;
  level: ProficiencyLevel;
  successRate: number | null;
  trend?: Trend | null;
}

const trendConfig: Record<string, { label: string; arrow: string; className: string }> = {
  improving: { label: 'Improving', arrow: '↑', className: 'text-emerald-400' },
  regressing: { label: 'Needs Work', arrow: '↓', className: 'text-red-400' },
  plateau: { label: 'Steady', arrow: '→', className: 'text-zinc-500' },
  new: { label: 'New', arrow: '✦', className: 'text-blue-400' },
};

const levelConfig: Record<
  ProficiencyLevel,
  { label: string; color: string; bgColor: string; textColor: string; minPercent: number }
> = {
  insufficient_data: {
    label: 'No Data',
    color: 'bg-zinc-600',
    bgColor: 'bg-zinc-800',
    textColor: 'text-zinc-400',
    minPercent: 0,
  },
  exploring: {
    label: 'Exploring',
    color: 'bg-amber-500',
    bgColor: 'bg-amber-500/10',
    textColor: 'text-amber-400',
    minPercent: 15,
  },
  practicing: {
    label: 'Practicing',
    color: 'bg-blue-500',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-400',
    minPercent: 35,
  },
  got_it: {
    label: 'Got It',
    color: 'bg-emerald-500',
    bgColor: 'bg-emerald-500/10',
    textColor: 'text-emerald-400',
    minPercent: 65,
  },
  game_ready: {
    label: 'Game Ready',
    color: 'bg-purple-500',
    bgColor: 'bg-purple-500/10',
    textColor: 'text-purple-400',
    minPercent: 85,
  },
};

export function SkillProgressBar({ skillName, level, successRate, trend }: SkillProgressBarProps) {
  const config = levelConfig[level];
  const percent = successRate !== null ? Math.round(successRate * 100) : config.minPercent;
  const tc = trend ? trendConfig[trend] : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-200">{skillName}</span>
        <div className="flex items-center gap-2">
          {tc && (
            <span className={cn('text-xs font-semibold', tc.className)}>
              {tc.arrow} {tc.label}
            </span>
          )}
          <span className={cn('text-xs font-semibold', config.textColor)}>{config.label}</span>
        </div>
      </div>
      <div className={cn('h-2 w-full overflow-hidden rounded-full', config.bgColor)}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', config.color)}
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
      {successRate !== null && (
        <p className="text-right text-[10px] text-zinc-500">{percent}% success rate</p>
      )}
    </div>
  );
}
