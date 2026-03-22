import type { Sport } from '@/types/database';

export interface SportConfig {
  slug: string;
  name: string;
  icon: string;
  positions: string[];
  categories: string[];
  ageGroups: string[];
  drillCategories: string[];
  curriculumEnabled: boolean;
  terminology: Record<string, string>;
}

export function sportToConfig(sport: Sport): SportConfig {
  return {
    slug: sport.slug,
    name: sport.name,
    icon: sport.icon || '',
    positions: sport.default_positions,
    categories: sport.default_categories,
    ageGroups: sport.default_age_groups,
    drillCategories: sport.drill_categories,
    curriculumEnabled: sport.curriculum_enabled,
    terminology: (sport.terminology as Record<string, string>) || {},
  };
}

// Basketball-specific prompts
export const BASKETBALL_PROMPTS = {
  systemPreamble: `You are an expert youth basketball coach.
Key concepts: pick and roll, fast break, help-side defense, box out, spacing, ball movement, transition, triple threat, closeout, post moves, screen and roll, give and go.
Basketball positions: PG (Point Guard), SG (Shooting Guard), SF (Small Forward), PF (Power Forward), C (Center).`,
  segmentation: {
    extraRules: [
      'Recognize basketball positions: PG, SG, SF, PF, C',
      "Map 'drive' and 'attack the rim' to Offense category",
      "Map 'close out' and 'help side' to Defense category",
      "Map 'triple threat' and 'shot fake' to IQ category",
    ],
  },
};

export const SPORT_PROMPTS: Record<string, typeof BASKETBALL_PROMPTS> = {
  basketball: BASKETBALL_PROMPTS,
};
