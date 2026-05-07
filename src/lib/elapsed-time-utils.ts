// Pure utilities for formatting elapsed practice time

export function getElapsedMinutes(startIso: string | null, nowMs: number = Date.now()): number {
  if (!startIso) return 0;
  const elapsedMs = nowMs - new Date(startIso).getTime();
  return Math.max(0, Math.floor(elapsedMs / 60_000));
}

export function formatElapsed(startIso: string | null, nowMs: number = Date.now()): string | null {
  if (!startIso) return null;
  const minutes = getElapsedMinutes(startIso, nowMs);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// True when practice has run long enough that the coach should consider wrapping up
export function shouldShowWrapUpNudge(startIso: string | null, thresholdMin = 40, nowMs: number = Date.now()): boolean {
  if (!startIso) return false;
  return getElapsedMinutes(startIso, nowMs) >= thresholdMin;
}

// True when the coach has been in practice for thresholdMin or more with no observations captured.
// Used to surface a gentle "don't forget to observe!" nudge on the home dashboard.
export function shouldShowCaptureNudge(
  startIso: string | null,
  obsCount: number,
  thresholdMin = 15,
  nowMs: number = Date.now(),
): boolean {
  if (!startIso || obsCount > 0) return false;
  return getElapsedMinutes(startIso, nowMs) >= thresholdMin;
}
