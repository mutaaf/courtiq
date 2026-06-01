'use client';

/**
 * Ticket 0061 — /roster/[playerId]/trajectory.
 *
 * The per-player "Week 1 vs now" trajectory page mounted under the existing
 * per-player surface root (`/roster/[playerId]`, NOT `/team/[teamId]/player/
 * [playerId]` — the ticket prose said "or whichever path the existing
 * per-player surfaces use; read first").
 *
 * The page wraps the rendered `PlayerTrajectoryCard` in
 * `<UpgradeGate feature="feature_player_trajectory">` so the free-tier UI
 * shows the gate copy named for THIS player (LESSONS#0079 — the prop is
 * the tier-feature lookup key, NOT a free label). The server route also
 * enforces the 30-day preview wall (server-AND-client per AGENTS.md
 * non-negotiable #5).
 */
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { query } from '@/lib/api';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import { PlayerTrajectoryCard } from '@/components/dashboard/player-trajectory-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Player } from '@/types/database';
import { firstNameOf } from '@/lib/player-trajectory-utils';

export default function PlayerTrajectoryPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = use(params);

  const { data: player, isLoading } = useQuery({
    queryKey: ['player-trajectory-page-player', playerId],
    queryFn: async () => {
      return await query<Player>({
        table: 'players',
        select: 'id, name, team_id',
        filters: { id: playerId },
        single: true,
      });
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 pb-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg font-semibold text-zinc-300">Player not found</h2>
        <Link href="/roster" className="mt-4 inline-block text-sm text-orange-400">
          <ArrowLeft className="mr-1 inline h-4 w-4" />
          Back to Roster
        </Link>
      </div>
    );
  }

  const playerFirstName = firstNameOf(player.name);

  return (
    <div className="p-4 lg:p-8 pb-8 space-y-4">
      <Link
        href={`/roster/${playerId}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-orange-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {playerFirstName}
      </Link>

      <UpgradeGate feature="feature_player_trajectory">
        <PlayerTrajectoryCard playerId={playerId} playerFirstName={playerFirstName} />
      </UpgradeGate>
    </div>
  );
}
