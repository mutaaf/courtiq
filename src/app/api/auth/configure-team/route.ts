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

  const { sportSlug, teamName, ageGroup, season } = await request.json();
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
    return NextResponse.json(
      {
        error: `Your ${orgTier.replace('_', ' ')} plan allows up to ${tierLimits.maxTeams} team${tierLimits.maxTeams === 1 ? '' : 's'}. Please upgrade to add more teams.`,
        upgrade: true,
      },
      { status: 403 },
    );
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
