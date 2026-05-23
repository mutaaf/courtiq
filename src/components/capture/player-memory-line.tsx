'use client';

interface PlayerMemoryLineProps {
  /**
   * Result of the best-effort GET /api/capture/player-memory read (ticket 0025).
   * `undefined`/`null` while loading, when the player has no prior observations,
   * or after a failed/timed-out fetch — the line renders nothing in those cases
   * so it can never gate or block capture (mirrors the 0014 carryover strip and
   * the 0008 usage-meter degrade-silently behavior).
   */
  lastNeedsWork?: string | null;
  lastPositive?: string | null;
}

/**
 * Quiet per-player memory line shown near the record control on Capture (ticket
 * 0025). When the coach focuses a player, it surfaces that player's most recent
 * prior needs-work note (and a recent positive) — "Last time — needs work:
 * hesitated on closeouts" — so the coach coaches the same kid toward the same
 * thing across weeks instead of starting from scratch.
 *
 * Pure presentational component built on the player's OWN stored observations.
 * It renders nothing when there's no history (or while loading / on fetch
 * failure) and carries no interactive control that could disable capture.
 */
export function PlayerMemoryLine({ lastNeedsWork, lastPositive }: PlayerMemoryLineProps) {
  // Best-effort: nothing to remind the coach of → render nothing.
  if (!lastNeedsWork && !lastPositive) return null;

  return (
    <div
      data-testid="player-memory-line"
      className="w-full max-w-xs space-y-0.5 text-xs leading-snug text-zinc-400"
    >
      {lastNeedsWork && (
        <p>
          <span className="text-zinc-500">Last time — </span>
          <span className="text-amber-400">needs work: </span>
          <span className="text-zinc-300">{lastNeedsWork}</span>
        </p>
      )}
      {lastPositive && (
        <p>
          <span className="text-zinc-500">Last time — </span>
          <span className="text-emerald-400">strong: </span>
          <span className="text-zinc-300">{lastPositive}</span>
        </p>
      )}
    </div>
  );
}
