'use client';

import { ChevronDown, Plus } from 'lucide-react';
import { useActiveTeam } from '@/hooks/use-active-team';

export function TeamSwitcher({ compact }: { compact?: boolean }) {
  const { activeTeam, teams, setActiveTeamId } = useActiveTeam();

  if (teams.length === 0) {
    return (
      <div className="text-sm text-zinc-500">No teams yet</div>
    );
  }

  return (
    <div className="relative">
      <select
        value={activeTeam?.id || ''}
        onChange={(e) => setActiveTeamId(e.target.value)}
        className={`w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-800 pr-8 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 ${
          compact ? 'px-2 py-1' : 'px-3 py-2'
        }`}
      >
        {teams.map((team: any) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
    </div>
  );
}
