// Pure utilities for Practice Timer background compensation.
// When the page goes hidden (screen lock, app switch) the setInterval countdown
// is throttled by the browser. On return we subtract wall-clock elapsed time.

export interface BackgroundAdjustResult {
  newTimeLeft: number;
  elapsedSecs: number;
  didExpire: boolean;
}

export function computeBackgroundAdjustment(
  currentTimeLeft: number,
  hiddenAtMs: number,
  nowMs: number,
): BackgroundAdjustResult {
  const elapsedMs = Math.max(0, nowMs - hiddenAtMs);
  const elapsedSecs = Math.floor(elapsedMs / 1000);
  const newTimeLeft = Math.max(0, currentTimeLeft - elapsedSecs);
  return {
    newTimeLeft,
    elapsedSecs,
    didExpire: newTimeLeft === 0,
  };
}

export function shouldApplyAdjustment(elapsedSecs: number): boolean {
  return elapsedSecs >= 1;
}

export function shouldShowAdjustmentToast(elapsedSecs: number): boolean {
  return elapsedSecs >= 10;
}

export function formatAdjustmentLabel(elapsedSecs: number): string {
  const mins = Math.floor(elapsedSecs / 60);
  const secs = elapsedSecs % 60;
  if (mins > 0 && secs > 0) return `${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m`;
  return `${secs}s`;
}

export function buildAdjustmentMessage(elapsedSecs: number): string {
  return `Timer adjusted ${formatAdjustmentLabel(elapsedSecs)} for background`;
}

export function clampTimeLeft(timeLeft: number): number {
  return Math.max(0, Math.round(timeLeft));
}

export function computeRemainingAfterBackground(
  timeLeftSecs: number,
  backgroundDurationMs: number,
): number {
  const elapsedSecs = Math.floor(backgroundDurationMs / 1000);
  return Math.max(0, timeLeftSecs - elapsedSecs);
}

export function isBackgroundDurationSignificant(durationMs: number): boolean {
  return durationMs >= 1000;
}

export function formatTimeLeftDisplay(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
