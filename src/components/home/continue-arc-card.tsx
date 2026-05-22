'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight, Zap, X } from 'lucide-react';

interface ArcProgress {
  planId: string;
  arcTitle: string;
  nextSession: number;
  totalSessions: number;
  nextSessionTitle: string;
  savedAt: string;
}

export function ContinueArcCard({ teamId }: { teamId: string }) {
  const [arc, setArc] = useState<ArcProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(`arc-progress-${teamId}`);
      if (!raw) return;
      const data = JSON.parse(raw) as ArcProgress;
      // Expire after 14 days
      const ageMs = Date.now() - new Date(data.savedAt).getTime();
      if (ageMs > 14 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(`arc-progress-${teamId}`);
        return;
      }
      setArc(data);
    } catch { /* ignore */ }
  }, [teamId]);

  if (!mounted || !arc || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.removeItem(`arc-progress-${teamId}`); } catch { /* ignore */ }
  };

  return (
    <div className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15">
          <Zap className="h-4 w-4 text-sky-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-500 mb-0.5">
            Practice Series
          </p>
          <p className="text-sm font-semibold text-zinc-100 leading-snug">{arc.arcTitle}</p>
          <p className="mt-0.5 text-xs text-zinc-400">
            Session {arc.nextSession} of {arc.totalSessions} — load before next practice
          </p>
          {arc.nextSessionTitle && (
            <p className="mt-0.5 text-xs text-zinc-500 italic truncate">{arc.nextSessionTitle}</p>
          )}
          <Link
            href={`/plans?arcPlanId=${encodeURIComponent(arc.planId)}&arcSession=${arc.nextSession - 1}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-sky-500/25 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/25 transition-colors touch-manipulation active:scale-[0.97]"
          >
            Load Session {arc.nextSession} in Timer
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <button
          onClick={handleDismiss}
          className="rounded-full p-1 text-zinc-600 hover:text-zinc-400 transition-colors touch-manipulation"
          aria-label="Dismiss Practice Series reminder"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
