import type { Observation, ProficiencyLevel, Trend } from '@/types/database';

interface ProgressionLevels {
  exploring: { min_success_rate: number };
  practicing: { min_success_rate: number };
  got_it: { min_success_rate: number };
  game_ready: { min_success_rate: number; context?: string };
}

interface ProficiencyResult {
  level: ProficiencyLevel;
  success_rate: number;
  reps_evaluated: number;
  trend: Trend;
}

interface ComputeOptions {
  windowSize?: number;
  minReps?: number;
  sessionType?: string;
}

export function computeProficiency(
  observations: Pick<Observation, 'result' | 'created_at'>[],
  skillConfig: { progression_levels: ProgressionLevels },
  options: ComputeOptions = {}
): ProficiencyResult {
  const { windowSize = 20, minReps = 5, sessionType } = options;
  const levels = skillConfig.progression_levels;

  // Filter by session type if specified (for game_ready evaluation)
  let filtered = observations;

  // Sort by created_at desc and take window
  const sorted = [...filtered]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, windowSize);

  // Only count observations with a result
  const evaluated = sorted.filter((o) => o.result === 'success' || o.result === 'failure');

  if (evaluated.length < minReps) {
    return {
      level: 'insufficient_data',
      success_rate: 0,
      reps_evaluated: evaluated.length,
      trend: 'new',
    };
  }

  const successCount = evaluated.filter((o) => o.result === 'success').length;
  const successRate = successCount / evaluated.length;

  // Determine level (check from highest to lowest)
  let level: ProficiencyLevel = 'exploring';

  if (sessionType === 'game' || levels.game_ready.context === 'game_only') {
    // game_ready only counts game observations
    if (successRate >= levels.game_ready.min_success_rate && sessionType === 'game') {
      level = 'game_ready';
    } else if (successRate >= levels.got_it.min_success_rate) {
      level = 'got_it';
    } else if (successRate >= levels.practicing.min_success_rate) {
      level = 'practicing';
    }
  } else {
    if (successRate >= levels.got_it.min_success_rate) {
      level = 'got_it';
    } else if (successRate >= levels.practicing.min_success_rate) {
      level = 'practicing';
    } else if (successRate >= levels.exploring.min_success_rate) {
      level = 'exploring';
    }
  }

  // Compute trend
  const trend = computeTrend(evaluated);

  return {
    level,
    success_rate: Math.round(successRate * 100) / 100,
    reps_evaluated: evaluated.length,
    trend,
  };
}

function computeTrend(observations: Pick<Observation, 'result' | 'created_at'>[]): Trend {
  if (observations.length < 6) return 'new';

  const half = Math.floor(observations.length / 2);
  const recent = observations.slice(0, half);
  const older = observations.slice(half);

  const recentRate = recent.filter((o) => o.result === 'success').length / recent.length;
  const olderRate = older.filter((o) => o.result === 'success').length / older.length;

  const diff = recentRate - olderRate;

  if (diff > 0.1) return 'improving';
  if (diff < -0.1) return 'regressing';
  return 'plateau';
}

export function getProficiencyLabel(level: ProficiencyLevel, labels?: string[]): string {
  const defaultLabels: Record<ProficiencyLevel, string> = {
    insufficient_data: 'Not Enough Data',
    exploring: labels?.[0] || 'Exploring',
    practicing: labels?.[1] || 'Practicing',
    got_it: labels?.[2] || 'Got It!',
    game_ready: labels?.[3] || 'Game Ready',
  };
  return defaultLabels[level];
}

export function getProficiencyColor(level: ProficiencyLevel): string {
  const colors: Record<ProficiencyLevel, string> = {
    insufficient_data: 'zinc',
    exploring: 'amber',
    practicing: 'blue',
    got_it: 'emerald',
    game_ready: 'purple',
  };
  return colors[level];
}
