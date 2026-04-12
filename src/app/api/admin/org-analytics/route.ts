import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  // Verify user is admin with org tier
  const { data: coach } = await admin
    .from('coaches')
    .select('id, org_id, role, organizations(tier)')
    .eq('id', user.id)
    .single();

  if (!coach || coach.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  if ((coach.organizations as any)?.tier !== 'organization') {
    return NextResponse.json({ error: 'Organization tier required' }, { status: 403 });
  }

  const orgId = coach.org_id;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all teams
  const { data: teams } = await admin
    .from('teams')
    .select('id, name')
    .eq('org_id', orgId)
    .order('name');

  // Fetch all coaches in org
  const { data: coaches } = await admin
    .from('coaches')
    .select('id, full_name, email, role')
    .eq('org_id', orgId)
    .order('full_name');

  // Fetch all observations in the last 30 days (for this org's teams)
  const teamIds = (teams || []).map((t) => t.id);
  const { data: observations } = await admin
    .from('observations')
    .select('id, team_id, created_by, skill, sentiment, created_at')
    .in('team_id', teamIds.length > 0 ? teamIds : ['none'])
    .gte('created_at', thirtyDaysAgo);

  // Fetch all sessions in last 30 days
  const { data: sessions } = await admin
    .from('sessions')
    .select('id, team_id, created_by, created_at')
    .in('team_id', teamIds.length > 0 ? teamIds : ['none'])
    .gte('created_at', thirtyDaysAgo);

  // Fetch all plans in last 30 days
  const { data: plans } = await admin
    .from('plans')
    .select('id, team_id, created_by, created_at')
    .in('team_id', teamIds.length > 0 ? teamIds : ['none'])
    .gte('created_at', thirtyDaysAgo);

  // Fetch active player counts per team
  const playerCountsByTeam: Record<string, number> = {};
  await Promise.all(
    (teams || []).map(async (team) => {
      const { count } = await admin
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', team.id)
        .eq('is_active', true);
      playerCountsByTeam[team.id] = count || 0;
    })
  );

  // Fetch last activity per team (most recent observation, session, or plan)
  const lastActivityByTeam: Record<string, string | null> = {};
  for (const team of teams || []) {
    const teamObs = (observations || []).filter((o) => o.team_id === team.id);
    const teamSessions = (sessions || []).filter((s) => s.team_id === team.id);
    const allDates = [
      ...teamObs.map((o) => o.created_at),
      ...teamSessions.map((s) => s.created_at),
    ].filter(Boolean).sort().reverse();
    lastActivityByTeam[team.id] = allDates[0] || null;
  }

  // --- Aggregate: teams ---
  const teamsData = (teams || []).map((team) => {
    const teamObs = (observations || []).filter((o) => o.team_id === team.id);
    const teamSessions = (sessions || []).filter((s) => s.team_id === team.id);
    const teamPlans = (plans || []).filter((p) => p.team_id === team.id);
    const positive = teamObs.filter((o) => o.sentiment === 'positive').length;
    const healthScore = teamObs.length > 0 ? Math.round((positive / teamObs.length) * 100) : 0;
    return {
      id: team.id,
      name: team.name,
      playerCount: playerCountsByTeam[team.id] || 0,
      obsThisMonth: teamObs.length,
      sessionsThisMonth: teamSessions.length,
      plansThisMonth: teamPlans.length,
      healthScore,
      lastActivity: lastActivityByTeam[team.id],
    };
  });

  // --- Aggregate: coaches ---
  const coachesData = (coaches || []).map((c) => {
    const coachObs = (observations || []).filter((o) => o.created_by === c.id);
    const coachSessions = (sessions || []).filter((s) => s.created_by === c.id);
    const coachPlans = (plans || []).filter((p) => p.created_by === c.id);
    // Weighted engagement score: obs*1 + sessions*3 + plans*2
    const engagementScore = coachObs.length * 1 + coachSessions.length * 3 + coachPlans.length * 2;
    return {
      id: c.id,
      fullName: c.full_name,
      email: c.email,
      role: c.role,
      obsThisMonth: coachObs.length,
      sessionsThisMonth: coachSessions.length,
      plansThisMonth: coachPlans.length,
      engagementScore,
    };
  }).sort((a, b) => b.engagementScore - a.engagementScore);

  // --- Aggregate: skills ---
  const skillMap: Record<string, { total: number; positive: number; needsWork: number; neutral: number }> = {};
  for (const obs of observations || []) {
    if (!obs.skill) continue;
    if (!skillMap[obs.skill]) {
      skillMap[obs.skill] = { total: 0, positive: 0, needsWork: 0, neutral: 0 };
    }
    skillMap[obs.skill].total++;
    if (obs.sentiment === 'positive') skillMap[obs.skill].positive++;
    else if (obs.sentiment === 'needs-work') skillMap[obs.skill].needsWork++;
    else skillMap[obs.skill].neutral++;
  }

  const skillsData = Object.entries(skillMap)
    .map(([skill, s]) => ({
      skill,
      total: s.total,
      positive: s.positive,
      needsWork: s.needsWork,
      neutral: s.neutral,
      healthPct: s.total > 0 ? Math.round((s.positive / s.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  // --- Summary ---
  const totalObs = (observations || []).length;
  const totalSessions = (sessions || []).length;
  const totalPlans = (plans || []).length;
  const totalPlayers = Object.values(playerCountsByTeam).reduce((s, n) => s + n, 0);

  return NextResponse.json({
    summary: {
      totalTeams: (teams || []).length,
      totalCoaches: (coaches || []).length,
      totalPlayers,
      totalObsThisMonth: totalObs,
      totalSessionsThisMonth: totalSessions,
      totalPlansThisMonth: totalPlans,
    },
    teams: teamsData,
    coaches: coachesData,
    skills: skillsData,
  });
}
