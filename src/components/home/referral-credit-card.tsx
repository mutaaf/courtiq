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
import { buildPendingNudgeMessage } from '@/lib/referral-credit-utils';

export type ReferralCreditMilestoneKind =
  | 'qualified_3'
  | 'qualified_10'
  | 'qualified_25';

export type Tier = 'free' | 'coach' | 'pro_coach' | 'organization';

/** Ticket 0085 — per-pending-coach summary the card renders on the
 *  "On deck" sub-section. Shape mirrors the GET status route's
 *  `pendingReferrals` array. */
export interface PendingReferralProp {
  firstName: string;
  signedUpAt: string;
  needsToQualify: string;
}

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
  /** Ticket 0085 — signed-up-but-not-yet-qualifying converted coaches.
   *  Optional so 0074 callers that have not yet been updated stay
   *  byte-identical (LESSONS#0103 — additive widening). */
  pendingReferrals?: PendingReferralProp[];
  /** Ticket 0085 — count of MORE qualifying coaches needed to cross
   *  the next milestone. */
  nextMilestoneIn?: number;
  /** Ticket 0085 — the literal milestone-enum key for the next
   *  milestone, or null when the inviter has crossed qualified_25. */
  nextMilestoneKind?: ReferralCreditMilestoneKind | null;
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

/** Format the "On deck" progress line. The phrasing flexes between
 *  "One more qualifying coach" (nextMilestoneIn=1) and "N more
 *  qualifying coaches" so the inviter sees the exact gap. */
function pendingProgressLine(
  nextMilestoneIn: number,
  amount: string,
): string {
  const stem =
    nextMilestoneIn === 1
      ? 'One more qualifying coach'
      : `${nextMilestoneIn} more qualifying coaches`;
  return `${stem} and your next month is free too — ${amount}.`;
}

/** The on-deck names line. Mirrors the 0074 card's Oxford-comma posture
 *  (LESSONS#0023) for consistency between the celebration body and the
 *  forward-looking sub-section. */
function pendingNamesLine(firstNames: string[]): string {
  if (firstNames.length === 0) return '';
  if (firstNames.length === 1) return firstNames[0];
  if (firstNames.length === 2) return `${firstNames[0]} and ${firstNames[1]}`;
  const head = firstNames.slice(0, -1).join(', ');
  const tail = firstNames[firstNames.length - 1];
  return `${head}, and ${tail}`;
}

/** Ticket 0085 — "On deck" sub-section. Renders the pending coaches +
 *  the next-milestone progress line + a "Text them a nudge" button
 *  that forwards a respectful share-template body to the native share
 *  sheet (with a no-op fall-through when the browser doesn't support
 *  navigator.share — the share posture mirrors 0015/0064). */
function PendingSubSection({
  pendingReferrals,
  nextMilestoneIn,
  amount,
  isFreeInviter,
}: {
  pendingReferrals: PendingReferralProp[];
  nextMilestoneIn: number;
  amount: string;
  isFreeInviter: boolean;
}) {
  if (pendingReferrals.length === 0) return null;
  const firstNames = pendingReferrals.map((p) => p.firstName);
  const names = pendingNamesLine(firstNames);
  const namesPlural = firstNames.length > 1;
  // The qualification line uses the bar string the route handed back
  // (every pending row carries the same line — pick the first).
  const needs = pendingReferrals[0].needsToQualify;
  // Render: "Coach James and Coach Lin signed up but [needs to ship …]."
  // The bar string is uniform; the prefix flexes between singular /
  // plural so the line reads naturally.
  const qualificationLine = namesPlural
    ? `${names} signed up but haven't crossed the bar yet — each ${needs}.`
    : `${names} signed up but hasn't crossed the bar yet — ${needs}.`;
  const progress = pendingProgressLine(nextMilestoneIn, amount);
  const nudgeBody = buildPendingNudgeMessage({
    pendingFirstNames: firstNames,
    isFreeInviter,
  });

  async function handleNudge() {
    try {
      // navigator.share is the headline path on iOS Safari + Chrome
      // Android (the volunteer-coach surfaces). When unavailable
      // (older browsers / desktop), fall through to clipboard so the
      // body is still copy-pastable into the inviter's existing
      // texts thread (the loop's signature posture — never a new
      // channel; LESSONS#0011).
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function'
      ) {
        await navigator.share({ text: nudgeBody });
        return;
      }
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.clipboard?.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(nudgeBody);
      }
    } catch {
      // Best-effort — never throw on the home screen.
    }
  }

  return (
    <div
      data-testid="referral-credit-pending-section"
      className="mt-3 border-t border-zinc-800 pt-3"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        On deck
      </p>
      <p className="mt-1 text-sm text-zinc-200 leading-snug">
        {qualificationLine}
      </p>
      <p className="mt-1 text-sm text-zinc-300 leading-snug">{progress}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="referral-credit-pending-nudge-button"
          data-share-url=""
          onClick={handleNudge}
          className="inline-flex items-center rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-xs font-semibold text-orange-300 hover:bg-orange-500/20"
        >
          Text them a nudge
        </button>
      </div>
    </div>
  );
}

/** Pure presentational card. The 0074 BODY (celebration of the just-
 *  crossed milestone) renders only when qualifiedCount >= 3 AND
 *  currentMilestone is non-null AND alreadyGranted is false. The 0085
 *  "On deck" sub-section is independently gated and can render even
 *  when the 0074 body does not (e.g. qualifiedCount = 2 with two
 *  pending coaches). */
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
    pendingReferrals,
    nextMilestoneIn,
    nextMilestoneKind,
  } = props;

  const amount = formatCents(pendingCreditCents);
  const isPaid = tier !== 'free';

  // 0074 body gate — the celebration line + the See-my-next-invoice /
  // Redeem-on-Coach + Got-it controls.
  const showCelebrationBody =
    !alreadyGranted &&
    qualifiedCount >= 3 &&
    !!currentMilestone &&
    qualifiedCoachFirstNames.length > 0;

  // 0085 sub-section gate — at least one pending coach AND there is a
  // next milestone to stack toward (auto-hide once the inviter has
  // crossed qualified_25 per the AC).
  const showPendingSection =
    !!pendingReferrals &&
    pendingReferrals.length > 0 &&
    !!nextMilestoneKind;

  // If neither pane wants to render, render nothing (matches the
  // 0074-baseline absent posture).
  if (!showCelebrationBody && !showPendingSection) return null;

  const namesJoined = joinNames(qualifiedCoachFirstNames.slice(0, 3));
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
          {showCelebrationBody ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                {isPaid
                  ? 'A free month is on its way'
                  : 'A free month is waiting'}
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
                        const res = await fetch('/api/stripe/portal', {
                          method: 'POST',
                        });
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
            </>
          ) : null}
          {showPendingSection ? (
            <PendingSubSection
              pendingReferrals={pendingReferrals!}
              nextMilestoneIn={nextMilestoneIn ?? 0}
              amount={amount}
              isFreeInviter={!isPaid}
            />
          ) : null}
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

  interface StatusPayload {
    qualifiedCount: number;
    qualifiedCoachFirstNames: string[];
    currentMilestone: ReferralCreditMilestoneKind | null;
    pendingCreditCents: number;
    alreadyGranted: boolean;
    // 0085 additive fields — optional on the type so a stale cache
    // entry from before this PR shipped does not crash the render
    // (LESSONS#0103).
    pendingReferrals?: PendingReferralProp[];
    nextMilestoneIn?: number;
    nextMilestoneKind?: ReferralCreditMilestoneKind | null;
  }

  const { data } = useQuery({
    queryKey: ['referral-credit-status'],
    staleTime: 60 * 1000,
    retry: false,
    queryFn: async (): Promise<StatusPayload> => {
      const res = await fetch('/api/coach/referral-credit-status');
      if (!res.ok) {
        return {
          qualifiedCount: 0,
          qualifiedCoachFirstNames: [],
          currentMilestone: null,
          pendingCreditCents: 0,
          alreadyGranted: false,
          pendingReferrals: [],
          nextMilestoneIn: 0,
          nextMilestoneKind: null,
        };
      }
      return (await res.json()) as StatusPayload;
    },
  });

  if (!data) return null;
  // Render-gate: at least ONE of the two panes must want to show.
  // 0074 celebration body OR 0085 on-deck sub-section.
  const hasCelebration =
    !data.alreadyGranted &&
    data.qualifiedCount >= 3 &&
    !!data.currentMilestone;
  const hasPending =
    !!data.pendingReferrals &&
    data.pendingReferrals.length > 0 &&
    !!data.nextMilestoneKind;
  if (!hasCelebration && !hasPending) return null;

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
        // Preserve the 0085 fields on the optimistic update so the
        // pending sub-section keeps rendering after Got-it (the
        // celebration body hides but the on-deck stack does not).
        pendingReferrals: data?.pendingReferrals ?? [],
        nextMilestoneIn: data?.nextMilestoneIn ?? 0,
        nextMilestoneKind: data?.nextMilestoneKind ?? null,
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
      pendingReferrals={data.pendingReferrals ?? []}
      nextMilestoneIn={data.nextMilestoneIn ?? 0}
      nextMilestoneKind={data.nextMilestoneKind ?? null}
    />
  );
}
