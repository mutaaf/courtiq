'use client';

import { useAppStore } from '@/lib/store';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';

export function useActiveTeam() {
  const activeTeamId = useAppStore((s) => s.activeTeamId);
  const setActiveTeamId = useAppStore((s) => s.setActiveTeamId);

  const { data: teams = [] } = useQuery({
    queryKey: queryKeys.teams.all(),
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from('team_coaches')
        .select('team_id, role, teams(*)')
        .eq('coach_id', user.id);
      return (data || []).map((tc: any) => ({ ...tc.teams, coachRole: tc.role }));
    },
    ...CACHE_PROFILES.roster,
  });

  const activeTeam = teams.find((t: any) => t.id === activeTeamId) || teams[0] || null;

  return {
    activeTeam,
    activeTeamId: activeTeam?.id || null,
    teams,
    setActiveTeamId,
  };
}
