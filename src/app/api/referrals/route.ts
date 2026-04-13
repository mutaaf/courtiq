import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Alphabet excludes visually confusing characters (0/O, 1/I/L)
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Deterministic 6-char code from the first 6 bytes of the user UUID */
function makeReferralCode(userId: string): string {
  const hex = userId.replace(/-/g, '');
  return Array.from({ length: 6 }, (_, i) => {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return CHARS[byte % CHARS.length];
  }).join('');
}

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
