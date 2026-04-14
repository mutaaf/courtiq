// Observation Highlights — pure utility functions
// Coaches "star" observations to build a curated highlights collection
// per player that can be shared with parents.

import type { Observation } from '@/types/database';

/**
 * Returns only observations that have been highlighted (starred) by the coach.
 */
export function filterHighlighted(observations: Observation[]): Observation[] {
  return observations.filter((o) => o.is_highlighted);
}

/**
 * Returns only non-highlighted observations.
 */
export function filterNonHighlighted(observations: Observation[]): Observation[] {
  return observations.filter((o) => !o.is_highlighted);
}

/**
 * Counts how many observations in the list are highlighted.
 */
export function countHighlighted(observations: Observation[]): number {
  return observations.reduce((n, o) => n + (o.is_highlighted ? 1 : 0), 0);
}

/**
 * Returns true when at least one observation in the list is highlighted.
 */
export function hasHighlights(observations: Observation[]): boolean {
  return observations.some((o) => o.is_highlighted);
}

/**
 * Sorts an observation list so highlighted observations come first,
 * then by descending creation time within each group.
 */
export function sortHighlightedFirst(observations: Observation[]): Observation[] {
  return [...observations].sort((a, b) => {
    if (a.is_highlighted !== b.is_highlighted) {
      return a.is_highlighted ? -1 : 1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/**
 * Builds a plain-text highlights summary for parent sharing.
 * Returns null when there are no highlights.
 */
export function buildHighlightsSummary(
  playerName: string,
  observations: Observation[],
): string | null {
  const highlighted = filterHighlighted(observations);
  if (highlighted.length === 0) return null;

  const lines = highlighted.map((o) => {
    const sentiment = o.sentiment === 'positive' ? '✓' : o.sentiment === 'needs-work' ? '→' : '–';
    return `${sentiment} ${o.text}`;
  });

  return [`${playerName}'s Highlights`, ...lines].join('\n');
}
