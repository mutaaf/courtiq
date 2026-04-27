'use client';

import { useAppStore } from '@/lib/store';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';

export function useActiveTeam() {
  const activeTeamId = useAppStore((s) => s.activeTeamId);
  const setActiveTeamId = useAppStore((s) => s.setActiveTeamId);

  const { data: meData } = useQuery({
    queryKey: queryKeys.teams.all(),
    queryFn: async () => {
      const res = await fetch('/api/me');
      if (!res.ok) return { teams: [], coach: null };
      return res.json();
    },
    ...CACHE_PROFILES.roster,
  });

  const teams = meData?.teams || [];
  const activeTeam = teams.find((t: any) => t.id === activeTeamId) || teams[0] || null;

  return {
    activeTeam,
    activeTeamId: activeTeam?.id || null,
    teams,
    setActiveTeamId,
    coach: meData?.coach || null,
    aiPlatformAvailable: meData?.aiPlatformAvailable ?? false,
  };
}
