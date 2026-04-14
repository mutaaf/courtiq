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

    // Get player info
    const { data: player } = await supabase
      .from('players')
      .select('id, name, nickname, position, jersey_number, photo_url')
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
    }

    if (share.include_goals) {
      const { data: proficiency } = await supabase
        .from('player_skill_proficiency')
        .select('skill_id, proficiency_level, success_rate, trend')
        .eq('player_id', share.player_id);
      reportData.skillProgress = proficiency || [];
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
