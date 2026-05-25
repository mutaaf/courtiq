'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Globe, Loader2, Building2 } from 'lucide-react';

interface DiscoverableData {
  discoverable: boolean;
  hasOrg: boolean;
}

// "List my program in the directory" toggle (ticket 0033).
//
// Lets a program director opt their org into the public /programs directory so a
// cold-searching coach can find it and claim the team they coach. Reads/writes
// ONLY the settings.discoverable flag via the dedicated /api/org/discoverable
// endpoint (the merge + org-ownership check live server-side) — never direct
// Supabase (AGENTS.md rule 3). Default OFF: the org is invisible until the
// director turns it on. Ungated on tier (acquisition surface); gated on the
// caller HAVING an org — when they don't, we render a hint, not a dead toggle.
export function ProgramDiscoveryToggle() {
  const [saving, setSaving] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const { data, refetch } = useQuery<DiscoverableData>({
    queryKey: ['program-discoverable'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/org/discoverable');
        if (!res.ok) return { discoverable: false, hasOrg: false };
        return (await res.json()) as DiscoverableData;
      } catch {
        return { discoverable: false, hasOrg: false };
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  // No org → nothing to list. Surface a hint, not a broken toggle.
  if (data && !data.hasOrg) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
        <Building2 className="h-5 w-5 shrink-0 text-zinc-500" />
        <span>Create your program first to list it in the directory.</span>
      </div>
    );
  }

  const isOn = optimistic ?? data?.discoverable ?? false;

  async function handleToggle() {
    if (saving) return;
    const next = !isOn;
    setOptimistic(next);
    setSaving(true);
    try {
      const res = await fetch('/api/org/discoverable', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discoverable: next }),
      });
      if (!res.ok) throw new Error('failed');
      await refetch();
    } catch {
      // Revert the optimistic flip on failure.
      setOptimistic(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label="List my program in the directory"
      onClick={handleToggle}
      disabled={saving}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left transition-colors hover:border-zinc-700 disabled:opacity-70"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/15">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
          ) : (
            <Globe className="h-4 w-4 text-orange-400" />
          )}
        </span>
        <span className="text-sm font-medium text-zinc-100">
          {isOn ? 'Listed in the directory' : 'List my program in the directory'}
        </span>
      </span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          isOn ? 'bg-orange-500' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
            isOn ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
