'use client';

import { use } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Clock,
  Users,
  Dumbbell,
  ListChecks,
  Settings2,
  PackageOpen,
  Video,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import type { Drill } from '@/types/database';

export default function DrillDetailPage({
  params,
}: {
  params: Promise<{ drillId: string }>;
}) {
  const { drillId } = use(params);
  const { activeTeam } = useActiveTeam();

  const { data: drill, isLoading } = useQuery({
    queryKey: queryKeys.drills.detail(drillId),
    queryFn: async () => {
      const data = await query<Drill>({
        table: 'drills',
        select: '*',
        filters: { id: drillId },
        single: true,
      });
      return data;
    },
    ...CACHE_PROFILES.drills,
  });

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-9 w-2/3 rounded-lg" />
        <Skeleton className="h-5 w-32 rounded-full" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!drill) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[60vh] text-center">
        <Dumbbell className="h-12 w-12 text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold text-zinc-200">Drill not found</h2>
        <p className="text-zinc-500 text-sm mt-1">This drill may have been removed.</p>
        <Link href="/drills" className="mt-6">
          <Button variant="outline">Back to Drills</Button>
        </Link>
      </div>
    );
  }

  const playerCountText =
    drill.player_count_max
      ? `${drill.player_count_min}–${drill.player_count_max} players`
      : `${drill.player_count_min}+ players`;

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-5 pb-24">
      {/* Back nav */}
      <Link
        href="/drills"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Drills Library
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="capitalize text-xs">
            {drill.category}
          </Badge>
          {drill.source !== 'seeded' && (
            <Badge variant="outline" className="text-xs capitalize">
              {drill.source}
            </Badge>
          )}
        </div>
        <h1 className="text-2xl font-bold text-zinc-100 leading-tight">{drill.name}</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">{drill.description}</p>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-3 gap-3">
        {drill.duration_minutes && (
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <Clock className="h-5 w-5 text-orange-400" />
            <span className="text-lg font-bold text-zinc-100">{drill.duration_minutes}</span>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide">minutes</span>
          </div>
        )}
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <Users className="h-5 w-5 text-blue-400" />
          <span className="text-sm font-bold text-zinc-100 leading-tight">{playerCountText}</span>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">players</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <Dumbbell className="h-5 w-5 text-emerald-400" />
          <span className="text-sm font-bold text-zinc-100 leading-tight">
            {drill.age_groups.length > 0 ? drill.age_groups[0] : 'All ages'}
          </span>
          {drill.age_groups.length > 1 && (
            <span className="text-[10px] text-zinc-500">+{drill.age_groups.length - 1} more</span>
          )}
          {drill.age_groups.length <= 1 && (
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide">age group</span>
          )}
        </div>
      </div>

      {/* Age groups (full list) */}
      {drill.age_groups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {drill.age_groups.map((ag) => (
            <span
              key={ag}
              className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400"
            >
              {ag}
            </span>
          ))}
        </div>
      )}

      {/* Equipment */}
      {drill.equipment && drill.equipment.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <PackageOpen className="h-4 w-4 text-amber-400" />
              Equipment Needed
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              {drill.equipment.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-sm text-zinc-300"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  {item}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Setup Instructions */}
      {drill.setup_instructions && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-purple-400" />
              Setup
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
              {drill.setup_instructions}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Teaching Cues */}
      {drill.teaching_cues && drill.teaching_cues.length > 0 && (
        <Card className="border-orange-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-orange-400" />
              Coaching Cues
              <Badge variant="secondary" className="text-[10px] ml-auto">
                Say these during the drill
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {drill.teaching_cues.map((cue, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-xs font-bold text-orange-400">
                  {idx + 1}
                </span>
                <p className="text-sm text-zinc-200 leading-relaxed pt-0.5">{cue}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Video */}
      {drill.video_url && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Video className="h-4 w-4 text-blue-400" />
              Demo Video
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <a
              href={drill.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-blue-400 hover:border-blue-500/40 hover:text-blue-300 transition-colors w-full"
            >
              <Video className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">Watch demo video</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </a>
          </CardContent>
        </Card>
      )}

      {/* CTA — generate a practice plan using this drill */}
      <div className="fixed bottom-0 left-0 right-0 lg:static lg:pt-2 p-4 lg:p-0 bg-zinc-950/95 lg:bg-transparent backdrop-blur-sm lg:backdrop-blur-none border-t border-zinc-800 lg:border-0">
        <Link href={`/plans?drill=${encodeURIComponent(drill.name)}`} className="block">
          <Button className="w-full h-12 lg:h-10 text-base lg:text-sm gap-2">
            <Dumbbell className="h-5 w-5 lg:h-4 lg:w-4" />
            Use in a Practice Plan
          </Button>
        </Link>
      </div>
    </div>
  );
}
