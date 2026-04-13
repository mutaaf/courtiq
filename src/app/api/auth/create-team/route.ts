import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { TIER_LIMITS, type Tier } from '@/lib/tier';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { teamName, ageGroup, season } = await request.json();
  if (!teamName) return NextResponse.json({ error: 'teamName required' }, { status: 400 });

  const admin = await createServiceSupabase();

  const { data: coach } = await admin.from('coaches').select('org_id').eq('id', user.id).single();
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  // Get org's selected sport and tier
  const { data: org } = await admin.from('organizations').select('sport_config, tier').eq('id', coach.org_id).single();

  // Tier check: count existing teams for this org
  const orgTier = ((org as any)?.tier || 'free') as Tier;
  const tierLimits = TIER_LIMITS[orgTier];

  const { count: existingTeamCount } = await admin
    .from('teams')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', coach.org_id);

  if ((existingTeamCount || 0) >= tierLimits.maxTeams) {
    return NextResponse.json({
      error: `Your ${orgTier.replace('_', ' ')} plan allows up to ${tierLimits.maxTeams} team${tierLimits.maxTeams === 1 ? '' : 's'}. Please upgrade to add more teams.`,
      upgrade: true,
    }, { status: 403 });
  }
  const sportSlug = (org?.sport_config as any)?.default_sport_slug || 'basketball';

  const { data: sport } = await admin.from('sports').select('id').eq('slug', sportSlug).single();

  // Get default curriculum for this sport
  const { data: curriculum } = await admin.from('curricula')
    .select('id')
    .eq('sport_id', sport?.id)
    .eq('is_default', true)
    .single();

  const { data: team, error: teamError } = await admin.from('teams').insert({
    org_id: coach.org_id,
    sport_id: sport?.id,
    curriculum_id: curriculum?.id || null,
    name: teamName,
    age_group: ageGroup || '8-10',
    season: season || null,
  }).select().single();

  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 });

  await admin.from('team_coaches').insert({
    team_id: team.id,
    coach_id: user.id,
    role: 'head_coach',
  });

  return NextResponse.json({ success: true, teamId: team.id });
}
