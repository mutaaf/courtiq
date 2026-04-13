import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { AchievementBadgeType } from '@/types/database';

// ─── Badge definitions ────────────────────────────────────────────────────────

export interface BadgeDef {
  badge_type: AchievementBadgeType;
  name: string;
  description: string;
  auto: boolean; // can be auto-awarded
}

export const BADGE_DEFS: BadgeDef[] = [
  {
    badge_type: 'first_star',
    name: 'First Star',
    description: 'Earned first positive observation',
    auto: true,
  },
  {
    badge_type: 'team_player',
    name: 'Team Player',
    description: '10 or more positive observations recorded',
    auto: true,
  },
  {
    badge_type: 'grinder',
    name: 'Grinder',
    description: '25 or more total observations recorded',
    auto: true,
  },
  {
    badge_type: 'all_rounder',
    name: 'All-Rounder',
    description: 'Observed across 4 or more skill categories',
    auto: true,
  },
  {
    badge_type: 'breakthrough',
    name: 'Breakthrough',
    description: 'Reached game-ready proficiency in any skill',
    auto: true,
  },
  {
    badge_type: 'game_changer',
    name: 'Game Changer',
    description: 'Positive observation during a game or scrimmage',
    auto: true,
  },
  {
    badge_type: 'session_regular',
    name: 'Session Regular',
    description: 'Attended 10 or more sessions',
    auto: true,
  },
  {
    badge_type: 'coach_pick',
    name: "Coach's Pick",
    description: 'Awarded by the coach for outstanding effort or attitude',
    auto: false,
  },
  {
    badge_type: 'most_improved',
    name: 'Most Improved',
    description: 'Demonstrated the greatest improvement on the team',
    auto: false,
  },
  {
    badge_type: 'rising_star',
    name: 'Rising Star',
    description: 'Shows exceptional promise and potential',
    auto: false,
  },
];

// ─── GET /api/player-achievements?player_id=xxx ───────────────────────────────
// Returns earned achievements + badge definitions for a player.

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('player_id');
  if (!playerId) return NextResponse.json({ error: 'player_id required' }, { status: 400 });

  const admin = await createServiceSupabase();
  const { data: achievements, error } = await admin
    .from('player_achievements')
    .select('*')
    .eq('player_id', playerId)
    .order('earned_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ achievements: achievements ?? [], badge_defs: BADGE_DEFS });
}

// ─── POST /api/player-achievements ───────────────────────────────────────────
// Two modes:
//   { action: 'check', player_id }   — auto-evaluate + award earned badges
//   { action: 'award', player_id, badge_type, note? } — manually award a badge

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { action, player_id, badge_type, note } = body as {
    action: 'check' | 'award';
    player_id: string;
    badge_type?: AchievementBadgeType;
    note?: string;
  };

  if (!player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 });

  // Verify player belongs to a team the coach has access to
  const { data: player } = await admin
    .from('players')
    .select('id, team_id')
    .eq('id', player_id)
    .single();
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

  if (action === 'award') {
    if (!badge_type) return NextResponse.json({ error: 'badge_type required' }, { status: 400 });
    const def = BADGE_DEFS.find((d) => d.badge_type === badge_type);
    if (!def) return NextResponse.json({ error: 'Unknown badge_type' }, { status: 400 });

    const { data: awarded, error: awardError } = await admin
      .from('player_achievements')
      .upsert(
        {
          player_id,
          team_id: player.team_id,
          badge_type,
          awarded_by: user.id,
          note: note ?? null,
          earned_at: new Date().toISOString(),
        },
        { onConflict: 'player_id,badge_type', ignoreDuplicates: false }
      )
      .select()
      .single();

    if (awardError) return NextResponse.json({ error: awardError.message }, { status: 500 });
    return NextResponse.json({ awarded });
  }

  if (action === 'check') {
    // Fetch current achievements
    const { data: existing } = await admin
      .from('player_achievements')
      .select('badge_type')
      .eq('player_id', player_id);
    const earnedTypes = new Set((existing ?? []).map((a: any) => a.badge_type as string));

    // Fetch data needed to evaluate criteria (all in parallel)
    const [obsResult, profResult, attendResult, gameSessionsResult] = await Promise.all([
      // All observations for counts + categories
      admin
        .from('observations')
        .select('id, sentiment, category, session_id')
        .eq('player_id', player_id),
      // Proficiency levels
      admin
        .from('player_skill_proficiency')
        .select('proficiency_level')
        .eq('player_id', player_id),
      // Session attendance count
      admin
        .from('session_attendance')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', player_id)
        .eq('status', 'present'),
      // Game/scrimmage session IDs for this player's team
      admin
        .from('sessions')
        .select('id')
        .eq('team_id', player.team_id)
        .in('type', ['game', 'scrimmage']),
    ]);

    const obs: any[] = obsResult.data ?? [];
    const totalObs = obs.length;
    const positiveObs = obs.filter((o) => o.sentiment === 'positive').length;
    const uniqueCategories = new Set(obs.map((o) => o.category as string)).size;
    const proficiencies: any[] = profResult.data ?? [];
    const sessionCount = attendResult.count ?? 0;
    const gameSessionIds = new Set((gameSessionsResult.data ?? []).map((s: any) => s.id as string));
    const gameObsCount = obs.filter(
      (o) => o.sentiment === 'positive' && gameSessionIds.has(o.session_id as string)
    ).length;

    // Evaluate each auto badge
    const toAward: { badge_type: AchievementBadgeType }[] = [];

    if (!earnedTypes.has('first_star') && positiveObs >= 1) {
      toAward.push({ badge_type: 'first_star' });
    }
    if (!earnedTypes.has('team_player') && positiveObs >= 10) {
      toAward.push({ badge_type: 'team_player' });
    }
    if (!earnedTypes.has('grinder') && totalObs >= 25) {
      toAward.push({ badge_type: 'grinder' });
    }
    if (!earnedTypes.has('all_rounder') && uniqueCategories >= 4) {
      toAward.push({ badge_type: 'all_rounder' });
    }
    if (!earnedTypes.has('breakthrough') &&
      proficiencies.some((p: any) => p.proficiency_level === 'game_ready')) {
      toAward.push({ badge_type: 'breakthrough' });
    }
    if (!earnedTypes.has('game_changer') && gameObsCount > 0) {
      toAward.push({ badge_type: 'game_changer' });
    }
    if (!earnedTypes.has('session_regular') && sessionCount >= 10) {
      toAward.push({ badge_type: 'session_regular' });
    }

    if (toAward.length === 0) {
      return NextResponse.json({ newly_awarded: [] });
    }

    const now = new Date().toISOString();
    const rows = toAward.map((b) => ({
      player_id,
      team_id: player.team_id,
      badge_type: b.badge_type,
      awarded_by: null,
      note: null,
      earned_at: now,
    }));

    const { data: newlyAwarded, error: insertError } = await admin
      .from('player_achievements')
      .upsert(rows, { onConflict: 'player_id,badge_type', ignoreDuplicates: true })
      .select();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    return NextResponse.json({ newly_awarded: newlyAwarded ?? [] });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
