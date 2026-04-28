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

// ─── Email HTML ───────────────────────────────────────────────────────────────

function emailWrap(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body{margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f4f4f5}
    .wrapper{max-width:600px;margin:0 auto;padding:40px 20px}
    .logo{font-size:22px;font-weight:700;color:#f97316;margin-bottom:32px}
    .card{background:#18181b;border-radius:12px;padding:28px;margin-bottom:20px}
    h1{font-size:22px;font-weight:700;color:#f4f4f5;margin:0 0 8px}
    h2{font-size:16px;font-weight:600;color:#f4f4f5;margin:0 0 12px}
    p{font-size:15px;line-height:1.6;color:#a1a1aa;margin:0 0 14px}
    .stat-row{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}
    .stat{background:#27272a;border-radius:8px;padding:14px 18px;flex:1;min-width:120px;text-align:center}
    .stat-num{font-size:26px;font-weight:700;color:#f97316;display:block}
    .stat-label{font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:.05em}
    .spotlight{background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);border-radius:10px;padding:20px;margin-bottom:20px}
    .spotlight h2{color:#fff;margin:0 0 4px}
    .spotlight p{color:rgba(255,255,255,.85);margin:0}
    .attention{background:#27272a;border-radius:8px;padding:14px 18px;margin-bottom:8px}
    .attention p{margin:0;font-size:14px;color:#a1a1aa}
    .pill{display:inline-block;background:#16a34a22;color:#4ade80;border-radius:20px;padding:3px 10px;font-size:13px;font-weight:500}
    .cta{display:inline-block;background:#f97316;color:#fff!important;font-weight:600;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;margin-top:8px}
    .footer{font-size:12px;color:#52525b;text-align:center;padding-top:24px;line-height:1.7}
    a.footer-link{color:#71717a;text-decoration:underline}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="logo">SportsIQ 🏀</div>
    ${body}
    <div class="footer">
      You're receiving this because you coach with SportsIQ.<br />
      <a class="footer-link" href="${'{{unsubscribe}}'}">Unsubscribe from weekly digests</a>
    </div>
  </div>
</body>
</html>`;
}

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

  const greeting = getCoachGreeting(coachName);
  const positiveRate = weekObs > 0 ? Math.round((positiveObs / weekObs) * 100) : 0;

  // ── Stat grid ──────────────────────────────────────────────────────────────
  const statGrid = `
    <div class="stat-row">
      <div class="stat">
        <span class="stat-num">${weekObs}</span>
        <span class="stat-label">Observations</span>
      </div>
      <div class="stat">
        <span class="stat-num">${weekSessions}</span>
        <span class="stat-label">Sessions</span>
      </div>
      <div class="stat">
        <span class="stat-num">${weekPlayers}</span>
        <span class="stat-label">Players Observed</span>
      </div>
    </div>
    ${positiveRate > 0 ? `<p><span class="pill">✓ ${positiveRate}% positive observations</span>${needsWorkObs > 0 ? ` &nbsp; <span style="color:#71717a;font-size:13px">${needsWorkObs} growth areas flagged</span>` : ''}</p>` : ''}
  `;

  // ── Top performer spotlight ────────────────────────────────────────────────
  const spotlightSection = topPerformer ? `
    <div class="spotlight">
      <h2>⭐ Player Spotlight — ${topPerformer.name}</h2>
      <p>You noted ${topPerformer.count} positive observation${topPerformer.count > 1 ? 's' : ''} for ${topPerformer.name} this week. Consider sharing progress with their parents!</p>
    </div>
  ` : '';

  // ── Category strength ─────────────────────────────────────────────────────
  const categorySection = topCategory ? `
    <div class="card" style="border-left:3px solid #22c55e">
      <h2>💪 Top Strength This Week</h2>
      <p>Your team showed the most positive momentum in <strong style="color:#4ade80">${formatCategoryLabel(topCategory)}</strong>. Keep building on it!</p>
    </div>
  ` : '';

  // ── Neglected players ─────────────────────────────────────────────────────
  const neglectedSection = neglectedPlayerNames.length > 0 ? `
    <div class="card" style="border-left:3px solid #f59e0b">
      <h2>👀 Players Needing Attention</h2>
      <p>You haven't observed these players in the last 7 days. Give them some coaching love this week:</p>
      ${neglectedPlayerNames.map((n) => `<div class="attention"><p>• ${n}</p></div>`).join('')}
    </div>
  ` : '';

  // ── CTA ───────────────────────────────────────────────────────────────────
  const ctaSection = `
    <div class="card" style="text-align:center">
      <h2>Ready for next week?</h2>
      <p>Turn this week's observations into a targeted practice plan — in one tap.</p>
      <a href="${appUrl}/plans" class="cta">Build Next Week's Plan →</a>
    </div>
  `;

  const body = `
    <div class="card">
      <p style="color:#a1a1aa;font-size:14px;margin-bottom:8px">${greeting}</p>
      <h1>Your week with ${teamName}</h1>
      <p style="color:#71717a;font-size:14px;margin-bottom:20px">${weekLabel}</p>
      ${statGrid}
    </div>
    ${spotlightSection}
    ${categorySection}
    ${neglectedSection}
    ${ctaSection}
  `;

  return emailWrap(`${teamName} — Weekly Coaching Digest`, body);
}
