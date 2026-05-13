'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Zap, X, Timer, AlertCircle } from 'lucide-react';
import { mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';

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
  todaySessionId?: string | null;
}

export function ContinueArcCard({ teamId, coachId, todaySessionId }: ContinueArcCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [arc, setArc] = useState<ArcProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

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

  // arcSession is 0-based index; arc.nextSession is 1-based display number
  const arcSessionIndex = arc.nextSession - 1;
  const timerUrl = (sessionId: string) =>
    `/sessions/${sessionId}/timer?planId=${arc.planId}&arcSession=${arcSessionIndex}`;

  async function handleRun() {
    setError(false);
    setLoading(true);
    try {
      // If there's already a session today, use it
      if (todaySessionId) {
        router.push(timerUrl(todaySessionId));
        return;
      }
      // Otherwise create a new practice session
      if (!coachId) {
        // No coachId available — fall back to plans page
        router.push('/plans');
        return;
      }
      const session = await mutate<any[]>({
        table: 'sessions',
        operation: 'insert',
        data: {
          team_id: teamId,
          coach_id: coachId,
          type: 'practice',
          date: new Date().toISOString().split('T')[0],
        },
        select: 'id',
      });
      const sessionId = Array.isArray(session) ? session[0]?.id : (session as any)?.id;
      if (!sessionId) throw new Error('No session ID returned');
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(teamId) });
      router.push(timerUrl(sessionId));
    } catch {
      setError(true);
      setLoading(false);
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

          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Couldn&apos;t create session — try from Plans
            </p>
          )}

          <button
            onClick={handleRun}
            disabled={loading}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-sky-500/25 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/25 transition-colors touch-manipulation active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Timer className="h-3.5 w-3.5 animate-pulse" />
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
