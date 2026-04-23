// ─── Daily Focus Utilities ────────────────────────────────────────────────────
// Computes ONE actionable daily coaching task: which player to give feedback
// to today and why. Purely algorithmic — no AI calls, instant display.

export interface PlayerObsSummary {
  player_id: string | null;
  sentiment: string;
  category: string;
  created_at: string;
}

export interface SkillTrendSummary {
  category: string;
  direction: 'improving' | 'declining' | 'stable';
  delta: number;
}

export interface RosterPlayer {
  id: string;
  name: string;
}

export interface DailyFocusSuggestion {
  playerId: string;
  playerName: string;
  daysSinceObserved: number;
  skillToFocus: string | null;
  reason: string;
  captureHref: string;
}

/** Returns the ISO date string for a timestamp (YYYY-MM-DD in local time). */
export function getDayKey(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Days elapsed between two Date objects (floor). */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
}

/** Returns the most recent observation timestamp for a player, or null. */
export function getLastObservedAt(
  playerId: string,
  observations: PlayerObsSummary[]
): Date | null {
  const playerObs = observations.filter((o) => o.player_id === playerId);
  if (!playerObs.length) return null;
  const latest = playerObs.reduce((best, o) =>
    o.created_at > best.created_at ? o : best
  );
  return new Date(latest.created_at);
}

/** Days since a player was last observed (returns 9999 if never observed). */
export function getDaysSinceObserved(
  playerId: string,
  observations: PlayerObsSummary[],
  now: Date
): number {
  const last = getLastObservedAt(playerId, observations);
  if (!last) return 9999;
  return daysBetween(last, now);
}

/** Returns true if the player was observed at least once (ever). */
export function hasBeenObserved(
  playerId: string,
  observations: PlayerObsSummary[]
): boolean {
  return observations.some((o) => o.player_id === playerId);
}

/** Returns true if the player was observed today (same calendar day as now). */
export function isObservedToday(
  playerId: string,
  observations: PlayerObsSummary[],
  now: Date
): boolean {
  const todayKey = getDayKey(now.toISOString());
  return observations.some(
    (o) => o.player_id === playerId && getDayKey(o.created_at) === todayKey
  );
}

/**
 * Picks the player who has been unobserved longest among players who have
 * at least one observation (ignores brand-new players with no history).
 * Returns null if all players were observed today or no data.
 */
export function getMostNeglectedPlayer(
  players: RosterPlayer[],
  observations: PlayerObsSummary[],
  now: Date
): RosterPlayer | null {
  const observed = players.filter((p) => hasBeenObserved(p.id, observations));
  if (!observed.length) return null;

  const notToday = observed.filter((p) => !isObservedToday(p.id, observations, now));
  if (!notToday.length) return null;

  return notToday.reduce((best, p) => {
    const bDays = getDaysSinceObserved(best.id, observations, now);
    const pDays = getDaysSinceObserved(p.id, observations, now);
    return pDays > bDays ? p : best;
  });
}

/**
 * Returns the label of the top declining skill from skill trend data.
 * Picks the trend with the largest negative delta.
 */
export function getTopDecliningSkillLabel(
  trends: SkillTrendSummary[]
): string | null {
  const declining = trends.filter((t) => t.direction === 'declining');
  if (!declining.length) return null;
  return declining.reduce((worst, t) => (t.delta < worst.delta ? t : worst)).category;
}

/**
 * Returns the most common needs-work category for a specific player
 * from their observation history (last 30 days).
 */
export function getPlayerTopNeedsWorkSkill(
  playerId: string,
  observations: PlayerObsSummary[],
  now: Date
): string | null {
  const cutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const playerObs = observations.filter(
    (o) =>
      o.player_id === playerId &&
      o.sentiment === 'needs-work' &&
      o.category &&
      o.created_at >= cutoff
  );
  if (!playerObs.length) return null;
  const counts = new Map<string, number>();
  playerObs.forEach((o) => counts.set(o.category, (counts.get(o.category) ?? 0) + 1));
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best?.[0] ?? null;
}

/**
 * Picks the best skill to focus on for the player:
 * prefers the player's own top needs-work skill, falls back to the team's
 * top declining trend, falls back to null.
 */
export function getBestSkillFocus(
  playerId: string,
  observations: PlayerObsSummary[],
  decliningTrends: SkillTrendSummary[],
  now: Date
): string | null {
  return (
    getPlayerTopNeedsWorkSkill(playerId, observations, now) ??
    getTopDecliningSkillLabel(decliningTrends)
  );
}

/** Builds the /capture URL pre-selecting a specific player. */
export function buildCaptureHref(playerId: string): string {
  return `/capture?player=${encodeURIComponent(playerId)}`;
}

/** Human-readable "N days ago" / "yesterday" label. */
export function formatDaysSince(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days >= 9999) return 'never';
  return `${days} days ago`;
}

/** Capitalises the first letter of a category slug (e.g. "dribbling" → "Dribbling"). */
export function capitaliseCategory(category: string): string {
  if (!category) return '';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Builds a short human-readable reason string for the focus suggestion.
 * Examples:
 *   "Not seen in 6 days · Team focus: Dribbling"
 *   "Not seen in 1 day · Needs work on Passing"
 *   "Last observed 3 days ago"
 */
export function buildFocusReason(
  daysSince: number,
  skillLabel: string | null
): string {
  const timePart =
    daysSince >= 9999
      ? 'No observations yet'
      : daysSince === 1
      ? 'Not seen since yesterday'
      : `Not seen in ${daysSince} days`;

  if (!skillLabel) return timePart;
  return `${timePart} · Focus: ${capitaliseCategory(skillLabel)}`;
}

/** Returns true when there is sufficient data to compute a focus suggestion. */
export function hasSufficientDataForFocus(
  players: RosterPlayer[],
  observations: PlayerObsSummary[]
): boolean {
  const uniquePlayers = new Set(
    observations.filter((o) => o.player_id).map((o) => o.player_id)
  );
  return players.length >= 2 && observations.length >= 5 && uniquePlayers.size >= 2;
}

/**
 * Main entry point — assembles the daily focus suggestion.
 * Returns null when there isn't enough data or all players were already
 * observed today.
 */
export function buildDailyFocusSuggestion(
  players: RosterPlayer[],
  observations: PlayerObsSummary[],
  decliningTrends: SkillTrendSummary[],
  now: Date = new Date()
): DailyFocusSuggestion | null {
  if (!hasSufficientDataForFocus(players, observations)) return null;

  const target = getMostNeglectedPlayer(players, observations, now);
  if (!target) return null;

  const days = getDaysSinceObserved(target.id, observations, now);
  const skill = getBestSkillFocus(target.id, observations, decliningTrends, now);

  return {
    playerId: target.id,
    playerName: target.name,
    daysSinceObserved: days,
    skillToFocus: skill,
    reason: buildFocusReason(days, skill),
    captureHref: buildCaptureHref(target.id),
  };
}
