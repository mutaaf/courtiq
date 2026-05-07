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
  } = params;

  const coachFirst = coachName.split(' ')[0] || coachName;
  const lines: string[] = [];

  lines.push(`Hi ${teamName} families! 👋`);
  lines.push('');
  lines.push("Here's your coaching update from this week:");
  lines.push('');

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
  const { obsCount, sessionCount, topPlayerName, topPositiveCategory } = params;
  const parts: string[] = [];

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
