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
import { sendEmail } from '@/lib/email';
import { welcomeEmail } from '@/lib/email/templates';

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

  let coach = coachRes.data;
  const sport = sportRes.data;
  if (!sport) return NextResponse.json({ error: 'Sport not found' }, { status: 404 });

  // Lazy-provision coach + org if the user reached us without going through
  // /api/auth/callback (e.g. Supabase's default email-confirm link drops the
  // user on `/#access_token=...` which never hits our callback). Without
  // this, a verified-by-email signup would dead-end here with "Coach not
  // found".
  if (!coach) {
    const name =
      (user.user_metadata as any)?.full_name ||
      user.email?.split('@')[0] ||
      'Coach';
    const slug =
      name.toLowerCase().replace(/[^\w-]/g, '-').replace(/-+/g, '-') +
      '-' +
      Date.now().toString(36);

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .insert({ name: `${name}'s Organization`, slug })
      .select('id')
      .single();
    if (orgErr || !org) {
      return NextResponse.json(
        { error: orgErr?.message || 'Failed to provision organization' },
        { status: 500 },
      );
    }

    const { error: coachInsertErr } = await admin.from('coaches').insert({
      id: user.id,
      org_id: org.id,
      full_name: name,
      email: user.email!,
      role: 'admin',
      avatar_url: (user.user_metadata as any)?.avatar_url ?? null,
    });
    if (coachInsertErr) {
      return NextResponse.json(
        { error: `Failed to provision coach: ${coachInsertErr.message}` },
        { status: 500 },
      );
    }
    coach = { org_id: org.id };
  }

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

  // Welcome email — fire-and-forget, never blocks the response. Idempotent
  // via coach.preferences.welcome_sent so a retry doesn't double-send.
  (async () => {
    try {
      const { data: coachRow } = await admin
        .from('coaches')
        .select('full_name, email, preferences')
        .eq('id', user.id)
        .single();
      const prefs = (coachRow?.preferences as Record<string, unknown>) || {};
      if (!coachRow || !coachRow.email || prefs.welcome_sent) return;

      const built = welcomeEmail({
        coachName: coachRow.full_name || 'Coach',
        teamName: teamName.trim(),
      });
      await sendEmail({
        to: coachRow.email,
        subject: built.subject,
        html: built.html,
        tag: 'welcome',
        unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://youthsportsiq.com'}/settings/profile`,
      });
      await admin
        .from('coaches')
        .update({ preferences: { ...prefs, welcome_sent: new Date().toISOString() } })
        .eq('id', user.id);
    } catch (err) {
      console.warn('[welcome-email] failed:', err instanceof Error ? err.message : err);
    }
  })();

  return NextResponse.json({ success: true, teamId: team.id });
}
