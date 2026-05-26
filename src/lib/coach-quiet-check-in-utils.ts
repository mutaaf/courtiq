/**
 * Pure helpers for the coach quiet-check-in cron (ticket 0042).
 *
 * The cron is intentionally narrow — it sends ONE polite email asking "still
 * coaching this season?" with two CTAs:
 *   - "Pause for 30 days" → `/account/pause?token=…`
 *   - "I'm still coaching" → `/account`
 *
 * The token is signed by `signPauseToken` in `coach-pause-utils.ts`. This file
 * owns subject + HTML rendering only — the eligibility/dedup logic lives in
 * the route itself so it can read the live `now()` and the coach's
 * preferences without dragging async into a pure helper.
 *
 * Voice instruction is positive (LESSONS#23): the prompt-equivalent here is the
 * literal copy below, which is intentionally clipboard-toned and never lists
 * the AGENTS.md banned words verbatim so the test that scans the rendered HTML
 * for hype words passes.
 */
import type { Json } from '@/types/database';

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Dedup key shape — mirrors the digest's `digest_week_<date>` style ──────

/**
 * The dedup key is `quiet_check_in_<YYYY-MM-DD>` where <YYYY-MM-DD> is the
 * day the email was sent. We use a date-keyed boolean so a coach can be
 * re-emailed 30 days after the LAST send (the route's eligibility check
 * scans every `quiet_check_in_*` key and refuses to send a fresh one if any
 * is set within the last 30 days).
 */
export function getQuietCheckInKey(dateStr: string): string {
  return `quiet_check_in_${dateStr}`;
}

function asPrefs(preferences: Json | null | undefined): Record<string, unknown> | null {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return null;
  return preferences as Record<string, unknown>;
}

/**
 * True when ANY `quiet_check_in_<YYYY-MM-DD>` key on the coach's preferences
 * is within the last 30 days of `now`. We DON'T just check today's key —
 * a coach emailed last week is still in their cool-off window today.
 */
export function hasRecentQuietCheckIn(
  preferences: Json | null | undefined,
  now: Date = new Date(),
  daysWindow = 30,
): boolean {
  const prefs = asPrefs(preferences);
  if (!prefs) return false;
  const cutoff = now.getTime() - daysWindow * DAY_MS;
  for (const k of Object.keys(prefs)) {
    if (!k.startsWith('quiet_check_in_')) continue;
    if (prefs[k] !== true) continue;
    const dateStr = k.slice('quiet_check_in_'.length);
    const t = Date.parse(dateStr + 'T00:00:00Z');
    if (!Number.isFinite(t)) continue;
    if (t >= cutoff) return true;
  }
  return false;
}

export function markQuietCheckInSent(
  preferences: Json | null | undefined,
  dateStr: string,
): Record<string, Json | undefined> {
  const prefs = asPrefs(preferences) ?? {};
  return { ...(prefs as Record<string, Json | undefined>), [getQuietCheckInKey(dateStr)]: true };
}

// ─── Quiet predicate — 14-day default; null last_active_at is conservative ──

/**
 * True when the coach is "quiet" — at least `daysWindow` days since
 * `last_active_at`. A NULL `last_active_at` returns FALSE on purpose: until
 * the column starts backfilling naturally (a new sign-in, a new observation,
 * etc.), we don't pester coaches who have no recorded activity at all.
 */
export function isCoachQuiet(
  row: { last_active_at: string | null | undefined },
  now: Date = new Date(),
  daysWindow = 14,
): boolean {
  const v = row.last_active_at;
  if (!v) return false;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t >= daysWindow * DAY_MS;
}

// ─── Email subject + HTML ─────────────────────────────────────────────────────

function firstName(full: string | null | undefined): string {
  const trimmed = (full ?? '').trim();
  if (!trimmed) return 'Coach';
  const space = trimmed.indexOf(' ');
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Subject is verbatim per the ticket AC — a single honest question. No
 * personalisation in the subject line (a coach's first name in the subject
 * lands as marketing-y here).
 */
export const QUIET_CHECK_IN_SUBJECT = 'Still coaching this season?';

export function buildQuietCheckInSubject(): string {
  return QUIET_CHECK_IN_SUBJECT;
}

/**
 * The check-in email. Two CTAs (Pause / I'm still coaching) so the
 * "yes I'm coaching" path is symmetric to the pause path — the coach isn't
 * railroaded into pausing just to dismiss the email.
 */
export function buildQuietCheckInHtml(args: {
  coachFullName: string;
  pauseUrl: string;
  stillCoachingUrl: string;
}): string {
  const { coachFullName, pauseUrl, stillCoachingUrl } = args;
  const first = esc(firstName(coachFullName));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Still coaching this season?</title>
  <style>
    body{margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f4f4f5}
    .wrapper{max-width:600px;margin:0 auto;padding:40px 20px}
    .logo{font-size:22px;font-weight:700;color:#f97316;margin-bottom:32px}
    .card{background:#18181b;border-radius:12px;padding:28px;margin-bottom:20px}
    h1{font-size:22px;font-weight:700;color:#f4f4f5;margin:0 0 12px}
    p{font-size:15px;line-height:1.6;color:#a1a1aa;margin:0 0 14px}
    .actions{display:flex;flex-direction:column;gap:10px;margin-top:8px}
    .btn{display:inline-block;text-align:center;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px}
    .btn-primary{background:#f97316;color:#fff}
    .btn-secondary{background:#27272a;color:#f4f4f5;border:1px solid #3f3f46}
    .footer{font-size:12px;color:#52525b;text-align:center;padding-top:24px;line-height:1.7}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="logo">SportsIQ</div>
    <div class="card">
      <p>Hey ${first},</p>
      <h1>Still coaching this season?</h1>
      <p>We noticed you haven't logged a practice in two weeks. If the season's on a break, tap below to pause us for 30 days &mdash; we'll stop the digest emails until you come back.</p>
      <div class="actions">
        <a href="${esc(pauseUrl)}" class="btn btn-primary">Pause for 30 days</a>
        <a href="${esc(stillCoachingUrl)}" class="btn btn-secondary">I&#39;m still coaching &mdash; keep emails coming</a>
      </div>
    </div>
    <div class="footer">
      You're getting this because you haven't logged a practice in two weeks.<br />
      Manage email preferences in Settings.
    </div>
  </div>
</body>
</html>`;
}
