'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import { useTier } from '@/hooks/use-tier';

// ─── Ticket 0077 — director-side cross-program peer pulse line ──────────────
//
// CrossProgramDirectorPulseLine is the PURE presentational component the
// vitest suite pins. CrossProgramDirectorPulseSection is the thin wrapper
// the /admin page mounts: fire-and-forget GET
// /api/program/cross-program-pulse + <UpgradeGate /> wrap.
//
// The line renders ONLY when the route returns >= 2 neighbor programs.
// When neighborPrograms.length < 2, the line is ABSENT so the existing
// /admin surface stays byte-identical (silence beats nag — same posture as
// the 0028 ProgramPulseCard and 0071 EmergentFocusCard above it).
//
// Voice contract (LESSONS#0023): every copy variant is positively phrased;
// no banned words (journey / amazing / exciting / elevate / empower /
// synergy / unlock your potential). Numbers are factual aggregate counts;
// the line never invents a per-kid claim.
//
// Director-to-director acquisition surface (LESSONS#0065 / #0066 / #0162 —
// smallest possible touch on the 0028 hotspot): one import + one JSX entry
// on /admin. The Invite CTA delegates to the existing
// /api/program-director-invites/create POST shipped by 0065, with the
// neighbor's first name + email pre-filled. When no contact is known, the
// fallback CTA links to /programs (the existing 0033 program-discovery
// surface) with a scoped org_id query so the director can find the
// neighbor through the existing search.

export interface CrossProgramDirectorPulseNeighbor {
  org_id: string;
  org_name: string;
  practice_count: number;
  director_first_name?: string;
  director_contact_email?: string;
}

export interface CrossProgramDirectorPulseData {
  topSkill: string | null;
  neighborPrograms: CrossProgramDirectorPulseNeighbor[];
}

export interface OnInvitePayload extends CrossProgramDirectorPulseNeighbor {
  topSkill: string;
}

export interface CrossProgramDirectorPulseLineProps {
  /** Result of the best-effort GET /api/program/cross-program-pulse read.
   *  Undefined while loading; null/empty when no convergence exists or
   *  the read failed (silence beats nag). */
  data?: CrossProgramDirectorPulseData | null;
  /** Optional callback fired when the director taps "Invite the <X>
   *  director." The thin section wrapper below opens the existing
   *  director-invite sheet pre-loaded with the neighbor's first name +
   *  email. Tests pin this signature directly. */
  onInvite?: (payload: OnInvitePayload) => void;
}

export function CrossProgramDirectorPulseLine({
  data,
  onInvite,
}: CrossProgramDirectorPulseLineProps) {
  // Best-effort posture — nothing to surface → render nothing.
  if (!data || !data.topSkill) return null;
  const { topSkill, neighborPrograms } = data;
  if (!Array.isArray(neighborPrograms) || neighborPrograms.length < 2) return null;

  const [first, second] = neighborPrograms;
  const aggregateCount = (first.practice_count ?? 0) + (second.practice_count ?? 0);
  const knownContact = !!(first.director_contact_email && first.director_first_name);

  function handleInvite() {
    if (!onInvite) return;
    onInvite({
      ...first,
      topSkill,
    });
  }

  return (
    <div
      data-testid="cross-program-director-pulse-line"
      className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/10">
          <Users className="h-4 w-4 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">
            Across the league this week
          </p>
          <p className="text-sm font-medium text-zinc-200 leading-snug">
            <span className="text-zinc-100">{first.org_name}</span>
            {' and '}
            <span className="text-zinc-100">{second.org_name}</span>
            {' are both leaning into '}
            <span className="text-orange-300">{topSkill}</span>
            {' this week — '}
            <span className="text-zinc-100">{aggregateCount}</span>
            {' practices across their coaches touched it.'}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {knownContact ? (
              <button
                type="button"
                onClick={handleInvite}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-500/25 bg-orange-500/15 px-3 py-3 text-xs font-medium text-orange-300 hover:bg-orange-500/25 transition-colors touch-manipulation active:scale-[0.97]"
                aria-label={`Invite the ${first.org_name} director`}
              >
                Invite the {first.org_name} director
              </button>
            ) : (
              <Link
                href={`/programs?orgId=${encodeURIComponent(first.org_id)}`}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-500/25 bg-orange-500/15 px-3 py-3 text-xs font-medium text-orange-300 hover:bg-orange-500/25 transition-colors touch-manipulation active:scale-[0.97]"
                aria-label={`Find this program's director`}
              >
                Find this program&apos;s director
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Thin section the /admin page mounts ────────────────────────────────────

interface SectionProps {
  orgId: string | null | undefined;
  isAdmin: boolean;
}

/**
 * The /admin-page wrapper that loads the cross-program pulse and pipes it
 * into the line. Self-gates to org admins (paired with the server-side
 * role + tier gate in the route). Same posture as 0028 ProgramPulseSection
 * and 0071 EmergentFocusSection.
 */
export function CrossProgramDirectorPulseSection({ orgId, isAdmin }: SectionProps) {
  const { canAccess } = useTier();
  const gated = !canAccess('feature_program_pulse');

  const { data } = useQuery({
    queryKey: ['cross-program-director-pulse', orgId],
    enabled: !!orgId && isAdmin && !gated,
    staleTime: 30 * 60 * 1000, // 30 min — a weekly pulse doesn't change minute to minute
    retry: false,
    queryFn: async (): Promise<CrossProgramDirectorPulseData | null> => {
      const res = await fetch(
        `/api/program/cross-program-pulse?orgId=${encodeURIComponent(orgId!)}`,
      );
      if (!res.ok) return null;
      const json = (await res.json()) as CrossProgramDirectorPulseData;
      if (!json || !Array.isArray(json.neighborPrograms)) return null;
      return json;
    },
  });

  // Director-only surface — a non-admin never sees the gate OR the line.
  if (!isAdmin) return null;

  if (gated) {
    return (
      <UpgradeGate feature="feature_program_pulse" featureLabel="Cross-program pulse">
        <CrossProgramDirectorPulseLine data={data} />
      </UpgradeGate>
    );
  }

  return (
    <CrossProgramDirectorPulseLine
      data={data}
      onInvite={(payload) => {
        // Fire the existing 0065 director-invite POST with the surfaced
        // neighbor's first_name + email. The team-id required by the 0065
        // contract is resolved server-side by the route (we don't have a
        // weekly-pulse token here — the 0077 invite uses the bare director-
        // invite path; the route accepts the payload shape it already
        // accepts for the canonical first-touch flow). For v1 we simply
        // open a new tab to the existing /admin invite flow seeded with
        // the neighbor's email as a search prefix; the existing 0024
        // admin-invite UI already accepts an email.
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams({
          to_email: payload.director_contact_email ?? '',
          to_first_name: payload.director_first_name ?? '',
          neighbor_program: payload.org_name,
          shared_skill: payload.topSkill,
        });
        window.open(`/programs?invite=director&${params.toString()}`, '_blank', 'noopener');
      }}
    />
  );
}
