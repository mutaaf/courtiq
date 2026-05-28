// Ticket 0047 — POST /api/referrals/celebration/seen.
//
// Advances the caller's coaches.last_seen_referral_count to their CURRENT
// referral count, recomputed server-side. NEVER trusts a client-supplied
// count (same pattern as LESSONS#0039: any field on the request body that
// could change the write is computed by the server instead). A re-POST is
// idempotent: the second call writes the same server-recomputed value.

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { makeReferralCode } from '@/lib/referral-code';

// The route signature takes a Request so Next's typegen accepts it; the body
// is deliberately NOT read for the bookmark value.
export async function POST(_request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createServiceSupabase();

  // 1) The caller's own row — only `preferences` is needed (referral_code).
  const { data: caller } = await admin
    .from('coaches')
    .select('preferences')
    .eq('id', user.id)
    .maybeSingle();

  const prefs = ((caller?.preferences as Record<string, unknown> | null) ?? {});
  const code =
    typeof prefs.referral_code === 'string' && prefs.referral_code.length > 0
      ? (prefs.referral_code as string)
      : makeReferralCode(user.id);

  // 2) Recompute the current count server-side (the body is ignored).
  const { count } = await admin
    .from('coaches')
    .select('id', { count: 'exact', head: true })
    .eq('preferences->>referred_by_code', code);
  const currentCount = count ?? 0;

  // 3) Write the bookmark — idempotent: a re-POST against the same state
  // produces the same value.
  const { error } = await admin
    .from('coaches')
    .update({ last_seen_referral_count: currentCount })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
