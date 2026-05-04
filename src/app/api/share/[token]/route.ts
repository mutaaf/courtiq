import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  // Use service supabase — this is a public route, no auth required
  const supabase = await createServiceSupabase();

  try {
    // Find the share record
    const { data: share } = await supabase
      .from('parent_shares')
      .select('*')
      .eq('share_token', token)
      .eq('is_active', true)
      .single();

    if (!share) {
      return NextResponse.json({ error: 'Share link not found or inactive' }, { status: 404 });
    }

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
    }

    // Check PIN if required
    const { searchParams } = new URL(request.url);
    const pin = searchParams.get('pin');
    if (share.pin && share.pin !== pin) {
      return NextResponse.json({ error: 'PIN required', pinRequired: true }, { status: 403 });
    }

    // Get player info (include parent_name for personalized greeting)
    const { data: player } = await supabase
      .from('players')
      .select('id, name, nickname, position, jersey_number, photo_url, parent_name')
      .eq('id', share.player_id)
      .single();

    // Get team info
    const { data: team } = await supabase
      .from('teams')
      .select('name, age_group, season')
      .eq('id', share.team_id)
      .single();

    // Get coach name
    const { data: coach } = await supabase
      .from('coaches')
      .select('full_name')
      .eq('id', share.coach_id)
      .single();

    // Get org branding
    const { data: teamFull } = await supabase
      .from('teams')
      .select('org_id')
      .eq('id', share.team_id)
      .single();

    let branding = null;
    if (teamFull?.org_id) {
      const { data: b } = await supabase
        .from('org_branding')
        .select('*')
        .eq('org_id', teamFull.org_id)
        .single();
      branding = b;
    }

    // Build the report data based on what's included
    const reportData: Record<string, any> = {
      player,
      team,
      coachName: coach?.full_name,
      branding,
      customMessage: share.custom_message,
    };

    if (share.include_report_card) {
      const { data: reportCards } = await supabase
        .from('plans')
        .select('content_structured, created_at')
        .eq('player_id', share.player_id)
        .eq('type', 'report_card')
        .order('created_at', { ascending: false })
        .limit(1);
      reportData.reportCard = reportCards?.[0]?.content_structured || null;
    }

    if (share.include_development_card) {
      const { data: devCards } = await supabase
        .from('plans')
        .select('content_structured, created_at')
        .eq('player_id', share.player_id)
        .eq('type', 'development_card')
        .order('created_at', { ascending: false })
        .limit(1);
      reportData.developmentCard = devCards?.[0]?.content_structured || null;
    }

    if (share.include_highlights || share.include_observations) {
      const { data: observations } = await supabase
        .from('observations')
        .select('category, sentiment, text, created_at')
        .eq('player_id', share.player_id)
        .eq('sentiment', 'positive')
        .order('created_at', { ascending: false })
        .limit(20);
      reportData.highlights = observations || [];
      // Pick the most recent positive observation as the featured highlight
      if (observations && observations.length > 0) {
        reportData.featuredHighlight = observations[0];
      }
    }

    // Always fetch total observation count + recent observation activity for the
    // "Season Stats" and "Skills on the Rise" sections on the share portal.
    // We fetch the last 90 days with category + created_at (no text) to keep
    // the payload light while still enabling monthly/weekly trend computation.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: allRecentObs, count: totalObsCount } = await supabase
      .from('observations')
      .select('category, created_at, sentiment', { count: 'exact' })
      .eq('player_id', share.player_id)
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: false });
    reportData.totalObservationCount = totalObsCount ?? 0;
    // Include category+date data for skill activity computation on the client
    reportData.recentObservationActivity = (allRecentObs ?? []).map((o: any) => ({
      category: o.category,
      sentiment: o.sentiment,
      created_at: o.created_at,
    }));

    if (share.include_goals) {
      const { data: proficiency } = await supabase
        .from('player_skill_proficiency')
        .select('skill_id, proficiency_level, success_rate, trend, curriculum_skills(name, category)')
        .eq('player_id', share.player_id);
      // Flatten skill name from the join
      reportData.skillProgress = (proficiency || []).map((p: any) => ({
        skill_id: p.skill_id,
        proficiency_level: p.proficiency_level,
        success_rate: p.success_rate,
        trend: p.trend,
        skill_name: p.curriculum_skills?.name || p.skill_id,
        category: p.curriculum_skills?.category || null,
      }));
    }

    if (share.include_drills) {
      const { data: devCard } = await supabase
        .from('plans')
        .select('content_structured')
        .eq('player_id', share.player_id)
        .eq('type', 'development_card')
        .order('created_at', { ascending: false })
        .limit(1);
      const drills = (devCard?.[0]?.content_structured as any)?.recommended_drills || [];
      reportData.recommendedDrills = drills;
    }

    // Always fetch earned achievement badges — shown on the parent portal
    // regardless of share settings to celebrate the player's milestones.
    const { data: achievements } = await supabase
      .from('player_achievements')
      .select('badge_type, awarded_at, note')
      .eq('player_id', share.player_id)
      .order('awarded_at', { ascending: true });
    reportData.achievements = (achievements ?? []).map((a: any) => ({
      badge_type: a.badge_type,
      awarded_at: a.awarded_at,
      note: a.note ?? null,
    }));

    // Most recent AI-generated session message for this player.
    // player_messages plans are team-level; we match by player name.
    let latestSessionMessage = null;
    if (player?.name) {
      const { data: msgPlans } = await supabase
        .from('plans')
        .select('content_structured, created_at')
        .eq('team_id', share.team_id)
        .eq('type', 'player_messages')
        .order('created_at', { ascending: false })
        .limit(5);

      if (msgPlans && msgPlans.length > 0) {
        const playerNameLower = player.name.toLowerCase().trim();
        const playerFirstName = player.name.split(' ')[0].toLowerCase().trim();
        for (const plan of msgPlans) {
          const content = plan.content_structured as any;
          const match = (content?.messages ?? []).find((m: any) => {
            const msgName = (m.player_name || '').toLowerCase().trim();
            return (
              msgName === playerNameLower ||
              msgName === playerFirstName ||
              msgName.startsWith(playerFirstName + ' ')
            );
          });
          if (match) {
            latestSessionMessage = {
              message: match.message,
              highlight: match.highlight,
              next_focus: match.next_focus,
              session_label: content.session_label || '',
            };
            break;
          }
        }
      }
    }
    reportData.latestSessionMessage = latestSessionMessage;

    // Most recent AI-generated skill challenge for this player — shown as
    // "Practice at Home" on the parent portal so parents have actionable
    // home-practice steps without the coach having to do anything extra.
    const { data: skillChallengePlans } = await supabase
      .from('plans')
      .select('content_structured, created_at')
      .eq('player_id', share.player_id)
      .eq('type', 'skill_challenge')
      .order('created_at', { ascending: false })
      .limit(1);
    reportData.skillChallenge = skillChallengePlans?.[0]?.content_structured || null;

    // Player development goals — active and achieved goals give parents concrete
    // targets to celebrate and encourage at home. Archived/stalled goals are hidden.
    const { data: playerGoals } = await supabase
      .from('player_goals')
      .select('id, skill, goal_text, target_level, target_date, status')
      .eq('player_id', share.player_id)
      .in('status', ['active', 'achieved'])
      .order('status', { ascending: true }) // achieved first
      .order('created_at', { ascending: false });
    reportData.playerGoals = (playerGoals ?? []).map((g: any) => ({
      id: g.id,
      skill: g.skill,
      goal_text: g.goal_text,
      target_level: g.target_level ?? null,
      target_date: g.target_date ?? null,
      status: g.status,
    }));

    // Active team announcements (visible to parents)
    const now = new Date().toISOString();
    const { data: announcements } = await supabase
      .from('team_announcements')
      .select('id, title, body, expires_at, created_at')
      .eq('team_id', share.team_id)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false });
    reportData.announcements = announcements ?? [];

    // Increment view count
    await supabase
      .from('parent_shares')
      .update({
        view_count: (share.view_count || 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq('id', share.id);

    return NextResponse.json(reportData);
  } catch (error: any) {
    console.error('Share view error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
