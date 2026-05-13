'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, X, Loader2 } from 'lucide-react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { mutate } from '@/lib/api';

interface ArcProgress {
  planId: string;
  arcTitle: string;
  nextSession: number;   // 1-based session number for display
  totalSessions: number;
  nextSessionTitle: string;
  savedAt: string;
}

export function ContinueArcCard({ teamId }: { teamId: string }) {
  const router = useRouter();
  const { coach } = useActiveTeam();
  const [arc, setArc] = useState<ArcProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState(false);

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

  // Create a new session then navigate straight to the timer with the arc
  // session pre-loaded — skips the Plans page + modal entirely.
  async function handleLaunch() {
    if (launching || !coach || !arc) return;
    // Capture arc values before the async call — state could change
    const { planId, nextSession } = arc;
    setLaunching(true);
    setLaunchError(false);
    try {
      const newSession = await mutate<{ id: string }>({
        table: 'sessions',
        operation: 'insert',
        data: {
          team_id: teamId,
          coach_id: coach.id,
          type: 'practice',
          date: new Date().toISOString().slice(0, 10),
        },
        select: 'id',
      });
      const sessionId = Array.isArray(newSession)
        ? (newSession as any)[0]?.id
        : (newSession as any)?.id;
      if (!sessionId) throw new Error('no session id');
      // arcSession param is 0-based; nextSession is 1-based
      router.push(
        `/sessions/${sessionId}/timer?planId=${planId}&arcSession=${nextSession - 1}`
      );
    } catch {
      setLaunchError(true);
      setLaunching(false);
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
            Session {arc.nextSession} of {arc.totalSessions} — ready to run
          </p>
          {arc.nextSessionTitle && (
            <p className="mt-0.5 text-xs text-zinc-500 italic truncate">{arc.nextSessionTitle}</p>
          )}

          {launchError && (
            <p className="mt-2 text-xs text-red-400">
              Couldn&apos;t start session — check connection and try again.
            </p>
          )}

          <button
            onClick={handleLaunch}
            disabled={launching}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-sky-500/25 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/25 disabled:opacity-60 transition-colors touch-manipulation active:scale-[0.97]"
          >
            {launching ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" />
                Start Session {arc.nextSession} Now
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
