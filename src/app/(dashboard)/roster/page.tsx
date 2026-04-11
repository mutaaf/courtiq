'use client';

import { useState, useMemo } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PlayerCard } from '@/components/roster/player-card';
import { Plus, Upload, Search, Users, UserPlus, ArrowRight, Camera } from 'lucide-react';
import Link from 'next/link';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import type { Player } from '@/types/database';

export default function RosterPage() {
  const { activeTeam } = useActiveTeam();
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('all');

  const { data: players = [], isLoading, refetch: refetchPlayers } = useQuery({
    queryKey: queryKeys.players.all(activeTeam?.id ?? ''),
    queryFn: async () => {
      const data = await query<Player[]>({
        table: 'players',
        select: '*',
        filters: { team_id: activeTeam!.id, is_active: true },
        order: { column: 'name', ascending: true },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.roster,
  });

  const { data: obsCounts = {}, refetch: refetchObs } = useQuery({
    queryKey: [...queryKeys.observations.all(activeTeam?.id ?? ''), 'counts'],
    queryFn: async () => {
      const data = await query<{ player_id: string }[]>({
        table: 'observations',
        select: 'player_id',
        filters: { team_id: activeTeam!.id, player_id: { op: 'neq', value: null } },
      });
      const counts: Record<string, number> = {};
      for (const obs of data || []) {
        if (obs.player_id) {
          counts[obs.player_id] = (counts[obs.player_id] || 0) + 1;
        }
      }
      return counts;
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.observations,
  });

  const positions = useMemo(() => {
    const set = new Set(players.map((p) => p.position));
    return Array.from(set).sort();
  }, [players]);

  const filtered = useMemo(() => {
    let result = players;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.nickname?.toLowerCase().includes(q) ||
          p.jersey_number?.toString() === q
      );
    }
    if (positionFilter !== 'all') {
      result = result.filter((p) => p.position === positionFilter);
    }
    return result;
  }, [players, search, positionFilter]);

  if (!activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[60vh]">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/50 mb-5">
          <Users className="h-8 w-8 text-zinc-600" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-300">No Active Team</h2>
        <p className="mt-2 text-sm text-zinc-500 max-w-sm">Select or create a team to manage your roster.</p>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={async () => { await Promise.all([refetchPlayers(), refetchObs()]); }}>
    <div className="p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Roster</h1>
          <p className="text-sm text-zinc-400">
            {players.length} player{players.length !== 1 ? 's' : ''} on {activeTeam.name}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <Link href="/roster/import-photo">
            <Button variant="outline" size="sm">
              <Camera className="h-4 w-4" />
              Photo Import
            </Button>
          </Link>
          <Link href="/roster/import">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4" />
              Import
            </Button>
          </Link>
          <Link href="/roster/add">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add Player
            </Button>
          </Link>
        </div>
      </div>

      {/* Search & Filter - sticky on mobile */}
      {players.length > 0 && (
        <div className="sticky top-0 z-10 -mx-4 bg-zinc-950/95 backdrop-blur-sm px-4 py-2 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                placeholder="Search players..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-12 sm:h-10 text-base sm:text-sm"
              />
            </div>
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="h-12 sm:h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-base sm:text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <option value="all">All Positions</option>
              {positions.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Player Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 sm:h-20 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 p-10 sm:p-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-500/10 mb-6">
            <UserPlus className="h-10 w-10 text-blue-500/60" />
          </div>
          {players.length === 0 ? (
            <>
              <h3 className="text-xl font-semibold text-zinc-200">Build your roster</h3>
              <p className="mt-2 max-w-sm text-sm text-zinc-500 leading-relaxed">
                Add your players to start tracking observations, skill progression, and generate personalized development reports.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Link href="/roster/import-photo" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full sm:w-auto h-12 sm:h-10">
                    <Camera className="h-4 w-4" />
                    Photo Import
                  </Button>
                </Link>
                <Link href="/roster/import" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full sm:w-auto h-12 sm:h-10">
                    <Upload className="h-4 w-4" />
                    Import Roster
                  </Button>
                </Link>
                <Link href="/roster/add" className="w-full sm:w-auto">
                  <Button className="w-full sm:w-auto h-12 sm:h-10">
                    <Plus className="h-4 w-4" />
                    Add First Player
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-zinc-300">No players match</h3>
              <p className="mt-1 text-sm text-zinc-500">
                Try adjusting your search or filter criteria.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              observationCount={obsCounts[player.id] || 0}
            />
          ))}
        </div>
      )}

      {/* Mobile FAB - Add Player */}
      <Link
        href="/roster/add"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg shadow-orange-500/30 active:scale-95 touch-manipulation sm:hidden"
      >
        <Plus className="h-7 w-7" />
      </Link>
    </div>
    </PullToRefresh>
  );
}
