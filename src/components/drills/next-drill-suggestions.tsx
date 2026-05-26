'use client';

/**
 * <NextDrillSuggestions drillId sport />
 *
 * Ticket 0044 — drill detail page block: "Coaches who liked this drill in
 * {sport} ran:" + up to three rows with the next drill's title and the
 * count of coaches who ran it next.
 *
 * Renders NOTHING when:
 *   - the server returns an empty array (no suggestion met the >=5 floor),
 *   - the caller has previously dismissed suggestions for THIS drill (a
 *     `coach_drill_signals` row with `signal_type = 'dismiss_suggestion'`).
 *
 * The drill-detail page is byte-identical between the two empty states; the
 * component returns `null` (no wrapper, no testid, no copy) so the page
 * layout doesn't shift.
 *
 * Writes are routed through the client `mutate()` helper from
 * `src/lib/api.ts` (AGENTS.md rule 3 — NEVER direct Supabase from a client
 * component). The dismiss insert is also POST-shaped: `data` carries the
 * minimum keys the table needs (drill_id, signal_type) plus a `rating`
 * default of 'down' so the existing CHECK on the 0039 column is satisfied
 * (the new signal_type CHECK is independent and rejects anything outside
 * the two-value allow-list).
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListChecks } from 'lucide-react';
import type { CoachDrillSignal } from '@/types/database';

interface Props {
  drillId: string;
  sport: string;
}

interface Suggestion {
  next_drill_id: string;
  next_drill_title: string;
  coach_count: number;
  sport: string;
}

interface SuggestionsResponse {
  suggestions: Suggestion[];
}

export function NextDrillSuggestions({ drillId, sport }: Props) {
  // Local optimistic dismiss flag so the surface hides immediately on tap
  // even before the mutate() round-trip completes.
  const [optimisticDismissed, setOptimisticDismissed] = useState(false);

  // 1. The suggestions themselves (route enforces >=5 floor + top-3).
  const { data: suggestionsData } = useQuery({
    queryKey: ['drill-sequence-suggestions', drillId, sport],
    queryFn: async (): Promise<SuggestionsResponse> => {
      const res = await fetch(
        `/api/drill-sequence-suggestions?drillId=${encodeURIComponent(drillId)}&sport=${encodeURIComponent(sport)}`,
      );
      if (!res.ok) return { suggestions: [] };
      return (await res.json()) as SuggestionsResponse;
    },
    enabled: !!drillId && !!sport,
    staleTime: 5 * 60 * 1000,
  });

  // 2. Whether the caller has a dismiss_suggestion row for THIS drill. The
  // route's RLS service-role is fronted by /api/data, so this is the
  // sanctioned read path (AGENTS.md rule 3).
  const { data: dismissRows = [] } = useQuery({
    queryKey: ['drill-sequence-dismiss', drillId],
    queryFn: () =>
      query<Pick<CoachDrillSignal, 'coach_id' | 'drill_id' | 'signal_type'>[]>({
        table: 'coach_drill_signals',
        select: 'coach_id,drill_id,signal_type',
        filters: { drill_id: drillId, signal_type: 'dismiss_suggestion' },
      }),
    enabled: !!drillId,
    staleTime: 5 * 60 * 1000,
  });

  const suggestions = useMemo(() => suggestionsData?.suggestions ?? [], [suggestionsData]);
  const dismissed = optimisticDismissed || dismissRows.length > 0;

  if (dismissed || suggestions.length === 0) return null;

  async function handleHide() {
    // Optimistic: hide the surface immediately so the tap feels instant.
    setOptimisticDismissed(true);
    try {
      await mutate({
        table: 'coach_drill_signals',
        operation: 'insert',
        data: {
          drill_id: drillId,
          signal_type: 'dismiss_suggestion',
          // The 0039 rating CHECK requires 'up' or 'down'; we pick 'down'
          // for a dismiss because it's the closer-to-neutral signal and
          // the cron's SELECT filters on `rating='up'` so a dismiss row
          // is automatically excluded from the aggregate input.
          rating: 'down',
        },
      });
    } catch {
      // A real failure (e.g. offline) reverts the optimistic state so the
      // coach sees the surface again on the next read.
      setOptimisticDismissed(false);
    }
  }

  return (
    <Card
      data-testid="next-drill-suggestions"
      className="border-zinc-800/60"
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-orange-400" />
          Coaches who liked this drill in {sport} ran:
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <ul className="space-y-2">
          {suggestions.slice(0, 3).map((s) => (
            <li
              key={s.next_drill_id}
              className="flex items-baseline justify-between gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5"
            >
              <span className="text-sm font-medium text-zinc-100">{s.next_drill_title}</span>
              <span className="text-xs text-zinc-400 whitespace-nowrap">{s.coach_count} coaches</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={handleHide}
          className="text-xs text-zinc-500 underline-offset-2 hover:underline min-h-[44px]"
        >
          Hide these suggestions
        </button>
      </CardContent>
    </Card>
  );
}
