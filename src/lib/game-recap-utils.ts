/**
 * Pure utility functions for game recap feature.
 * No side effects — safe to test without mocks.
 */

export interface RecapObservation {
  player_id?: string | null;
  sentiment: string;
  text: string;
  category?: string;
}

export interface RecapHighlight {
  player_name: string;
  highlight: string;
  stat_line?: string;
}

export interface RecapKeyMoment {
  headline: string;
  description: string;
  player_name?: string;
}

export type ResultOutcome = 'win' | 'loss' | 'tie' | 'unknown';

/** Detect outcome from a free-text result field (e.g. "W 42-38", "Loss", "T") */
export function parseResultOutcome(result: string | null | undefined): ResultOutcome {
  if (!result) return 'unknown';
  const upper = result.trim().toUpperCase();
  if (upper.startsWith('W') || upper === 'WIN' || upper === 'WON') return 'win';
  if (upper.startsWith('L') || upper === 'LOSS' || upper === 'LOST') return 'loss';
  if (upper.startsWith('T') || upper === 'TIE' || upper === 'DRAW') return 'tie';
  return 'unknown';
}

/** Returns the Tailwind color class for a result outcome. */
export function getResultColor(outcome: ResultOutcome): string {
  switch (outcome) {
    case 'win':  return 'text-emerald-400';
    case 'loss': return 'text-red-400';
    case 'tie':  return 'text-zinc-400';
    default:     return 'text-orange-400';
  }
}

/** Returns the border/bg classes for the result card. */
export function getResultBadgeClasses(outcome: ResultOutcome): string {
  switch (outcome) {
    case 'win':  return 'border-emerald-500/20 bg-emerald-500/5';
    case 'loss': return 'border-red-500/20 bg-red-500/5';
    case 'tie':  return 'border-zinc-600/30 bg-zinc-800/30';
    default:     return 'border-orange-500/20 bg-orange-500/5';
  }
}

/**
 * Build a game session title from available metadata.
 * E.g. "Game vs Lions — Apr 12"
 */
export function buildGameTitle(
  sessionType: string,
  opponent: string | null | undefined,
  date: string,
): string {
  const typeLabel = sessionType.charAt(0).toUpperCase() + sessionType.slice(1);
  const opponentPart = opponent ? ` vs ${opponent}` : '';
  const datePart = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `${typeLabel}${opponentPart} — ${datePart}`;
}

/** Returns true when a session type is a game-type that can have a recap. */
export function isGameSession(sessionType: string): boolean {
  return ['game', 'scrimmage', 'tournament'].includes(sessionType);
}

/** Count observations per sentiment. */
export function countBySentiment(observations: RecapObservation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const obs of observations) {
    counts[obs.sentiment] = (counts[obs.sentiment] || 0) + 1;
  }
  return counts;
}

/**
 * Calculate a simple performance score (0–100) from observation sentiments.
 * positive = +1, needs-work = -0.5, neutral = 0.
 */
export function calculatePerformanceScore(observations: RecapObservation[]): number {
  if (observations.length === 0) return 50; // no data → neutral
  let score = 0;
  for (const obs of observations) {
    if (obs.sentiment === 'positive') score += 1;
    else if (obs.sentiment === 'needs-work') score -= 0.5;
  }
  const max = observations.length;
  return Math.round(Math.max(0, Math.min(100, ((score + max) / (2 * max)) * 100)));
}

/** Returns top-N highlights sorted by name alphabetically. */
export function selectTopHighlights(highlights: RecapHighlight[], limit: number): RecapHighlight[] {
  return [...highlights]
    .sort((a, b) => a.player_name.localeCompare(b.player_name))
    .slice(0, limit);
}

/**
 * Build plain-text version of a recap for clipboard sharing.
 */
export function buildShareText(recap: {
  title?: string;
  result_headline?: string;
  intro?: string;
  key_moments?: RecapKeyMoment[];
  player_highlights?: RecapHighlight[];
  coach_message?: string;
  looking_ahead?: string;
}): string {
  const lines: string[] = [];

  if (recap.title) lines.push(recap.title);
  if (recap.result_headline) lines.push(recap.result_headline);
  lines.push('');

  if (recap.intro) {
    lines.push(recap.intro);
    lines.push('');
  }

  if (recap.key_moments && recap.key_moments.length > 0) {
    lines.push('⚡ Key Moments');
    for (const m of recap.key_moments) {
      const player = m.player_name ? ` (${m.player_name})` : '';
      lines.push(`• ${m.headline}${player}: ${m.description}`);
    }
    lines.push('');
  }

  if (recap.player_highlights && recap.player_highlights.length > 0) {
    lines.push('⭐ Player Highlights');
    for (const p of recap.player_highlights) {
      const stat = p.stat_line ? ` — ${p.stat_line}` : '';
      lines.push(`• ${p.player_name}: ${p.highlight}${stat}`);
    }
    lines.push('');
  }

  if (recap.coach_message) {
    lines.push(`💬 "${recap.coach_message}"`);
    lines.push('');
  }

  if (recap.looking_ahead) {
    lines.push(recap.looking_ahead);
  }

  return lines.join('\n').trim();
}

/**
 * Determine whether there is enough observation data to generate a meaningful recap.
 * Minimum threshold: at least minObs observations.
 */
export function hasEnoughDataForRecap(observations: RecapObservation[], minObs = 2): boolean {
  return observations.length >= minObs;
}

/**
 * Group observations by player_id, counting totals per player.
 * Players without an id are grouped under 'team'.
 */
export function groupObsByPlayer(
  observations: RecapObservation[]
): Map<string, { total: number; positive: number; needsWork: number }> {
  const map = new Map<string, { total: number; positive: number; needsWork: number }>();
  for (const obs of observations) {
    const key = obs.player_id || 'team';
    const existing = map.get(key) || { total: 0, positive: 0, needsWork: 0 };
    existing.total += 1;
    if (obs.sentiment === 'positive') existing.positive += 1;
    if (obs.sentiment === 'needs-work') existing.needsWork += 1;
    map.set(key, existing);
  }
  return map;
}
