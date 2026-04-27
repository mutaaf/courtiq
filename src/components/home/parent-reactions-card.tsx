'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  formatReactionTime,
  buildDisplayName,
  countUnread,
  getRecentReactions,
} from '@/lib/parent-reaction-utils';
import type { ParentReaction } from '@/types/database';

interface ReactionWithPlayer extends ParentReaction {
  players?: { name: string; nickname: string | null } | null;
}

interface ParentReactionsCardProps {
  teamId: string;
}

export function ParentReactionsCard({ teamId }: ParentReactionsCardProps) {
  const queryClient = useQueryClient();

  const { data } = useQuery<{ reactions: ReactionWithPlayer[] }>({
    queryKey: ['parent-reactions', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/parent-reactions?team_id=${teamId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch(`/api/parent-reactions?team_id=${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parent-reactions', teamId] });
    },
  });

  const reactions = data?.reactions ?? [];
  if (reactions.length === 0) return null;

  const unreadCount = countUnread(reactions);
  const recent = getRecentReactions(reactions, 30).slice(0, 3);

  return (
    <Card className="border-pink-500/20 bg-pink-500/5">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <div className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-pink-400" />
            Parent Messages
            {unreadCount > 0 && (
              <span className="rounded-full bg-pink-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors touch-manipulation"
            >
              Mark read
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2.5">
        {recent.map((r) => {
          const rWithPlayer = r as ReactionWithPlayer;
          const playerName = rWithPlayer.players?.nickname || rWithPlayer.players?.name || null;
          const senderName = buildDisplayName(r);
          return (
            <div
              key={r.id}
              className={`flex items-start gap-2.5 rounded-xl p-2.5 ${
                !r.is_read ? 'bg-pink-500/10' : 'bg-zinc-900/50'
              }`}
            >
              <span className="text-xl leading-none mt-0.5">{r.reaction}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200">
                  <span className="font-medium">{senderName}</span>
                  {playerName && (
                    <span className="text-zinc-400"> for {playerName}</span>
                  )}
                </p>
                {r.message && (
                  <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">
                    &ldquo;{r.message}&rdquo;
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-zinc-600">
                {formatReactionTime(r.created_at)}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
