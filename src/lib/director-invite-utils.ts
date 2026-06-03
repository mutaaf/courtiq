/**
 * Pure helpers for the coach-to-director invite primitive (ticket 0065).
 *
 * The coach taps "Send to <Mike>" on the new section beneath the 0057
 * weekly-pulse share sheet's Copy-link button, and the new POST route
 * upserts a `coach_director_contacts` row and emails the director with a
 * link back to the same public `/week/<token>` URL the coach just
 * published, plus a secondary "claim your program" CTA that lands on
 * `/programs?invite=director&ref=<signed>`.
 *
 * `hashDirectorEmail` mirrors 0050's `program-referral-utils.ts` posture
 * byte-for-byte so the shared 30-day dedup query never puts a raw email in
 * a WHERE clause (LESSONS#0023 family). `maskDirectorEmail` is the
 * read-side mask the pre-fill GET surfaces (`m***@example.com`) — the raw
 * email is written ONLY on the contacts row and never returned to the
 * client.
 *
 * `validateDirectorName` enforces the share-sheet's name input (1–60
 * chars, voice-clean). It instructs POSITIVELY — the helper never
 * enumerates the banned-token list as a string literal inside its own
 * body (LESSONS#0023 / #0077). The structural scan reuses the existing
 * `TRAJECTORY_BANNED_WORDS` constant from `player-trajectory-utils`.
 *
 * `buildDirectorInviteEmail` renders the structured email the new POST
 * route fires — there is NO AI call on this path; the body is a template
 * over the inputs the route already has (the coach's full name, the team
 * name, the director's first name, the weekly-pulse preview, the two
 * URLs). The render-time scan is the structural guarantee the AC requires.
 *
 * `signDirectorInviteRef` / `verifyDirectorInviteRef` are the signed-token
 * helpers for the `?ref=` payload the director-claim secondary CTA carries.
 * The payload binds the coach, the team, the invite id, and the sentAt so
 * the verified id can attribute the claim server-side without ever
 * trusting a client-supplied identifier (LESSONS#0039). 30-day expiration.
 *
 * `checkDirectorInviteRate` is the per-coach 7-day rolling-window limiter
 * (max 20 sends per caller per 7 rolling days). In-memory single-process
 * fallback mirrors `program-referral-utils.ts`.
 *
 * No DB access in this file (LESSONS#0078). No new dependency: Node's
 * built-in `crypto` is already in scope across other API routes.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  TRAJECTORY_BANNED_WORDS,
  containsBannedWord,
} from '@/lib/player-trajectory-utils';
import {
  renderEmail,
  heroSection,
  paragraph,
  ctaButton,
  statRow,
  divider,
  inlineLink,
  escapeHtml,
} from '@/lib/email/layout';

// ─── Email hash ───────────────────────────────────────────────────────────────

/**
 * Normalize (lowercase + trim) the director's email and SHA-256 hash it.
 * The hash is what the route stores on `coach_director_contacts
 * .director_email_hash` and what the shared 30-day dedup query filters on
 * — never the raw email. Returns a lowercase hex string (64 chars). Empty
 * / non-string input returns ''.
 */
export function hashDirectorEmail(rawEmail: string | null | undefined): string {
  if (!rawEmail || typeof rawEmail !== 'string') return '';
  const normalized = rawEmail.trim().toLowerCase();
  if (!normalized) return '';
  return createHash('sha256').update(normalized).digest('hex');
}

// ─── Email mask ───────────────────────────────────────────────────────────────

/**
 * Mask a director's email so the pre-fill GET can confirm "yes, you have a
 * contact" without ever returning the raw address. Shape:
 *   `mike@example.com` → `m***@example.com`
 *
 * Empty / non-email input returns '' so the route can render the empty
 * state safely.
 */
export function maskDirectorEmail(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed.includes('@')) return '';
  const [local, domain] = trimmed.split('@');
  if (!local || !domain) return '';
  const head = local[0] ?? '';
  return `${head}***@${domain}`;
}

// ─── Email format ─────────────────────────────────────────────────────────────

/**
 * Cheap email-shape validation. Mirrors `isValidEmailShape` in
 * `program-referral-utils.ts`. Defense in depth — never trust the client.
 */
export function isValidDirectorEmail(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const v = raw.trim();
  if (v.length < 5 || v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ─── Name validation ──────────────────────────────────────────────────────────

const NAME_MAX_LENGTH = 60;

export type ValidateDirectorNameResult =
  | { ok: true }
  | { ok: false; reason: 'length' | 'voice' };

/**
 * Validate the director's first name as typed by the coach on the share
 * sheet. Length is bounded (1–60) and the string is scanned for AGENTS.md
 * banned voice tokens via the structural `containsBannedWord` helper from
 * `player-trajectory-utils.ts`. The scan is structural; this function's
 * own body never lists the banned tokens as a string literal (LESSONS
 * #0023 / #0077 — instruct positively).
 */
export function validateDirectorName(raw: string | null | undefined): ValidateDirectorNameResult {
  const v = (raw ?? '').trim();
  if (v.length < 1) return { ok: false, reason: 'length' };
  if (v.length > NAME_MAX_LENGTH) return { ok: false, reason: 'length' };
  if (containsBannedWord(v)) return { ok: false, reason: 'voice' };
  return { ok: true };
}

// ─── Email template ───────────────────────────────────────────────────────────

export interface DirectorInviteEmailArgs {
  /** Coach's full name (the coach's own public identity — not a minor). */
  coachFullName: string;
  /** Team name. */
  teamName: string;
  /** Director's first name (typed by the coach; not pulled from any DB). */
  directorFirstName: string;
  /** Structured preview of the weekly-pulse card content (team-level only). */
  weeklyPulsePreview: {
    /** Human-readable week label, e.g. "Week of May 25". */
    weekLabel: string;
    sessionCount: number;
    topCategories: string[];
    focusLine: string | null;
  };
  /** /week/<token>?ref=director-invite — the same URL the coach is sharing. */
  deepLinkUrl: string;
  /** /programs?invite=director&ref=<signed> — secondary claim CTA. */
  programClaimUrl: string;
  /** Coach-side preferences link (reuses the existing unified footer). */
  unsubscribeUrl: string;
}

export interface DirectorInviteEmailBody {
  subject: string;
  html: string;
  text: string;
}

/**
 * Build the subject + HTML + plain-text body of the director-side email.
 * Five elements per the AC:
 *   (a) lead line naming the coach + the team
 *   (b) structured preview of the weekly-pulse content
 *   (c) one CTA button "See the card on SportsIQ"
 *   (d) one secondary line "Want this for your whole program?"
 *   (e) the existing email footer with unsubscribe
 *
 * Reuses `src/lib/email/layout.ts` so the brand stays coherent with the
 * rest of the lifecycle emails (LESSONS#0096 — read the existing layout
 * first; do not invent a parallel renderer).
 */
export function buildDirectorInviteEmail(
  args: DirectorInviteEmailArgs,
): DirectorInviteEmailBody {
  const {
    coachFullName,
    teamName,
    directorFirstName,
    weeklyPulsePreview,
    deepLinkUrl,
    programClaimUrl,
  } = args;

  const safeCoach = (coachFullName ?? '').trim();
  const safeTeam = (teamName ?? '').trim();
  const safeDirector = (directorFirstName ?? '').trim();

  // Subject — positive, factual. Names the coach + the team so the
  // director knows it is internal to their program at first glance.
  const subject = `Coach ${safeCoach} on the ${safeTeam} sent this week's pulse`;

  const sessionSuffix = weeklyPulsePreview.sessionCount === 1 ? '' : 's';
  const sessionPhrase = `${weeklyPulsePreview.sessionCount} session${sessionSuffix}`;
  const lead = `${safeDirector}, Coach ${safeCoach} on the ${safeTeam} sent you this week's pulse card — ${sessionPhrase} from ${weeklyPulsePreview.weekLabel}.`;

  // The structured preview: a stat row + an optional focus line. The
  // numbers are team-level aggregates from `weekly_pulse_shares` + the
  // existing share renderer (migration 054), never per-kid content.
  const stats = [
    { label: 'Week', value: weeklyPulsePreview.weekLabel },
    {
      label: 'Sessions',
      value: String(weeklyPulsePreview.sessionCount),
    },
  ];
  if (weeklyPulsePreview.topCategories.length > 0) {
    stats.push({
      label: 'Top categories',
      value: weeklyPulsePreview.topCategories.slice(0, 2).join(' + '),
    });
  }
  const focusBlock = weeklyPulsePreview.focusLine
    ? paragraph(`Focus this week: ${weeklyPulsePreview.focusLine}`)
    : '';

  const body = `
    ${heroSection(`This week's pulse from ${safeTeam}`, lead)}
    ${statRow(stats)}
    ${focusBlock}
    ${ctaButton('See the card on SportsIQ', deepLinkUrl)}
    ${divider()}
    ${paragraph(
      `Want this for your whole program? ${inlineLink(
        `Claim ${safeTeam}'s program on SportsIQ — free`,
        programClaimUrl,
      )}.`,
      { html: true },
    )}
  `;

  const html = renderEmail({
    preview: lead,
    body,
  });

  const text = [
    lead,
    '',
    `${weeklyPulsePreview.weekLabel} · ${weeklyPulsePreview.sessionCount} session${weeklyPulsePreview.sessionCount === 1 ? '' : 's'}`,
    weeklyPulsePreview.topCategories.length > 0
      ? `Top categories: ${weeklyPulsePreview.topCategories.join(', ')}`
      : '',
    weeklyPulsePreview.focusLine ? `Focus: ${weeklyPulsePreview.focusLine}` : '',
    '',
    `See the card: ${deepLinkUrl}`,
    '',
    `Want this for your whole program? Claim ${safeTeam}'s program on SportsIQ — free: ${programClaimUrl}`,
    '',
    '— SportsIQ',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}

// Re-export the banned-word constant for test convenience (so a render-side
// scan can import from one place). The structural scan keeps the helper
// itself voice-clean (LESSONS#0023).
export { TRAJECTORY_BANNED_WORDS };

// Defensive: ensure `escapeHtml` is used. (Static reference so tree-shake
// keeps it in scope; the layout helper escapes on its own — this is a
// belt-and-braces hook for callers that want to escape before splicing.)
export const _escapeHtml = escapeHtml;

// ─── Signed `ref` payload for the director-side claim CTA ────────────────────

export interface DirectorInviteRefPayload {
  coachId: string;
  teamId: string;
  inviteId: string;
  /** ISO timestamp. Used to enforce the 30-day expiration on verify. */
  sentAt: string;
}

const REF_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Sign a director-invite ref. The payload binds the inviting coach, the
 * team, the invite id, and the sentAt timestamp so the verified payload
 * can attribute the claim on /api/auth/setup without trusting any
 * client-supplied identifier (LESSONS#0039). The token is
 *   `base64url(json).base64url(hmac)`
 * — mirrors the 0050 shape with a JSON-encoded payload.
 */
export function signDirectorInviteRef(
  payload: DirectorInviteRefPayload,
  secret: string,
): string {
  if (!secret) throw new Error('signDirectorInviteRef: secret is required');
  if (!payload.coachId || !payload.teamId || !payload.inviteId || !payload.sentAt) {
    throw new Error('signDirectorInviteRef: incomplete payload');
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${hmac}`;
}

export type VerifyDirectorInviteRefResult =
  | { ok: true; payload: DirectorInviteRefPayload }
  | { ok: false; reason: 'invalid-ref' | 'expired-ref' };

export function verifyDirectorInviteRef(
  token: string | null | undefined,
  secret: string,
  now: number | Date = Date.now(),
): VerifyDirectorInviteRefResult {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'invalid-ref' };
  if (!secret) return { ok: false, reason: 'invalid-ref' };
  const segments = token.split('.');
  if (segments.length !== 2) return { ok: false, reason: 'invalid-ref' };
  const [body, hmac] = segments;
  if (!body || !hmac) return { ok: false, reason: 'invalid-ref' };

  let expectedB64: string;
  try {
    expectedB64 = createHmac('sha256', secret).update(body).digest('base64url');
  } catch {
    return { ok: false, reason: 'invalid-ref' };
  }
  let expectedBuf: Buffer;
  let receivedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expectedB64);
    receivedBuf = Buffer.from(hmac);
  } catch {
    return { ok: false, reason: 'invalid-ref' };
  }
  if (expectedBuf.length !== receivedBuf.length) return { ok: false, reason: 'invalid-ref' };
  try {
    if (!timingSafeEqual(expectedBuf, receivedBuf)) return { ok: false, reason: 'invalid-ref' };
  } catch {
    return { ok: false, reason: 'invalid-ref' };
  }

  let payload: DirectorInviteRefPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as DirectorInviteRefPayload;
  } catch {
    return { ok: false, reason: 'invalid-ref' };
  }
  if (
    !payload.coachId ||
    !payload.teamId ||
    !payload.inviteId ||
    !payload.sentAt
  ) {
    return { ok: false, reason: 'invalid-ref' };
  }

  const sentMs = Date.parse(payload.sentAt);
  if (!Number.isFinite(sentMs)) return { ok: false, reason: 'invalid-ref' };
  const nowMs = now instanceof Date ? now.getTime() : now;
  if (nowMs - sentMs > REF_EXPIRY_MS) return { ok: false, reason: 'expired-ref' };

  return { ok: true, payload };
}

// ─── Per-coach rate limiter (in-memory, 7 rolling days) ──────────────────────
//
// AC: max 20 director invites per coach per 7 rolling days. In-memory
// single-process map mirrors 0050's program-referral fallback. The
// per-coach bucket resets 7 days after the FIRST submit in the window.

interface RateEntry {
  count: number;
  resetAt: number;
}

const PER_COACH_LIMIT = 20;
const RATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const rateMap = new Map<string, RateEntry>();

export interface RateCheckResult {
  allowed: boolean;
  count: number;
  limit: number;
  resetAt: number;
}

/**
 * Check and increment the per-coach rate counter. Returns
 * `{ allowed: false }` when the caller would exceed `PER_COACH_LIMIT` (20)
 * in the current 7-day window.
 */
export function checkDirectorInviteRate(
  coachId: string,
  now: number = Date.now(),
  limit: number = PER_COACH_LIMIT,
): RateCheckResult {
  if (!coachId) {
    return { allowed: false, count: 0, limit, resetAt: now + RATE_WINDOW_MS };
  }
  const existing = rateMap.get(coachId);
  if (!existing || existing.resetAt <= now) {
    const entry: RateEntry = { count: 1, resetAt: now + RATE_WINDOW_MS };
    rateMap.set(coachId, entry);
    return { allowed: true, count: 1, limit, resetAt: entry.resetAt };
  }
  existing.count += 1;
  return {
    allowed: existing.count <= limit,
    count: existing.count,
    limit,
    resetAt: existing.resetAt,
  };
}

/** Test-only escape hatch so test runs do not carry counters across cases. */
export function _resetDirectorInviteRateLimiterForTest(): void {
  rateMap.clear();
}
