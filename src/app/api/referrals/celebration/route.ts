// Ticket 0047 — GET /api/referrals/celebration.
//
// Returns the inviter's celebration payload:
//   { show, message, currentCount, latestFirstName }
//
// The home card fires only when show:true; the seen-POST companion route
// advances the per-coach last_seen_referral_count bookmark on view so the
// card auto-dismisses until the next conversion.
//
// Privacy: the response NEVER returns the referred coach's email, full
// name, id, or any non-first-name field. The first name is split from
// `full_name` here and the helper trims again defensively.

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { makeReferralCode } from '@/lib/referral-code';
import {
  referralCelebrationFor,
  extractFirstToken,
} from '@/lib/referral-celebration-utils';

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createServiceSupabase();

  // 1) The caller's own row — the source of their referral code (lazy via
  // preferences.referral_code or computed from id) AND their last-seen
  // bookmark. We do NOT lazily persist the code here; the existing
  // /api/referrals GET handles that. We compute it locally if missing so
  // a coach who has never visited /api/referrals still gets a correct
  // count here. The algorithm is deterministic (makeReferralCode), so the
  // counted code matches the one the share surfaces produced.
  const { data: caller } = await admin
    .from('coaches')
    .select('preferences, last_seen_referral_count')
    .eq('id', user.id)
    .maybeSingle();

  const prefs = ((caller?.preferences as Record<string, unknown> | null) ?? {});
  const code =
    typeof prefs.referral_code === 'string' && prefs.referral_code.length > 0
      ? (prefs.referral_code as string)
      : makeReferralCode(user.id);
  const lastSeenCount =
    typeof caller?.last_seen_referral_count === 'number'
      ? caller.last_seen_referral_count
      : 0;

  // 2) Count coaches whose preferences.referred_by_code matches the caller's
  // code. Scoped, service-role; returns just a count, no minor data.
  const { count } = await admin
    .from('coaches')
    .select('id', { count: 'exact', head: true })
    .eq('preferences->>referred_by_code', code);
  const currentCount = count ?? 0;

  // 3) The most-recent referred coach's first name. ORDER BY created_at DESC
  // LIMIT 1; ONLY `full_name` is selected — never email, role, id, or any
  // wider field. The helper trims this to the first token before rendering.
  const { data: latest } = await admin
    .from('coaches')
    .select('full_name, created_at')
    .eq('preferences->>referred_by_code', code)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestFirstName = extractFirstToken(
    (latest as { full_name?: string | null } | null)?.full_name ?? null,
  );
  const latestForHelper =
    latest && latestFirstName
      ? {
          coach_first_name: latestFirstName,
          joined_at: (latest as { created_at: string }).created_at,
        }
      : null;

  const { show, message } = referralCelebrationFor({
    currentCount,
    lastSeenCount,
    latestReferral: latestForHelper,
  });

  // Payload allow-list — explicit shape, no field bleed.
  return NextResponse.json({
    show,
    message,
    currentCount,
    latestFirstName: latestFirstName || null,
  });
}
