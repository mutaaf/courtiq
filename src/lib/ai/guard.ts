/**
 * Shared auth + tier guard for AI route handlers.
 *
 * Without this, every /api/ai/* endpoint either rolls its own check
 * (inconsistent, easy to forget) or relies on client-side <UpgradeGate>
 * which is bypassable. The guard:
 *
 *  - rejects unauthenticated requests (401)
 *  - looks up the coach's org tier
 *  - checks canAccess(tier, feature) and rejects with an upgrade-friendly
 *    message + 402 when the tier doesn't include the feature
 *  - returns { user, coach, orgTier } on success so the handler can use
 *    them without a second roundtrip
 *
 * Usage:
 *   const guard = await requireAIAccess('plans');
 *   if ('response' in guard) return guard.response;
 *   const { user, coach, orgTier, admin } = guard;
 */

import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { canAccess, type Tier } from '@/lib/tier';

interface GuardSuccess {
  user: User;
  coach: { id: string; org_id: string };
  orgTier: Tier;
  /** Service-role client; reuse rather than calling createServiceSupabase again. */
  admin: Awaited<ReturnType<typeof createServiceSupabase>>;
}

interface GuardFailure {
  response: NextResponse;
}

export type GuardResult = GuardSuccess | GuardFailure;

export async function requireAIAccess(feature: string): Promise<GuardResult> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const admin = await createServiceSupabase();

  const { data: coach } = await admin
    .from('coaches')
    .select('id, org_id, organizations(tier)')
    .eq('id', user.id)
    .single();

  if (!coach) {
    return { response: NextResponse.json({ error: 'Coach not found' }, { status: 404 }) };
  }

  const orgTier = (((coach as any).organizations?.tier) || 'free') as Tier;

  if (!canAccess(orgTier, feature)) {
    return {
      response: NextResponse.json(
        {
          error: `This feature requires a higher plan. Upgrade to use it.`,
          feature,
          currentTier: orgTier,
          upgrade: true,
        },
        { status: 402 },
      ),
    };
  }

  return {
    user,
    coach: { id: coach.id, org_id: coach.org_id },
    orgTier,
    admin,
  };
}
