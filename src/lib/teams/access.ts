/**
 * Shared role-gating helpers for the team-management routes (ticket 0053):
 *   - POST /api/teams/[teamId]/archive
 *   - POST /api/teams/[teamId]/unarchive
 *   - DELETE /api/teams/[teamId]
 *
 * The three routes share the same auth + cross-org + role resolution shape;
 * pulling it out as one helper keeps the gating logic auditable in a single
 * place. (LESSONS#39 family — when 3 sibling routes share a primitive,
 * extract once or each edit chases the same audit across all three.)
 *
 * The MUTATING routes still call this once at the top of the handler, then
 * proceed with whatever per-route logic they need (the helper does not run
 * the write itself — that's the route's job).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type CoachRoleAtOrg = 'admin' | 'head_coach' | 'coach' | 'assistant' | 'coordinator';
export type CoachRoleOnTeam = 'head_coach' | 'coach' | 'assistant';

export interface TeamAccessRow {
  /** The team row (or null if the team doesn't exist). */
  team: { id: string; org_id: string; name: string; archived_at: string | null } | null;
  /** The caller's org-level role (null if the caller has no `coaches` row). */
  callerOrgRole: CoachRoleAtOrg | null;
  /** The caller's org_id (null if the caller has no `coaches` row). */
  callerOrgId: string | null;
  /** The caller's team_coaches.role for this team (null if not on the team). */
  callerTeamRole: CoachRoleOnTeam | null;
}

/**
 * Resolves the caller's relationship to the requested team in one round-trip
 * shape. Cross-org safety is enforced HERE: if the team belongs to an org
 * different from the caller's, this function returns `team: null` so the
 * route returns 404 (never 403 — existence never leaks).
 */
export async function resolveTeamAccess(
  admin: SupabaseClient,
  teamId: string,
  userId: string,
): Promise<TeamAccessRow> {
  const { data: callerCoach } = await admin
    .from('coaches')
    .select('org_id, role')
    .eq('id', userId)
    .maybeSingle();
  const callerOrgId = (callerCoach as { org_id?: string } | null)?.org_id ?? null;
  const callerOrgRole =
    ((callerCoach as { role?: CoachRoleAtOrg } | null)?.role as CoachRoleAtOrg | undefined) ?? null;

  const { data: team } = await admin
    .from('teams')
    .select('id, org_id, name, archived_at')
    .eq('id', teamId)
    .maybeSingle();

  if (!team) {
    return { team: null, callerOrgRole, callerOrgId, callerTeamRole: null };
  }

  // Cross-org: pretend the team doesn't exist.
  if (callerOrgId && (team as { org_id: string }).org_id !== callerOrgId) {
    return { team: null, callerOrgRole, callerOrgId, callerTeamRole: null };
  }

  const { data: membership } = await admin
    .from('team_coaches')
    .select('role')
    .eq('team_id', teamId)
    .eq('coach_id', userId)
    .maybeSingle();
  const callerTeamRole =
    ((membership as { role?: CoachRoleOnTeam } | null)?.role as CoachRoleOnTeam | undefined) ?? null;

  return {
    team: team as TeamAccessRow['team'],
    callerOrgRole,
    callerOrgId,
    callerTeamRole,
  };
}

/** Org admin === role IN ('admin', 'head_coach') per the precedent in
 *  src/app/api/config/[domain]/route.ts. */
export function isOrgAdmin(role: CoachRoleAtOrg | null): boolean {
  return role === 'admin' || role === 'head_coach';
}

/** Head-coach-of-this-team. Distinct from org-admin: a team head_coach may
 *  archive their own team but NOT hard-delete it. */
export function isTeamHeadCoach(role: CoachRoleOnTeam | null): boolean {
  return role === 'head_coach';
}

/**
 * Bust the /api/me cache for every coach who was on the given team. The cache
 * key is `me:${user.id}` (LESSONS.md 2026-05-20 #41 — bust-on-mutation, not
 * shorten-TTL). Used by archive / unarchive / delete routes so the team's
 * coaches see their changed roster on next /api/me read.
 */
export async function bustMeCacheForTeamCoaches(
  admin: SupabaseClient,
  teamId: string,
  memBust: (key: string) => void,
): Promise<void> {
  const { data: coaches } = await admin
    .from('team_coaches')
    .select('coach_id')
    .eq('team_id', teamId);
  const ids = (coaches ?? []).map((c: { coach_id?: string }) => c.coach_id).filter(Boolean) as string[];
  for (const id of ids) memBust(`me:${id}`);
}
