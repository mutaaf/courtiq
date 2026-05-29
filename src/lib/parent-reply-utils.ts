/**
 * Ticket 0056 — pure helpers for the parent-reaction one-tap thank-you.
 *
 * Two responsibilities, both deterministic and side-effect-free:
 *
 *   buildStaticReplyTemplate(...) — the fallback string the draft route
 *     returns when the coach is at AI quota OR on free tier. Anchored here
 *     (not in the route) so the static fallback is testable in isolation and
 *     the component test can re-assert the same string.
 *
 *   stripContactInfo(message) — the server-side defense against the coach
 *     embedding contact info into the announcement body. Masks emails,
 *     http(s) URLs, and 7+ digit runs (phone numbers). Short numeric tokens
 *     (jersey numbers, single-digit scores) are preserved.
 *
 * Voice contract (LESSONS#0023): the template instructs positively — it does
 * not enumerate the banned tokens. The rendered string for any normal first-
 * name input contains zero AGENTS.md banned words.
 *
 * No database access; no AI call. Imported by:
 *   - src/app/api/parent-reactions/[reactionId]/draft-reply/route.ts
 *   - src/app/api/parent-reactions/[reactionId]/send-reply/route.ts
 */

export interface StaticReplyParams {
  parentFirstName: string;
  playerFirstName: string;
  coachFirstName: string;
}

/**
 * Render the deterministic fallback reply. Used when the draft route cannot
 * (or should not) call AI — at-quota, free-tier, or provider outage. The
 * shape mirrors the AI prompt's two-sentence cap so the coach previewing the
 * fallback sees an artifact that looks like every other draft.
 *
 * Empty first-name inputs collapse to neutral labels rather than producing
 * "Hi , " with a stray comma; the caller is expected to pass real first
 * names but the helper survives the defensive case.
 */
export function buildStaticReplyTemplate({
  parentFirstName,
  playerFirstName,
  coachFirstName,
}: StaticReplyParams): string {
  const parent = parentFirstName?.trim() || 'there';
  const player = playerFirstName?.trim() || 'your kid';
  const coach = coachFirstName?.trim() || 'Coach';
  // Two sentences, clipboard tone, names threaded as the AI prompt would.
  // Per LESSONS#0023 the voice is positive — no enumeration of banned tokens.
  return `${parent} — thanks for the note. ${player} has been working hard. — ${coach}`;
}

// ─── stripContactInfo ─────────────────────────────────────────────────────────

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const URL_RE = /https?:\/\/[^\s]+/gi;
// 7+ digit runs catch phone numbers (US 10-digit, UK 11-digit, intl with
// country code) without flagging jersey numbers / quarter scores / dates.
const LONG_DIGIT_RUN_RE = /\d{7,}/g;

/**
 * Strip plausible contact info from a coach-edited reply body before it is
 * persisted into the team_announcements row. The goal is not to forbid the
 * coach from including a phone number on purpose — they could open a side
 * channel — but to defeat a forged client body that plants a third-party
 * phone / email / URL into a per-parent message that LOOKS like it came
 * from the coach. LESSONS#0039 — never trust client-supplied recipient
 * data; the same family of guard applies to client-supplied body content.
 *
 * Returns the input unchanged when no contact-info shape is present.
 */
export function stripContactInfo(message: string): string {
  if (!message) return message;
  return message
    .replace(EMAIL_RE, '[contact removed]')
    .replace(URL_RE, '[link removed]')
    .replace(LONG_DIGIT_RUN_RE, '[number removed]');
}
