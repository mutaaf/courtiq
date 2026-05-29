/**
 * Pure helpers for the parent-to-program-director referral primitive
 * (ticket 0050).
 *
 * The parent taps "Send this to our program director" on the parent portal
 * and the new POST route inserts a row in `program_referrals` and emails the
 * director with a link to the same /share/[token] page. The link carries a
 * `pr=<signed_director_id>` query parameter so the director-side view can
 * verify the click came from the email we sent (not a forged URL) and
 * surface the claim CTA.
 *
 * Token format (same shape as the 0042 coach-pause token):
 *   `<shareToken>.<directorEmailHash>.<hmac>`
 * where hmac = HMAC-SHA256(shareToken + '.' + directorEmailHash, secret),
 * encoded base64url. The signing secret reuses `CRON_SECRET` (already a
 * server-only env, AGENTS.md). No DB lookup is required to verify a token —
 * the verify is pure crypto, and the row read on the director-side page is
 * separate (it surfaces the parent's first name + program slug).
 *
 * `hashDirectorEmail()` exists so the dedup query never puts a raw email in
 * a WHERE clause (LESSONS#0023 family — keep the email out of the index).
 * The dedup window is 30 days: a re-submit by the same parent to the same
 * director within 30 days returns `{ alreadySent: true }` and does NOT fire
 * a second email; a re-submit AFTER 30 days does re-send.
 *
 * No new dependency: Node's built-in `crypto` is already in scope across
 * other API routes. No DB access in this file (LESSONS#0078).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// ─── Email hash ───────────────────────────────────────────────────────────────

/**
 * Normalize (lowercase + trim) the director's email and SHA-256 hash it.
 * The hash is what we store on `program_referrals.director_email_hash` and
 * what the 30-day dedup query filters on — never the raw email. Returns a
 * lowercase hex string (64 chars). Empty / non-string input returns ''.
 */
export function hashDirectorEmail(rawEmail: string | null | undefined): string {
  if (!rawEmail || typeof rawEmail !== 'string') return '';
  const normalized = rawEmail.trim().toLowerCase();
  if (!normalized) return '';
  return createHash('sha256').update(normalized).digest('hex');
}

// ─── Dedup window ─────────────────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Returns true when `sentAt` is within the last 30 days from `now` — meaning
 * a second submit from the same `(share_token, director_email_hash)` pair
 * must NOT fire a fresh email. After 30 days it returns false and the route
 * does re-send. `now` is optional so tests can pin the clock.
 */
export function isWithinDedupWindow(
  sentAt: string | Date | null | undefined,
  now: number | Date = Date.now(),
): boolean {
  if (!sentAt) return false;
  const sentMs = sentAt instanceof Date ? sentAt.getTime() : Date.parse(sentAt);
  if (!Number.isFinite(sentMs)) return false;
  const nowMs = now instanceof Date ? now.getTime() : now;
  return nowMs - sentMs < THIRTY_DAYS_MS;
}

// ─── HMAC sign / verify ───────────────────────────────────────────────────────

/**
 * Sign a director-id token. The payload binds the share token (which report
 * the parent forwarded) to the director's email hash (which director it went
 * to) so the verified id can resolve the right row server-side without ever
 * trusting a client-supplied identifier (LESSONS#0039).
 */
export function signDirectorId(args: {
  shareToken: string;
  directorEmailHash: string;
  secret: string;
}): string {
  const { shareToken, directorEmailHash, secret } = args;
  if (!secret) throw new Error('signDirectorId: secret is required');
  if (!shareToken) throw new Error('signDirectorId: shareToken is required');
  if (!directorEmailHash) throw new Error('signDirectorId: directorEmailHash is required');
  const payload = `${shareToken}.${directorEmailHash}`;
  const hmac = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${shareToken}.${directorEmailHash}.${hmac}`;
}

export type VerifyDirectorIdResult =
  | { ok: true; shareToken: string; directorEmailHash: string }
  | { ok: false };

/**
 * Verify a director-id token. Returns the decoded payload on success or
 * `{ ok: false }` on any failure (missing / wrong shape / HMAC mismatch /
 * wrong secret / empty secret / tampered). Never throws on garbage input —
 * the public share page passes `?pr=...` straight in.
 *
 * The token has exactly 3 dot-separated segments (shareToken,
 * directorEmailHash, hmac). Both the share token and the email hash are
 * opaque hex/text without dots, so the split is unambiguous.
 */
export function verifyDirectorId(
  token: string | null | undefined,
  secret: string,
): VerifyDirectorIdResult {
  if (!token || typeof token !== 'string') return { ok: false };
  if (!secret) return { ok: false };

  const segments = token.split('.');
  if (segments.length !== 3) return { ok: false };
  const [shareToken, directorEmailHash, hmac] = segments;
  if (!shareToken || !directorEmailHash || !hmac) return { ok: false };

  const expectedB64 = createHmac('sha256', secret)
    .update(`${shareToken}.${directorEmailHash}`)
    .digest('base64url');

  // timing-safe compare; equal-length buffers required or timingSafeEqual throws.
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

  return { ok: true, shareToken, directorEmailHash };
}

// ─── Email format ─────────────────────────────────────────────────────────────

/**
 * Cheap email-shape validation used by BOTH the client modal and the server
 * route so an invalid email keeps the modal open client-side AND fails the
 * POST with a 422 server-side (defense in depth — never trust the client).
 * Intentionally permissive (anything-at-anything-dot-anything) — verifying
 * deliverability is out of scope (see ticket Out of Scope).
 */
export function isValidEmailShape(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const v = raw.trim();
  if (v.length < 5 || v.length > 254) return false;
  // Single @, at least one non-space char on each side, and at least one dot
  // after the @. Mirrors the regex the existing parent-contact route uses
  // for the optional parentEmail field.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ─── Per-share-token rate limiter (in-memory, daily window) ──────────────────
//
// AC: max 3 submits per share_token per 24h. The route is public so we key
// on share_token (not user) — a multi-director league re-uses the surface,
// but a bot spamming one token gets a 429 on the 4th attempt. Single-process
// in-memory map mirrors the fallback in `src/lib/rate-limit.ts` (no Redis
// dependency added). Reset is a rolling 24h window from FIRST submit.

interface RateEntry {
  count: number;
  resetAt: number;
}

const PER_TOKEN_LIMIT = 3;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const rateMap = new Map<string, RateEntry>();

export interface RateCheckResult {
  allowed: boolean;
  count: number;
  limit: number;
  resetAt: number;
}

/**
 * Check and increment the per-share-token rate counter. Returns
 * `{ allowed: false }` when the caller would exceed `PER_TOKEN_LIMIT` (3) in
 * the current 24h window. The route returns 429 when allowed is false.
 *
 * `now` is overridable so tests can pin the clock without manipulating real
 * time. A negative-impact failure mode (allowing one extra submit on an
 * edge-of-window race) is fine — we are stopping bulk abuse, not enforcing
 * an absolute count.
 */
export function checkProgramReferralRate(
  shareToken: string,
  now: number = Date.now(),
  limit: number = PER_TOKEN_LIMIT,
): RateCheckResult {
  if (!shareToken) {
    return { allowed: false, count: 0, limit, resetAt: now + RATE_WINDOW_MS };
  }

  const key = shareToken;
  const existing = rateMap.get(key);

  // Window expired or first submit — start a fresh counter.
  if (!existing || existing.resetAt <= now) {
    const entry: RateEntry = { count: 1, resetAt: now + RATE_WINDOW_MS };
    rateMap.set(key, entry);
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

/**
 * Test-only escape hatch. Tests call this in `beforeEach` so the in-memory
 * map doesn't carry counters across cases.
 */
export function _resetProgramReferralRateLimiterForTest(): void {
  rateMap.clear();
}
