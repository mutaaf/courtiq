'use client';

import { useState, useMemo, useCallback } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { query } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Clock, Users, Filter, BarChart3, X, ChevronRight, Sparkles, Loader2, Wand2, CheckCircle2, Target, AlertTriangle, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Drill, Observation } from '@/types/database';
import { isFavorited, filterToFavorites, parseFavoritedDrills } from '@/lib/drill-favorites-utils';

const DRILL_CATEGORIES = [
  'Offense', 'Defense', 'Conditioning', 'Fundamentals', 'Passing', 'Shooting', 'Dribbling', 'Teamwork',
];

const DURATION_OPTIONS = [
  { label: 'Any', value: null },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '20 min', value: 20 },
];

export default function DrillsPage() {
  const { activeTeam } = useActiveTeam();
  const router = useRouter();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(
    searchParams.get('category') ?? null,
  );
  const [ageFilter, setAgeFilter] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState<string | null>(null);

  // AI Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderDesc, setBuilderDesc] = useState('');
  const [builderCategory, setBuilderCategory] = useState('');
  const [builderDuration, setBuilderDuration] = useState<number | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [builtDrillId, setBuiltDrillId] = useState<string | null>(null);

  const { data: drills, isLoading } = useQuery({
    queryKey: queryKeys.drills.all(activeTeam?.sport_id || ''),
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Drill[]>({
        table: 'drills',
        select: '*',
        filters: { sport_id: activeTeam.sport_id },
        order: { column: 'name', ascending: true },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.drills,
  });

  // Favorites query
  const { data: favoritesData, refetch: refetchFavorites } = useQuery({
    queryKey: ['drill-favorites'],
    queryFn: async () => {
      const res = await fetch('/api/drill-favorites');
      if (!res.ok) return { favorites: [] as string[] };
      return res.json() as Promise<{ favorites: string[] }>;
    },
    staleTime: 60 * 1000,
  });
  const favoriteIds: string[] = favoritesData?.favorites ?? [];

  const handleToggleFavorite = useCallback(
    async (e: React.MouseEvent, drillId: string) => {
      e.preventDefault(); // prevent Link navigation
      e.stopPropagation();
      if (togglingFavorite) return;
      setTogglingFavorite(drillId);
      try {
        await fetch('/api/drill-favorites', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drill_id: drillId }),
        });
        await refetchFavorites();
      } finally {
        setTogglingFavorite(null);
      }
    },
    [togglingFavorite, refetchFavorites],
  );

  // Skill-gap query: needs-work observations from last 30 days
  const { data: gapObs = [] } = useQuery({
    queryKey: ['drills-skill-gaps', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      return await query<Pick<Observation, 'category' | 'sentiment'>[]>({
        table: 'observations',
        select: 'category, sentiment',
        filters: {
          team_id: activeTeam.id,
          created_at: { op: 'gte', value: cutoff },
          sentiment: 'needs-work',
        },
        limit: 200,
      }) || [];
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  // Top 3 skill gaps by observation count
  const topGaps = useMemo(() => {
    if (!gapObs.length) return [];
    const counts: Record<string, number> = {};
    for (const obs of gapObs) {
      if (obs.category) {
        counts[obs.category] = (counts[obs.category] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }));
  }, [gapObs]);

  // Drills that address the top skill gaps (case-insensitive category match)
  const recommendedDrills = useMemo(() => {
    if (!drills || !topGaps.length) return [];
    const gapMap = new Map(topGaps.map((g) => [g.category.toLowerCase(), g.count]));
    return drills
      .filter((d) => gapMap.has(d.category.toLowerCase()))
      .sort((a, b) => {
        const ac = gapMap.get(a.category.toLowerCase()) ?? 0;
        const bc = gapMap.get(b.category.toLowerCase()) ?? 0;
        return bc - ac;
      })
      .slice(0, 6);
  }, [drills, topGaps]);

  // Extract unique categories and age groups
  const categories = useMemo(() => {
    if (!drills) return [];
    return [...new Set(drills.map((d) => d.category))].sort();
  }, [drills]);

  const ageGroups = useMemo(() => {
    if (!drills) return [];
    const groups = new Set<string>();
    drills.forEach((d) => d.age_groups.forEach((ag) => groups.add(ag)));
    return [...groups].sort();
  }, [drills]);

  // Filter drills
  const filtered = useMemo(() => {
    if (!drills) return [];
    const base = showFavoritesOnly ? filterToFavorites(drills, favoriteIds) : drills;
    return base.filter((drill) => {
      const matchesSearch =
        !search ||
        drill.name.toLowerCase().includes(search.toLowerCase()) ||
        drill.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = !categoryFilter || drill.category === categoryFilter;
      const matchesAge = !ageFilter || drill.age_groups.includes(ageFilter);
      return matchesSearch && matchesCategory && matchesAge;
    });
  }, [drills, search, categoryFilter, ageFilter, showFavoritesOnly, favoriteIds]);

  const hasActiveFilters = categoryFilter || ageFilter || search || showFavoritesOnly;

  async function handleBuildDrill() {
    if (!activeTeam || !builderDesc.trim()) return;
    setBuilding(true);
    setBuildError(null);
    setBuiltDrillId(null);

    try {
      const res = await fetch('/api/ai/drill-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: activeTeam.id,
          description: builderDesc.trim(),
          preferredCategory: builderCategory || undefined,
          preferredDuration: builderDuration || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setBuildError(data.error || 'Failed to generate drill');
        return;
      }

      // Invalidate drills cache so the new drill shows up
      await qc.invalidateQueries({ queryKey: queryKeys.drills.all(activeTeam.sport_id) });
      setBuiltDrillId(data.drill?.id || null);
    } catch {
      setBuildError('Network error — please try again');
    } finally {
      setBuilding(false);
    }
  }

  function handleOpenBuilder() {
    setBuilderDesc('');
    setBuilderCategory('');
    setBuilderDuration(null);
    setBuildError(null);
    setBuiltDrillId(null);
    setBuilderOpen(true);
  }

  function handleCloseBuilder() {
    if (building) return;
    setBuilderOpen(false);
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Drills Library</h1>
          <p className="text-zinc-400 text-sm">
            {filtered.length} drill{filtered.length !== 1 ? 's' : ''} available
          </p>
        </div>
        <Button
          onClick={handleOpenBuilder}
          className="gap-2 shrink-0 h-10"
          disabled={!activeTeam}
        >
          <Wand2 className="h-4 w-4" />
          <span className="hidden sm:inline">AI Builder</span>
          <span className="sm:hidden">Build</span>
        </Button>
      </div>

      {/* Skill Gap Recommendations */}
      {!isLoading && topGaps.length > 0 && recommendedDrills.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15">
                <Target className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <p className="text-sm font-semibold text-zinc-100">Recommended for Your Team</p>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1 ml-8">
              Based on {gapObs.length} needs-work observation{gapObs.length !== 1 ? 's' : ''} in the last 30 days &middot; Top gaps:{' '}
              {topGaps.map((g, i) => (
                <span key={g.category}>
                  {i > 0 && ', '}
                  <span className="text-amber-400">{g.category}</span>
                  {' '}
                  <span className="text-zinc-600">({g.count})</span>
                </span>
              ))}
            </p>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
            {recommendedDrills.map((drill) => (
              <Link
                key={drill.id}
                href={`/drills/${drill.id}`}
                className="shrink-0 w-52 sm:w-60 snap-start rounded-xl border border-zinc-800 bg-zinc-900 p-3 hover:border-amber-500/30 active:scale-[0.98] touch-manipulation transition-colors block"
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 flex-wrap mb-1">
                      <p className="text-sm font-medium text-zinc-100 leading-snug line-clamp-2">{drill.name}</p>
                      {drill.source === 'ai' && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-medium text-orange-400 shrink-0">
                          <Sparkles className="h-2.5 w-2.5" />
                          AI
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2">{drill.description}</p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Addresses: {drill.category}
                      </span>
                      {drill.duration_minutes && (
                        <span className="flex items-center gap-0.5 text-[10px] text-zinc-500">
                          <Clock className="h-3 w-3" />
                          {drill.duration_minutes}m
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-600 shrink-0 mt-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Search drills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="h-4 w-4 text-zinc-500 hover:text-zinc-300" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Category filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Filter className="h-4 w-4 text-zinc-500 shrink-0" />
          <span className="text-xs text-zinc-500 shrink-0">Category:</span>
          <button
            onClick={() => setCategoryFilter(null)}
            aria-pressed={!categoryFilter}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !categoryFilter
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
              aria-pressed={categoryFilter === cat}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === cat
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Age group filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Users className="h-4 w-4 text-zinc-500 shrink-0" />
          <span className="text-xs text-zinc-500 shrink-0">Ages:</span>
          <button
            onClick={() => setAgeFilter(null)}
            aria-pressed={!ageFilter}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !ageFilter
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            All
          </button>
          {ageGroups.map((ag) => (
            <button
              key={ag}
              onClick={() => setAgeFilter(ag === ageFilter ? null : ag)}
              aria-pressed={ageFilter === ag}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                ageFilter === ag
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {ag}
            </button>
          ))}
        </div>

        {/* Favorites filter */}
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-zinc-500 shrink-0" />
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            aria-pressed={showFavoritesOnly}
            className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              showFavoritesOnly
                ? 'bg-amber-500 text-zinc-950'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            <Star className={`h-3 w-3 ${showFavoritesOnly ? 'fill-zinc-950' : ''}`} />
            Favorites
            {favoriteIds.length > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  showFavoritesOnly ? 'bg-zinc-950/20 text-zinc-950' : 'bg-zinc-700 text-zinc-300'
                }`}
              >
                {favoriteIds.length}
              </span>
            )}
          </button>
        </div>

        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearch('');
              setCategoryFilter(null);
              setAgeFilter(null);
              setShowFavoritesOnly(false);
            }}
            className="text-xs text-orange-500 hover:text-orange-400"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Drills grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            {showFavoritesOnly ? (
              <Star className="h-12 w-12 text-zinc-600 mb-4" />
            ) : (
              <BarChart3 className="h-12 w-12 text-zinc-600 mb-4" />
            )}
            <p className="text-zinc-400 text-sm">
              {showFavoritesOnly
                ? 'No favorited drills yet — star a drill to save it here'
                : hasActiveFilters
                ? 'No drills match your filters'
                : 'No drills in the library yet'}
            </p>
            {!hasActiveFilters && !showFavoritesOnly && (
              <Button
                onClick={handleOpenBuilder}
                variant="outline"
                className="mt-4 gap-2"
                disabled={!activeTeam}
              >
                <Sparkles className="h-4 w-4" />
                Create with AI
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((drill) => {
            const favorited = isFavorited(drill.id, favoriteIds);
            const toggling = togglingFavorite === drill.id;
            return (
            <Link key={drill.id} href={`/drills/${drill.id}`}>
              <Card className={`h-full cursor-pointer transition-colors hover:border-orange-500/40 active:scale-[0.98] touch-manipulation ${favorited ? 'border-amber-500/30' : ''}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-zinc-100 leading-snug">{drill.name}</p>
                        {drill.source === 'ai' && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-medium text-orange-400">
                            <Sparkles className="h-2.5 w-2.5" />
                            AI
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{drill.description}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => handleToggleFavorite(e, drill.id)}
                        aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
                        aria-pressed={favorited}
                        disabled={toggling}
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors touch-manipulation disabled:opacity-50 ${
                          favorited
                            ? 'text-amber-400 hover:text-amber-300'
                            : 'text-zinc-600 hover:text-amber-400'
                        }`}
                      >
                        {toggling ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Star className={`h-4 w-4 ${favorited ? 'fill-amber-400' : ''}`} />
                        )}
                      </button>
                      <ChevronRight className="h-4 w-4 text-zinc-600" />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{drill.category}</Badge>
                    {drill.duration_minutes && (
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Clock className="h-3 w-3" />
                        {drill.duration_minutes} min
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-zinc-500">
                      <Users className="h-3 w-3" />
                      {drill.player_count_max
                        ? `${drill.player_count_min}–${drill.player_count_max}`
                        : `${drill.player_count_min}+`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {drill.age_groups.map((ag) => (
                      <span
                        key={ag}
                        className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
                      >
                        {ag}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
            );
          })}
        </div>
      )}

      {/* AI Builder Bottom Sheet */}
      {builderOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleCloseBuilder}
          />
          {/* Sheet */}
          <div className="relative w-full sm:max-w-lg bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-6 space-y-5 max-h-[90dvh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/15">
                  <Wand2 className="h-4 w-4 text-orange-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">AI Drill Builder</h2>
                  <p className="text-xs text-zinc-500">Describe what you want — AI does the rest</p>
                </div>
              </div>
              <button
                onClick={handleCloseBuilder}
                disabled={building}
                aria-label="Close drill builder"
                className="text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {builtDrillId ? (
              /* Success state */
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                  <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">Drill created!</p>
                  <p className="text-sm text-zinc-400 mt-1">Your new AI-generated drill has been added to the library.</p>
                </div>
                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setBuilderOpen(false);
                    }}
                  >
                    View Library
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => {
                      setBuilderOpen(false);
                      router.push(`/drills/${builtDrillId}`);
                    }}
                  >
                    Open Drill
                  </Button>
                </div>
              </div>
            ) : (
              /* Builder form */
              <div className="space-y-4">
                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-300">
                    Describe the drill <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={builderDesc}
                    onChange={(e) => setBuilderDesc(e.target.value)}
                    placeholder="e.g. A dribbling drill for beginners that practices left-hand control with cones, fun for ages 8-10"
                    rows={3}
                    disabled={building}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30 resize-none disabled:opacity-50"
                  />
                  <p className="text-[10px] text-zinc-600">
                    Be specific — mention skills, player count, equipment, difficulty level
                  </p>
                </div>

                {/* Category (optional) */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-300">
                    Category <span className="text-zinc-500 font-normal">(optional)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {DRILL_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setBuilderCategory(builderCategory === cat ? '' : cat)}
                        disabled={building}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          builderCategory === cat
                            ? 'bg-orange-500 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration (optional) */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-300">
                    Duration <span className="text-zinc-500 font-normal">(optional)</span>
                  </label>
                  <div className="flex gap-1.5">
                    {DURATION_OPTIONS.map((opt) => (
                      <button
                        key={String(opt.value)}
                        onClick={() => setBuilderDuration(opt.value)}
                        disabled={building}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          builderDuration === opt.value
                            ? 'bg-orange-500 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {buildError && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {buildError}
                  </p>
                )}

                {/* Example prompts */}
                {!builderDesc && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-zinc-500">Example prompts:</p>
                    <div className="flex flex-col gap-1.5">
                      {[
                        'A passing drill for 3-5 players that builds accuracy and communication',
                        'Defensive footwork exercise using cones, 10 minutes, intermediate level',
                        'Fun shooting competition game for 8 players, ages 10-12',
                      ].map((example) => (
                        <button
                          key={example}
                          onClick={() => setBuilderDesc(example)}
                          disabled={building}
                          className="text-left text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-800 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                        >
                          &ldquo;{example}&rdquo;
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleBuildDrill}
                  disabled={!builderDesc.trim() || building}
                  className="w-full h-12 gap-2 text-base"
                >
                  {building ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Generating drill...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" />
                      Generate Drill
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
