'use client';

import { useQuery } from '@tanstack/react-query';
import { Trophy, Target, Flame, Share2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTimeAgo, getStreakEmoji, getStreakLabel, buildStreakShareText, type TeamWin } from '@/lib/team-wins-utils';
import Link from 'next/link';
import { useActiveTeam } from '@/hooks/use-active-team';

interface TeamWinsCardProps {
  teamId: string;
}

function WinRow({ win, teamName }: { win: TeamWin; teamName: string }) {
  const timeAgo = formatTimeAgo(
    win.type === 'badge' ? win.earned_at :
    win.type === 'goal' ? win.achieved_at :
    win.streak_at
  );

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

  if (win.type === 'goal') {
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

  // streak win
  const emoji = getStreakEmoji(win.streak);
  const shareText = buildStreakShareText(win.player_name, win.streak, teamName);

  function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ text: shareText }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(shareText).catch(() => {});
    }
  }

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-zinc-800/60 last:border-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-base select-none">
        <Flame className="h-4 w-4 text-orange-400" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200">
          <span className="font-semibold">{win.player_name}</span>
          {win.player_jersey != null && (
            <span className="ml-1 text-zinc-500 text-xs">#{win.player_jersey}</span>
          )}{' '}
          <span className="text-orange-400">{emoji} {getStreakLabel(win.streak)}</span>
        </p>
        <button
          onClick={handleShare}
          className="mt-1 flex items-center gap-1 text-xs text-zinc-500 hover:text-orange-400 transition-colors touch-manipulation"
          aria-label={`Share ${win.player_name}'s streak with parent`}
        >
          <Share2 className="h-3 w-3" aria-hidden />
          Share with parent
        </button>
      </div>
      <span className="shrink-0 text-[11px] text-zinc-600">{timeAgo}</span>
    </div>
  );
}

export function TeamWinsCard({ teamId }: TeamWinsCardProps) {
  const { activeTeam } = useActiveTeam();
  const teamName = activeTeam?.name ?? 'the team';

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
          <WinRow key={i} win={win} teamName={teamName} />
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
