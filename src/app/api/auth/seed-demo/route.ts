/**
 * Seed a "demo team" so a coach can poke around the product before committing
 * a real roster.
 *
 * - Creates teams.is_demo = TRUE with 8 fictional players (is_sample = TRUE)
 * - Inserts 2 past sessions with a handful of seeded observations
 * - Marks coach.onboarding_complete = TRUE so the dashboard is reachable
 *
 * Idempotent per-coach: if a demo team already exists for this coach's org,
 * we return that team's id instead of creating another one.
 */

import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const DEMO_PLAYERS = [
  { name: 'Demo · Alex',    nickname: null,    position: 'Guard'   },
  { name: 'Demo · Jordan',  nickname: null,    position: 'Guard'   },
  { name: 'Demo · Riley',   nickname: 'Ry',    position: 'Forward' },
  { name: 'Demo · Sam',     nickname: null,    position: 'Forward' },
  { name: 'Demo · Casey',   nickname: null,    position: 'Center'  },
  { name: 'Demo · Drew',    nickname: null,    position: 'Guard'   },
  { name: 'Demo · Quinn',   nickname: null,    position: 'Guard'   },
  { name: 'Demo · Taylor',  nickname: null,    position: 'Forward' },
];

// A few realistic observations spread across 2 sessions.
const DEMO_OBSERVATIONS: Array<{
  player_idx: number | null;  // null = team obs
  category: string;
  sentiment: 'positive' | 'needs-work' | 'neutral';
  text: string;
  session_idx: 0 | 1;
}> = [
  { player_idx: 0, category: 'Offense',  sentiment: 'positive',   text: 'Great patience reading the defense before driving — kept her dribble alive.', session_idx: 0 },
  { player_idx: 1, category: 'Defense',  sentiment: 'positive',   text: 'Two strong help-side rotations this practice; closed out without fouling.',     session_idx: 0 },
  { player_idx: 2, category: 'IQ',       sentiment: 'needs-work', text: 'Forced contested shots when there was an open teammate on the wing.',          session_idx: 0 },
  { player_idx: 4, category: 'Effort',   sentiment: 'positive',   text: 'First on the floor for every loose ball — set the tone.',                       session_idx: 0 },
  { player_idx: null, category: 'Offense', sentiment: 'needs-work', text: 'Spacing collapsed after the first pass; need to reset to wide spots.',         session_idx: 0 },
  { player_idx: 3, category: 'Offense',  sentiment: 'positive',   text: 'Cut hard off the elbow screen and finished left-handed.',                      session_idx: 1 },
  { player_idx: 5, category: 'Defense',  sentiment: 'needs-work', text: 'Got beat off the dribble twice baseline — work on staying low in stance.',     session_idx: 1 },
  { player_idx: 6, category: 'Coachability', sentiment: 'positive', text: "Asked great questions during the timeout — wants to understand the why.",   session_idx: 1 },
];

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  // Resolve coach + org
  const { data: coach } = await admin.from('coaches').select('id, org_id').eq('id', user.id).single();
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  // If a demo team already exists for this org, reuse it (idempotency)
  const { data: existingDemo } = await admin
    .from('teams')
    .select('id')
    .eq('org_id', coach.org_id)
    .eq('is_demo', true)
    .limit(1)
    .single();
  if (existingDemo) {
    return NextResponse.json({ success: true, teamId: existingDemo.id, reused: true });
  }

  // Default to basketball for the demo (most common sport in the codebase)
  const { data: sport } = await admin.from('sports').select('id').eq('slug', 'basketball').single();
  if (!sport) return NextResponse.json({ error: 'Default sport not configured' }, { status: 500 });

  const { data: curriculum } = await admin
    .from('curricula')
    .select('id')
    .eq('sport_id', sport.id)
    .eq('is_default', true)
    .single();

  // Create team
  const { data: team, error: teamErr } = await admin
    .from('teams')
    .insert({
      org_id: coach.org_id,
      sport_id: sport.id,
      curriculum_id: curriculum?.id || null,
      name: 'Demo Team',
      age_group: '8-10',
      season: 'Demo Season',
      is_demo: true,
    })
    .select('id')
    .single();
  if (teamErr || !team) return NextResponse.json({ error: teamErr?.message || 'Failed to create team' }, { status: 500 });

  // Wire the coach to the team
  await admin.from('team_coaches').insert({ team_id: team.id, coach_id: user.id, role: 'head_coach' });

  // Insert players (sample = true, so they're filtered from parent shares)
  const { data: insertedPlayers, error: playersErr } = await admin
    .from('players')
    .insert(
      DEMO_PLAYERS.map((p, i) => ({
        team_id: team.id,
        name: p.name,
        nickname: p.nickname,
        position: p.position,
        jersey_number: i + 1,
        age_group: '8-10',
        is_active: true,
        is_sample: true,
      })),
    )
    .select('id');
  if (playersErr) return NextResponse.json({ error: playersErr.message }, { status: 500 });
  const playerIds = (insertedPlayers || []).map((p) => p.id);

  // 2 past sessions (last week + this week)
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);
  const sessionDates = [lastWeek, today].map((d) => d.toISOString().slice(0, 10));

  const { data: sessions, error: sessionsErr } = await admin
    .from('sessions')
    .insert([
      {
        team_id: team.id,
        coach_id: user.id,
        type: 'practice',
        date: sessionDates[0],
        location: 'Demo Gym',
      },
      {
        team_id: team.id,
        coach_id: user.id,
        type: 'practice',
        date: sessionDates[1],
        location: 'Demo Gym',
      },
    ])
    .select('id');
  if (sessionsErr) return NextResponse.json({ error: sessionsErr.message }, { status: 500 });

  // Observations across both sessions
  await admin.from('observations').insert(
    DEMO_OBSERVATIONS.map((obs) => ({
      team_id: team.id,
      coach_id: user.id,
      session_id: sessions?.[obs.session_idx]?.id ?? null,
      player_id: obs.player_idx !== null ? playerIds[obs.player_idx] ?? null : null,
      category: obs.category,
      sentiment: obs.sentiment,
      text: obs.text,
      raw_text: obs.text,
      source: 'demo',
      ai_parsed: false,
      coach_edited: true,
      is_synced: true,
    })),
  );

  // Flip onboarding flag so the dashboard is reachable
  await admin.from('coaches').update({ onboarding_complete: true }).eq('id', user.id);

  return NextResponse.json({ success: true, teamId: team.id, reused: false });
}
