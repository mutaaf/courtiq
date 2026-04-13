'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  X,
  Users,
  Calendar,
  ClipboardList,
  Dumbbell,
  Home,
  Mic,
  Sparkles,
  BarChart3,
  Settings,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { useActiveTeam } from '@/hooks/use-active-team';
import { query } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommandItem {
  id: string;
  label: string;
  sublabel?: string;
  group: 'actions' | 'players' | 'sessions' | 'plans' | 'drills';
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
}

interface CommandPaletteProps {
  onClose: () => void;
}

// Stable empty array so useQuery default doesn't produce a new reference on
// every render (which would cause useMemo/useEffect deps to change every cycle).
const EMPTY: any[] = [];

// ─── Static Quick Actions ─────────────────────────────────────────────────────

const QUICK_ACTIONS: CommandItem[] = [
  { id: 'action-home',     label: 'Go to Home',          group: 'actions', href: '/home',     icon: Home },
  { id: 'action-capture',  label: 'Capture Observation', group: 'actions', href: '/capture',  icon: Mic },
  { id: 'action-assistant',label: 'Open AI Assistant',   group: 'actions', href: '/assistant',icon: Sparkles },
  { id: 'action-roster',   label: 'View Roster',         group: 'actions', href: '/roster',   icon: Users },
  { id: 'action-sessions', label: 'View Sessions',       group: 'actions', href: '/sessions', icon: Calendar },
  { id: 'action-plans',    label: 'View Plans',          group: 'actions', href: '/plans',    icon: ClipboardList },
  { id: 'action-analytics',label: 'View Analytics',      group: 'actions', href: '/analytics',icon: BarChart3 },
  { id: 'action-drills',   label: 'Drill Library',       group: 'actions', href: '/drills',   icon: Dumbbell },
  { id: 'action-settings', label: 'Settings',            group: 'actions', href: '/settings', icon: Settings },
];

const GROUP_LABELS: Record<CommandItem['group'], string> = {
  actions:  'Quick Actions',
  players:  'Players',
  sessions: 'Sessions',
  plans:    'Plans',
  drills:   'Drills',
};

const GROUP_ORDER: CommandItem['group'][] = ['actions', 'players', 'sessions', 'plans', 'drills'];

// ─── Fuzzy match ──────────────────────────────────────────────────────────────

function matches(item: CommandItem, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const haystack = [item.label, item.sublabel, item.keywords].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(needle);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { activeTeam, activeTeamId, coach } = useActiveTeam();
  const [query_, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const trapRef = useFocusTrap<HTMLDivElement>({ enabled: true, onEscape: onClose });

  // ── Fetch searchable data ──────────────────────────────────────────────────

  const sportId = (activeTeam as any)?.sport_id || '';

  const { data: players = EMPTY, isFetching: loadingPlayers } = useQuery<any[]>({
    queryKey: ['cmd-palette-players', activeTeamId],
    queryFn: () => activeTeamId
      ? query({ table: 'players', select: 'id, name, jersey_number', filters: { team_id: activeTeamId, is_active: true } })
      : [],
    enabled: !!activeTeamId,
    staleTime: 60_000,
  });

  const { data: sessions = EMPTY, isFetching: loadingSessions } = useQuery<any[]>({
    queryKey: ['cmd-palette-sessions', activeTeamId],
    queryFn: () => activeTeamId
      ? query({ table: 'sessions', select: 'id, title, session_date, type', filters: { team_id: activeTeamId }, order: { column: 'session_date', ascending: false }, limit: 30 })
      : [],
    enabled: !!activeTeamId,
    staleTime: 60_000,
  });

  const { data: plans = EMPTY, isFetching: loadingPlans } = useQuery<any[]>({
    queryKey: ['cmd-palette-plans', activeTeamId],
    queryFn: () => activeTeamId
      ? query({ table: 'plans', select: 'id, title, plan_type', filters: { team_id: activeTeamId }, order: { column: 'created_at', ascending: false }, limit: 20 })
      : [],
    enabled: !!activeTeamId,
    staleTime: 60_000,
  });

  const { data: drills = EMPTY, isFetching: loadingDrills } = useQuery<any[]>({
    queryKey: ['cmd-palette-drills', sportId],
    queryFn: () => sportId
      ? query({ table: 'drills', select: 'id, name, category', filters: { sport_id: sportId }, limit: 40 })
      : [],
    enabled: !!sportId,
    staleTime: 300_000,
  });

  const isLoading = loadingPlayers || loadingSessions || loadingPlans || loadingDrills;

  // ── Build searchable items ─────────────────────────────────────────────────

  const allItems = useMemo((): CommandItem[] => {
    const playerItems: CommandItem[] = (players as any[]).map((p) => ({
      id: `player-${p.id}`,
      label: p.name,
      sublabel: p.jersey_number ? `#${p.jersey_number}` : 'Player',
      group: 'players' as const,
      href: `/roster/${p.id}`,
      icon: Users,
      keywords: p.name,
    }));

    const sessionItems: CommandItem[] = (sessions as any[]).map((s) => ({
      id: `session-${s.id}`,
      label: s.title || `${s.type} session`,
      sublabel: s.session_date ? new Date(s.session_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : undefined,
      group: 'sessions' as const,
      href: `/sessions/${s.id}`,
      icon: Calendar,
      keywords: [s.title, s.type, s.session_date].filter(Boolean).join(' '),
    }));

    const planItems: CommandItem[] = (plans as any[]).map((p) => ({
      id: `plan-${p.id}`,
      label: p.title || p.plan_type || 'Plan',
      sublabel: p.plan_type,
      group: 'plans' as const,
      href: `/plans/${p.id}`,
      icon: ClipboardList,
      keywords: [p.title, p.plan_type].filter(Boolean).join(' '),
    }));

    const drillItems: CommandItem[] = (drills as any[]).map((d) => ({
      id: `drill-${d.id}`,
      label: d.name,
      sublabel: d.category,
      group: 'drills' as const,
      href: `/drills`,
      icon: Dumbbell,
      keywords: [d.name, d.category].filter(Boolean).join(' '),
    }));

    return [...QUICK_ACTIONS, ...playerItems, ...sessionItems, ...planItems, ...drillItems];
  }, [players, sessions, plans, drills]);

  // ── Filter by query ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = query_.trim();
    // When query is empty only show quick actions; when searching show everything
    if (!q) return allItems.filter((i) => i.group === 'actions');
    return allItems.filter((i) => matches(i, q));
  }, [allItems, query_]);

  // ── Keyboard navigation ────────────────────────────────────────────────────

  // Reset active index whenever filtered list changes
  useEffect(() => { setActiveIdx(0); }, [filtered]);

  const navigate = useCallback((item: CommandItem) => {
    onClose();
    router.push(item.href);
  }, [onClose, router]);

  // Keep refs so the document listener always sees the latest values without
  // needing to be re-attached when filtered / activeIdx change.
  const filteredRef = useRef(filtered);
  const activeIdxRef = useRef(activeIdx);
  const navigateRef = useRef(navigate);
  useEffect(() => { filteredRef.current = filtered; }, [filtered]);
  useEffect(() => { activeIdxRef.current = activeIdx; }, [activeIdx]);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);

  // Document-level keydown for palette navigation (ArrowDown/Up/Enter).
  // Registering at document level ensures the handler fires regardless of
  // which element inside the palette currently holds focus, and lets tests
  // dispatch events on any element without worrying about event propagation.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filteredRef.current.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filteredRef.current[activeIdxRef.current];
        if (item) navigateRef.current(item);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []); // intentionally empty — refs keep values fresh

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIdx]);

  // ── Group items for rendering ──────────────────────────────────────────────

  const grouped = useMemo(() => {
    const map = new Map<CommandItem['group'], CommandItem[]>();
    for (const item of filtered) {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)!.push(item);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, items: map.get(g)! }));
  }, [filtered]);

  // Compute a flat index for each item (for activeIdx tracking)
  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-zinc-950/80 backdrop-blur-sm px-4 pt-[10vh]"
      onClick={onClose}
      role="presentation"
    >
      {/* Dialog */}
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          {isLoading
            ? <Loader2 className="h-4 w-4 shrink-0 text-zinc-500 animate-spin" aria-hidden />
            : <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
          }
          <input
            ref={inputRef}
            type="text"
            placeholder="Search players, sessions, plans, drills…"
            value={query_}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            onClick={onClose}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Close command palette"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Results */}
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Search results"
          className="max-h-[60vh] overflow-y-auto py-2"
        >
          {flatItems.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-zinc-500">
              {query_.trim() ? `No results for "${query_}"` : 'Start typing to search…'}
            </li>
          ) : (
            grouped.map(({ group, items }) => {
              // Compute start index of this group in flatItems for activeIdx tracking
              const groupStart = flatItems.findIndex((i) => i.id === items[0].id);
              return (
                <li key={group} role="presentation">
                  <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    {GROUP_LABELS[group]}
                  </p>
                  <ul role="presentation">
                    {items.map((item, localIdx) => {
                      const flatIdx = groupStart + localIdx;
                      const isActive = flatIdx === activeIdx;
                      return (
                        <li
                          key={item.id}
                          role="option"
                          aria-selected={isActive}
                          data-active={isActive}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors',
                            isActive
                              ? 'bg-orange-500/10 text-orange-400'
                              : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                          )}
                          onMouseEnter={() => setActiveIdx(flatIdx)}
                          onClick={() => navigate(item)}
                        >
                          <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-orange-500' : 'text-zinc-500')} aria-hidden />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.sublabel && (
                            <span className={cn('shrink-0 text-xs', isActive ? 'text-orange-400/70' : 'text-zinc-500')}>
                              {item.sublabel}
                            </span>
                          )}
                          {isActive && <ArrowRight className="h-3 w-3 shrink-0 text-orange-500" aria-hidden />}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })
          )}
        </ul>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-600">
          <span><kbd className="font-sans">↑↓</kbd> navigate</span>
          <span><kbd className="font-sans">↵</kbd> open</span>
          <span><kbd className="font-sans">Esc</kbd> close</span>
          <span className="ml-auto hidden sm:block opacity-60">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
