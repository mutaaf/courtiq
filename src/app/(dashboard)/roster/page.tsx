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
import { BulkActionsBar } from '@/components/roster/bulk-actions-bar';
import { Plus, Upload, Search, Users, UserPlus, ArrowRight, Camera, GitCompareArrows, CheckSquare, ShieldAlert, Radio } from 'lucide-react';
import Link from 'next/link';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { ParentEngagementPanel } from '@/components/roster/parent-engagement-panel';
import { TeamAttendancePanel } from '@/components/roster/team-attendance-panel';
import { AvailabilityBadge } from '@/components/roster/availability-badge';
import type { Player, PlayerAvailability } from '@/types/database';
import type { PlayerMomentum } from '@/lib/momentum-utils';
import { useAppStore } from '@/lib/store';

type SortMode = 'alpha' | 'attention' | 'momentum';

export default function RosterPage() {
  const { activeTeam, coach } = useActiveTeam();
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('alpha');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const practiceActive = useAppStore((s) => s.practiceActive);
  const practiceSessionId = useAppStore((s) => s.practiceSessionId);

  function toggleSelect(playerId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

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

  const { data: obsData = { counts: {}, lastObs: {}, lastObsPreview: {} }, refetch: refetchObs } = useQuery({
    queryKey: [...queryKeys.observations.all(activeTeam?.id ?? ''), 'counts'],
    queryFn: async () => {
      const data = await query<{ player_id: string; created_at: string; text: string; sentiment: string }[]>({
        table: 'observations',
        select: 'player_id, created_at, text, sentiment',
        filters: { team_id: activeTeam!.id, player_id: { op: 'neq', value: null } },
      });
      const counts: Record<string, number> = {};
      const lastObs: Record<string, string> = {};
      const lastObsPreview: Record<string, { text: string; sentiment: string }> = {};
      for (const obs of data || []) {
        if (obs.player_id) {
          counts[obs.player_id] = (counts[obs.player_id] || 0) + 1;
          if (!lastObs[obs.player_id] || obs.created_at > lastObs[obs.player_id]) {
            lastObs[obs.player_id] = obs.created_at;
            if (obs.text) lastObsPreview[obs.player_id] = { text: obs.text, sentiment: obs.sentiment };
          }
        }
      }
      return { counts, lastObs, lastObsPreview };
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.observations,
  });
  const obsCounts = obsData.counts;
  const lastObsMap = obsData.lastObs;
  const lastObsPreviewMap = obsData.lastObsPreview;

  // Fetch momentum scores for all players
  const { data: momentumMap = {} } = useQuery({
    queryKey: ['team-momentum', activeTeam?.id ?? ''],
    queryFn: async (): Promise<Record<string, PlayerMomentum>> => {
      const res = await fetch(`/api/team-momentum?team_id=${activeTeam!.id}`);
      if (!res.ok) return {};
      const json = await res.json();
      const map: Record<string, PlayerMomentum> = {};
      for (const p of json.players ?? []) map[p.player_id] = p;
      return map;
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch latest availability record per player
  const { data: availabilityMap = {}, refetch: refetchAvailability } = useQuery({
    queryKey: ['player-availability', activeTeam?.id ?? ''],
    queryFn: async (): Promise<Record<string, PlayerAvailability>> => {
      const res = await fetch(`/api/player-availability?team_id=${activeTeam!.id}`);
      if (!res.ok) return {};
      const json = await res.json();
      return json.availability ?? {};
    },
    enabled: !!activeTeam,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Live observation tracking for the active practice session
  const { data: sessionObsIds = new Set<string>() } = useQuery({
    queryKey: ['session-obs-count', practiceSessionId],
    queryFn: async () => {
      if (!practiceSessionId) return new Set<string>();
      const obs = await query<{ player_id: string | null }[]>({
        table: 'observations',
        select: 'player_id',
        filters: { session_id: practiceSessionId },
      });
      return new Set((obs ?? []).filter((o) => o.player_id).map((o) => o.player_id as string));
    },
    enabled: !!practiceSessionId && practiceActive,
    refetchInterval: 30_000,
    staleTime: 20_000,
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

  const sorted = useMemo(() => {
    const result = [...filtered];
    if (sortMode === 'attention') {
      result.sort((a, b) => {
        const aDate = lastObsMap[a.id] ?? '';
        const bDate = lastObsMap[b.id] ?? '';
        if (!aDate && !bDate) return a.name.localeCompare(b.name);
        if (!aDate) return -1; // never observed → highest priority
        if (!bDate) return 1;
        return aDate.localeCompare(bDate); // oldest last observation first
      });
    } else if (sortMode === 'momentum') {
      result.sort((a, b) => {
        const aScore = momentumMap[a.id]?.score ?? -1;
        const bScore = momentumMap[b.id]?.score ?? -1;
        if (aScore === bScore) return a.name.localeCompare(b.name);
        return aScore - bScore; // lowest momentum first
      });
    } else if (practiceActive && sortMode === 'alpha') {
      // During active practice, surface unobserved players first within alpha order
      result.sort((a, b) => {
        const aObs = sessionObsIds.has(a.id);
        const bObs = sessionObsIds.has(b.id);
        if (aObs === bObs) return a.name.localeCompare(b.name);
        return aObs ? 1 : -1; // not yet observed → top
      });
    }
    return result;
  }, [filtered, sortMode, lastObsMap, momentumMap, practiceActive, sessionObsIds]);

  // Summary: players with a non-available status
  const unavailableCount = useMemo(
    () => players.filter((p) => availabilityMap[p.id]?.status && availabilityMap[p.id].status !== 'available').length,
    [players, availabilityMap],
  );

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
    <PullToRefresh onRefresh={async () => { await Promise.all([refetchPlayers(), refetchObs(), refetchAvailability()]); }}>
    <div className="p-4 lg:p-8 space-y-6 pb-28 lg:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Roster</h1>
          <p className="text-sm text-zinc-400">
            {players.length} player{players.length !== 1 ? 's' : ''} on {activeTeam.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {players.length >= 2 && (
            <Button
              variant={selectMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              className={selectMode ? 'bg-orange-500 hover:bg-orange-600' : ''}
            >
              <CheckSquare className="h-4 w-4" />
              <span className="hidden sm:inline">{selectMode ? `${selectedIds.size} selected` : 'Select'}</span>
            </Button>
          )}
          {/* Mobile: compact add button */}
          <Link href="/roster/add" className="sm:hidden">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </Link>
          <div className="hidden sm:flex items-center gap-2">
            {players.length >= 2 && (
              <Link href="/roster/compare">
                <Button variant="outline" size="sm">
                  <GitCompareArrows className="h-4 w-4" />
                  Compare
                </Button>
              </Link>
            )}
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
      </div>

      {/* Availability Summary Strip — shown when any player is unavailable */}
      {unavailableCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <ShieldAlert className="h-5 w-5 flex-shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-300">
              {unavailableCount} player{unavailableCount !== 1 ? 's' : ''} with restricted availability
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {players
                .filter((p) => availabilityMap[p.id]?.status && availabilityMap[p.id].status !== 'available')
                .map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 text-xs text-zinc-300">
                    <span className="font-medium">{p.name.split(' ')[0]}</span>
                    <AvailabilityBadge status={availabilityMap[p.id].status} size="dot" />
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Parent Engagement Panel — shown once there are players */}
      {players.length > 0 && activeTeam && (
        <ParentEngagementPanel teamId={activeTeam.id} />
      )}

      {/* Team Attendance Panel — shown once attendance has been tracked */}
      {players.length > 0 && activeTeam && (
        <TeamAttendancePanel teamId={activeTeam.id} />
      )}

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
            <div className="flex gap-2">
              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="h-12 sm:h-10 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-base sm:text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <option value="all">All Positions</option>
                {positions.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="h-12 sm:h-10 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-base sm:text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                aria-label="Sort players"
              >
                <option value="alpha">A – Z</option>
                <option value="attention">Needs Attention</option>
                <option value="momentum">By Momentum</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Mobile quick actions — Import & Photo Import */}
      {players.length > 0 && (
        <div className="flex sm:hidden gap-2">
          <Link href="/roster/import" className="flex-1">
            <Button variant="outline" size="sm" className="w-full h-10 gap-1.5">
              <Upload className="h-4 w-4" />
              Import
            </Button>
          </Link>
          <Link href="/roster/import-photo" className="flex-1">
            <Button variant="outline" size="sm" className="w-full h-10 gap-1.5">
              <Camera className="h-4 w-4" />
              Photo Import
            </Button>
          </Link>
          {players.length >= 2 && (
            <Link href="/roster/compare" className="flex-1">
              <Button variant="outline" size="sm" className="w-full h-10 gap-1.5">
                <GitCompareArrows className="h-4 w-4" />
                Compare
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Practice-active banner — live coverage tracker with quick-observe CTA */}
      {practiceActive && practiceSessionId && players.length > 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
              <span className="text-sm font-semibold text-emerald-300">Practice Active</span>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                {sessionObsIds.size}/{players.filter((p) => availabilityMap[p.id]?.status !== 'injured' && availabilityMap[p.id]?.status !== 'sick' && availabilityMap[p.id]?.status !== 'unavailable').length || players.length} observed
              </span>
            </div>
            <Link
              href="/home"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ← Back to practice
            </Link>
          </div>
          <p className="text-xs text-zinc-500">
            Tap a player&apos;s mic button to capture an observation. Observed players move to the bottom.
          </p>
        </div>
      )}

      {/* Player Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 sm:h-20 rounded-xl" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
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
          {sorted.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              observationCount={obsCounts[player.id] || 0}
              lastObserved={lastObsMap[player.id] ?? null}
              lastObsPreview={lastObsPreviewMap[player.id] ?? null}
              selectMode={selectMode}
              selected={selectedIds.has(player.id)}
              onSelect={toggleSelect}
              availability={availabilityMap[player.id] ?? null}
              teamId={activeTeam.id}
              momentum={momentumMap[player.id] ?? null}
              practiceSessionId={practiceActive ? practiceSessionId : null}
              observedInSession={practiceActive ? sessionObsIds.has(player.id) : false}
            />
          ))}
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectMode && coach && activeTeam && (
        <BulkActionsBar
          selectedPlayers={players.filter((p) => selectedIds.has(p.id))}
          teamId={activeTeam.id}
          coachId={coach.id}
          onClear={exitSelectMode}
        />
      )}

    </div>
    </PullToRefresh>
  );
}
