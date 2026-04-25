import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  calculateSentimentFactor,
  calculateConsistencyFactor,
  calculateSkillTrendFactor,
  calculateGoalProgressFactor,
  calculateMomentumScore,
  getMomentumTier,
  type PlayerMomentum,
  type MomentumObs,
  type MomentumProficiency,
  type MomentumGoal,
} from '@/lib/momentum-utils';

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');

  if (!teamId) {
    return NextResponse.json({ error: 'team_id required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // Verify the coach has access: primary coach OR team_coaches member
  const { data: teamOwner } = await admin
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('coach_id', user.id)
    .single();
  if (!teamOwner) {
    const { data: membership } = await admin
      .from('team_coaches')
      .select('id')
      .eq('team_id', teamId)
      .eq('coach_id', user.id)
      .single();
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch active players
  const { data: players } = await admin
    .from('players')
    .select('id, name')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('name');

  if (!players || players.length === 0) {
    return NextResponse.json({ players: [] });
  }

  const playerIds = players.map((p) => p.id);
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch observations for all players over the last 14 days
  const { data: obsRows } = await admin
    .from('observations')
    .select('player_id, sentiment, session_id, created_at')
    .eq('team_id', teamId)
    .in('player_id', playerIds)
    .gte('created_at', since);

  const allObs: MomentumObs[] = (obsRows || []).map((o) => ({
    player_id: o.player_id!,
    sentiment: o.sentiment as MomentumObs['sentiment'],
    session_id: o.session_id,
    created_at: o.created_at,
  }));

  // Count total unique team sessions in the last 14 days (for consistency context)
  const { data: sessionRows } = await admin
    .from('sessions')
    .select('id')
    .eq('team_id', teamId)
    .gte('date', since.slice(0, 10));

  const totalTeamSessions = (sessionRows || []).length;

  // Fetch proficiency data for all players
  const { data: profRows } = await admin
    .from('player_skill_proficiency')
    .select('player_id, trend, proficiency_level')
    .in('player_id', playerIds);

  const allProficiency: (MomentumProficiency & { player_id: string })[] = (profRows || []).map(
    (p) => ({
      player_id: p.player_id,
      trend: p.trend as MomentumProficiency['trend'],
      proficiency_level: p.proficiency_level,
    }),
  );

  // Fetch active/achieved/stalled goals for all players
  const { data: goalRows } = await admin
    .from('player_goals')
    .select('player_id, status, target_date')
    .in('player_id', playerIds)
    .in('status', ['active', 'achieved', 'stalled']);

  const allGoals: (MomentumGoal & { player_id: string })[] = (goalRows || []).map((g) => ({
    player_id: g.player_id,
    status: g.status as MomentumGoal['status'],
    target_date: g.target_date,
  }));

  // Calculate momentum for each player
  const result: PlayerMomentum[] = players.map((player) => {
    const obs = allObs.filter((o) => o.player_id === player.id);
    const proficiency = allProficiency.filter((p) => p.player_id === player.id);
    const goals = allGoals.filter((g) => g.player_id === player.id);

    const factors = [
      calculateSentimentFactor(obs),
      calculateConsistencyFactor(obs, totalTeamSessions),
      calculateSkillTrendFactor(proficiency),
      calculateGoalProgressFactor(goals),
    ];

    const score = calculateMomentumScore(factors);
    const tier = getMomentumTier(score);

    return {
      player_id: player.id,
      player_name: player.name,
      score,
      tier,
      factors,
    };
  });

  return NextResponse.json({ players: result, totalTeamSessions });
}
