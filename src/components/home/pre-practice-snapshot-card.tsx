'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { formatSkillLabel } from '@/lib/skill-trend-utils';
import { Eye, Target } from 'lucide-react';
import Link from 'next/link';

interface PrePracticeSnapshotCardProps {
  teamId: string;
  sessionId?: string;
}

// Maps observation category to drill library filter category
const CATEGORY_TO_DRILL: Record<string, string> = {
  dribbling: 'Ball Handling',
  defense: 'Defense',
  passing: 'Passing',
  shooting: 'Shooting',
  rebounding: 'Rebounding',
  teamwork: 'Team Play',
  hustle: 'Conditioning',
  footwork: 'Conditioning',
  awareness: 'Defense',
  leadership: 'Team Play',
};

export function PrePracticeSnapshotCard({
  teamId,
  sessionId,
}: PrePracticeSnapshotCardProps) {
  const since14d = useMemo(
    () => new Date(Date.now() - 14 * 86_400_000).toISOString(),
    []
  );

  const { data: recentObs } = useQuery({
    queryKey: ['pre-practice-obs', teamId],
    queryFn: async () =>
      query<{ category: string | null; sentiment: string | null; player_id: string | null }[]>({
        table: 'observations',
        select: 'category, sentiment, player_id',
        filters: {
          team_id: teamId,
          created_at: { op: 'gte', value: since14d },
        },
      }).then((r) => r ?? []),
    staleTime: 5 * 60_000,
    enabled: !!teamId,
  });

  const { data: rosterPlayers = [] } = useQuery({
    queryKey: ['pre-practice-roster', teamId],
    queryFn: () =>
      query<{ id: string; name: string }[]>({
        table: 'players',
        select: 'id, name',
        filters: { team_id: teamId, is_active: true },
      }).then((r) => r ?? []),
    staleTime: 10 * 60_000,
    enabled: !!teamId,
  });

  const snapshot = useMemo(() => {
    if (!recentObs || recentObs.length < 5 || !rosterPlayers.length) return null;

    // Top skill gap: most common needs-work category (excluding 'general')
    const gapMap: Record<string, number> = {};
    for (const o of recentObs) {
      if (o.sentiment === 'needs-work' && o.category && o.category !== 'general') {
        gapMap[o.category] = (gapMap[o.category] ?? 0) + 1;
      }
    }
    const topGapEntry = Object.entries(gapMap).sort((a, b) => b[1] - a[1])[0] ?? null;

    // Neglected players: on roster but not observed in last 14 days
    const observedIds = new Set(
      recentObs.filter((o) => o.player_id).map((o) => o.player_id as string)
    );
    const neglected = rosterPlayers
      .filter((p) => !observedIds.has(p.id))
      .slice(0, 3)
      .map((p) => p.name.split(' ')[0]);

    if (!topGapEntry && neglected.length === 0) return null;

    const topGap = topGapEntry
      ? {
          category: topGapEntry[0],
          count: topGapEntry[1],
          label: formatSkillLabel(topGapEntry[0]),
          drillHref: CATEGORY_TO_DRILL[topGapEntry[0]]
            ? `/drills?category=${encodeURIComponent(CATEGORY_TO_DRILL[topGapEntry[0]])}`
            : '/drills',
        }
      : null;

    return { topGap, neglected };
  }, [recentObs, rosterPlayers]);

  if (!snapshot) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Quick coaching brief
      </p>

      <div className="flex flex-wrap gap-2">
        {snapshot.topGap && (
          <Link
            href={snapshot.topGap.drillHref}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors active:scale-95 touch-manipulation"
          >
            <Target className="h-3 w-3 shrink-0" />
            Focus: {snapshot.topGap.label}
            <span className="text-amber-500/70">({snapshot.topGap.count}×)</span>
          </Link>
        )}

        {snapshot.neglected.length > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">
            <Eye className="h-3 w-3 shrink-0 text-zinc-500" />
            Watch:{' '}
            <span className="text-zinc-200 font-medium">
              {snapshot.neglected.join(', ')}
            </span>
            <span className="text-zinc-600 ml-1">· 14d unobserved</span>
          </div>
        )}
      </div>

      {sessionId && (
        <Link
          href={`/sessions/${sessionId}`}
          className="text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
        >
          Full AI brief →
        </Link>
      )}
    </div>
  );
}
