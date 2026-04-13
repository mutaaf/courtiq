import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { BADGE_DEFS } from '@/app/api/player-achievements/route';
import { getWinDate } from '@/lib/team-wins-utils';
import type { TeamWin } from '@/lib/team-wins-utils';

export type { TeamWin };

// ─── GET /api/team-wins?team_id=xxx&days=14 ───────────────────────────────────
// Returns recent badge achievements + achieved player goals for the team.
// Used by the home dashboard Team Wins feed.

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');
  const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '14', 10), 1), 90);

  if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

  const admin = await createServiceSupabase();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  // Fetch achievements + recently-achieved goals in parallel
  const [achievementsResult, goalsResult] = await Promise.all([
    admin
      .from('player_achievements')
      .select('player_id, badge_type, earned_at, note')
      .eq('team_id', teamId)
      .gte('earned_at', since)
      .order('earned_at', { ascending: false })
      .limit(30),
    admin
      .from('player_goals')
      .select('player_id, skill, goal_text, updated_at')
      .eq('team_id', teamId)
      .eq('status', 'achieved')
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(30),
  ]);

  const achievements = achievementsResult.data ?? [];
  const goals = goalsResult.data ?? [];

  // Collect all unique player IDs to resolve names in one query
  const playerIdSet = new Set<string>([
    ...achievements.map((a: any) => a.player_id as string),
    ...goals.map((g: any) => g.player_id as string),
  ]);

  const playerMap: Record<string, { name: string; jersey_number: number | null }> = {};
  if (playerIdSet.size > 0) {
    const { data: players } = await admin
      .from('players')
      .select('id, name, jersey_number')
      .in('id', [...playerIdSet]);
    for (const p of players ?? []) {
      playerMap[(p as any).id] = { name: (p as any).name, jersey_number: (p as any).jersey_number };
    }
  }

  const wins: TeamWin[] = [];

  // Badge wins
  for (const a of achievements) {
    const def = BADGE_DEFS.find((d) => d.badge_type === (a as any).badge_type);
    const player = playerMap[(a as any).player_id] ?? { name: 'Player', jersey_number: null };
    wins.push({
      type: 'badge',
      player_id: (a as any).player_id,
      player_name: player.name,
      player_jersey: player.jersey_number,
      badge_type: (a as any).badge_type,
      badge_name: def?.name ?? (a as any).badge_type,
      badge_description: def?.description ?? '',
      note: (a as any).note ?? null,
      earned_at: (a as any).earned_at,
    });
  }

  // Goal wins
  for (const g of goals) {
    const player = playerMap[(g as any).player_id] ?? { name: 'Player', jersey_number: null };
    wins.push({
      type: 'goal',
      player_id: (g as any).player_id,
      player_name: player.name,
      player_jersey: player.jersey_number,
      skill: (g as any).skill,
      goal_text: (g as any).goal_text,
      achieved_at: (g as any).updated_at,
    });
  }

  // Sort newest first, cap at 20
  wins.sort((a, b) => new Date(getWinDate(b)).getTime() - new Date(getWinDate(a)).getTime());

  return NextResponse.json({ wins: wins.slice(0, 20) });
}
