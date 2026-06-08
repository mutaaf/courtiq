/**
 * POST /api/billing/apply-referral-credit — ticket 0074.
 *
 * Applies the inviter's referral credit for the current milestone if
 * not already granted. Behavior:
 *  - 401 on unauthed.
 *  - 200 { eligible: false } when the caller has fewer than 3 qualified.
 *  - 200 { already: true } when the milestone row already exists.
 *  - On a paid-tier caller with a stripe_customer_id: calls the lazy
 *    getStripe().customers.createBalanceTransaction with a NEGATIVE
 *    amount (per Stripe's customer-balance contract; LESSONS#0044)
 *    and writes the referral_credit_grants row.
 *  - On a free-tier caller: writes a pending row
 *    (stripe_customer_balance_txn_id = NULL) — the "$X of Coach is on
 *    us — upgrade to redeem" shape (0035 inline-upsell posture).
 *  - On a Stripe failure: 500 and NO row written (LESSONS#0044
 *    billing immutability — the grant only persists if the Stripe
 *    credit persists).
 *
 * AGENTS.md — Stripe init through `getStripe()` (lazy factory; never
 * `new Stripe()` at module top).
 *
 * COPPA contract (LESSONS#0036): every read is `.select()`-allow-listed.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import { makeReferralCode } from '@/lib/referral-code';
import {
  countQualifiedReferrals,
  milestoneForCount,
  QUALIFYING_ARTIFACT_TYPES,
} from '@/lib/referral-credit-utils';

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
      // free + coach + null → coach-tier amount.
      return COACH_TIER_MONTHLY_CENTS;
  }
}

const PAID_TIERS = new Set(['coach', 'pro_coach', 'organization']);

export async function POST(_request: Request) {
  void _request;
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createServiceSupabase();

  try {
    // 1) Caller coach → org_id.
    const { data: caller } = await admin
      .from('coaches')
      .select('id, org_id')
      .eq('id', user.id)
      .maybeSingle();
    const orgId = (caller as { org_id?: string } | null)?.org_id ?? null;

    // 2) Org row → tier + stripe_customer_id.
    const { data: org } = await admin
      .from('organizations')
      .select('tier, stripe_customer_id')
      .eq('id', orgId ?? '')
      .maybeSingle();
    const tier = ((org as { tier?: string } | null)?.tier ?? 'free') as string;
    const customerId =
      ((org as { stripe_customer_id?: string | null } | null)?.stripe_customer_id) ?? null;

    // 3) Referred coaches by referral code.
    const code = makeReferralCode(user.id);
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

    // 4) Per-referred-coach plan + observation counts.
    const converted: Array<{
      id: string;
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
        shipped_artifact_count: shippedCount ?? 0,
        head_coached_observation_count: obsCount ?? 0,
      });
    }

    // 5) Compute the qualified count + ids.
    const { count: qualifiedCount, qualifiedCoachIds } = countQualifiedReferrals({
      inviterCoachId: user.id,
      convertedCoachRows: converted,
      nowMs: Date.now(),
    });

    const currentMilestone = milestoneForCount(qualifiedCount);
    if (!currentMilestone) {
      return NextResponse.json({ eligible: false });
    }

    // 6) Already-granted check.
    const { data: grants } = await admin
      .from('referral_credit_grants')
      .select('milestone_kind')
      .eq('inviter_coach_id', user.id);
    const grantRows = (grants ?? []) as Array<{ milestone_kind: string }>;
    if (grantRows.some((g) => g.milestone_kind === currentMilestone)) {
      return NextResponse.json({ already: true });
    }

    const creditAmountCents = tierMonthlyCents(tier);
    const isPaid = PAID_TIERS.has(tier) && Boolean(customerId);

    if (!isPaid) {
      // Free-tier path: write the pending row with NULL Stripe txn id
      // and return the pending shape. The home-card surfaces "upgrade
      // to redeem" (0035 inline-upsell).
      await admin.from('referral_credit_grants').insert({
        inviter_coach_id: user.id,
        milestone_kind: currentMilestone,
        qualified_referral_coach_ids: qualifiedCoachIds,
        credit_amount_cents: creditAmountCents,
        credit_currency: 'usd',
        stripe_customer_balance_txn_id: null,
      });
      return NextResponse.json({
        pending: true,
        pendingUntilUpgrade: true,
        creditAmountCents,
      });
    }

    // 7) Paid-tier path: write the Stripe customer-balance credit
    // BEFORE persisting the grant row. Per LESSONS#0044 — the grant
    // row only persists when the Stripe credit persists, otherwise
    // we'd carry phantom credits the user never received.
    //
    // The Stripe call is a NEGATIVE amount on createBalanceTransaction
    // (a NEGATIVE balance is a CREDIT in Stripe semantics — it
    // reduces the next invoice).
    let txn: { id: string };
    try {
      txn = (await getStripe().customers.createBalanceTransaction(
        customerId as string,
        {
          amount: -creditAmountCents,
          currency: 'usd',
          description: `SportsIQ referral credit for ${currentMilestone}`,
        },
      )) as unknown as { id: string };
    } catch (err) {
      console.error('[billing/apply-referral-credit] Stripe error:', err);
      return NextResponse.json(
        { error: 'Failed to apply Stripe credit' },
        { status: 500 },
      );
    }

    await admin.from('referral_credit_grants').insert({
      inviter_coach_id: user.id,
      milestone_kind: currentMilestone,
      qualified_referral_coach_ids: qualifiedCoachIds,
      credit_amount_cents: creditAmountCents,
      credit_currency: 'usd',
      stripe_customer_balance_txn_id: txn.id,
    });

    return NextResponse.json({
      redeemed: true,
      stripeTxnId: txn.id,
      creditAmountCents,
    });
  } catch (error: unknown) {
    console.error('[billing/apply-referral-credit] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
