'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  formatReactionTime,
  buildDisplayName,
  countUnread,
  getRecentReactions,
} from '@/lib/parent-reaction-utils';
import { ThankParentSheet } from '@/components/parent-reactions/thank-parent-sheet';
import type { ParentReaction } from '@/types/database';

interface ReactionWithPlayer extends ParentReaction {
  players?: { name: string; nickname: string | null } | null;
}

interface ParentReactionsCardProps {
  teamId: string;
}

function firstNameOf(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

export function ParentReactionsCard({ teamId }: ParentReactionsCardProps) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const openReplyParam = searchParams?.get('openReply') ?? null;

  // Ticket 0056 — one-tap thank-you sheet. The active reaction is the row
  // whose Thank button was tapped (or the row named by ?openReply=).
  const [activeReactionId, setActiveReactionId] = useState<string | null>(null);
  // Optimistic reply bookmark — collapses the row to "Replied" without
  // waiting for the next /api/parent-reactions refetch.
  const [optimisticReplied, setOptimisticReplied] = useState<Record<string, string>>({});

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

  // Ticket 0056 — Monday rollup email's openReply deep-link. When the inbox
  // first renders for a reactionId present in `reactions`, auto-open the
  // sheet for that row. Effect runs once per (openReplyParam, reactions.length)
  // edge; never on every re-render.
  useEffect(() => {
    if (!openReplyParam) return;
    if (activeReactionId === openReplyParam) return;
    const found = reactions.find((r) => r.id === openReplyParam);
    if (!found) return;
    setActiveReactionId(openReplyParam);
  }, [openReplyParam, reactions, activeReactionId]);

  if (reactions.length === 0) return null;

  const unreadCount = countUnread(reactions);
  const recent = getRecentReactions(reactions, 30).slice(0, 3);

  const active = activeReactionId ? reactions.find((r) => r.id === activeReactionId) ?? null : null;

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
          const parentFirst = firstNameOf(r.parent_name);
          const replied = Boolean(r.coach_reply_at) || optimisticReplied[r.id];
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
                {/* Ticket 0056 — Thank <parent> CTA on each unreplied reaction
                    with a message OR a parent_name we can address. */}
                {!replied && parentFirst.length > 0 && r.message && (
                  <Button
                    variant="ghost"
                    onClick={() => setActiveReactionId(r.id)}
                    className="mt-1.5 h-9 px-2.5 text-xs text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
                  >
                    Thank {parentFirst}
                  </Button>
                )}
                {replied && (
                  <span
                    data-testid={`reaction-replied-pill-${r.id}`}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
                  >
                    <Check className="h-3 w-3" /> Replied
                  </span>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-zinc-600">
                {formatReactionTime(r.created_at)}
              </span>
            </div>
          );
        })}
      </CardContent>
      {active && (
        <ThankParentSheet
          open
          reactionId={active.id}
          parentFirstName={firstNameOf(active.parent_name) || 'there'}
          playerFirstName={
            firstNameOf(
              (active as ReactionWithPlayer).players?.nickname ||
                (active as ReactionWithPlayer).players?.name ||
                null,
            ) || 'your kid'
          }
          onClose={() => setActiveReactionId(null)}
          onSent={({ coach_reply_id }) => {
            setOptimisticReplied((prev) => ({ ...prev, [active.id]: coach_reply_id }));
            setActiveReactionId(null);
            queryClient.invalidateQueries({ queryKey: ['parent-reactions', teamId] });
          }}
        />
      )}
    </Card>
  );
}
