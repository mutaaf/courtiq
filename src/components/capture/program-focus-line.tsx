'use client';

import { Target } from 'lucide-react';

interface ProgramFocusLineProps {
  /**
   * The program director's org-scoped weekly focus (ticket 0031), or null/undefined
   * when none is set or the best-effort read failed. The line renders nothing in
   * those cases so it can never gate capture.
   */
  focus?: string | null;
}

/**
 * A single passive line at the top of Capture showing the program director's
 * weekly focus — "Program focus this week: spacing & off-ball movement"
 * (ticket 0031). It is a LABEL, never a gate: no popup, no dismiss-to-continue,
 * no tap before the coach can capture. Renders nothing when no focus is set so a
 * coach in an org without a focus sees Capture exactly as before.
 */
export function ProgramFocusLine({ focus }: ProgramFocusLineProps) {
  const trimmed = focus?.trim();
  if (!trimmed) return null;

  return (
    <p
      data-testid="program-focus-line"
      className="flex w-full max-w-xs items-center justify-center gap-1.5 text-xs text-zinc-400"
    >
      <Target className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-hidden="true" />
      <span>
        <span className="text-zinc-500">Program focus this week: </span>
        <span className="font-medium text-zinc-300">{trimmed}</span>
      </span>
    </p>
  );
}
