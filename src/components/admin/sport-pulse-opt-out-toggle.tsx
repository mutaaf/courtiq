'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Ticket 0091 — sport-pulse opt-out toggle, mounted on the /admin
// director surface. Lets the director opt their program OUT of being
// NAMED on the sport-wide convergence pulse (the line surfaced on
// every coach's Capture surface). The opt-out is program-scoped only —
// the quantity signal (distinctProgramCount) still honors the program
// because the count is honest; only the named-program signal is
// private when this toggle is ON.
//
// Tier posture: FREE. Every director can opt out regardless of tier.
// Privacy trumps growth.
//
// LESSONS#0029 / #0082 — data-testid scoping.
// LESSONS#0044 — the server route is the load-bearing gate; this UI
// is a convenience.

interface SportPulseOptOutToggleProps {
  orgId?: string | null;
  isAdmin: boolean;
}

export function SportPulseOptOutToggleSection({ orgId, isAdmin }: SportPulseOptOutToggleProps) {
  // Hide for non-director callers — the route enforces the same gate
  // server-side, but the UI is shaped around the director's posture.
  if (!isAdmin || !orgId) return null;
  return <Toggle orgId={orgId} />;
}

function Toggle({ orgId }: { orgId: string }) {
  const [optedOut, setOptedOut] = useState<boolean | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Read the current opt-out state via the generic data route's
        // organizations table (already allow-listed for this column
        // post-076). Falls back to FALSE on any read failure.
        const res = await fetch(
          `/api/data?table=organizations&select=opted_out_of_sport_pulse&id=${encodeURIComponent(orgId)}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          setOptedOut(false);
          return;
        }
        const data = await res.json();
        const row = Array.isArray(data?.rows) ? data.rows[0] : null;
        setOptedOut(row?.opted_out_of_sport_pulse === true);
      } catch {
        if (!cancelled) setOptedOut(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  async function handleToggle(next: boolean) {
    setState('saving');
    try {
      const res = await fetch('/api/admin/sport-pulse-opt-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, optedOut: next }),
      });
      if (!res.ok) {
        setState('error');
        return;
      }
      setOptedOut(next);
      setState('idle');
    } catch {
      setState('error');
    }
  }

  if (optedOut === null) {
    // Still loading the initial state — render nothing rather than
    // flashing a misleading default.
    return null;
  }

  return (
    <Card data-testid="sport-pulse-opt-out-toggle">
      <CardHeader>
        <CardTitle className="text-base">Sport-wide pulse appearance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-zinc-400">
          When 25+ programs across your sport ship the same skill in a week,
          SportsIQ may name your program on the pulse line every coach in the
          sport sees on Capture. Opt out below to keep your program out of
          the named list; the count still includes you so the signal is honest.
        </p>
        <label className="inline-flex items-center gap-3">
          <input
            type="checkbox"
            data-testid="sport-pulse-opt-out-checkbox"
            checked={optedOut}
            disabled={state === 'saving'}
            onChange={(e) => handleToggle(e.target.checked)}
            className="h-5 w-5 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500"
          />
          <span className="text-zinc-300">
            Keep my program out of the named list on the sport-wide pulse
          </span>
        </label>
        {state === 'error' ? (
          <p className="text-xs text-red-400">
            That did not save. Try once more.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
