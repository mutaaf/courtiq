// Pure utility functions for computing a session-level snapshot from observation data.
// Zero API calls — computed entirely from already-fetched observations + roster data.

export interface SnapshotObs {
  player_id: string | null;
  sentiment: string;
  category: string;
  text: string;
  players?: { name: string } | null;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface PlayerObsCount {
  playerId: string;
  name: string;
  positiveCount: number;
  totalCount: number;
}

export interface SessionSnapshot {
  totalObs: number;
  positiveCount: number;
  needsWorkCount: number;
  neutralCount: number;
  scoredCount: number;
  positiveRatio: number;
  topStrengths: CategoryCount[];
  topGaps: CategoryCount[];
  standout: PlayerObsCount | null;
  uniquePlayersObserved: number;
}

// ─── Counts ──────────────────────────────────────────────────────────────────

export function countBySentiment(obs: SnapshotObs[], sentiment: string): number {
  return obs.filter((o) => o.sentiment === sentiment).length;
}

export function countScored(obs: SnapshotObs[]): number {
  return obs.filter((o) => o.sentiment === 'positive' || o.sentiment === 'needs-work').length;
}

export function getPositiveRatio(obs: SnapshotObs[]): number {
  const total = countScored(obs);
  if (total === 0) return 0;
  return countBySentiment(obs, 'positive') / total;
}

export function getUniqueObservedPlayerCount(obs: SnapshotObs[]): number {
  return new Set(obs.filter((o) => o.player_id).map((o) => o.player_id)).size;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export function getCategoryCounts(obs: SnapshotObs[], sentiment: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const o of obs) {
    if (o.sentiment !== sentiment) continue;
    const cat = o.category?.toLowerCase() || 'general';
    if (cat === 'general' || cat === 'General') continue;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  return counts;
}

export function getTopCategoriesBySentiment(
  obs: SnapshotObs[],
  sentiment: string,
  limit = 2
): CategoryCount[] {
  const counts = getCategoryCounts(obs, sentiment);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category, count]) => ({ category, count }));
}

// ─── Players ─────────────────────────────────────────────────────────────────

export function getPlayerObsCounts(obs: SnapshotObs[]): PlayerObsCount[] {
  const map = new Map<string, PlayerObsCount>();
  for (const o of obs) {
    if (!o.player_id || !o.players?.name) continue;
    const existing = map.get(o.player_id);
    if (existing) {
      existing.totalCount++;
      if (o.sentiment === 'positive') existing.positiveCount++;
    } else {
      map.set(o.player_id, {
        playerId: o.player_id,
        name: o.players.name,
        positiveCount: o.sentiment === 'positive' ? 1 : 0,
        totalCount: 1,
      });
    }
  }
  return [...map.values()];
}

export function getStandoutPlayer(obs: SnapshotObs[]): PlayerObsCount | null {
  const players = getPlayerObsCounts(obs);
  if (players.length === 0) return null;
  // Must have at least 2 positive observations to be a standout
  const eligible = players.filter((p) => p.positiveCount >= 2);
  if (eligible.length === 0) return null;
  return eligible.sort((a, b) => b.positiveCount - a.positiveCount || b.totalCount - a.totalCount)[0];
}

// ─── Guard ───────────────────────────────────────────────────────────────────

export function hasEnoughDataForSnapshot(obs: SnapshotObs[]): boolean {
  return obs.length >= 3;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function formatSnapshotCategory(cat: string): string {
  if (!cat) return 'General';
  const map: Record<string, string> = {
    dribbling: 'Dribbling',
    shooting: 'Shooting',
    passing: 'Passing',
    defense: 'Defense',
    hustle: 'Hustle',
    teamwork: 'Teamwork',
    leadership: 'Leadership',
    awareness: 'Awareness',
    rebounding: 'Rebounding',
    footwork: 'Footwork',
    conditioning: 'Conditioning',
    general: 'General',
  };
  return map[cat.toLowerCase()] ?? (cat.charAt(0).toUpperCase() + cat.slice(1));
}

export function getHealthLabel(ratio: number): string {
  if (ratio >= 0.8) return 'Excellent';
  if (ratio >= 0.65) return 'Good';
  if (ratio >= 0.5) return 'Mixed';
  if (ratio >= 0.35) return 'Needs Work';
  return 'Tough Day';
}

export function getHealthColor(ratio: number): string {
  if (ratio >= 0.8) return 'text-emerald-400';
  if (ratio >= 0.65) return 'text-emerald-400';
  if (ratio >= 0.5) return 'text-amber-400';
  if (ratio >= 0.35) return 'text-orange-400';
  return 'text-red-400';
}

export function getHealthBarColor(ratio: number): string {
  if (ratio >= 0.65) return 'bg-emerald-500';
  if (ratio >= 0.5) return 'bg-amber-500';
  return 'bg-orange-500';
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildSessionSnapshot(obs: SnapshotObs[]): SessionSnapshot {
  const positiveCount = countBySentiment(obs, 'positive');
  const needsWorkCount = countBySentiment(obs, 'needs-work');
  const neutralCount = countBySentiment(obs, 'neutral');
  const scoredCount = positiveCount + needsWorkCount;
  return {
    totalObs: obs.length,
    positiveCount,
    needsWorkCount,
    neutralCount,
    scoredCount,
    positiveRatio: scoredCount > 0 ? positiveCount / scoredCount : 0,
    topStrengths: getTopCategoriesBySentiment(obs, 'positive', 3),
    topGaps: getTopCategoriesBySentiment(obs, 'needs-work', 3),
    standout: getStandoutPlayer(obs),
    uniquePlayersObserved: getUniqueObservedPlayerCount(obs),
  };
}
