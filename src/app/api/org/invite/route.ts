import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET /api/org/invite — the program director's single org-scoped staff-invite
// link (ticket 0024). Returns ONE shareable link the director broadcasts in the
// staff group chat; a coach who follows it lands on the branded program page and
// signs up attached to the org (via /signup?org=<slug>).
//
// Returns ONLY { url }: the staff-invite link, or null when the caller has no
// org / the org has no slug (graceful — never an error). No coach list, no
// player data, no email, no name — data-minimization (ticket 0024 AC3/AC6).
//
// Authenticated: 401 with no DB read when unauthenticated. (Middleware treats
// /api/org/ as public for the public /api/org/[slug] page, so this route does
// its OWN auth check — the only correct place for it.)
export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  // Resolve the caller's org.
  const { data: coach } = await admin
    .from('coaches')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!coach?.org_id) {
    return NextResponse.json({ url: null });
  }

  // Look up the org's public slug.
  const { data: org } = await admin
    .from('organizations')
    .select('slug')
    .eq('id', coach.org_id)
    .single();

  if (!org?.slug) {
    return NextResponse.json({ url: null });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';
  return NextResponse.json({ url: `${base}/org/${org.slug}?invite=staff` });
}
