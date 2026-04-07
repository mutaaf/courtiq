'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveTeam } from './use-active-team';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { query, mutate } from '@/lib/api';
import type { Observation } from '@/types/database';

export function useObservations(playerId?: string) {
  const { activeTeamId } = useActiveTeam();

  return useQuery({
    queryKey: playerId
      ? queryKeys.observations.player(playerId)
      : queryKeys.observations.all(activeTeamId || ''),
    queryFn: async () => {
      const filters: Record<string, unknown> = {};
      if (playerId) filters.player_id = playerId;
      else if (activeTeamId) filters.team_id = activeTeamId;

      return query<Observation[]>({
        table: 'observations',
        select: '*, players(name)',
        filters,
        order: { column: 'created_at', ascending: false },
        limit: 100,
      });
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
      const result = await mutate<Observation[]>({
        table: 'observations',
        operation: 'insert',
        data: obs,
      });
      return result[0];
    },
    onSuccess: (obs) => {
      if (activeTeamId) {
        qc.invalidateQueries({ queryKey: queryKeys.observations.all(activeTeamId) });
      }
      if (obs?.player_id) {
        qc.invalidateQueries({ queryKey: queryKeys.observations.player(obs.player_id) });
        qc.invalidateQueries({ queryKey: queryKeys.players.proficiency(obs.player_id) });
        qc.invalidateQueries({ queryKey: queryKeys.reportCards.player(obs.player_id) });
      }
      if (obs?.session_id) {
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
      return mutate<Observation[]>({
        table: 'observations',
        operation: 'insert',
        data: observations,
      });
    },
    onSuccess: () => {
      if (activeTeamId) {
        qc.invalidateQueries({ queryKey: queryKeys.observations.all(activeTeamId) });
        qc.invalidateQueries({ queryKey: queryKeys.reportCards.team(activeTeamId) });
      }
    },
  });
}
