import type { Observation } from '@/types/database';

export interface DrillUsageSummary {
  sessionCount: number;
  totalObservations: number;
  positiveCount: number;
  needsWorkCount: number;
  lastUsedAt: string | null;
  positiveRatio: number;
}

/** Count distinct sessions in which this drill appeared. */
export function countDistinctSessions(observations: Observation[]): number {
  const ids = new Set(observations.map((o) => o.session_id).filter(Boolean));
  return ids.size;
}

/** Return ISO timestamp of the most recent observation, or null. */
export function getLastUsedAt(observations: Observation[]): string | null {
  if (observations.length === 0) return null;
  return observations.reduce((best, o) =>
    o.created_at > best ? o.created_at : best,
    observations[0].created_at,
  );
}

/** Human-readable "X days ago" label for a drill's last-used timestamp. */
export function formatLastUsed(isoDate: string | null, now = new Date()): string {
  if (!isoDate) return 'Never used';
  const diff = now.getTime() - new Date(isoDate).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return '1 month ago';
  return `${Math.floor(days / 30)} months ago`;
}

/** Count observations with the given sentiment. */
export function countBySentiment(observations: Observation[], sentiment: string): number {
  return observations.filter((o) => o.sentiment === sentiment).length;
}

/** Ratio of positive observations (0–1). Returns 0 if no observations. */
export function getPositiveRatio(observations: Observation[]): number {
  if (observations.length === 0) return 0;
  return countBySentiment(observations, 'positive') / observations.length;
}

/** True when there is at least one observation for this drill. */
export function hasUsageData(observations: Observation[]): boolean {
  return observations.length > 0;
}

/** Most recent N observations, already assumed to be sorted newest-first. */
export function getRecentObservations(observations: Observation[], limit: number): Observation[] {
  return observations.slice(0, limit);
}

/** "Run X times this season" label. */
export function buildUsageSummaryLabel(sessionCount: number): string {
  if (sessionCount === 0) return '';
  if (sessionCount === 1) return 'Run once this season';
  return `Run ${sessionCount} time${sessionCount !== 1 ? 's' : ''} this season`;
}

/** Relative time chip colour class based on days since last use. */
export function getLastUsedColor(isoDate: string | null, now = new Date()): string {
  if (!isoDate) return 'text-zinc-500';
  const days = Math.floor((now.getTime() - new Date(isoDate).getTime()) / 86_400_000);
  if (days <= 7) return 'text-emerald-400';
  if (days <= 21) return 'text-amber-400';
  return 'text-red-400';
}

/** Sentiment chip colour helper. */
export function getSentimentClasses(sentiment: string): string {
  if (sentiment === 'positive') return 'bg-emerald-500/15 text-emerald-400';
  if (sentiment === 'needs-work') return 'bg-red-500/15 text-red-400';
  return 'bg-zinc-700/40 text-zinc-400';
}

/** Look up a player's display name from the roster. */
export function resolvePlayerName(
  playerId: string | null,
  players: { id: string; name: string }[],
): string | null {
  if (!playerId) return null;
  return players.find((p) => p.id === playerId)?.name ?? null;
}

/** Aggregate all key stats about drill observations. */
export function buildDrillUsageSummary(observations: Observation[]): DrillUsageSummary {
  return {
    sessionCount: countDistinctSessions(observations),
    totalObservations: observations.length,
    positiveCount: countBySentiment(observations, 'positive'),
    needsWorkCount: countBySentiment(observations, 'needs-work'),
    lastUsedAt: getLastUsedAt(observations),
    positiveRatio: getPositiveRatio(observations),
  };
}

/** True if usage is strong (≥70% positive and ≥3 uses). */
export function isDrillEffective(summary: DrillUsageSummary): boolean {
  return summary.sessionCount >= 3 && summary.positiveRatio >= 0.7;
}

/** True if the drill needs focus (≥3 uses with <40% positive). */
export function isDrillStruggle(summary: DrillUsageSummary): boolean {
  return summary.sessionCount >= 3 && summary.positiveRatio < 0.4;
}
