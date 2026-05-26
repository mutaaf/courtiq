/**
 * Pure helpers for the coach-pause primitive (ticket 0042).
 *
 * One shared `isCoachPaused(row, now?)` predicate is imported by EVERY cron
 * that does outbound work (weekly-digest, parent-digest, practice-reminder,
 * weekly-parent-rollup, and the new coach-quiet-check-in cron) so any future
 * cron we add inherits the politeness automatically.
 *
 * Token format for the "Pause for 30 days" link in the check-in email:
 *   `<coachId>.<pausedUntilIso>.<hmac>`
 * where hmac = HMAC-SHA256(coachId + '.' + pausedUntilIso, secret), encoded
 * base64url. The signing secret reuses `CRON_SECRET` (already a server-only
 * env). No DB table needed — the token is self-contained and single-use by
 * convention (the page writes paused_until and the cron's dedup key prevents
 * a fresh email for 30 days).
 *
 * No new dependency: Node's built-in `crypto.createHmac` is already in scope
 * across other API routes.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

// ─── isCoachPaused ────────────────────────────────────────────────────────────

/**
 * Returns true ONLY when `paused_until` is a real future ISO timestamp.
 * Null / past / epoch-zero / malformed all return false. The optional `now`
 * parameter lets tests assert against a deterministic clock.
 */
export function isCoachPaused(
  row: { paused_until: string | null | undefined },
  now: Date = new Date(),
): boolean {
  const v = row.paused_until;
  if (!v) return false;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || t <= 0) return false;
  return t > now.getTime();
}

// ─── Token sign / verify ──────────────────────────────────────────────────────

/**
 * Sign a pause token. The token's payload is the coach id plus the target
 * `paused_until` ISO timestamp so the page can set the column atomically
 * without re-deriving the target on the server.
 */
export function signPauseToken(args: {
  coachId: string;
  pausedUntilIso: string;
  secret: string;
}): string {
  const { coachId, pausedUntilIso, secret } = args;
  if (!secret) throw new Error('signPauseToken: secret is required');
  const payload = `${coachId}.${pausedUntilIso}`;
  const hmac = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${coachId}.${pausedUntilIso}.${hmac}`;
}

export type VerifyResult =
  | { ok: true; coachId: string; pausedUntilIso: string }
  | { ok: false };

/**
 * Verify a pause token. Returns the decoded payload on success or `{ ok:
 * false }` on any failure (missing / wrong shape / HMAC mismatch / wrong
 * secret / empty secret). Never throws on garbage input — the public pause
 * page passes `?token=...` straight in.
 */
export function verifyPauseToken(token: string, secret: string): VerifyResult {
  if (!token || typeof token !== 'string') return { ok: false };
  if (!secret) return { ok: false };

  // The ISO timestamp itself contains dots (the milliseconds separator), so
  // splitting on '.' could produce more than 3 segments. The HMAC is the LAST
  // segment, the coachId is the FIRST, and the middle is everything in
  // between joined back with '.'.
  const segments = token.split('.');
  if (segments.length < 3) return { ok: false };
  const coachId = segments[0];
  const hmac = segments[segments.length - 1];
  const pausedUntilIso = segments.slice(1, -1).join('.');

  if (!coachId || !pausedUntilIso || !hmac) return { ok: false };

  const expectedB64 = createHmac('sha256', secret)
    .update(`${coachId}.${pausedUntilIso}`)
    .digest('base64url');

  // Timing-safe compare — both buffers must be equal length or
  // timingSafeEqual throws.
  let expectedBuf: Buffer;
  let receivedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expectedB64);
    receivedBuf = Buffer.from(hmac);
  } catch {
    return { ok: false };
  }
  if (expectedBuf.length !== receivedBuf.length) return { ok: false };
  try {
    if (!timingSafeEqual(expectedBuf, receivedBuf)) return { ok: false };
  } catch {
    return { ok: false };
  }

  return { ok: true, coachId, pausedUntilIso };
}

// ─── applyPauseToken — the page's only logic surface ─────────────────────────

export type ApplyPauseResult =
  | { ok: true; coachId: string; pausedUntilIso: string }
  | { ok: false; reason: 'missing' | 'invalid' };

/**
 * The pure decision the public `/account/pause?token=…` page makes before
 * touching the DB. Returns `{ ok: true, coachId, pausedUntilIso }` on a valid
 * token (the page then writes that exact `pausedUntilIso` to
 * `coaches.paused_until`); returns `{ ok: false, reason }` otherwise (the page
 * renders the error state with NO DB write).
 */
export function applyPauseToken(args: {
  token: string | null | undefined;
  secret: string;
}): ApplyPauseResult {
  const { token, secret } = args;
  if (!token) return { ok: false, reason: 'missing' };
  const v = verifyPauseToken(token, secret);
  if (!v.ok) return { ok: false, reason: 'invalid' };
  return { ok: true, coachId: v.coachId, pausedUntilIso: v.pausedUntilIso };
}
