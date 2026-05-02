'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { TrendingUp, TrendingDown, Loader2, AlertCircle, Dumbbell } from 'lucide-react';
import {
  buildSkillTrends,
  getTopImprovingSkills,
  getTopDecliningSkills,
  hasEnoughDataForTrends,
  formatTrendDelta,
  type ObsSlice,
} from '@/lib/skill-trend-utils';

interface ObsWithDate extends ObsSlice {
  created_at?: string;
}

interface TeamSkillTrendsCardProps {
  teamId: string;
}

export function TeamSkillTrendsCard({ teamId }: TeamSkillTrendsCardProps) {
  const router = useRouter();
  const [generatingSkill, setGeneratingSkill] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  async function handleBuildPlan(skillLabel: string) {
    if (generatingSkill) return;
    setGeneratingSkill(skillLabel);
    setGenError(null);
    try {
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, type: 'practice', focusSkills: [skillLabel] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Failed to generate plan');
      }
      router.push('/plans');
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGeneratingSkill(null);
    }
  }

  const { cutoff14, cutoff7 } = useMemo(() => {
    const now = Date.now();
    return {
      cutoff14: new Date(now - 14 * 86_400_000).toISOString(),
      cutoff7: new Date(now - 7 * 86_400_000).toISOString(),
    };
  }, []);

  const { data: rawObs = [] } = useQuery<ObsWithDate[]>({
    queryKey: ['skill-trends-obs', teamId, cutoff14],
    queryFn: () =>
      query<ObsWithDate[]>({
        table: 'observations',
        select: 'sentiment, category, created_at',
        filters: {
          team_id: teamId,
          created_at: { op: 'gte', value: cutoff14 },
        },
        order: { column: 'created_at', ascending: false },
        limit: 300,
      }).then((r) => r ?? []),
    staleTime: 5 * 60_000,
  });

  const { improving, declining, hasData } = useMemo(() => {
    const recentObs: ObsSlice[] = rawObs
      .filter((o) => !!o.created_at && o.created_at >= cutoff7)
      .map(({ category, sentiment }) => ({ category, sentiment }));

    const priorObs: ObsSlice[] = rawObs
      .filter((o) => !!o.created_at && o.created_at < cutoff7)
      .map(({ category, sentiment }) => ({ category, sentiment }));

    if (!hasEnoughDataForTrends(recentObs, priorObs, 5)) {
      return { improving: [], declining: [], hasData: false };
    }

    const trends = buildSkillTrends(recentObs, priorObs);
    const imp = getTopImprovingSkills(trends, 3, 2);
    const dec = getTopDecliningSkills(trends, 3, 2);

    return {
      improving: imp,
      declining: dec,
      hasData: imp.length > 0 || dec.length > 0,
    };
  }, [rawObs, cutoff7]);

  if (!hasData) return null;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Team Skills This Week
        </p>
        <span className="text-[10px] text-zinc-600">vs last week</span>
      </div>

      <div className="space-y-3">
        {improving.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">Improving</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {improving.map((t) => (
                <span
                  key={t.category}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300"
                >
                  {t.label}
                  <span className="text-[10px] font-bold text-emerald-500">
                    {formatTrendDelta(t.delta)}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    ({t.recentCount})
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {declining.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-red-400" />
              <span className="text-xs font-medium text-red-400">Needs attention</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {declining.map((t) => {
                const isGenerating = generatingSkill === t.label;
                return (
                  <button
                    key={t.category}
                    onClick={() => handleBuildPlan(t.label)}
                    disabled={!!generatingSkill}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/20 active:scale-95 transition-all touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed"
                    title={`Build a ${t.label} practice plan`}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Dumbbell className="h-2.5 w-2.5 opacity-60" />
                    )}
                    {t.label}
                    <span className="text-[10px] font-bold text-red-500">
                      {formatTrendDelta(t.delta)}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      ({t.recentCount})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {genError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
          <p className="text-xs text-red-400">{genError}</p>
        </div>
      )}

      {declining.length > 0 && !genError && (
        <p className="text-[11px] text-zinc-600 leading-relaxed">
          Tap a declining skill to instantly build a targeted practice plan.
        </p>
      )}
    </div>
  );
}
