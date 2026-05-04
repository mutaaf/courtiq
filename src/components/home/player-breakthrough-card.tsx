'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Rocket, X, Share2, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { query } from '@/lib/api';
import {
  buildBreakthroughs,
  buildBreakthroughShareText,
  buildBreakthroughWhatsAppUrl,
  buildPriorLabel,
  buildRecentLabel,
  dismissBreakthrough,
  formatCategory,
  getBestBreakthrough,
  hasEnoughDataForBreakthroughs,
  isBreakthroughDismissed,
  PRIOR_DAYS,
  type BTObs,
} from '@/lib/player-breakthrough-utils';

interface RosterPlayer {
  id: string;
  name: string;
  jersey_number: number | null;
  parent_phone?: string | null;
}

interface PlayerBreakthroughCardProps {
  teamId: string;
  coachName?: string;
}

export function PlayerBreakthroughCard({
  teamId,
  coachName,
}: PlayerBreakthroughCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [shared, setShared] = useState(false);

  const cutoff = useMemo(
    () => new Date(Date.now() - PRIOR_DAYS * 86_400_000).toISOString(),
    []
  );

  const { data: rawObs = [] } = useQuery<BTObs[]>({
    queryKey: ['breakthrough-obs', teamId, cutoff],
    queryFn: () =>
      query<BTObs[]>({
        table: 'observations',
        select: 'player_id, sentiment, category, created_at',
        filters: {
          team_id: teamId,
          created_at: { op: 'gte', value: cutoff },
        },
        order: { column: 'created_at', ascending: false },
        limit: 400,
      }).then((r) => r ?? []),
    staleTime: 15 * 60_000,
  });

  const { data: players = [] } = useQuery<RosterPlayer[]>({
    queryKey: ['roster-names-bt', teamId],
    queryFn: () =>
      query<RosterPlayer[]>({
        table: 'players',
        select: 'id, name, jersey_number, parent_phone',
        filters: { team_id: teamId },
      }).then((r) => r ?? []),
    staleTime: 30 * 60_000,
  });

  const bestBreakthrough = useMemo(() => {
    if (!hasEnoughDataForBreakthroughs(rawObs)) return null;
    const bts = buildBreakthroughs(rawObs);
    return getBestBreakthrough(
      bts.filter((b) => !isBreakthroughDismissed(teamId, b.player_id, b.category))
    );
  }, [rawObs, teamId]);

  const player = useMemo(
    () => players.find((p) => p.id === bestBreakthrough?.player_id) ?? null,
    [players, bestBreakthrough]
  );

  if (!bestBreakthrough || !player || dismissed) return null;

  const { category, priorNeedsWork, recentPositive } = bestBreakthrough;
  const shareText = buildBreakthroughShareText(player.name, category, coachName);
  const whatsappUrl = buildBreakthroughWhatsAppUrl(shareText, player.parent_phone ?? undefined);

  function handleDismiss() {
    dismissBreakthrough(teamId, player!.id, category);
    setDismissed(true);
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
        setShared(true);
        setTimeout(() => setShared(false), 2500);
        return;
      } catch {
        // fall through to WhatsApp
      }
    }
    window.open(whatsappUrl, '_blank', 'noopener');
    setShared(true);
    setTimeout(() => setShared(false), 2500);
  }

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
          <Rocket className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Coaching Win
          </p>
          <p className="text-sm font-bold text-zinc-100 mt-0.5 leading-snug">
            {player.name}
            {player.jersey_number != null && (
              <span className="ml-1.5 text-zinc-400 font-normal text-xs">
                #{player.jersey_number}
              </span>
            )}{' '}
            is breaking through in{' '}
            <span className="text-emerald-400">{formatCategory(category)}</span>!
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-md p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
          aria-label="Dismiss breakthrough card"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Signal strip */}
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-red-300 font-medium">
          {buildPriorLabel(priorNeedsWork)}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-300 font-medium">
          {buildRecentLabel(recentPositive)}
        </span>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-white active:scale-[0.97] touch-manipulation transition-all"
          aria-label={`Share ${player.name}'s breakthrough with their parent`}
        >
          {shared ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Sent!
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4" />
              Tell Their Parent
            </>
          )}
        </button>
        <Link
          href={`/roster/${player.id}`}
          className="flex items-center gap-1 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-600 transition-colors touch-manipulation"
        >
          View Player
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
