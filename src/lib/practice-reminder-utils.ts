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

import {
  renderEmail,
  heroSection,
  paragraph,
  ctaButton,
  divider,
} from './email/layout';

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

  // Two pre-game callouts: who hasn't been observed lately, and last session
  // recap. Both render as plain styled paragraphs through the unified layout.
  const callouts: string[] = [];
  if (neglectedPlayers.length > 0) {
    const list = neglectedPlayers
      .slice(0, 5)
      .map((p) => `${p.name}${p.jersey_number != null ? ` #${p.jersey_number}` : ''}`)
      .join(', ');
    callouts.push(
      paragraph(
        `<strong>👀 Haven't been observed this week:</strong> ${list}${neglectedPlayers.length > 5 ? ` +${neglectedPlayers.length - 5} more` : ''}. Give them extra attention today.`,
        { html: true },
      ),
    );
  } else if (players.length >= 2) {
    callouts.push(paragraph(`<strong>✅ Great coverage</strong> — every player has an observation in the last week.`, { html: true }));
  }

  if (lastSession) {
    const daysLabel =
      lastSession.daysAgo === 0
        ? 'earlier today'
        : lastSession.daysAgo === 1
        ? 'yesterday'
        : `${lastSession.daysAgo} days ago`;
    const strong = lastSession.strongCategories.length > 0
      ? lastSession.strongCategories.map(capitalize).join(', ')
      : '—';
    const weak = lastSession.weakCategories.length > 0
      ? lastSession.weakCategories.map(capitalize).join(', ')
      : '—';
    callouts.push(
      paragraph(
        `<strong>📊 Last session (${daysLabel}):</strong> ${lastSession.totalObs} obs across ${lastSession.playerCount} players. Strong: ${strong}. Needs work: ${weak}.`,
        { html: true },
      ),
    );
  }

  return renderEmail({
    transactional: true,
    preview: `${typeLabel} today${timeLabel ? ` at ${timeLabel}` : ''} — ${teamName}.`,
    body: [
      heroSection(
        `${emoji} ${typeLabel} today${timeLabel ? ` at ${timeLabel}` : ''}`,
        `Hi ${firstName} — quick pre-session brief for ${teamName}.`,
      ),
      callouts.length > 0 ? callouts.join('') + divider() : '',
      paragraph('Two-tap setup before warmups: open the timer, then Capture from the bench. Names you forget will surface in observations.'),
      ctaButton(`${emoji} Start timer`, timerUrl),
      paragraph(`<a href="${captureUrl}" style="color:#c2410c;text-decoration:underline;">Or jump straight to Capture →</a>`, { html: true }),
    ].join(''),
  });
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
