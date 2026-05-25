'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { mutate } from '@/lib/api';

interface PriorPlayerCandidate {
  id: string;
  name: string;
  team_name: string;
  season: string;
}

interface PriorSeasonLinkControlProps {
  /** The current-season player whose prior_player_id this control sets/clears. */
  playerId: string;
  /** The player's current prior_player_id (null when not yet linked). */
  priorPlayerId: string | null;
  /** Called after a successful set/clear so the parent can refresh the player. */
  onLinked?: (priorPlayerId: string | null) => void;
}

/**
 * Roster control for the cross-season player link (ticket 0034).
 *
 * Asks the coach, once per returning player, "Did you coach this player last
 * season?" and lets them confirm the link to that player's prior-season `players`
 * row (or clear it). The link is the coach's explicit action — no inference, no
 * fuzzy matching of a minor. The confirmed link lets the parent report thread the
 * prior season's report as a "since last season" growth note.
 *
 * The write goes through the client `mutate()` path (NOT direct Supabase —
 * AGENTS.md rule 3). Candidate prior players come from a server-scoped read that
 * returns only the coach's OWN org's players from other teams, so no other org's
 * roster is ever exposed here.
 *
 * Dark zinc/orange surface; 44px touch targets; clipboard voice (no breathless
 * marketing words, no emoji-decorated heading).
 */
export function PriorSeasonLinkControl({
  playerId,
  priorPlayerId,
  onLinked,
}: PriorSeasonLinkControlProps) {
  const queryClient = useQueryClient();
  const [linkedId, setLinkedId] = useState<string | null>(priorPlayerId);
  const [saving, setSaving] = useState(false);

  const { data: candidates = [], isLoading } = useQuery<PriorPlayerCandidate[]>({
    queryKey: ['prior-player-candidates', playerId],
    queryFn: async () => {
      const res = await fetch(
        `/api/roster/prior-player-candidates?playerId=${encodeURIComponent(playerId)}`
      );
      if (!res.ok) return [];
      const json = await res.json();
      return (json.candidates ?? []) as PriorPlayerCandidate[];
    },
  });

  async function setLink(priorId: string | null) {
    setSaving(true);
    try {
      await mutate({
        table: 'players',
        operation: 'update',
        data: { prior_player_id: priorId },
        filters: { id: playerId },
      });
      setLinkedId(priorId);
      onLinked?.(priorId);
      queryClient.invalidateQueries({ queryKey: ['prior-player-candidates', playerId] });
    } finally {
      setSaving(false);
    }
  }

  const linkedCandidate = candidates.find((c) => c.id === linkedId);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-sm font-medium text-zinc-100">
        Did you coach this player last season?
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        Link them to their prior-season self so the parent report can note how far
        they have come.
      </p>

      {linkedId ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-300">
            Linked to{' '}
            <span className="font-medium text-orange-400">
              {linkedCandidate
                ? `${linkedCandidate.name}${linkedCandidate.season ? ` · ${linkedCandidate.season}` : ''}`
                : 'their prior-season record'}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setLink(null)}
            disabled={saving}
            className="inline-flex min-h-[44px] items-center rounded-md border border-zinc-700 px-3 text-sm text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove link'}
          </button>
        </div>
      ) : isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading returning players…
        </div>
      ) : candidates.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          No returning players from a prior season to link yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {candidates.map((c) => (
            <li key={c.id} data-testid="prior-candidate-option">
              <button
                type="button"
                onClick={() => setLink(c.id)}
                disabled={saving}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-left text-sm text-zinc-200 hover:border-orange-500/50 hover:bg-zinc-800 disabled:opacity-60"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-zinc-500">
                  {[c.team_name, c.season].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
