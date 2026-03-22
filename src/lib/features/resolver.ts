import type { FeatureFlag, OrgFeatureFlag } from '@/types/database';

interface Organization {
  id: string;
  tier: string;
  featureFlags?: Record<string, boolean>;
}

export function isFeatureEnabled(
  flagKey: string,
  org: Organization,
  systemFlags: Record<string, FeatureFlag>,
  orgFlags?: Record<string, boolean>
): boolean {
  // 1. Check explicit org toggle (overrides tier)
  if (orgFlags && orgFlags[flagKey] !== undefined) {
    return orgFlags[flagKey];
  }

  // 2. Check tier entitlement
  const flag = systemFlags[flagKey];
  if (!flag) return false;

  return flag.enabled_tiers.includes(org.tier);
}

export function resolveAllFeatures(
  org: Organization,
  systemFlags: FeatureFlag[],
  orgOverrides: OrgFeatureFlag[]
): Record<string, boolean> {
  const orgMap: Record<string, boolean> = {};
  orgOverrides.forEach((o) => {
    orgMap[o.flag_key] = o.enabled;
  });

  const systemMap: Record<string, FeatureFlag> = {};
  systemFlags.forEach((f) => {
    systemMap[f.flag_key] = f;
  });

  const result: Record<string, boolean> = {};
  systemFlags.forEach((flag) => {
    result[flag.flag_key] = isFeatureEnabled(flag.flag_key, org, systemMap, orgMap);
  });

  return result;
}
