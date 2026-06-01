/**
 * Ticket 0060 — pure helpers for the parent-side sibling-coach invite
 * surface on /share/[token]. Three things live here:
 *
 *   1) `firstNameOnly(fullName)` — strips a seeded `players.name` to its
 *      first space-delimited token. Used by the candidate-lookup route so
 *      the response NEVER returns a sibling last name (COPPA boundary).
 *
 *   2) `buildSiblingInviteEmail(args)` — the parent-voiced email body the
 *      POST /sibling-invite route sends to the other kid's coach. Five
 *      elements: header naming the parent's first name + sibling's team,
 *      the parent's optional one-line note, ONE CTA deep-linking to the
 *      program-scoped referral landing, a fineprint line confirming the
 *      recipient's email was not shared beyond this invite, and the
 *      standard unsubscribe (via the layout's default footer). Voice
 *      contract per LESSONS#0023: instruct positively in this comment
 *      header; the user-visible template strings never name the banned
 *      tokens (the test scans the output and would fail if they did).
 *
 *   3) `checkSiblingInviteRate()` / `_resetSiblingInviteRateLimiterForTest()` —
 *      in-memory per-share-token rate counter (max 3 invites per 7 rolling
 *      days) mirroring the program-referral utility's posture. Single-
 *      process map; we are stopping bulk abuse from a leaked token, not
 *      enforcing an absolute count.
 *
 * No DB access in this file (LESSONS#0078 — helpers stay pure). No env reads
 * beyond what the email body's CTA needs from the route caller (passed in
 * as `referralUrl`).
 */

// ─── Pure name helper ─────────────────────────────────────────────────────────

/**
 * Return the first space-delimited token of `fullName` (or `null` for
 * empty/whitespace input). COPPA: the candidate-lookup route uses this so
 * the parent portal never receives a sibling's last name in the JSON.
 */
export function firstNameOnly(fullName: string | null | undefined): string | null {
  if (!fullName || typeof fullName !== 'string') return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  return first || null;
}

// ─── Email builder ────────────────────────────────────────────────────────────

export interface SiblingInviteEmailArgs {
  parentFirstName: string;
  siblingFirstName: string;
  siblingTeamName: string;
  programName: string | null;
  referralUrl: string;
  note: string | null;
}

export interface SiblingInviteEmailBody {
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
 * Build the subject + HTML + plain-text body of the email the other coach
 * receives. `programName` is nullable — a coach whose org has no public
 * slug still has a referrable program; the body falls back to "their league"
 * instead of naming it.
 *
 * Voice: factual, parent-voiced. The copy never names the AGENTS.md banned
 * tokens; the test in tests/lib/sibling-invite-utils.test.ts asserts their
 * absence in the rendered subject + body.
 */
export function buildSiblingInviteEmail(
  args: SiblingInviteEmailArgs,
): SiblingInviteEmailBody {
  const { parentFirstName, siblingFirstName, siblingTeamName, programName, referralUrl, note } =
    args;

  const safeParent = escapeHtml(parentFirstName.trim());
  const safeSibling = escapeHtml(siblingFirstName.trim());
  const safeTeam = escapeHtml(siblingTeamName.trim());
  const safeProgram = programName ? escapeHtml(programName.trim()) : null;
  const safeUrl = escapeHtml(referralUrl);

  // Subject — positive, factual. Names the parent's first name + the
  // sibling's first name only.
  const subject = `${parentFirstName.trim()} invited you to try SportsIQ for ${siblingFirstName.trim()}'s team`;

  // Header line — parent-voiced. Names the sibling's team (the parent
  // typed the team's name into their kid's other coach context already).
  const programPhrase = safeProgram
    ? `is using SportsIQ for her family at <strong>${safeProgram}</strong>`
    : 'is using SportsIQ for her family';
  const programPhraseText = programName
    ? `is using SportsIQ for her family at ${programName.trim()}`
    : 'is using SportsIQ for her family';

  const headerHtml = `<p>Hi Coach,</p>
<p>${safeParent} ${programPhrase} &mdash; she wanted to make sure you saw it for ${safeSibling}'s team (<strong>${safeTeam}</strong>).</p>`;
  const headerText = `Hi Coach,

${parentFirstName.trim()} ${programPhraseText} — she wanted to make sure you saw it for ${siblingFirstName.trim()}'s team (${siblingTeamName.trim()}).`;

  // Optional parent note — rendered only when present.
  const noteBlockHtml = note?.trim()
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #F97316;background:#fafafa;color:#27272a;font-style:italic;">${escapeHtml(note.trim())}</blockquote>`
    : '';
  const noteBlockText = note?.trim() ? `\n\n"${note.trim()}"\n` : '';

  // Single primary CTA — the program-scoped referral landing.
  const ctaHtml = `<p style="margin:24px 0;"><a href="${safeUrl}" style="display:inline-block;background:#F97316;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">See how it works</a></p>`;
  const ctaText = `\nSee how it works: ${referralUrl}\n`;

  // Fineprint — confirms the recipient's email was not shared further.
  const fineprintHtml = safeProgram
    ? `<p style="color:#71717a;font-size:12px;margin-top:24px;">${safeParent} shared this from <strong>${safeProgram}</strong>'s SportsIQ portal &mdash; she did not share your email beyond this invite.</p>`
    : `<p style="color:#71717a;font-size:12px;margin-top:24px;">${safeParent} shared this from her family's SportsIQ portal &mdash; she did not share your email beyond this invite.</p>`;
  const fineprintText = programName
    ? `\n${parentFirstName.trim()} shared this from ${programName.trim()}'s SportsIQ portal — she did not share your email beyond this invite.`
    : `\n${parentFirstName.trim()} shared this from her family's SportsIQ portal — she did not share your email beyond this invite.`;

  // Standard unsubscribe / preference line — keep parity with the existing
  // layout default footer copy.
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

// ─── Per-share-token rate limiter (in-memory, 7-day window) ──────────────────
//
// AC: max 3 invites per from_share_token per rolling 7-day window. The route
// is public so we key on share_token (not user). Single-process in-memory
// map mirrors the program-referral fallback (no Redis dep). A 4th invite
// returns 429 with `{ reason: 'rate-limited' }`.

interface SiblingInviteRateEntry {
  count: number;
  resetAt: number;
}

const SIBLING_INVITE_LIMIT = 3;
const SIBLING_INVITE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const siblingInviteRateMap = new Map<string, SiblingInviteRateEntry>();

export interface SiblingInviteRateResult {
  allowed: boolean;
  count: number;
  limit: number;
  resetAt: number;
}

/**
 * Check + increment the per-share-token rate counter for the new sibling-
 * invite route. Returns `{ allowed: false }` when the caller would exceed
 * `SIBLING_INVITE_LIMIT` (3) in the current 7-day window. The route
 * returns 429 when allowed is false.
 *
 * `now` is overridable so tests can pin the clock without manipulating real
 * time. A negative-impact failure mode (allowing one extra invite on an
 * edge-of-window race) is acceptable — we are stopping bulk abuse, not
 * enforcing an absolute count.
 */
export function checkSiblingInviteRate(
  shareToken: string,
  now: number = Date.now(),
  limit: number = SIBLING_INVITE_LIMIT,
): SiblingInviteRateResult {
  if (!shareToken) {
    return {
      allowed: false,
      count: 0,
      limit,
      resetAt: now + SIBLING_INVITE_WINDOW_MS,
    };
  }
  const existing = siblingInviteRateMap.get(shareToken);
  if (!existing || existing.resetAt <= now) {
    siblingInviteRateMap.set(shareToken, { count: 1, resetAt: now + SIBLING_INVITE_WINDOW_MS });
    return { allowed: true, count: 1, limit, resetAt: now + SIBLING_INVITE_WINDOW_MS };
  }
  if (existing.count >= limit) {
    return { allowed: false, count: existing.count, limit, resetAt: existing.resetAt };
  }
  existing.count += 1;
  siblingInviteRateMap.set(shareToken, existing);
  return { allowed: true, count: existing.count, limit, resetAt: existing.resetAt };
}

/**
 * Test-only — drain the in-memory rate-limit map between tests so a prior
 * test's count never leaks into the next. NEVER call from production code.
 */
export function _resetSiblingInviteRateLimiterForTest(): void {
  siblingInviteRateMap.clear();
}

// ─── Email shape (re-export-friendly) ─────────────────────────────────────────

/**
 * Cheap email-shape validation used by both the client sheet and the server
 * route so an invalid email keeps the sheet open client-side AND fails the
 * POST with a 400 server-side (defense in depth — never trust the client).
 * Mirrors `isValidEmailShape` in `program-referral-utils.ts` byte-for-byte
 * so the two surfaces stay aligned.
 */
export function isValidEmailShape(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const v = raw.trim();
  if (v.length < 5 || v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
