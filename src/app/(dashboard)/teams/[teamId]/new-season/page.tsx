'use client';

/**
 * /teams/[teamId]/new-season — ticket 0052.
 *
 * The single-screen roster-turnover form a head coach uses to open their
 * next season without losing player history. Three radio chips per row
 * (Returning / Released / New), an inline "+ Add player" affordance, an
 * optional "release everyone over age X" bulk action, and the season name +
 * dates at the top.
 *
 * The submit POSTs to /api/teams/[teamId]/new-season which applies the
 * partition atomically server-side. On success we land on /roster with the
 * new season name already showing.
 *
 * Dark zinc/orange aesthetic, mobile-first 44px touch targets, no banned
 * marketing words, no emoji-decorated headings.
 */

import { useState, useMemo, use as usePromise } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useActiveTeam } from '@/hooks/use-active-team';
import { query } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import type { Player } from '@/types/database';

type Status = 'returning' | 'released' | 'new';

type NewPlayerDraft = {
  key: string;
  name: string;
  ageGroup: string;
  position: string;
  jerseyNumber: string;
};

const AGE_GROUP_DEFAULT = '11-13';

export default function NewSeasonPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = usePromise(params);
  const router = useRouter();
  const { activeTeam } = useActiveTeam();

  const [seasonName, setSeasonName] = useState('');
  const [seasonWeeks, setSeasonWeeks] = useState('');
  const [archivePrevious, setArchivePrevious] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // status per current-roster player id
  const [statuses, setStatuses] = useState<Record<string, Status>>({});

  // new-player drafts
  const [newDrafts, setNewDrafts] = useState<NewPlayerDraft[]>([]);

  // Pull the current active roster — uses the standard /api/data path which
  // already excludes released players by default (ticket 0052 sister change).
  const { data: roster = [], isLoading } = useQuery({
    queryKey: queryKeys.players.all(teamId),
    queryFn: () => query<Player[]>({
      table: 'players',
      select: '*',
      filters: { team_id: teamId, is_active: true },
      order: { column: 'name', ascending: true },
    }),
    enabled: !!teamId,
  });

  function setStatus(playerId: string, next: Status) {
    setStatuses((prev) => ({ ...prev, [playerId]: next }));
  }

  function addDraft() {
    setNewDrafts((prev) => [
      ...prev,
      { key: `n-${Date.now()}-${prev.length}`, name: '', ageGroup: AGE_GROUP_DEFAULT, position: '', jerseyNumber: '' },
    ]);
  }

  function updateDraft(key: string, patch: Partial<NewPlayerDraft>) {
    setNewDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function removeDraft(key: string) {
    setNewDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  // Bulk "release all players whose age_group >= X" — the form lets the
  // coach pick the floor age group from a small chip set and flips every
  // matching row to Released. (The release is server-side gated to the
  // route; this is just the UI affordance.)
  const ageGroupsOnRoster = useMemo(
    () => Array.from(new Set(roster.map((p) => p.age_group))).sort(),
    [roster],
  );

  function releaseByAgeGroup(group: string) {
    setStatuses((prev) => {
      const next = { ...prev };
      for (const p of roster) {
        if (p.age_group === group) next[p.id] = 'released';
      }
      return next;
    });
  }

  const returningCount = roster.filter((p) => (statuses[p.id] ?? 'returning') === 'returning').length;
  const releasedCount = roster.filter((p) => statuses[p.id] === 'released').length;
  const newCount = newDrafts.filter((d) => d.name.trim().length > 0).length;

  async function handleSubmit() {
    if (submitting) return;
    if (!seasonName.trim()) {
      setError('Name the new season before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const returningPlayerIds = roster.filter((p) => (statuses[p.id] ?? 'returning') === 'returning').map((p) => p.id);
      const releasePlayerIds = roster.filter((p) => statuses[p.id] === 'released').map((p) => p.id);
      const newPlayers = newDrafts
        .filter((d) => d.name.trim().length > 0)
        .map((d) => ({
          name: d.name.trim(),
          ageGroup: d.ageGroup.trim() || AGE_GROUP_DEFAULT,
          position: d.position.trim() || undefined,
          jerseyNumber: d.jerseyNumber ? Number(d.jerseyNumber) : undefined,
        }));

      const res = await fetch(`/api/teams/${teamId}/new-season`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonName: seasonName.trim(),
          seasonWeeks: seasonWeeks ? Number(seasonWeeks) : undefined,
          archivePreviousSeason: archivePrevious,
          returningPlayerIds,
          releasePlayerIds,
          newPlayers,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || `Request failed (${res.status})`);
      }
      router.push('/roster');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href="/roster" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100" aria-label="Back to roster">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Start the next season</h1>
            <p className="text-xs text-zinc-400">{activeTeam?.name ?? 'Your team'}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-base">Name this season</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label htmlFor="season-name" className="mb-1 block text-xs text-zinc-400">
                Season name
              </label>
              <Input
                id="season-name"
                value={seasonName}
                onChange={(e) => setSeasonName(e.target.value)}
                placeholder="Fall 2026"
                className="min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="season-weeks" className="mb-1 block text-xs text-zinc-400">
                Weeks (optional)
              </label>
              <Input
                id="season-weeks"
                type="number"
                min={1}
                max={52}
                value={seasonWeeks}
                onChange={(e) => setSeasonWeeks(e.target.value)}
                placeholder="10"
                className="min-h-[44px]"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={archivePrevious}
                onChange={(e) => setArchivePrevious(e.target.checked)}
                className="h-5 w-5 accent-orange-500"
              />
              Snapshot the closing season into archives
            </label>
          </CardContent>
        </Card>

        <Card className="mt-6 border-zinc-800 bg-zinc-900">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Your roster
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {returningCount} returning · {releasedCount} released · {newCount} new
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ageGroupsOnRoster.length > 1 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-400">
                <span>Release everyone in age group:</span>
                {ageGroupsOnRoster.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => releaseByAgeGroup(g)}
                    className="min-h-[36px] rounded-md border border-zinc-700 px-2 text-zinc-200 hover:border-orange-500 hover:text-orange-400"
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}

            {isLoading ? (
              <p className="text-sm text-zinc-500">Loading roster…</p>
            ) : roster.length === 0 ? (
              <p className="text-sm text-zinc-500">No active players on this team.</p>
            ) : (
              <ul className="divide-y divide-zinc-800">
                {roster.map((p) => {
                  const status = statuses[p.id] ?? 'returning';
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">{p.name}</p>
                        <p className="text-xs text-zinc-500">{p.age_group}{p.position ? ` · ${p.position}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {(['returning', 'released'] as Status[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setStatus(p.id, s)}
                            aria-pressed={status === s}
                            className={`min-h-[44px] min-w-[44px] rounded-md px-3 text-xs font-medium transition ${
                              status === s
                                ? s === 'released'
                                  ? 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/40'
                                  : 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/40'
                                : 'text-zinc-400 hover:bg-zinc-800'
                            }`}
                          >
                            {s === 'returning' ? 'Returning' : 'Released'}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6 border-zinc-800 bg-zinc-900">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">New players</CardTitle>
            <Button
              type="button"
              onClick={addDraft}
              variant="ghost"
              className="min-h-[44px] text-orange-400 hover:text-orange-300"
            >
              <Plus className="mr-1 h-4 w-4" /> Add player
            </Button>
          </CardHeader>
          <CardContent>
            {newDrafts.length === 0 ? (
              <p className="text-sm text-zinc-500">Add the kids joining for the new season.</p>
            ) : (
              <ul className="space-y-3">
                {newDrafts.map((d) => (
                  <li key={d.key} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-500">New player</p>
                      <button
                        type="button"
                        onClick={() => removeDraft(d.key)}
                        aria-label="Remove"
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Input
                        value={d.name}
                        onChange={(e) => updateDraft(d.key, { name: e.target.value })}
                        placeholder="Name"
                        aria-label="New player name"
                        className="min-h-[44px]"
                      />
                      <Input
                        value={d.ageGroup}
                        onChange={(e) => updateDraft(d.key, { ageGroup: e.target.value })}
                        placeholder="Age group"
                        aria-label="New player age group"
                        className="min-h-[44px]"
                      />
                      <Input
                        value={d.position}
                        onChange={(e) => updateDraft(d.key, { position: e.target.value })}
                        placeholder="Position (optional)"
                        aria-label="New player position"
                        className="min-h-[44px]"
                      />
                      <Input
                        type="number"
                        value={d.jerseyNumber}
                        onChange={(e) => updateDraft(d.key, { jerseyNumber: e.target.value })}
                        placeholder="Jersey # (optional)"
                        aria-label="New player jersey number"
                        className="min-h-[44px]"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}

        <div className="sticky bottom-0 mt-6 -mx-4 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 sm:-mx-6 sm:px-6">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !seasonName.trim()}
            className="min-h-[48px] w-full bg-orange-500 text-zinc-950 hover:bg-orange-400 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting next season…
              </>
            ) : (
              'Start next season'
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
