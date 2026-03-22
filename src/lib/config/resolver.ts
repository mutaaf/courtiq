import type { Json } from '@/types/database';

export type ConfigScope = 'system' | 'org' | 'team';

interface ResolveConfigParams {
  domain: string;
  key: string;
  systemDefaults: Record<string, Record<string, unknown>>;
  orgOverrides: Record<string, unknown>;
  teamOverrides: Record<string, unknown>;
}

export function resolveConfig<T = unknown>(params: ResolveConfigParams): T {
  const { domain, key, systemDefaults, orgOverrides, teamOverrides } = params;
  const fullKey = `${domain}.${key}`;

  // Team override takes precedence
  if (fullKey in teamOverrides && teamOverrides[fullKey] !== null && teamOverrides[fullKey] !== undefined) {
    return teamOverrides[fullKey] as T;
  }

  // Then org override
  if (fullKey in orgOverrides && orgOverrides[fullKey] !== null && orgOverrides[fullKey] !== undefined) {
    return orgOverrides[fullKey] as T;
  }

  // Fall back to system default
  return (systemDefaults[domain]?.[key] ?? null) as T;
}

export function getConfigSource(params: ResolveConfigParams): ConfigScope {
  const { domain, key, orgOverrides, teamOverrides } = params;
  const fullKey = `${domain}.${key}`;

  if (fullKey in teamOverrides && teamOverrides[fullKey] !== null && teamOverrides[fullKey] !== undefined) {
    return 'team';
  }
  if (fullKey in orgOverrides && orgOverrides[fullKey] !== null && orgOverrides[fullKey] !== undefined) {
    return 'org';
  }
  return 'system';
}

export interface EffectiveConfig<T = unknown> {
  value: T;
  source: ConfigScope;
}

export function resolveConfigWithSource<T = unknown>(params: ResolveConfigParams): EffectiveConfig<T> {
  return {
    value: resolveConfig<T>(params),
    source: getConfigSource(params),
  };
}

// Server-side resolver that reads from DB
export async function resolveConfigFromDB(
  domain: string,
  key: string,
  context: { orgId: string; teamId?: string },
  supabase: any
): Promise<EffectiveConfig> {
  // Get system defaults from sports table
  const { data: sport } = await supabase
    .from('sports')
    .select('*')
    .limit(1)
    .single();

  const systemDefaults: Record<string, Record<string, unknown>> = {
    sport: {
      categories: sport?.default_categories || [],
      positions: sport?.default_positions || [],
      age_groups: sport?.default_age_groups || [],
      drill_categories: sport?.drill_categories || [],
      terminology: sport?.terminology || {},
    },
  };

  // Get org overrides
  const { data: orgOverrides } = await supabase
    .from('config_overrides')
    .select('domain, key, value')
    .eq('org_id', context.orgId)
    .is('team_id', null);

  const orgMap: Record<string, unknown> = {};
  (orgOverrides || []).forEach((o: any) => {
    orgMap[`${o.domain}.${o.key}`] = o.value;
  });

  // Get team overrides
  const teamMap: Record<string, unknown> = {};
  if (context.teamId) {
    const { data: teamOverrides } = await supabase
      .from('config_overrides')
      .select('domain, key, value')
      .eq('team_id', context.teamId);

    (teamOverrides || []).forEach((o: any) => {
      teamMap[`${o.domain}.${o.key}`] = o.value;
    });
  }

  return resolveConfigWithSource({
    domain,
    key,
    systemDefaults,
    orgOverrides: orgMap,
    teamOverrides: teamMap,
  });
}
