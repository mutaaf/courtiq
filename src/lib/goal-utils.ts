/**
 * Pure utilities for Player Development Goals.
 * All functions are side-effect free and testable.
 */

import type { PlayerGoal, GoalStatus, ProficiencyLevel } from '@/types/database';

// ─── Constants ────────────────────────────────────────────────────────────────

export const VALID_GOAL_STATUSES: GoalStatus[] = ['active', 'achieved', 'stalled', 'archived'];

export const VALID_GOAL_LEVELS: ProficiencyLevel[] = [
  'exploring',
  'practicing',
  'got_it',
  'game_ready',
];

// Ordered from lowest to highest for progress calculation
const LEVEL_ORDER: ProficiencyLevel[] = [
  'insufficient_data',
  'exploring',
  'practicing',
  'got_it',
  'game_ready',
];

// Status sort priority: active first, then stalled, achieved, archived
const STATUS_PRIORITY: Record<GoalStatus, number> = {
  active:   0,
  stalled:  1,
  achieved: 2,
  archived: 3,
};

// ─── Validators ───────────────────────────────────────────────────────────────

export function isValidGoalStatus(value: string): value is GoalStatus {
  return (VALID_GOAL_STATUSES as string[]).includes(value);
}

export function isValidGoalLevel(value: string): value is ProficiencyLevel {
  return (VALID_GOAL_LEVELS as string[]).includes(value);
}

// ─── Progress ─────────────────────────────────────────────────────────────────

/**
 * Returns 0–100 progress toward a target level given the current level.
 * Returns null when target level is null/undefined.
 */
export function getGoalProgressPct(
  currentLevel: ProficiencyLevel | null | undefined,
  targetLevel: ProficiencyLevel | null | undefined,
): number | null {
  if (!targetLevel || !currentLevel) return null;

  const current = LEVEL_ORDER.indexOf(currentLevel);
  const target = LEVEL_ORDER.indexOf(targetLevel);

  if (current < 0 || target < 0) return null;
  if (target === 0) return 100; // already at or past target
  if (current >= target) return 100;

  // For progress we start counting from "exploring" (index 1)
  const start = 1; // exploring is minimum meaningful start
  const span = target - start;
  const done = Math.max(0, current - start);

  if (span <= 0) return 100;
  return Math.round((done / span) * 100);
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Sort goals: active → stalled → achieved → archived, then by created_at desc.
 */
export function sortGoals(goals: PlayerGoal[]): PlayerGoal[] {
  return [...goals].sort((a, b) => {
    const statusDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

export interface GoalStatusCounts {
  active: number;
  achieved: number;
  stalled: number;
  archived: number;
  total: number;
}

export function countGoalsByStatus(goals: PlayerGoal[]): GoalStatusCounts {
  const counts: GoalStatusCounts = { active: 0, achieved: 0, stalled: 0, archived: 0, total: goals.length };
  for (const g of goals) {
    counts[g.status] = (counts[g.status] ?? 0) + 1;
  }
  return counts;
}

// ─── Filtering ────────────────────────────────────────────────────────────────

export function filterGoalsByStatus(goals: PlayerGoal[], status: GoalStatus): PlayerGoal[] {
  return goals.filter(g => g.status === status);
}

export function hasOverdueGoals(goals: PlayerGoal[]): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return goals.some(g => {
    if (g.status !== 'active' || !g.target_date) return false;
    return new Date(g.target_date) < today;
  });
}

/**
 * Returns the number of days until the target_date (negative if overdue).
 * Returns null if no target_date.
 */
export function daysUntilTarget(goal: Pick<PlayerGoal, 'target_date'>): number | null {
  if (!goal.target_date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(goal.target_date);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
