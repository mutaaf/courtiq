import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug) {
    return NextResponse.json({ error: 'Slug required' }, { status: 400 });
  }

  const supabase = await createServiceSupabase();

  try {
    // Fetch org by slug — public info only
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, slug, sport_config, settings, created_at')
      .eq('slug', slug)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Fetch branding
    const { data: branding } = await supabase
      .from('org_branding')
      .select('logo_light_url, logo_dark_url, primary_color, secondary_color, parent_portal_header_text')
      .eq('org_id', org.id)
      .single();

    // Fetch active teams with sport info
    const { data: teams } = await supabase
      .from('teams')
      .select('id, name, age_group, season, sport_id')
      .eq('org_id', org.id)
      .eq('is_active', true)
      .order('name');

    // Count coaches (non-sensitive: just a number)
    const { count: coachCount } = await supabase
      .from('coaches')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org.id);

    // Count active players (non-sensitive: just a number)
    const teamIds = (teams ?? []).map((t) => t.id);
    let playerCount = 0;
    if (teamIds.length > 0) {
      const { count } = await supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .in('team_id', teamIds)
        .eq('is_active', true);
      playerCount = count ?? 0;
    }

    return NextResponse.json({
      org: {
        name: org.name,
        slug: org.slug,
        created_at: org.created_at,
      },
      branding: branding ?? null,
      teams: teams ?? [],
      stats: {
        coaches: coachCount ?? 0,
        players: playerCount,
        teams: (teams ?? []).length,
      },
    });
  } catch (err) {
    console.error('[api/org/slug] error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
