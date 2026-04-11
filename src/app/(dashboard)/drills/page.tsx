'use client';

import { useState, useMemo } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Clock, Users, Filter, BarChart3, X, ChevronRight, Sparkles, Loader2, Wand2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Drill } from '@/types/database';

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
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [ageFilter, setAgeFilter] = useState<string | null>(null);

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
    return drills.filter((drill) => {
      const matchesSearch =
        !search ||
        drill.name.toLowerCase().includes(search.toLowerCase()) ||
        drill.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = !categoryFilter || drill.category === categoryFilter;
      const matchesAge = !ageFilter || drill.age_groups.includes(ageFilter);
      return matchesSearch && matchesCategory && matchesAge;
    });
  }, [drills, search, categoryFilter, ageFilter]);

  const hasActiveFilters = categoryFilter || ageFilter || search;

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
    <div className="p-4 lg:p-8 space-y-6">
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

        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearch('');
              setCategoryFilter(null);
              setAgeFilter(null);
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
            <BarChart3 className="h-12 w-12 text-zinc-600 mb-4" />
            <p className="text-zinc-400 text-sm">
              {hasActiveFilters ? 'No drills match your filters' : 'No drills in the library yet'}
            </p>
            {!hasActiveFilters && (
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
          {filtered.map((drill) => (
            <Link key={drill.id} href={`/drills/${drill.id}`}>
              <Card className="h-full cursor-pointer transition-colors hover:border-orange-500/40 active:scale-[0.98] touch-manipulation">
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
                    <ChevronRight className="h-4 w-4 text-zinc-600 shrink-0 mt-0.5" />
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
          ))}
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
