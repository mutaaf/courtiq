'use client';

/**
 * Ticket 0084 — useViralSocialProof.
 *
 * Fires GET /api/coach/viral-social-proof ONCE per session when a 402
 * quota wall first surfaces, and caches the result in module state so
 * a second mount (or re-render) does NOT refetch. The fetch has a
 * 1.2-second timeout; on timeout, network error, or `{ line: null }`,
 * the hook returns `null` and the wall renders without the line — the
 * upgrade path itself is never blocked by the proof line being absent
 * (graceful degrade per LESSONS#0036).
 *
 * The hook is intentionally minimal so the smallest possible touch is
 * required on each shared 402-handling surface (LESSONS#0065 / #0066):
 * the surface just passes `active = aiUpgrade !== null` and threads
 * the returned value into `<AIUpgradePrompt socialProof={...} />`.
 */
import { useEffect, useState } from 'react';

const ROUTE = '/api/coach/viral-social-proof';
const TIMEOUT_MS = 1200;

export interface ViralSocialProof {
  line: string;
  eventKind: string;
}

/**
 * Per-session cache. The wall fires multiple times in a single session
 * (each gated route's 402); the line must be the same across all of
 * them and we must not re-bombard the route. `started` guards a
 * race where two callers mount in the same tick.
 */
type CacheState =
  | { kind: 'idle' }
  | { kind: 'pending'; promise: Promise<ViralSocialProof | null> }
  | { kind: 'resolved'; value: ViralSocialProof | null };

let cache: CacheState = { kind: 'idle' };

/** Test-only: clear the module-level cache between cases. */
export function __resetViralSocialProofCacheForTests() {
  cache = { kind: 'idle' };
}

async function fetchOnce(): Promise<ViralSocialProof | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ROUTE, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      line: string | null;
      eventKind: string | null;
    };
    if (!body || !body.line || !body.eventKind) return null;
    return { line: body.line, eventKind: body.eventKind };
  } catch {
    // AbortError, network error, JSON parse error — all degrade to null.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns the cached social-proof line (or null) the first time
 * `active` is true in a session, then re-uses the same value on every
 * subsequent mount until the page is reloaded.
 */
export function useViralSocialProof(active: boolean): ViralSocialProof | null {
  const [value, setValue] = useState<ViralSocialProof | null>(() => {
    return cache.kind === 'resolved' ? cache.value : null;
  });

  useEffect(() => {
    if (!active) return;

    if (cache.kind === 'resolved') {
      setValue(cache.value);
      return;
    }

    let cancelled = false;
    if (cache.kind === 'idle') {
      const promise = fetchOnce().then((result) => {
        cache = { kind: 'resolved', value: result };
        return result;
      });
      cache = { kind: 'pending', promise };
    }
    if (cache.kind === 'pending') {
      cache.promise.then((result) => {
        if (cancelled) return;
        setValue(result);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [active]);

  return value;
}
