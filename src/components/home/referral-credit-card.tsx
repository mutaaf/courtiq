'use client';

// ─── Ticket 0074 — home-feed referral-credit card ──────────────────────────
//
// Fires when the GET /api/coach/referral-credit-status returns
// qualifiedCount >= 3 AND currentMilestone is non-null AND
// alreadyGranted is false. Two copy variants:
//
//   ONE (paid tier):  "<First1>, <First2>, and <First3> each ran a real
//                      practice with SportsIQ this month — your next
//                      month of Coach is on us ($X.XX credited)."
//   TWO (free tier):  same opener, then "your next 30 days of Coach is
//                      on us — upgrade to redeem."
//
// Voice contract (LESSONS#0023 / AGENTS.md): instructed positively.
// No "amazing" / "journey" / "elevate" / etc. Buttons read "See my
// next invoice" (paid → customer-portal) or "Redeem on Coach" (free →
// /settings/upgrade). The Got-it button consumes the unconsumed row.
//
// COPPA: the card NEVER renders the converted-coach surname, email,
// or any wider field. The status route returns only `qualifiedCoachFirstNames`
// (first-name only, capped at 3); the component renders that array
// verbatim with an Oxford-comma join.
//
// Tier posture: NO UpgradeGate. The card itself adapts to tier; the
// paid-tier coach sees the credit-applied posture, the free-tier
// coach sees the upgrade-to-redeem posture.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Gift, Receipt } from 'lucide-react';

export type ReferralCreditMilestoneKind =
  | 'qualified_3'
  | 'qualified_10'
  | 'qualified_25';

export type Tier = 'free' | 'coach' | 'pro_coach' | 'organization';

export interface ReferralCreditCardProps {
  qualifiedCount: number;
  qualifiedCoachFirstNames: string[];
  currentMilestone: ReferralCreditMilestoneKind | null;
  pendingCreditCents: number;
  alreadyGranted: boolean;
  tier: Tier;
  onConsume: () => void;
  onApply?: () => void;
  isConsuming?: boolean;
  isApplying?: boolean;
}

/** Format cents as a US dollar amount. 999 → $9.99. */
function formatCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const rem = cents % 100;
  return `$${whole}.${rem.toString().padStart(2, '0')}`;
}

/** Oxford-comma join of three first names. */
function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const head = names.slice(0, -1).join(', ');
  const tail = names[names.length - 1];
  return `${head}, and ${tail}`;
}

/** Pure presentational card. Renders nothing when qualifiedCount < 3,
 *  currentMilestone is null, or alreadyGranted is true. */
export function ReferralCreditCard(props: ReferralCreditCardProps) {
  const {
    qualifiedCount,
    qualifiedCoachFirstNames,
    currentMilestone,
    pendingCreditCents,
    alreadyGranted,
    tier,
    onConsume,
    isConsuming,
  } = props;

  if (alreadyGranted) return null;
  if (qualifiedCount < 3) return null;
  if (!currentMilestone) return null;
  if (qualifiedCoachFirstNames.length === 0) return null;

  const amount = formatCents(pendingCreditCents);
  const namesJoined = joinNames(qualifiedCoachFirstNames.slice(0, 3));
  const isPaid = tier !== 'free';

  // Variant ONE (paid tier).
  const paidLine =
    `${namesJoined} each ran a real practice with SportsIQ this month — ` +
    `your next month of Coach is on us (${amount} credited).`;
  // Variant TWO (free tier).
  const freeLine =
    `${namesJoined} each ran a real practice with SportsIQ this month — ` +
    `your next 30 days of Coach is on us. Upgrade to redeem.`;

  return (
    <div
      data-testid="referral-credit-card"
      className="mb-4 rounded-xl border border-orange-500/30 bg-zinc-900 p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/10">
          <Gift className="h-4 w-4 text-orange-500" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
            {isPaid ? 'A free month is on its way' : 'A free month is waiting'}
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-100 leading-snug">
            {isPaid ? paidLine : freeLine}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isPaid ? (
              <button
                type="button"
                data-testid="referral-credit-card-invoice-button"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/stripe/portal', { method: 'POST' });
                    if (res.ok) {
                      const body = (await res.json()) as { url?: string };
                      if (body.url && typeof window !== 'undefined') {
                        window.location.assign(body.url);
                      }
                    }
                  } catch {
                    // Best-effort — never throw on the home screen.
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
              >
                <Receipt className="h-3 w-3" aria-hidden="true" />
                See my next invoice
              </button>
            ) : (
              <Link
                href="/settings/upgrade"
                data-testid="referral-credit-card-redeem-link"
                className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
              >
                Redeem on Coach
              </Link>
            )}
            <button
              type="button"
              data-testid="referral-credit-card-got-it"
              onClick={onConsume}
              disabled={!!isConsuming}
              className="inline-flex items-center rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Container that fetches the status payload, applies the credit
 *  (paid path) or stamps the pending grant (free path), and handles
 *  the consume POST.
 *
 *  The /home page mounts THIS section; it does the GET, calls the
 *  apply POST exactly once on FIRST mount when there's an eligible
 *  unconsumed milestone, and optimistically clears the local cache
 *  on consume. */
export function ReferralCreditSection({
  tier,
}: {
  tier: Tier;
}) {
  const queryClient = useQueryClient();
  const [isConsuming, setIsConsuming] = useState(false);

  const { data } = useQuery({
    queryKey: ['referral-credit-status'],
    staleTime: 60 * 1000,
    retry: false,
    queryFn: async (): Promise<{
      qualifiedCount: number;
      qualifiedCoachFirstNames: string[];
      currentMilestone: ReferralCreditMilestoneKind | null;
      pendingCreditCents: number;
      alreadyGranted: boolean;
    }> => {
      const res = await fetch('/api/coach/referral-credit-status');
      if (!res.ok) {
        return {
          qualifiedCount: 0,
          qualifiedCoachFirstNames: [],
          currentMilestone: null,
          pendingCreditCents: 0,
          alreadyGranted: false,
        };
      }
      return (await res.json()) as {
        qualifiedCount: number;
        qualifiedCoachFirstNames: string[];
        currentMilestone: ReferralCreditMilestoneKind | null;
        pendingCreditCents: number;
        alreadyGranted: boolean;
      };
    },
  });

  if (!data) return null;
  if (data.alreadyGranted) return null;
  if (data.qualifiedCount < 3 || !data.currentMilestone) return null;

  async function handleConsume() {
    if (isConsuming) return;
    setIsConsuming(true);
    try {
      // Fire the apply route first (idempotent — server returns
      // already:true when the grant exists), THEN the consume stamp.
      await fetch('/api/billing/apply-referral-credit', { method: 'POST' }).catch(
        () => {},
      );
      await fetch('/api/coach/referral-credit-status/consume', { method: 'POST' });
      queryClient.setQueryData(['referral-credit-status'], {
        qualifiedCount: data?.qualifiedCount ?? 0,
        qualifiedCoachFirstNames: data?.qualifiedCoachFirstNames ?? [],
        currentMilestone: data?.currentMilestone ?? null,
        pendingCreditCents: data?.pendingCreditCents ?? 0,
        alreadyGranted: true,
      });
    } catch {
      // Best-effort — never throw on the home screen.
    } finally {
      setIsConsuming(false);
    }
  }

  return (
    <ReferralCreditCard
      qualifiedCount={data.qualifiedCount}
      qualifiedCoachFirstNames={data.qualifiedCoachFirstNames}
      currentMilestone={data.currentMilestone}
      pendingCreditCents={data.pendingCreditCents}
      alreadyGranted={data.alreadyGranted}
      tier={tier}
      onConsume={handleConsume}
      isConsuming={isConsuming}
    />
  );
}
