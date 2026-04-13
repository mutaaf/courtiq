import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Module-level mock so redis is always null in tests ─────────────────────
vi.mock('@/lib/cache/redis', () => ({ redis: null }));

// Import AFTER the mock is set up
const { checkAIRateLimit, RateLimitError } = await import('@/lib/rate-limit');

// ── Helpers ────────────────────────────────────────────────────────────────

function uniqueId() {
  return `coach-${Math.random().toString(36).slice(2)}`;
}

// ── RateLimitError ─────────────────────────────────────────────────────────

describe('RateLimitError', () => {
  it('has status 429', () => {
    const err = new RateLimitError(20, Date.now() + 3_600_000);
    expect(err.status).toBe(429);
  });

  it('is an instance of Error', () => {
    const err = new RateLimitError(20, Date.now() + 3_600_000);
    expect(err).toBeInstanceOf(Error);
  });

  it('carries limit and resetAt', () => {
    const resetAt = Date.now() + 1_000;
    const err = new RateLimitError(10, resetAt);
    expect(err.limit).toBe(10);
    expect(err.resetAt).toBe(resetAt);
  });

  it('message mentions the limit', () => {
    const err = new RateLimitError(5, Date.now() + 60_000);
    expect(err.message).toContain('5');
  });
});

// ── checkAIRateLimit — in-memory fallback ──────────────────────────────────

describe('checkAIRateLimit (in-memory)', () => {
  const LIMIT = 3;

  it('allows the first request', async () => {
    const result = await checkAIRateLimit(uniqueId(), LIMIT);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(LIMIT);
    expect(result.remaining).toBe(LIMIT - 1);
  });

  it('counts consecutive requests and blocks at limit', async () => {
    const id = uniqueId();

    for (let i = 0; i < LIMIT; i++) {
      const r = await checkAIRateLimit(id, LIMIT);
      expect(r.allowed).toBe(true);
    }

    // (LIMIT + 1)th request should be blocked
    const blocked = await checkAIRateLimit(id, LIMIT);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('remaining decrements with each call', async () => {
    const id = uniqueId();
    const r1 = await checkAIRateLimit(id, LIMIT);
    const r2 = await checkAIRateLimit(id, LIMIT);
    expect(r2.remaining).toBe(r1.remaining - 1);
  });

  it('returns a resetAt timestamp in the future', async () => {
    const before = Date.now();
    const result = await checkAIRateLimit(uniqueId(), LIMIT);
    expect(result.resetAt).toBeGreaterThan(before);
  });

  it('separate coachIds have independent counters', async () => {
    const a = uniqueId();
    const b = uniqueId();

    // Exhaust coach A
    for (let i = 0; i <= LIMIT; i++) await checkAIRateLimit(a, LIMIT);
    const aBlocked = await checkAIRateLimit(a, LIMIT);
    expect(aBlocked.allowed).toBe(false);

    // Coach B is unaffected
    const bOk = await checkAIRateLimit(b, LIMIT);
    expect(bOk.allowed).toBe(true);
  });

  it('resets counter when window changes', async () => {
    const id = uniqueId();

    // Exhaust the window
    for (let i = 0; i <= LIMIT; i++) await checkAIRateLimit(id, LIMIT);
    expect((await checkAIRateLimit(id, LIMIT)).allowed).toBe(false);

    // Simulate window rollover by advancing time ~1 hour
    const original = Date.now;
    vi.spyOn(Date, 'now').mockReturnValue(original() + 3_601_000);
    try {
      const afterReset = await checkAIRateLimit(id, LIMIT);
      expect(afterReset.allowed).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
