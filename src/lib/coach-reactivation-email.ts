/**
 * Ticket 0072 — dormant-coach reactivation email template.
 *
 * Subject + body for the SECOND email branch added by the existing 0042
 * quiet-coach cron. Sent ONCE per unconsumed reactivation signal in the
 * last 7 days; after the send the cron stamps `notified_at` so the same
 * signal is never re-sent.
 *
 * Voice contract (LESSONS#0023): instructed positively. The copy
 * intentionally never names a banned hype word; the test scans the
 * rendered HTML for the AGENTS.md banned list and the subject + body
 * pass.
 *
 * COPPA: the email body NEVER contains the parent's name, the parent's
 * email, a date of birth, a jersey number. ONLY the prior player's
 * first name (the coach already knew it) and a deep-link to the
 * existing 0061 trajectory page.
 */

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstNameOnly(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return 'Coach';
  const space = trimmed.indexOf(' ');
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

export interface ReactivationEmailArgs {
  coachFullName: string | null;
  priorPlayerFirstName: string;
  priorTeamName: string | null;
  trajectoryUrl: string;
}

export function buildReturningParentReactivationSubject(args: {
  priorPlayerFirstName: string;
}): string {
  // The subject is the load-bearing line from the user-story: "Liam's
  // parent is back on SportsIQ this week." Specific, factual, by-name.
  return `${args.priorPlayerFirstName}'s parent is back on SportsIQ this week`;
}

export function buildReturningParentReactivationHtml(args: ReactivationEmailArgs): string {
  const { coachFullName, priorPlayerFirstName, priorTeamName, trajectoryUrl } = args;
  const coachFirst = esc(firstNameOnly(coachFullName));
  const player = esc(priorPlayerFirstName);
  const teamLine = priorTeamName
    ? `You coached ${player} on the ${esc(priorTeamName)}.`
    : `You coached ${player} last season.`;

  // Voice: clipboard. "is back on SportsIQ this week" — specific. NEVER
  // names a banned hype word.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${player}&#39;s parent is back on SportsIQ this week</title>
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
    .footer{font-size:12px;color:#52525b;text-align:center;padding-top:24px;line-height:1.7}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="logo">SportsIQ</div>
    <div class="card">
      <p>Hey ${coachFirst},</p>
      <h1>${player}&#39;s parent is back on SportsIQ this week</h1>
      <p>${teamLine} Their other kid&#39;s team also uses SportsIQ, and the parent opened that team&#39;s parent portal this week.</p>
      <p>If you want, take a minute to see how ${player} finished the season with you.</p>
      <div class="actions">
        <a href="${esc(trajectoryUrl)}" class="btn btn-primary">See ${player}&#39;s season</a>
      </div>
    </div>
    <div class="footer">
      You&#39;re getting this because a parent from a team you coached opened a parent portal on another team this week.<br />
      Manage email preferences in Settings.
    </div>
  </div>
</body>
</html>`;
}
