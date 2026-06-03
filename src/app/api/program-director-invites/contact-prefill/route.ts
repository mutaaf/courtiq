import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { maskDirectorEmail } from '@/lib/director-invite-utils';

// GET /api/program-director-invites/contact-prefill — the pre-fill surface
// for the new section beneath the 0057 weekly-pulse share sheet's
// Copy-link button (ticket 0065). Returns the caller's MOST-RECENT
// `coach_director_contacts` row with the email MASKED, or
// `hasContact:false` when the caller has no contacts.
//
// CRITICAL: the raw email is NEVER returned in any response shape. The
// share-sheet shows the masked email as visual confirmation that "yes,
// you have a contact already"; the coach re-types the address on the
// form. This is the COPPA + privacy posture (the raw email is stored on
// the row so the next invite can re-send, but never round-trips to the
// client).
//
// AUTHED — the caller is implicit (auth.getUser()). The route reads only
// the caller's own contacts. No cross-coach leakage by construction.
//
// LESSONS#0036 — explicit `.select()` allow-list so a future column
// widening on the table never accidentally widens the response.

export async function GET() {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServiceSupabase();

  // Explicit allow-list — director_email IS read here so the route can
  // mask it before returning. The raw value never crosses the response
  // boundary (see the mask + the explicit response shape below).
  const { data: contact } = await supabase
    .from('coach_director_contacts')
    .select('id, director_first_name, director_email, last_invited_at, invite_count')
    .eq('coach_id', user.id)
    .order('last_invited_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json({ hasContact: false }, { status: 200 });
  }

  return NextResponse.json(
    {
      hasContact: true,
      directorFirstName: contact.director_first_name,
      directorEmailMasked: maskDirectorEmail(contact.director_email),
    },
    { status: 200 },
  );
}
