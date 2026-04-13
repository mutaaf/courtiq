import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { signPayload } from '@/lib/webhooks';
import type { WebhookPayload } from '@/lib/webhooks';

/** POST /api/webhooks/[id]/test — send a test ping to the webhook URL */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const admin = await createServiceSupabase();
  const { data: coach } = await admin.from('coaches').select('org_id').eq('id', user.id).single();
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  const { data: hook } = await admin
    .from('webhooks')
    .select('id, url, secret')
    .eq('id', id)
    .eq('org_id', coach.org_id)
    .single();
  if (!hook) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const payload: WebhookPayload = {
    event: 'observation.created',
    timestamp: new Date().toISOString(),
    data: { test: true, message: 'SportsIQ webhook test ping' },
  };

  const body = JSON.stringify(payload);
  const signature = await signPayload(hook.secret, body);

  let status = 0;
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SportsIQ-Event': payload.event,
        'X-SportsIQ-Signature': signature,
        'X-SportsIQ-Timestamp': payload.timestamp,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
  } catch {
    status = 0;
  }

  await admin
    .from('webhooks')
    .update({ last_triggered_at: payload.timestamp, last_status: status })
    .eq('id', id);

  const success = status >= 200 && status < 300;
  return NextResponse.json({ success, status });
}
