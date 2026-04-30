/**
 * Pure utility functions for the Automatic Weekly Parent Progress Digest.
 *
 * Every Sunday at 18:00 UTC the cron job sends each parent (with an email on
 * file) a personalized email with their child's live progress portal link.
 * Coaches opt in once from Settings → Profile. No new DB tables needed.
 */

// ── Week helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the ISO date string (YYYY-MM-DD) of the most recent Sunday on or
 * before the given date. Used for per-week dedup keys.
 */
export function getWeekStartSunday(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().split('T')[0];
}

// ── Preference helpers ────────────────────────────────────────────────────────

export function isParentDigestEnabled(prefs: any): boolean {
  return !!prefs?.auto_parent_digest?.enabled;
}

export function hasAlreadySentParentDigest(prefs: any, weekStr: string): boolean {
  return !!prefs?.[`parent_digest_week_${weekStr}`];
}

export function markParentDigestSent(prefs: any, weekStr: string): object {
  return { ...(prefs ?? {}), [`parent_digest_week_${weekStr}`]: true };
}

export function enableParentDigest(prefs: any): object {
  return { ...(prefs ?? {}), auto_parent_digest: { enabled: true } };
}

export function disableParentDigest(prefs: any): object {
  const copy = { ...(prefs ?? {}) };
  delete copy.auto_parent_digest;
  return copy;
}

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * Minimum observation count for a player's report to be worth sending.
 * Below this threshold the report portal would be too sparse to impress parents.
 */
export function hasEnoughDataForParentDigest(obsCount: number): boolean {
  return obsCount >= 3;
}

/**
 * Returns the text of the most recent positive observation, truncated to
 * 120 characters, or null when no positive observations exist.
 */
export function getRecentObsHighlight(
  obs: Array<{ sentiment: string; text: string; created_at: string }>
): string | null {
  const positive = obs
    .filter((o) => o.sentiment === 'positive' && o.text?.trim())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (!positive.length) return null;
  const text = positive[0].text.trim();
  return text.length > 120 ? text.slice(0, 117) + '…' : text;
}

export function buildShareUrl(token: string, appUrl: string): string {
  return `${appUrl}/share/${token}`;
}

// ── Email content ─────────────────────────────────────────────────────────────

export function buildParentDigestSubject(
  playerName: string,
  coachName: string
): string {
  const first = playerName.split(' ')[0];
  return `${first}'s weekly progress update from Coach ${coachName} 🏅`;
}

export interface ParentDigestParams {
  playerName: string;
  parentName: string | null;
  coachName: string;
  teamName: string;
  shareUrl: string;
  obsCount: number;
  sessionCount: number;
  highlight: string | null;
  appUrl: string;
}

import {
  renderEmail,
  heroSection,
  paragraph,
  ctaButton,
  fineprint,
} from './email/layout';

export function buildParentDigestHtml(p: ParentDigestParams): string {
  const firstName = p.playerName.split(' ')[0];
  const greeting = p.parentName ? `Hi ${p.parentName.split(' ')[0]} 👋` : 'Hi there 👋';
  const activityLine =
    p.sessionCount > 0
      ? `This week the team had ${p.sessionCount} session${p.sessionCount !== 1 ? 's' : ''} and ${firstName} earned ${p.obsCount} coaching observation${p.obsCount !== 1 ? 's' : ''}.`
      : `${firstName} earned ${p.obsCount} coaching observation${p.obsCount !== 1 ? 's' : ''} this week.`;

  return renderEmail({
    transactional: true,
    preview: `Coach ${p.coachName} put together a quick read on ${firstName}'s week.`,
    body: [
      heroSection(`${firstName}'s week — ${p.teamName}`, greeting),
      paragraph(`${activityLine} Coach ${p.coachName} wanted to share the highlights with you.`),
      p.highlight
        ? `<div style="margin:16px 0;padding:12px 16px;border-left:3px solid #16a34a;background:#f0fdf4;border-radius:0 8px 8px 0;">
            <p style="margin:0;font-size:14px;line-height:1.55;color:#15803d;font-style:italic;">"${escapeHtml(p.highlight)}"</p>
            <p style="margin:6px 0 0;font-size:12px;color:#16a34a;">— Coach ${escapeHtml(p.coachName)}</p>
          </div>`
        : '',
      ctaButton(`See ${firstName}'s progress card →`, p.shareUrl),
      fineprint(
        `The card includes skill assessments, observations, achievement badges, and development goals. No login required — link expires in 30 days.`,
      ),
    ].join(''),
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
