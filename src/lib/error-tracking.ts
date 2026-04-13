/**
 * Lightweight error tracking — "Sentry-like" client that batches and POSTs
 * captured exceptions and messages to /api/errors.
 *
 * Usage:
 *   import { captureException, captureMessage, initErrorTracking } from '@/lib/error-tracking';
 *
 *   captureException(err);                   // auto-reports to /api/errors
 *   captureMessage('payment skipped', 'warning');
 *   const cleanup = initErrorTracking();    // registers window.onerror + unhandledrejection
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ErrorLevel = 'fatal' | 'error' | 'warning' | 'info';

export interface ErrorContext {
  [key: string]: unknown;
}

export interface ErrorReport {
  /** Severity of the event. */
  level: ErrorLevel;
  /** Human-readable description. */
  message: string;
  /** Stack trace string (errors only). */
  stack?: string;
  /** Error constructor name (e.g. "TypeError"). */
  name?: string;
  /** Arbitrary key-value metadata. */
  context?: ErrorContext;
  /** Stable ID for this browser session (generated once, stored in sessionStorage). */
  sessionId: string;
  /** Full URL where the error occurred. */
  url?: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

// ─── Session ID ─────────────────────────────────────────────────────────────────

const SESSION_KEY = 'siq_err_session';

function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage blocked (e.g. private browsing restriction)
    return 'blocked';
  }
}

// ─── Queue & flush ────────────────────────────────────────────────────────────

const MAX_QUEUE = 50;          // cap queue size to avoid runaway memory use
const FLUSH_DELAY_MS = 600;    // batch window: flush 600 ms after first enqueue
const MAX_BATCH_SIZE = 20;     // max events per POST
const MAX_MSG_LENGTH = 2_000;  // truncate very long messages

const queue: ErrorReport[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Truncate helper so payloads don't balloon. */
function truncate(s: string | undefined, max: number): string | undefined {
  return s && s.length > max ? s.slice(0, max) + '…' : s;
}

function flush(): void {
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH_SIZE);
  try {
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // keepalive lets the request survive page unloads
      keepalive: true,
      body: JSON.stringify({ events: batch }),
    }).catch(() => {
      // Network error — silently discard; we never throw from here
    });
  } catch {
    // fetch itself threw (e.g. CSP) — discard silently
  }
}

function schedule(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_DELAY_MS);
}

function enqueue(report: ErrorReport): void {
  if (typeof window === 'undefined') return; // no-op on server; Next.js handles server errors
  if (queue.length >= MAX_QUEUE) return;      // safety: don't grow unbounded
  queue.push(report);
  schedule();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Report a caught (or caught-and-rethrown) exception.
 *
 * Accepts any value — non-Error values are coerced to Error so we always have
 * a message and (optionally) a stack trace.
 */
export function captureException(error: unknown, context?: ErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  enqueue({
    level: 'error',
    message: truncate(err.message, MAX_MSG_LENGTH) ?? '',
    stack: truncate(err.stack, MAX_MSG_LENGTH * 2),
    name: err.name,
    context,
    sessionId: getSessionId(),
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Report an arbitrary message (not necessarily tied to an Error object).
 *
 * Useful for breadcrumbs or soft warnings ("user skipped onboarding step 2").
 */
export function captureMessage(
  message: string,
  level: ErrorLevel = 'info',
  context?: ErrorContext
): void {
  enqueue({
    level,
    message: truncate(message, MAX_MSG_LENGTH) ?? '',
    context,
    sessionId: getSessionId(),
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    timestamp: new Date().toISOString(),
  });
}

// ─── Global handlers ──────────────────────────────────────────────────────────

/**
 * Register `window.onerror` and `unhandledrejection` listeners so uncaught
 * errors are reported automatically.
 *
 * Returns a cleanup function — call it in `useEffect` return to avoid
 * double-registration in strict mode.
 *
 * Safe to call server-side (returns a no-op cleanup immediately).
 */
export function initErrorTracking(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onWindowError = (event: ErrorEvent) => {
    captureException(event.error ?? new Error(event.message), {
      source: 'window.onerror',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    captureException(reason instanceof Error ? reason : new Error(String(reason)), {
      source: 'unhandledrejection',
    });
  };

  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
