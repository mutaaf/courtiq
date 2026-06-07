'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Users, ArrowRight } from 'lucide-react';

// ─── Ticket 0072 — dormant-coach reactivation card ──────────────────────────
//
// Pulled to the top of the home feed (above the season-wrap card) when the
// caller coach has ≥1 unconsumed reactivation signal — a parent who lived the
// value of THIS coach's reports in a prior season has just opened the parent
// portal of a DIFFERENT team's kid. The card carries the prior PLAYER'S first
// name + the prior team name + a deep-link to the existing 0061 player-
// trajectory surface (`/roster/[playerId]/trajectory`).
//
// Voice contract (LESSONS#0023): instructed positively. No "amazing" /
// "journey" / "elevate" — just "is back on SportsIQ this week, see how Liam
// finished the season with you."
//
// Tier posture: NO new tier feature key. The reactivation surface is
// universal — the dormant coach the product MOST wants to reactivate is
// often the free coach who churned. The deep-link target (the 0061
// trajectory page) carries its EXISTING tier gate posture untouched.
//
// COPPA: the surface renders ONLY the prior player's first name (data the
// coach already has) and the prior team's name (data the coach already
// has — they coached that team). NO parent email, NO parent first name,
// NO parent phone, NO relationship label. The signal id is the only
// per-row identifier exposed to the client, used to POST consume.

export interface ReturningParentSignal {
  id: string;
  priorPlayerId: string;
  priorPlayerFirstName: string;
  priorTeamName: string;
  firedAt: string;
}

interface CardProps {
  signals: ReturningParentSignal[];
  onConsume: (signalId: string) => void;
  isConsuming?: boolean;
}

/** Pure presentational card. Renders nothing when signals is empty. */
export function ReturningParentCard({ signals, onConsume, isConsuming }: CardProps) {
  if (!signals || signals.length === 0) return null;

  // Cycle to the most-recent signal; the API already orders by fired_at desc.
  const current = signals[0];
  const remainingCount = signals.length - 1;
  const firstName = current.priorPlayerFirstName || 'your player';

  return (
    <div
      data-testid="returning-parent-card"
      className="mb-4 rounded-xl border border-orange-500/30 bg-zinc-900 p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/10">
          <Users className="h-4 w-4 text-orange-500" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100">
            <span className="font-semibold">{firstName}</span>&apos;s parent is back on SportsIQ this week
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            They opened a parent portal for their other kid&apos;s team
            {current.priorTeamName ? <> — and {firstName} was on your {current.priorTeamName}.</> : '.'}
          </p>
          {remainingCount > 0 && (
            <span
              data-testid="returning-parent-card-more-pill"
              className="mt-2 inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-300"
            >
              + {remainingCount} more
            </span>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Link
              href={`/roster/${current.priorPlayerId}/trajectory`}
              data-testid="returning-parent-card-see-season"
              className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
            >
              See {firstName}&apos;s season
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
            <button
              type="button"
              data-testid="returning-parent-card-got-it"
              onClick={() => onConsume(current.id)}
              disabled={!!isConsuming}
              className="inline-flex items-center rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Container that fetches the unconsumed signals + handles consume. The
 *  /home page mounts this; it does the GET, calls the consume POST, and
 *  optimistically removes the consumed signal from the local cache. */
export function ReturningParentSection() {
  const queryClient = useQueryClient();
  const [isConsuming, setIsConsuming] = useState(false);

  const { data } = useQuery({
    queryKey: ['coach-reactivation-signals'],
    staleTime: 60 * 1000,
    retry: false,
    queryFn: async (): Promise<{ signals: ReturningParentSignal[] }> => {
      const res = await fetch('/api/coach/reactivation-signals');
      if (!res.ok) return { signals: [] };
      return (await res.json()) as { signals: ReturningParentSignal[] };
    },
  });

  const signals = data?.signals ?? [];
  if (signals.length === 0) return null;

  async function handleConsume(signalId: string) {
    if (isConsuming) return;
    setIsConsuming(true);
    try {
      await fetch('/api/coach/reactivation-signals/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalId }),
      });
      // Optimistic: drop the consumed signal from the cached list. The
      // next refetch will surface the next-most-recent unconsumed
      // signal (if any).
      queryClient.setQueryData(['coach-reactivation-signals'], (prev: unknown) => {
        const previous = (prev as { signals?: ReturningParentSignal[] } | undefined)?.signals ?? [];
        return { signals: previous.filter((s) => s.id !== signalId) };
      });
    } catch {
      // Best-effort: never throw on the home screen.
    } finally {
      setIsConsuming(false);
    }
  }

  return <ReturningParentCard signals={signals} onConsume={handleConsume} isConsuming={isConsuming} />;
}
