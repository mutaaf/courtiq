import type { AchievementBadgeType } from '@/types/database';
import { BADGE_DEFS } from '@/app/api/player-achievements/route';

export { BADGE_DEFS };

// ─── Criteria evaluation ──────────────────────────────────────────────────────

export interface ObsSummary {
  sentiment: 'positive' | 'needs-work' | 'neutral';
  category: string;
}

export interface ProfSummary {
  proficiency_level: string;
}

export interface GameObsSummary {
  id: string;
}

/**
 * Pure function: given aggregated player stats, return badge types that should
 * be awarded (excludes any already in `alreadyEarned`).
 */
export function evaluateAutoBadges(
  obs: ObsSummary[],
  proficiencies: ProfSummary[],
  sessionCount: number,
  gameObsCount: number,
  alreadyEarned: Set<string>,
): AchievementBadgeType[] {
  const totalObs = obs.length;
  const positiveObs = obs.filter((o) => o.sentiment === 'positive').length;
  const uniqueCategories = new Set(obs.map((o) => o.category)).size;

  const toAward: AchievementBadgeType[] = [];

  if (!alreadyEarned.has('first_star') && positiveObs >= 1) {
    toAward.push('first_star');
  }
  if (!alreadyEarned.has('team_player') && positiveObs >= 10) {
    toAward.push('team_player');
  }
  if (!alreadyEarned.has('grinder') && totalObs >= 25) {
    toAward.push('grinder');
  }
  if (!alreadyEarned.has('all_rounder') && uniqueCategories >= 4) {
    toAward.push('all_rounder');
  }
  if (
    !alreadyEarned.has('breakthrough') &&
    proficiencies.some((p) => p.proficiency_level === 'game_ready')
  ) {
    toAward.push('breakthrough');
  }
  if (!alreadyEarned.has('game_changer') && gameObsCount > 0) {
    toAward.push('game_changer');
  }
  if (!alreadyEarned.has('session_regular') && sessionCount >= 10) {
    toAward.push('session_regular');
  }

  return toAward;
}

export const MANUAL_BADGE_TYPES: AchievementBadgeType[] = [
  'coach_pick',
  'most_improved',
  'rising_star',
];

export const AUTO_BADGE_TYPES: AchievementBadgeType[] = BADGE_DEFS
  .filter((d) => d.auto)
  .map((d) => d.badge_type);
