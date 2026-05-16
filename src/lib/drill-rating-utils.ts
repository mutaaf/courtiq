// Utilities for per-team drill effectiveness ratings stored in localStorage.
// Coaches rate each drill 👍/👎 after it completes on the break screen.
// Ratings surface well-rated drills first in the drill picker.

export type DrillRating = 'up' | 'down';

export interface RatedDrill {
  drillId: string;
  rating: DrillRating;
}

// ── Storage key helpers ───────────────────────────────────────────────────────

export function buildRatingKey(teamId: string, drillId: string): string {
  return `drill-rating:${teamId}:${drillId}`;
}

export function buildTeamRatingsPrefix(teamId: string): string {
  return `drill-rating:${teamId}:`;
}

// ── Read / write ──────────────────────────────────────────────────────────────

export function getDrillRating(teamId: string, drillId: string): DrillRating | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(buildRatingKey(teamId, drillId));
    if (raw === 'up' || raw === 'down') return raw;
    return null;
  } catch {
    return null;
  }
}

export function setDrillRating(teamId: string, drillId: string, rating: DrillRating): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(buildRatingKey(teamId, drillId), rating);
  } catch {
    // localStorage quota errors are non-fatal
  }
}

export function clearDrillRating(teamId: string, drillId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(buildRatingKey(teamId, drillId));
  } catch {
    // ignore
  }
}

export function toggleDrillRating(
  teamId: string,
  drillId: string,
  rating: DrillRating,
): DrillRating | null {
  const current = getDrillRating(teamId, drillId);
  if (current === rating) {
    // Tapping the same rating removes it
    clearDrillRating(teamId, drillId);
    return null;
  }
  setDrillRating(teamId, drillId, rating);
  return rating;
}

// ── Predicates ────────────────────────────────────────────────────────────────

export function isUpvoted(teamId: string, drillId: string): boolean {
  return getDrillRating(teamId, drillId) === 'up';
}

export function isDownvoted(teamId: string, drillId: string): boolean {
  return getDrillRating(teamId, drillId) === 'down';
}

export function isRated(teamId: string, drillId: string): boolean {
  return getDrillRating(teamId, drillId) !== null;
}

export function hasRating(rating: DrillRating | null): boolean {
  return rating !== null;
}

// ── Sorting helpers ───────────────────────────────────────────────────────────

export type RatableItem = { id: string };

export function getRatingSortKey(teamId: string, drillId: string): number {
  const r = getDrillRating(teamId, drillId);
  if (r === 'up') return -1;   // float to top
  if (r === 'down') return 1;  // sink to bottom
  return 0;
}

export function sortDrillsByRating<T extends RatableItem>(drills: T[], teamId: string): T[] {
  return [...drills].sort(
    (a, b) => getRatingSortKey(teamId, a.id) - getRatingSortKey(teamId, b.id),
  );
}

export function filterUpvotedDrills<T extends RatableItem>(drills: T[], teamId: string): T[] {
  return drills.filter((d) => isUpvoted(teamId, d.id));
}

export function filterDownvotedDrills<T extends RatableItem>(drills: T[], teamId: string): T[] {
  return drills.filter((d) => isDownvoted(teamId, d.id));
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function getRatingIcon(rating: DrillRating | null): string {
  if (rating === 'up') return '👍';
  if (rating === 'down') return '👎';
  return '';
}

export function getRatingLabel(rating: DrillRating | null): string {
  if (rating === 'up') return 'Great for our team';
  if (rating === 'down') return 'Needs adjustment';
  return '';
}

export function getRatingAriaLabel(rating: DrillRating, currentRating: DrillRating | null): string {
  const isActive = currentRating === rating;
  if (rating === 'up') return isActive ? 'Remove upvote' : 'This drill works well for our team';
  return isActive ? 'Remove downvote' : 'This drill needs adjustment for our team';
}

export function formatRatingPrompt(drillName: string): string {
  return `How did ${drillName} go?`;
}

// ── Counts ────────────────────────────────────────────────────────────────────

export function countUpvotedDrills<T extends RatableItem>(drills: T[], teamId: string): number {
  return drills.filter((d) => isUpvoted(teamId, d.id)).length;
}

export function countDownvotedDrills<T extends RatableItem>(drills: T[], teamId: string): number {
  return drills.filter((d) => isDownvoted(teamId, d.id)).length;
}

export function countRatedDrills<T extends RatableItem>(drills: T[], teamId: string): number {
  return drills.filter((d) => isRated(teamId, d.id)).length;
}
