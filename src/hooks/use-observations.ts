'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useActiveTeam } from './use-active-team';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import type { Observation } from '@/types/database';

export function useObservations(playerId?: string) {
  const { activeTeamId } = useActiveTeam();

  return useQuery({
    queryKey: playerId
      ? queryKeys.observations.player(playerId)
      : queryKeys.observations.all(activeTeamId || ''),
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from('observations')
        .select('*, players(name)')
        .order('created_at', { ascending: false });

      if (playerId) {
        query = query.eq('player_id', playerId);
      } else if (activeTeamId) {
        query = query.eq('team_id', activeTeamId);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!(activeTeamId || playerId),
    ...CACHE_PROFILES.observations,
  });
}

export function useCreateObservation() {
  const qc = useQueryClient();
  const { activeTeamId } = useActiveTeam();

  return useMutation({
    mutationFn: async (obs: Partial<Observation>) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('observations')
        .insert(obs)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (obs) => {
      if (activeTeamId) {
        qc.invalidateQueries({ queryKey: queryKeys.observations.all(activeTeamId) });
      }
      if (obs.player_id) {
        qc.invalidateQueries({ queryKey: queryKeys.observations.player(obs.player_id) });
        qc.invalidateQueries({ queryKey: queryKeys.players.proficiency(obs.player_id) });
        qc.invalidateQueries({ queryKey: queryKeys.reportCards.player(obs.player_id) });
      }
      if (obs.session_id) {
        qc.invalidateQueries({ queryKey: queryKeys.observations.session(obs.session_id) });
      }
    },
  });
}

export function useBulkCreateObservations() {
  const qc = useQueryClient();
  const { activeTeamId } = useActiveTeam();

  return useMutation({
    mutationFn: async (observations: Partial<Observation>[]) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('observations')
        .insert(observations)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      if (activeTeamId) {
        qc.invalidateQueries({ queryKey: queryKeys.observations.all(activeTeamId) });
        qc.invalidateQueries({ queryKey: queryKeys.reportCards.team(activeTeamId) });
      }
    },
  });
}
