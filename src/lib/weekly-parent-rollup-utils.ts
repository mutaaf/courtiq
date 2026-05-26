/**
 * Pure helpers for the Monday parent-rollup email cron (ticket 0041).
 *
 * Sibling of `src/lib/weekly-digest-utils.ts`: the two emails ship to the same
 * inbox under independent opt-out + dedup keys so a coach who has only one
 * enabled still gets that one. The HTML body quotes parents verbatim — no AI,
 * no rewrite — and never reads a `players` row, so the route's narrow SELECT
 * (`reaction, message, parent_name, created_at`) is the COPPA boundary.
 *
 * Re-exports `getPriorWeekMonday` / `getWeekWindow` / `formatWeekLabel` from
 * weekly-digest-utils so the rollup uses the same Mon–Sun window calculation
 * the digest already proved out.
 */

import type { Json } from '@/types/database';

// Re-export the week helpers exactly as the ticket asks; sharing them keeps
// the digest and the rollup pinned to the same Mon–Sun window for any coach
// who receives both.
export {
  getPriorWeekMonday,
  getWeekWindow,
  formatWeekLabel,
} from '@/lib/weekly-digest-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The four parent_reactions columns the rollup is allowed to read. Listed
 * explicitly so a future widening (e.g. adding a `players(name)` join) fails
 * the COPPA test rather than silently leaking.
 */
export interface RollupReaction {
  reaction: string;
  message: string | null;
  parent_name: string | null;
  created_at: string;
}

export interface RollupHtmlData {
  coachName: string;
  weekLabel: string;
  totalCount: number;
  topReactions: RollupReaction[];
  appUrl: string;
}

// ─── Preferences: opt-out + dedup ─────────────────────────────────────────────

/** Dedup key — mirrors the 0023 digest's `digest_week_<YYYY-MM-DD>` shape verbatim. */
export function getRollupKey(mondayStr: string): string {
  return `parent_rollup_week_${mondayStr}`;
}

function asPrefs(preferences: Json | null | undefined): Record<string, unknown> | null {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return null;
  return preferences as Record<string, unknown>;
}

export function hasAlreadySentRollup(
  preferences: Json | null | undefined,
  mondayStr: string,
): boolean {
  const prefs = asPrefs(preferences);
  if (!prefs) return false;
  return prefs[getRollupKey(mondayStr)] === true;
}

/**
 * Returns true ONLY when the explicit new opt-out key is false. Unset / true /
 * any other value sends — the rollup is opt-in by default like the 0023 digest.
 * Does NOT reuse `disable_weekly_digest`: the two emails are independent so a
 * coach can choose to keep one and silence the other.
 */
export function isParentRollupDisabled(preferences: Json | null | undefined): boolean {
  const prefs = asPrefs(preferences);
  if (!prefs) return false;
  return prefs['weekly_parent_rollup'] === false;
}

export function markRollupSent(
  preferences: Json | null | undefined,
  mondayStr: string,
): Record<string, Json | undefined> {
  const prefs = asPrefs(preferences) ?? {};
  // Preserve every existing key — the 0023 digest's keys must round-trip
  // byte-identical so the two emails stay independent.
  return { ...(prefs as Record<string, Json | undefined>), [getRollupKey(mondayStr)]: true };
}

// ─── Top-3 selection — deterministic, messages preferred ──────────────────────

/**
 * Returns up to `limit` reactions ranked by `created_at DESC` over the subset
 * with a non-empty `message`. Hearts-only reactions never appear in the top-N;
 * the route renders the total count for those separately. Empty/whitespace
 * messages are treated as absent so a stray space doesn't outrank a real note.
 */
export function selectTopReactions(
  rows: RollupReaction[],
  opts: { limit: number },
): RollupReaction[] {
  const withMessages = rows.filter((r) => typeof r.message === 'string' && r.message.trim().length > 0);
  withMessages.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return withMessages.slice(0, opts.limit);
}

// ─── Email copy — clipboard voice ─────────────────────────────────────────────

function firstName(full: string): string {
  const trimmed = full.trim();
  const space = trimmed.indexOf(' ');
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

/**
 * Subject: `"<FirstName>, your team's parents this week — <WeekLabel>"`.
 * Clipboard tone — no hype words. Coach-private (their first name + week).
 */
export function buildRollupSubject(coachFullName: string, weekLabel: string): string {
  return `${firstName(coachFullName)}, your team's parents this week — ${weekLabel}`;
}

// HTML escape so a parent's freely-typed message can't break the layout.
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function labelForParent(parentName: string | null): string {
  if (!parentName || !parentName.trim()) return 'A parent';
  // First name only (the parent_reactions row stores the freely-typed name; we
  // never display a last name even if a parent typed one).
  return esc(firstName(parentName));
}

export function buildRollupHtml(data: RollupHtmlData): string {
  const { coachName, weekLabel, totalCount, topReactions, appUrl } = data;
  const greetingFirst = esc(firstName(coachName));

  const countLine =
    totalCount === 1
      ? `${totalCount} parent reacted this week.`
      : `${totalCount} parents reacted this week.`;

  let quoteBlock: string;
  if (topReactions.length === 0) {
    // Reactions came in this week but no notes — say so plainly. The instruction
    // in the prompt is positive ("write like a clipboard"); we never enumerate
    // the AGENTS.md banned-word list verbatim in the rendered HTML
    // (LESSONS#77 / 0023).
    quoteBlock = `<p class="note">No notes this week — just hearts. Catch up in the in-app inbox when you have a minute.</p>`;
  } else {
    const items = topReactions
      .map((r) => {
        const who = labelForParent(r.parent_name);
        const body = esc((r.message ?? '').trim());
        return `<li class="quote"><span class="who">${who}:</span> &ldquo;${body}&rdquo;</li>`;
      })
      .join('');
    quoteBlock = `<ul class="quote-list">${items}</ul>`;
  }

  const inboxUrl = `${appUrl}/`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your team's parents this week — ${esc(weekLabel)}</title>
  <style>
    body{margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f4f4f5}
    .wrapper{max-width:600px;margin:0 auto;padding:40px 20px}
    .logo{font-size:22px;font-weight:700;color:#f97316;margin-bottom:32px}
    .card{background:#18181b;border-radius:12px;padding:28px;margin-bottom:20px}
    h1{font-size:22px;font-weight:700;color:#f4f4f5;margin:0 0 8px}
    p{font-size:15px;line-height:1.6;color:#a1a1aa;margin:0 0 14px}
    .count{font-size:18px;color:#f4f4f5;font-weight:600;margin-bottom:18px}
    .quote-list{list-style:none;padding:0;margin:0}
    .quote{background:#27272a;border-left:3px solid #f97316;border-radius:6px;padding:14px 18px;margin-bottom:10px;color:#f4f4f5;font-size:15px;line-height:1.5}
    .who{color:#fb923c;font-weight:600;margin-right:6px}
    .note{color:#a1a1aa;font-style:italic}
    .cta{display:inline-block;background:#f97316;color:#fff!important;font-weight:600;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;margin-top:8px}
    .footer{font-size:12px;color:#52525b;text-align:center;padding-top:24px;line-height:1.7}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="logo">SportsIQ</div>
    <div class="card">
      <p>Hey ${greetingFirst},</p>
      <h1>Your team's parents this week</h1>
      <p style="color:#71717a;font-size:14px;margin-bottom:18px">${esc(weekLabel)}</p>
      <p class="count">${countLine}</p>
      ${quoteBlock}
    </div>
    <div class="card" style="text-align:center">
      <p>Want to see every reaction? Open the team inbox in the app.</p>
      <a href="${esc(inboxUrl)}" class="cta">Open SportsIQ &rarr;</a>
    </div>
    <div class="footer">
      You're getting this because parents reacted on your team's portal this week.<br />
      Manage email preferences in Settings.
    </div>
  </div>
</body>
</html>`;
}
