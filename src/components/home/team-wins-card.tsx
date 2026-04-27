'use client';

import { useQuery } from '@tanstack/react-query';
import { Trophy, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTimeAgo, type TeamWin } from '@/lib/team-wins-utils';
import Link from 'next/link';

interface TeamWinsCardProps {
  teamId: string;
}

function WinRow({ win }: { win: TeamWin }) {
  const timeAgo = formatTimeAgo(win.type === 'badge' ? win.earned_at : win.achieved_at);

  if (win.type === 'badge') {
    return (
      <div className="flex items-start gap-3 py-2.5 border-b border-zinc-800/60 last:border-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-base">
          <Trophy className="h-4 w-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200">
            <span className="font-semibold">{win.player_name}</span>
            {win.player_jersey != null && (
              <span className="ml-1 text-zinc-500 text-xs">#{win.player_jersey}</span>
            )}{' '}
            earned{' '}
            <span className="text-amber-400">{win.badge_name}</span>
          </p>
          {win.note && (
            <p className="text-xs text-zinc-500 mt-0.5 truncate">{win.note}</p>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-zinc-600">{timeAgo}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-zinc-800/60 last:border-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
        <Target className="h-4 w-4 text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200">
          <span className="font-semibold">{win.player_name}</span>
          {win.player_jersey != null && (
            <span className="ml-1 text-zinc-500 text-xs">#{win.player_jersey}</span>
          )}{' '}
          achieved a goal
        </p>
        <p className="text-xs text-zinc-500 mt-0.5 truncate">{win.goal_text}</p>
      </div>
      <span className="shrink-0 text-[11px] text-zinc-600">{timeAgo}</span>
    </div>
  );
}

export function TeamWinsCard({ teamId }: TeamWinsCardProps) {
  const { data } = useQuery<{ wins: TeamWin[] }>({
    queryKey: ['team-wins', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/team-wins?team_id=${teamId}&days=14`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const wins = data?.wins ?? [];
  if (wins.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <span>🎉</span> Team Wins — Last 14 Days
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {wins.slice(0, 5).map((win, i) => (
          <WinRow key={i} win={win} />
        ))}
        {wins.length > 5 && (
          <Link href="/roster" className="block pt-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            +{wins.length - 5} more wins · View roster →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
