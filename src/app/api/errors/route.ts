import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import type { ErrorReport } from '@/lib/error-tracking';

// ─── In-process IP rate limit (100 reports / hour per IP) ────────────────────

interface IpEntry {
  count: number;
  resetAt: number;
}

const ipMap = new Map<string, IpEntry>();
const IP_LIMIT = 100;
const IP_WINDOW_MS = 3_600_000; // 1 hour

function checkIpLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipMap.get(ip);

  if (!entry || entry.resetAt <= now) {
    // Prune stale entries occasionally
    if (ipMap.size > 1_000 && Math.random() < 0.05) {
      for (const [k, v] of ipMap) {
        if (v.resetAt <= now) ipMap.delete(k);
      }
    }
    ipMap.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return true;
  }

  entry.count += 1;
  return entry.count <= IP_LIMIT;
}

// ─── Validation ────────────────────────────────────────────────────────────────

const VALID_LEVELS = new Set(['fatal', 'error', 'warning', 'info']);
const MAX_EVENTS_PER_BATCH = 20;
const MAX_MSG_LENGTH = 2_000;

function sanitize(r: unknown): ErrorReport | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;

  const level = typeof o.level === 'string' && VALID_LEVELS.has(o.level)
    ? (o.level as ErrorReport['level'])
    : 'error';

  const message = typeof o.message === 'string' ? o.message.slice(0, MAX_MSG_LENGTH) : null;
  if (!message) return null;

  return {
    level,
    message,
    stack: typeof o.stack === 'string' ? o.stack.slice(0, MAX_MSG_LENGTH * 2) : undefined,
    name: typeof o.name === 'string' ? o.name.slice(0, 100) : undefined,
    context: o.context && typeof o.context === 'object' ? (o.context as ErrorReport['context']) : undefined,
    sessionId: typeof o.sessionId === 'string' ? o.sessionId.slice(0, 64) : 'unknown',
    url: typeof o.url === 'string' ? o.url.slice(0, 500) : undefined,
    timestamp: typeof o.timestamp === 'string' ? o.timestamp : new Date().toISOString(),
  };
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Derive IP from headers (works behind Vercel / Cloudflare proxies)
  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';

  if (!checkIpLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !Array.isArray((body as any).events)) {
    return NextResponse.json({ error: 'events array required' }, { status: 400 });
  }

  const raw: unknown[] = (body as any).events.slice(0, MAX_EVENTS_PER_BATCH);
  const events: ErrorReport[] = raw.map(sanitize).filter((e): e is ErrorReport => e !== null);

  if (events.length === 0) {
    return NextResponse.json({ ok: true, stored: 0 });
  }

  // ── Structured console log (always runs; visible in Vercel logs) ──────────
  for (const ev of events) {
    const logFn = ev.level === 'fatal' || ev.level === 'error'
      ? console.error
      : ev.level === 'warning'
      ? console.warn
      : console.info;

    logFn('[error-tracking]', JSON.stringify({
      level: ev.level,
      name: ev.name,
      message: ev.message,
      sessionId: ev.sessionId,
      url: ev.url,
      timestamp: ev.timestamp,
      ip,
    }));
  }

  // ── Persist to Supabase (best-effort; failures never block the 200 OK) ────
  let stored = 0;
  try {
    const admin = await createServiceSupabase();
    const rows = events.map((ev) => ({
      session_id: ev.sessionId,
      level: ev.level,
      message: ev.message,
      stack: ev.stack ?? null,
      name: ev.name ?? null,
      context: ev.context ?? null,
      url: ev.url ?? null,
      ip,
    }));

    const { error } = await admin.from('error_events').insert(rows);
    if (!error) stored = rows.length;
  } catch {
    // Table may not exist yet (before migration is run) — that's fine
  }

  return NextResponse.json({ ok: true, stored });
}
