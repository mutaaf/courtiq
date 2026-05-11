/**
 * In-memory sliding window rate limiter for AI endpoints.
 *
 * Protects against a single user exhausting API credits via runaway loops,
 * accidental double-submissions, or abuse. Tier-aware burst caps.
 *
 * Node.js keeps a single module instance per process, so the Map persists
 * across requests for the lifetime of the server.
 */

interface WindowEntry {
  timestamps: number[];
}

// Global per-user call log. Key: `${userId}:${endpoint}`
const windows = new Map<string, WindowEntry>();

// Sliding window: 60 seconds
const WINDOW_MS = 60_000;

// Burst limits per window (requests per minute)
const LIMITS: Record<string, number> = {
  segment:         20,  // most expensive — transcribing voice
  assistant:       30,  // chat turns, lower latency
  plan:            10,  // heavy prompt + schema extraction
  'report-card':    5,  // slow, large output
  'session-debrief': 10,
  default:         15,
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number; limit: number; remaining: number };

/**
 * Check whether `userId` can make another call to `endpoint`.
 * Call this at the top of every AI route handler.
 *
 * @param userId   Supabase auth user ID
 * @param endpoint Short identifier matching the keys in LIMITS, e.g. "segment"
 */
export function checkRateLimit(userId: string, endpoint: string): RateLimitResult {
  const key = `${userId}:${endpoint}`;
  const limit = LIMITS[endpoint] ?? LIMITS.default;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let entry = windows.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(key, entry);
  }

  // Drop timestamps older than the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  const count = entry.timestamps.length;

  if (count >= limit) {
    // When will the oldest call in the window expire?
    const oldest = entry.timestamps[0];
    const retryAfter = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter, limit, remaining: 0 };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

/**
 * Convenience: returns a NextResponse 429 JSON body, ready to return from a route.
 * Import `NextResponse` in the caller — not imported here to avoid Next.js coupling.
 */
export function rateLimitBody(result: Extract<RateLimitResult, { allowed: false }>) {
  return {
    error: `Too many requests. Please wait ${result.retryAfter}s before trying again.`,
    retryAfter: result.retryAfter,
    limit: result.limit,
  };
}
