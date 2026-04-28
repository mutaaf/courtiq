/**
 * Pure utility functions for building announcement text the Practice Timer
 * speaks aloud via Web Speech API. Coaches keep their eyes on the players;
 * audio confirms each drill transition without requiring a phone glance.
 */

export function buildDrillAnnouncement(
  drillName: string,
  durationSecs: number,
  firstCue?: string
): string {
  const mins = Math.round(durationSecs / 60);
  const durationText = mins === 1 ? '1 minute' : `${mins} minutes`;
  const cueText = firstCue ? ` ${firstCue}` : '';
  return `${drillName}. ${durationText}.${cueText}`;
}

export function buildBreakAnnouncement(): string {
  return 'Time! Quick break. Capture an observation now.';
}

export function buildPracticeCompleteAnnouncement(noteCount: number): string {
  if (noteCount === 0) return 'Practice complete! Great work!';
  const obsText = noteCount === 1 ? '1 observation' : `${noteCount} observations`;
  return `Practice complete! You captured ${obsText}. Great work!`;
}

export function buildNextDrillHint(nextDrillName?: string): string {
  if (!nextDrillName) return '';
  return `Next up: ${nextDrillName}.`;
}
