import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

export async function POST(request: Request) {
  // Use server supabase only for auth check
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Use service role for all DB operations (bypasses RLS)
  const supabase = await createServiceSupabase();

  const body = await request.json();
  const {
    playerId,
    teamId,
    pin,
    expirationDays,
    includeObservations = false,
    includeDevelopmentCard = true,
    includeReportCard = true,
    includeHighlights = true,
    includeGoals = true,
    includeDrills = true,
    includeCoachNote = true,
    includeSkillChallenges = true,
    customMessage,
  } = body;

  if (!playerId || !teamId) {
    return NextResponse.json({ error: 'playerId and teamId required' }, { status: 400 });
  }

  try {
    // Verify player belongs to team
    const { data: player } = await supabase
      .from('players')
      .select('id, name')
      .eq('id', playerId)
      .eq('team_id', teamId)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found in team' }, { status: 404 });
    }

    // Generate a unique share token
    const shareToken = randomBytes(16).toString('hex');

    const expiresAt = expirationDays
      ? new Date(Date.now() + expirationDays * 86400 * 1000).toISOString()
      : null;

    const { data: share, error } = await supabase
      .from('parent_shares')
      .insert({
        player_id: playerId,
        team_id: teamId,
        coach_id: user.id,
        share_token: shareToken,
        pin: pin || null,
        include_observations: includeObservations,
        include_development_card: includeDevelopmentCard,
        include_report_card: includeReportCard,
        include_highlights: includeHighlights,
        include_goals: includeGoals,
        include_drills: includeDrills,
        include_coach_note: includeCoachNote,
        include_skill_challenges: includeSkillChallenges,
        custom_message: customMessage || null,
        is_active: true,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      share,
      shareUrl: `/share/${shareToken}`,
      token: shareToken,
    });
  } catch (error: any) {
    console.error('Share create error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
