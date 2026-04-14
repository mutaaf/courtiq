'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, X, AlertTriangle, Target, Calendar, Trophy } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useActiveTeam } from '@/hooks/use-active-team';
import type { AppNotification, NotificationType } from '@/app/api/notifications/route';

// ─── Read-state persistence (localStorage) ───────────────────────────────────

const STORAGE_KEY = 'sportsiq:notification_reads';

function loadReadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // storage full or private mode — silently ignore
  }
}

// ─── Per-type visual config ───────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  NotificationType,
  { Icon: React.ElementType; color: string; label: string }
> = {
  unobserved_player: { Icon: AlertTriangle, color: 'text-amber-400', label: 'Attention needed' },
  goal_deadline: { Icon: Target, color: 'text-orange-400', label: 'Goal deadline' },
  session_today: { Icon: Calendar, color: 'text-blue-400', label: 'Session today' },
  achievement_earned: { Icon: Trophy, color: 'text-emerald-400', label: 'Achievement' },
};

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-orange-500',
  low: 'bg-emerald-500',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const { activeTeamId } = useActiveTeam();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Hydrate read state from localStorage after mount
  useEffect(() => {
    setReadIds(loadReadIds());
  }, []);

  // Fetch notifications whenever the active team changes
  const fetchNotifications = useCallback(async (teamId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?team_id=${teamId}`);
      if (res.ok) {
        const data = (await res.json()) as { notifications: AppNotification[] };
        setNotifications(data.notifications ?? []);
      }
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, []);

  useEffect(() => {
    if (!activeTeamId) return;
    setFetched(false);
    fetchNotifications(activeTeamId);
  }, [activeTeamId, fetchNotifications]);

  // Close panel on outside click / Escape
  useEffect(() => {
    function handlePointer(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handlePointer);
      document.addEventListener('keydown', handleKey);
    }
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const markRead = useCallback(
    (id: string) => {
      const next = new Set(readIds).add(id);
      setReadIds(next);
      saveReadIds(next);
    },
    [readIds]
  );

  const markAllRead = useCallback(() => {
    const next = new Set(notifications.map((n) => n.id));
    setReadIds(next);
    saveReadIds(next);
  }, [notifications]);

  return (
    <div ref={panelRef} className="relative">
      {/* Bell trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unreadCount > 0
            ? `Notifications — ${unreadCount} unread`
            : 'Notifications'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-orange-500 px-0.5 text-[10px] font-bold text-white"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/50"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-100">Notifications</h2>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-zinc-400 hover:text-orange-400 transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[26rem] overflow-y-auto">
            {loading && (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-lg bg-zinc-800"
                  />
                ))}
              </div>
            )}

            {!loading && fetched && notifications.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-zinc-500">
                <Bell className="h-8 w-8 opacity-30" aria-hidden />
                <p className="text-sm">All caught up!</p>
                <p className="text-xs text-zinc-600">No alerts right now.</p>
              </div>
            )}

            {!loading &&
              notifications.map((n) => {
                const { Icon, color } = TYPE_CONFIG[n.type] ?? {
                  Icon: Bell,
                  color: 'text-zinc-400',
                };
                const isRead = readIds.has(n.id);
                return (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => {
                      markRead(n.id);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex items-start gap-3 border-b border-zinc-800/60 px-4 py-3 transition-colors hover:bg-zinc-800 last:border-0',
                      !isRead && 'bg-zinc-800/30'
                    )}
                  >
                    <span className={cn('mt-0.5 shrink-0', color)}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-sm font-medium leading-snug',
                          isRead ? 'text-zinc-400' : 'text-zinc-100'
                        )}
                      >
                        {n.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                        {n.body}
                      </p>
                    </div>
                    {!isRead && (
                      <span
                        aria-hidden
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          PRIORITY_DOT[n.priority]
                        )}
                      />
                    )}
                  </Link>
                );
              })}
          </div>

          {/* Footer — refresh link */}
          {!loading && fetched && notifications.length > 0 && (
            <div className="border-t border-zinc-800 px-4 py-2 text-center">
              <button
                onClick={() => activeTeamId && fetchNotifications(activeTeamId)}
                className="text-xs text-zinc-500 hover:text-orange-400 transition-colors"
              >
                Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
