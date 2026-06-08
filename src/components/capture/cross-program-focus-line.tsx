'use client';

import { useState } from 'react';
import type { CrossProgramFocusResponse } from '@/app/api/sport/emergent-focus/route';

interface CrossProgramFocusLineProps {
  /** Result of the best-effort GET /api/sport/emergent-focus read
   *  (ticket 0075). `undefined`/`null` while loading, when no convergence
   *  exists, or after a failed/timed-out fetch — the line renders nothing
   *  in those cases so it can never gate or block capture (mirrors the
   *  0014 carryover strip, 0020 arc continuity line, 0025 player memory
   *  line, 0031 program focus line). */
  data?: CrossProgramFocusResponse | null;
  /** Display name for the caller's sport — "basketball", "soccer",
   *  "flag_football". The component does not own the sport-lookup; the
   *  Capture parent resolves it from the active team and passes it down. */
  sportName: string;
}

// Quiet cross-program signal line surfaced on Capture (ticket 0075). When the
// route returns a focus with a drill, the line reads:
//
//   "Three coaches in <sport> are on <skill> this week too — the drill
//    they're running most: '<drill.name>' — <duration> minutes."
//
// When `focus.drill` is null, the line reads only:
//
//   "Three coaches in <sport> are on <skill> this week too."
//
// When `focus` is null (no cross-program convergence), the component renders
// NOTHING so the 0014 carryover surface is byte-identical (silence beats nag).
//
// The Save button — present only when a drill is attached — POSTs to the
// existing 0064 /api/drill-shares/<token>/clone endpoint with the opaque
// sourceDrillShareId. After a successful clone, the button reads "Saved" and
// disables. On a failure, the button reverts (best-effort posture per
// LESSONS#0036). Tier gate: NO — the line is available to every tier; the
// clone POST carries its existing free-for-every-tier posture untouched.
//
// Voice contract (LESSONS#0023): every copy variant is positively phrased; no
// banned words (journey / amazing / exciting / elevate / empower / synergy /
// unlock). The numeric posture matches 0071/0073 — counts spelled out at the
// minimum threshold ("Three coaches" for the cross-program floor of 3).
export function CrossProgramFocusLine({
  data,
  sportName,
}: CrossProgramFocusLineProps) {
  const [cloneState, setCloneState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Best-effort posture: nothing to surface → render nothing.
  if (!data || !data.focus) return null;

  const { skill, distinctProgramCount, drill } = data.focus;
  const countWord = spelledCount(distinctProgramCount);

  async function handleSave() {
    if (!drill) return;
    setCloneState('saving');
    try {
      const res = await fetch(`/api/drill-shares/${drill.sourceDrillShareId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        // Best-effort: revert so the coach can retry. Never throws into
        // Capture — the clone is a side-channel optimization, not the
        // primary action on this surface.
        setCloneState('idle');
        return;
      }
      setCloneState('saved');
    } catch {
      setCloneState('idle');
    }
  }

  return (
    <div
      data-testid="cross-program-focus-line"
      className="flex w-full max-w-sm flex-col items-center gap-2 text-center"
    >
      <p className="text-xs leading-snug text-zinc-400">
        <span className="text-zinc-300">{countWord} coaches</span>{' '}
        <span className="text-zinc-500">in {sportName} are on</span>{' '}
        <span className="text-zinc-300">{skill}</span>{' '}
        <span className="text-zinc-500">this week too</span>
        {drill ? (
          <>
            <span className="text-zinc-500">{' — the drill they’re running most: '}</span>
            <span className="text-zinc-300">&lsquo;{drill.name}&rsquo;</span>
            {drill.duration_minutes ? (
              <>
                <span className="text-zinc-500">{' — '}</span>
                <span className="text-zinc-300">{drill.duration_minutes} minutes</span>
              </>
            ) : null}
            <span className="text-zinc-500">.</span>
          </>
        ) : (
          <span className="text-zinc-500">.</span>
        )}
      </p>

      {drill ? (
        cloneState === 'saved' ? (
          <button
            type="button"
            disabled
            className="min-h-[44px] rounded-full bg-emerald-500/15 border border-emerald-500/30 px-4 py-3 text-xs font-medium text-emerald-300"
          >
            Saved
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={cloneState === 'saving'}
            className="min-h-[44px] rounded-full bg-orange-500/20 border border-orange-500/30 px-4 py-3 text-xs font-medium text-orange-300 hover:bg-orange-500/30 active:scale-[0.98] touch-manipulation disabled:opacity-60"
          >
            {cloneState === 'saving' ? 'Saving…' : 'Save to my drills'}
          </button>
        )
      ) : null}
    </div>
  );
}

// Numeric-posture helper — small counts are spelled out (matching the
// existing 0071 / 0073 posture); larger counts fall back to digits so the
// line stays readable.
function spelledCount(n: number): string {
  const words: Record<number, string> = {
    3: 'Three',
    4: 'Four',
    5: 'Five',
    6: 'Six',
    7: 'Seven',
    8: 'Eight',
    9: 'Nine',
    10: 'Ten',
  };
  return words[n] ?? String(n);
}
