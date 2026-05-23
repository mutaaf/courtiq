'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { ActiveArcResponse } from '@/app/api/ai/practice-arc/active/route';

interface ArcContinuityLineProps {
  /**
   * Result of the best-effort GET /api/ai/practice-arc/active read (ticket 0018).
   * `undefined` while loading or after a failed/timed-out fetch, `null` when the
   * team has no active arc — the line renders nothing in those cases so it can
   * never gate or block capture (mirrors the 0008 usage-meter degrade-silently
   * behavior).
   */
  arc?: ActiveArcResponse | null;
}

/**
 * Quiet, dismissible continuity line shown above the record control on Capture
 * (ticket 0020). Surfaces the team's active Practice Arc so a coach mid-practice
 * picks up the thread — "Defense Arc · session 2 of 3 · today: build on closeouts"
 * — without flipping back to the planning screen.
 *
 * It is a pure presentational component: it consumes the SAME active-arc read the
 * /plans continuity line and home ContinueArcCard use (ticket 0018) so Capture,
 * Plans, and Home never disagree on "what session am I in / what carries forward."
 * It is best-effort and informational; it never disables the record button. The
 * carried-forward focus is the current session's key_coaching_point, falling back
 * to its carries_forward when the coaching point is absent.
 */
export function ArcContinuityLine({ arc }: ArcContinuityLineProps) {
  // Session-scoped, in-memory dismissal only — no new storage (ticket out-of-scope).
  const [dismissed, setDismissed] = useState(false);

  // Best-effort: render nothing while loading / on fetch failure (undefined), when
  // there is no active arc (null), or once the coach has dismissed it this session.
  if (!arc || dismissed) return null;

  // The carried-forward focus for today: prefer the explicit coaching point, fall
  // back to the carried-forward note so the line still has a "today" thread.
  const carriedForward =
    arc.currentSession?.key_coaching_point?.trim() ||
    arc.currentSession?.carries_forward?.trim() ||
    null;

  return (
    <div
      data-testid="arc-continuity-line"
      className="flex w-full max-w-xs items-center gap-2 text-xs text-zinc-400"
    >
      <p className="flex-1 leading-snug">
        <span className="font-medium text-zinc-300">{arc.arc_title}</span>
        <span className="text-zinc-600"> · </span>
        <span className="tabular-nums text-orange-400">
          session {arc.currentSessionNumber} of {arc.total_sessions}
        </span>
        {carriedForward && (
          <>
            <span className="text-zinc-600"> · </span>
            <span className="text-zinc-500">today: {carriedForward}</span>
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss Practice Arc reminder"
        className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-colors hover:text-zinc-400 touch-manipulation active:scale-95"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
