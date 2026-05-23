import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { fullName, referredByCode, org: orgSlug } = body;
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

  // Program staff-invite path (ticket 0024): when signup carries a valid `org`
  // slug (the org-landing CTA deep-links to /signup?org=<slug>), attach the new
  // coach to that EXISTING organization instead of minting a fresh solo org — so
  // a director's whole staff lands in one shared program. An unknown/invalid
  // slug falls back to today's default (a new solo org); it is never an error.
  // This is independent of the `ref` referral path below — both may be present.
  let org: { id: string } | null = null;
  let joinedExistingOrg = false;
  if (orgSlug && typeof orgSlug === 'string') {
    const { data: existingOrg } = await adminSupabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single();
    if (existingOrg?.id) {
      org = { id: existingOrg.id };
      joinedExistingOrg = true;
    }
  }

  // Default path: no (valid) org slug → create the coach's own organization.
  if (!org) {
    const { data: newOrg, error: orgError } = await adminSupabase
      .from('organizations')
      .insert({
        name: `${name}'s Organization`,
        slug: name.toLowerCase().replace(/[^\w-]/g, '-').replace(/-+/g, '-') + '-' + Date.now().toString(36),
      })
      .select()
      .single();

    if (orgError || !newOrg) {
      return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
    }
    org = { id: newOrg.id };
  }

  // Create coach (store referral source in preferences if present)
  const initialPrefs: Record<string, string> = {};
  if (referredByCode && typeof referredByCode === 'string') {
    initialPrefs.referred_by_code = referredByCode.toUpperCase().slice(0, 10);
  }

  // A coach minting their own org is its admin; a coach joining an existing
  // program via the staff invite (ticket 0024) joins as a regular coach —
  // promoting to admin / assigning teams stays a separate director action.
  const { error: coachError } = await adminSupabase.from('coaches').insert({
    id: user.id,
    org_id: org.id,
    full_name: name,
    email: user.email!,
    role: joinedExistingOrg ? 'coach' : 'admin',
    avatar_url: user.user_metadata?.avatar_url,
    preferences: initialPrefs,
  });

  if (coachError) {
    return NextResponse.json({ error: 'Failed to create coach record' }, { status: 500 });
  }

  return NextResponse.json({ success: true, orgId: org.id });
}
