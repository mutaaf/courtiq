'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, ChevronDown, ChevronUp } from 'lucide-react';

interface CloneCountResponse {
  count: number;
  byPlan: Array<{ plan_id: string; plan_title: string; count: number }>;
  lastSeenCount: number;
}

// Home card that tells the publishing coach how many other coaches cloned their
// practice plans this week (ticket 0049). Renders nothing on count: 0 or when
// count <= lastSeenCount (already acknowledged) so /home stays calm.
//
// Auto-dismiss-on-view: on first render with count > lastSeenCount, the card
// POSTs the seen route to advance the bookmark — mirrors 0047's celebration-card
// pattern but stores the bookmark in coaches.preferences (no new column).
//
// Privacy: the response carries NO cloning-coach identity. The publisher sees
// the COUNT and the per-plan title (their OWN plan's title), nothing about who
// cloned. This is enforced server-side in /api/practice-plan-shares/clone-count.
export function PlanClonesCard() {
  const [expanded, setExpanded] = useState(false);
  const seenPosted = useRef(false);

  const { data } = useQuery<CloneCountResponse>({
    queryKey: ['practice-plan-clone-count'],
    queryFn: async () => {
      const res = await fetch('/api/practice-plan-shares/clone-count');
      if (!res.ok) throw new Error('Failed to load clone count');
      return (await res.json()) as CloneCountResponse;
    },
    staleTime: 5 * 60_000,
  });

  // Advance the bookmark once per mount when there are fresh clones to show.
  useEffect(() => {
    if (!data) return;
    if (seenPosted.current) return;
    if (data.count <= 0) return;
    if (data.count <= data.lastSeenCount) return;
    seenPosted.current = true;
    fetch('/api/practice-plan-shares/clone-count/seen', { method: 'POST' }).catch(() => {
      // Best-effort — a failed seen POST just means the card may show again
      // on the next /home load; never blocks the render.
    });
  }, [data]);

  if (!data) return null;
  if (data.count <= 0) return null;
  if (data.count <= data.lastSeenCount) return null;

  return (
    <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-label={expanded ? 'Hide per-plan clone breakdown' : 'Show per-plan clone breakdown'}
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/20">
            <Users className="h-5 w-5 text-orange-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
              Coaches who cloned your plans
            </p>
            <p className="mt-0.5 text-sm font-bold text-zinc-100 leading-snug">
              {data.count} {data.count === 1 ? 'coach saved' : 'coaches saved'} your practice plan this week
            </p>
          </div>
        </div>
        <span className="shrink-0 text-zinc-500">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {expanded && data.byPlan.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs text-zinc-300">
          {data.byPlan.map((row) => (
            <li
              key={row.plan_id}
              className="flex items-center justify-between gap-3 rounded-lg bg-zinc-900/60 px-3 py-2"
            >
              <span className="truncate">{row.plan_title || 'Untitled practice plan'}</span>
              <span className="shrink-0 text-orange-300 font-semibold">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
