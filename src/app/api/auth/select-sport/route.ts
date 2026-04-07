import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sportSlug } = await request.json();
  if (!sportSlug) return NextResponse.json({ error: 'sportSlug required' }, { status: 400 });

  const admin = await createServiceSupabase();

  const { data: coach } = await admin.from('coaches').select('org_id').eq('id', user.id).single();
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  const { data: sport } = await admin.from('sports').select('id').eq('slug', sportSlug).single();
  if (!sport) return NextResponse.json({ error: 'Sport not found' }, { status: 404 });

  await admin.from('organizations').update({
    sport_config: { default_sport_id: sport.id, default_sport_slug: sportSlug },
  }).eq('id', coach.org_id);

  return NextResponse.json({ success: true, sportId: sport.id });
}
