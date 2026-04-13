import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { WebhookEvent } from '@/types/database';
import { WEBHOOK_EVENTS } from '@/lib/webhooks';

const ALLOWED_EVENTS = WEBHOOK_EVENTS.map((e) => e.value) as WebhookEvent[];

/** PATCH /api/webhooks/[id] — toggle active or update events/url */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const admin = await createServiceSupabase();
  const { data: coach } = await admin.from('coaches').select('org_id').eq('id', user.id).single();
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  // Verify ownership (must belong to coach's org)
  const { data: existing } = await admin
    .from('webhooks')
    .select('id')
    .eq('id', id)
    .eq('org_id', coach.org_id)
    .single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('is_active' in body) updates.is_active = Boolean(body.is_active);
  if ('url' in body) {
    if (!body.url?.startsWith('https://')) {
      return NextResponse.json({ error: 'URL must start with https://' }, { status: 400 });
    }
    updates.url = body.url;
  }
  if ('events' in body) {
    const invalid = (body.events as string[]).filter((e) => !ALLOWED_EVENTS.includes(e as WebhookEvent));
    if (invalid.length > 0) return NextResponse.json({ error: `Unknown events: ${invalid.join(', ')}` }, { status: 400 });
    updates.events = body.events;
  }

  const { data, error } = await admin.from('webhooks').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ webhook: data });
}

/** DELETE /api/webhooks/[id] — remove a webhook */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const admin = await createServiceSupabase();
  const { data: coach } = await admin.from('coaches').select('org_id').eq('id', user.id).single();
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  const { error } = await admin
    .from('webhooks')
    .delete()
    .eq('id', id)
    .eq('org_id', coach.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
