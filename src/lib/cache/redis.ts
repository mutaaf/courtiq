import { Redis } from '@upstash/redis';

const redis = process.env.UPSTASH_REDIS_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN!,
    })
  : null;

export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { ttl: number }
): Promise<T & { _cached: boolean }> {
  if (!redis) {
    const value = await fetcher();
    return { ...value, _cached: false } as T & { _cached: boolean };
  }
  const hit = await redis.get<T>(key);
  if (hit !== null && hit !== undefined) return { ...(hit as object), _cached: true } as T & { _cached: boolean };
  const value = await fetcher();
  await redis.set(key, value, { ex: options.ttl });
  return { ...value, _cached: false } as T & { _cached: boolean };
}

export async function bustCache(...keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return;
  await redis.del(...keys);
}

export async function bustCachePattern(pattern: string): Promise<void> {
  if (!redis) return;
  let cursor = 0;
  do {
    const [next, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
    cursor = Number(next);
    if (keys.length > 0) await redis.del(...(keys as string[]));
  } while (cursor !== 0);
}

export { redis };
