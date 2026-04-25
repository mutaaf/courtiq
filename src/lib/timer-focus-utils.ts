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

// ─── Last Observation Context ────────────────────────────────────────────────
// Shows the most recent observation for a selected player in the break screen,
// helping coaches give continuity-aware feedback ("Good improvement since last week!").

export interface RecentObs {
  player_id: string;
  text: string;
  sentiment: string; // 'positive' | 'needs-work' | 'neutral'
  category: string;
  created_at: string; // ISO datetime
}

/** Minimal shape of a current-session captured note (mirror of timer CapturedNote). */
export interface SessionNote {
  playerId?: string;
  note: string;
  sentiment: string;
  category: string;
}

export interface LastObsInfo {
  text: string;
  sentiment: string;
  category: string;
  /** Days since the observation. 0 = current session or today. */
  daysAgo: number;
  fromCurrentSession: boolean;
}

/**
 * Build a lookup map of the most recent observation per player.
 * Current-session notes (already captured this practice) take priority over
 * observations stored in the database from previous sessions.
 */
export function buildLastObsByPlayer(
  notes: SessionNote[],
  recentObs: RecentObs[],
  nowMs: number = Date.now()
): Record<string, LastObsInfo> {
  const result: Record<string, LastObsInfo> = {};

  // Current-session notes — iterate in order, last write wins for each player
  // so the most recently saved note is kept (notes are appended chronologically).
  for (const note of notes) {
    if (!note.playerId) continue;
    result[note.playerId] = {
      text: note.note,
      sentiment: note.sentiment,
      category: note.category,
      daysAgo: 0,
      fromCurrentSession: true,
    };
  }

  // DB observations — group by player, keep the most recent
  const bestDbObs: Record<string, RecentObs> = {};
  for (const obs of recentObs) {
    if (!obs.player_id) continue;
    if (
      !bestDbObs[obs.player_id] ||
      obs.created_at > bestDbObs[obs.player_id].created_at
    ) {
      bestDbObs[obs.player_id] = obs;
    }
  }

  // Only fill in DB obs for players not already covered by current session
  for (const [playerId, obs] of Object.entries(bestDbObs)) {
    if (result[playerId]) continue; // current session takes priority
    const daysAgo = Math.max(
      0,
      Math.floor((nowMs - new Date(obs.created_at).getTime()) / 86_400_000)
    );
    result[playerId] = {
      text: obs.text,
      sentiment: obs.sentiment,
      category: obs.category,
      daysAgo,
      fromCurrentSession: false,
    };
  }

  return result;
}

/** Format a human-readable time label for the last observation context chip. */
export function formatLastObsTime(
  daysAgo: number,
  fromCurrentSession: boolean
): string {
  if (fromCurrentSession) return 'This session';
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo < 7) return `${daysAgo}d ago`;
  const weeks = Math.floor(daysAgo / 7);
  return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
}

/** Truncate observation text for compact display, appending ellipsis if needed. */
export function truncateObsText(text: string, maxLen = 72): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + '…';
}
