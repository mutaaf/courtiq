import type { AvailabilityStatus, PlayerAvailability } from '@/types/database';

export const VALID_STATUSES: AvailabilityStatus[] = [
  'available',
  'limited',
  'injured',
  'sick',
  'unavailable',
];

/**
 * Given an array of availability records (possibly multi-player, mixed dates),
 * return a map of player_id → their latest record.
 */
export function deduplicateByPlayer(
  rows: PlayerAvailability[],
): Record<string, PlayerAvailability> {
  const latest: Record<string, PlayerAvailability> = {};
  for (const row of rows) {
    const existing = latest[row.player_id];
    if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
      latest[row.player_id] = row;
    }
  }
  return latest;
}

/**
 * Returns true if a player (identified by player_id) is fully available
 * according to the provided availability map.
 */
export function isPlayerAvailable(
  playerId: string,
  availabilityMap: Record<string, PlayerAvailability>,
): boolean {
  const record = availabilityMap[playerId];
  return !record || record.status === 'available';
}

/**
 * Returns the count of players whose status is NOT 'available'.
 */
export function countUnavailablePlayers(
  playerIds: string[],
  availabilityMap: Record<string, PlayerAvailability>,
): number {
  return playerIds.filter((id) => !isPlayerAvailable(id, availabilityMap)).length;
}
