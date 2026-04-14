/**
 * Pure utility functions for the AI Season Summary feature.
 * No side effects — safe to test without mocks.
 */

export interface SummaryObservation {
  player_id?: string | null;
  sentiment: string;
  category?: string | null;
  text: string;
  created_at: string;
}

export interface SummarySession {
  id: string;
  type: string;
  date: string;
}

export interface SummaryPlayer {
  id: string;
  name: string;
}

export type SkillStatus = 'strength' | 'most_improved' | 'consistent' | 'needs_work';

export interface SkillSummary {
  skill: string;
  status: SkillStatus;
  description: string;
}

export interface PlayerBreakthrough {
  player_name: string;
  achievement: string;
}

export interface SeasonSummaryResult {
  headline: string;
  season_period: string;
  overall_assessment: string;
  team_highlights: Array<{ title: string; description: string }>;
  skill_progress: SkillSummary[];
  player_breakthroughs: PlayerBreakthrough[];
  team_challenges: string[];
  coaching_insights: string;
  next_season_priorities: string[];
  closing_message: string;
}

/** Returns the date range string for a set of observations. */
export function getSeasonDateRange(observations: SummaryObservation[]): {
  startDate: string | null;
  endDate: string | null;
  label: string;
} {
  if (observations.length === 0) {
    return { startDate: null, endDate: null, label: 'No data' };
  }
  const dates = observations.map((o) => o.created_at).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return { startDate, endDate, label: `${fmt(start)} – ${fmt(end)}` };
}

/** Count observations per sentiment. */
export function countObsBySentiment(obs: SummaryObservation[]): {
  positive: number;
  needsWork: number;
  neutral: number;
} {
  let positive = 0;
  let needsWork = 0;
  let neutral = 0;
  for (const o of obs) {
    if (o.sentiment === 'positive') positive++;
    else if (o.sentiment === 'needs-work') needsWork++;
    else neutral++;
  }
  return { positive, needsWork, neutral };
}

/** Calculate the overall team health score (0–100) from observations. */
export function calculateSeasonHealthScore(obs: SummaryObservation[]): number {
  if (obs.length === 0) return 50;
  const { positive, needsWork } = countObsBySentiment(obs);
  // Weighted: positive contributes +1, needs-work −0.5
  const raw = positive - needsWork * 0.5;
  const max = obs.length;
  const clamped = Math.max(0, Math.min(max, raw + max * 0.5));
  return Math.round((clamped / max) * 100);
}

/** Group observations by category and count each. */
export function groupByCategory(obs: SummaryObservation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of obs) {
    const cat = o.category || 'Uncategorized';
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}

/** Return the top N categories by observation volume. */
export function getTopCategories(obs: SummaryObservation[], n = 5): string[] {
  const counts = groupByCategory(obs);
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([cat]) => cat);
}

/** Count unique players who have at least one observation. */
export function countObservedPlayers(obs: SummaryObservation[]): number {
  const ids = new Set(obs.filter((o) => o.player_id).map((o) => o.player_id!));
  return ids.size;
}

/** Count distinct weeks spanned by observations. */
export function countWeeksOfData(obs: SummaryObservation[]): number {
  if (obs.length === 0) return 0;
  const weeks = new Set(
    obs.map((o) => {
      const d = new Date(o.created_at);
      // ISO week: year + week number
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      return `${d.getFullYear()}-W${weekNum}`;
    })
  );
  return weeks.size;
}

/** Count observations per session type. */
export function countSessionsByType(sessions: SummarySession[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    counts[s.type] = (counts[s.type] || 0) + 1;
  }
  return counts;
}

/** Check whether there is enough data to generate a meaningful season summary. */
export function hasEnoughDataForSummary(
  obs: SummaryObservation[],
  sessions: SummarySession[],
): boolean {
  return obs.length >= 10 && sessions.length >= 3;
}

/**
 * Identify the most-observed player (by observation count).
 * Returns null if no player observations exist.
 */
export function getMostObservedPlayer(
  obs: SummaryObservation[],
  players: SummaryPlayer[],
): SummaryPlayer | null {
  const counts: Record<string, number> = {};
  for (const o of obs) {
    if (o.player_id) {
      counts[o.player_id] = (counts[o.player_id] || 0) + 1;
    }
  }
  const topId = Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0];
  if (!topId) return null;
  return players.find((p) => p.id === topId) ?? null;
}

/**
 * Build the share text for a season summary.
 * Suitable for clipboard copy or Web Share API.
 */
export function buildSeasonShareText(summary: SeasonSummaryResult, teamName: string): string {
  const lines: string[] = [
    `📊 ${teamName} — Season Summary`,
    `${summary.season_period}`,
    '',
    summary.headline,
    '',
    summary.overall_assessment,
  ];

  if (summary.team_highlights.length > 0) {
    lines.push('', '✨ Season Highlights');
    for (const h of summary.team_highlights) {
      lines.push(`• ${h.title}: ${h.description}`);
    }
  }

  if (summary.player_breakthroughs.length > 0) {
    lines.push('', '🌟 Player Breakthroughs');
    for (const b of summary.player_breakthroughs) {
      lines.push(`• ${b.player_name}: ${b.achievement}`);
    }
  }

  if (summary.next_season_priorities.length > 0) {
    lines.push('', '🎯 Next Season Priorities');
    for (const p of summary.next_season_priorities) {
      lines.push(`• ${p}`);
    }
  }

  lines.push('', `— ${summary.closing_message}`);
  lines.push('', 'Generated with SportsIQ');
  return lines.join('\n');
}

/** Format a stats strip: "48 obs · 12 sessions · 8 players · 6 weeks" */
export function buildSummaryStatsLabel(
  obsCount: number,
  sessionCount: number,
  playerCount: number,
  weeksCount: number,
): string {
  const parts: string[] = [
    `${obsCount} obs`,
    `${sessionCount} session${sessionCount !== 1 ? 's' : ''}`,
    `${playerCount} player${playerCount !== 1 ? 's' : ''}`,
    `${weeksCount} week${weeksCount !== 1 ? 's' : ''}`,
  ];
  return parts.join(' · ');
}

/** Classify a skill category based on positive ratio vs team-wide baseline. */
export function classifySkillCategory(
  categoryObs: SummaryObservation[],
  allObs: SummaryObservation[],
): SkillStatus {
  if (categoryObs.length === 0) return 'consistent';
  const catPositive = categoryObs.filter((o) => o.sentiment === 'positive').length;
  const catRatio = catPositive / categoryObs.length;
  const allPositive = allObs.filter((o) => o.sentiment === 'positive').length;
  const allRatio = allObs.length > 0 ? allPositive / allObs.length : 0.5;

  if (catRatio >= allRatio + 0.2) return 'strength';
  if (catRatio <= allRatio - 0.2) return 'needs_work';
  // Check frequency vs baseline (categories with many obs = consistent/improved)
  const catShare = categoryObs.length / (allObs.length || 1);
  if (catShare >= 0.25) return 'most_improved';
  return 'consistent';
}
