/**
 * Pure utility functions for building and sending parent update emails.
 *
 * These functions are side-effect-free so they are independently testable.
 * Actual email delivery is handled by `/api/send-parent-messages` via `sendEmail()`.
 */

export interface ParentEmailPlayer {
  id: string;
  name: string;
  nickname: string | null;
  name_variants: string[] | null;
  parent_email: string | null;
  parent_name: string | null;
  parent_phone?: string | null;
}

export interface MessageEntry {
  player_name: string;
  message: string;
  highlight: string;
  next_focus: string;
}

export interface EmailPayloadItem {
  to: string;
  playerName: string;
  parentName: string | null;
  message: string;
  highlight: string;
  nextFocus: string;
}

// ─── Player filtering helpers ─────────────────────────────────────────────────

export function filterPlayersWithEmail(players: ParentEmailPlayer[]): ParentEmailPlayer[] {
  return players.filter((p) => typeof p.parent_email === 'string' && p.parent_email.trim().length > 0);
}

export function countPlayersWithEmail(players: ParentEmailPlayer[]): number {
  return filterPlayersWithEmail(players).length;
}

export function hasAnyParentEmail(players: ParentEmailPlayer[]): boolean {
  return countPlayersWithEmail(players) > 0;
}

export function filterPlayersWithPhone(players: ParentEmailPlayer[]): ParentEmailPlayer[] {
  return players.filter((p) => typeof p.parent_phone === 'string' && p.parent_phone.trim().length > 0);
}

export function countPlayersWithPhone(players: ParentEmailPlayer[]): number {
  return filterPlayersWithPhone(players).length;
}

export function hasAnyParentPhone(players: ParentEmailPlayer[]): boolean {
  return countPlayersWithPhone(players) > 0;
}

// ─── Name matching ────────────────────────────────────────────────────────────

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

function firstName(name: string): string {
  return name.split(/\s+/)[0];
}

/**
 * Match an AI-generated player name to a roster entry.
 * Tries exact normalized match, then nickname/variant, then unique first-name,
 * then substring containment.  Returns null when no confident match is found.
 */
export function matchMessageToPlayer(
  messageName: string,
  players: ParentEmailPlayer[],
): ParentEmailPlayer | null {
  const normMsg = normalize(messageName);
  const firstMsg = normalize(firstName(messageName));

  // 1. Exact normalized full-name match (including nickname + variants)
  for (const p of players) {
    if (normalize(p.name) === normMsg) return p;
    if (p.nickname && normalize(p.nickname) === normMsg) return p;
    if (p.name_variants) {
      for (const v of p.name_variants) {
        if (normalize(v) === normMsg) return p;
      }
    }
  }

  // 2. First-name-only match — only when the result is unambiguous
  const firstMatches = players.filter(
    (p) => normalize(firstName(p.name)) === firstMsg,
  );
  if (firstMatches.length === 1) return firstMatches[0];

  // 3. Substring containment (catches "Marcus J." matching "Marcus Johnson")
  const containsMatches = players.filter((p) => {
    const pFirst = normalize(firstName(p.name));
    return pFirst.includes(firstMsg) || firstMsg.includes(pFirst);
  });
  if (containsMatches.length === 1) return containsMatches[0];

  return null;
}

// ─── Email payload builder ────────────────────────────────────────────────────

/**
 * Combine AI messages with matched roster players to produce ready-to-send
 * email payloads.  Only players that have a parent_email AND can be matched
 * from the message list are included.
 */
export function buildEmailPayloads(
  messages: MessageEntry[],
  players: ParentEmailPlayer[],
): EmailPayloadItem[] {
  const withEmail = filterPlayersWithEmail(players);
  const payloads: EmailPayloadItem[] = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    const matched = matchMessageToPlayer(msg.player_name, withEmail);
    if (!matched || !matched.parent_email) continue;
    // Deduplicate by email address so each parent gets at most one email
    if (seen.has(matched.parent_email.toLowerCase())) continue;
    seen.add(matched.parent_email.toLowerCase());

    payloads.push({
      to: matched.parent_email,
      playerName: matched.name,
      parentName: matched.parent_name,
      message: msg.message,
      highlight: msg.highlight,
      nextFocus: msg.next_focus,
    });
  }

  return payloads;
}

/** Count how many of the AI messages can be paired with a player email. */
export function countMatchedEmails(
  messages: MessageEntry[],
  players: ParentEmailPlayer[],
): number {
  return buildEmailPayloads(messages, players).length;
}

// ─── Email content builders ───────────────────────────────────────────────────

export function buildParentEmailSubject(playerName: string, teamName: string): string {
  return `Update on ${firstName(playerName)} from ${teamName}`;
}

export interface ParentEmailHtmlOpts {
  parentName: string | null;
  playerName: string;
  coachName: string;
  teamName: string;
  message: string;
  highlight: string;
  nextFocus: string;
  sessionLabel?: string;
}

export function buildParentEmailHtml(opts: ParentEmailHtmlOpts): string {
  const { parentName, playerName, coachName, teamName, message, highlight, nextFocus, sessionLabel } = opts;
  const greeting = parentName ? `Hi ${parentName},` : 'Hi there,';
  const first = firstName(playerName);
  const sessionLine = sessionLabel
    ? `<p style="color:#6b7280;font-size:13px;margin:0 0 16px 0;">${escapeHtml(sessionLabel)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
      <!-- Header -->
      <tr><td style="background:#f97316;padding:20px 24px;">
        <p style="margin:0;color:#fff;font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">SportsIQ Coach Update</p>
        <p style="margin:4px 0 0 0;color:#fed7aa;font-size:14px;">${escapeHtml(teamName)}</p>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:24px;">
        <p style="color:#111827;font-size:15px;margin:0 0 4px 0;">${escapeHtml(greeting)}</p>
        ${sessionLine}
        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px 0;">${escapeHtml(message)}</p>
        <!-- Highlight -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
          <tr><td style="background:#ecfdf5;border:1px solid #d1fae5;border-radius:8px;padding:12px 14px;">
            <p style="margin:0 0 4px 0;color:#059669;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">&#10024; Highlight</p>
            <p style="margin:0;color:#065f46;font-size:14px;">${escapeHtml(highlight)}</p>
          </td></tr>
        </table>
        <!-- Next Focus -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr><td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;">
            <p style="margin:0 0 4px 0;color:#ea580c;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">&#127919; Next Focus for ${escapeHtml(first)}</p>
            <p style="margin:0;color:#9a3412;font-size:14px;">${escapeHtml(nextFocus)}</p>
          </td></tr>
        </table>
        <p style="color:#374151;font-size:14px;margin:0;">Keep up the great work, ${escapeHtml(first)}! &#128079;</p>
        <p style="color:#374151;font-size:14px;margin:8px 0 0 0;">&#8212; ${escapeHtml(coachName)}</p>
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 24px;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">Sent via <strong>SportsIQ</strong> &middot; Coaching intelligence for youth sports</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Minimal HTML escaping for user-controlled content inside email HTML. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
