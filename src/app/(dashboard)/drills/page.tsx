'use client';

import { useState, useMemo } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Clock, Users, Filter, BarChart3, X } from 'lucide-react';
import type { Drill } from '@/types/database';

export default function DrillsPage() {
  const { activeTeam } = useActiveTeam();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [ageFilter, setAgeFilter] = useState<string | null>(null);

  const { data: drills, isLoading } = useQuery({
    queryKey: queryKeys.drills.all(activeTeam?.sport_id || ''),
    queryFn: async () => {
      if (!activeTeam) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from('drills')
        .select('*')
        .eq('sport_id', activeTeam.sport_id)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as Drill[];
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

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Drills Library</h1>
        <p className="text-zinc-400 text-sm">
          {filtered.length} drill{filtered.length !== 1 ? 's' : ''} available
        </p>
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
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((drill) => (
            <Card key={drill.id} className="transition-colors hover:border-zinc-700">
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="font-medium text-zinc-100">{drill.name}</p>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{drill.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{drill.category}</Badge>
                  {drill.duration_minutes && (
                    <span className="flex items-center gap-1 text-xs text-zinc-500">
                      <Clock className="h-3 w-3" />
                      {drill.duration_minutes} min
                    </span>
                  )}
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
          ))}
        </div>
      )}
    </div>
  );
}
