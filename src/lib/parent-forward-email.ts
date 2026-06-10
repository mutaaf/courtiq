/**
 * Ticket 0079 — pure builder for the parent → parent on-team forward
 * email. One sending parent on the team taps "Send to one parent" on
 * the existing /share/[token] portal; the route fires this helper to
 * compose the subject + HTML + plain-text body the receiving parent
 * gets. The CTA deep-links to the RECIPIENT's own kid's portal URL
 * (NOT the sender's) so the receiving parent lands on HER OWN kid's
 * report.
 *
 * Voice contract — every rendered string must contain no AGENTS.md
 * banned word. We instruct positively in this comment header
 * (LESSONS#0023): write like a coach's clipboard, not a marketing
 * landing page — avoid breathless hype. Never enumerate the banned
 * tokens verbatim in the template because that would trip a banned-
 * word scan that lints this file's output.
 *
 * COPPA: the sender's email is NEVER rendered in the body — only the
 * sender's first name. The recipient's email is on the route's send
 * payload but never echoed in the body. The recipient's kid's first
 * name + the team name are the only minor-adjacent strings; both are
 * already what the coach put on the share token publicly.
 *
 * No DB access in this file (LESSONS#0078 — helpers stay pure).
 */

export interface ParentForwardEmailArgs {
  senderFirstName: string;
  teamName: string;
  recipientKidFirstName: string;
  note: string;
  recipientPortalUrl: string;
  /** Sport string (e.g. "basketball") — used in the body sentence to
   *  anchor the team context. Falls back to a generic phrase if blank. */
  teamSport: string;
}

export interface ParentForwardEmailBody {
  subject: string;
  html: string;
  text: string;
}

// HTML-escape — defensive even though the route sanitizes the note
// upstream. Defense in depth never hurt anyone.
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Strip any inline HTML tags the route-level sanitizer might have
// missed (legacy <b>, <i>, <script>, etc.). The route is the primary
// gate; this is the safety net for the rendered body. Script blocks
// are stripped INCLUDING their content — a paranoid posture for the
// blockquote we render verbatim.
const stripTags = (s: string): string =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '');

/**
 * Build the subject + HTML + plain-text body of the email the
 * receiving parent gets.
 *
 * The subject names the sender's first name + the team name. The body
 * carries the sender's note in a blockquote and a single CTA that deep-
 * links to the recipient's own kid's portal URL. The fineprint line
 * confirms the receiving parent's email was not shared beyond this
 * forward; the unsubscribe footer mirrors the existing parent-portal
 * email shape exactly.
 */
export function buildParentForwardEmail(
  args: ParentForwardEmailArgs,
): ParentForwardEmailBody {
  const {
    senderFirstName,
    teamName,
    recipientKidFirstName,
    note,
    recipientPortalUrl,
    teamSport,
  } = args;

  const safeSender = escapeHtml(senderFirstName.trim());
  const safeTeam = escapeHtml(teamName.trim());
  const safeKid = escapeHtml(recipientKidFirstName.trim());
  const safeUrl = escapeHtml(recipientPortalUrl);
  const sanitizedNote = stripTags(note).trim();
  const safeNote = escapeHtml(sanitizedNote);
  const sportPhrase = teamSport && teamSport.trim()
    ? `${teamSport.trim()} team`
    : 'team';
  const safeSportPhrase = escapeHtml(sportPhrase);

  // Subject — factual. Names the sender's first name + the team. The
  // AC's literal subject pattern: "<senderFirstName> at <teamName>
  // sent you this week's SportsIQ report."
  const subject = `${senderFirstName.trim()} at ${teamName.trim()} sent you this week's SportsIQ report`;

  // Header line — parent-voiced. Two short sentences, factual. Names
  // the receiving kid's first name so the receiving parent immediately
  // sees the email is about HER kid.
  const headerHtml = `<p>Hi,</p>
<p><strong>${safeSender}</strong> on your ${safeSportPhrase} (${safeTeam}) sent you this week's report about <strong>${safeKid}</strong>.</p>`;
  const headerText = `Hi,

${senderFirstName.trim()} on your ${sportPhrase} (${teamName.trim()}) sent you this week's report about ${recipientKidFirstName.trim()}.`;

  // Sender's note — rendered in a blockquote in the HTML body. The
  // route's sanitizer plus stripTags here keeps inline HTML out.
  const noteBlockHtml = safeNote
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #F97316;background:#fafafa;color:#27272a;font-style:italic;">${safeNote}</blockquote>`
    : '';
  const noteBlockText = sanitizedNote ? `\n\n"${sanitizedNote}"\n` : '';

  // Primary CTA — deep-links to the RECIPIENT's portal URL (NOT the
  // sender's). The receiving parent lands on HER OWN kid's portal
  // session per the COPPA contract.
  const ctaHtml = `<p style="margin:24px 0;"><a href="${safeUrl}" style="display:inline-block;background:#F97316;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Read ${safeKid}'s report</a></p>`;
  const ctaText = `\nRead ${recipientKidFirstName.trim()}'s report: ${recipientPortalUrl}\n`;

  // Fineprint — confirms the recipient's email was not shared beyond
  // this forward. Mirrors the 0060 sibling-invite fineprint posture
  // exactly (LESSONS#0096 — read the existing shape at pickup).
  const fineprintHtml = `<p style="color:#71717a;font-size:12px;margin-top:24px;">${safeSender} sent this from her family's SportsIQ portal &mdash; she did not share your email beyond this forward.</p>`;
  const fineprintText = `\n${senderFirstName.trim()} sent this from her family's SportsIQ portal — she did not share your email beyond this forward.`;

  // Standard unsubscribe / preference line — keep parity with the 0060
  // existing layout default footer copy.
  const unsubscribeHtml = `<p style="color:#94a3b8;font-size:11px;margin-top:16px;">Sent by SportsIQ &middot; <a href="https://youthsportsiq.com" style="color:#94a3b8;">youthsportsiq.com</a></p>`;
  const unsubscribeText = `\nSent by SportsIQ · youthsportsiq.com`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#27272a;line-height:1.55;max-width:560px;margin:0 auto;padding:24px;">
  ${headerHtml}
  ${noteBlockHtml}
  ${ctaHtml}
  ${fineprintHtml}
  ${unsubscribeHtml}
</body></html>`;

  const text = `${headerText}${noteBlockText}${ctaText}${fineprintText}${unsubscribeText}`;

  return { subject, html, text };
}
