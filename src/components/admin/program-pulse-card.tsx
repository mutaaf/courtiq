'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Activity, ChevronRight } from 'lucide-react';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import { useTier } from '@/hooks/use-tier';
import type { ProgramPulse, ProgramPulseActionKind } from '@/lib/ai/schemas';

// ─── Ticket 0028 — the director-private weekly "program pulse" card ──────────────
//
// ProgramPulseCard is a PURE presentational component: it takes the result of a
// best-effort POST to /api/ai/program-pulse and decides what to render. It NEVER
// blocks the admin screen — while loading, on failure, or on a quiet program week
// (pulse === null), it renders nothing.
//
// ProgramPulseSection is the thin container the admin page mounts: it does the
// fire-and-forget useQuery POST (we never call Supabase from the client —
// AGENTS.md rule 3) and wraps the body in <UpgradeGate> so a non-org admin sees
// the upgrade prompt instead of the pulse. It also self-gates to org admins: the
// section only fetches/renders for an admin on an Organization-tier org (paired
// with the server-side role+tier gate in the route — AGENTS.md rule 5).

/** Map the closed next_action.kind enum to a known in-app route. */
function actionHref(kind: ProgramPulseActionKind): string {
  switch (kind) {
    case 'nudge_coach':
      // Deep-link into the org-analytics coach-engagement detail (0024 invite
      // lives on /admin; the nudge starts from the analytics view).
      return '/admin/org-analytics';
    case 'invite_staff':
      return '/admin';
    case 'view_analytics':
      return '/admin/org-analytics';
    default:
      return '/admin';
  }
}

export function ProgramPulseCard({
  pulse,
}: {
  pulse: ProgramPulse | null | undefined;
}) {
  // Best-effort: loading (undefined), failed (undefined), or a quiet week (null)
  // all render nothing. The pulse never blocks or nags.
  if (!pulse) return null;

  return (
    <div
      data-testid="program-pulse-card"
      className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
          <Activity className="h-4 w-4 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-0.5">
            Program pulse
          </p>
          <p className="text-sm font-semibold text-zinc-100 leading-snug">
            {pulse.week_summary}
          </p>

          {pulse.teams_to_watch.length > 0 && (
            <ul className="mt-2 space-y-1">
              {pulse.teams_to_watch.slice(0, 2).map((t, i) => (
                <li key={`${t.team_name}-${i}`} className="text-xs text-zinc-400 leading-snug">
                  <span className="font-medium text-zinc-300">{t.team_name}</span>
                  {' — '}
                  {t.note}
                </li>
              ))}
            </ul>
          )}

          {pulse.next_action?.rationale && (
            <p className="mt-2 text-xs text-zinc-500 italic leading-snug">
              {pulse.next_action.rationale}
            </p>
          )}

          <Link
            href={actionHref(pulse.next_action.kind)}
            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-500/25 bg-orange-500/15 px-3 py-3 text-xs font-medium text-orange-300 hover:bg-orange-500/25 transition-colors touch-manipulation active:scale-[0.97]"
          >
            {pulse.next_action.label}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ProgramPulseSection({
  orgId,
  isAdmin,
}: {
  orgId: string | null | undefined;
  isAdmin: boolean;
}) {
  const { canAccess } = useTier();
  const gated = !canAccess('feature_program_pulse');

  // The query only runs for an org admin on the Organization tier — a non-admin
  // or non-org caller never triggers the AI call (the server gate would 403/404
  // anyway; this avoids the wasted round-trip).
  const { data } = useQuery({
    queryKey: ['program-pulse', orgId],
    enabled: !!orgId && isAdmin && !gated,
    staleTime: 30 * 60 * 1000, // 30 min — a weekly pulse doesn't change minute to minute
    retry: false,              // best-effort: never block or thrash the admin screen
    queryFn: async (): Promise<ProgramPulse | null> => {
      const res = await fetch('/api/ai/program-pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return (json?.pulse ?? null) as ProgramPulse | null;
    },
  });

  // The pulse is a director surface — a non-admin never sees the card OR the gate.
  if (!isAdmin) return null;

  // Non-org admin: show the upgrade prompt for the pulse (paired with the
  // server-side canAccess() gate in the route — AGENTS.md rule 5).
  if (gated) {
    return (
      <UpgradeGate feature="feature_program_pulse" featureLabel="Program Pulse">
        {/* Org admins render the card below; a non-org admin sees the gate. */}
        <ProgramPulseCard pulse={data} />
      </UpgradeGate>
    );
  }

  return <ProgramPulseCard pulse={data} />;
}
