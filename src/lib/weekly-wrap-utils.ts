/**
 * weekly-wrap-utils.ts
 *
 * Pure utility functions for the "Send Week Update" home-dashboard card.
 * Builds a one-tap parent group chat message from the current week's
 * coaching data — no AI, no navigation required.
 */

export interface WrapObs {
  player_id: string | null;
  sentiment: string;
  category: string | null;
  created_at: string;
}

export interface WrapPlayer {
  id: string;
  name: string;
  parent_phone?: string | null;
}

/** A game/scrimmage/tournament session from the past 7 days. */
export interface WrapSession {
  id: string;
  type: string;
  result: string | null;
  opponent: string | null;
  date: string;
}

export type WrapResultValue = 'win' | 'loss' | 'tie';

// ─── Game result helpers ──────────────────────────────────────────────────────

/** Parse a raw result string into 'win' | 'loss' | 'tie' | null. */
export function parseWrapResult(result: string | null): WrapResultValue | null {
  if (!result) return null;
  const lower = result.toLowerCase().trim();
  if (lower === 'win' || lower === 'w' || lower.startsWith('win ') || lower.startsWith('w ')) return 'win';
  if (lower === 'loss' || lower === 'l' || lower === 'lose' || lower.startsWith('loss ') || lower.startsWith('l ') || lower.startsWith('lose ')) return 'loss';
  if (lower === 'tie' || lower === 't' || lower === 'draw' || lower === 'd' || lower.startsWith('tie ') || lower.startsWith('t ') || lower.startsWith('draw ')) return 'tie';
  return null;
}

/** Extract an optional score string from a result like "win 42-38" → "42-38". */
export function extractWrapScore(result: string | null): string | null {
  if (!result) return null;
  const parts = result.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return parts.slice(1).join(' ') || null;
}

/** Filter sessions to only those with a parseable game result. */
export function filterSessionsWithResults(sessions: WrapSession[]): WrapSession[] {
  const gameTypes = new Set(['game', 'scrimmage', 'tournament']);
  return sessions.filter(
    (s) => gameTypes.has(s.type) && parseWrapResult(s.result) !== null
  );
}

/** Build a short single-line description of a game result for the wrap message. */
export function formatGameResultLine(session: WrapSession): string {
  const outcome = parseWrapResult(session.result);
  if (!outcome) return '';

  const score = extractWrapScore(session.result);
  const vs = session.opponent ? ` vs. ${session.opponent}` : '';
  const scoreStr = score ? ` (${score})` : '';

  if (outcome === 'win') {
    return `🏆 Won${vs}${scoreStr}`;
  }
  if (outcome === 'loss') {
    return `😤 Lost${vs}${scoreStr}`;
  }
  return `🤝 Tied${vs}${scoreStr}`;
}

/** Build a single message line summarising all game results this week. */
export function buildGameResultsSummary(sessions: WrapSession[]): string | null {
  const withResults = filterSessionsWithResults(sessions);
  if (withResults.length === 0) return null;

  const wins = withResults.filter((s) => parseWrapResult(s.result) === 'win').length;
  const losses = withResults.filter((s) => parseWrapResult(s.result) === 'loss').length;
  const ties = withResults.filter((s) => parseWrapResult(s.result) === 'tie').length;

  if (withResults.length === 1) {
    return formatGameResultLine(withResults[0]);
  }

  // Multiple game results — show compact win/loss/tie tally
  const parts: string[] = [];
  if (wins > 0) parts.push(`${wins} win${wins > 1 ? 's' : ''}`);
  if (losses > 0) parts.push(`${losses} loss${losses > 1 ? 'es' : ''}`);
  if (ties > 0) parts.push(`${ties} tie${ties > 1 ? 's' : ''}`);

  const prefix = wins > losses ? '🏆' : losses > wins ? '😤' : '🤝';
  return `${prefix} This week: ${parts.join(', ')}`;
}

/** Return true if any session this week has a recorded game result. */
export function hasGameResultsThisWeek(sessions: WrapSession[]): boolean {
  return filterSessionsWithResults(sessions).length > 0;
}

// ─── Week helpers ─────────────────────────────────────────────────────────────

/** ISO string for the most recent Monday at 00:00:00 UTC. */
export function getWeekMondayIso(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun … 6=Sat
  const daysBack = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack));
  return monday.toISOString();
}

/** ISO string for exactly `days` days ago from now. */
export function getCutoffIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// ─── Dismiss state (localStorage) ────────────────────────────────────────────

export function getWrapDismissKey(teamId: string): string {
  const mondayDate = getWeekMondayIso().split('T')[0];
  return `weekly-wrap-dismissed-${teamId}-${mondayDate}`;
}

export function isWrapDismissed(teamId: string): boolean {
  try {
    return localStorage.getItem(getWrapDismissKey(teamId)) === '1';
  } catch {
    return false;
  }
}

export function dismissWrap(teamId: string): void {
  try {
    localStorage.setItem(getWrapDismissKey(teamId), '1');
  } catch {
    // ignore
  }
}

// ─── Observation analysis ─────────────────────────────────────────────────────

export function countTotalObs(obs: WrapObs[]): number {
  return obs.length;
}

export function countPositiveWrapObs(obs: WrapObs[]): number {
  return obs.filter((o) => o.sentiment === 'positive').length;
}

export function countNeedsWorkWrapObs(obs: WrapObs[]): number {
  return obs.filter((o) => o.sentiment === 'needs-work').length;
}

export function countObservedPlayers(obs: WrapObs[]): number {
  const ids = new Set(obs.map((o) => o.player_id).filter(Boolean));
  return ids.size;
}

/** Returns the player_id with the most positive observations; null if none. */
export function getTopPlayerIdByPositive(obs: WrapObs[]): string | null {
  const counts: Record<string, number> = {};
  for (const o of obs) {
    if (o.player_id && o.sentiment === 'positive') {
      counts[o.player_id] = (counts[o.player_id] ?? 0) + 1;
    }
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/** Top skill category by positive observation count; null if none. */
export function getTopPositiveWrapCategory(obs: WrapObs[]): string | null {
  const counts: Record<string, number> = {};
  for (const o of obs) {
    if (o.sentiment === 'positive' && o.category) {
      counts[o.category] = (counts[o.category] ?? 0) + 1;
    }
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/** Top needs-work category; null if none. */
export function getTopNeedsWorkWrapCategory(obs: WrapObs[]): string | null {
  const counts: Record<string, number> = {};
  for (const o of obs) {
    if (o.sentiment === 'needs-work' && o.category) {
      counts[o.category] = (counts[o.category] ?? 0) + 1;
    }
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/** Whether there's enough data to show the weekly wrap card. */
export function hasEnoughDataForWrap(obs: WrapObs[]): boolean {
  return obs.length >= 5;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  shooting: 'Shooting',
  dribbling: 'Ball Handling',
  defense: 'Defense',
  passing: 'Passing',
  hustle: 'Hustle',
  awareness: 'Court Awareness',
  teamwork: 'Teamwork',
  footwork: 'Footwork',
  leadership: 'Leadership',
  conditioning: 'Conditioning',
  offense: 'Offense',
  rebounding: 'Rebounding',
  general: 'Overall',
};

export function formatWrapCategory(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, ' ');
}

// ─── Message builder ─────────────────────────────────────────────────────────

export interface WeeklyWrapMessageParams {
  teamName: string;
  coachName: string;
  obsCount: number;
  sessionCount: number;
  observedPlayerCount: number;
  totalPlayerCount: number;
  topPlayerName: string | null;
  topPositiveCategory: string | null;
  topNeedsWorkCategory: string | null;
  gameSessions?: WrapSession[];
}

export function buildWeeklyWrapMessage(params: WeeklyWrapMessageParams): string {
  const {
    teamName,
    coachName,
    obsCount,
    sessionCount,
    observedPlayerCount,
    totalPlayerCount,
    topPlayerName,
    topPositiveCategory,
    topNeedsWorkCategory,
    gameSessions = [],
  } = params;

  const coachFirst = coachName.split(' ')[0] || coachName;
  const lines: string[] = [];

  lines.push(`Hi ${teamName} families! 👋`);
  lines.push('');
  lines.push("Here's your coaching update from this week:");
  lines.push('');

  // Game result(s) — shown first so parents see the headline result immediately
  const gameResultLine = buildGameResultsSummary(gameSessions);
  if (gameResultLine) {
    lines.push(gameResultLine);
  }

  // Practice/session summary
  if (sessionCount === 0) {
    lines.push(`📋 ${obsCount} coaching observations captured this week.`);
  } else if (sessionCount === 1) {
    lines.push(`📋 1 session this week · ${obsCount} coaching observations`);
  } else {
    lines.push(`📋 ${sessionCount} sessions this week · ${obsCount} coaching observations`);
  }

  // Player coverage
  if (totalPlayerCount > 0 && observedPlayerCount > 0) {
    lines.push(`👀 ${observedPlayerCount} of ${totalPlayerCount} players got coaching feedback`);
  }

  lines.push('');

  // Spotlight
  if (topPlayerName && topPositiveCategory) {
    lines.push(
      `⭐ Shoutout to ${topPlayerName} for great work on ${formatWrapCategory(topPositiveCategory)} this week!`
    );
  } else if (topPlayerName) {
    lines.push(`⭐ Shoutout to ${topPlayerName} for a great week!`);
  } else if (topPositiveCategory) {
    lines.push(
      `⭐ The team showed great improvement in ${formatWrapCategory(topPositiveCategory)} this week!`
    );
  }

  // Focus area
  if (topNeedsWorkCategory) {
    lines.push(
      `🎯 We're focusing on ${formatWrapCategory(topNeedsWorkCategory)} — encourage your player to practice at home!`
    );
  }

  lines.push('');
  lines.push('Great effort this week! 💪');
  lines.push(`— Coach ${coachFirst}`);

  return lines.join('\n');
}

/** Preview text shown in the card (shorter version). */
export function buildWrapPreview(params: WeeklyWrapMessageParams): string {
  const { obsCount, sessionCount, topPlayerName, topPositiveCategory, gameSessions = [] } = params;
  const parts: string[] = [];

  const resultLine = buildGameResultsSummary(gameSessions);
  if (resultLine) {
    parts.push(resultLine);
  }

  if (sessionCount === 1) {
    parts.push(`1 session · ${obsCount} obs`);
  } else if (sessionCount > 1) {
    parts.push(`${sessionCount} sessions · ${obsCount} obs`);
  } else {
    parts.push(`${obsCount} coaching observations`);
  }

  if (topPlayerName) {
    parts.push(`⭐ ${topPlayerName.split(' ')[0]} leading the way`);
  }

  if (topPositiveCategory) {
    parts.push(`in ${formatWrapCategory(topPositiveCategory)}`);
  }

  return parts.join(' · ');
}

/** WhatsApp group chat URL (no recipient pre-fill — shares to any chat). */
export function buildWrapWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
