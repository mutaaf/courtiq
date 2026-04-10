'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, Loader2 } from 'lucide-react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';

export function TeamSwitcher({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { activeTeam, teams, setActiveTeamId } = useActiveTeam();
  const [showCreate, setShowCreate] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newAgeGroup, setNewAgeGroup] = useState('8-10');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!newTeamName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/auth/create-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName: newTeamName.trim(),
          ageGroup: newAgeGroup,
          season: 'Spring 2026',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        qc.invalidateQueries({ queryKey: queryKeys.teams.all() });
        setActiveTeamId(data.teamId);
        setShowCreate(false);
        setNewTeamName('');
      }
    } catch {
      // silently fail
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <select
          value={activeTeam?.id || ''}
          onChange={(e) => {
            if (e.target.value === '__create__') {
              setShowCreate(true);
            } else {
              setActiveTeamId(e.target.value);
            }
          }}
          className={`w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-800 pr-8 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 ${
            compact ? 'px-2 py-1.5' : 'px-3 py-2'
          }`}
        >
          {teams.length === 0 && (
            <option value="" disabled>No teams yet</option>
          )}
          {teams.map((team: any) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
          <option value="__create__">+ New Team</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      </div>

      {showCreate && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-3 space-y-2">
          <input
            type="text"
            placeholder="Team name"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            className="w-full rounded-md border border-zinc-600 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
          />
          <select
            value={newAgeGroup}
            onChange={(e) => setNewAgeGroup(e.target.value)}
            className="w-full rounded-md border border-zinc-600 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100"
          >
            <option value="5-7">Ages 5-7</option>
            <option value="8-10">Ages 8-10</option>
            <option value="11-13">Ages 11-13</option>
            <option value="14-18">Ages 14-18</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newTeamName.trim() || creating}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewTeamName(''); }}
              className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
