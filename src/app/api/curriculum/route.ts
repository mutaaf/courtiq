import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  try {
    // Get team with curriculum reference
    const { data: team } = await supabase
      .from('teams')
      .select('id, curriculum_id, current_week, season_weeks, age_group')
      .eq('id', teamId)
      .single();

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    if (!team.curriculum_id) {
      return NextResponse.json({ error: 'No curriculum assigned to team' }, { status: 404 });
    }

    // Get curriculum details
    const { data: curriculum } = await supabase
      .from('curricula')
      .select('*')
      .eq('id', team.curriculum_id)
      .single();

    // Get all skills for this curriculum
    const { data: skills } = await supabase
      .from('curriculum_skills')
      .select('*')
      .eq('curriculum_id', team.curriculum_id)
      .order('sort_order', { ascending: true });

    // Filter skills relevant to the team's age group
    const relevantSkills = (skills || []).filter(
      (s: any) => !s.age_groups?.length || s.age_groups.includes(team.age_group)
    );

    // Group skills by category
    const categories: Record<string, any[]> = {};
    for (const skill of relevantSkills) {
      if (!categories[skill.category]) {
        categories[skill.category] = [];
      }
      categories[skill.category].push(skill);
    }

    return NextResponse.json({
      curriculum,
      skills: relevantSkills,
      categories,
      currentWeek: team.current_week,
      totalWeeks: team.season_weeks,
    });
  } catch (error: any) {
    console.error('Curriculum error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
