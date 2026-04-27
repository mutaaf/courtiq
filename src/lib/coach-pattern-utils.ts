import type { Sentiment } from '@/types/database';

export type ObsPoint = {
  player_id: string | null;
  sentiment: Sentiment;
  category: string | null;
  created_at: string;
};

// ─── Gini Coefficient ──────────────────────────────────────────────────────────

/**
 * Gini coefficient over an array of non-negative counts.
 * Returns 0 (perfect equality) to approaching 1 (total inequality).
 */
export function giniCoefficient(counts: number[]): number {
  const n = counts.length;
  if (n === 0) return 0;
  const sorted = [...counts].sort((a, b) => a - b);
  const total = sorted.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return numerator / (n * total);
}

/**
 * Observation balance score (0–100).
 * 100 = all active players observed equally; 0 = all observations on one player.
 */
export function calculateObservationBalance(
  observations: ObsPoint[],
  allPlayerIds: string[],
): number {
  if (allPlayerIds.length === 0) return 100;
  const counts = allPlayerIds.map(
    (id) => observations.filter((o) => o.player_id === id).length,
  );
  const gini = giniCoefficient(counts);
  return Math.round((1 - gini) * 100);
}

// ─── Coverage ─────────────────────────────────────────────────────────────────

/** Returns player IDs with no observation in the last `days` days. */
export function findUnobservedPlayerIds(
  observations: ObsPoint[],
  allPlayerIds: string[],
  days: number,
): string[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const observedSet = new Set(
    observations
      .filter((o) => o.player_id && new Date(o.created_at).getTime() >= cutoff)
      .map((o) => o.player_id as string),
  );
  return allPlayerIds.filter((id) => !observedSet.has(id));
}

/**
 * Percentage of active players observed in last `days` days (0–100).
 */
export function calculatePlayerCoverageRate(
  observations: ObsPoint[],
  allPlayerIds: string[],
  days: number,
): number {
  if (allPlayerIds.length === 0) return 100;
  const unobserved = findUnobservedPlayerIds(observations, allPlayerIds, days);
  return Math.round(
    ((allPlayerIds.length - unobserved.length) / allPlayerIds.length) * 100,
  );
}

// ─── Most / Least Observed ────────────────────────────────────────────────────

export function getObservationCountByPlayer(
  observations: ObsPoint[],
  allPlayerIds: string[],
): { playerId: string; count: number }[] {
  return allPlayerIds.map((id) => ({
    playerId: id,
    count: observations.filter((o) => o.player_id === id).length,
  }));
}

/** Top N most-observed players (players with 0 obs excluded). */
export function getMostObservedPlayers(
  observations: ObsPoint[],
  allPlayerIds: string[],
  n: number,
): { playerId: string; count: number }[] {
  return getObservationCountByPlayer(observations, allPlayerIds)
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** Bottom N least-observed players (including those with 0 obs). */
export function getLeastObservedPlayers(
  observations: ObsPoint[],
  allPlayerIds: string[],
  n: number,
): { playerId: string; count: number }[] {
  return getObservationCountByPlayer(observations, allPlayerIds)
    .sort((a, b) => a.count - b.count)
    .slice(0, n);
}

// ─── Sentiment Breakdown ──────────────────────────────────────────────────────

export type SentimentBreakdown = {
  positive: number;
  needsWork: number;
  neutral: number;
  total: number;
};

export function getSentimentBreakdown(observations: ObsPoint[]): SentimentBreakdown {
  return {
    positive: observations.filter((o) => o.sentiment === 'positive').length,
    needsWork: observations.filter((o) => o.sentiment === 'needs-work').length,
    neutral: observations.filter((o) => o.sentiment === 'neutral').length,
    total: observations.length,
  };
}

// ─── Consistency ─────────────────────────────────────────────────────────────

/** ISO year-week key: "YYYY-WNN" */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Week keys for the last `n` weeks, oldest first (current week last). */
export function getLastNWeekKeys(n: number, now: number = Date.now()): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = isoWeekKey(new Date(now - i * 7 * 24 * 60 * 60 * 1000));
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/** Per-week observation count for the last `weeks` 7-day rolling windows (oldest → newest). */
export function getWeeklyObservationCounts(
  observations: ObsPoint[],
  weeks: number,
  now: number = Date.now(),
): number[] {
  const counts = new Array<number>(weeks).fill(0);
  const windowMs = 7 * 24 * 60 * 60 * 1000;
  for (const obs of observations) {
    const ageMs = now - new Date(obs.created_at).getTime();
    const bucket = Math.floor(ageMs / windowMs);
    if (bucket >= 0 && bucket < weeks) {
      counts[weeks - 1 - bucket]++;
    }
  }
  return counts;
}

/**
 * Consistency rate (0–100): fraction of last `weeks` weeks that had ≥1 observation.
 */
export function calculateConsistencyRate(
  observations: ObsPoint[],
  weeks: number,
  now: number = Date.now(),
): number {
  if (weeks === 0) return 0;
  const weeklyCounts = getWeeklyObservationCounts(observations, weeks, now);
  const activeWeeks = weeklyCounts.filter((c) => c > 0).length;
  return Math.round((activeWeeks / weeks) * 100);
}

// ─── Overall Score ────────────────────────────────────────────────────────────

/**
 * Overall coaching pattern score (0–100).
 * Weights: balance 35%, coverage 35%, consistency 30%.
 */
export function calculateCoachingPatternScore(
  balance: number,
  coverage: number,
  consistency: number,
): number {
  return Math.round(balance * 0.35 + coverage * 0.35 + consistency * 0.3);
}

export type CoachingPatternLabel = 'Comprehensive' | 'Developing' | 'Focused';

export function getCoachingPatternLabel(score: number): CoachingPatternLabel {
  if (score >= 75) return 'Comprehensive';
  if (score >= 45) return 'Developing';
  return 'Focused';
}

export function getCoachingPatternColor(score: number): string {
  if (score >= 75) return 'emerald';
  if (score >= 45) return 'amber';
  return 'red';
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export type CoachingInsight = {
  type: 'alert' | 'suggestion' | 'praise';
  message: string;
};

export function buildCoachingPatternInsights(
  balance: number,
  coverage: number,
  consistency: number,
  unobservedCount: number,
): CoachingInsight[] {
  const insights: CoachingInsight[] = [];

  if (unobservedCount > 0) {
    insights.push({
      type: 'alert',
      message: `${unobservedCount} player${unobservedCount > 1 ? 's have' : ' has'} not been observed in the last 14 days — make sure everyone gets feedback.`,
    });
  }

  if (balance < 60) {
    insights.push({
      type: 'suggestion',
      message:
        'Your observations are concentrated on a few players. Try distributing attention more evenly across the roster.',
    });
  } else if (balance < 80) {
    insights.push({
      type: 'suggestion',
      message: 'Good balance overall — a few players are receiving slightly less attention than others.',
    });
  }

  if (consistency < 50) {
    insights.push({
      type: 'suggestion',
      message:
        'You have several weeks with no observations. Consistent daily capture leads to richer development data.',
    });
  }

  if (unobservedCount === 0 && coverage >= 90 && balance >= 75 && consistency >= 75) {
    insights.push({
      type: 'praise',
      message: 'Excellent coaching pattern — you are observing all players consistently and evenly.',
    });
  }

  return insights;
}

// ─── Guard ────────────────────────────────────────────────────────────────────

/** Returns true when there is enough data to show meaningful pattern analysis. */
export function hasSufficientPatternData(
  observations: ObsPoint[],
  playerIds: string[],
): boolean {
  return observations.length >= 5 && playerIds.length >= 2;
}
