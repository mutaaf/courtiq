'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Share2, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { query } from '@/lib/api';
import {
  groupObsBySession,
  sortBucketsDesc,
  calculateCurrentStreak,
  buildGrowthStreakData,
  buildParentMessage,
  getStreakEmoji,
  getStreakLabel,
  type GrowthObs,
} from '@/lib/player-growth-streak-utils';

interface RollObs {
  player_id: string | null;
  session_id: string | null;
  sentiment: string;
  created_at: string;
}

interface RosterPlayer {
  id: string;
  name: string;
  jersey_number: number | null;
  parent_phone?: string | null;
}

interface PlayerOnARollCardProps {
  teamId: string;
}

function getWeekKey(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}

function getDismissKey(teamId: string, playerId: string): string {
  return `sportsiq-on-a-roll-${teamId}-${playerId}-${getWeekKey()}`;
}

function isDismissed(teamId: string, playerId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(getDismissKey(teamId, playerId)) === '1';
}

function doDismisc(teamId: string, playerId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(getDismissKey(teamId, playerId), '1');
  }
}

const MIN_STREAK = 3;
const OBS_CUTOFF_DAYS = 60;

export function PlayerOnARollCard({ teamId }: PlayerOnARollCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [shared, setShared] = useState(false);

  const cutoff = useMemo(
    () => new Date(Date.now() - OBS_CUTOFF_DAYS * 86_400_000).toISOString(),
    []
  );

  const { data: rawObs = [] } = useQuery<RollObs[]>({
    queryKey: ['roll-obs', teamId, cutoff],
    queryFn: () =>
      query<RollObs[]>({
        table: 'observations',
        select: 'player_id, session_id, sentiment, created_at',
        filters: {
          team_id: teamId,
          created_at: { op: 'gte', value: cutoff },
          player_id: { op: 'neq', value: null },
        },
        order: { column: 'created_at', ascending: false },
        limit: 500,
      }).then((r) => r ?? []),
    staleTime: 15 * 60_000,
  });

  const { data: players = [] } = useQuery<RosterPlayer[]>({
    queryKey: ['roster-names-roll', teamId],
    queryFn: () =>
      query<RosterPlayer[]>({
        table: 'players',
        select: 'id, name, jersey_number, parent_phone',
        filters: { team_id: teamId },
      }).then((r) => r ?? []),
    staleTime: 30 * 60_000,
  });

  // Find the player with the highest current streak >= MIN_STREAK
  const topStreaker = useMemo(() => {
    if (rawObs.length < MIN_STREAK) return null;

    const byPlayer = new Map<string, GrowthObs[]>();
    for (const obs of rawObs) {
      if (!obs.player_id) continue;
      const growthObs: GrowthObs = {
        session_id: obs.session_id,
        sentiment: obs.sentiment,
        created_at: obs.created_at,
      };
      const existing = byPlayer.get(obs.player_id);
      if (existing) existing.push(growthObs);
      else byPlayer.set(obs.player_id, [growthObs]);
    }

    let best: { playerId: string; streak: number } | null = null;
    for (const [playerId, playerObs] of byPlayer) {
      if (isDismissed(teamId, playerId)) continue;
      const buckets = sortBucketsDesc(groupObsBySession(playerObs));
      const streak = calculateCurrentStreak(buckets);
      if (streak >= MIN_STREAK && (!best || streak > best.streak)) {
        best = { playerId, streak };
      }
    }

    return best;
  }, [rawObs, teamId]);

  const player = useMemo(
    () => players.find((p) => p.id === topStreaker?.playerId) ?? null,
    [players, topStreaker]
  );

  if (!topStreaker || !player || dismissed) return null;

  const { streak } = topStreaker;
  const streakData = buildGrowthStreakData(
    rawObs
      .filter((o) => o.player_id === player.id)
      .map((o): GrowthObs => ({
        session_id: o.session_id,
        sentiment: o.sentiment,
        created_at: o.created_at,
      }))
  );

  const emoji = getStreakEmoji(streak);
  const label = getStreakLabel(streak);
  const parentMsg = buildParentMessage(streakData, player.name);
  const phone = player.parent_phone?.replace(/\D/g, '') ?? '';
  const whatsappUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(parentMsg)}`
    : `https://wa.me/?text=${encodeURIComponent(parentMsg)}`;

  function handleDismiss() {
    doDismisc(teamId, player!.id);
    setDismissed(true);
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ text: parentMsg });
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
    <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-xl">
          {emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-400">
            Player on a Roll
          </p>
          <p className="text-sm font-bold text-zinc-100 mt-0.5 leading-snug">
            {player.name}
            {player.jersey_number != null && (
              <span className="ml-1.5 text-zinc-400 font-normal text-xs">
                #{player.jersey_number}
              </span>
            )}{' '}
            — <span className="text-sky-300">{label}</span>
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-md p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
          aria-label="Dismiss player streak card"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Streak indicator */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-zinc-500">Positive coaching in</span>
        <span className="rounded-full bg-sky-500/15 border border-sky-500/25 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
          {streak} sessions in a row
        </span>
        <span className="text-xs text-zinc-600">— share the good news!</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 py-2 text-sm font-semibold text-white active:scale-[0.97] touch-manipulation transition-all hover:bg-sky-400"
          aria-label={`Share ${player.name}'s streak with their parent`}
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
