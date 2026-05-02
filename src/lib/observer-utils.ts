/**
 * Observer Mode utilities — stateless HMAC tokens let a parent volunteer or
 * assistant coach capture template-based observations during practice without
 * needing an account. The token encodes the session ID and an expiry timestamp;
 * the HMAC prevents tampering.
 */

import crypto from 'crypto';
import {
  getAllTemplateIds,
  getTemplatesBySentiment,
  findTemplateById,
  ObservationTemplate,
} from './observation-templates';

// ── Secret resolution ─────────────────────────────────────────────────────────
// Prefer a strong server-side secret; fall back gracefully in dev/test.
function getSecret(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    'sportsiq-observer-dev-secret'
  );
}

// ── Token generation & validation ─────────────────────────────────────────────

/** Generate a signed observer token valid for `ttlHours` (default 24). */
export function generateObserverToken(sessionId: string, ttlHours = 24): string {
  const expires = Date.now() + ttlHours * 60 * 60 * 1000;
  const payload = buildTokenPayload(sessionId, expires);
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

/** Returns `{ sessionId }` if valid and unexpired, `null` otherwise. */
export function validateObserverToken(token: string): { sessionId: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;

    const expectedSig = crypto
      .createHmac('sha256', getSecret())
      .update(payloadB64)
      .digest('base64url');

    // Constant-time comparison to prevent timing attacks
    if (sig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

    const payload = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const { sessionId, expires } = parseTokenPayload(payload);
    if (!sessionId || !expires) return null;
    if (isExpired(expires)) return null;

    return { sessionId };
  } catch {
    return null;
  }
}

// ── Payload helpers ────────────────────────────────────────────────────────────

export function buildTokenPayload(sessionId: string, expires: number): string {
  return `${sessionId}:${expires}`;
}

export function parseTokenPayload(payload: string): { sessionId: string; expires: number } {
  const colonIdx = payload.indexOf(':');
  if (colonIdx === -1) return { sessionId: '', expires: 0 };
  const sessionId = payload.slice(0, colonIdx);
  const expires = parseInt(payload.slice(colonIdx + 1), 10);
  return { sessionId, expires: isNaN(expires) ? 0 : expires };
}

export function isExpired(expiresMs: number): boolean {
  return Date.now() > expiresMs;
}

// ── URL builder ───────────────────────────────────────────────────────────────

export function buildObserverUrl(token: string, baseUrl?: string): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_APP_URL || '';
  return `${base}/observe/${token}`;
}

// ── Template validation ───────────────────────────────────────────────────────

export function isValidTemplateId(id: string): boolean {
  return getAllTemplateIds().has(id);
}

export function getTemplateById(id: string): ObservationTemplate | undefined {
  return findTemplateById(id);
}

export function getPositiveTemplates(sportId?: string | null): ObservationTemplate[] {
  return getTemplatesBySentiment('positive', sportId);
}

export function getNeedsWorkTemplates(sportId?: string | null): ObservationTemplate[] {
  return getTemplatesBySentiment('needs-work', sportId);
}

// ── Observation payload builder ────────────────────────────────────────────────

export interface ObserverObsPayload {
  team_id: string;
  coach_id: string;
  session_id: string;
  player_id: string;
  text: string;
  sentiment: string;
  category: string;
  source: 'observer';
  ai_parsed: false;
  coach_edited: false;
  is_synced: true;
}

export function buildObservationPayload(
  template: ObservationTemplate,
  playerId: string,
  sessionId: string,
  teamId: string,
  coachId: string
): ObserverObsPayload {
  return {
    team_id: teamId,
    coach_id: coachId,
    session_id: sessionId,
    player_id: playerId,
    text: template.text,
    sentiment: template.sentiment,
    category: template.category,
    source: 'observer',
    ai_parsed: false,
    coach_edited: false,
    is_synced: true,
  };
}

// ── Rate limiting (in-memory, per IP) ─────────────────────────────────────────

interface RateEntry {
  count: number;
  resetAt: number;
}

const rateMap = new Map<string, RateEntry>();

export function checkObserverRateLimit(ip: string, maxPerHour = 50): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= maxPerHour) return false;
  entry.count++;
  return true;
}

export function getObserverRateKey(ip: string): string {
  return `observer:${ip}`;
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function formatObserverCount(count: number): string {
  if (count === 0) return 'No observations yet';
  if (count === 1) return '1 observation saved';
  return `${count} observations saved`;
}

export function getSessionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    practice: 'Practice',
    game: 'Game',
    scrimmage: 'Scrimmage',
    tournament: 'Tournament',
    training: 'Training',
  };
  return labels[type] ?? 'Session';
}
