import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
// Shared with the public team-card GET route so both resolve identical codes
// (ticket 0010). Do not re-inline this algorithm.
import { makeReferralCode } from '@/lib/referral-code';

// GET /api/referrals — get or create caller's referral code + referral count
export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const { data: coach } = await admin
    .from('coaches')
    .select('id, preferences')
    .eq('id', user.id)
    .single();

  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  const prefs = (coach.preferences as Record<string, unknown>) ?? {};
  let code = (prefs.referral_code as string) ?? '';

  // Lazy-generate and persist the code on first request
  if (!code) {
    code = makeReferralCode(user.id);
    await admin
      .from('coaches')
      .update({ preferences: { ...prefs, referral_code: code } })
      .eq('id', user.id);
  }

  // Count coaches who signed up via this code
  const { count } = await admin
    .from('coaches')
    .select('id', { count: 'exact', head: true })
    .eq('preferences->>referred_by_code', code);

  const referralCount = count ?? 0;

  return NextResponse.json({
    code,
    referralCount,
    rewardEarned: referralCount >= 1,
  });
}
