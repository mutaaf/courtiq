import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { SeasonArchivePlayer, SeasonArchiveSkill } from '@/types/database';

// ─── GET /api/seasons — list all season archives for the coach's org ──────────

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const { data: coach } = await admin
    .from('coaches')
    .select('id, org_id')
    .eq('id', user.id)
    .single();

  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  const { data: archives, error } = await admin
    .from('season_archives')
    .select('*')
    .eq('org_id', coach.org_id)
    .order('archived_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ archives: archives ?? [] });
}

// ─── POST /api/seasons — archive the current season for a team ───────────────

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const { data: coach } = await admin
    .from('coaches')
    .select('id, org_id')
    .eq('id', user.id)
    .single();

  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  const body = await request.json();
  const { team_id, season_name, start_date, end_date, notes } = body;

  if (!team_id || !season_name?.trim()) {
    return NextResponse.json({ error: 'team_id and season_name are required' }, { status: 400 });
  }

  // Verify the team belongs to this org
  const { data: team } = await admin
    .from('teams')
    .select('id, org_id')
    .eq('id', team_id)
    .eq('org_id', coach.org_id)
    .single();

  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

  // Gather counts
  const [sessionsResult, obsResult, playersResult] = await Promise.all([
    admin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', team_id),
    admin
      .from('observations')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', team_id),
    admin
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', team_id)
      .eq('is_active', true),
  ]);

  // Build player skill snapshot
  const { data: players } = await admin
    .from('players')
    .select('id, name')
    .eq('team_id', team_id)
    .eq('is_active', true);

  const playerSnapshot: SeasonArchivePlayer[] = [];

  if (players && players.length > 0) {
    const playerIds = players.map((p: any) => p.id);

    // Fetch proficiency for all players in the team
    const { data: proficiencies } = await admin
      .from('player_skill_proficiency')
      .select('player_id, skill_id, proficiency_level, trend')
      .in('player_id', playerIds);

    // Fetch skill names (via curriculum_skills join)
    const skillIds = [...new Set((proficiencies ?? []).map((p: any) => p.skill_id))];
    const { data: skills } = skillIds.length > 0
      ? await admin
          .from('curriculum_skills')
          .select('skill_id, name, category')
          .in('skill_id', skillIds)
      : { data: [] };

    const skillMap = new Map((skills ?? []).map((s: any) => [s.skill_id, s]));

    for (const player of players) {
      const playerProfs = (proficiencies ?? []).filter(
        (p: any) => p.player_id === player.id
      );

      const playerSkills: SeasonArchiveSkill[] = playerProfs.map((prof: any) => {
        const skill = skillMap.get(prof.skill_id);
        return {
          name: skill?.name ?? prof.skill_id,
          category: skill?.category ?? 'Unknown',
          level: prof.proficiency_level,
          trend: prof.trend,
        };
      });

      playerSnapshot.push({
        player_id: player.id,
        player_name: player.name,
        skills: playerSkills,
      });
    }
  }

  // Insert the archive record
  const { data: archive, error } = await admin
    .from('season_archives')
    .insert({
      org_id: coach.org_id,
      team_id,
      coach_id: user.id,
      season_name: season_name.trim(),
      start_date: start_date ?? null,
      end_date: end_date ?? null,
      session_count: sessionsResult.count ?? 0,
      observation_count: obsResult.count ?? 0,
      player_count: playersResult.count ?? 0,
      player_snapshot: playerSnapshot,
      notes: notes?.trim() ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ archive }, { status: 201 });
}
