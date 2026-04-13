/**
 * Tests for src/lib/error-tracking.ts  (pure logic) and
 * the /api/errors POST route handler.
 *
 * Strategy:
 *  - error-tracking.ts: mock window/sessionStorage/fetch via global overrides.
 *  - API route: mock @/lib/supabase/server with a chainable in-memory stub.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockInsert, mockFrom } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(async () => ({
    from: mockFrom,
  })),
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  })),
}));

// ─── error-tracking module ─────────────────────────────────────────────────────

// We import the module under test AFTER mocks are hoisted but BEFORE each test
// that needs a clean module state (the queue is module-level state).
// We re-import via dynamic import to reset module state between sections.

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal Request-like object for the API route tests. */
function makeRequest(body: unknown, ip = '1.2.3.4'): Request {
  return new Request('http://localhost/api/errors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': ip,
    },
    body: JSON.stringify(body),
  });
}

// ─── Supabase mock helpers ────────────────────────────────────────────────────

function setInsertOk() {
  mockInsert.mockResolvedValue({ data: [], error: null });
  mockFrom.mockReturnValue({ insert: mockInsert });
}

function setInsertFail() {
  mockInsert.mockResolvedValue({ data: null, error: { message: 'table not found' } });
  mockFrom.mockReturnValue({ insert: mockInsert });
}

// ─── API Route tests ──────────────────────────────────────────────────────────

describe('POST /api/errors', () => {
  // Import route lazily so Supabase mock is in place
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    setInsertOk();
    const mod = await import('@/app/api/errors/route');
    POST = mod.POST;
  });

  it('returns 400 for invalid JSON', async () => {
    const req = new Request('http://localhost/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '1.2.3.4' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid JSON');
  });

  it('returns 400 when events is missing', async () => {
    const res = await POST(makeRequest({ foo: 'bar' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('events');
  });

  it('returns 400 when events is not an array', async () => {
    const res = await POST(makeRequest({ events: 'oops' }));
    expect(res.status).toBe(400);
  });

  it('accepts a valid event batch and returns ok:true', async () => {
    const res = await POST(makeRequest({
      events: [{
        level: 'error',
        message: 'Something went wrong',
        sessionId: 'abc123',
        timestamp: new Date().toISOString(),
      }],
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('returns stored count equal to number of valid events', async () => {
    const res = await POST(makeRequest({
      events: [
        { level: 'error', message: 'err1', sessionId: 's1', timestamp: new Date().toISOString() },
        { level: 'warning', message: 'warn1', sessionId: 's1', timestamp: new Date().toISOString() },
      ],
    }));
    const json = await res.json();
    expect(json.stored).toBe(2);
  });

  it('gracefully handles Supabase insert failure (stored=0, still 200)', async () => {
    setInsertFail();
    const res = await POST(makeRequest({
      events: [{ level: 'info', message: 'hi', sessionId: 's1', timestamp: new Date().toISOString() }],
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.stored).toBe(0);
  });

  it('strips invalid level and defaults to error', async () => {
    const res = await POST(makeRequest({
      events: [{ level: 'badlevel', message: 'test', sessionId: 's1', timestamp: new Date().toISOString() }],
    }));
    expect(res.status).toBe(200);
    // still processes — just with coerced level
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('silently drops events with missing message', async () => {
    const res = await POST(makeRequest({
      events: [
        { level: 'error', sessionId: 's1', timestamp: new Date().toISOString() },        // no message
        { level: 'info', message: 'valid', sessionId: 's1', timestamp: new Date().toISOString() },
      ],
    }));
    const json = await res.json();
    expect(json.stored).toBe(1); // only the valid one
  });

  it('caps batch at MAX_EVENTS_PER_BATCH (20)', async () => {
    const events = Array.from({ length: 30 }, (_, i) => ({
      level: 'info',
      message: `msg ${i}`,
      sessionId: 'sess',
      timestamp: new Date().toISOString(),
    }));
    const res = await POST(makeRequest({ events }));
    const json = await res.json();
    // Only up to 20 events should have been inserted
    const calls = mockInsert.mock.calls;
    if (calls.length > 0) {
      expect(calls[0][0].length).toBeLessThanOrEqual(20);
    }
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it('includes null stack and name when not provided', async () => {
    await POST(makeRequest({
      events: [{ level: 'error', message: 'test', sessionId: 's', timestamp: new Date().toISOString() }],
    }));
    const rows = mockInsert.mock.calls[0]?.[0];
    if (rows) {
      expect(rows[0].stack).toBeNull();
      expect(rows[0].name).toBeNull();
    }
  });

  it('uses x-forwarded-for header when x-real-ip absent', async () => {
    const req = new Request('http://localhost/api/errors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
      },
      body: JSON.stringify({
        events: [{ level: 'info', message: 'hi', sessionId: 'x', timestamp: new Date().toISOString() }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const rows = mockInsert.mock.calls[0]?.[0];
    if (rows) {
      expect(rows[0].ip).toBe('10.0.0.1');
    }
  });

  it('returns 429 when IP exceeds rate limit', async () => {
    // The route is stateful (in-process IP map). We need a unique IP
    // that hasn't been used in prior tests, then spam it.
    const ip = '99.99.99.99';
    // Send 100 requests to exhaust the limit
    for (let i = 0; i < 100; i++) {
      await POST(makeRequest({ events: [{ level: 'info', message: 'm', sessionId: 's', timestamp: new Date().toISOString() }] }, ip));
    }
    // The 101st should be rate-limited
    const res = await POST(makeRequest({ events: [{ level: 'info', message: 'm', sessionId: 's', timestamp: new Date().toISOString() }] }, ip));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain('Rate limit');
  });

  it('returns ok:true with stored:0 for an empty (but valid) events array', async () => {
    const res = await POST(makeRequest({ events: [] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stored).toBe(0);
  });
});

// ─── error-tracking lib — pure logic ──────────────────────────────────────────

describe('error-tracking library', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let originalFetch: typeof globalThis.fetch;

  // We need a fake window + sessionStorage for SSR-guard tests
  beforeEach(() => {
    vi.useFakeTimers();
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 })) as typeof globalThis.fetch;
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    // Provide a minimal sessionStorage stub
    const store: Record<string, string> = {};
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it('captureException enqueues and flushes via fetch', async () => {
    const { captureException } = await import('@/lib/error-tracking');
    captureException(new Error('test error'));
    // Advance past the FLUSH_DELAY_MS (600 ms)
    vi.advanceTimersByTime(700);
    await vi.runAllTimersAsync();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/errors',
      expect.objectContaining({ method: 'POST' })
    );
    const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.events[0].message).toBe('test error');
    expect(callBody.events[0].level).toBe('error');
  });

  it('captureException coerces non-Error values to Error message', async () => {
    const { captureException } = await import('@/lib/error-tracking');
    captureException('a plain string error');
    vi.advanceTimersByTime(700);
    await vi.runAllTimersAsync();
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit)?.body as string);
    expect(body.events[0].message).toBe('a plain string error');
  });

  it('captureException includes context in the report', async () => {
    const { captureException } = await import('@/lib/error-tracking');
    captureException(new Error('ctx test'), { boundary: 'dashboard', customKey: 42 });
    vi.advanceTimersByTime(700);
    await vi.runAllTimersAsync();
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit)?.body as string);
    expect(body.events[0].context?.boundary).toBe('dashboard');
    expect(body.events[0].context?.customKey).toBe(42);
  });

  it('captureMessage sends with default level info', async () => {
    const { captureMessage } = await import('@/lib/error-tracking');
    captureMessage('hello world');
    vi.advanceTimersByTime(700);
    await vi.runAllTimersAsync();
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit)?.body as string);
    expect(body.events[0].level).toBe('info');
    expect(body.events[0].message).toBe('hello world');
  });

  it('captureMessage respects explicit level', async () => {
    const { captureMessage } = await import('@/lib/error-tracking');
    captureMessage('danger!', 'fatal');
    vi.advanceTimersByTime(700);
    await vi.runAllTimersAsync();
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit)?.body as string);
    expect(body.events[0].level).toBe('fatal');
  });

  it('multiple rapid calls are batched into a single fetch', async () => {
    const { captureException, captureMessage } = await import('@/lib/error-tracking');
    captureException(new Error('err1'));
    captureException(new Error('err2'));
    captureMessage('msg1', 'warning');
    vi.advanceTimersByTime(700);
    await vi.runAllTimersAsync();
    // All three events should be in ONE fetch call
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.events.length).toBe(3);
  });

  it('initErrorTracking returns a callable cleanup function', async () => {
    const { initErrorTracking } = await import('@/lib/error-tracking');
    const cleanup = initErrorTracking();
    expect(typeof cleanup).toBe('function');
    cleanup(); // should not throw
  });

  it('captureException includes a timestamp in ISO format', async () => {
    const { captureException } = await import('@/lib/error-tracking');
    captureException(new Error('ts check'));
    vi.advanceTimersByTime(700);
    await vi.runAllTimersAsync();
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit)?.body as string);
    expect(body.events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('captureException includes error name field', async () => {
    const { captureException } = await import('@/lib/error-tracking');
    const err = new TypeError('type err');
    captureException(err);
    vi.advanceTimersByTime(700);
    await vi.runAllTimersAsync();
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit)?.body as string);
    expect(body.events[0].name).toBe('TypeError');
  });

  it('sessionId is stable within the same session', async () => {
    const { captureException } = await import('@/lib/error-tracking');
    captureException(new Error('a'));
    captureException(new Error('b'));
    vi.advanceTimersByTime(700);
    await vi.runAllTimersAsync();
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    const [ev1, ev2] = body.events;
    expect(ev1.sessionId).toBe(ev2.sessionId);
    expect(typeof ev1.sessionId).toBe('string');
    expect(ev1.sessionId.length).toBeGreaterThan(0);
  });
});
