/**
 * Skill trend utilities — computes per-category improvement / decline signals
 * by comparing a recent 7-day window against the prior 7-day window.
 *
 * All functions are pure (no side-effects, no I/O) so they can be unit-tested
 * without mocks and reused on both server and client.
 */

export interface ObsSlice {
  category: string | null;
  sentiment: string;
}

export type TrendDirection = 'improving' | 'declining' | 'stable';

export interface SkillTrend {
  category: string;
  /** Human-readable label for the category */
  label: string;
  /** Positive ratio in the recent window (0–1), or null if no data */
  recentRatio: number | null;
  /** Positive ratio in the prior window (0–1), or null if no data */
  priorRatio: number | null;
  /** Change in positive ratio (-1 to +1); positive = improving */
  delta: number;
  direction: TrendDirection;
  /** Number of observations in the recent window */
  recentCount: number;
  /** Number of observations in the prior window */
  priorCount: number;
}

// ─── Category label map ───────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  shooting: 'Shooting',
  defense: 'Defense',
  dribbling: 'Ball Handling',
  passing: 'Passing',
  hustle: 'Hustle',
  awareness: 'Court Vision',
  teamwork: 'Teamwork',
  footwork: 'Footwork',
  attitude: 'Attitude',
  leadership: 'Leadership',
  conditioning: 'Conditioning',
};

// ─── Pure helper functions ────────────────────────────────────────────────────

/** Return the human-readable label for a skill category slug. */
export function formatSkillLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

/** Filter observations to a single category (case-insensitive). */
export function filterByCategory(obs: ObsSlice[], category: string): ObsSlice[] {
  const lower = category.toLowerCase();
  return obs.filter((o) => o.category?.toLowerCase() === lower);
}

/** Filter to only needs-work observations. */
export function filterNeedsWork(obs: ObsSlice[]): ObsSlice[] {
  return obs.filter((o) => o.sentiment === 'needs-work');
}

/** Filter to only positive observations. */
export function filterPositive(obs: ObsSlice[]): ObsSlice[] {
  return obs.filter((o) => o.sentiment === 'positive');
}

/** Filter to only scored observations (positive or needs-work, not neutral). */
export function filterScored(obs: ObsSlice[]): ObsSlice[] {
  return obs.filter((o) => o.sentiment === 'positive' || o.sentiment === 'needs-work');
}

/**
 * Compute positive ratio for a set of observations.
 * Returns null when there are no scored observations (avoids division by zero).
 */
export function calcPositiveRatio(obs: ObsSlice[]): number | null {
  const scored = filterScored(obs);
  if (scored.length === 0) return null;
  return filterPositive(obs).length / scored.length;
}

/** Return the unique, non-null categories present in an observation set. */
export function getCategories(obs: ObsSlice[]): string[] {
  const seen = new Set<string>();
  for (const o of obs) {
    if (o.category) seen.add(o.category.toLowerCase());
  }
  return [...seen];
}

/** Count total observations per category, returned as a Map. */
export function countByCategory(obs: ObsSlice[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const o of obs) {
    if (!o.category) continue;
    const key = o.category.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Determine the trend direction from a delta value.
 * ±0.05 (5 percentage points) is treated as "stable" noise floor.
 */
export function getTrendDirection(delta: number): TrendDirection {
  if (delta >= 0.05) return 'improving';
  if (delta <= -0.05) return 'declining';
  return 'stable';
}

/** Format delta as a display string like "+12%" or "−8%" or "stable". */
export function formatTrendDelta(delta: number): string {
  const pct = Math.round(Math.abs(delta) * 100);
  if (pct < 5) return 'stable';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${pct}%`;
}

/** Return the Tailwind text-colour class for a direction. */
export function getTrendColor(direction: TrendDirection): string {
  if (direction === 'improving') return 'text-emerald-400';
  if (direction === 'declining') return 'text-red-400';
  return 'text-zinc-400';
}

/** Return the Tailwind background class for a direction badge. */
export function getTrendBgColor(direction: TrendDirection): string {
  if (direction === 'improving') return 'bg-emerald-500/10';
  if (direction === 'declining') return 'bg-red-500/10';
  return 'bg-zinc-700/40';
}

/** True when a trend has a meaningful enough delta and sample size to display. */
export function isSignificantTrend(trend: SkillTrend, minObs: number = 3): boolean {
  return (
    trend.direction !== 'stable' &&
    trend.recentCount >= minObs
  );
}

/** True when there are enough observations to produce reliable trend data. */
export function hasEnoughDataForTrends(
  recentObs: ObsSlice[],
  priorObs: ObsSlice[],
  minTotal: number = 5
): boolean {
  return recentObs.length >= minTotal || priorObs.length >= minTotal;
}

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Build a SkillTrend for a single category by comparing two time windows.
 * If a window has no observations the ratio is null and delta is derived
 * from only the window that has data (negative if only prior has data,
 * positive if only recent has data).
 */
export function buildSkillTrendForCategory(
  category: string,
  recentObs: ObsSlice[],
  priorObs: ObsSlice[]
): SkillTrend {
  const recentCat = filterByCategory(recentObs, category);
  const priorCat = filterByCategory(priorObs, category);

  const recentRatio = calcPositiveRatio(recentCat);
  const priorRatio = calcPositiveRatio(priorCat);

  let delta = 0;
  if (recentRatio !== null && priorRatio !== null) {
    delta = recentRatio - priorRatio;
  } else if (recentRatio !== null) {
    // No prior data — treat prior as 0.5 baseline
    delta = recentRatio - 0.5;
  } else if (priorRatio !== null) {
    // No recent data — treat recent as 0.5 baseline
    delta = 0.5 - priorRatio;
  }

  return {
    category,
    label: formatSkillLabel(category),
    recentRatio,
    priorRatio,
    delta,
    direction: getTrendDirection(delta),
    recentCount: filterScored(recentCat).length,
    priorCount: filterScored(priorCat).length,
  };
}

/**
 * Build trend data for every category that appears in either window.
 * Returns an array of SkillTrend objects, one per unique category.
 */
export function buildSkillTrends(
  recentObs: ObsSlice[],
  priorObs: ObsSlice[]
): SkillTrend[] {
  const categories = new Set([
    ...getCategories(recentObs),
    ...getCategories(priorObs),
  ]);
  return [...categories].map((cat) =>
    buildSkillTrendForCategory(cat, recentObs, priorObs)
  );
}

/**
 * Return the top N improving skill trends, sorted by delta descending.
 * Only includes trends with direction === 'improving' and minObs sample size.
 */
export function getTopImprovingSkills(
  trends: SkillTrend[],
  n: number = 3,
  minObs: number = 3
): SkillTrend[] {
  return trends
    .filter((t) => t.direction === 'improving' && t.recentCount >= minObs)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, n);
}

/**
 * Return the top N declining skill trends, sorted by delta ascending (worst first).
 * Only includes trends with direction === 'declining' and minObs sample size.
 */
export function getTopDecliningSkills(
  trends: SkillTrend[],
  n: number = 3,
  minObs: number = 3
): SkillTrend[] {
  return trends
    .filter((t) => t.direction === 'declining' && t.recentCount >= minObs)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, n);
}

/**
 * Sort all trends by absolute delta descending so the most volatile skills
 * appear first regardless of direction.
 */
export function sortByAbsoluteDelta(trends: SkillTrend[]): SkillTrend[] {
  return [...trends].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * Return only trends that have enough observations to be statistically
 * meaningful (at least minObs scored observations in the recent window).
 */
export function filterHasEnoughData(
  trends: SkillTrend[],
  minObs: number = 3
): SkillTrend[] {
  return trends.filter((t) => t.recentCount >= minObs);
}

/**
 * Calculate the average positive ratio across all categories in the recent
 * window, weighted by observation count. Returns null when no data.
 */
export function calculateTeamSkillProfile(recentObs: ObsSlice[]): number | null {
  const scored = filterScored(recentObs);
  if (scored.length === 0) return null;
  return filterPositive(recentObs).length / scored.length;
}

/**
 * Build a concise summary string for display ("3 improving, 2 declining").
 */
export function buildTrendSummary(
  improving: SkillTrend[],
  declining: SkillTrend[]
): string {
  const parts: string[] = [];
  if (improving.length > 0) {
    parts.push(`${improving.length} improving`);
  }
  if (declining.length > 0) {
    parts.push(`${declining.length} declining`);
  }
  return parts.length > 0 ? parts.join(', ') : 'stable';
}
