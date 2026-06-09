'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Trophy, ArrowRight } from 'lucide-react';

// ─── Ticket 0073 — coach reputation milestone card ──────────────────────────
//
// Pulled to /home when the caller coach has ≥1 unconsumed reputation
// milestone — their published work crossed a clone-count or distinct-
// program threshold this month. The card renders the most-recent
// milestone with a per-kind copy line and ONE primary button ("Open
// my plans" → /plans) plus a "Got it" stamp button.
//
// Voice contract (LESSONS#0023): instructed positively. No
// "amazing" / "journey" / "elevate" / etc. — just "your closeout
// drill was cloned by a coach in a 3rd program — well done" or
// "your plans have been cloned 10 times this month — want to
// publish another?"
//
// Tier posture: NO new tier feature key. The reputation milestone
// is universal — the publishing coach's reputation belongs to them.
// 0049 publish is free; reputation is a quality lift on the same
// surface.
//
// COPPA: the card NEVER renders a cloning-coach name, parent email,
// or any minor identifier. It renders ONLY the milestone kind copy
// + the program-name count (which is a non-PII aggregate). The
// cloning coach's NAME is structurally never reachable from this
// component's props.

export type ReputationMilestoneKind =
  | 'clones_3'
  | 'clones_10'
  | 'clones_25'
  | 'clones_50'
  | 'programs_2'
  | 'programs_4'
  | 'programs_8'
  // Ticket 0076 — the cloning coach ran the cloned drill AND thumbed
  // it up. The card names the cloning PROGRAM (not the cloning
  // coach) — same consent posture as the existing 0073 program-
  // naming contract.
  | 'stuck_1'
  | 'stuck_3'
  | 'stuck_8';

export interface ReputationMilestone {
  id: string;
  kind: ReputationMilestoneKind;
  crossedAt: string;
  // Ticket 0076 — stuck-kind metadata. The publishing coach's
  // home-card surface reads these from the milestone-list route.
  // `drillTitle` is the cloned drill's name. `programNames` lists
  // the cloning programs (NOT the cloning coaches) — same consent
  // posture as 0073. `drillId` lets the card deep-link to the
  // 0064 share-card admin surface.
  drillTitle?: string;
  programNames?: string[];
  drillId?: string;
}

interface CardProps {
  milestones: ReputationMilestone[];
  onConsume: (milestoneId: string) => void;
  isConsuming?: boolean;
}

/** Per-kind copy line. Each variant instructs positively and never
 *  names a cloning coach (the program-count aggregate is the load-
 *  bearing signal). Voice scan covers every variant in the unit test.
 *
 *  Ticket 0076 — stuck-kind copy renders the cloning program name
 *  (NOT the cloning coach's name) and the cloned drill title.
 *  Numbers spelled out (one / three / eight) per the 0071 / 0073 /
 *  0075 voice posture. */
function copyForKind(
  kind: ReputationMilestoneKind,
  ctx: { drillTitle?: string; programNames?: string[] },
): {
  headline: string;
  detail: string;
} {
  const drillTitle = ctx.drillTitle ?? 'drill';
  const programs = ctx.programNames ?? [];
  switch (kind) {
    case 'clones_3':
      return {
        headline: 'Your work has been cloned 3 times this month.',
        detail: 'Three coaches saved one of your plans — well done.',
      };
    case 'clones_10':
      return {
        headline: 'Your plans have been cloned 10 times this month.',
        detail: 'That is real traction — want to publish another?',
      };
    case 'clones_25':
      return {
        headline: 'Your plans have been cloned 25 times this month.',
        detail: 'Other coaches are running your work — well done.',
      };
    case 'clones_50':
      return {
        headline: 'Your plans have been cloned 50 times this month.',
        detail: 'Your library is shaping how other coaches run practice.',
      };
    case 'programs_2':
      return {
        headline: 'Your work was cloned by a coach in a 2nd program.',
        detail: 'Your plans are travelling outside your home program.',
      };
    case 'programs_4':
      return {
        headline: 'Your work was cloned by coaches in 4 different programs.',
        detail: 'Four programs ran something you wrote — well done.',
      };
    case 'programs_8':
      return {
        headline: 'Your work was cloned by coaches in 8 different programs.',
        detail: 'Eight programs are running your plans — keep publishing.',
      };
    case 'stuck_1': {
      const program = programs[0] ?? 'another program';
      return {
        headline: `Your ${drillTitle} just landed for a coach in the ${program} program.`,
        detail: 'They ran it and thumbed it up — first program where your drill stuck.',
      };
    }
    case 'stuck_3': {
      const list = programs.length > 0
        ? programs.slice(0, 3).join(', ')
        : 'three programs';
      return {
        headline: `Your ${drillTitle} has stuck in a third program.`,
        detail: `${list} have each run it and thumbed it up.`,
      };
    }
    case 'stuck_8':
      return {
        headline: `Your ${drillTitle} has stuck in eight programs this month.`,
        detail: 'Want to publish another drill?',
      };
  }
}

/** Pure presentational card. Renders nothing when milestones is empty. */
export function CoachReputationMilestoneCard({
  milestones,
  onConsume,
  isConsuming,
}: CardProps) {
  if (!milestones || milestones.length === 0) return null;

  const current = milestones[0];
  const remainingCount = milestones.length - 1;
  const copy = copyForKind(current.kind, {
    drillTitle: current.drillTitle,
    programNames: current.programNames,
  });

  // Ticket 0076 — drill-shaped milestones deep-link to the 0064
  // share-card admin surface for the cloned drill. Plan-shaped
  // milestones keep the existing /plans deep-link.
  const isStuckKind =
    current.kind === 'stuck_1' ||
    current.kind === 'stuck_3' ||
    current.kind === 'stuck_8';

  return (
    <div
      data-testid="coach-reputation-milestone-card"
      className="mb-4 rounded-xl border border-orange-500/30 bg-zinc-900 p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/10">
          <Trophy className="h-4 w-4 text-orange-500" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100">{copy.headline}</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">{copy.detail}</p>
          {remainingCount > 0 && (
            <span
              data-testid="coach-reputation-milestone-card-more-pill"
              className="mt-2 inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-300"
            >
              + {remainingCount} more
            </span>
          )}
          <div className="mt-3 flex items-center gap-2">
            {isStuckKind ? (
              <Link
                href={current.drillId ? `/drills/${current.drillId}` : '/drills'}
                data-testid="coach-reputation-milestone-card-open-drill"
                className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
              >
                Open my drill
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            ) : (
              <Link
                href="/plans"
                data-testid="coach-reputation-milestone-card-open-plans"
                className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
              >
                Open my plans
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            )}
            <button
              type="button"
              data-testid="coach-reputation-milestone-card-got-it"
              onClick={() => onConsume(current.id)}
              disabled={!!isConsuming}
              className="inline-flex items-center rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Container that fetches the unconsumed milestones + handles consume.
 *  The /home page mounts this; it does the GET, calls the consume POST,
 *  and optimistically removes the consumed milestone from the local
 *  cache. */
export function CoachReputationMilestoneSection() {
  const queryClient = useQueryClient();
  const [isConsuming, setIsConsuming] = useState(false);

  const { data } = useQuery({
    queryKey: ['coach-reputation-milestones'],
    staleTime: 60 * 1000,
    retry: false,
    queryFn: async (): Promise<{ milestones: ReputationMilestone[] }> => {
      const res = await fetch('/api/coach/reputation-milestones');
      if (!res.ok) return { milestones: [] };
      return (await res.json()) as { milestones: ReputationMilestone[] };
    },
  });

  const milestones = data?.milestones ?? [];
  if (milestones.length === 0) return null;

  async function handleConsume(milestoneId: string) {
    if (isConsuming) return;
    setIsConsuming(true);
    try {
      await fetch('/api/coach/reputation-milestones/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneId }),
      });
      queryClient.setQueryData(
        ['coach-reputation-milestones'],
        (prev: unknown) => {
          const previous =
            (prev as { milestones?: ReputationMilestone[] } | undefined)
              ?.milestones ?? [];
          return { milestones: previous.filter((m) => m.id !== milestoneId) };
        },
      );
    } catch {
      // Best-effort: never throw on the home screen.
    } finally {
      setIsConsuming(false);
    }
  }

  return (
    <CoachReputationMilestoneCard
      milestones={milestones}
      onConsume={handleConsume}
      isConsuming={isConsuming}
    />
  );
}
