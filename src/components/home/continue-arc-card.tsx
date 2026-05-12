'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Loader2, Zap, X } from 'lucide-react';
import { mutate } from '@/lib/api';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useAppStore } from '@/lib/store';

interface ArcProgress {
  planId: string;
  arcTitle: string;
  nextSession: number;
  totalSessions: number;
  nextSessionTitle: string;
  savedAt: string;
}

export function ContinueArcCard({ teamId }: { teamId: string }) {
  const router = useRouter();
  const { activeTeam, coach } = useActiveTeam();
  const { setPracticeActive, setPracticeSessionId, setPracticeStartedAt } = useAppStore();

  const [arc, setArc] = useState<ArcProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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

  async function handleLoadInTimer() {
    if (!arc || !activeTeam || !coach || isLoading) return;
    setIsLoading(true);
    try {
      const session = await mutate<{ id: string }>({
        table: 'sessions',
        operation: 'insert',
        data: {
          team_id: activeTeam.id,
          coach_id: coach.id,
          type: 'practice',
          date: new Date().toISOString().split('T')[0],
          notes: 'Auto-created practice session',
        },
        select: 'id',
      });
      const id = Array.isArray(session) ? (session as any)[0]?.id : session?.id;
      if (id) {
        setPracticeActive(true);
        setPracticeSessionId(id);
        setPracticeStartedAt(new Date().toISOString());
        // nextSession is 1-indexed; arcSession param is 0-indexed
        router.push(`/sessions/${id}/timer?planId=${arc.planId}&arcSession=${arc.nextSession - 1}`);
      }
    } catch (err) {
      console.warn('Failed to start arc session:', err);
      setIsLoading(false);
    }
  }

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
          <button
            onClick={handleLoadInTimer}
            disabled={isLoading}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-sky-500/25 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/25 disabled:opacity-60 transition-colors touch-manipulation active:scale-[0.97]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                Load Session {arc.nextSession} in Timer
                <ChevronRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
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
