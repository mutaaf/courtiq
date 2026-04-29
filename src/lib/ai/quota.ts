/**
 * Monthly AI quota enforcement, factored out of callAI so endpoints that
 * call AI providers directly (e.g. /api/ai/import-roster does its own
 * vision-API multipart request) can enforce the same limits.
 *
 * Counts successful ai_interactions in the current calendar month for the
 * coach and rejects if they're over the tier-based cap.
 */

import { TierLimitError } from '@/lib/rate-limit';
import { TIER_LIMITS, type Tier } from '@/lib/tier';

/**
 * Throws TierLimitError when the coach's org has hit the monthly AI cap.
 * No-ops for paid tiers (their cap is effectively infinite).
 *
 * @param admin  Service-role Supabase client.
 * @param coachId  The coach making the request.
 */
export async function enforceAIQuota(admin: any, coachId: string): Promise<void> {
  // Resolve org tier
  const { data: coach } = await admin
    .from('coaches')
    .select('org_id, organizations(tier)')
    .eq('id', coachId)
    .single();
  if (!coach) return; // Auth check should have caught this earlier

  const orgTier = ((coach as any).organizations?.tier || 'free') as Tier;
  const monthlyLimit = TIER_LIMITS[orgTier].maxAICallsPerMonth;
  if (monthlyLimit >= 999_999) return; // Effectively unlimited

  // Count successful interactions this calendar month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count } = await admin
    .from('ai_interactions')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
    .eq('status', 'success')
    .gte('created_at', monthStart.toISOString());

  if ((count ?? 0) >= monthlyLimit) {
    throw new TierLimitError(orgTier, monthlyLimit);
  }
}

/**
 * Read-only quota status — used by the dashboard "X / Y this month" indicator.
 * Returns null when the org is on an unlimited plan.
 */
export async function getAIQuotaStatus(
  admin: any,
  coachId: string,
): Promise<{ used: number; limit: number; tier: Tier } | null> {
  const { data: coach } = await admin
    .from('coaches')
    .select('organizations(tier)')
    .eq('id', coachId)
    .single();
  const tier = ((coach as any)?.organizations?.tier || 'free') as Tier;
  const limit = TIER_LIMITS[tier].maxAICallsPerMonth;
  if (limit >= 999_999) return null;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count } = await admin
    .from('ai_interactions')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
    .eq('status', 'success')
    .gte('created_at', monthStart.toISOString());

  return { used: count ?? 0, limit, tier };
}
