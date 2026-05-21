/**
 * Skill-based player grouping for Practice Timer drill breaks.
 * Groups players into balanced teams using their observation history in a
 * drill's skill category — more-skilled players paired with developing ones.
 * Zero AI, zero API calls: pure computation from already-fetched data.
 */

export interface GroupablePlayer {
  id: string;
  name: string;
  jersey_number: number | null;
}

export interface ScoredPlayer extends GroupablePlayer {
  /** 0–100: percentage of positive obs in the category. 50 = unranked (no data). */
  skillScore: number;
  positiveCount: number;
  needsWorkCount: number;
}

export interface DrillGroup {
  label: string;      // "Group A", "Group B", "Group C", "Group D"
  colorClass: string; // Tailwind class string for the group's accent colour
  players: ScoredPlayer[];
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Returns a 0–100 skill score from positive/needs-work observation counts.
 * 50 = no data (neutral starting point so unranked players land in the middle).
 */
export function calculateCategorySkillScore(
  positiveCount: number,
  needsWorkCount: number
): number {
  const total = positiveCount + needsWorkCount;
  if (total === 0) return 50;
  return Math.round((positiveCount / total) * 100);
}

/**
 * Count observations for a specific player × category × sentiment combination.
 */
export function countObsForPlayerCategory(
  playerId: string,
  category: string,
  sentiment: 'positive' | 'needs-work',
  observations: Array<{ player_id: string; category: string; sentiment: string }>
): number {
  const cat = category.toLowerCase();
  return observations.filter(
    (o) =>
      o.player_id === playerId &&
      o.category.toLowerCase() === cat &&
      o.sentiment === sentiment
  ).length;
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

/**
 * Returns players sorted by skill score (highest first) for a given category.
 * When category is undefined all players get score 50 and original order is kept.
 */
export function rankPlayersByCategory(
  players: GroupablePlayer[],
  category: string | undefined,
  observations: Array<{ player_id: string; category: string; sentiment: string }>
): ScoredPlayer[] {
  if (!category) {
    return players.map((p) => ({
      ...p,
      skillScore: 50,
      positiveCount: 0,
      needsWorkCount: 0,
    }));
  }

  const scored: ScoredPlayer[] = players.map((p) => {
    const positiveCount = countObsForPlayerCategory(p.id, category, 'positive', observations);
    const needsWorkCount = countObsForPlayerCategory(p.id, category, 'needs-work', observations);
    return {
      ...p,
      skillScore: calculateCategorySkillScore(positiveCount, needsWorkCount),
      positiveCount,
      needsWorkCount,
    };
  });

  return scored.sort((a, b) => b.skillScore - a.skillScore);
}

// ─── Group count ─────────────────────────────────────────────────────────────

/**
 * Returns the ideal number of groups for N players.
 * ≤4 players → 1 group (no split needed)
 * 5–8        → 2 groups
 * 9–12       → 3 groups
 * 13+        → 4 groups
 */
export function getGroupCount(playerCount: number): number {
  if (playerCount <= 4) return 1;
  if (playerCount <= 8) return 2;
  if (playerCount <= 12) return 3;
  return 4;
}

// ─── Snake draft ──────────────────────────────────────────────────────────────

/**
 * Distributes an array into balanced groups using a snake draft pattern.
 * E.g. with 3 groups: best → G0, 2nd → G1, 3rd → G2, 4th → G2, 5th → G1, 6th → G0 …
 * This ensures every group gets roughly even skill distribution.
 */
export function snakeDraft<T>(items: T[], groupCount: number): T[][] {
  if (groupCount <= 0) return [];
  const groups: T[][] = Array.from({ length: groupCount }, () => []);
  let direction = 1;
  let idx = 0;

  for (const item of items) {
    groups[idx].push(item);
    const next = idx + direction;
    if (next >= groupCount) {
      direction = -1;
      idx = groupCount - 1;
    } else if (next < 0) {
      direction = 1;
      idx = 0;
    } else {
      idx = next;
    }
  }

  return groups;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

const GROUP_LABELS = ['Group A', 'Group B', 'Group C', 'Group D'];
const GROUP_COLORS = [
  'text-orange-300 bg-orange-500/10 border-orange-500/20',
  'text-blue-300 bg-blue-500/10 border-blue-500/20',
  'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  'text-violet-300 bg-violet-500/10 border-violet-500/20',
];

/**
 * Builds balanced drill groups from the player roster and observation history.
 * Returns an empty array when there are no players.
 */
export function buildGroupsForDrill(
  players: GroupablePlayer[],
  drillCategory: string | undefined,
  observations: Array<{ player_id: string; category: string; sentiment: string }>
): DrillGroup[] {
  if (players.length === 0) return [];

  const groupCount = getGroupCount(players.length);
  const ranked = rankPlayersByCategory(players, drillCategory, observations);

  if (groupCount === 1) {
    return [{ label: 'Full Team', colorClass: GROUP_COLORS[0], players: ranked }];
  }

  const split = snakeDraft(ranked, groupCount);
  return split.map((groupPlayers, i) => ({
    label: GROUP_LABELS[i],
    colorClass: GROUP_COLORS[i],
    players: groupPlayers,
  }));
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/**
 * Returns "#7 Marcus" when jersey is set, "Marcus" otherwise.
 * Uses first name only to keep group cards compact.
 */
export function formatGroupPlayerLabel(player: GroupablePlayer): string {
  const firstName = player.name.split(' ')[0];
  if (player.jersey_number !== null && player.jersey_number !== undefined) {
    return `#${player.jersey_number} ${firstName}`;
  }
  return firstName;
}

/**
 * Returns true when at least 2 players have observations in the given category,
 * meaning the grouping is data-driven rather than arbitrary.
 */
export function hasSkillDataForGrouping(
  players: GroupablePlayer[],
  category: string | undefined,
  observations: Array<{ player_id: string; category: string; sentiment: string }>
): boolean {
  if (!category || players.length < 2) return false;
  const cat = category.toLowerCase();
  const playerIds = new Set(players.map((p) => p.id));
  const playersWithObs = new Set(
    observations
      .filter((o) => o.category.toLowerCase() === cat && playerIds.has(o.player_id))
      .map((o) => o.player_id)
  );
  return playersWithObs.size >= 2;
}

/**
 * Returns a label explaining the basis of the grouping to coaches.
 * E.g. "Balanced by dribbling history" or "Balanced evenly"
 */
export function buildGroupingBasisLabel(
  category: string | undefined,
  hasData: boolean
): string {
  if (!category || !hasData) return 'Balanced evenly';
  const cat = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
  return `Balanced by ${cat} history`;
}

/**
 * Returns the total number of players across all groups.
 */
export function countPlayersInGroups(groups: DrillGroup[]): number {
  return groups.reduce((sum, g) => sum + g.players.length, 0);
}
