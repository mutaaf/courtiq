'use client';

/**
 * Ticket 0090 — the program-canon inheritance banner on /plans.
 *
 * Renders for any coach who joined an Org-tier program in the last 14
 * days AND that program has a published `program_drill_canon` whose
 * drill_ids were silently inherited into the coach's
 * `coach_drill_signals` on day one (the inheritance edge in the
 * staff-invite flow). The banner is the on-page disclosure of that
 * silent inheritance — a quiet zinc-500 line, no CTA, dismissible via
 * "Got it".
 *
 * Identified by `data-testid="program-canon-inherited-banner"` per
 * LESSONS#0029 / LESSONS#0082 so the e2e spec can scope tightly.
 *
 * Voice posture (LESSONS#0023): instructs positively in this jsdoc;
 * the rendered text carries no AGENTS.md banned token.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Library, X } from 'lucide-react';

export interface ProgramCanonInheritedBannerPayload {
  inherited: boolean;
  drillCount?: number;
  programName?: string;
}

export interface ProgramCanonInheritedBannerProps {
  payload: ProgramCanonInheritedBannerPayload | null | undefined;
  onDismiss: () => void;
}

export function ProgramCanonInheritedBanner({
  payload,
  onDismiss,
}: ProgramCanonInheritedBannerProps) {
  if (!payload || !payload.inherited) return null;
  const drillCount = payload.drillCount ?? 0;
  const programName = payload.programName ?? 'your program';

  return (
    <div
      data-testid="program-canon-inherited-banner"
      className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
    >
      <Library className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" />
      <p className="flex-1 text-xs text-zinc-400 leading-snug">
        {drillCount} {drillCount === 1 ? 'drill' : 'drills'} from your {programName}{' '}
        program&apos;s canon are in your library.
      </p>
      <button
        type="button"
        data-testid="program-canon-inherited-dismiss"
        onClick={onDismiss}
        className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300 transition-colors touch-manipulation"
        aria-label="Dismiss banner"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Thin container the /plans page mounts. Calls the dedicated GET
 * route to learn whether the inheritance banner is eligible, wires
 * the dismiss POST, and re-fetches on dismiss so the banner
 * disappears immediately.
 */
export function ProgramCanonInheritedBannerSection() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['program-canon-inherited'],
    staleTime: 15 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<ProgramCanonInheritedBannerPayload | null> => {
      const res = await fetch('/api/plans/program-canon-inherited');
      if (!res.ok) return null;
      const json = await res.json();
      return json as ProgramCanonInheritedBannerPayload;
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      await fetch('/api/plans/program-canon-inherited/dismiss', { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.setQueryData(['program-canon-inherited'], { inherited: false });
    },
  });

  return (
    <ProgramCanonInheritedBanner
      payload={data}
      onDismiss={() => dismissMutation.mutate()}
    />
  );
}
