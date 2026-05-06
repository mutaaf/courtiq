import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { findPlayerByName } from '@/lib/player-match';

interface IncomingObs {
  player_name: string;
  category: string;
  sentiment: string;
  text: string;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { teamId, observations } = body as { teamId: string; observations: IncomingObs[] };

  if (!teamId || !Array.isArray(observations) || observations.length === 0) {
    return NextResponse.json({ error: 'teamId and observations required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // Verify the coach belongs to this team
  const { data: membership } = await admin
    .from('team_coaches')
    .select('team_id')
    .eq('coach_id', user.id)
    .eq('team_id', teamId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch the roster so we can match player names to IDs
  const { data: players } = await admin
    .from('players')
    .select('id, name, nickname, name_variants')
    .eq('team_id', teamId)
    .eq('is_active', true);

  const roster = players ?? [];

  const rows = observations.map((obs) => ({
    team_id: teamId,
    coach_id: user.id,
    player_id: findPlayerByName(obs.player_name, roster),
    session_id: null,
    recording_id: null,
    category: obs.category || 'general',
    sentiment: obs.sentiment || 'neutral',
    text: obs.text,
    raw_text: obs.text,
    source: 'voice' as const,
    ai_parsed: true,
    coach_edited: false,
    is_synced: true,
  }));

  const { error } = await admin.from('observations').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ saved: rows.length });
}
