'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import { useTier } from '@/hooks/use-tier';
import type { WeeklyDigest, WeeklyDigestActionKind } from '@/lib/ai/schemas';

// ─── Ticket 0023 — the coach-private "your week in coaching" digest card ────────
//
// WeeklyDigestCard is a PURE presentational component: it takes the result of a
// best-effort POST to /api/ai/weekly-digest and decides what to render. It NEVER
// blocks the home screen — while loading, on failure, or on a quiet week
// (digest === null), it renders nothing.
//
// WeeklyDigestSection is the thin container the home page mounts: it does the
// fire-and-forget useQuery POST (the page uses TanStack Query; we never call
// Supabase from the client — AGENTS.md rule 3) and wraps the body in
// <UpgradeGate> so a free coach sees the upgrade prompt instead of the digest.

/** Map the closed next_action.kind enum to a known in-app route. */
function actionHref(kind: WeeklyDigestActionKind): string {
  switch (kind) {
    case 'parent_report':
      return '/plans?type=parent_report';
    case 'weekly_star':
      return '/plans?type=weekly_star';
    case 'practice_plan':
      return '/plans';
    case 'capture':
      return '/capture';
    default:
      return '/home';
  }
}

export function WeeklyDigestCard({
  digest,
  teamId: _teamId,
}: {
  digest: WeeklyDigest | null | undefined;
  teamId: string;
}) {
  // Best-effort: loading (undefined), failed (undefined), or a quiet week (null)
  // all render nothing. The digest never blocks or nags.
  if (!digest) return null;

  return (
    <div
      data-testid="weekly-digest-card"
      className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
          <CalendarDays className="h-4 w-4 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-0.5">
            Your week in coaching
          </p>
          <p className="text-sm font-semibold text-zinc-100 leading-snug">
            {digest.week_summary}
          </p>

          {digest.top_players.length > 0 && (
            <ul className="mt-2 space-y-1">
              {digest.top_players.slice(0, 3).map((p, i) => (
                <li key={`${p.player_name}-${i}`} className="text-xs text-zinc-400 leading-snug">
                  <span className="font-medium text-zinc-300">{p.player_name}</span>
                  {' — '}
                  {p.note}
                </li>
              ))}
            </ul>
          )}

          {digest.next_action?.rationale && (
            <p className="mt-2 text-xs text-zinc-500 italic leading-snug">
              {digest.next_action.rationale}
            </p>
          )}

          <Link
            href={actionHref(digest.next_action.kind)}
            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-500/25 bg-orange-500/15 px-3 py-3 text-xs font-medium text-orange-300 hover:bg-orange-500/25 transition-colors touch-manipulation active:scale-[0.97]"
          >
            {digest.next_action.label}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function WeeklyDigestSection({ teamId }: { teamId: string }) {
  const { canAccess } = useTier();
  const gated = !canAccess('feature_weekly_digest');

  // The query only runs for entitled coaches — a free coach never triggers the
  // AI call (the server gate would 403 anyway; this avoids the wasted round-trip).
  const { data } = useQuery({
    queryKey: ['weekly-digest', teamId],
    enabled: !!teamId && !gated,
    staleTime: 30 * 60 * 1000, // 30 min — a weekly recap doesn't change minute to minute
    retry: false,              // best-effort: never block or thrash the home screen
    queryFn: async (): Promise<WeeklyDigest | null> => {
      const res = await fetch('/api/ai/weekly-digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return (json?.digest ?? null) as WeeklyDigest | null;
    },
  });

  // Free coach: show the upgrade prompt for the digest (paired with the
  // server-side canAccess() gate in the route — AGENTS.md rule 5).
  if (gated) {
    return (
      <UpgradeGate feature="feature_weekly_digest" featureLabel="Weekly Digest">
        {/* Entitled coaches render the card below; a free coach sees the gate. */}
        <WeeklyDigestCard digest={data} teamId={teamId} />
      </UpgradeGate>
    );
  }

  return <WeeklyDigestCard digest={data} teamId={teamId} />;
}
