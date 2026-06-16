import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { TIER_LIMITS, type Tier } from '@/lib/tier';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { teamName, ageGroup, season, inviteCoachId } = await request.json();
  if (!teamName) return NextResponse.json({ error: 'teamName required' }, { status: 400 });

  const admin = await createServiceSupabase();

  const { data: coach } = await admin.from('coaches').select('org_id').eq('id', user.id).single();
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  // Get org's selected sport and tier
  const { data: org } = await admin.from('organizations').select('sport_config, tier').eq('id', coach.org_id).single();

  // Tier check: count existing teams for this org
  const orgTier = ((org as any)?.tier || 'free') as Tier;
  const tierLimits = TIER_LIMITS[orgTier];

  // Ticket 0053: the maxTeams pre-check counts ACTIVE teams only. An archived
  // team (the soft-delete primitive admins use to take a mistake-team off the
  // dashboard) does not consume a roster slot — without this filter, an org
  // that cleaned up one bad row could still hit the tier ceiling on the next
  // create-team attempt.
  const { count: existingTeamCount } = await admin
    .from('teams')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', coach.org_id)
    .is('archived_at', null);

  if ((existingTeamCount || 0) >= tierLimits.maxTeams) {
    // Ticket 0086 — structured tier-limit body so the client can render the
    // contextual `<TeamLimitUpgradeSheet />` instead of the flat error toast.
    // The legacy `error` string + `upgrade: true` are BYTE-IDENTICAL so every
    // unmodified caller keeps degrading to the toast (LESSONS#0103).
    //
    // Privacy: the inviter `.select()` is the narrow allow-list
    // `id, org_id, full_name` (LESSONS#0036) — never email/phone/DOB. Only the
    // inviter's first name (literal-space split per LESSONS#0061) ever leaves
    // the route. A cross-org `inviteCoachId` (different `org_id`) omits the
    // entire block — we never leak another org's coach name.
    let invitedBy: { firstName: string; role: 'head_coach' | 'assistant_coach' } | undefined;
    if (typeof inviteCoachId === 'string' && inviteCoachId.length > 0) {
      const { data: inviter } = await admin
        .from('coaches')
        .select('id, org_id, full_name')
        .eq('id', inviteCoachId)
        .maybeSingle();
      if (inviter && (inviter as any).org_id === coach.org_id) {
        const fullName = ((inviter as any).full_name || '') as string;
        // Literal space split per LESSONS#0061 — surname never leaves the route.
        const firstName = fullName.split(' ')[0] || '';
        // Derive role from the inviter's team_coaches row for any team they're
        // on; default to assistant_coach when no row exists (the ticket's
        // documented deviation — schema wins over invite-token prose per
        // LESSONS#0096 / Implementation log).
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
      currentCount: existingTeamCount || 0,
      maxCount: tierLimits.maxTeams,
      attemptedTeamName: typeof teamName === 'string' ? teamName : null,
      currentTier: orgTier,
    };
    if (invitedBy) body.invitedBy = invitedBy;
    return NextResponse.json(body, { status: 403 });
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
