import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { getAIQuotaStatus } from '@/lib/ai/quota';

/**
 * GET /api/ai/usage — read-only AI quota meter for the Capture surface (ticket 0008).
 *
 * Reports how many of the free tier's monthly AI calls remain so a coach sees the
 * wall coming instead of hitting it mid-practice. This is reporting only — the cap
 * is enforced inside callAI() via enforceAIQuota; nothing here gates or blocks.
 *
 * Auth via the cookie-scoped server client (401 with no DB read if absent), then
 * the count is computed by the existing getAIQuotaStatus() against a service-role
 * client. Paid/unlimited tiers get { unlimited: true, tier } and never see a meter.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const status = await getAIQuotaStatus(admin, user.id);

  // null === unlimited plan: paid tiers must not see a meter.
  if (!status) {
    const { data: coach } = await admin
      .from('coaches')
      .select('organizations(tier)')
      .eq('id', user.id)
      .single();
    const tier = (coach as any)?.organizations?.tier || 'free';
    return NextResponse.json({ unlimited: true, tier });
  }

  return NextResponse.json({
    used: status.used,
    limit: status.limit,
    tier: status.tier,
    remaining: Math.max(0, status.limit - status.used),
  });
}
