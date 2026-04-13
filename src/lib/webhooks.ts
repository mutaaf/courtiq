// Webhook delivery — HMAC-signed HTTP POST to registered endpoints
// Events fire after successful DB mutations; delivery is fire-and-forget.

import type { WebhookEvent } from '@/types/database';

export const WEBHOOK_EVENTS: { value: WebhookEvent; label: string; description: string }[] = [
  { value: 'observation.created', label: 'Observation Created', description: 'A new observation is saved' },
  { value: 'session.created', label: 'Session Created', description: 'A new session is started' },
  { value: 'session.updated', label: 'Session Updated', description: 'A session is modified (e.g. ended)' },
  { value: 'plan.created', label: 'Plan Created', description: 'An AI plan is generated' },
  { value: 'player.created', label: 'Player Created', description: 'A new player is added to the roster' },
];

/**
 * Signs a payload with HMAC-SHA256 using the webhook secret.
 * Returns the hex digest prefixed with "sha256=".
 */
export async function signPayload(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256=${hex}`;
}

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Delivers a webhook event to a single URL.
 * Returns the HTTP status code, or 0 on network error.
 */
async function deliverOne(
  url: string,
  secret: string,
  payload: WebhookPayload
): Promise<number> {
  const body = JSON.stringify(payload);
  const signature = await signPayload(secret, body);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SportsIQ-Event': payload.event,
        'X-SportsIQ-Signature': signature,
        'X-SportsIQ-Timestamp': payload.timestamp,
      },
      body,
      signal: AbortSignal.timeout(10_000), // 10 s timeout
    });
    return res.status;
  } catch {
    return 0;
  }
}

/**
 * Fires all active webhooks for an org that subscribed to the given event.
 * Runs fire-and-forget (no await at call site).
 * Updates last_triggered_at + last_status on each webhook row.
 */
export async function fireWebhooks(
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  // Lazy-import service supabase to keep this module usable in Edge contexts
  const { createServiceSupabase } = await import('@/lib/supabase/server');
  const admin = await createServiceSupabase();

  const { data: hooks } = await admin
    .from('webhooks')
    .select('id, url, secret')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .contains('events', [event]);

  if (!hooks || hooks.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  await Promise.allSettled(
    hooks.map(async (hook) => {
      const status = await deliverOne(hook.url, hook.secret, payload);
      await admin
        .from('webhooks')
        .update({ last_triggered_at: payload.timestamp, last_status: status })
        .eq('id', hook.id);
    })
  );
}
