'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  PaidCoachReceiptsNextMonthCopyKey,
  PaidCoachReceiptsSummary,
} from '@/lib/paid-coach-receipts';

// ─── Ticket 0089 — day-60 paid-coach receipts card ────────────────────────────
//
// Mounts UNDER the daily-focus card on /home. Renders ONLY when the
// GET /api/coach/paid-receipts route returns `eligible: true` AND the
// coach has not yet dismissed the card in the day-56-to-day-90 window.
//
// The voice is a receipt, not a sales surface. The card has a quiet
// zinc-500 stroke and NO orange accent — orange is reserved for ACTION
// surfaces (capture, publish, upgrade); this is a RECEIPT of work the
// platform has already done FOR the coach. There is NO primary CTA,
// NO upgrade button, NO renew link, NO "thank you" copy. The only
// affordance is a small "Got it" dismissor in the corner.
//
// Voice posture (LESSONS#0023): every rendered string instructs
// positively. The jsdoc here never embeds an AGENTS.md banned word
// verbatim — the component test scans the rendered text against the
// banned set + a surface-specific addition ("thank you", "appreciate",
// "we love", "incredible").
//
// COPPA: never renders a surname, player name, or any minor-data
// field — the route's `.select()` allow-list is the contract; this
// component renders whatever the helper returned (counters + program
// names only).
//
// Tier posture: server-gated to PAID coaches (subscription_status
// active / past_due / trialing AND tier in coach / pro_coach /
// organization). NO new tier feature key, NO <UpgradeGate> — the
// receipts card is a retention surface for already-paid coaches.

interface CardProps {
  /** The receipts payload, or null when the route returned
   *  eligible: false (window not open, churned, or already dismissed). */
  summary: PaidCoachReceiptsSummary | null;
}

// Next-month copy variants. Each one names a SHIPPED surface so the
// promise stays anchored to what the product actually delivers
// (per the AC's "the card promises only what the product actually
// delivers" posture).
const NEXT_MONTH_COPY: Record<PaidCoachReceiptsNextMonthCopyKey, string> = {
  month_3_arc_returning_players:
    'Month 3 is where the Arc starts naming returning players by their breakthrough weeks.',
  month_4_drill_canon_emergence:
    'Month 4 is where the drill canon emerges from the drills you keep coming back to.',
  month_5_program_arc_carrying:
    'Month 5 is where the program arc starts carrying last season’s work forward.',
};

// Compose an oxford-comma list from up to three program names.
function joinPrograms(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]}, and ${names[2]}`;
}

export function PaidCoachReceiptsCard({ summary }: CardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  if (!summary || !summary.eligible || dismissed) return null;

  const nextMonthLine = NEXT_MONTH_COPY[summary.nextMonthCopyKey];

  async function handleDismiss() {
    if (isDismissing) return;
    setIsDismissing(true);
    try {
      await fetch('/api/coach/paid-receipts/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch {
      // Best-effort: the route is idempotent on the UNIQUE
      // (coach_id, kind) constraint so a retry on the next /home open
      // is harmless. We hide the card locally regardless.
    } finally {
      setDismissed(true);
      setIsDismissing(false);
    }
  }

  // Counter lines — each one renders ONLY when the counter is > 0 OR
  // when the counter is the day count itself (which is always shown
  // as the headline). The card never names an unearned counter.
  const counterLines: string[] = [];
  if (summary.observationCount > 0) {
    counterLines.push(
      `${summary.observationCount} captured observation${summary.observationCount === 1 ? '' : 's'}`,
    );
  }
  if (summary.parentReportCount > 0) {
    counterLines.push(
      `${summary.parentReportCount} parent report${summary.parentReportCount === 1 ? '' : 's'}`,
    );
  }
  if (summary.parentReadersThisMonth > 0) {
    counterLines.push(
      `${summary.parentReadersThisMonth} parent${summary.parentReadersThisMonth === 1 ? '' : 's'} read your reports this month`,
    );
  }
  if (summary.drillsClonedCount > 0 && summary.cloneProgramNames.length > 0) {
    const programs = joinPrograms(summary.cloneProgramNames);
    counterLines.push(
      `${summary.drillsClonedCount} of your drills picked up by coaches in the ${programs} program${summary.cloneProgramNames.length === 1 ? '' : 's'}`,
    );
  } else if (summary.drillsClonedCount > 0) {
    counterLines.push(
      `${summary.drillsClonedCount} of your drills picked up by another coach`,
    );
  }
  if (summary.arcWeeksCarried > 0) {
    counterLines.push(
      `your Practice Arc is carrying ${summary.arcWeeksCarried} week${summary.arcWeeksCarried === 1 ? '' : 's'} of work forward`,
    );
  }

  return (
    <div
      data-testid="paid-coach-receipts-card"
      className="rounded-2xl border border-zinc-500/40 bg-zinc-950 p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100">
            You’ve been on SportsIQ for {summary.daysSincePaid} days.
          </p>
          {counterLines.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-zinc-300 list-none">
              {counterLines.map((line) => (
                <li key={line} className="leading-snug">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="my-3 border-t border-zinc-800" aria-hidden="true" />
          <p className="text-sm text-zinc-300">{nextMonthLine}</p>
        </div>
        <button
          type="button"
          data-testid="paid-coach-receipts-card-got-it"
          onClick={handleDismiss}
          disabled={isDismissing}
          className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/** Container component that fetches the GET endpoint and renders the
 *  card. The /home page mounts THIS section under the daily-focus card.
 *
 *  Per LESSONS#0065 / #0066 / #0162 — smallest possible touch on the
 *  home page: one import + one JSX entry. The fetch lives here, not
 *  in the page component. */
export function PaidCoachReceiptsSection() {
  const { data } = useQuery({
    queryKey: ['paid-coach-receipts'],
    staleTime: 60 * 1000,
    retry: false,
    queryFn: async (): Promise<PaidCoachReceiptsSummary | { eligible: false }> => {
      const res = await fetch('/api/coach/paid-receipts');
      if (!res.ok) return { eligible: false };
      return (await res.json()) as PaidCoachReceiptsSummary | { eligible: false };
    },
  });

  if (!data || data.eligible !== true) return null;
  return <PaidCoachReceiptsCard summary={data} />;
}
