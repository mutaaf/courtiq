import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');
  const playerId = searchParams.get('playerId');

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  try {
    let query = supabase
      .from('player_skill_proficiency')
      .select('*, players!inner(name, team_id)')
      .eq('players.team_id', teamId);

    if (playerId) {
      query = query.eq('player_id', playerId);
    }

    const { data: proficiencies, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ proficiencies: proficiencies || [] });
  } catch (error: any) {
    console.error('Proficiency GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { teamId, playerId } = body;

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  try {
    // Get team curriculum
    const { data: team } = await supabase
      .from('teams')
      .select('curriculum_id')
      .eq('id', teamId)
      .single();

    if (!team?.curriculum_id) {
      return NextResponse.json({ error: 'No curriculum assigned' }, { status: 400 });
    }

    // Get curriculum skills
    const { data: skills } = await supabase
      .from('curriculum_skills')
      .select('skill_id')
      .eq('curriculum_id', team.curriculum_id);

    const skillIds = (skills || []).map((s: any) => s.skill_id);

    // Get players to recompute
    let playerIds: string[];
    if (playerId) {
      playerIds = [playerId];
    } else {
      const { data: players } = await supabase
        .from('players')
        .select('id')
        .eq('team_id', teamId)
        .eq('is_active', true);
      playerIds = (players || []).map((p: any) => p.id);
    }

    const results: any[] = [];

    for (const pid of playerIds) {
      for (const skillId of skillIds) {
        // Get recent observations with this skill
        const { data: observations } = await supabase
          .from('observations')
          .select('result, sentiment, created_at')
          .eq('player_id', pid)
          .eq('skill_id', skillId)
          .order('created_at', { ascending: false })
          .limit(20); // configurable window size

        const reps = observations?.length || 0;
        if (reps === 0) continue;

        const successes = (observations || []).filter(
          (o: any) => o.result === 'success'
        ).length;
        const successRate = reps > 0 ? successes / reps : 0;

        // Determine proficiency level
        let proficiencyLevel: string;
        if (reps < 5) {
          proficiencyLevel = 'insufficient_data';
        } else if (successRate >= 0.85) {
          proficiencyLevel = 'game_ready';
        } else if (successRate >= 0.65) {
          proficiencyLevel = 'got_it';
        } else if (successRate >= 0.4) {
          proficiencyLevel = 'practicing';
        } else {
          proficiencyLevel = 'exploring';
        }

        // Determine trend by comparing recent vs older observations
        let trend: string = 'new';
        if (reps >= 6) {
          const half = Math.floor(reps / 2);
          const recentSuccesses = (observations || [])
            .slice(0, half)
            .filter((o: any) => o.result === 'success').length;
          const olderSuccesses = (observations || [])
            .slice(half)
            .filter((o: any) => o.result === 'success').length;
          const recentRate = recentSuccesses / half;
          const olderRate = olderSuccesses / (reps - half);

          if (recentRate > olderRate + 0.1) trend = 'improving';
          else if (recentRate < olderRate - 0.1) trend = 'regressing';
          else trend = 'plateau';
        }

        // Upsert proficiency record
        const { data: prof } = await supabase
          .from('player_skill_proficiency')
          .upsert(
            {
              player_id: pid,
              skill_id: skillId,
              proficiency_level: proficiencyLevel,
              success_rate: successRate,
              reps_evaluated: reps,
              trend,
              last_observation_at: observations?.[0]?.created_at || null,
              computed_at: new Date().toISOString(),
            },
            { onConflict: 'player_id,skill_id' }
          )
          .select()
          .single();

        if (prof) results.push(prof);
      }
    }

    return NextResponse.json({
      recomputed: results.length,
      proficiencies: results,
    });
  } catch (error: any) {
    console.error('Proficiency recompute error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
