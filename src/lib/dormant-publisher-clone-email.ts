/**
 * Ticket 0078 — dormant-publisher reactivation email template.
 *
 * The 0078 reactivation branch on the existing 0042 cron sends ONE
 * honest email per (dormant publishing coach, fresh 0073 milestone)
 * tuple selected by `selectDormantPublishersForClones`. The subject
 * names the cloning program; the body says "your work is still
 * travelling" in the cardboard voice of 0042 / 0072; the single
 * button deep-links to `/home?milestone=<id>` so the existing 0073
 * milestone card surfaces on landing.
 *
 * Voice contract (LESSONS#0023): instructed positively. The template
 * never enumerates the banned list inside its strings (that would be
 * caught by its own voice-scan test). Numbers spelled out as digits
 * where they refer to a milestone count (consistent with the 0073
 * `<CoachReputationMilestoneCard />` copy: "3 times this month").
 *
 * COPPA: the rendered text NEVER contains the cloning coach's name,
 * the cloning team's name, a parent email, a DOB, a jersey number.
 * The deep-link URL carries ONLY the milestone id — no PII in the
 * query string. The template signature does not even ACCEPT a
 * cloning-coach name (the contract is enforced at the type level).
 *
 * Tier posture: NO tier gate. The publishing coach gets the
 * reactivation pull regardless of their current tier — a free-tier
 * publisher who shipped a drill in spring deserves the signal as
 * much as a paid-tier one (the email is a publish-graph consequence,
 * not a tier feature).
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
  // Literal space, not `\s+`, per LESSONS#0061.
  const space = trimmed.indexOf(' ');
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

export interface DormantPublisherCloneEmailArgs {
  /** First name of the publishing coach. Falls back to "Coach" when
   *  empty. HTML-escaped before render. */
  publisherFirstName: string;
  /** Milestone kind from the 065 / 067 CHECK constraint. Drives the
   *  variant copy. Unknown kinds fall through to a generic "your work
   *  is travelling" body so a new kind can ship without breaking
   *  email dispatch (defensive — the cron only ever invokes this
   *  with a kind it just read from the DB). */
  milestoneKind: string;
  /** Cloning PROGRAM name (NEVER the cloning coach's name). The
   *  caller resolves this from the cloning org's `organizations.name`. */
  programName: string;
  /** Cloned drill or plan title — the verifiable "your closeout
   *  drill" string in the body. */
  drillOrPlanTitle: string;
  /** Absolute app base URL (e.g. `https://app.youthsportsiq.com`).
   *  The deep-link is `<appUrl>/home?milestone=<milestoneId>`. */
  appUrl: string;
  /** Milestone id — the only param threaded into the deep-link URL. */
  milestoneId: string;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Per-kind subject + body shape. Clones / programs lines name the
 * cloning program; the stuck variants additionally name the drill
 * title (the same "your <drill> just landed for a coach in the
 * <program> program" shape the in-app 0076 milestone card renders).
 * Each variant is intentionally short — the cardboard voice of 0042 /
 * 0072 is two sentences.
 */
function copyForKind(args: {
  kind: string;
  programName: string;
  drillOrPlanTitle: string;
}): { subject: string; bodyLines: string[] } {
  const { kind, programName, drillOrPlanTitle } = args;
  // The default body shape — used by every "clones" / "programs"
  // variant. Two sentences. Names the program first, the drill
  // second.
  const defaultBody = [
    `A coach in the ${programName} program just cloned your ${drillOrPlanTitle} this week.`,
    'Your work is still travelling.',
  ];
  switch (kind) {
    case 'clones_3':
      return {
        subject: `Your ${drillOrPlanTitle} was cloned by a coach in the ${programName} program`,
        bodyLines: defaultBody,
      };
    case 'clones_10':
      return {
        subject: `Your work was cloned 10 times — most recent by a coach in the ${programName} program`,
        bodyLines: [
          `Ten coaches have saved one of your plans this month. The latest is a coach in the ${programName} program who picked up your ${drillOrPlanTitle}.`,
          'Your work is still travelling.',
        ],
      };
    case 'clones_25':
      return {
        subject: `25 clones this month — latest in the ${programName} program`,
        bodyLines: [
          `Twenty-five coaches have saved one of your plans this month. A coach in the ${programName} program just cloned your ${drillOrPlanTitle}.`,
          'Your library is shaping how other coaches run practice.',
        ],
      };
    case 'clones_50':
      return {
        subject: `50 clones this month — latest in the ${programName} program`,
        bodyLines: [
          `Fifty coaches have saved one of your plans this month. The latest is a coach in the ${programName} program who picked up your ${drillOrPlanTitle}.`,
          'Your library is shaping how other coaches run practice.',
        ],
      };
    case 'programs_2':
      return {
        subject: `Your ${drillOrPlanTitle} was cloned in a 2nd program — ${programName}`,
        bodyLines: [
          `A coach in the ${programName} program just cloned your ${drillOrPlanTitle} — the second different program to run something you wrote.`,
          'Your plans are travelling outside your home program.',
        ],
      };
    case 'programs_4':
      return {
        subject: `Your work has now reached 4 programs — latest is ${programName}`,
        bodyLines: [
          `Four different programs have cloned one of your plans this month. The latest is a coach in the ${programName} program who picked up your ${drillOrPlanTitle}.`,
          'Your work is still travelling.',
        ],
      };
    case 'programs_8':
      return {
        subject: `Your work has now reached 8 programs — latest is ${programName}`,
        bodyLines: [
          `Eight different programs have cloned one of your plans this month. The latest is a coach in the ${programName} program who picked up your ${drillOrPlanTitle}.`,
          'Your work is still travelling.',
        ],
      };
    case 'stuck_1':
      return {
        subject: `Your ${drillOrPlanTitle} landed for a coach in the ${programName} program`,
        bodyLines: [
          `A coach in the ${programName} program cloned your ${drillOrPlanTitle}, ran it on a real court, and thumbed it up.`,
          'Your work is still travelling.',
        ],
      };
    case 'stuck_3':
      return {
        subject: `Your ${drillOrPlanTitle} has stuck in a 3rd program — ${programName}`,
        bodyLines: [
          `Three programs have now run your ${drillOrPlanTitle} and thumbed it up. The most recent is a coach in the ${programName} program.`,
          'Your work is still travelling.',
        ],
      };
    case 'stuck_8':
      return {
        subject: `Your ${drillOrPlanTitle} has stuck in 8 programs — latest is ${programName}`,
        bodyLines: [
          `Eight programs have now run your ${drillOrPlanTitle} and thumbed it up. The latest is a coach in the ${programName} program.`,
          'Your work is still travelling.',
        ],
      };
    default:
      return {
        subject: `Your ${drillOrPlanTitle} was cloned by a coach in the ${programName} program`,
        bodyLines: defaultBody,
      };
  }
}

/**
 * Build the subject, HTML, and text/plain parts of one reactivation
 * email. The single button label is "See the details" — the cardboard
 * voice of 0042 / 0072.
 */
export function buildDormantPublisherCloneEmail(
  args: DormantPublisherCloneEmailArgs,
): RenderedEmail {
  const { publisherFirstName, milestoneKind, programName, drillOrPlanTitle, appUrl, milestoneId } = args;

  const coachFirst = firstNameOnly(publisherFirstName);
  const { subject, bodyLines } = copyForKind({
    kind: milestoneKind,
    programName,
    drillOrPlanTitle,
  });

  const deepLink = `${appUrl}/home?milestone=${encodeURIComponent(milestoneId)}`;

  const buttonLabel = 'See the details';

  // HTML — dark theme + orange accent (matches the existing 0042 /
  // 0072 / coach-quiet-check-in templates).
  const escCoachFirst = esc(coachFirst);
  const escSubject = esc(subject);
  const escBody = bodyLines.map((line) => esc(line));
  const escDeepLink = esc(deepLink);
  const escButton = esc(buttonLabel);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escSubject}</title>
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
      <p>Hey ${escCoachFirst},</p>
      <h1>${escSubject}</h1>
      ${escBody.map((line) => `<p>${line}</p>`).join('\n      ')}
      <div class="actions">
        <a href="${escDeepLink}" class="btn btn-primary">${escButton}</a>
      </div>
    </div>
    <div class="footer">
      You&#39;re getting this because a coach in another program just cloned something you published on SportsIQ.<br />
      Manage email preferences in Settings.
    </div>
  </div>
</body>
</html>`;

  // Text/plain fallback — same factual content, no HTML decoration.
  // Keeps the multi-line shape so LESSONS#0033 round-trips intact.
  const text = [
    `Hey ${coachFirst},`,
    '',
    subject,
    '',
    ...bodyLines,
    '',
    `${buttonLabel}: ${deepLink}`,
    '',
    "You're getting this because a coach in another program just cloned something you published on SportsIQ. Manage email preferences in Settings.",
  ].join('\n');

  return { subject, html, text };
}
