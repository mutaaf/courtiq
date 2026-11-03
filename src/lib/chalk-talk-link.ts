// Linking mutaafaziz.com/chalktalk to a CourtIQ account: a coach signed in to CourtIQ gets a signed token
// (HMAC-SHA256, 30 days) that the standalone board sends as a Bearer token to /api/labs/chalk-talk/*.
// The token names only the coach id; it unlocks nothing but Chalk Talk AI, and only from allowed origins.
import { createHmac, timingSafeEqual } from 'crypto';

const ORIGINS = [/^https:\/\/mutaafaziz\.com$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const DAYS = 30;
const secret = () => process.env.CHALK_TALK_LINK_SECRET || '';
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (body: string) => createHmac('sha256', secret()).update(body).digest();

export function createLinkToken(coachId: string, now = Date.now()): string {
  if (!secret()) throw new Error('CHALK_TALK_LINK_SECRET is not set');
  const body = b64(JSON.stringify({ sub: coachId, exp: Math.floor(now / 1000) + DAYS * 86400, v: 1 }));
  return body + '.' + b64(sign(body));
}

/** The coach id a valid, unexpired token names; null otherwise. */
export function verifyLinkToken(token: string, now = Date.now()): string | null {
  if (!secret()) return null;
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = sign(body), got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof p.sub === 'string' && p.exp * 1000 > now ? p.sub : null;
  } catch {
    return null;
  }
}

/** CORS for the standalone board (mutaafaziz.com); other origins get none. */
export function linkCors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  if (!ORIGINS.some((r) => r.test(origin))) return {};
  return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '86400', vary: 'Origin' };
}

/** Where the link may send the coach back to: the standalone board only. */
export function safeReturn(url: string | null): string {
  const fallback = 'https://mutaafaziz.com/chalktalk/';
  try {
    const u = new URL(url || fallback);
    return ORIGINS.some((r) => r.test(u.origin)) && u.pathname.startsWith('/chalktalk') ? u.origin + u.pathname : fallback;
  } catch {
    return fallback;
  }
}
