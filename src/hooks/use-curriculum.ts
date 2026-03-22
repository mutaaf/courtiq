'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useActiveTeam } from './use-active-team';
import { CACHE_PROFILES } from '@/lib/query/config';

export function useCurriculum() {
  const { activeTeam } = useActiveTeam();

  return useQuery({
    queryKey: ['curriculum', activeTeam?.curriculum_id],
    queryFn: async () => {
      if (!activeTeam?.curriculum_id) return null;
      const supabase = createClient();

      const [{ data: curriculum }, { data: skills }] = await Promise.all([
        supabase
          .from('curricula')
          .select('*')
          .eq('id', activeTeam.curriculum_id)
          .single(),
        supabase
          .from('curriculum_skills')
          .select('*')
          .eq('curriculum_id', activeTeam.curriculum_id)
          .order('sort_order'),
      ]);

      return {
        curriculum,
        skills: skills || [],
        currentWeek: activeTeam.current_week,
        ageGroup: activeTeam.age_group,
      };
    },
    enabled: !!activeTeam?.curriculum_id,
    ...CACHE_PROFILES.config,
  });
}
