/**
 * Drill Favorites — pure utility module
 *
 * Favorites are stored in coach.preferences.favorited_drills as a string[]
 * of drill IDs.  All functions are side-effect-free so they're easily testable.
 */

import type { Drill } from '@/types/database';

/** Returns true when a drill is in the favorites list. */
export function isFavorited(drillId: string, favoriteIds: string[]): boolean {
  return favoriteIds.includes(drillId);
}

/**
 * Toggles a drill ID in the favorites array.
 * Returns a NEW array — does not mutate the original.
 */
export function toggleFavorite(drillId: string, favoriteIds: string[]): string[] {
  if (favoriteIds.includes(drillId)) {
    return favoriteIds.filter((id) => id !== drillId);
  }
  return [...favoriteIds, drillId];
}

/**
 * Adds a drill ID to the favorites array.
 * Returns the original array unchanged if the drill is already favorited.
 */
export function addFavorite(drillId: string, favoriteIds: string[]): string[] {
  if (favoriteIds.includes(drillId)) return favoriteIds;
  return [...favoriteIds, drillId];
}

/**
 * Removes a drill ID from the favorites array.
 * Returns the original array unchanged if the drill is not favorited.
 */
export function removeFavorite(drillId: string, favoriteIds: string[]): string[] {
  if (!favoriteIds.includes(drillId)) return favoriteIds;
  return favoriteIds.filter((id) => id !== drillId);
}

/**
 * Sorts a drills array so favorited drills appear first,
 * preserving relative order within each group.
 */
export function sortWithFavoritesFirst(drills: Drill[], favoriteIds: string[]): Drill[] {
  const favSet = new Set(favoriteIds);
  const favorited: Drill[] = [];
  const rest: Drill[] = [];
  for (const drill of drills) {
    if (favSet.has(drill.id)) {
      favorited.push(drill);
    } else {
      rest.push(drill);
    }
  }
  return [...favorited, ...rest];
}

/**
 * Filters a drills array to only those in the favorites list.
 */
export function filterToFavorites(drills: Drill[], favoriteIds: string[]): Drill[] {
  const favSet = new Set(favoriteIds);
  return drills.filter((d) => favSet.has(d.id));
}

/**
 * Returns the count of drills that are currently favorited.
 * Handles deduplication so duplicate IDs aren't double-counted.
 */
export function countFavorites(favoriteIds: string[]): number {
  return new Set(favoriteIds).size;
}

/**
 * Parses the favorited_drills list out of a raw preferences object,
 * tolerating null, undefined, or malformed data.
 */
export function parseFavoritedDrills(preferences: unknown): string[] {
  if (!preferences || typeof preferences !== 'object') return [];
  const prefs = preferences as Record<string, unknown>;
  const raw = prefs['favorited_drills'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}
