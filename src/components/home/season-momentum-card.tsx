'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { CalendarRange, ChevronRight } from 'lucide-react';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import { useTier } from '@/hooks/use-tier';
import { buildTrendSentence, type SeasonMomentum } from '@/lib/season-momentum-utils';

// ─── Ticket 0032 — the coach-private season-momentum card ────────────────────────
//
// SeasonMomentumCard is a PURE presentational component: it takes the result of a
// best-effort GET to /api/analytics/season-momentum and decides what to render.
// It NEVER blocks the home screen — while loading, on failure (data undefined /
// null), or before the team has any observations (totalCount 0), it renders
// nothing. No empty nag, no "you've been inactive" guilt-trip (banned tone).
//
// SeasonMomentumSection is the thin container the home page mounts: it does the
// fire-and-forget useQuery GET (the page uses TanStack Query; we never call
// Supabase from the client — AGENTS.md rule 3) and wraps the body in
// <UpgradeGate> so a free coach sees the upgrade prompt instead of the card.

/**
 * Where the season card's one next step points. As the bar fills toward the end
 * of the season it nudges the coach toward the artifacts that close the season
 * out (the existing weekly-star / parent-report / season-recap surfaces all live
 * under /plans); earlier in the season it points at the same hub. The card only
 * routes the coach to surfaces that already exist — it builds none of them.
 */
function nextStep(data: SeasonMomentum): { href: string; label: string } {
  const nearEnd =
    data.weekTotal != null && data.weekTotal > 0 && data.weekPosition >= data.weekTotal - 1;
  if (nearEnd) {
    return { href: '/plans?type=season_summary', label: 'Wrap the season — make your recap' };
  }
  return { href: '/plans', label: 'See this season’s reports' };
}

export function SeasonMomentumCard({
  data,
  teamId: _teamId,
}: {
  data: SeasonMomentum | null | undefined;
  teamId: string;
}) {
  // Best-effort: loading (undefined) and failed (null) both render nothing.
  if (!data) return null;

  // Nothing to show before the team has accumulated any observations — the arc
  // hasn't started, so there is no honest position to report. No empty nag.
  if (data.trend.totalCount <= 0 && data.weeksActive <= 0) return null;

  const hasSeason = data.weekTotal != null && data.weekTotal > 0;
  const trendSentence = buildTrendSentence(data.trend);
  const step = nextStep(data);

  // Position line + progress fraction. With a set season we report "Week N of M"
  // and fill the bar to N/M; without one we fall back to a weeks-active display
  // and a neutral, un-filled bar (never an error or an empty state).
  const positionLabel = hasSeason
    ? `Week ${data.weekPosition} of ${data.weekTotal}`
    : `${data.weeksActive} week${data.weeksActive === 1 ? '' : 's'} into the season`;

  const pct = hasSeason
    ? Math.min(100, Math.max(0, Math.round((data.weekPosition / (data.weekTotal as number)) * 100)))
    : 0;

  return (
    <div
      data-testid="season-momentum-card"
      className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
          <CalendarRange className="h-4 w-4 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-0.5">
            Your season so far
          </p>
          <p className="text-sm font-semibold text-zinc-100 leading-snug">{positionLabel}</p>

          {/* Thin progress element — not a heavy chart. Only meaningful when a
              season length is set; rendered for the set-season case. */}
          {hasSeason && (
            <div
              role="progressbar"
              aria-valuenow={data.weekPosition}
              aria-valuemin={0}
              aria-valuemax={data.weekTotal as number}
              aria-label={positionLabel}
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800"
            >
              <div className="h-full rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
            </div>
          )}

          {trendSentence && (
            <p className="mt-2 text-xs text-zinc-400 leading-snug">{trendSentence}</p>
          )}

          <Link
            href={step.href}
            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-500/25 bg-orange-500/15 px-3 py-3 text-xs font-medium text-orange-300 hover:bg-orange-500/25 transition-colors touch-manipulation active:scale-[0.97]"
          >
            {step.label}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function SeasonMomentumSection({ teamId }: { teamId: string }) {
  const { canAccess } = useTier();
  const gated = !canAccess('feature_season_momentum');

  // The query only runs for entitled coaches — a free coach never triggers the
  // read (the server gate would 403 anyway; this avoids the wasted round-trip).
  const { data } = useQuery({
    queryKey: ['season-momentum', teamId],
    enabled: !!teamId && !gated,
    staleTime: 30 * 60 * 1000, // 30 min — a season position doesn't change minute to minute
    retry: false, // best-effort: never block or thrash the home screen
    queryFn: async (): Promise<SeasonMomentum | null> => {
      const res = await fetch(`/api/analytics/season-momentum?teamId=${teamId}`);
      if (!res.ok) return null;
      return (await res.json()) as SeasonMomentum;
    },
  });

  // Free coach: show the upgrade prompt for the season card (paired with the
  // server-side canAccess() gate in the route — AGENTS.md rule 5).
  if (gated) {
    return (
      <UpgradeGate feature="feature_season_momentum" featureLabel="Season Momentum">
        {/* Entitled coaches render the card below; a free coach sees the gate. */}
        <SeasonMomentumCard data={data} teamId={teamId} />
      </UpgradeGate>
    );
  }

  return <SeasonMomentumCard data={data} teamId={teamId} />;
}
