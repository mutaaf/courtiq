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

export function buildParentDigestHtml(p: ParentDigestParams): string {
  const greeting = p.parentName ? `Hi ${p.parentName.split(' ')[0]},` : 'Hi there,';
  const firstName = p.playerName.split(' ')[0];

  const activityLine =
    p.sessionCount > 0
      ? `This week the team had <strong>${p.sessionCount} session${p.sessionCount !== 1 ? 's' : ''}</strong> and ${firstName} received <strong>${p.obsCount} coaching observation${p.obsCount !== 1 ? 's' : ''}</strong>.`
      : `${firstName} received <strong>${p.obsCount} coaching observation${p.obsCount !== 1 ? 's' : ''}</strong> this week.`;

  const highlightBlock = p.highlight
    ? `<div style="background:#f0fdf4;border-left:3px solid #22c55e;padding:12px 16px;margin:20px 0;border-radius:0 8px 8px 0;">
        <p style="margin:0;font-size:15px;color:#15803d;font-style:italic;">"${escapeHtml(p.highlight)}"</p>
        <p style="margin:6px 0 0;font-size:12px;color:#4ade80;">— Coach ${escapeHtml(p.coachName)}</p>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#f97316,#ea580c);padding:24px 28px;">
    <p style="margin:0;color:white;font-size:20px;font-weight:700;">SportsIQ</p>
    <p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:14px;">Weekly Progress Update · ${escapeHtml(p.teamName)}</p>
  </div>

  <!-- Body -->
  <div style="padding:28px;">
    <p style="margin:0 0 16px;font-size:16px;color:#18181b;">${greeting}</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#3f3f46;">
      Coach ${escapeHtml(p.coachName)} wanted to share ${escapeHtml(firstName)}'s latest progress with you.
      ${activityLine}
    </p>

    ${highlightBlock}

    <!-- CTA -->
    <div style="text-align:center;margin:28px 0 20px;">
      <a href="${p.shareUrl}"
         style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:16px;font-weight:600;letter-spacing:.01em;">
        View ${escapeHtml(firstName)}'s Progress Report →
      </a>
    </div>

    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;text-align:center;">
      The report includes skill assessments, coaching observations,<br>achievement badges, and development goals.
    </p>
  </div>

  <!-- Footer -->
  <div style="background:#f9f9f9;padding:16px 28px;border-top:1px solid #e4e4e7;">
    <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.5;">
      Sent by Coach ${escapeHtml(p.coachName)} via <a href="${p.appUrl}" style="color:#f97316;text-decoration:none;">SportsIQ</a> &middot;
      <a href="${p.shareUrl}" style="color:#f97316;text-decoration:none;">View ${escapeHtml(firstName)}'s report</a>
    </p>
  </div>

</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
