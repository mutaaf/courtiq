'use client';

import { useQuery } from '@tanstack/react-query';
import { Target, ChevronRight, AlertTriangle, Clock } from 'lucide-react';
import Link from 'next/link';
import { query } from '@/lib/api';
import type { PlayerGoal } from '@/types/database';

interface Player {
  id: string;
  name: string;
}

interface GoalDeadlineCardProps {
  teamId: string;
}

function getDaysRemaining(targetDate: string): number {
  const target = new Date(targetDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function getDayLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days}d left`;
}

export function GoalDeadlineCard({ teamId }: GoalDeadlineCardProps) {
  const sevenDaysFromNow = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .split('T')[0];

  const { data: goals = [] } = useQuery<PlayerGoal[]>({
    queryKey: ['team-goal-deadlines', teamId, sevenDaysFromNow],
    queryFn: () =>
      query<PlayerGoal[]>({
        table: 'player_goals',
        select: 'id,player_id,skill,goal_text,target_date',
        filters: {
          team_id: teamId,
          status: 'active',
          target_date: { op: 'lte', value: sevenDaysFromNow },
        },
        order: { column: 'target_date', ascending: true },
        limit: 5,
      }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ['team-player-names', teamId],
    queryFn: () =>
      query<Player[]>({
        table: 'players',
        select: 'id,name',
        filters: { team_id: teamId, is_active: true },
      }),
    staleTime: 10 * 60 * 1000,
    enabled: goals.length > 0,
  });

  // Exclude goals with null target_date (defensive — the lte filter already handles this in SQL)
  const dueGoals = goals.filter((g) => g.target_date !== null);

  if (dueGoals.length === 0) return null;

  const playerMap = new Map(players.map((p) => [p.id, p.name]));

  const overdueCount = dueGoals.filter(
    (g) => getDaysRemaining(g.target_date!) < 0
  ).length;
  const dueTodayCount = dueGoals.filter(
    (g) => getDaysRemaining(g.target_date!) === 0
  ).length;

  const hasUrgent = overdueCount > 0 || dueTodayCount > 0;

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 ${
        hasUrgent
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-orange-500/30 bg-orange-500/5'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            hasUrgent ? 'bg-red-500/20' : 'bg-orange-500/20'
          }`}
        >
          <Target
            className={`h-4 w-4 ${hasUrgent ? 'text-red-400' : 'text-orange-400'}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-200">
            {overdueCount > 0
              ? `${overdueCount} goal${overdueCount > 1 ? 's' : ''} overdue`
              : 'Goals due soon'}
          </h3>
          <p className="text-xs text-zinc-500">
            {dueGoals.length} active goal{dueGoals.length > 1 ? 's' : ''}{' '}
            need{dueGoals.length === 1 ? 's' : ''} attention
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
            hasUrgent
              ? 'bg-red-500/20 text-red-400'
              : 'bg-orange-500/20 text-orange-400'
          }`}
        >
          {dueGoals.length}
        </span>
      </div>

      {/* Goal rows */}
      <div className="space-y-1.5">
        {dueGoals.slice(0, 3).map((goal) => {
          const days = getDaysRemaining(goal.target_date!);
          const isOverdue = days < 0;
          const isDueToday = days === 0;
          const playerName = playerMap.get(goal.player_id) ?? 'Player';

          return (
            <Link
              key={goal.id}
              href={`/roster/${goal.player_id}?tab=goals`}
              className="flex items-center gap-3 rounded-xl bg-zinc-900/50 p-3 hover:bg-zinc-800/50 active:scale-[0.98] transition-colors touch-manipulation"
            >
              {/* Status icon */}
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  isOverdue
                    ? 'bg-red-500/20'
                    : isDueToday
                      ? 'bg-amber-500/20'
                      : 'bg-orange-500/10'
                }`}
              >
                {isOverdue ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                ) : (
                  <Clock
                    className={`h-3.5 w-3.5 ${
                      isDueToday ? 'text-amber-400' : 'text-orange-400'
                    }`}
                  />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {playerName}
                  <span className="text-zinc-500 font-normal"> · {goal.skill}</span>
                </p>
                <p className="text-xs text-zinc-500 truncate">{goal.goal_text}</p>
              </div>

              {/* Deadline badge */}
              <div className="shrink-0 flex items-center gap-1">
                <span
                  className={`text-xs font-semibold ${
                    isOverdue
                      ? 'text-red-400'
                      : isDueToday
                        ? 'text-amber-400'
                        : 'text-orange-400'
                  }`}
                >
                  {getDayLabel(days)}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Overflow hint */}
      {dueGoals.length > 3 && (
        <p className="text-center text-xs text-zinc-500">
          +{dueGoals.length - 3} more · check Goals tab on player profiles
        </p>
      )}
    </div>
  );
}
