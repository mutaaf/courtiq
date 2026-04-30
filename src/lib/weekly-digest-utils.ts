/**
 * Pure utilities for the weekly coach digest email cron.
 *
 * Every Monday at 08:00 UTC, coaches with team activity in the prior week
 * receive a personalised email showing: observation count, sessions logged,
 * players observed, top performer spotlight, players needing attention, and
 * the skill category their team improved most. Each email links back to the
 * Plans page so coaches can generate next week's practice plan in one tap.
 *
 * Deduplication: digest_week_YYYY-MM-DD is written to coach.preferences after
 * each send (keyed on the Monday date of the week just ended), so re-runs are
 * idempotent and coaches never receive the same week twice.
 */

import type { Json } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DigestObs {
  player_id: string | null;
  sentiment: string;
  category: string | null;
  created_at: string;
  text: string;
}

export interface DigestPlayer {
  id: string;
  name: string;
  jersey_number: number | null;
}

export interface DigestSession {
  id: string;
  type: string;
  date: string;
}

export interface WeekDigestData {
  coachName: string;
  teamName: string;
  weekLabel: string;
  weekObs: number;
  weekSessions: number;
  weekPlayers: number;
  positiveObs: number;
  needsWorkObs: number;
  topPerformer: { name: string; count: number } | null;
  neglectedPlayerNames: string[];
  topCategory: string | null;
  appUrl: string;
}

// ─── Week calculation ─────────────────────────────────────────────────────────

/**
 * Returns the ISO date string (YYYY-MM-DD) for the most recent Monday
 * strictly before the given date (i.e. the start of the prior week).
 */
export function getPriorWeekMonday(date: Date): string {
  const d = new Date(date);
  // dayOfWeek: 0=Sun 1=Mon ... 6=Sat
  // When today is Monday (cron day), go back 7 to get *prior* Monday.
  // Any other day: roll back to the most recent Monday via (day+6)%7.
  const dayOfWeek = d.getUTCDay();
  const daysBack = dayOfWeek === 1 ? 7 : (dayOfWeek + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/** Returns the ISO date strings for Mon–Sun of the completed week. */
export function getWeekWindow(mondayStr: string): { start: string; end: string } {
  const start = mondayStr; // inclusive
  const end = new Date(mondayStr);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start, end: end.toISOString().slice(0, 10) };
}

/** Returns a human-readable label like "Apr 21–27". */
export function formatWeekLabel(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00Z');
  const e = new Date(end + 'T12:00:00Z');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const sMonth = months[s.getUTCMonth()];
  const eMonth = months[e.getUTCMonth()];
  const sDay = s.getUTCDate();
  const eDay = e.getUTCDate();
  if (sMonth === eMonth) {
    return `${sMonth} ${sDay}–${eDay}`;
  }
  return `${sMonth} ${sDay} – ${eMonth} ${eDay}`;
}

// ─── Observation analysis ─────────────────────────────────────────────────────

/** Observations whose created_at falls within [start, end] (inclusive, UTC date). */
export function filterObsInWindow(obs: DigestObs[], start: string, end: string): DigestObs[] {
  const s = start + 'T00:00:00Z';
  const e = end + 'T23:59:59Z';
  return obs.filter((o) => o.created_at >= s && o.created_at <= e);
}

export function countPositiveObs(obs: DigestObs[]): number {
  return obs.filter((o) => o.sentiment === 'positive').length;
}

export function countNeedsWorkObs(obs: DigestObs[]): number {
  return obs.filter((o) => o.sentiment === 'needs-work').length;
}

/** Returns the set of player IDs who appear in the given observations. */
export function getObservedPlayerIds(obs: DigestObs[]): Set<string> {
  const ids = new Set<string>();
  obs.forEach((o) => { if (o.player_id) ids.add(o.player_id); });
  return ids;
}

/**
 * Returns the player with the most positive observations this week.
 * Returns null if no player-linked positive observations exist.
 */
export function getTopPerformer(
  obs: DigestObs[],
  players: DigestPlayer[]
): { name: string; count: number } | null {
  const positive = obs.filter((o) => o.sentiment === 'positive' && o.player_id);
  if (positive.length === 0) return null;

  const counts: Record<string, number> = {};
  positive.forEach((o) => {
    const id = o.player_id!;
    counts[id] = (counts[id] ?? 0) + 1;
  });

  const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!topId) return null;

  const player = players.find((p) => p.id === topId[0]);
  if (!player) return null;
  return { name: player.name, count: topId[1] };
}

/**
 * Players who have zero observations in the past `days` days.
 * Returns an array of names (max 5 to keep the email scannable).
 */
export function getNeglectedPlayerNames(
  allObs: DigestObs[],
  players: DigestPlayer[],
  days: number
): string[] {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffStr = cutoff.toISOString();

  const recentIds = new Set<string>();
  allObs.forEach((o) => {
    if (o.player_id && o.created_at >= cutoffStr) recentIds.add(o.player_id);
  });

  return players
    .filter((p) => !recentIds.has(p.id))
    .map((p) => p.name)
    .slice(0, 5);
}

/**
 * The skill category that appeared most in positive observations this week.
 * Returns null if no categorised positive observations exist.
 */
export function getTopCategory(obs: DigestObs[]): string | null {
  const positive = obs.filter((o) => o.sentiment === 'positive' && o.category);
  if (positive.length === 0) return null;

  const counts: Record<string, number> = {};
  positive.forEach((o) => {
    const cat = o.category!;
    counts[cat] = (counts[cat] ?? 0) + 1;
  });

  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

/** Format a category key as a readable label ("needs-work" → "Needs Work"). */
export function formatCategoryLabel(category: string): string {
  return category
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─── Preferences / dedup ─────────────────────────────────────────────────────

/** Preference key for a given week, keyed by the Monday date string. */
export function getDigestKey(mondayStr: string): string {
  return `digest_week_${mondayStr}`;
}

export function hasAlreadySentDigest(preferences: Json, mondayStr: string): boolean {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return false;
  const prefs = preferences as Record<string, unknown>;
  return prefs[getDigestKey(mondayStr)] === true;
}

export function isDigestDisabled(preferences: Json): boolean {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return false;
  const prefs = preferences as Record<string, unknown>;
  return prefs['disable_weekly_digest'] === true;
}

export function markDigestSent(
  preferences: Json,
  mondayStr: string
): { [key: string]: Json | undefined } {
  const prefs = (
    preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? preferences
      : {}
  ) as { [key: string]: Json | undefined };
  return { ...prefs, [getDigestKey(mondayStr)]: true };
}

// ─── Data sufficiency ─────────────────────────────────────────────────────────

/**
 * Only send the digest when the coach has at least some meaningful activity
 * so the email contains useful content rather than empty placeholders.
 */
export function hasEnoughDataForDigest(weekObs: number, playerCount: number): boolean {
  return weekObs >= 2 && playerCount >= 2;
}

// ─── Email copy ───────────────────────────────────────────────────────────────

export function buildDigestSubject(teamName: string, weekObs: number): string {
  if (weekObs >= 20) return `🏆 Great week, Coach! ${teamName} — ${weekObs} observations logged`;
  if (weekObs >= 10) return `📊 Your ${teamName} coaching week in review`;
  return `📋 ${teamName} — your week at a glance`;
}

export function getCoachGreeting(name: string): string {
  const first = name.split(' ')[0] ?? name;
  return `Hey ${first},`;
}

// Render via the unified branded layout — header, footer, List-Unsubscribe
// behavior all consistent with the rest of SportsIQ's email family.
import {
  renderEmail,
  heroSection,
  paragraph,
  ctaButton,
  statRow,
  divider,
} from './email/layout';

export function buildDigestHtml(data: WeekDigestData): string {
  const {
    coachName,
    teamName,
    weekLabel,
    weekObs,
    weekSessions,
    weekPlayers,
    positiveObs,
    needsWorkObs,
    topPerformer,
    neglectedPlayerNames,
    topCategory,
    appUrl,
  } = data;

  const positiveRate = weekObs > 0 ? Math.round((positiveObs / weekObs) * 100) : 0;
  const greeting = getCoachGreeting(coachName);

  const callouts: string[] = [];
  if (topPerformer) {
    callouts.push(
      paragraph(
        `<strong>⭐ Standout: ${topPerformer.name}</strong> — ${topPerformer.count} positive observation${topPerformer.count > 1 ? 's' : ''} this week. Worth sharing with their parents.`,
        { html: true },
      ),
    );
  }
  if (topCategory) {
    callouts.push(
      paragraph(
        `<strong>💪 Top strength:</strong> ${formatCategoryLabel(topCategory)}. Keep building on it.`,
        { html: true },
      ),
    );
  }
  if (neglectedPlayerNames.length > 0) {
    callouts.push(
      paragraph(
        `<strong>👀 Haven't been observed in 7+ days:</strong> ${neglectedPlayerNames.slice(0, 5).join(', ')}${neglectedPlayerNames.length > 5 ? ` +${neglectedPlayerNames.length - 5} more` : ''}.`,
        { html: true },
      ),
    );
  }
  if (positiveRate > 0) {
    callouts.push(
      paragraph(
        `<strong>${positiveRate}%</strong> of observations were positive${needsWorkObs > 0 ? ` · ${needsWorkObs} growth area${needsWorkObs === 1 ? '' : 's'} flagged` : ''}.`,
        { html: true },
      ),
    );
  }

  return renderEmail({
    preview: `${weekObs} observations across ${weekSessions} session${weekSessions === 1 ? '' : 's'} this week.`,
    body: [
      heroSection(`${greeting.replace(',', '')} — your week with ${teamName}`, weekLabel),
      statRow([
        { label: 'Observations', value: String(weekObs) },
        { label: 'Sessions', value: String(weekSessions) },
        { label: 'Players seen', value: String(weekPlayers) },
      ]),
      callouts.length > 0 ? callouts.join('') + divider() : '',
      paragraph('Roll this week\'s data straight into next week\'s plan — one tap.'),
      ctaButton("Build next week's plan →", `${appUrl}/plans`),
    ].join(''),
  });
}
