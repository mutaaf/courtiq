'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Zap, X, Loader2 } from 'lucide-react';
import { mutate } from '@/lib/api';

interface ArcProgress {
  planId: string;
  arcTitle: string;
  nextSession: number;
  totalSessions: number;
  nextSessionTitle: string;
  savedAt: string;
}

interface ContinueArcCardProps {
  teamId: string;
  coachId?: string;
}

export function ContinueArcCard({ teamId, coachId }: ContinueArcCardProps) {
  const router = useRouter();
  const [arc, setArc] = useState<ArcProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);

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

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try { localStorage.removeItem(`arc-progress-${teamId}`); } catch { /* ignore */ }
  }, [teamId]);

  // Creates a new practice session and opens the timer pre-loaded with the arc session.
  const handleLoadInTimer = useCallback(async () => {
    if (!arc || loading) return;
    setLoading(true);
    try {
      const arcSessionIndex = arc.nextSession - 1; // 0-based for URL param
      if (coachId) {
        // Create a fresh session and jump directly to the timer.
        const newSession = await mutate({
          table: 'sessions',
          operation: 'insert',
          data: {
            team_id: teamId,
            coach_id: coachId,
            type: 'practice',
            date: new Date().toISOString().slice(0, 10),
          },
        });
        const sessionId = (newSession as any)?.[0]?.id ?? (newSession as any)?.id;
        if (sessionId) {
          router.push(
            `/sessions/${sessionId}/timer?planId=${arc.planId}&arcSession=${arcSessionIndex}`
          );
          return;
        }
      }
      // Fallback: go to the Plans page so coach can pick or create a session.
      router.push('/plans');
    } catch {
      router.push('/plans');
    } finally {
      setLoading(false);
    }
  }, [arc, coachId, loading, router, teamId]);

  if (!mounted || !arc || dismissed) return null;

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
            disabled={loading}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-sky-500/25 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/25 transition-colors touch-manipulation active:scale-[0.97] disabled:opacity-60 disabled:pointer-events-none"
          >
            {loading ? (
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
