import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  // Verify user is admin
  const { data: coach } = await admin
    .from('coaches')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single();

  if (!coach || coach.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { orgId, tier } = await request.json();
  if (!orgId || !tier) {
    return NextResponse.json({ error: 'orgId and tier required' }, { status: 400 });
  }

  const validTiers = ['free', 'coach', 'pro_coach', 'organization'];
  if (!validTiers.includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }

  // Admin can only set tier for their own org
  if (orgId !== coach.org_id) {
    return NextResponse.json({ error: 'Can only modify your own organization' }, { status: 403 });
  }

  const { error: updateError } = await admin
    .from('organizations')
    .update({ tier })
    .eq('id', orgId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
