import { resolveConfig } from '@/lib/config/resolver';
import { canAccess, type Tier } from '@/lib/tier';

// Ticket 0031 — shared resolver for the program director's org-scoped weekly
// focus, read THROUGH the existing System→Org→Team config cascade (org override,
// domain `program` / key `focus`). Used by the plan + practice-arc routes so both
// thread the SAME focus into the prompt as a soft hint (one source of truth).
//
// The focus is org-direction config only. This helper reads org config, never a
// `players` row, so it can carry no per-minor data (COPPA / data-minimization).

export const PROGRAM_FOCUS_DOMAIN = 'program';
export const PROGRAM_FOCUS_KEY = 'focus';

type Admin = {
  from: (table: string) => any;
};

/**
 * Resolve the program weekly focus for the team's org, gated by the org tier.
 *
 * Returns the trimmed focus string when the org is on a tier that includes
 * `feature_program_focus` (Organization) AND a focus is set; otherwise null.
 * Best-effort: any read failure resolves to null so plan generation is never
 * blocked by this lookup.
 */
export async function readProgramFocus(teamId: string, admin: Admin): Promise<string | null> {
  try {
    const { data: team } = await admin
      .from('teams')
      .select('org_id, organizations(tier)')
      .eq('id', teamId)
      .single();

    const orgId = (team as any)?.org_id as string | undefined;
    const tier = (((team as any)?.organizations?.tier) || 'free') as Tier;
    if (!orgId) return null;

    // The focus is an Organization-tier surface; do not thread it for other tiers.
    if (!canAccess(tier, 'feature_program_focus')) return null;

    const { data: orgOverrides } = await admin
      .from('config_overrides')
      .select('domain, key, value')
      .eq('org_id', orgId)
      .is('team_id', null);

    const orgMap: Record<string, unknown> = {};
    (orgOverrides || []).forEach((o: any) => {
      orgMap[`${o.domain}.${o.key}`] = o.value;
    });

    const resolved = resolveConfig<unknown>({
      domain: PROGRAM_FOCUS_DOMAIN,
      key: PROGRAM_FOCUS_KEY,
      systemDefaults: {},
      orgOverrides: orgMap,
      teamOverrides: {},
    });

    const value = typeof resolved === 'string' ? resolved.trim() : null;
    return value || null;
  } catch {
    return null;
  }
}
