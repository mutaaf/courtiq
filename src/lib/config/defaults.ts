// System defaults — read-only reference
// Always use the config resolver, never import these directly in components

export const SYSTEM_DEFAULTS = {
  sport: {
    categories: ['Offense', 'Defense', 'IQ', 'Effort', 'Coachability', 'Physical', 'General'],
    positions: ['PG', 'SG', 'SF', 'PF', 'C', 'Flex'],
    age_groups: ['5-7', '8-10', '11-13', '14-18'],
    drill_categories: [
      'Ball Handling', 'Passing', 'Shooting', 'Layups', 'Rebounding',
      'Defense', 'Fast Break', 'Screening', 'Conditioning', 'Team Play', 'Fun Games',
    ],
    terminology: {
      session_practice: 'Practice',
      session_game: 'Game',
      observation: 'Observation',
      player: 'Player',
    },
  },
  curriculum: {
    enabled: true,
    proficiency_window_size: 20,
    min_reps_to_evaluate: 5,
  },
  ai: {
    model: 'claude-sonnet-4-20250514',
    rate_limit_per_hour: 60,
    custom_instructions: '',
  },
  report_card: {
    proficiency_labels: ['Exploring', 'Practicing', 'Got It!', 'Game Ready'],
    narrative_tone: 'encouraging, growth-mindset',
    include_home_practice: true,
    sections: {
      skill_progress: true,
      strengths: true,
      growth_areas: true,
      coach_note: true,
      home_practice: true,
      season_timeline: true,
    },
  },
  parent_portal: {
    share_expiration_days: null,
    pin_required: false,
    thank_coach_button: true,
    allow_parent_footage: true,
    sections: {
      report_card: true,
      development_card: true,
      highlights: true,
      goals: true,
      drills: true,
      coach_note: true,
      skill_challenges: true,
      observations: false,
    },
  },
} as const;
