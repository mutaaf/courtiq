'use client';

interface CarryoverStripProps {
  focus?: string[];
}

// Quiet informational strip showing last session's focus areas above the record
// button. Renders nothing when focus is empty, undefined, or the fetch failed —
// it is best-effort and must never gate or disable capture.
export function CarryoverStrip({ focus }: CarryoverStripProps) {
  if (!focus || focus.length === 0) return null;

  return (
    <p
      data-testid="capture-carryover"
      className="text-xs text-zinc-400 text-center max-w-xs"
    >
      <span className="text-zinc-500">Last time: </span>
      {focus.join(' · ')}
    </p>
  );
}
