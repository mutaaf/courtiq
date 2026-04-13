import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId, drill } = body;

  if (!teamId || !drill?.name) {
    return NextResponse.json({ error: 'teamId and drill.name are required' }, { status: 400 });
  }

  try {
    const [teamResult, coachResult] = await Promise.all([
      admin.from('teams').select('sport_id').eq('id', teamId).single(),
      admin.from('coaches').select('org_id').eq('id', user.id).single(),
    ]);

    if (!teamResult.data) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const { data: newDrill, error } = await admin
      .from('drills')
      .insert({
        sport_id: teamResult.data.sport_id,
        org_id: coachResult.data?.org_id || null,
        coach_id: user.id,
        name: drill.name,
        description: drill.description || '',
        category: drill.category || 'Fundamentals',
        age_groups: Array.isArray(drill.age_groups) ? drill.age_groups : [],
        duration_minutes: drill.duration_minutes || null,
        player_count_min: drill.player_count_min || 2,
        player_count_max: drill.player_count_max || null,
        equipment: Array.isArray(drill.equipment) ? drill.equipment : [],
        setup_instructions: drill.setup_instructions || null,
        teaching_cues: Array.isArray(drill.teaching_cues) ? drill.teaching_cues : [],
        source: 'ai',
      })
      .select()
      .single();

    if (error) {
      console.error('Save drill error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ drill: newDrill });
  } catch (error: unknown) {
    console.error('Save drill error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
