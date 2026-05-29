/**
 * Ticket 0050 — the email the program director receives when a parent forwards
 * a parent-portal report through the new POST route.
 *
 * COPPA contract: the body contains NO minor data. NO player first name, NO
 * player position, NO observation excerpt, NO age group. The body says "an
 * update from her son's coach" — never "an update about <name>". The director
 * clicks INTO the existing /share/[token] report, which is already gated to
 * render only what the parent's per-section include_* flags permit. The
 * /share/[token]?pr=<signed_director_id> link carries the verified id so the
 * director-side render surfaces the claim CTA at the bottom (see
 * `src/app/share/[token]/page.tsx`).
 *
 * Voice contract: the copy is positive (LESSONS#0023). Banned tokens
 * (`journey`, `amazing`, `exciting`, `elevate`, `empower`, `synergy`) appear
 * nowhere in the subject or body — the tests in
 * tests/api/share-program-referral.test.ts and
 * tests/lib/program-referral-email.test.ts assert their absence. The copy is
 * factual: a parent volunteered the director's address; here is the same
 * report the parent read; here is how to claim your program.
 */

export interface ProgramReferralEmailArgs {
  parentFirstName: string;
  directorFirstName: string;
  programName: string | null;
  shareUrl: string;
  note: string | null;
}

export interface ProgramReferralEmailBody {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Build the subject + HTML + plain-text body of the director-side email.
 * `programName` is nullable: a coach whose org has no public slug still has
 * a referrable report; the body falls back to "her son's coach" + "your
 * program" instead of naming the program.
 */
export function buildProgramReferralEmail(args: ProgramReferralEmailArgs): ProgramReferralEmailBody {
  const { parentFirstName, directorFirstName, programName, shareUrl, note } = args;

  const safeParent = escapeHtml(parentFirstName.trim());
  const safeDirector = escapeHtml(directorFirstName.trim());
  const safeProgram = programName ? escapeHtml(programName.trim()) : null;
  const safeUrl = escapeHtml(shareUrl);

  // Subject — positive, factual. No banned tokens. No minor name.
  const subject = `${parentFirstName.trim()} sent you an update from her son's coach`;

  // Greeting + the parent's optional one-line note in a styled blockquote so
  // it reads as "from the parent" rather than "from SportsIQ".
  const programPhrase = safeProgram
    ? `a parent in <strong>${safeProgram}</strong>'s league`
    : 'a parent at your program';

  const programPhraseText = programName
    ? `a parent in ${programName.trim()}'s league`
    : 'a parent at your program';

  const noteBlockHtml = note?.trim()
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #F97316;background:#fafafa;color:#27272a;font-style:italic;">${escapeHtml(note.trim())}</blockquote>`
    : '';

  const noteBlockText = note?.trim() ? `\n\n"${note.trim()}"\n` : '';

  const claimLineHtml = safeProgram
    ? `If you'd like your other coaches at <strong>${safeProgram}</strong> to use this too, the link above lets you claim your program in two taps.`
    : `If you'd like the other coaches in your program to use this too, the link above lets you claim your program in two taps.`;

  const claimLineText = programName
    ? `If you'd like your other coaches at ${programName.trim()} to use this too, the link above lets you claim your program in two taps.`
    : `If you'd like the other coaches in your program to use this too, the link above lets you claim your program in two taps.`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#27272a;line-height:1.55;max-width:560px;margin:0 auto;padding:24px;">
  <p>Hi ${safeDirector},</p>
  <p>${safeParent}, ${programPhrase}, asked me to send you this update her son's coach put together for her family this week.</p>
  ${noteBlockHtml}
  <p style="margin:24px 0;"><a href="${safeUrl}" style="display:inline-block;background:#F97316;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Read the update</a></p>
  <p>${claimLineHtml}</p>
  <p style="color:#71717a;font-size:13px;margin-top:32px;">— SportsIQ</p>
</body></html>`;

  const text = `Hi ${directorFirstName.trim()},

${parentFirstName.trim()}, ${programPhraseText}, asked me to send you this update her son's coach put together for her family this week.${noteBlockText}

Read the update: ${shareUrl}

${claimLineText}

— SportsIQ`;

  return { subject, html, text };
}
