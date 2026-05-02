// struggling-player-utils.ts
// Identifies players with repeated needs-work observations in a specific skill
// category so coaches can intervene before the player disengages.

export interface ObsForStruggling {
  player_id: string | null;
  category: string | null;
  sentiment: string | null;
}

export interface StrugglingPlayerData {
  playerId: string;
  playerName: string;
  category: string;
  count: number;
  drillUrl: string;
  captureUrl: string;
}

// ─── Category helpers ─────────────────────────────────────────────────────────

const CATEGORY_DRILL_URL: Record<string, string> = {
  dribbling:    '/drills?category=Ball%20Handling',
  defense:      '/drills?category=Defense',
  passing:      '/drills?category=Passing',
  shooting:     '/drills?category=Shooting',
  rebounding:   '/drills?category=Rebounding',
  teamwork:     '/drills?category=Team%20Play',
  hustle:       '/drills?category=Conditioning',
  footwork:     '/drills?category=Conditioning',
  awareness:    '/drills?category=Defense',
  conditioning: '/drills?category=Conditioning',
  leadership:   '/drills',
};

const CATEGORY_LABEL: Record<string, string> = {
  dribbling:    'Ball Handling',
  defense:      'Defense',
  passing:      'Passing',
  shooting:     'Shooting',
  rebounding:   'Rebounding',
  teamwork:     'Teamwork',
  hustle:       'Hustle',
  footwork:     'Footwork',
  awareness:    'Awareness',
  conditioning: 'Conditioning',
  leadership:   'Leadership',
};

export function getCategoryDrillUrl(category: string): string {
  return CATEGORY_DRILL_URL[category] ?? '/drills';
}

export function formatStrugglingCategory(category: string): string {
  return CATEGORY_LABEL[category] ?? (category.charAt(0).toUpperCase() + category.slice(1));
}

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Returns a map of `${playerId}|${category}` → count of needs-work observations.
 * Only includes categories that are not 'general'.
 */
export function groupNeedsWorkByPlayerCategory(
  obs: ObsForStruggling[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const o of obs) {
    if (o.sentiment !== 'needs-work') continue;
    if (!o.player_id || !o.category || o.category === 'general') continue;
    const key = `${o.player_id}|${o.category}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/**
 * Finds players who have ≥ threshold needs-work observations in a single skill
 * category. Returns one entry per player (their worst category).
 */
export function findStrugglingPlayers(
  obs: ObsForStruggling[],
  players: Array<{ id: string; name: string }>,
  threshold: number = 3,
): StrugglingPlayerData[] {
  const grouped = groupNeedsWorkByPlayerCategory(obs);
  const playerMap = new Map(players.map((p) => [p.id, p.name]));

  // Build a map: playerId → { category, count } for worst category per player
  const worstByPlayer = new Map<string, { category: string; count: number }>();

  for (const [key, count] of grouped) {
    if (count < threshold) continue;
    const [playerId, category] = key.split('|');
    const existing = worstByPlayer.get(playerId);
    if (!existing || count > existing.count) {
      worstByPlayer.set(playerId, { category, count });
    }
  }

  const result: StrugglingPlayerData[] = [];
  for (const [playerId, { category, count }] of worstByPlayer) {
    const playerName = playerMap.get(playerId);
    if (!playerName) continue; // player not on current roster
    result.push({
      playerId,
      playerName,
      category,
      count,
      drillUrl: getCategoryDrillUrl(category),
      captureUrl: `/capture?playerId=${playerId}`,
    });
  }

  return result;
}

export function sortByStrugglingCount(
  players: StrugglingPlayerData[],
): StrugglingPlayerData[] {
  return [...players].sort((a, b) => b.count - a.count);
}

export function getTopStrugglingPlayer(
  players: StrugglingPlayerData[],
): StrugglingPlayerData | null {
  if (players.length === 0) return null;
  return sortByStrugglingCount(players)[0];
}

export function countStrugglingPlayers(players: StrugglingPlayerData[]): number {
  return players.length;
}

// ─── Data sufficiency ─────────────────────────────────────────────────────────

/**
 * Requires at least 5 total needs-work observations so new teams don't see
 * false-positive alerts from a single bad session.
 */
export function hasEnoughDataForStruggling(obs: ObsForStruggling[]): boolean {
  const nwCount = obs.filter((o) => o.sentiment === 'needs-work').length;
  return nwCount >= 5;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function buildStrugglingLabel(category: string, count: number): string {
  const label = formatStrugglingCategory(category);
  return `${count}× needs-work: ${label}`;
}

export function buildStrugglingNotificationTitle(data: StrugglingPlayerData): string {
  const label = formatStrugglingCategory(data.category);
  return `${data.playerName} needs targeted ${label} work`;
}

export function buildStrugglingNotificationBody(data: StrugglingPlayerData): string {
  const label = formatStrugglingCategory(data.category);
  return `${data.count} needs-work observations in ${label} this week. Tap to find targeted drills.`;
}

/**
 * Returns a short coach-facing tip explaining WHY this player is flagged.
 */
export function buildCoachingTip(data: StrugglingPlayerData): string {
  const label = formatStrugglingCategory(data.category);
  if (data.count >= 6) {
    return `You've noted ${label} issues ${data.count} times — this needs focused attention.`;
  }
  if (data.count >= 4) {
    return `${label} has come up ${data.count} times recently — a good drill could help.`;
  }
  return `${label} flagged ${data.count} times — worth spending a few minutes on this.`;
}

/** Returns true when the struggling player should NOT be surfaced (too new). */
export function isStrugglingPlayer(
  obs: ObsForStruggling[],
  playerId: string,
  category: string,
  threshold: number = 3,
): boolean {
  const key = `${playerId}|${category}`;
  const grouped = groupNeedsWorkByPlayerCategory(obs);
  return (grouped.get(key) ?? 0) >= threshold;
}
