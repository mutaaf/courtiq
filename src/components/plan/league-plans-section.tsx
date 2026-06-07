'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Users, Check } from 'lucide-react';
import { formatLeaguePlanRow } from '@/lib/league-plans-utils';
import { CoachReputationLine } from '@/components/library/coach-reputation-line';

// Ticket 0055 — <LeaguePlansSection /> renders at the TOP of /plans.
//
// Shows up to 5 practice plans recently published by OTHER coaches in the
// viewing coach's org, scoped to the active team's sport. Each row has a
// "Save to my team" button that POSTs the EXISTING
// /api/practice-plan-shares/clone route (shipped by 0049) with the row's
// token + the active teamId. The clone lands as a fresh draft on the
// coach's team — same UX as the public /plan/<token> page's clone path.
//
// Voice: clipboard, not consumer-SaaS. The empty / ineligible state renders
// NOTHING — silence beats a "no plans yet" guilt trip.
//
// Tier posture: universal across tiers (a coach with an org_id sees their
// org's plans regardless of subscription). Gating discovery would invert
// the network-effect loop the same way gating publish would — the
// org/program-tier value lives in 0024 (staff invite) + 0028 (program
// pulse), not in this surface.
//
// Theme: dark zinc-950 + orange accent (the coach surface, not parent
// portal). 44px touch targets. Stable `data-testid` hooks so e2e specs
// (LESSONS#81) and the component test scope without fighting strict-mode.

interface LeaguePlan {
  token: string;
  planTitle: string | null;
  publishedAt: string;
  coachFirstName: string | null;
  sportSlug: string;
  ageGroup: string | null;
  sourcePlanId: string;
  note: string | null;
  /** Ticket 0073 reputation extension — present when the published
   *  coach's clone counts are above the discovery threshold. Optional
   *  on the legacy payload shape per LESSONS#0103 (callers without
   *  the new field stay byte-identical). */
  reputation?: {
    cloneCount: number;
    distinctProgramCount: number;
    distinctCoachCount: number;
  } | null;
}

interface LeaguePayload {
  plans: LeaguePlan[];
  eligible: boolean;
}

export function LeaguePlansSection({ teamId }: { teamId: string | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [savingToken, setSavingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery<LeaguePayload>({
    queryKey: ['league-plans', teamId],
    queryFn: async () => {
      if (!teamId) return { plans: [], eligible: false };
      const res = await fetch(
        `/api/practice-plan-shares/league?teamId=${encodeURIComponent(teamId)}`,
      );
      if (!res.ok) return { plans: [], eligible: false };
      const json = (await res.json()) as LeaguePayload;
      // Defensive: a 500 from the route can return a partial payload with
      // an error field — clamp to the expected shape so the UI stays
      // consistent.
      return {
        plans: Array.isArray(json.plans) ? json.plans : [],
        eligible: Boolean(json.eligible),
      };
    },
    enabled: !!teamId,
    // Mirror the server-side TTL so a brief navigation away + back doesn't
    // re-hit the route. The server-side cache stays the source of truth.
    staleTime: 5 * 60 * 1000,
  });

  // Empty / ineligible — render nothing. The plans page is byte-identical
  // for solo coaches (no org_id) and for orgs whose other coaches haven't
  // published yet.
  if (!teamId || !data || !data.eligible || data.plans.length === 0) {
    return null;
  }

  async function saveToMyTeam(token: string) {
    if (!teamId) return;
    setSavingToken(token);
    setError(null);
    try {
      const res = await fetch('/api/practice-plan-shares/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, teamId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Could not save plan');
      }
      // Refresh the plans list so the cloned draft shows up below.
      qc.invalidateQueries({ queryKey: ['plans'] });
      // Best-effort soft refresh of the /plans page. The cloned plan
      // appears in the existing plans list (same UX as the public clone).
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save plan');
    } finally {
      setSavingToken(null);
    }
  }

  return (
    <section
      data-testid="league-plans-section"
      aria-labelledby="league-plans-heading"
      className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4"
    >
      <div className="flex items-center gap-2 pb-3 border-b border-zinc-800/60">
        <Users className="h-4 w-4 text-orange-400" />
        <h2
          id="league-plans-heading"
          className="text-sm font-semibold text-zinc-100"
        >
          From your league ({data.plans.length})
        </h2>
      </div>

      <ul className="mt-3 space-y-2">
        {data.plans.map((plan) => {
          const rowLine = formatLeaguePlanRow({
            coachFirstName: plan.coachFirstName,
            planTitle: plan.planTitle,
            sportSlug: plan.sportSlug,
            ageGroup: plan.ageGroup,
          });
          const isSaving = savingToken === plan.token;
          return (
            <li
              key={plan.token}
              data-testid="league-plan-row"
              className="flex flex-col gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">
                  {plan.planTitle ?? 'Practice plan'}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5 truncate">{rowLine}</p>
                {/* Ticket 0073 — reputation line. Renders ONLY when */}
                {/* the published coach's counts are above the */}
                {/* discovery threshold; ABSENT otherwise. */}
                <CoachReputationLine
                  cardKey={plan.token}
                  reputation={plan.reputation ?? null}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/plan/${encodeURIComponent(plan.token)}`}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition-colors min-h-[44px] inline-flex items-center"
                  data-testid="league-plan-preview-link"
                >
                  Preview
                </a>
                <button
                  type="button"
                  onClick={() => saveToMyTeam(plan.token)}
                  disabled={isSaving}
                  aria-label="Save to my team"
                  data-testid="league-plan-save-button"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 active:scale-[0.98] transition-all disabled:opacity-60 touch-manipulation"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Save to my team
                    </>
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-3 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
