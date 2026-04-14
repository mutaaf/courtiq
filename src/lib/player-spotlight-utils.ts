// ─── Shared types ─────────────────────────────────────────────────────────────

export interface SpotlightObs {
  player_id: string;
  player_name: string;
  sentiment: 'positive' | 'needs-work' | 'neutral';
  category: string;
  text: string;
  created_at: string;
}

export interface RankedPlayer {
  player_id: string;
  player_name: string;
  score: number;
  obs: SpotlightObs[];
}

export interface WeeklyStarData {
  player_name: string;
  week_label: string;
  headline: string;
  achievement: string;
  growth_moment: string;
  challenge_ahead: string;
  coach_shoutout: string;
}

// ─── Pure utilities ───────────────────────────────────────────────────────────

/** Count positive observations for a player. */
export function countPositiveObs(obs: SpotlightObs[]): number {
  return obs.filter((o) => o.sentiment === 'positive').length;
}

/** Count unique skill categories covered. */
export function getUniqueCategoriesCount(obs: SpotlightObs[]): number {
  return new Set(obs.map((o) => o.category)).size;
}

/** Whether observations span multiple calendar days (shows consistency). */
export function hasMultipleDays(obs: SpotlightObs[]): boolean {
  const days = new Set(obs.map((o) => o.created_at.slice(0, 10)));
  return days.size > 1;
}

/** Whether a player has enough observations to be considered for spotlight. */
export function isEligibleForSpotlight(obsCount: number): boolean {
  return obsCount >= 2;
}

/**
 * Compute spotlight score for a player.
 *
 * Score = positive_count × 3 + unique_categories × 2 + multi_day_bonus × 2
 *
 * Rationale:
 * - Positive obs are the primary signal of a standout week.
 * - Breadth across categories shows all-around effort.
 * - Showing up on multiple days demonstrates consistency.
 */
export function calculatePlayerScore(obs: SpotlightObs[]): number {
  const positiveCount = countPositiveObs(obs);
  const categoriesCount = getUniqueCategoriesCount(obs);
  const multiDayBonus = hasMultipleDays(obs) ? 2 : 0;
  return positiveCount * 3 + categoriesCount * 2 + multiDayBonus;
}

/** Sort players by spotlight score, highest first. Returns a new array. */
export function rankPlayersByScore(
  playerObs: Record<string, SpotlightObs[]>
): RankedPlayer[] {
  return Object.entries(playerObs)
    .filter(([, obs]) => isEligibleForSpotlight(obs.length))
    .map(([player_id, obs]) => ({
      player_id,
      player_name: obs[0]?.player_name ?? 'Unknown',
      score: calculatePlayerScore(obs),
      obs,
    }))
    .sort((a, b) => b.score - a.score);
}

/** Select the top-ranked player as the weekly star candidate. Returns null if nobody qualifies. */
export function selectWeeklyStarCandidate(
  playerObs: Record<string, SpotlightObs[]>
): RankedPlayer | null {
  const ranked = rankPlayersByScore(playerObs);
  return ranked.length > 0 ? ranked[0] : null;
}

/**
 * Returns a week label string, e.g. "Apr 7".
 * Optional `date` param for deterministic testing; defaults to today.
 */
export function getWeekLabel(date: Date = new Date()): string {
  const dayOfWeek = date.getDay(); // 0=Sun … 6=Sat
  const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as start of week
  const monday = new Date(date);
  monday.setDate(date.getDate() - daysBack);
  return monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Build a shareable plain-text message for the weekly star. */
export function buildSpotlightShareText(spotlight: WeeklyStarData): string {
  return [
    `⭐ SportsIQ Weekly Star — Week of ${spotlight.week_label}`,
    '',
    `${spotlight.player_name}: ${spotlight.headline}`,
    '',
    spotlight.achievement,
    '',
    `"${spotlight.coach_shoutout}"`,
    '',
    'Powered by SportsIQ — Voice-First Coaching Intelligence',
  ].join('\n');
}

/** Group a flat list of observations by player_id. */
export function groupObsByPlayer(
  obs: SpotlightObs[]
): Record<string, SpotlightObs[]> {
  const map: Record<string, SpotlightObs[]> = {};
  for (const o of obs) {
    if (!o.player_id) continue;
    if (!map[o.player_id]) map[o.player_id] = [];
    map[o.player_id].push(o);
  }
  return map;
}

/**
 * Ratio of positive observations to total (0–1).
 * Returns 0 for empty arrays.
 */
export function positiveRatio(obs: SpotlightObs[]): number {
  if (obs.length === 0) return 0;
  return countPositiveObs(obs) / obs.length;
}

/**
 * Return only the positive-sentiment observations for a player.
 * Used to build the AI prompt context without noise.
 */
export function filterPositiveObs(obs: SpotlightObs[]): SpotlightObs[] {
  return obs.filter((o) => o.sentiment === 'positive');
}

/**
 * Whether a `weekly_star` plan was generated within the current week window
 * (i.e. the plan's created_at is within the last 7 days).
 */
export function isCurrentWeekStar(createdAt: string, now = Date.now()): boolean {
  const ageMs = now - new Date(createdAt).getTime();
  return ageMs <= 7 * 24 * 60 * 60 * 1000;
}
