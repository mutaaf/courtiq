import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { fullName, referredByCode } = body;
  const name = fullName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Coach';

  const adminSupabase = await createServiceSupabase();

  // Check if coach already exists
  const { data: existing } = await adminSupabase
    .from('coaches')
    .select('id')
    .eq('id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ message: 'Already set up' });
  }

  // Create org
  const { data: org, error: orgError } = await adminSupabase
    .from('organizations')
    .insert({
      name: `${name}'s Organization`,
      slug: name.toLowerCase().replace(/[^\w-]/g, '-').replace(/-+/g, '-') + '-' + Date.now().toString(36),
    })
    .select()
    .single();

  if (orgError || !org) {
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }

  // Create coach (store referral source in preferences if present)
  const initialPrefs: Record<string, string> = {};
  if (referredByCode && typeof referredByCode === 'string') {
    initialPrefs.referred_by_code = referredByCode.toUpperCase().slice(0, 10);
  }

  const { error: coachError } = await adminSupabase.from('coaches').insert({
    id: user.id,
    org_id: org.id,
    full_name: name,
    email: user.email!,
    role: 'admin',
    avatar_url: user.user_metadata?.avatar_url,
    preferences: initialPrefs,
  });

  if (coachError) {
    return NextResponse.json({ error: 'Failed to create coach record' }, { status: 500 });
  }

  return NextResponse.json({ success: true, orgId: org.id });
}
