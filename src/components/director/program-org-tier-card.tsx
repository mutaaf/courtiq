'use client';

/**
 * Ticket 0087 — the program-org-tier upgrade moment card on the admin /
 * director surface.
 *
 * Pure presentational component. Renders when (and only when) the route's
 * `programTierState.eligibleForOrgUpgrade` is true. Silence beats nag —
 * for any other state (loading, null, ineligible), the component renders
 * nothing.
 *
 * Voice posture (LESSONS#0023): the headline + body lines are instructed
 * positively. No AGENTS.md banned token appears in any rendered fixture
 * variant.
 *
 * Aesthetic: matches the existing 0028 / 0071 / 0073 director-surface
 * card posture — quiet orange accent (#F97316) on zinc-950 dark theme,
 * 44px touch targets, mobile-first.
 *
 * Identified by `data-testid="program-org-tier-card"` per LESSONS#0029 /
 * LESSONS#0082 — every assertion (component test + Playwright e2e) scopes
 * by this id to dodge strict-mode collisions with sibling cards.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Building2, ChevronRight } from 'lucide-react';
import type { ProgramTierState } from '@/lib/program-tier-state';

const ORG_PRICE_CENTS = 4999; // mirrors MONTHLY_PRICES.organization

/** Format a cents amount as `$X.XX` (mirrors the 0074 referral-card posture). */
function formatDollars(cents: number): string {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `$${dollars}.${remainder.toString().padStart(2, '0')}`;
}

/** Oxford-comma join of the first names (mirrors 0085's oxford-comma posture). */
function oxfordCommaJoin(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const head = names.slice(0, -1).join(', ');
  const tail = names[names.length - 1];
  return `${head}, and ${tail}`;
}

export interface ProgramOrgTierCardProps {
  /** The state returned by POST /api/ai/program-pulse → `programTierState`.
   *  Null / undefined → renders nothing (loading / failed). */
  state: ProgramTierState | null | undefined;
  /** Called when the director taps "Maybe later". The parent container
   *  POSTs the snooze and unmounts the card on success. */
  onSnooze?: () => void;
}

export function ProgramOrgTierCard({ state, onSnooze }: ProgramOrgTierCardProps) {
  // Best-effort: loading / failed / ineligible → render nothing. The card
  // never blocks or nags.
  if (!state || !state.eligibleForOrgUpgrade) return null;

  const names = oxfordCommaJoin(state.paidCoachFirstNames);
  const spendLine = formatDollars(state.monthlySpendCents);
  const orgPriceLine = formatDollars(ORG_PRICE_CENTS);

  // Savings framing. Positive → "saves $X.XX/mo" (5+ paid coaches);
  // negative → "the $X.XX difference is the program rails" (3 paid
  // coaches at the floor). Both are honest renderings of the same
  // structural math.
  const savings = state.orgUpgradeSavingsCents;
  const savingsLine =
    savings >= 0
      ? `saves ${formatDollars(savings)}/mo`
      : `the ${formatDollars(savings)} difference is the program rails`;

  return (
    <div
      data-testid="program-org-tier-card"
      className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
          <Building2 className="h-4 w-4 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-0.5">
            Your program is on SportsIQ already
          </p>
          <p className="text-sm font-semibold text-zinc-100 leading-snug">
            {names} on Coach, shipping real practices this month.
          </p>

          <p className="mt-2 text-xs text-zinc-400 leading-snug">
            <span className="font-medium text-zinc-300">{spendLine}</span>
            {' today across '}
            {state.paidCoachCount} coaches
            {' · '}
            <span className="font-medium text-zinc-300">{orgPriceLine}</span>
            {' on Organization — '}
            {savingsLine}.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/admin/preview-organization"
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-500/25 bg-orange-500/15 px-3 py-3 text-xs font-medium text-orange-300 hover:bg-orange-500/25 transition-colors touch-manipulation active:scale-[0.97]"
            >
              Show me Organization
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={onSnooze}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/40 px-3 py-3 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60 transition-colors touch-manipulation active:scale-[0.97]"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The thin container the admin / director page mounts. Fetches the
 * `programTierState` from the existing 0028 / 0077 program-pulse endpoint
 * (which now returns it additively) and wires the snooze POST. Mirrors
 * the existing `<ProgramPulseSection />` posture: best-effort `useQuery`
 * + a small local state for the snooze-driven unmount.
 *
 * No tier-gate wrapper here — the route ALSO returns the eligibility
 * flag false for any non-free org, and the card itself short-circuits to
 * render nothing for !eligibleForOrgUpgrade. Defense in depth (server
 * gate + client gate; AGENTS.md rule 5).
 */
export function ProgramOrgTierCardSection({
  orgId,
  isAdmin,
}: {
  orgId: string | null | undefined;
  isAdmin: boolean;
}) {
  // Local snooze state — once the director taps "Maybe later" we hide the
  // card immediately (the server snooze writes asynchronously; the user
  // never waits on the network for visual feedback).
  const [snoozed, setSnoozed] = useState(false);

  const { data } = useQuery({
    queryKey: ['program-org-tier-state', orgId],
    enabled: !!orgId && isAdmin,
    staleTime: 30 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<ProgramTierState | null> => {
      const res = await fetch('/api/ai/program-pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return (json?.programTierState ?? null) as ProgramTierState | null;
    },
  });

  if (!isAdmin) return null;
  if (snoozed) return null;

  async function handleSnooze() {
    setSnoozed(true);
    try {
      await fetch('/api/admin/program-org-tier-card/snooze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
    } catch {
      // Best-effort — the local snooze still hides the card for this render;
      // the server retry happens on the next page load.
    }
  }

  return <ProgramOrgTierCard state={data} onSnooze={handleSnooze} />;
}
