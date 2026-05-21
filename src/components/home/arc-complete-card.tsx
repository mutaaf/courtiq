'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trophy, X, ArrowRight } from 'lucide-react';

interface ArcComplete {
  planId: string;
  arcTitle: string;
  totalSessions: number;
  completedAt: string;
}

const EXPIRE_DAYS = 7;

export function ArcCompleteCard({ teamId }: { teamId: string }) {
  const [arc, setArc] = useState<ArcComplete | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(`arc-complete-${teamId}`);
      if (!raw) return;
      const data = JSON.parse(raw) as ArcComplete;
      const ageMs = Date.now() - new Date(data.completedAt).getTime();
      if (ageMs > EXPIRE_DAYS * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(`arc-complete-${teamId}`);
        return;
      }
      setArc(data);
    } catch { /* ignore */ }
  }, [teamId]);

  if (!mounted || !arc) return null;

  function handleDismiss() {
    try { localStorage.removeItem(`arc-complete-${teamId}`); } catch { /* ignore */ }
    setArc(null);
  }

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-xl">
          🏆
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Practice Series Complete!
          </p>
          <p className="text-sm font-bold text-zinc-100 mt-0.5 leading-snug">
            {arc.arcTitle}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            All {arc.totalSessions} sessions completed — great coaching work!
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-md p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
          aria-label="Dismiss practice series completion card"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/plans"
          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.97] touch-manipulation text-white text-xs font-semibold px-3.5 py-2 transition-all"
          onClick={handleDismiss}
        >
          <Trophy className="h-3.5 w-3.5" />
          Plan Next Series
        </Link>
        <button
          onClick={handleDismiss}
          className="flex items-center gap-1 rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-600 transition-colors touch-manipulation"
        >
          Got it
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
