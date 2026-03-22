'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';

export function usePlayerProficiency(playerId: string) {
  return useQuery({
    queryKey: queryKeys.players.proficiency(playerId),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('player_skill_proficiency')
        .select('*')
        .eq('player_id', playerId)
        .is('session_type', null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!playerId,
    ...CACHE_PROFILES.proficiency,
  });
}

export function useSkillProficiency(playerId: string, skillId: string) {
  return useQuery({
    queryKey: queryKeys.players.proficiencySkill(playerId, skillId),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('player_skill_proficiency')
        .select('*')
        .eq('player_id', playerId)
        .eq('skill_id', skillId)
        .is('session_type', null)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!(playerId && skillId),
    ...CACHE_PROFILES.proficiency,
  });
}
