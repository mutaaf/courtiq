/**
 * Pure utility functions for AI Half-Time Adjustments feature.
 * No side effects — safe to test without mocks.
 */

export interface HalftimeObs {
  player_id?: string | null;
  player_name?: string;
  sentiment: string;
  category?: string;
  text: string;
}

export type MomentumLevel = 'building' | 'level' | 'trailing';

export interface HalftimeAdjustments {
  momentum: MomentumLevel;
  whats_working: string[];
  what_needs_fixing: string[];
  adjustments: Array<{
    focus: string;
    action: string;
    priority: 'immediate' | 'secondary';
  }>;
  player_spotlight: {
    name: string;
    note: string;
  } | null;
  halftime_message: string;
}

// ─── Observation filters ──────────────────────────────────────────────────────

/** Filter observations to only positive sentiment. */
export function selectPositiveObs(obs: HalftimeObs[]): HalftimeObs[] {
  return obs.filter((o) => o.sentiment === 'positive');
}

/** Filter observations to only needs-work sentiment. */
export function selectNeedsWorkObs(obs: HalftimeObs[]): HalftimeObs[] {
  return obs.filter((o) => o.sentiment === 'needs-work');
}

/** Filter observations to only player (not team) observations. */
export function selectPlayerObs(obs: HalftimeObs[]): HalftimeObs[] {
  return obs.filter((o) => !!o.player_id);
}

// ─── Ratios & counts ─────────────────────────────────────────────────────────

/** Returns the ratio of positive observations (0.0–1.0). */
export function positiveRatio(obs: HalftimeObs[]): number {
  if (obs.length === 0) return 0;
  const scored = obs.filter((o) => o.sentiment === 'positive' || o.sentiment === 'needs-work');
  if (scored.length === 0) return 0;
  const positives = scored.filter((o) => o.sentiment === 'positive').length;
  return positives / scored.length;
}

/** Count observations by category. Returns a map of category → count. */
export function countObsByCategory(obs: HalftimeObs[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of obs) {
    const cat = o.category || 'general';
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}

/** Count observations by sentiment. */
export function countObsBySentiment(obs: HalftimeObs[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of obs) {
    counts[o.sentiment] = (counts[o.sentiment] || 0) + 1;
  }
  return counts;
}

// ─── Momentum ────────────────────────────────────────────────────────────────

/**
 * Classify team momentum based on the positive ratio of observations captured
 * so far in the session.
 * - building: ratio ≥ 0.55 (more positives than negatives)
 * - trailing: ratio < 0.35 (mostly needs-work)
 * - level: everything in between
 */
export function classifyMomentum(obs: HalftimeObs[]): MomentumLevel {
  const ratio = positiveRatio(obs);
  if (ratio >= 0.55) return 'building';
  if (ratio < 0.35) return 'trailing';
  return 'level';
}

/** Returns a human-readable label for a momentum level. */
export function getMomentumLabel(momentum: MomentumLevel): string {
  switch (momentum) {
    case 'building': return 'Building Momentum';
    case 'level':    return 'Even Game';
    case 'trailing': return 'Need Adjustment';
  }
}

/** Returns the Tailwind text color for a momentum level. */
export function getMomentumColor(momentum: MomentumLevel): string {
  switch (momentum) {
    case 'building': return 'text-emerald-400';
    case 'level':    return 'text-amber-400';
    case 'trailing': return 'text-red-400';
  }
}

/** Returns the border/bg classes for the momentum banner. */
export function getMomentumBannerClasses(momentum: MomentumLevel): string {
  switch (momentum) {
    case 'building': return 'border-emerald-500/20 bg-emerald-500/5';
    case 'level':    return 'border-amber-500/20 bg-amber-500/5';
    case 'trailing': return 'border-red-500/20 bg-red-500/5';
  }
}

// ─── Player analysis ─────────────────────────────────────────────────────────

/** Group observations by player name, tallying sentiment counts. */
export function groupObsByPlayer(
  obs: HalftimeObs[]
): Record<string, { positive: number; needsWork: number; total: number }> {
  const groups: Record<string, { positive: number; needsWork: number; total: number }> = {};
  for (const o of obs) {
    const name = o.player_name || 'Team';
    if (!groups[name]) groups[name] = { positive: 0, needsWork: 0, total: 0 };
    groups[name].total++;
    if (o.sentiment === 'positive') groups[name].positive++;
    else if (o.sentiment === 'needs-work') groups[name].needsWork++;
  }
  return groups;
}

/**
 * Returns names of players with the best positive ratio (≥ 0.6 and ≥2 obs).
 * Sorted by ratio descending, up to `topN`.
 */
export function getTopPerformers(obs: HalftimeObs[], topN = 3): string[] {
  const groups = groupObsByPlayer(obs);
  return Object.entries(groups)
    .filter(([name, data]) => name !== 'Team' && data.total >= 2)
    .map(([name, data]) => ({
      name,
      ratio: data.total > 0 ? data.positive / data.total : 0,
    }))
    .filter((p) => p.ratio >= 0.6)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, topN)
    .map((p) => p.name);
}

/**
 * Returns names of players with the highest needs-work ratio (≥ 0.5 and ≥2 obs).
 * Sorted by needs-work ratio descending, up to `topN`.
 */
export function getStrugglingPlayers(obs: HalftimeObs[], topN = 3): string[] {
  const groups = groupObsByPlayer(obs);
  return Object.entries(groups)
    .filter(([name, data]) => name !== 'Team' && data.total >= 2)
    .map(([name, data]) => ({
      name,
      ratio: data.total > 0 ? data.needsWork / data.total : 0,
    }))
    .filter((p) => p.ratio >= 0.5)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, topN)
    .map((p) => p.name);
}

// ─── Skill analysis ───────────────────────────────────────────────────────────

/**
 * Returns the categories with the most positive observations.
 * Up to `topN` categories.
 */
export function getStrongestCategories(obs: HalftimeObs[], topN = 3): string[] {
  const positiveObs = selectPositiveObs(obs);
  const counts = countObsByCategory(positiveObs);
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([cat]) => cat);
}

/**
 * Returns the categories with the most needs-work observations.
 * Up to `topN` categories.
 */
export function getWeakestCategories(obs: HalftimeObs[], topN = 3): string[] {
  const needsWorkObs = selectNeedsWorkObs(obs);
  const counts = countObsByCategory(needsWorkObs);
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([cat]) => cat);
}

// ─── Data sufficiency ─────────────────────────────────────────────────────────

/**
 * Returns true when there are enough observations to generate a meaningful
 * halftime adjustment (minimum 3 observations captured in the session).
 */
export function hasEnoughDataForHalftime(obs: HalftimeObs[]): boolean {
  return obs.length >= 3;
}

// ─── Prompt helpers ───────────────────────────────────────────────────────────

/** Build a concise summary string for the AI prompt. */
export function buildHalftimeSummaryLines(obs: HalftimeObs[]): string[] {
  const groups = groupObsByPlayer(obs);
  return Object.entries(groups)
    .filter(([name]) => name !== 'Team')
    .map(([name, data]) => {
      const trend =
        data.total === 0
          ? 'no data'
          : data.positive > data.needsWork
            ? 'performing well'
            : data.needsWork > data.positive
              ? 'struggling'
              : 'mixed';
      return `${name}: ${data.positive}+ / ${data.needsWork}⚠ (${trend})`;
    });
}

/** Build a category breakdown string for the AI prompt. */
export function buildCategoryBreakdown(obs: HalftimeObs[]): string {
  const counts = countObsByCategory(obs);
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, count]) => `${cat}: ${count} obs`)
    .join(', ');
}

// ─── Share text ───────────────────────────────────────────────────────────────

/** Build a plain-text share string from halftime adjustments. */
export function buildHalftimeShareText(
  adj: HalftimeAdjustments,
  opponent?: string | null,
): string {
  const lines: string[] = [
    opponent ? `Half-Time Adjustments vs ${opponent}` : 'Half-Time Adjustments',
    `Momentum: ${getMomentumLabel(adj.momentum)}`,
    '',
  ];
  if (adj.whats_working.length > 0) {
    lines.push('✅ What\'s Working');
    adj.whats_working.forEach((w) => lines.push(`• ${w}`));
    lines.push('');
  }
  if (adj.what_needs_fixing.length > 0) {
    lines.push('⚠️ Needs Fixing');
    adj.what_needs_fixing.forEach((w) => lines.push(`• ${w}`));
    lines.push('');
  }
  if (adj.adjustments.length > 0) {
    lines.push('🔧 Adjustments');
    adj.adjustments.forEach((a) => lines.push(`• ${a.focus}: ${a.action}`));
    lines.push('');
  }
  if (adj.player_spotlight) {
    lines.push(`⭐ Feature ${adj.player_spotlight.name}: ${adj.player_spotlight.note}`);
    lines.push('');
  }
  lines.push(`💬 "${adj.halftime_message}"`);
  return lines.join('\n');
}
