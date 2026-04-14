// ─── Player Momentum Score ────────────────────────────────────────────────────
//
// Algorithmic score (0–100) measuring each player's current trajectory based on
// four equally-weighted factors (0–25 each):
//
//   1. Sentiment  — positive-observation ratio over the last 14 days
//   2. Consistency — how regularly the player is observed across sessions
//   3. Skill Trend — improving vs plateau vs regressing proficiency levels
//   4. Goal Progress — active / achieved / stalled development goals
//
// All functions are pure and side-effect free for easy unit testing.

import type { Sentiment, Trend, GoalStatus } from '@/types/database';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type MomentumTier = 'rising' | 'steady' | 'needs_attention';

export interface MomentumObs {
  player_id: string;
  sentiment: Sentiment;
  session_id: string | null;
  created_at: string;
}

export interface MomentumProficiency {
  player_id: string;
  trend: Trend | null;
  proficiency_level: string;
}

export interface MomentumGoal {
  player_id: string;
  status: GoalStatus;
  target_date: string | null;
}

export interface MomentumFactor {
  name: string;
  score: number; // 0–25
  max: 25;
  detail: string;
}

export interface PlayerMomentum {
  player_id: string;
  player_name: string;
  score: number; // 0–100
  tier: MomentumTier;
  factors: MomentumFactor[];
}

// ─── Factor 1: Sentiment (0–25) ──────────────────────────────────────────────

/**
 * Returns the proportion of positive observations (0–1).
 * Returns 0 if there are no observations.
 */
export function positiveRatio(observations: Pick<MomentumObs, 'sentiment'>[]): number {
  if (observations.length === 0) return 0;
  const positives = observations.filter((o) => o.sentiment === 'positive').length;
  return positives / observations.length;
}

/**
 * Calculates the sentiment factor score (0–25).
 * Scale: 0% positive → 0, 100% positive → 25.
 */
export function calculateSentimentFactor(
  observations: Pick<MomentumObs, 'sentiment'>[],
): MomentumFactor {
  const ratio = positiveRatio(observations);
  const score = Math.round(ratio * 25);
  const pct = Math.round(ratio * 100);
  const detail =
    observations.length === 0
      ? 'No observations in the last 14 days'
      : `${pct}% positive observations (${observations.filter((o) => o.sentiment === 'positive').length} of ${observations.length})`;
  return { name: 'Sentiment', score, max: 25, detail };
}

// ─── Factor 2: Consistency (0–25) ────────────────────────────────────────────

/**
 * Returns the number of unique sessions in which the player was observed.
 */
export function countObservedSessions(observations: Pick<MomentumObs, 'session_id'>[]): number {
  const ids = observations.map((o) => o.session_id).filter(Boolean) as string[];
  return new Set(ids).size;
}

/**
 * Calculates the consistency factor score (0–25).
 * Scale: 0 sessions → 0, 1 session → 10, 2 → 17, 3+ → 25.
 */
export function calculateConsistencyFactor(
  observations: Pick<MomentumObs, 'session_id'>[],
  totalTeamSessions: number,
): MomentumFactor {
  const observed = countObservedSessions(observations);
  const denom = Math.max(totalTeamSessions, 1);
  // Score out of 25, with a floor boost for being observed at all
  let score: number;
  if (observed === 0) {
    score = 0;
  } else if (observed === 1) {
    score = 10;
  } else if (observed === 2) {
    score = 17;
  } else {
    // 3+ sessions: scale relative to team activity, cap at 25
    score = Math.min(25, Math.round(10 + (observed / denom) * 15 * 2));
  }
  const detail =
    observed === 0
      ? 'Not observed in the last 14 days'
      : `Observed in ${observed} of ${totalTeamSessions} recent session${totalTeamSessions !== 1 ? 's' : ''}`;
  return { name: 'Consistency', score, max: 25, detail };
}

// ─── Factor 3: Skill Trend (0–25) ────────────────────────────────────────────

/** Per-trend point values. */
const TREND_POINTS: Record<Trend, number> = {
  improving: 8,
  new: 5,
  plateau: 3,
  regressing: 0,
};

/**
 * Calculates the skill-trend factor score (0–25) from a player's proficiency records.
 * Awards points per trend, capped at 25.
 */
export function calculateSkillTrendFactor(
  proficiency: Pick<MomentumProficiency, 'trend'>[],
): MomentumFactor {
  if (proficiency.length === 0) {
    return { name: 'Skill Trend', score: 12, max: 25, detail: 'No proficiency data yet (neutral)' };
  }

  const withTrends = proficiency.filter((p) => p.trend !== null);
  if (withTrends.length === 0) {
    return { name: 'Skill Trend', score: 12, max: 25, detail: 'Trends not yet calculated' };
  }

  const improving = withTrends.filter((p) => p.trend === 'improving').length;
  const regressing = withTrends.filter((p) => p.trend === 'regressing').length;
  const plateau = withTrends.filter((p) => p.trend === 'plateau').length;
  const isNew = withTrends.filter((p) => p.trend === 'new').length;

  const rawScore =
    improving * TREND_POINTS.improving +
    isNew * TREND_POINTS.new +
    plateau * TREND_POINTS.plateau +
    regressing * TREND_POINTS.regressing;

  // Normalise: max possible if all skills were improving
  const maxPossible = withTrends.length * TREND_POINTS.improving;
  const score = maxPossible === 0 ? 12 : Math.min(25, Math.round((rawScore / maxPossible) * 25));

  const parts: string[] = [];
  if (improving > 0) parts.push(`${improving} improving`);
  if (isNew > 0) parts.push(`${isNew} new`);
  if (plateau > 0) parts.push(`${plateau} plateau`);
  if (regressing > 0) parts.push(`${regressing} regressing`);
  const detail = parts.join(', ') + ' skill' + (withTrends.length !== 1 ? 's' : '');

  return { name: 'Skill Trend', score, max: 25, detail };
}

// ─── Factor 4: Goal Progress (0–25) ──────────────────────────────────────────

/**
 * Calculates the goal-progress factor score (0–25).
 * No goals → 12 (neutral). Each achieved goal adds value; stalled goals detract.
 */
export function calculateGoalProgressFactor(
  goals: Pick<MomentumGoal, 'status' | 'target_date'>[],
): MomentumFactor {
  if (goals.length === 0) {
    return {
      name: 'Goal Progress',
      score: 12,
      max: 25,
      detail: 'No active goals (neutral)',
    };
  }

  const active = goals.filter((g) => g.status === 'active').length;
  const achieved = goals.filter((g) => g.status === 'achieved').length;
  const stalled = goals.filter((g) => g.status === 'stalled').length;

  // Check for overdue active goals (target_date in the past)
  const now = new Date();
  const overdue = goals.filter(
    (g) => g.status === 'active' && g.target_date && new Date(g.target_date) < now,
  ).length;

  // Base: 12 (neutral), then adjust
  let score = 12;
  score += achieved * 5;    // each achieved goal: +5
  score += active * 2;      // each active goal: +2 (having goals is positive)
  score -= stalled * 4;     // each stalled goal: -4
  score -= overdue * 2;     // each overdue goal: -2 (extra penalty)

  score = Math.max(0, Math.min(25, score));

  const parts: string[] = [];
  if (achieved > 0) parts.push(`${achieved} achieved`);
  if (active > 0) parts.push(`${active} active`);
  if (stalled > 0) parts.push(`${stalled} stalled`);
  const detail = parts.join(', ') + ' goal' + (goals.length !== 1 ? 's' : '');

  return { name: 'Goal Progress', score, max: 25, detail };
}

// ─── Composite Score ──────────────────────────────────────────────────────────

/**
 * Calculates the composite momentum score (0–100) from the four factors.
 */
export function calculateMomentumScore(factors: MomentumFactor[]): number {
  return factors.reduce((sum, f) => sum + f.score, 0);
}

/**
 * Classifies a score into a momentum tier.
 *  Rising        ≥ 70
 *  Steady        40–69
 *  Needs attention < 40
 */
export function getMomentumTier(score: number): MomentumTier {
  if (score >= 70) return 'rising';
  if (score >= 40) return 'steady';
  return 'needs_attention';
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Human-readable label for a tier. */
export function getMomentumLabel(tier: MomentumTier): string {
  const labels: Record<MomentumTier, string> = {
    rising: 'Rising',
    steady: 'Steady',
    needs_attention: 'Needs Attention',
  };
  return labels[tier];
}

/** Tailwind text-colour class for a tier. */
export function getMomentumColor(tier: MomentumTier): string {
  const colors: Record<MomentumTier, string> = {
    rising: 'text-emerald-400',
    steady: 'text-blue-400',
    needs_attention: 'text-amber-400',
  };
  return colors[tier];
}

/** Tailwind background + border classes for a badge. */
export function getMomentumBadgeClasses(tier: MomentumTier): string {
  const classes: Record<MomentumTier, string> = {
    rising: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    steady: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    needs_attention: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  };
  return classes[tier];
}

/** Arrow emoji indicating score direction relative to a previous value. */
export function getMomentumDirection(
  current: number,
  previous: number,
): 'up' | 'down' | 'same' {
  if (current > previous + 2) return 'up';
  if (current < previous - 2) return 'down';
  return 'same';
}

/** Format score as a string, e.g. "82" */
export function formatMomentumScore(score: number): string {
  return Math.round(Math.max(0, Math.min(100, score))).toString();
}

// ─── Collection helpers ───────────────────────────────────────────────────────

/** Sort players by momentum score descending. */
export function sortByMomentum(players: PlayerMomentum[]): PlayerMomentum[] {
  return [...players].sort((a, b) => b.score - a.score);
}

/** Filter to only players in a given tier. */
export function filterByTier(
  players: PlayerMomentum[],
  tier: MomentumTier,
): PlayerMomentum[] {
  return players.filter((p) => p.tier === tier);
}

/** Returns the player with the highest momentum score, or null if the list is empty. */
export function getTopMomentumPlayer(players: PlayerMomentum[]): PlayerMomentum | null {
  if (players.length === 0) return null;
  return players.reduce((best, p) => (p.score > best.score ? p : best), players[0]);
}

/** Returns players in the 'rising' tier, sorted descending. */
export function getRisingPlayers(players: PlayerMomentum[]): PlayerMomentum[] {
  return sortByMomentum(filterByTier(players, 'rising'));
}

/** Returns players in the 'needs_attention' tier, sorted ascending (worst first). */
export function getNeedsAttentionPlayers(players: PlayerMomentum[]): PlayerMomentum[] {
  return [...filterByTier(players, 'needs_attention')].sort((a, b) => a.score - b.score);
}

/** Average momentum score across all players. Returns 0 for empty list. */
export function averageMomentumScore(players: PlayerMomentum[]): number {
  if (players.length === 0) return 0;
  const total = players.reduce((sum, p) => sum + p.score, 0);
  return Math.round(total / players.length);
}

/** Human-readable summary, e.g. "3 rising · 5 steady · 2 need attention" */
export function buildMomentumSummary(players: PlayerMomentum[]): string {
  const rising = filterByTier(players, 'rising').length;
  const steady = filterByTier(players, 'steady').length;
  const attention = filterByTier(players, 'needs_attention').length;
  const parts: string[] = [];
  if (rising > 0) parts.push(`${rising} rising`);
  if (steady > 0) parts.push(`${steady} steady`);
  if (attention > 0) parts.push(`${attention} need${attention === 1 ? 's' : ''} attention`);
  return parts.join(' · ') || 'No players';
}

/** Whether a player's momentum score qualifies as a "hot streak" (rising tier with 80+ score). */
export function isHotStreak(score: number): boolean {
  return score >= 80;
}
