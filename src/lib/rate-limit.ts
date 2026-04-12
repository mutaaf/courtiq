import { redis } from '@/lib/cache/redis';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Max AI requests per coach per hour. Override via AI_RATE_LIMIT_PER_HOUR env var. */
const AI_RATE_LIMIT = Number(process.env.AI_RATE_LIMIT_PER_HOUR ?? 20);
const WINDOW_SECS = 3600; // 1 hour

// ─── Error class ─────────────────────────────────────────────────────────────

/** Thrown by callAI when a coach exceeds their hourly AI request quota. */
export class RateLimitError extends Error {
  readonly status = 429;
  readonly resetAt: number; // Unix ms when the window resets
  readonly limit: number;

  constructor(limit: number, resetAt: number) {
    const retryAfterSec = Math.ceil((resetAt - Date.now()) / 1000);
    super(
      `AI rate limit exceeded (${limit} requests/hour). ` +
        `Try again in ${retryAfterSec} second${retryAfterSec === 1 ? '' : 's'}.`
    );
    this.name = 'RateLimitError';
    this.limit = limit;
    this.resetAt = resetAt;
  }
}

// ─── Result type ─────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp ms
}

// ─── In-memory fallback (single-process only) ─────────────────────────────────

interface MemEntry {
  count: number;
  resetAt: number;
}

const inMemory = new Map<string, MemEntry>();

/** Returns the current 1-hour window key and the timestamp (ms) when it resets. */
function currentWindow(): { windowKey: string; resetAt: number } {
  const now = Date.now();
  const windowMs = WINDOW_SECS * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  return {
    windowKey: String(Math.floor(now / windowMs)),
    resetAt: windowStart + windowMs,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check and increment the per-coach AI rate limit.
 *
 * Uses a Redis fixed window (atomic INCR + EXPIRE) when Upstash is configured,
 * and falls back to an in-process Map otherwise.
 *
 * @param coachId  The authenticated coach's UUID.
 * @param limit    Requests allowed per hour (defaults to AI_RATE_LIMIT_PER_HOUR env var, else 20).
 */
export async function checkAIRateLimit(
  coachId: string,
  limit = AI_RATE_LIMIT
): Promise<RateLimitResult> {
  const { windowKey, resetAt } = currentWindow();

  // ── Redis path ────────────────────────────────────────────────────────────
  if (redis) {
    const key = `rl:ai:${coachId}:${windowKey}`;
    try {
      // Atomically increment; EXPIRE only needs setting on first write
      const count = await redis.incr(key);
      if (count === 1) {
        // Extra 60 s buffer so keys clean themselves up even if the window
        // boundary is hit exactly
        await redis.expire(key, WINDOW_SECS + 60);
      }
      const remaining = Math.max(0, limit - count);
      return { allowed: count <= limit, limit, remaining, resetAt };
    } catch {
      // Redis error — fail open to avoid blocking coaches during outages
      return { allowed: true, limit, remaining: limit, resetAt };
    }
  }

  // ── In-memory fallback ────────────────────────────────────────────────────
  const memKey = `${coachId}:${windowKey}`;
  const now = Date.now();
  const entry = inMemory.get(memKey);

  if (!entry || entry.resetAt <= now) {
    // Purge stale entries occasionally (every ~1 000 checks)
    if (inMemory.size > 500 && Math.random() < 0.01) {
      for (const [k, v] of inMemory) {
        if (v.resetAt <= now) inMemory.delete(k);
      }
    }
    inMemory.set(memKey, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }

  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);
  return { allowed: entry.count <= limit, limit, remaining, resetAt: entry.resetAt };
}

/**
 * Build the standard rate-limit response headers.
 * Include these on every AI response so clients can display remaining quota.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)), // Unix seconds
  };
}
