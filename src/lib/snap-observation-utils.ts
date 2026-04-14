/**
 * Pure utility functions for Snap Observation (photo-based coaching analysis).
 *
 * All functions are side-effect free and fully testable without mocking.
 */

import type { Sentiment } from '@/types/database';

export interface RawSnapObservation {
  player_name: string;
  category: string;
  sentiment: string;
  text: string;
  skill_id?: string | null;
}

export interface ValidSnapObservation {
  player_name: string;
  category: string;
  sentiment: Sentiment;
  text: string;
  skill_id: string | null;
}

const VALID_SENTIMENTS = new Set<string>(['positive', 'needs-work', 'neutral']);

/**
 * Returns true if the sentiment value is a valid Sentiment enum member.
 */
export function isValidSentiment(value: string): value is Sentiment {
  return VALID_SENTIMENTS.has(value);
}

/**
 * Validates and normalises a single raw snap observation.
 * Returns null if the observation is structurally invalid.
 */
export function parseSnapObservation(raw: RawSnapObservation): ValidSnapObservation | null {
  if (!raw.player_name?.trim()) return null;
  if (!raw.category?.trim()) return null;
  if (!raw.text?.trim() || raw.text.trim().length < 5) return null;
  if (!isValidSentiment(raw.sentiment)) return null;

  return {
    player_name: raw.player_name.trim(),
    category: raw.category.trim(),
    sentiment: raw.sentiment as Sentiment,
    text: raw.text.trim(),
    skill_id: raw.skill_id ?? null,
  };
}

/**
 * Filters and validates an array of raw snap observations.
 * Invalid items are silently dropped.
 */
export function filterValidObservations(raws: RawSnapObservation[]): ValidSnapObservation[] {
  return raws.flatMap((r) => {
    const parsed = parseSnapObservation(r);
    return parsed ? [parsed] : [];
  });
}

/**
 * Groups observations by player_name.
 * Team observations (player_name === 'Team') are placed under the 'Team' key.
 */
export function groupObservationsByPlayer(
  obs: ValidSnapObservation[]
): Record<string, ValidSnapObservation[]> {
  const groups: Record<string, ValidSnapObservation[]> = {};
  for (const o of obs) {
    const key = o.player_name;
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  }
  return groups;
}

/**
 * Counts observations by sentiment across an array.
 */
export function countBySentiment(obs: ValidSnapObservation[]): Record<Sentiment, number> {
  const counts: Record<Sentiment, number> = { positive: 0, 'needs-work': 0, neutral: 0 };
  for (const o of obs) {
    counts[o.sentiment] = (counts[o.sentiment] ?? 0) + 1;
  }
  return counts;
}

/**
 * Sorts observations: positive first, then neutral, then needs-work.
 * Within each group, preserves original order.
 */
export function sortObservationsByValence(obs: ValidSnapObservation[]): ValidSnapObservation[] {
  const ORDER: Record<Sentiment, number> = { positive: 0, neutral: 1, 'needs-work': 2 };
  return [...obs].sort((a, b) => ORDER[a.sentiment] - ORDER[b.sentiment]);
}

/**
 * Returns true when an array of observations contains at least one
 * valid (non-empty) observation.
 */
export function hasObservations(obs: RawSnapObservation[]): boolean {
  return filterValidObservations(obs).length > 0;
}

/**
 * Builds a human-readable summary string from a list of observations.
 * Used for display in the Media tab and notification text.
 * Example: "3 observations — 2 positive, 1 needs-work"
 */
export function buildObservationSummary(obs: ValidSnapObservation[]): string {
  if (obs.length === 0) return 'No observations';
  const counts = countBySentiment(obs);
  const parts: string[] = [];
  if (counts.positive > 0) parts.push(`${counts.positive} positive`);
  if (counts['needs-work'] > 0) parts.push(`${counts['needs-work']} needs-work`);
  if (counts.neutral > 0) parts.push(`${counts.neutral} neutral`);
  return `${obs.length} observation${obs.length !== 1 ? 's' : ''} — ${parts.join(', ')}`;
}

/**
 * Deduplicates observations by exact text match.
 * Keeps first occurrence of any duplicate text.
 */
export function deduplicateObservations(obs: ValidSnapObservation[]): ValidSnapObservation[] {
  const seen = new Set<string>();
  return obs.filter((o) => {
    const key = o.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Returns true when the image is likely NOT a sports photo based on the
 * AI-generated description (used to gate the save button with a warning).
 */
export function isLikelyNonSportsPhoto(imageDescription: string): boolean {
  const desc = imageDescription.toLowerCase();
  return (
    desc.includes('not a sports') ||
    desc.includes('no athletes') ||
    desc.includes('blurry') ||
    desc.includes('unclear image') ||
    desc.includes('cannot identify') ||
    desc.includes('no players')
  );
}
