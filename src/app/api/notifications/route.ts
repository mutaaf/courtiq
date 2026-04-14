import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export type NotificationType =
  | 'unobserved_player'   // player not observed in 14+ days
  | 'goal_deadline'       // active goal due within 7 days (or overdue)
  | 'session_today'       // session scheduled today with no observations
  | 'achievement_earned'; // badge awarded in last 48 hours

export type NotificationPriority = 'high' | 'medium' | 'low';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  priority: NotificationPriority;
  timestamp: string; // ISO — when the condition arose
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function buildNotificationId(type: NotificationType, entityId: string): string {
  return `${type}:${entityId}`;
}

export function priorityOrder(p: NotificationPriority): number {
  return p === 'high' ? 0 : p === 'medium' ? 1 : 2;
}

export function sortNotifications(items: AppNotification[]): AppNotification[] {
  return [...items].sort((a, b) => {
    const pd = priorityOrder(a.priority) - priorityOrder(b.priority);
    if (pd !== 0) return pd;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}

const BADGE_NAMES: Record<string, string> = {
  first_star: 'First Star',
  team_player: 'Team Player',
  grinder: 'Grinder',
  all_rounder: 'All-Rounder',
  breakthrough: 'Breakthrough',
  game_changer: 'Game Changer',
  session_regular: 'Session Regular',
  coach_pick: "Coach's Pick",
  most_improved: 'Most Improved',
  rising_star: 'Rising Star',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── GET /api/notifications?team_id=xxx ──────────────────────────────────────
// Aggregates up to 20 actionable alerts for the given team.
// Used by the NotificationBell in DashboardShell.

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');
  if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

  const admin = await createServiceSupabase();
  const now = Date.now();
  const day = 86_400_000;
  const today = new Date().toISOString().split('T')[0];
  const fourteenDaysAgo = new Date(now - 14 * day).toISOString();
  const sevenDaysFromNow = new Date(now + 7 * day).toISOString().split('T')[0];
  const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString();

  // Fetch all data in parallel for minimal latency
  const [playersRes, obsRes, goalsRes, sessionsRes, achievementsRes] = await Promise.all([
    admin
      .from('players')
      .select('id, name')
      .eq('team_id', teamId)
      .eq('is_active', true),
    admin
      .from('observations')
      .select('player_id, session_id, created_at')
      .eq('team_id', teamId)
      .gte('created_at', fourteenDaysAgo),
    admin
      .from('player_goals')
      .select('id, player_id, skill, goal_text, target_date')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .not('target_date', 'is', null)
      .lte('target_date', sevenDaysFromNow),
    admin
      .from('sessions')
      .select('id, date, type')
      .eq('team_id', teamId)
      .eq('date', today),
    admin
      .from('player_achievements')
      .select('id, player_id, badge_type, earned_at')
      .eq('team_id', teamId)
      .gte('earned_at', fortyEightHoursAgo)
      .order('earned_at', { ascending: false })
      .limit(10),
  ]);

  const players = playersRes.data ?? [];
  const obs = obsRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const achievements = achievementsRes.data ?? [];

  // Build a player name lookup
  const playerMap: Record<string, string> = {};
  for (const p of players) playerMap[(p as any).id] = (p as any).name;

  const notifications: AppNotification[] = [];

  // ── 1. Players not observed in 14+ days ────────────────────────────────────
  const observedPlayerIds = new Set(
    obs.map((o: any) => o.player_id as string).filter(Boolean)
  );
  for (const player of players) {
    if (!observedPlayerIds.has((player as any).id)) {
      notifications.push({
        id: buildNotificationId('unobserved_player', (player as any).id),
        type: 'unobserved_player',
        title: `${(player as any).name} needs attention`,
        body: 'No observations recorded in the last 14 days.',
        href: `/roster/${(player as any).id}`,
        priority: 'medium',
        timestamp: new Date(now - 14 * day).toISOString(),
      });
    }
  }

  // ── 2. Active goals due within 7 days (or overdue) ─────────────────────────
  for (const goal of goals) {
    if (!(goal as any).target_date) continue;
    const targetMs = new Date((goal as any).target_date as string).getTime();
    const daysLeft = Math.ceil((targetMs - now) / day);
    const playerName = playerMap[(goal as any).player_id] ?? 'Player';
    const overdue = daysLeft <= 0;
    notifications.push({
      id: buildNotificationId('goal_deadline', (goal as any).id),
      type: 'goal_deadline',
      title: overdue
        ? `${playerName}'s goal is overdue`
        : `${playerName}'s goal due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      body: (goal as any).goal_text as string,
      href: `/roster/${(goal as any).player_id}`,
      priority: daysLeft <= 1 ? 'high' : 'medium',
      timestamp: ((goal as any).target_date as string) + 'T00:00:00.000Z',
    });
  }

  // ── 3. Sessions today with no observations captured yet ────────────────────
  const obsSessionIds = new Set(
    obs.map((o: any) => o.session_id as string).filter(Boolean)
  );
  for (const session of sessions) {
    if (!obsSessionIds.has((session as any).id)) {
      notifications.push({
        id: buildNotificationId('session_today', (session as any).id),
        type: 'session_today',
        title: `${capitalize((session as any).type as string)} today — no observations yet`,
        body: 'Start capturing observations for this session.',
        href: `/sessions/${(session as any).id}`,
        priority: 'high',
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ── 4. Achievements earned in last 48 hours ────────────────────────────────
  for (const ach of achievements) {
    const playerName = playerMap[(ach as any).player_id] ?? 'Player';
    const badgeName = BADGE_NAMES[(ach as any).badge_type] ?? (ach as any).badge_type;
    notifications.push({
      id: buildNotificationId('achievement_earned', (ach as any).id),
      type: 'achievement_earned',
      title: `${playerName} earned a badge!`,
      body: `Awarded the "${badgeName}" badge.`,
      href: `/roster/${(ach as any).player_id}`,
      priority: 'low',
      timestamp: (ach as any).earned_at as string,
    });
  }

  return NextResponse.json({
    notifications: sortNotifications(notifications).slice(0, 20),
  });
}
