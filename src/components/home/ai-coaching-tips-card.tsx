'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Sparkles, AlertTriangle, Lightbulb, Star, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CoachingTip {
  type: 'alert' | 'suggestion' | 'praise';
  message: string;
  action_label?: string;
  action_href?: string;
}

interface CachedTips {
  tips: CoachingTip[];
  fetchedAt: number;
  teamId: string;
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheKey(teamId: string) {
  return `ai-coaching-tips-${teamId}`;
}

function dismissKey(teamId: string) {
  return `ai-coaching-tips-dismissed-${teamId}`;
}

function getFromCache(teamId: string): CoachingTip[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(teamId));
    if (!raw) return null;
    const cached: CachedTips = JSON.parse(raw);
    if (cached.teamId !== teamId) return null;
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
    return cached.tips;
  } catch {
    return null;
  }
}

function saveToCache(teamId: string, tips: CoachingTip[]) {
  try {
    const payload: CachedTips = { tips, fetchedAt: Date.now(), teamId };
    localStorage.setItem(cacheKey(teamId), JSON.stringify(payload));
  } catch {
    // localStorage full — silently ignore
  }
}

function isDismissed(teamId: string): boolean {
  try {
    const raw = localStorage.getItem(dismissKey(teamId));
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function setDismissed(teamId: string) {
  try {
    localStorage.setItem(dismissKey(teamId), String(Date.now()));
  } catch {
    // ignore
  }
}

const TIP_CONFIG = {
  alert: {
    icon: AlertTriangle,
    containerClass: 'border-amber-500/30 bg-amber-500/5',
    iconBgClass: 'bg-amber-500/20',
    iconClass: 'text-amber-400',
    dotClass: 'bg-amber-400',
    labelClass: 'text-amber-300',
    actionClass: 'border-amber-500/40 text-amber-300 hover:bg-amber-500/10',
  },
  suggestion: {
    icon: Lightbulb,
    containerClass: 'border-blue-500/30 bg-blue-500/5',
    iconBgClass: 'bg-blue-500/20',
    iconClass: 'text-blue-400',
    dotClass: 'bg-blue-400',
    labelClass: 'text-blue-300',
    actionClass: 'border-blue-500/40 text-blue-300 hover:bg-blue-500/10',
  },
  praise: {
    icon: Star,
    containerClass: 'border-emerald-500/30 bg-emerald-500/5',
    iconBgClass: 'bg-emerald-500/20',
    iconClass: 'text-emerald-400',
    dotClass: 'bg-emerald-400',
    labelClass: 'text-emerald-300',
    actionClass: 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10',
  },
} as const;

interface AICoachingTipsCardProps {
  teamId: string;
  observationCount: number;
}

export function AICoachingTipsCard({ teamId, observationCount }: AICoachingTipsCardProps) {
  const [tips, setTips] = useState<CoachingTip[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissedState] = useState(false);
  const [mounted, setMounted] = useState(false);

  const fetchTips = useCallback(
    async (bust = false) => {
      if (loading) return;
      setLoading(true);
      try {
        if (!bust) {
          const cached = getFromCache(teamId);
          if (cached) {
            setTips(cached);
            setLoading(false);
            return;
          }
        }
        const res = await fetch('/api/ai/coaching-tips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId }),
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        const fetched: CoachingTip[] = Array.isArray(data.tips) ? data.tips : [];
        saveToCache(teamId, fetched);
        setTips(fetched);
      } catch {
        // Silently fail — coaching tips are non-critical
      } finally {
        setLoading(false);
      }
    },
    [teamId, loading]
  );

  useEffect(() => {
    setMounted(true);
    if (isDismissed(teamId)) {
      setDismissedState(true);
      return;
    }
    fetchTips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  // Don't render until mounted (avoids SSR localStorage mismatch)
  if (!mounted) return null;
  // Hide when not enough data, dismissed, or no tips loaded yet (and not loading)
  if (observationCount < 5) return null;
  if (dismissed) return null;
  if (!loading && tips.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/20">
            <Sparkles className="h-4 w-4 text-violet-400" />
          </div>
          <span className="text-sm font-semibold text-zinc-200">AI Coach Insights</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              // Bust cache and re-fetch
              try { localStorage.removeItem(cacheKey(teamId)); } catch { /* ignore */ }
              fetchTips(true);
            }}
            disabled={loading}
            aria-label="Refresh coaching tips"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setDismissed(teamId);
              setDismissedState(true);
            }}
            aria-label="Dismiss coaching tips"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tips list */}
      <div className="divide-y divide-zinc-800">
        {loading && tips.length === 0
          ? // Skeleton
            [0, 1].map((i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5 animate-pulse">
                <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-zinc-800" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="h-3 rounded bg-zinc-800 w-3/4" />
                  <div className="h-3 rounded bg-zinc-800 w-1/2" />
                </div>
              </div>
            ))
          : tips.map((tip, i) => {
              const cfg = TIP_CONFIG[tip.type] ?? TIP_CONFIG.suggestion;
              const Icon = cfg.icon;
              return (
                <div key={i} className="flex items-start gap-3 px-4 py-3.5">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cfg.iconBgClass}`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${cfg.iconClass}`} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-sm text-zinc-300 leading-snug">{tip.message}</p>
                    {tip.action_label && tip.action_href && (
                      <Link href={tip.action_href}>
                        <Button
                          size="sm"
                          variant="outline"
                          className={`h-7 text-xs px-2.5 border ${cfg.actionClass}`}
                        >
                          {tip.action_label} →
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}
