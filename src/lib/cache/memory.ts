// Lightweight server-side in-memory cache with TTL
// Used for API routes to avoid repeated DB queries for the same data

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

// Prune expired entries periodically (every 100 sets)
let setCount = 0;
function maybePrune() {
  setCount++;
  if (setCount % 100 !== 0) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

/**
 * Get-or-set pattern: returns cached value if fresh, otherwise calls fetcher.
 * @param key   Cache key (should include user/team context)
 * @param ttlMs TTL in milliseconds
 * @param fetcher Async function that produces the value
 */
export async function memCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  const value = await fetcher();
  store.set(key, { value, expiresAt: now + ttlMs });
  maybePrune();
  return value;
}

/** Bust a specific key */
export function memBust(key: string) {
  store.delete(key);
}

/** Bust all keys matching a prefix */
export function memBustPrefix(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

// Pre-defined TTLs (milliseconds)
export const TTL = {
  SHORT: 30_000,       // 30s — observations, active sessions
  MEDIUM: 2 * 60_000,  // 2min — roster, attendance
  LONG: 5 * 60_000,    // 5min — momentum, engagement, analytics
  VERY_LONG: 15 * 60_000, // 15min — config, features, sports
  HOUR: 60 * 60_000,   // 1hr — rarely changing data
} as const;
