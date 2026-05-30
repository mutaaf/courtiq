/**
 * Pure utilities for the Sunday-evening plan-finish prompt cron (ticket 0058).
 *
 * Subject + html builders, preferences helpers (opt-out + per-ISO-week
 * bookmark), and an ISO-week formatter. No DB access. No imports beyond the
 * email shell helpers (`@/lib/email/layout`) and the shared `Json` type.
 *
 * Voice contract (AGENTS.md + LESSONS#0023): every user-visible string the
 * cron produces is checked against the banned hype list in
 * `tests/lib/sunday-plan-prompt-utils.test.ts`. The strings here are written
 * POSITIVELY ("Finish in 12 minutes" / "N drills left") — banned tokens are
 * never enumerated in the prompt copy.
 */
import {
  ctaButton,
  escapeHtml,
  fineprint,
  heroSection,
  paragraph,
  renderEmail,
} from '@/lib/email/layout';
import type { DraftSegment } from '@/lib/plan-draft-utils';
import type { Json } from '@/types/database';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DraftDrill {
  name: string;
  durationMinutes: number | null;
}

export interface DraftSnapshot {
  draftId: string;
  draftTitle: string | null;
  drills: DraftDrill[];
}

export interface SubjectArgs {
  teamName: string;
  dayOfNextSession: string;
  gapCount: number;
}

export interface EmailArgs extends SubjectArgs {
  missingSegment: DraftSegment | null;
  draftSnapshot: DraftSnapshot;
  referralCode: string;
  unsubscribeUrl: string;
  appUrl: string;
}

// ─── Subject ────────────────────────────────────────────────────────────────

function safeTeamName(name: string): string {
  return name && name.trim().length > 0 ? name.trim() : 'your team';
}

export function buildSundayPlanPromptSubject({
  teamName,
  dayOfNextSession,
  gapCount,
}: SubjectArgs): string {
  const team = safeTeamName(teamName);
  // Use "the <Team>" when we have a real team name, but plain "your team"
  // when we fell back so the subject doesn't read "for the your team".
  const teamPhrase = team === 'your team' ? 'your team' : `the ${team}`;
  if (gapCount <= 0) {
    return `Your ${dayOfNextSession} plan for ${teamPhrase} — last 1 minute`;
  }
  const noun = gapCount === 1 ? 'drill' : 'drills';
  return `Your ${dayOfNextSession} plan for ${teamPhrase} — ${gapCount} ${noun} left`;
}

// ─── Gap copy ───────────────────────────────────────────────────────────────
//
// One short line that names the gap in the coach's voice. Always positive,
// no hype tokens. We avoid the literal word "miss" / "missing" in favour of
// "still to add" so the email reads as a fast finish rather than a scold.

function gapLine(segment: DraftSegment | null, gapCount: number): string {
  if (gapCount <= 0 || segment === null) {
    return 'Tap save to flip it from draft to active.';
  }
  switch (segment) {
    case 'warmup':
      return 'Add a warmup and you are set.';
    case 'drills':
      return 'Add one drill and you are set.';
    case 'scrimmage':
      return 'Add a scrimmage and you are set.';
    case 'cooldown':
      return 'Add a closeout and you are set.';
  }
}

// ─── Drill list (html + text) ───────────────────────────────────────────────

function renderDrillsHtml(drills: DraftDrill[]): string {
  if (drills.length === 0) {
    return paragraph('No drills added yet.');
  }
  const items = drills
    .map((d) => {
      const dur = typeof d.durationMinutes === 'number' && d.durationMinutes > 0
        ? `${d.durationMinutes} min`
        : '';
      return `<li style="margin:6px 0;font-size:15px;line-height:1.5;color:#0f172a;">${escapeHtml(d.name)}${dur ? ` <span style="color:#475569;">— ${escapeHtml(dur)}</span>` : ''}</li>`;
    })
    .join('');
  return `<ul style="margin:0 0 20px;padding-left:18px;">${items}</ul>`;
}

function renderDrillsText(drills: DraftDrill[]): string {
  if (drills.length === 0) return '  (no drills yet)';
  return drills
    .map((d) => {
      const dur = typeof d.durationMinutes === 'number' && d.durationMinutes > 0
        ? ` — ${d.durationMinutes} min`
        : '';
      return `  • ${d.name}${dur}`;
    })
    .join('\n');
}

// ─── Email builder ──────────────────────────────────────────────────────────

export function buildSundayPlanPromptEmail(args: EmailArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    teamName,
    dayOfNextSession,
    gapCount,
    missingSegment,
    draftSnapshot,
    referralCode,
    unsubscribeUrl,
    appUrl,
  } = args;

  const subject = buildSundayPlanPromptSubject({
    teamName,
    dayOfNextSession,
    gapCount,
  });
  const team = safeTeamName(teamName);
  const teamPhrase = team === 'your team' ? 'your team' : `the ${team}`;
  const draftTitle = draftSnapshot.draftTitle?.trim() || `${dayOfNextSession}'s plan`;
  const deepLink = `${appUrl.replace(/\/$/, '')}/plans?draftId=${encodeURIComponent(draftSnapshot.draftId)}`;
  const referralLink = `${appUrl.replace(/\/$/, '')}/signup?ref=${encodeURIComponent(referralCode)}`;

  // Five elements only, in order: team-and-day header, draft title,
  // drill list, "what's missing" line, CTA. Footer carries the referral
  // line + unsubscribe URL. heroSection / paragraph already escape their
  // inputs — we pass raw strings and let the helper do the work once.
  const body =
    heroSection(
      `${dayOfNextSession} with ${teamPhrase}`,
      `Pick up where you left off on ${draftTitle}.`,
    ) +
    renderDrillsHtml(draftSnapshot.drills) +
    paragraph(gapLine(missingSegment, gapCount)) +
    ctaButton('Finish in 12 minutes', deepLink) +
    fineprint(
      `Coach a friend's team this season too? Share your code ${referralCode} or your link: ${referralLink}.`,
    );

  const footer = `You are getting this because you have an unfinished practice plan for ${escapeHtml(teamPhrase)}. <a href="${unsubscribeUrl}" style="color:#94a3b8;">Manage email preferences</a>`;

  const html = renderEmail({
    preview: `${dayOfNextSession} plan for ${teamPhrase} — pick up where you left off.`,
    body,
    footer,
  });

  // Plain-text fallback — same five elements, no markup. Useful for inbox
  // clients that prefer text/plain.
  const text = [
    `${dayOfNextSession} with ${teamPhrase}`,
    '',
    `Pick up where you left off on ${draftTitle}.`,
    '',
    'Drills so far:',
    renderDrillsText(draftSnapshot.drills),
    '',
    gapLine(missingSegment, gapCount),
    '',
    `Finish in 12 minutes: ${deepLink}`,
    '',
    `Your invite code: ${referralCode} (${referralLink})`,
    '',
    `Manage email preferences: ${unsubscribeUrl}`,
  ].join('\n');

  return { subject, html, text };
}

// ─── Preferences helpers (per-ISO-week bookmark + opt-out) ──────────────────

/**
 * Returns the ISO 8601 week key in `YYYY-Www` format for a given date. The
 * Sunday-evening cron uses this to dedupe sends within the same ISO week so
 * a coach can never receive two finish-prompts in the same calendar week.
 *
 * Implementation follows the ISO-8601 algorithm: the week containing the
 * year's first Thursday is week 1. UTC-based to match the cron's clock.
 */
export function getIsoWeekKey(date: Date = new Date()): string {
  // Algorithm credit: ISO 8601 (https://en.wikipedia.org/wiki/ISO_week_date).
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export function getSundayPromptKey(isoWeek: string): string {
  return `sunday_plan_prompt_${isoWeek}`;
}

export function hasAlreadySentSundayPrompt(prefs: Json, isoWeek: string): boolean {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return false;
  const obj = prefs as Record<string, unknown>;
  return obj[getSundayPromptKey(isoWeek)] === true;
}

export function isSundayPromptDisabled(prefs: Json): boolean {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return false;
  const obj = prefs as Record<string, unknown>;
  return obj.disable_planning_prompts === true;
}

export function markSundayPromptSent(
  prefs: Json,
  isoWeek: string,
): { [key: string]: Json | undefined } {
  const base = (prefs && typeof prefs === 'object' && !Array.isArray(prefs)
    ? prefs
    : {}) as { [key: string]: Json | undefined };
  return { ...base, [getSundayPromptKey(isoWeek)]: true };
}
