import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { WebhookEvent } from '@/types/database';
import { WEBHOOK_EVENTS } from '@/lib/webhooks';

const ALLOWED_EVENTS = WEBHOOK_EVENTS.map((e) => e.value) as WebhookEvent[];

/** GET /api/webhooks — list webhooks for the coach's org */
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const { data: coach } = await admin.from('coaches').select('org_id').eq('id', user.id).single();
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  const { data } = await admin
    .from('webhooks')
    .select('id, url, events, is_active, last_triggered_at, last_status, created_at')
    .eq('org_id', coach.org_id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ webhooks: data ?? [] });
}

/** POST /api/webhooks — create a webhook */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { url, events } = body as { url?: string; events?: string[] };

  if (!url || !url.startsWith('https://')) {
    return NextResponse.json({ error: 'URL must start with https://' }, { status: 400 });
  }
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: 'Select at least one event' }, { status: 400 });
  }
  const invalid = events.filter((e) => !ALLOWED_EVENTS.includes(e as WebhookEvent));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Unknown events: ${invalid.join(', ')}` }, { status: 400 });
  }

  const admin = await createServiceSupabase();
  const { data: coach } = await admin.from('coaches').select('org_id').eq('id', user.id).single();
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  // Generate a random 32-byte hex secret
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const { data, error } = await admin
    .from('webhooks')
    .insert({ org_id: coach.org_id, coach_id: user.id, url, events, secret })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ webhook: data }, { status: 201 });
}
