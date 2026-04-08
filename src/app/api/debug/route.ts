import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, unknown> = {};

  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    results.user = user ? { id: user.id, email: user.email } : null;

    if (user) {
      const admin = await createServiceSupabase();

      const { data: coach, error: coachErr } = await admin
        .from('coaches').select('id, org_id, role').eq('id', user.id).single();
      results.coach = coach || { error: coachErr?.message };

      if (coach) {
        const { data: teams, error: teamsErr } = await admin
          .from('team_coaches').select('team_id').eq('coach_id', user.id);
        results.teams = teams || { error: teamsErr?.message };

        if (teams && teams.length > 0) {
          const teamId = teams[0].team_id;

          const { data: players, error: playersErr } = await admin
            .from('players').select('id, name').eq('team_id', teamId).limit(5);
          results.players = players || { error: playersErr?.message };

          const { data: obs, error: obsErr } = await admin
            .from('observations').select('id, text').eq('team_id', teamId).limit(5);
          results.observations = obs || { error: obsErr?.message };

          const { data: drills, error: drillsErr } = await admin
            .from('drills').select('id, name').limit(3);
          results.drills = drills || { error: drillsErr?.message };
        }
      }
    }

    results.env = {
      SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SERVICE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      ANTHROPIC: !!process.env.ANTHROPIC_API_KEY,
    };
  } catch (err: unknown) {
    results.error = err instanceof Error ? err.message : 'Unknown error';
  }

  return NextResponse.json(results);
}
