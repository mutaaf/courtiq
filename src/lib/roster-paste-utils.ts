/**
 * roster-paste-utils.ts
 *
 * Pure utility functions for parsing a pasted roster text block
 * (one player name per line) into a list of valid names and a
 * separate list of skipped lines so callers can surface warnings.
 *
 * Used by:
 *  - src/app/(auth)/onboarding/roster/page.tsx
 *  - src/app/(dashboard)/roster/add/page.tsx
 */

export const ROSTER_NAME_MIN = 2;
export const ROSTER_NAME_MAX = 60;

export interface ParseRosterResult {
  /** Names that passed validation, trimmed. */
  names: string[];
  /** Raw lines that were non-empty but failed validation (too short/long). */
  skipped: string[];
}

/**
 * Parse a multi-line paste into valid player names and skipped lines.
 * A line is valid when, after trimming, its length is in [min, max].
 * Blank / whitespace-only lines are silently ignored (not counted as skipped).
 */
export function parseRosterPaste(
  text: string,
  min = ROSTER_NAME_MIN,
  max = ROSTER_NAME_MAX,
): ParseRosterResult {
  const names: string[] = [];
  const skipped: string[] = [];

  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;        // blank line — ignore
    if (trimmed.length >= min && trimmed.length <= max) {
      names.push(trimmed);
    } else {
      skipped.push(trimmed);                   // non-blank but out-of-range
    }
  }

  return { names, skipped };
}

/** Format a human-readable warning for skipped lines, or null when none. */
export function buildSkippedWarning(skipped: string[]): string | null {
  if (skipped.length === 0) return null;
  const n = skipped.length;
  return `${n} line${n === 1 ? ' was' : 's were'} skipped (name must be ${ROSTER_NAME_MIN}–${ROSTER_NAME_MAX} characters).`;
}

/** Deduplicate names case-insensitively, preserving the first occurrence. */
export function deduplicateNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Return names that already exist in the roster (case-insensitive match). */
export function findDuplicatesAgainstRoster(
  names: string[],
  existingNames: string[],
): string[] {
  const existing = new Set(existingNames.map((n) => n.toLowerCase()));
  return names.filter((n) => existing.has(n.toLowerCase()));
}
