'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, UserCheck } from 'lucide-react';

// Ticket 0063 — <FromCoachesYouFollowSection /> renders at the TOP of /plans
// (above the existing 0055 "From your league" section). Reads
// /api/practice-plan-shares/from-follows and renders one row per published
// plan from a coach the caller follows. The Save-to-my-team button reuses
// the existing 0049 clone primitive (POST /api/practice-plan-shares/clone)
// — NO new clone endpoint.
//
// Empty / network-failure → render nothing. Silence beats an empty state on
// /plans (matches the 0055 posture). A failed fetch must NOT throw — the
// `/plans` page reads this section as best-effort.
//
// Tier posture: universal (no `tier.ts` import). The section is universal
// across tiers; gating discovery inverts the network effect.
//
// data-testid hooks per LESSONS#0029 / #0082 so e2e + the component test
// scope cleanly.

interface FromFollowsPlan {
  token: string;
  planTitle: string | null;
  publisherFirstName: string | null;
  publisherDisplaySport: string;
  ageGroup: string | null;
  createdAt: string;
}

interface FromFollowsPayload {
  plans: FromFollowsPlan[];
}

export function FromCoachesYouFollowSection({ teamId }: { teamId: string | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [savingToken, setSavingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery<FromFollowsPayload>({
    queryKey: ['from-follows-plans'],
    queryFn: async () => {
      // Best-effort: a failed read returns an empty payload so the section
      // simply renders nothing (LESSONS#0036 - never throw on a discovery
      // surface).
      try {
        const res = await fetch('/api/practice-plan-shares/from-follows');
        if (!res.ok) return { plans: [] };
        const json = (await res.json()) as FromFollowsPayload;
        return { plans: Array.isArray(json.plans) ? json.plans : [] };
      } catch {
        return { plans: [] };
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!data || data.plans.length === 0) return null;

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
      qc.invalidateQueries({ queryKey: ['plans'] });
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save plan');
    } finally {
      setSavingToken(null);
    }
  }

  return (
    <section
      data-testid="from-follows-section"
      aria-labelledby="from-follows-heading"
      className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4"
    >
      <div className="flex items-center gap-2 pb-3 border-b border-zinc-800/60">
        <UserCheck className="h-4 w-4 text-orange-400" />
        <h2
          id="from-follows-heading"
          className="text-sm font-semibold text-zinc-100"
        >
          From coaches you follow ({data.plans.length})
        </h2>
      </div>

      <ul className="mt-3 space-y-2">
        {data.plans.map((plan) => {
          const rowLine = formatRow(plan);
          const isSaving = savingToken === plan.token;
          return (
            <li
              key={plan.token}
              data-testid="from-follows-row"
              className="flex flex-col gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">
                  {plan.planTitle ?? 'Practice plan'}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5 truncate">{rowLine}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/plan/${encodeURIComponent(plan.token)}`}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition-colors min-h-[44px] inline-flex items-center"
                  data-testid="from-follows-preview-link"
                >
                  Preview
                </a>
                <button
                  type="button"
                  onClick={() => saveToMyTeam(plan.token)}
                  disabled={isSaving || !teamId}
                  aria-label="Save to my team"
                  data-testid="from-follows-save-button"
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

function formatRow(plan: FromFollowsPlan): string {
  const parts: string[] = [];
  if (plan.publisherFirstName) parts.push(`Coach ${plan.publisherFirstName}`);
  if (plan.publisherDisplaySport) parts.push(plan.publisherDisplaySport);
  if (plan.ageGroup) parts.push(plan.ageGroup);
  return parts.join(' · ');
}
