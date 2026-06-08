/**
 * GET /api/coach/referral-credit-status — ticket 0074.
 *
 * Returns the caller coach's referral-credit state:
 *   {
 *     qualifiedCount: number,
 *     qualifiedCoachFirstNames: string[],     // most-recent 3, first-name only
 *     currentMilestone: 'qualified_3' | 'qualified_10' | 'qualified_25' | null,
 *     pendingCreditCents: number,
 *     alreadyGranted: boolean
 *   }
 *
 * The home-page <ReferralCreditCard /> renders when qualifiedCount >= 3
 * AND currentMilestone is not null AND alreadyGranted is false. The
 * card itself names the three converted coaches by FIRST NAME ONLY
 * (same consent posture as 0047) and shows the dollar amount that
 * will be / has been credited.
 *
 * COPPA contract (LESSONS#0036):
 *  - `.select()` allow-lists on every read. NEVER reads parent_email,
 *    parent_phone, date_of_birth, jersey_number, medical_notes.
 *  - Names are split on a LITERAL SPACE (LESSONS#0061) to drop the
 *    surname; the response field is `qualifiedCoachFirstNames`.
 *
 * Tier posture: NO tier gate. A free-tier inviter with 3 qualified
 * referrals gets the same status payload — the redemption is gated on
 * the apply route (Stripe customer balance requires a subscription).
 *
 * Auth: createServerSupabase for auth, createServiceSupabase for the
 * cross-coach reads (LESSONS#0049 — service role is the right
 * boundary for a coach reading aggregate counts on rows they don't
 * own).
 *
 * Per LESSONS#0096 — the JSONB selector for the referral graph is
 * `preferences->>referred_by_code` (the exact selector used by
 * /api/referrals/celebration). Read once at pickup and reuse.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { makeReferralCode } from '@/lib/referral-code';
import {
  countQualifiedReferrals,
  extractFirstName,
  milestoneForCount,
  QUALIFYING_ARTIFACT_TYPES,
} from '@/lib/referral-credit-utils';

/** The pending-credit-cents value the GET route returns is the COACH
 *  monthly price in cents (the per-tier value the apply route writes).
 *  Hard-coded to align with the 0035 inline-upsell posture (free-tier
 *  surfaces "$9.99 of Coach is on us — upgrade to redeem"), and the
 *  paid-tier coach + pro_coach + organization paths use the same
 *  default unless the org's tier maps to a higher value. */
const COACH_TIER_MONTHLY_CENTS = 999;
const PRO_COACH_TIER_MONTHLY_CENTS = 2499;
const ORG_TIER_MONTHLY_CENTS = 4999;

function tierMonthlyCents(tier: string | null | undefined): number {
  switch (tier) {
    case 'pro_coach':
      return PRO_COACH_TIER_MONTHLY_CENTS;
    case 'organization':
      return ORG_TIER_MONTHLY_CENTS;
    default:
      // free + coach + null → coach-tier amount (the inline-upsell
      // posture: "$9.99 credited" / "$9.99 of Coach is on us").
      return COACH_TIER_MONTHLY_CENTS;
  }
}

export async function GET() {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createServiceSupabase();

  try {
    const code = makeReferralCode(user.id);

    // 1) Pull every coach whose preferences.referred_by_code equals
    // the caller's deterministic code. Allow-list: id + full_name +
    // created_at (for the most-recent-3 ordering). NEVER reads
    // email, role, parent_email, DOB, etc.
    const { data: referredRaw } = await admin
      .from('coaches')
      .select('id, full_name, created_at')
      .eq('preferences->>referred_by_code', code)
      .order('created_at', { ascending: false });
    const referredRows = (referredRaw ?? []) as Array<{
      id: string;
      full_name: string | null;
      created_at: string | null;
    }>;

    // 2) For each referred coach, fan out into two count queries:
    //    plans (count of QUALIFYING_ARTIFACT_TYPES) + observations
    //    (count for that coach). The fan-out is sequential to keep
    //    the mock-queue contract simple for sibling tests; the
    //    cost is bounded by the number of referred coaches (in
    //    practice <100 for v1).
    const converted: Array<{
      id: string;
      full_name: string | null;
      created_at: string | null;
      shipped_artifact_count: number;
      head_coached_observation_count: number;
    }> = [];
    for (const r of referredRows) {
      const { count: shippedCount } = await admin
        .from('plans')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', r.id)
        .in('type', QUALIFYING_ARTIFACT_TYPES as unknown as string[]);
      const { count: obsCount } = await admin
        .from('observations')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', r.id);
      converted.push({
        id: r.id,
        full_name: r.full_name,
        created_at: r.created_at,
        shipped_artifact_count: shippedCount ?? 0,
        head_coached_observation_count: obsCount ?? 0,
      });
    }

    // 3) Compute the qualified count + ids via the pure helper.
    const { count: qualifiedCount, qualifiedCoachIds } = countQualifiedReferrals({
      inviterCoachId: user.id,
      convertedCoachRows: converted.map((c) => ({
        id: c.id,
        shipped_artifact_count: c.shipped_artifact_count,
        head_coached_observation_count: c.head_coached_observation_count,
      })),
      nowMs: Date.now(),
    });

    // 4) Resolve the most-recent 3 qualified first names. The
    // `referredRows` were ordered DESC by created_at, so the
    // first matching id in that order is the most recent.
    const qualifiedSet = new Set(qualifiedCoachIds);
    const qualifiedFirstNames: string[] = [];
    for (const r of referredRows) {
      if (qualifiedFirstNames.length >= 3) break;
      if (!qualifiedSet.has(r.id)) continue;
      const first = extractFirstName(r.full_name);
      if (!first) continue;
      qualifiedFirstNames.push(first);
    }

    // 5) Current milestone + already-granted check.
    const currentMilestone = milestoneForCount(qualifiedCount);
    let alreadyGranted = false;
    if (currentMilestone) {
      const { data: grants } = await admin
        .from('referral_credit_grants')
        .select('milestone_kind')
        .eq('inviter_coach_id', user.id);
      const grantRows = (grants ?? []) as Array<{ milestone_kind: string }>;
      alreadyGranted = grantRows.some(
        (g) => g.milestone_kind === currentMilestone,
      );
    }

    // 6) The pending credit cents is the tier-monthly amount for
    // the caller's org. We don't have the org tier on this route's
    // critical path; fall back to coach-monthly. The apply route is
    // where the real org-tier lookup happens (and it persists the
    // exact credit value).
    const pendingCreditCents = tierMonthlyCents('coach');

    return NextResponse.json({
      qualifiedCount,
      qualifiedCoachFirstNames: qualifiedFirstNames,
      currentMilestone,
      pendingCreditCents,
      alreadyGranted,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
