/**
 * Combined sport + team creation in one round-trip — replaces the legacy
 * /api/auth/select-sport → /api/auth/create-team sequence used by the original
 * 4-step onboarding.
 *
 * Body: { sportSlug, teamName, ageGroup, season }
 *
 * The two old endpoints stay live for backward compatibility while we migrate
 * the onboarding UI; once /onboarding/setup is the only entry point they can
 * be deleted.
 */

import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { TIER_LIMITS, type Tier } from '@/lib/tier';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sportSlug, teamName, ageGroup, season, inviteCoachId } = await request.json();
  if (!sportSlug) return NextResponse.json({ error: 'sportSlug required' }, { status: 400 });
  if (!teamName?.trim()) return NextResponse.json({ error: 'teamName required' }, { status: 400 });

  const admin = await createServiceSupabase();

  // Resolve coach + sport in parallel
  const [coachRes, sportRes] = await Promise.all([
    admin.from('coaches').select('org_id').eq('id', user.id).single(),
    admin.from('sports').select('id').eq('slug', sportSlug).single(),
  ]);

  const coach = coachRes.data;
  const sport = sportRes.data;
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
  if (!sport) return NextResponse.json({ error: 'Sport not found' }, { status: 404 });

  // Tier check + default curriculum lookup in parallel
  const [orgRes, teamCountRes, curriculumRes] = await Promise.all([
    admin.from('organizations').select('tier').eq('id', coach.org_id).single(),
    admin.from('teams').select('id', { count: 'exact', head: true }).eq('org_id', coach.org_id),
    admin.from('curricula').select('id').eq('sport_id', sport.id).eq('is_default', true).single(),
  ]);

  const orgTier = ((orgRes.data as any)?.tier || 'free') as Tier;
  const tierLimits = TIER_LIMITS[orgTier];
  if ((teamCountRes.count || 0) >= tierLimits.maxTeams) {
    // Ticket 0086 — structured tier-limit body (same shape as create-team).
    // Legacy `error` + `upgrade: true` stay byte-identical; the new `code` is
    // the client switch for `<TeamLimitUpgradeSheet />`. Privacy: narrow
    // inviter `.select()` per LESSONS#0036; first-name-only per LESSONS#0061;
    // cross-org inviter resolves to OMITTED invitedBy (no leak).
    let invitedBy: { firstName: string; role: 'head_coach' | 'assistant_coach' } | undefined;
    if (typeof inviteCoachId === 'string' && inviteCoachId.length > 0) {
      const { data: inviter } = await admin
        .from('coaches')
        .select('id, org_id, full_name')
        .eq('id', inviteCoachId)
        .maybeSingle();
      if (inviter && (inviter as any).org_id === coach.org_id) {
        const fullName = ((inviter as any).full_name || '') as string;
        const firstName = fullName.split(' ')[0] || '';
        const { data: tcRow } = await admin
          .from('team_coaches')
          .select('role')
          .eq('coach_id', inviteCoachId)
          .maybeSingle();
        const role = (tcRow as any)?.role === 'head_coach' ? 'head_coach' : 'assistant_coach';
        if (firstName) {
          invitedBy = { firstName, role };
        }
      }
    }
    const body: Record<string, unknown> = {
      error: `Your ${orgTier.replace('_', ' ')} plan allows up to ${tierLimits.maxTeams} team${tierLimits.maxTeams === 1 ? '' : 's'}. Please upgrade to add more teams.`,
      upgrade: true,
      code: 'tier_limit_max_teams',
      currentCount: teamCountRes.count || 0,
      maxCount: tierLimits.maxTeams,
      attemptedTeamName: typeof teamName === 'string' ? teamName.trim() : null,
      currentTier: orgTier,
    };
    if (invitedBy) body.invitedBy = invitedBy;
    return NextResponse.json(body, { status: 403 });
  }

  // Persist sport selection on the org (matches legacy select-sport behavior)
  await admin
    .from('organizations')
    .update({ sport_config: { default_sport_id: sport.id, default_sport_slug: sportSlug } })
    .eq('id', coach.org_id);

  // Create team
  const { data: team, error: teamError } = await admin
    .from('teams')
    .insert({
      org_id: coach.org_id,
      sport_id: sport.id,
      curriculum_id: curriculumRes.data?.id || null,
      name: teamName.trim(),
      age_group: ageGroup || '8-10',
      season: season || null,
    })
    .select()
    .single();

  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 });

  await admin.from('team_coaches').insert({
    team_id: team.id,
    coach_id: user.id,
    role: 'head_coach',
  });

  return NextResponse.json({ success: true, teamId: team.id });
}
