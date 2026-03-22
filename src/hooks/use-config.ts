'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useActiveTeam } from './use-active-team';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { SYSTEM_DEFAULTS } from '@/lib/config/defaults';
import { resolveConfig } from '@/lib/config/resolver';

export function useConfig<T = unknown>(domain: string, key: string): T {
  const { activeTeam } = useActiveTeam();
  const orgId = activeTeam?.org_id;
  const teamId = activeTeam?.id;

  const { data } = useQuery({
    queryKey: queryKeys.config.resolved(orgId || '', teamId || '', domain),
    queryFn: async () => {
      if (!orgId) return null;
      const supabase = createClient();

      // Get org overrides
      const { data: orgOverrides } = await supabase
        .from('config_overrides')
        .select('domain, key, value')
        .eq('org_id', orgId)
        .is('team_id', null);

      const orgMap: Record<string, unknown> = {};
      (orgOverrides || []).forEach((o: any) => {
        orgMap[`${o.domain}.${o.key}`] = o.value;
      });

      // Get team overrides
      const teamMap: Record<string, unknown> = {};
      if (teamId) {
        const { data: teamOverrides } = await supabase
          .from('config_overrides')
          .select('domain, key, value')
          .eq('team_id', teamId);

        (teamOverrides || []).forEach((o: any) => {
          teamMap[`${o.domain}.${o.key}`] = o.value;
        });
      }

      return resolveConfig<T>({
        domain,
        key,
        systemDefaults: SYSTEM_DEFAULTS as any,
        orgOverrides: orgMap,
        teamOverrides: teamMap,
      });
    },
    enabled: !!orgId,
    ...CACHE_PROFILES.config,
  });

  // Fallback to system default
  return (data ?? (SYSTEM_DEFAULTS as any)[domain]?.[key] ?? null) as T;
}

export function useFeatureFlag(flagKey: string): boolean {
  const { activeTeam } = useActiveTeam();
  const orgId = activeTeam?.org_id;

  const { data } = useQuery({
    queryKey: ['features', orgId, flagKey],
    queryFn: async () => {
      if (!orgId) return false;
      const supabase = createClient();

      const [{ data: flag }, { data: orgFlag }] = await Promise.all([
        supabase.from('feature_flags').select('*').eq('flag_key', flagKey).single(),
        supabase.from('org_feature_flags').select('*').eq('org_id', orgId).eq('flag_key', flagKey).single(),
      ]);

      if (orgFlag) return orgFlag.enabled;
      if (!flag) return false;

      // Check tier
      const { data: org } = await supabase
        .from('organizations')
        .select('tier')
        .eq('id', orgId)
        .single();

      return flag.enabled_tiers.includes(org?.tier || 'free');
    },
    enabled: !!orgId,
    ...CACHE_PROFILES.features,
  });

  return data ?? false;
}
