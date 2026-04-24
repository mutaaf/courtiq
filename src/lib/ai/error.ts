import { NextResponse } from 'next/server';

/**
 * Shared catch-block handler for all /api/ai/* routes.
 *
 * Handles:
 * - TierLimitError (status 402) → returns 402 with upgrade flag
 * - RateLimitError (status 429) → returns 429 with Retry-After header
 * - Everything else              → returns 500 with the error message
 *
 * @param error    The unknown value caught by the route.
 * @param context  Label used in the console.error message (e.g. 'Plan').
 */
export function handleAIError(error: unknown, context: string): NextResponse {
  const e = error as any;

  // Monthly tier limit exceeded — thrown by callAI for free-tier orgs
  if (e?.status === 402 && e?.upgrade) {
    return NextResponse.json(
      {
        error: e.message || 'Monthly AI limit reached. Upgrade to continue.',
        upgrade: true,
        tier: e.tier,
        limit: e.limit,
      },
      { status: 402 }
    );
  }

  // Hourly rate limit exceeded — thrown by callAI via checkAIRateLimit
  if (e?.status === 429) {
    const resetAt: number = e.resetAt ?? Date.now() + 3_600_000;
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: e.message || 'AI rate limit exceeded. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(e.limit ?? 20),
          'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
        },
      }
    );
  }

  // Generic server error
  const message =
    e instanceof Error ? e.message : typeof e?.message === 'string' ? e.message : 'Unknown error';
  console.error(`${context} error:`, error);
  return NextResponse.json({ error: message }, { status: 500 });
}
