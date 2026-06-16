/**
 * Ticket 0086 — `<TeamLimitUpgradeSheet />`.
 *
 * Renders when /api/auth/create-team or /api/auth/configure-team returns a
 * structured `code: 'tier_limit_max_teams'` 4xx body (see the routes for the
 * full shape). The sheet names the team the coach was trying to join AND, when
 * present, the coach who invited them — turning the dead-end "you're at your
 * 1-team limit" toast into a contextual upgrade moment that knows the WHO and
 * the WHAT.
 *
 * The primary CTA routes to /settings/upgrade with the 0035 resume primitive's
 * new `join_team` kind (`resume=join_team:<teamId>`); after Stripe flips the
 * tier, the settings/upgrade resume handler finishes the originally-blocked
 * join and lands the coach on the new team's home.
 *
 * DRY: the benefit copy is imported from `FEATURE_CONFIG` in
 * `src/components/ui/upgrade-gate.tsx` — the gate's own rendering stays
 * byte-identical (LESSONS#0103).
 *
 * Voice: every user-facing string is written in clipboard voice — instruct
 * positively in this jsdoc (LESSONS#0023 / #0034 / #0088), never embed a
 * verbatim ban-list. Use short, factual sentences. The mobile-first layout
 * targets 44px touch areas with the dark zinc-950 + orange-500 accent per
 * AGENTS.md.
 *
 * Scope every assertion in the test by `data-testid` (LESSONS#0029 / #0082).
 *
 * .tsx — client component (this is a sheet with interactive state).
 */
'use client';

import Link from 'next/link';
import { ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FEATURE_CONFIG } from '@/components/ui/upgrade-gate';
import type { Tier } from '@/lib/tier';

/** The structured 4xx body returned by create-team / configure-team. */
export interface TierLimitBody {
  /** BYTE-IDENTICAL legacy error string — kept so unmodified clients still toast. */
  error: string;
  /** Legacy back-compat marker. */
  upgrade: true;
  /** The load-bearing client switch — present only on the tier-limit branch. */
  code: 'tier_limit_max_teams';
  currentCount: number;
  maxCount: number;
  /** The team name the coach tried to join/create (null when cross-org / missing). */
  attemptedTeamName: string | null;
  /** The team id the resume target points at after the upgrade round-trip. */
  attemptedTeamId: string;
  /** The org's current tier — drives the upgrade target choice. */
  currentTier: Tier;
  /**
   * Present only when the request carried a valid same-org `inviteCoachId`.
   * Carries the inviter's FIRST name (no surname) and their team_coaches role.
   */
  invitedBy?: { firstName: string; role: 'head_coach' | 'assistant_coach' };
  /** Forwarded so the resume handler can re-issue the original request shape. */
  inviteCoachId?: string;
}

const MONTHLY_PRICES: Record<Exclude<Tier, 'free'>, number> = {
  coach: 9.99,
  pro_coach: 24.99,
  organization: 49.99,
};

const TIER_LABEL: Record<Exclude<Tier, 'free'>, string> = {
  coach: 'Coach',
  pro_coach: 'Pro Coach',
  organization: 'Organization',
};

/**
 * Pick the upgrade target for the current tier. Free goes to Coach (the
 * lowest paid tier that lifts maxTeams from 1 to 3). Coach goes to
 * Organization (the lift past 3). Pro coach also goes to Organization
 * (multi-coach is the organizational upgrade signal).
 */
function chooseUpgradeTarget(currentTier: Tier): Exclude<Tier, 'free'> {
  if (currentTier === 'free') return 'coach';
  return 'organization';
}

/**
 * Pick the benefit copy. For free→Coach we surface the Coach-tier features
 * the multi-team coach will exercise (weekly digest + season momentum + parent
 * sharing + report cards). For Coach/Pro → Organization we surface the
 * organization-tier program signals (program pulse + multi-coach + program
 * focus). DRY: import from FEATURE_CONFIG, never re-copy the strings.
 */
function chooseBenefits(target: Exclude<Tier, 'free'>): string[] {
  const keys = target === 'coach'
    ? ['feature_weekly_digest', 'feature_season_momentum', 'report_cards', 'parent_sharing']
    : ['feature_program_pulse', 'multi_coach', 'feature_program_focus'];
  const benefits: string[] = [];
  for (const key of keys) {
    const cfg = FEATURE_CONFIG[key];
    if (!cfg) continue;
    // Pick the first benefit from each config — keeps the sheet short on
    // mobile while still naming the FOUR concrete things the upgrade buys.
    benefits.push(cfg.benefits[0]);
  }
  return benefits;
}

export function TeamLimitUpgradeSheet({
  body,
  onClose,
}: {
  body: TierLimitBody;
  onClose: () => void;
}) {
  const upgradeTarget = chooseUpgradeTarget(body.currentTier);
  const price = MONTHLY_PRICES[upgradeTarget];
  const label = TIER_LABEL[upgradeTarget];
  const benefits = chooseBenefits(upgradeTarget);

  // Build the resume URL. The resume kind itself is team-scoped; the inviter
  // id (when present) rides as a separate query param so the post-checkout
  // handler can re-fire the original create-team / configure-team request with
  // the same `inviteCoachId`.
  const resumeParam = encodeURIComponent(`join_team:${body.attemptedTeamId}`);
  const inviteParam = body.inviteCoachId
    ? `&inviteCoachId=${encodeURIComponent(body.inviteCoachId)}`
    : '';
  const upgradeHref = `/settings/upgrade?resume=${resumeParam}${inviteParam}`;

  // Headline copy — names the team (and the inviter when present) WITHOUT
  // any AGENTS.md banned word. The "one upgrade away" framing keeps the moment
  // factual, not hype.
  const headline = body.attemptedTeamName
    ? `Adding ${body.attemptedTeamName} takes one upgrade`
    : 'Adding this team takes one upgrade';

  const inviterLine = body.invitedBy
    ? `Coach ${body.invitedBy.firstName} invited you.`
    : null;

  // The price/tier sentence under the headline.
  const subline = upgradeTarget === 'coach'
    ? `${label} plan, $${price.toFixed(2)} a month, covers both your current team and this one.`
    : `${label} plan, $${price.toFixed(2)} a month, covers this new team plus everything you already coach.`;

  return (
    <div
      data-testid="team-limit-upgrade-sheet"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-limit-upgrade-headline"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close upgrade sheet"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div className="relative w-full max-w-md rounded-t-2xl border-t border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl sm:rounded-2xl sm:border">
        {/* Dismiss tab (top-right) */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="border-b border-zinc-800 px-6 pt-7 pb-5">
          <h2
            id="team-limit-upgrade-headline"
            className="text-lg font-semibold leading-snug"
          >
            {headline}
          </h2>
          {inviterLine && (
            <p className="mt-1.5 text-sm text-orange-400">{inviterLine}</p>
          )}
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{subline}</p>
        </div>

        {/* Benefits */}
        <div className="px-6 py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            What the upgrade covers
          </p>
          <ul className="space-y-2.5">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 text-sm text-zinc-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTAs */}
        <div className="space-y-3 border-t border-zinc-800 px-6 py-5">
          <Link href={upgradeHref} className="block" data-testid="team-limit-upgrade-cta">
            <Button
              className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all"
            >
              {body.attemptedTeamName
                ? `Upgrade and join ${body.attemptedTeamName}`
                : 'Upgrade and join this team'}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
          <button
            type="button"
            onClick={onClose}
            data-testid="team-limit-upgrade-dismiss"
            className="w-full rounded-lg px-3 py-3 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
