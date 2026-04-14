/**
 * Opponent Scouting Profile utilities
 *
 * Pure functions for creating, filtering, and loading opponent profiles
 * stored as `Plan` records with type='opponent_profile'.
 */

export interface OpponentProfileData {
  name: string;
  strengths: string[];
  weaknesses: string[];
  key_players: string[];
  notes: string;
}

/**
 * Parse comma-separated strings into a trimmed, filtered string array.
 * Empty tokens are removed; each entry is trimmed of whitespace.
 */
export function parseCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Serialize a string array back to a comma-separated display string.
 */
export function serializeToCommaSeparated(arr: string[]): string {
  return arr.join(', ');
}

/**
 * Build a structured `content_structured` object from form field strings
 * ready to persist to the `plans` table.
 */
export function buildOpponentProfileStructured(
  name: string,
  strengths: string,
  weaknesses: string,
  keyPlayers: string,
  notes: string
): OpponentProfileData {
  return {
    name: name.trim(),
    strengths: parseCommaSeparated(strengths),
    weaknesses: parseCommaSeparated(weaknesses),
    key_players: parseCommaSeparated(keyPlayers),
    notes: notes.trim(),
  };
}

/**
 * Given a persisted `content_structured` blob (already typed as
 * OpponentProfileData), reconstruct the gameday form field strings.
 */
export function extractFormFieldsFromProfile(cs: OpponentProfileData): {
  opponent: string;
  strengths: string;
  weaknesses: string;
  keyPlayers: string;
  notes: string;
} {
  return {
    opponent: cs.name ?? '',
    strengths: Array.isArray(cs.strengths) ? serializeToCommaSeparated(cs.strengths) : String(cs.strengths ?? ''),
    weaknesses: Array.isArray(cs.weaknesses) ? serializeToCommaSeparated(cs.weaknesses) : String(cs.weaknesses ?? ''),
    keyPlayers: Array.isArray(cs.key_players) ? serializeToCommaSeparated(cs.key_players) : String(cs.key_players ?? ''),
    notes: cs.notes ?? '',
  };
}

/**
 * Return true if a profile with the same name already exists in the list
 * (case-insensitive comparison).
 */
export function findDuplicateProfile<T extends { title: string | null; type: string }>(
  profiles: T[],
  name: string
): T | undefined {
  const lower = name.trim().toLowerCase();
  return profiles.find(
    (p) => p.type === 'opponent_profile' && (p.title ?? '').toLowerCase() === lower
  );
}

/**
 * Filter a plans list to only opponent profiles, sorted newest-first.
 */
export function filterOpponentProfiles<
  T extends { type: string; created_at: string }
>(plans: T[]): T[] {
  return [...plans]
    .filter((p) => p.type === 'opponent_profile')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * Validate that at least one scouting field (strengths, weaknesses, or key
 * players) has content — prevents saving a completely empty profile.
 */
export function isProfileMeaningful(data: OpponentProfileData): boolean {
  return (
    data.strengths.length > 0 ||
    data.weaknesses.length > 0 ||
    data.key_players.length > 0 ||
    data.notes.trim().length > 0
  );
}
