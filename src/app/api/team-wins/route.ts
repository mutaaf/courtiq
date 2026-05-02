import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { BADGE_DEFS } from '@/app/api/player-achievements/route';
import { getWinDate } from '@/lib/team-wins-utils';
import type { TeamWin } from '@/lib/team-wins-utils';
import {
  groupObsBySession,
  sortBucketsDesc,
  calculateCurrentStreak,
} from '@/lib/player-growth-streak-utils';

interface RawObsForStreak {
  player_id: string | null;
  session_id: string | null;
  created_at: string;
  sentiment: string;
}

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
  // Streak computation looks back further so short-window sessions don't cut off active streaks
  const since60d = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const since14d = new Date(Date.now() - 14 * 86_400_000).toISOString();

  // Fetch achievements + recently-achieved goals + observations for streak computation in parallel
  const [achievementsResult, goalsResult, obsResult] = await Promise.all([
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
    admin
      .from('observations')
      .select('player_id, session_id, created_at, sentiment')
      .eq('team_id', teamId)
      .not('player_id', 'is', null)
      .gte('created_at', since60d)
      .order('created_at', { ascending: false })
      .limit(2000),
  ]);

  const achievements = achievementsResult.data ?? [];
  const goals = goalsResult.data ?? [];
  const rawObs = (obsResult.data ?? []) as RawObsForStreak[];

  // ── Compute per-player growth streaks ─────────────────────────────────────
  const obsByPlayer = new Map<string, Array<{ session_id: string | null; created_at: string; sentiment: string }>>();
  for (const o of rawObs) {
    if (!o.player_id) continue;
    const arr = obsByPlayer.get(o.player_id) ?? [];
    arr.push({ session_id: o.session_id, created_at: o.created_at, sentiment: o.sentiment });
    obsByPlayer.set(o.player_id, arr);
  }

  const streakWinCandidates: Array<{ player_id: string; streak: number; streak_at: string }> = [];
  for (const [playerId, playerObs] of obsByPlayer) {
    const buckets = sortBucketsDesc(groupObsBySession(playerObs));
    const streak = calculateCurrentStreak(buckets);
    if (streak < 3) continue;
    // Only surface active streaks — most recent positive obs must be within 14 days
    const latestPositive = playerObs
      .filter((o) => o.sentiment === 'positive')
      .map((o) => o.created_at)
      .sort()
      .at(-1);
    if (!latestPositive || latestPositive < since14d) continue;
    streakWinCandidates.push({ player_id: playerId, streak, streak_at: latestPositive });
  }

  // Collect all unique player IDs to resolve names in one query
  const playerIdSet = new Set<string>([
    ...achievements.map((a: any) => a.player_id as string),
    ...goals.map((g: any) => g.player_id as string),
    ...streakWinCandidates.map((s) => s.player_id),
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

  // Growth streak wins
  for (const s of streakWinCandidates) {
    const player = playerMap[s.player_id] ?? { name: 'Player', jersey_number: null };
    wins.push({
      type: 'streak',
      player_id: s.player_id,
      player_name: player.name,
      player_jersey: player.jersey_number,
      streak: s.streak,
      streak_at: s.streak_at,
    });
  }

  // Sort newest first, cap at 20
  wins.sort((a, b) => new Date(getWinDate(b)).getTime() - new Date(getWinDate(a)).getTime());

  return NextResponse.json({ wins: wins.slice(0, 20) });
}
