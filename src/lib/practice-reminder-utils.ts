/**
 * Pure utilities for the pre-practice reminder email cron.
 *
 * Coaches who have a session scheduled for today receive a morning email
 * showing which players haven't been observed recently, a last-session
 * summary, and deep-link CTAs to the timer and capture page.
 */

import type { Json } from '@/types/database';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReminderPlayer {
  id: string;
  name: string;
  jersey_number: number | null;
}

export interface ReminderObservation {
  player_id: string | null;
  sentiment: string;
  category: string | null;
  created_at: string;
}

export interface LastSessionSummary {
  totalObs: number;
  playerCount: number;
  strongCategories: string[];
  weakCategories: string[];
  daysAgo: number;
}

export interface ReminderEmailParams {
  coachName: string;
  teamName: string;
  sessionType: string;
  startTime: string | null;
  sessionId: string;
  players: ReminderPlayer[];
  neglectedPlayers: ReminderPlayer[];
  lastSession: LastSessionSummary | null;
  appUrl: string;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

export function getDaysAgo(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

// ─── Preferences helpers ──────────────────────────────────────────────────────

export function getReminderKey(dateStr: string): string {
  return `practice_reminder_${dateStr}`;
}

export function hasAlreadySentReminder(preferences: Json, dateStr: string): boolean {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return false;
  const prefs = preferences as Record<string, unknown>;
  const key = getReminderKey(dateStr);
  return prefs[key] === true;
}

export function isReminderDisabled(preferences: Json): boolean {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return false;
  const prefs = preferences as Record<string, unknown>;
  return prefs['disable_practice_reminders'] === true;
}

export function markReminderSent(preferences: Json, dateStr: string): { [key: string]: Json | undefined } {
  const prefs = (preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? preferences
    : {}) as { [key: string]: Json | undefined };
  return { ...prefs, [getReminderKey(dateStr)]: true };
}

// ─── Session helpers ──────────────────────────────────────────────────────────

const SESSION_TYPE_LABELS: Record<string, string> = {
  practice: 'Practice',
  game: 'Game',
  scrimmage: 'Scrimmage',
  tournament: 'Tournament',
  training: 'Training',
};

export function buildSessionTypeLabel(type: string): string {
  return SESSION_TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

export function buildSessionTimeLabel(startTime: string | null): string {
  if (!startTime) return '';
  const parts = startTime.split(':').map(Number);
  const h = parts[0];
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const SESSION_TYPE_EMOJIS: Record<string, string> = {
  practice: '🏃',
  game: '🏆',
  scrimmage: '⚡',
  tournament: '🥇',
  training: '💪',
};

export function getSessionEmoji(type: string): string {
  return SESSION_TYPE_EMOJIS[type] ?? '📅';
}

// ─── Player observation helpers ───────────────────────────────────────────────

export function getLastObservationDate(
  playerId: string,
  observations: ReminderObservation[],
): string | null {
  const playerObs = observations.filter((o) => o.player_id === playerId);
  if (playerObs.length === 0) return null;
  return playerObs.sort((a, b) => b.created_at.localeCompare(a.created_at))[0].created_at;
}

export function getPlayersNotRecentlyObserved(
  players: ReminderPlayer[],
  observations: ReminderObservation[],
  daysCutoff: number = 7,
): ReminderPlayer[] {
  return players.filter((p) => {
    const lastObs = getLastObservationDate(p.id, observations);
    if (!lastObs) return true; // never observed
    return getDaysAgo(lastObs) >= daysCutoff;
  });
}

export function hasEnoughDataForReminder(
  players: ReminderPlayer[],
  observations: ReminderObservation[],
): boolean {
  return players.length >= 2 && observations.length >= 3;
}

// ─── Last session summary helpers ─────────────────────────────────────────────

export function countObsByCategory(
  observations: ReminderObservation[],
  sentiment: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const obs of observations) {
    if (obs.sentiment !== sentiment) continue;
    const cat = obs.category ?? 'general';
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  return counts;
}

export function getTopCategories(
  categoryCounts: Record<string, number>,
  topN: number = 2,
): string[] {
  return Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([cat]) => cat.charAt(0).toUpperCase() + cat.slice(1));
}

export function buildLastSessionSummary(
  sessionDate: string,
  observations: ReminderObservation[],
  playerCount: number,
): LastSessionSummary {
  const uniquePlayers = new Set(
    observations.map((o) => o.player_id).filter(Boolean),
  ).size;
  const positiveByCategory = countObsByCategory(observations, 'positive');
  const needsWorkByCategory = countObsByCategory(observations, 'needs-work');

  return {
    totalObs: observations.length,
    playerCount: Math.min(uniquePlayers, playerCount),
    strongCategories: getTopCategories(positiveByCategory),
    weakCategories: getTopCategories(needsWorkByCategory),
    daysAgo: getDaysAgo(sessionDate),
  };
}

// ─── Email HTML builder ───────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildPracticeReminderHtml(params: ReminderEmailParams): string {
  const {
    coachName,
    teamName,
    sessionType,
    startTime,
    sessionId,
    players,
    neglectedPlayers,
    lastSession,
    appUrl,
  } = params;

  const typeLabel = buildSessionTypeLabel(sessionType);
  const timeLabel = buildSessionTimeLabel(startTime);
  const emoji = getSessionEmoji(sessionType);
  const firstName = coachName.split(' ')[0] || coachName;

  const timerUrl = `${appUrl}/sessions/${sessionId}/timer`;
  const captureUrl = `${appUrl}/capture?sessionId=${sessionId}`;
  const sessionUrl = `${appUrl}/sessions/${sessionId}`;
  const rosterUrl = `${appUrl}/roster`;
  const settingsUrl = `${appUrl}/settings/profile`;

  const headingTime = timeLabel ? ` at ${timeLabel}` : '';
  const subject = `${emoji} ${typeLabel} today${headingTime} — ${teamName}`;

  // Neglected players section
  let neglectedHtml = '';
  if (neglectedPlayers.length > 0) {
    const playerItems = neglectedPlayers
      .slice(0, 5)
      .map((p) => {
        const jersey = p.jersey_number != null ? ` #${p.jersey_number}` : '';
        return `<li style="margin:4px 0;color:#374151;">${p.name}${jersey}</li>`;
      })
      .join('');

    neglectedHtml = `
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 8px;font-weight:700;color:#92400e;font-size:14px;">👀 Haven't been observed this week</p>
        <ul style="margin:0;padding-left:18px;">
          ${playerItems}
        </ul>
        <p style="margin:10px 0 0;font-size:12px;color:#78350f;">Give these players extra attention today to keep your coverage complete.</p>
      </div>
    `;
  } else if (players.length >= 2) {
    neglectedHtml = `
      <div style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:6px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0;font-weight:700;color:#166534;font-size:14px;">✅ Great coverage — all players observed recently</p>
      </div>
    `;
  }

  // Last session summary section
  let lastSessionHtml = '';
  if (lastSession) {
    const daysLabel = lastSession.daysAgo === 0
      ? 'earlier today'
      : lastSession.daysAgo === 1
      ? 'yesterday'
      : `${lastSession.daysAgo} days ago`;

    const strongList = lastSession.strongCategories.length > 0
      ? lastSession.strongCategories.map(capitalize).join(', ')
      : '—';
    const weakList = lastSession.weakCategories.length > 0
      ? lastSession.weakCategories.map(capitalize).join(', ')
      : '—';

    lastSessionHtml = `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 10px;font-weight:700;color:#1e293b;font-size:14px;">📊 Last session (${daysLabel})</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="color:#64748b;padding:3px 0;">Observations</td>
            <td style="color:#1e293b;font-weight:600;text-align:right;">${lastSession.totalObs} for ${lastSession.playerCount} players</td>
          </tr>
          <tr>
            <td style="color:#64748b;padding:3px 0;">Strong ✅</td>
            <td style="color:#15803d;font-weight:600;text-align:right;">${strongList}</td>
          </tr>
          <tr>
            <td style="color:#64748b;padding:3px 0;">Needs work ⚠️</td>
            <td style="color:#b45309;font-weight:600;text-align:right;">${weakList}</td>
          </tr>
        </table>
        <a href="${sessionUrl}" style="display:inline-block;margin-top:12px;font-size:12px;color:#f97316;text-decoration:none;">View full session debrief →</a>
      </div>
    `;
  }

  // CTA buttons
  const ctaButtons = [
    { label: `${emoji} Start Timer`, url: timerUrl, primary: true },
    { label: '🎙 Capture Obs', url: captureUrl, primary: false },
    { label: '👥 View Roster', url: rosterUrl, primary: false },
  ]
    .map((btn) => {
      const bg = btn.primary ? '#f97316' : '#ffffff';
      const color = btn.primary ? '#ffffff' : '#374151';
      const border = btn.primary ? 'none' : '1px solid #d1d5db';
      return `<a href="${btn.url}" style="display:inline-block;padding:12px 20px;background:${bg};color:${color};border:${border};border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;margin:4px;">${btn.label}</a>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
<tr><td align="center" style="padding:24px 16px;">
<table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr>
    <td style="background:#111827;padding:24px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <span style="font-weight:800;font-size:18px;color:#f97316;">SportsIQ</span>
            <span style="color:#6b7280;font-size:13px;margin-left:8px;">Coaching Intelligence</span>
          </td>
        </tr>
        <tr>
          <td style="padding-top:16px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#f9fafb;">${emoji} ${typeLabel} today${headingTime}</p>
            <p style="margin:4px 0 0;font-size:14px;color:#9ca3af;">${teamName}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:28px;">
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${firstName},</p>
      <p style="margin:0 0 8px;font-size:15px;color:#374151;">
        You have <strong>${typeLabel.toLowerCase()}</strong>${timeLabel ? ` at <strong>${timeLabel}</strong>` : ''} today.
        Here's a quick briefing to help you coach your best.
      </p>

      ${neglectedHtml}
      ${lastSessionHtml}

      <!-- CTA buttons -->
      <div style="text-align:center;margin:24px 0 8px;">
        ${ctaButtons}
      </div>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
        You're receiving this because you have ${typeLabel.toLowerCase()} scheduled today.
        <a href="${settingsUrl}" style="color:#f97316;">Manage email preferences</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// Returns subject line separately so tests can verify it without parsing HTML
export function buildPracticeReminderSubject(
  sessionType: string,
  startTime: string | null,
  teamName: string,
): string {
  const emoji = getSessionEmoji(sessionType);
  const typeLabel = buildSessionTypeLabel(sessionType);
  const timeLabel = buildSessionTimeLabel(startTime);
  const headingTime = timeLabel ? ` at ${timeLabel}` : '';
  return `${emoji} ${typeLabel} today${headingTime} — ${teamName}`;
}
