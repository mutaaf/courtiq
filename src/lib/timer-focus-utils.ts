// Pure utility functions for computing player focus callouts in the Practice Timer.
// Shows which players most need attention for the current drill's skill category
// based on recent needs-work observations — closing the observe→act coaching loop.

export interface NeedsWorkObs {
  player_id: string | null;
  category: string;
}

export interface PlayerRef {
  id: string;
  name: string;
  jersey_number?: number | string | null;
}

export interface PlayerFocus {
  playerId: string;
  playerName: string; // first name only
  jerseyNumber?: number | string | null;
  count: number;      // number of needs-work obs in this category (last 30 days)
}

// Normalize category for comparison (lowercase, trimmed)
export function normalizeCategory(cat: string): string {
  return cat.trim().toLowerCase();
}

// Count needs-work observations per player for a specific category
export function countObsByPlayerForCategory(
  category: string,
  obs: NeedsWorkObs[]
): Record<string, number> {
  const norm = normalizeCategory(category);
  const counts: Record<string, number> = {};
  for (const o of obs) {
    if (!o.player_id) continue;
    if (normalizeCategory(o.category) === norm) {
      counts[o.player_id] = (counts[o.player_id] ?? 0) + 1;
    }
  }
  return counts;
}

// Returns the first name of a player (splits on space)
export function getFirstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName;
}

// Returns up to `maxResults` players who most need work on the given skill category.
// Only includes players present in the `players` roster.
export function getPlayerFocusForCategory(
  category: string | undefined,
  needsWorkObs: NeedsWorkObs[],
  players: PlayerRef[],
  maxResults = 2
): PlayerFocus[] {
  if (!category || needsWorkObs.length === 0 || players.length === 0) return [];

  const counts = countObsByPlayerForCategory(category, needsWorkObs);

  // Build player id set for quick lookup
  const playerMap = new Map(players.map((p) => [p.id, p]));

  return (
    Object.entries(counts)
      .filter(([playerId]) => playerMap.has(playerId))
      .sort((a, b) => b[1] - a[1]) // highest count first
      .slice(0, maxResults)
      .map(([playerId, count]) => {
        const p = playerMap.get(playerId)!;
        return {
          playerId,
          playerName: getFirstName(p.name),
          jerseyNumber: p.jersey_number,
          count,
        };
      })
  );
}

// Returns true if there are enough observations to show meaningful focus callouts
// (at least 1 player with 2+ needs-work obs in any category)
export function hasEnoughObsForFocus(obs: NeedsWorkObs[]): boolean {
  const playerCategoryCounts: Record<string, number> = {};
  for (const o of obs) {
    if (!o.player_id) continue;
    const key = `${o.player_id}::${normalizeCategory(o.category)}`;
    playerCategoryCounts[key] = (playerCategoryCounts[key] ?? 0) + 1;
  }
  return Object.values(playerCategoryCounts).some((c) => c >= 2);
}

// Formats the focus callout label shown on the chip
export function buildFocusLabel(focus: PlayerFocus): string {
  const num = focus.jerseyNumber != null ? String(focus.jerseyNumber) : null;
  const name = num ? `#${num} ${focus.playerName}` : focus.playerName;
  return focus.count >= 3
    ? `${name} · needs work ×${focus.count}`
    : name;
}
