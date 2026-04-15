'use client';

import { useState, useMemo, useCallback } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Search,
  Mic,
  Keyboard,
  Image as ImageIcon,
  Video,
  Filter,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ListFilter,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Star,
} from 'lucide-react';
import Link from 'next/link';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { countHighlighted } from '@/lib/observation-highlights';
import type { Observation, Player, Sentiment, ObservationSource } from '@/types/database';

// ─── Constants ────────────────────────────────────────────────────────────────

const SENTIMENT_CONFIG: Record<Sentiment, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  positive: { label: 'Positive', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: ThumbsUp },
  'needs-work': { label: 'Needs Work', color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: ThumbsDown },
  neutral: { label: 'Neutral', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30', icon: Minus },
};

const SOURCE_ICON: Record<ObservationSource, React.ComponentType<{ className?: string }>> = {
  voice: Mic,
  typed: Keyboard,
  photo: ImageIcon,
  video: Video,
  cv: Video,
  import: Keyboard,
  debrief: MessageSquare,
};

const DATE_RANGES = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 0, label: 'All time' },
] as const;

const SENTIMENT_FILTERS = [
  { value: 'all' as const, label: 'All' },
  { value: 'positive' as const, label: 'Positive' },
  { value: 'needs-work' as const, label: 'Needs Work' },
  { value: 'neutral' as const, label: 'Neutral' },
];

const PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function playerInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const AVATAR_COLORS = [
  'bg-orange-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-amber-500',
  'bg-teal-500',
  'bg-red-500',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Star toggle button ───────────────────────────────────────────────────────

function StarButton({
  obsId,
  isHighlighted,
  onToggle,
}: {
  obsId: string;
  isHighlighted: boolean;
  onToggle: (id: string, next: boolean) => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(obsId, !isHighlighted); }}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors touch-manipulation active:scale-95 ${
        isHighlighted
          ? 'text-amber-400 hover:text-amber-300'
          : 'text-zinc-600 hover:text-zinc-400'
      }`}
      aria-label={isHighlighted ? 'Remove from highlights' : 'Add to highlights'}
      aria-pressed={isHighlighted}
    >
      <Star className={`h-4 w-4 ${isHighlighted ? 'fill-amber-400' : ''}`} />
    </button>
  );
}

// ─── Observation card ─────────────────────────────────────────────────────────

function ObservationCard({
  obs,
  playerName,
  onToggleHighlight,
}: {
  obs: Observation & { players?: { name: string } | null };
  playerName: string;
  onToggleHighlight: (id: string, next: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sentiment = SENTIMENT_CONFIG[obs.sentiment];
  const SentimentIcon = sentiment.icon;
  const SourceIcon = SOURCE_ICON[obs.source] ?? Keyboard;
  const name = playerName || 'Team';
  const isLong = obs.text.length > 120;

  return (
    <Card className={`transition-colors hover:border-zinc-700 ${obs.is_highlighted ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(name)}`}
            aria-hidden="true"
          >
            {playerInitials(name)}
          </div>

          <div className="min-w-0 flex-1">
            {/* Top row: player + sentiment + source + time + star */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sm text-zinc-100">{name}</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${sentiment.color}`}
                aria-label={`Sentiment: ${sentiment.label}`}
              >
                <SentimentIcon className="h-3 w-3" />
                {sentiment.label}
              </span>
              {obs.category && (
                <Badge variant="secondary" className="text-[11px] capitalize">
                  {obs.category}
                </Badge>
              )}
              {obs.is_highlighted && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                  <Star className="h-2.5 w-2.5 fill-amber-400" />
                  Highlight
                </span>
              )}
              <span className="ml-auto flex items-center gap-1 text-[11px] text-zinc-500">
                <SourceIcon className="h-3 w-3" aria-hidden />
                <span>{formatRelative(obs.created_at!)}</span>
              </span>
              <StarButton
                obsId={obs.id}
                isHighlighted={obs.is_highlighted}
                onToggle={onToggleHighlight}
              />
            </div>

            {/* Observation text */}
            <p className={`mt-1.5 text-sm leading-relaxed text-zinc-300 ${!expanded && isLong ? 'line-clamp-2' : ''}`}>
              {obs.text}
            </p>
            {isLong && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-expanded={expanded}
              >
                {expanded ? (
                  <><ChevronUp className="h-3 w-3" />Show less</>
                ) : (
                  <><ChevronDown className="h-3 w-3" />Show more</>
                )}
              </button>
            )}

            {/* Session link */}
            {obs.session_id && (
              <div className="mt-2">
                <Link
                  href={`/sessions/${obs.session_id}`}
                  className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  View session
                </Link>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ObservationsPage() {
  const { activeTeam } = useActiveTeam();
  const qc = useQueryClient();

  // Filter state
  const [searchText, setSearchText] = useState('');
  const [playerFilter, setPlayerFilter] = useState<string>('all');
  const [sentimentFilter, setSentimentFilter] = useState<Sentiment | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<number>(30);
  const [highlightsOnly, setHighlightsOnly] = useState(false);
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever a filter changes
  const resetPage = useCallback(() => setPage(1), []);

  // Fetch players for filter dropdown
  const { data: players } = useQuery({
    queryKey: ['players', activeTeam?.id || ''],
    queryFn: async () => {
      if (!activeTeam) return [];
      return query<Player[]>({
        table: 'players',
        select: 'id, name',
        filters: { team_id: activeTeam.id, is_active: true },
        order: { column: 'name', ascending: true },
      }) ?? [];
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.roster,
  });

  // Fetch observations — server-side filters: team, player, sentiment, date range
  // Text search + category + highlights are applied client-side
  const { data: observations, isLoading, refetch } = useQuery({
    queryKey: ['observations', 'feed', activeTeam?.id || '', playerFilter, sentimentFilter, dateRange],
    queryFn: async () => {
      if (!activeTeam) return [];
      const filters: Record<string, unknown> = { team_id: activeTeam.id };

      if (playerFilter !== 'all') filters.player_id = playerFilter;
      if (sentimentFilter !== 'all') filters.sentiment = sentimentFilter;
      if (dateRange > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - dateRange);
        filters.created_at = { op: 'gte', value: cutoff.toISOString() };
      }

      const data = await query<(Observation & { players: { name: string } | null })[]>({
        table: 'observations',
        select: 'id, player_id, session_id, category, sentiment, text, source, is_highlighted, created_at, players(name)',
        filters,
        order: { column: 'created_at', ascending: false },
        limit: 500,
      });
      return data || [];
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.observations,
  });

  // Optimistic highlight toggle — updates cache immediately, then persists
  const handleToggleHighlight = useCallback(async (obsId: string, nextHighlighted: boolean) => {
    const cacheKey = ['observations', 'feed', activeTeam?.id || '', playerFilter, sentimentFilter, dateRange];

    // Optimistic update
    qc.setQueryData<(Observation & { players: { name: string } | null })[]>(cacheKey, (prev) =>
      prev ? prev.map((o) => o.id === obsId ? { ...o, is_highlighted: nextHighlighted } : o) : prev,
    );

    try {
      await mutate({
        table: 'observations',
        operation: 'update',
        data: { is_highlighted: nextHighlighted },
        filters: { id: obsId },
      });
    } catch {
      // Roll back on error
      qc.setQueryData<(Observation & { players: { name: string } | null })[]>(cacheKey, (prev) =>
        prev ? prev.map((o) => o.id === obsId ? { ...o, is_highlighted: !nextHighlighted } : o) : prev,
      );
    }
  }, [activeTeam?.id, playerFilter, sentimentFilter, dateRange, qc]);

  // Client-side: text search + category filter + highlights-only
  const filtered = useMemo(() => {
    if (!observations) return [];
    const needle = searchText.trim().toLowerCase();
    return observations.filter((obs) => {
      if (highlightsOnly && !obs.is_highlighted) return false;
      if (categoryFilter !== 'all' && obs.category !== categoryFilter) return false;
      if (needle && !obs.text.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [observations, searchText, categoryFilter, highlightsOnly]);

  // Unique categories from current fetch
  const categories = useMemo(() => {
    if (!observations) return [];
    const cats = new Set<string>();
    for (const o of observations) if (o.category) cats.add(o.category);
    return [...cats].sort();
  }, [observations]);

  // Player name lookup map
  const playerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players || []) map.set(p.id, p.name);
    return map;
  }, [players]);

  // Highlights count for the toggle badge
  const highlightCount = useMemo(() => countHighlighted(observations || []), [observations]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearch = useCallback((v: string) => { setSearchText(v); resetPage(); }, [resetPage]);
  const handlePlayer = useCallback((v: string) => { setPlayerFilter(v); resetPage(); }, [resetPage]);
  const handleSentiment = useCallback((v: Sentiment | 'all') => { setSentimentFilter(v); resetPage(); }, [resetPage]);
  const handleCategory = useCallback((v: string) => { setCategoryFilter(v); resetPage(); }, [resetPage]);
  const handleDateRange = useCallback((v: number) => { setDateRange(v); resetPage(); }, [resetPage]);
  const handleHighlightsOnly = useCallback(() => { setHighlightsOnly((v) => !v); resetPage(); }, [resetPage]);

  return (
    <PullToRefresh onRefresh={async () => { await refetch(); }}>
      <div className="p-4 lg:p-8 space-y-5 pb-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Observations</h1>
            <p className="text-zinc-400 text-sm mt-0.5">
              {isLoading
                ? 'Loading…'
                : `${filtered.length} observation${filtered.length !== 1 ? 's' : ''}${filtered.length !== (observations?.length || 0) ? ` of ${observations?.length || 0}` : ''}`}
            </p>
          </div>
          <Link href="/capture">
            <Button className="h-12 px-5 sm:h-10 sm:px-4 text-base sm:text-sm">
              <Mic className="h-5 w-5 sm:h-4 sm:w-4" />
              Capture
            </Button>
          </Link>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input
            type="search"
            placeholder="Search observations…"
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            aria-label="Search observations by text"
            className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/60 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
          />
        </div>

        {/* Sentiment chips + Highlights toggle */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
          <Filter className="h-4 w-4 text-zinc-500 shrink-0" aria-hidden />
          {SENTIMENT_FILTERS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSentiment(opt.value)}
              aria-pressed={sentimentFilter === opt.value}
              className={`shrink-0 rounded-full px-4 py-2 sm:px-3 sm:py-1 text-sm sm:text-xs font-medium transition-colors touch-manipulation ${
                sentimentFilter === opt.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}

          {/* Highlights-only toggle */}
          <button
            onClick={handleHighlightsOnly}
            aria-pressed={highlightsOnly}
            className={`shrink-0 flex items-center gap-1.5 rounded-full px-4 py-2 sm:px-3 sm:py-1 text-sm sm:text-xs font-medium transition-colors touch-manipulation ${
              highlightsOnly
                ? 'bg-amber-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${highlightsOnly ? 'fill-white' : ''}`} />
            Highlights
            {highlightCount > 0 && !highlightsOnly && (
              <span className="rounded-full bg-amber-500/20 px-1.5 text-amber-400 text-[10px]">{highlightCount}</span>
            )}
          </button>
        </div>

        {/* Secondary filters row: player + category + date range */}
        <div className="flex flex-wrap gap-3">
          {/* Player select */}
          <div className="relative">
            <select
              value={playerFilter}
              onChange={(e) => handlePlayer(e.target.value)}
              aria-label="Filter by player"
              className="h-10 appearance-none rounded-lg border border-zinc-700 bg-zinc-800 pl-3 pr-8 text-sm text-zinc-100 outline-none focus:border-orange-500 transition-colors cursor-pointer"
            >
              <option value="all">All players</option>
              {(players || []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          </div>

          {/* Category select */}
          {categories.length > 0 && (
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => handleCategory(e.target.value)}
                aria-label="Filter by category"
                className="h-10 appearance-none rounded-lg border border-zinc-700 bg-zinc-800 pl-3 pr-8 text-sm text-zinc-100 outline-none focus:border-orange-500 transition-colors cursor-pointer capitalize"
              >
                <option value="all">All categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat} className="capitalize">{cat}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
            </div>
          )}

          {/* Date range */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {DATE_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => handleDateRange(r.value)}
                aria-pressed={dateRange === r.value}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors touch-manipulation ${
                  dateRange === r.value
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : paginated.length === 0 ? (
          <Card className="border-dashed border-zinc-700">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500/10 mb-6">
                {highlightsOnly
                  ? <Star className="h-10 w-10 text-amber-500/60" />
                  : <ListFilter className="h-10 w-10 text-orange-500/60" />}
              </div>
              <h3 className="text-xl font-semibold text-zinc-200">
                {highlightsOnly ? 'No highlights yet' : 'No observations found'}
              </h3>
              <p className="text-zinc-500 text-sm mt-2 max-w-sm text-center leading-relaxed">
                {highlightsOnly
                  ? 'Tap the ★ on any observation to add it to your highlights collection.'
                  : searchText || playerFilter !== 'all' || sentimentFilter !== 'all' || categoryFilter !== 'all'
                    ? 'Try adjusting your filters or search query.'
                    : 'Start capturing observations during practice or games.'}
              </p>
              {!highlightsOnly && !searchText && playerFilter === 'all' && sentimentFilter === 'all' && (
                <Link href="/capture" className="mt-6">
                  <Button className="h-12 sm:h-10">
                    <Mic className="h-5 w-5 sm:h-4 sm:w-4" />
                    Start Capturing
                  </Button>
                </Link>
              )}
              {highlightsOnly && (
                <button
                  onClick={() => setHighlightsOnly(false)}
                  className="mt-4 text-sm text-orange-400 hover:text-orange-300 transition-colors"
                >
                  Show all observations
                </button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {paginated.map((obs) => {
                const playerName = obs.player_id
                  ? (playerNameMap.get(obs.player_id) ?? (obs as any).players?.name ?? 'Unknown')
                  : 'Team';
                return (
                  <ObservationCard
                    key={obs.id}
                    obs={obs}
                    playerName={playerName}
                    onToggleHighlight={handleToggleHighlight}
                  />
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
                <span className="text-sm text-zinc-500">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="h-9"
                    aria-label="Previous page"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="h-9"
                    aria-label="Next page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
