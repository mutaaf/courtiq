/**
 * Ticket 0062 — pure helpers for the mid-week silent-player nudge cron.
 *
 * Two surfaces:
 *
 *   (1) `selectSilentPlayer(team, observations, today)` — picks the SINGLE
 *       player on a team whose gap since their last observation (or, for a
 *       zero-observation player who was added to the team >= 8 days ago,
 *       since the player was added) is the LONGEST. Returns null when no
 *       player qualifies. Tie-break (equal gapDays): id ascending — keeps
 *       the choice deterministic across cron runs.
 *
 *   (2) `buildSilentPlayerNudgeEmail(args)` — { subject, html, text }
 *       envelope around `@/lib/email/layout` helpers. The email body has
 *       exactly the five elements the ticket names:
 *         - the player-and-team header,
 *         - the prior observation line (or the alternate "First note about
 *           <Name>" line when there is no history),
 *         - the one-line nudge,
 *         - the CTA button "Capture about <First Name>" pointing at the
 *           deep-link URL,
 *         - the footer with the coach's referral code + an unsubscribe link.
 *
 * NO DB access. NO AI call. Voice contract per LESSONS#0023 / AGENTS.md:
 * the strings are written positively; the test scans for banned hype words
 * literally (we never enumerate them in the source).
 *
 * COPPA: the email surface only ever takes the player's FIRST NAME (the
 * caller passes `players.name.split(' ')[0]`), the gap in days, the team
 * name, the prior observation TEXT (coach-authored), and the deep-link URL.
 * Never DOB, jersey number, parent contact, medical notes, or full name.
 */
import {
  ctaButton,
  escapeHtml,
  fineprint,
  heroSection,
  paragraph,
  renderEmail,
} from '@/lib/email/layout';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SilentPlayerCandidate {
  id: string;
  name: string;
  created_at: string;
}

export interface SilentPlayerObservation {
  player_id: string;
  text: string;
  created_at: string;
}

export interface SilentPlayerResult {
  playerId: string;
  playerName: string;
  gapDays: number;
  /** The TEXT of the most recent prior observation for the picked player, or
   * null if the player has never been observed. */
  lastObservationText: string | null;
  /** The ISO timestamp of that most recent prior observation, or null. */
  lastObservationDate: string | null;
}

export interface BuildEmailArgs {
  playerFirstName: string;
  gapDays: number;
  teamName: string;
  /** Optional — null when the player has never been observed. */
  lastObservationText: string | null;
  /** Optional — null when the player has never been observed. */
  lastObservationDate: string | null;
  deepLinkUrl: string;
  referralCode: string;
  unsubscribeUrl: string;
}

// ─── Selection ──────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_GAP_DAYS = 8;
const OBS_TRUNC = 120;

/** Whole-day gap between `then` and `now`, floored — matches the AC. */
function daysBetween(now: Date, thenIso: string): number {
  const t = Date.parse(thenIso);
  if (!Number.isFinite(t)) return 0;
  const ms = now.getTime() - t;
  if (ms <= 0) return 0;
  return Math.floor(ms / DAY_MS);
}

/**
 * Pick the SINGLE player whose gap since their last observation (or, for a
 * never-observed player, since they were added to the team) is the LONGEST
 * AND >= 8 days. Returns null when nobody on this team qualifies.
 *
 * Deterministic tie-break: longer gap wins; equal gaps → lower player id.
 */
export function selectSilentPlayer(
  candidates: SilentPlayerCandidate[],
  observations: SilentPlayerObservation[],
  today: Date = new Date(),
): SilentPlayerResult | null {
  if (candidates.length === 0) return null;

  // Index the most-recent observation per player (and its text).
  const latestByPlayer = new Map<
    string,
    { created_at: string; text: string }
  >();
  for (const o of observations) {
    const prior = latestByPlayer.get(o.player_id);
    if (!prior || o.created_at > prior.created_at) {
      latestByPlayer.set(o.player_id, { created_at: o.created_at, text: o.text });
    }
  }

  // Compute each player's gap. A never-observed player's gap is days since
  // created_at — they only qualify if that is >= 8 days.
  const scored: Array<{
    id: string;
    name: string;
    gapDays: number;
    lastText: string | null;
    lastDate: string | null;
  }> = [];

  for (const c of candidates) {
    const last = latestByPlayer.get(c.id) ?? null;
    if (last) {
      const gap = daysBetween(today, last.created_at);
      if (gap >= MIN_GAP_DAYS) {
        scored.push({
          id: c.id,
          name: c.name,
          gapDays: gap,
          lastText: last.text,
          lastDate: last.created_at,
        });
      }
    } else {
      // Zero-observation player: floor gap to days since they were added.
      const sinceAdded = daysBetween(today, c.created_at);
      if (sinceAdded >= MIN_GAP_DAYS) {
        scored.push({
          id: c.id,
          name: c.name,
          gapDays: sinceAdded,
          lastText: null,
          lastDate: null,
        });
      }
    }
  }

  if (scored.length === 0) return null;

  // Longest gap wins; tie-break by id ascending.
  scored.sort((a, b) => {
    if (b.gapDays !== a.gapDays) return b.gapDays - a.gapDays;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const top = scored[0];
  return {
    playerId: top.id,
    playerName: top.name,
    gapDays: top.gapDays,
    lastObservationText: top.lastText,
    lastObservationDate: top.lastDate,
  };
}

// ─── Email builder ──────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function formatObservedAt(iso: string): string {
  // YYYY-MM-DD in UTC, then a short "Mon DD" rendering so the date in the
  // email stays deterministic regardless of the inbox client's locale.
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Build the silent-player nudge email body. Returns subject + html + text;
 * the cron passes html to `sendEmail()` and stores nothing.
 */
export function buildSilentPlayerNudgeEmail(args: BuildEmailArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    playerFirstName,
    gapDays,
    teamName,
    lastObservationText,
    lastObservationDate,
    deepLinkUrl,
    referralCode,
    unsubscribeUrl,
  } = args;

  const firstName = playerFirstName?.trim() || 'this player';
  const team = teamName?.trim() || 'your team';

  const subject = `You haven't said anything about ${firstName} in ${gapDays} days.`;

  // Header — the player-and-team line.
  const header = heroSection(
    `${firstName} on the ${team}`,
    `It has been ${gapDays} days since your last note about ${firstName}.`,
  );

  // Prior-observation line OR the alternate "first note" line when the
  // player has no history.
  let priorLineHtml: string;
  let priorLineText: string;
  if (lastObservationText && lastObservationDate) {
    const truncated = truncate(lastObservationText, OBS_TRUNC);
    const dateLabel = formatObservedAt(lastObservationDate);
    priorLineHtml = paragraph(
      `Last note about ${firstName} — ${dateLabel} — was that ${truncated}`,
    );
    priorLineText = `Last note about ${firstName} — ${dateLabel} — was that ${truncated}`;
  } else {
    priorLineHtml = paragraph(`First note about ${firstName}?`);
    priorLineText = `First note about ${firstName}?`;
  }

  const nudgeLine = paragraph('15-second voice note before tomorrow’s practice?');
  const cta = ctaButton(`Capture about ${firstName}`, deepLinkUrl);

  const referralLine = fineprint(
    `Coach a friend's team this season too? Share your code ${referralCode}.`,
  );

  const body = header + priorLineHtml + nudgeLine + cta + referralLine;

  const footer = `You are getting this because you are coaching ${escapeHtml(team)} on SportsIQ. <a href="${unsubscribeUrl}" style="color:#94a3b8;">Manage email preferences</a>`;

  const html = renderEmail({
    preview: `${firstName} on the ${team} — quick voice note?`,
    body,
    footer,
  });

  const text = [
    `${firstName} on the ${team}`,
    '',
    `It has been ${gapDays} days since your last note about ${firstName}.`,
    '',
    priorLineText,
    '',
    '15-second voice note before tomorrow’s practice?',
    '',
    `Capture about ${firstName}: ${deepLinkUrl}`,
    '',
    `Your invite code: ${referralCode}`,
    '',
    `Manage email preferences: ${unsubscribeUrl}`,
  ].join('\n');

  return { subject, html, text };
}

// ─── Preferences helpers ────────────────────────────────────────────────────
//
// Per-ISO-week bookmark on `coaches.preferences` ensures one email per
// (coach, ISO-week). Mirrors the 0058 Sunday-plan-prompt pattern; reuses
// `getIsoWeekKey` from sunday-plan-prompt-utils so the two crons agree on
// what "this week" means (no second ISO algorithm to maintain).

import { getIsoWeekKey } from '@/lib/sunday-plan-prompt-utils';
import type { Json } from '@/types/database';

export { getIsoWeekKey };

export function getSilentPlayerNudgeKey(isoWeek: string): string {
  return `silent_player_nudge_${isoWeek}`;
}

export function hasAlreadySentSilentPlayerNudge(prefs: Json, isoWeek: string): boolean {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return false;
  const obj = prefs as Record<string, unknown>;
  return obj[getSilentPlayerNudgeKey(isoWeek)] === true;
}

export function isSilentPlayerNudgeDisabled(prefs: Json): boolean {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return false;
  const obj = prefs as Record<string, unknown>;
  return obj.disable_silent_player_nudge === true;
}

export function markSilentPlayerNudgeSent(
  prefs: Json,
  isoWeek: string,
): { [key: string]: Json | undefined } {
  const base = (prefs && typeof prefs === 'object' && !Array.isArray(prefs)
    ? prefs
    : {}) as { [key: string]: Json | undefined };
  return { ...base, [getSilentPlayerNudgeKey(isoWeek)]: true };
}
