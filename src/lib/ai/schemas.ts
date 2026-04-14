import { z } from 'zod';

export const segmentedObservationSchema = z.object({
  observations: z.array(
    z.object({
      player_name: z.string().min(1),
      category: z.string(),
      sentiment: z.enum(['positive', 'needs-work', 'neutral']),
      text: z.string().min(5),
      skill_id: z.string().nullable().optional(),
      result: z.enum(['success', 'failure']).nullable().optional(),
      stats: z.object({
        points: z.number().optional(),
        rebounds: z.number().optional(),
        assists: z.number().optional(),
        steals: z.number().optional(),
        blocks: z.number().optional(),
        turnovers: z.number().optional(),
      }).nullable().optional(),
      tendency: z.string().nullable().optional(),
    })
  ),
  unmatched_names: z.array(z.string()).optional(),
  team_observations: z.array(
    z.object({
      category: z.string(),
      sentiment: z.enum(['positive', 'needs-work', 'neutral']),
      text: z.string().min(5),
    })
  ).optional(),
});

export const practicePlanSchema = z.object({
  title: z.string(),
  duration_minutes: z.number().positive(),
  warmup: z.object({
    name: z.string(),
    duration_minutes: z.number(),
    description: z.string(),
  }),
  drills: z.array(
    z.object({
      name: z.string(),
      skill_id: z.string().optional(),
      duration_minutes: z.number(),
      description: z.string(),
      coaching_cues: z.array(z.string()).optional(),
      players_required: z.number().optional(),
    })
  ).min(1),
  scrimmage: z.object({
    duration_minutes: z.number(),
    focus: z.string(),
  }).optional(),
  cooldown: z.object({
    duration_minutes: z.number(),
    notes: z.string(),
  }).optional(),
});

export const gamedaySheetSchema = z.object({
  title: z.string(),
  opponent: z.string().optional(),
  pregame_message: z.string().optional(),
  scouting_report: z.object({
    opponent_strengths: z.array(z.string()).optional(),
    opponent_weaknesses: z.array(z.string()).optional(),
    key_players_to_watch: z.array(z.object({
      name: z.string(),
      threat_level: z.enum(['high', 'medium', 'low']).optional(),
      defensive_assignment: z.string().optional(),
      notes: z.string().optional(),
    })).optional(),
  }).optional(),
  game_plan: z.object({
    offensive_focus: z.array(z.string()),
    defensive_focus: z.array(z.string()),
    key_matchups: z.array(z.string()).optional(),
    set_plays: z.array(z.object({
      name: z.string(),
      description: z.string(),
      use_when: z.string().optional(),
    })).optional(),
  }),
  lineup: z.array(z.object({
    player_name: z.string(),
    position: z.string(),
    focus_areas: z.array(z.string()),
  })).optional(),
  substitution_plan: z.string().optional(),
  halftime_adjustments: z.array(z.string()).optional(),
  coaching_reminders: z.array(z.string()).optional(),
});

export const developmentCardSchema = z.object({
  player_name: z.string(),
  strengths: z.array(z.string()).min(1),
  growth_areas: z.array(z.string()),
  goals: z.array(z.object({
    skill: z.string(),
    current_level: z.string(),
    target_level: z.string(),
    action_steps: z.array(z.string()),
  })),
  coach_note: z.string().min(10).max(500),
  recommended_drills: z.array(z.object({
    name: z.string(),
    description: z.string(),
    focus: z.string(),
  })).optional(),
});

export const reportCardSchema = z.object({
  player_name: z.string(),
  skills: z.array(
    z.object({
      skill_name: z.string(),
      proficiency_level: z.string(),
      narrative: z.string().max(200),
      trend: z.enum(['improving', 'plateau', 'regressing', 'new']).optional(),
    })
  ),
  strengths: z.array(z.string()).min(1),
  growth_areas: z.array(z.string()),
  coach_note: z.string().min(10).max(500),
  home_practice_suggestion: z.string().optional(),
  season_summary: z.string().optional(),
});

export const parentReportSchema = z.object({
  player_name: z.string(),
  greeting: z.string(),
  highlights: z.array(z.string()).min(1),
  skill_progress: z.array(z.object({
    skill_name: z.string(),
    level: z.string(),
    narrative: z.string(),
  })),
  encouragement: z.string(),
  home_activity: z.object({
    name: z.string(),
    description: z.string(),
    duration_minutes: z.number(),
  }).optional(),
  coach_note: z.string(),
});

export const rosterImportSchema = z.object({
  players: z.array(z.object({
    name: z.string().min(1),
    jersey_number: z.number().nullable().optional(),
    position: z.string().optional(),
  })),
});

export type SegmentedObservations = z.infer<typeof segmentedObservationSchema>;
export type PracticePlan = z.infer<typeof practicePlanSchema>;
export type GamedaySheet = z.infer<typeof gamedaySheetSchema>;
export type DevelopmentCard = z.infer<typeof developmentCardSchema>;
export type ReportCard = z.infer<typeof reportCardSchema>;
export type ParentReport = z.infer<typeof parentReportSchema>;
export type RosterImport = z.infer<typeof rosterImportSchema>;

export const weeklyNewsletterSchema = z.object({
  title: z.string(),
  date_range: z.string(),
  week_summary: z.string(),
  team_highlight: z.string(),
  player_spotlights: z.array(z.object({
    player_name: z.string(),
    highlight: z.string(),
    home_challenge: z.string(),
  })).min(1),
  upcoming_focus: z.string(),
  coaching_note: z.string(),
});

export type WeeklyNewsletter = z.infer<typeof weeklyNewsletterSchema>;

export const skillChallengeSchema = z.object({
  player_name: z.string(),
  week_label: z.string(),
  challenges: z.array(z.object({
    title: z.string(),
    skill_area: z.string(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    minutes_per_day: z.number().positive(),
    description: z.string(),
    steps: z.array(z.string()).min(1),
    success_criteria: z.string(),
    encouragement: z.string(),
  })).min(1).max(3),
  parent_note: z.string(),
});

export type SkillChallenge = z.infer<typeof skillChallengeSchema>;

export const seasonStorylineSchema = z.object({
  player_name: z.string(),
  season_label: z.string(),
  opening: z.string(),
  chapters: z.array(z.object({
    phase: z.string(),
    weeks: z.string(),
    narrative: z.string(),
    highlights: z.array(z.string()),
    growth_moments: z.array(z.string()),
  })).min(1),
  current_strengths: z.array(z.string()).min(1),
  trajectory: z.string(),
  coach_reflection: z.string(),
});

export type SeasonStoryline = z.infer<typeof seasonStorylineSchema>;

export const drillBuilderSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(10),
  category: z.string().min(1),
  age_groups: z.array(z.string()).min(1),
  duration_minutes: z.number().positive(),
  player_count_min: z.number().int().positive(),
  player_count_max: z.number().int().positive().nullable().optional(),
  equipment: z.array(z.string()).optional(),
  setup_instructions: z.string().min(10),
  teaching_cues: z.array(z.string()).min(1),
  variations: z.array(z.object({
    title: z.string(),
    description: z.string(),
  })).optional(),
});

export type DrillBuilderResult = z.infer<typeof drillBuilderSchema>;

export const snapObservationSchema = z.object({
  image_description: z.string().optional(),
  observations: z.array(
    z.object({
      player_name: z.string().min(1),
      category: z.string(),
      sentiment: z.enum(['positive', 'needs-work', 'neutral']),
      text: z.string().min(5),
      skill_id: z.string().nullable().optional(),
    })
  ),
  team_observations: z.array(
    z.object({
      category: z.string(),
      sentiment: z.enum(['positive', 'needs-work', 'neutral']),
      text: z.string().min(5),
    })
  ).optional(),
});

export type SnapObservationResult = z.infer<typeof snapObservationSchema>;

export const gameRecapSchema = z.object({
  title: z.string(),
  result_headline: z.string(), // e.g. "Victory Over Lions" or "Tough Loss to Eagles"
  intro: z.string().min(20),   // Opening 2-3 sentence narrative
  key_moments: z.array(z.object({
    headline: z.string(),
    description: z.string(),
    player_name: z.string().optional(),
  })).min(1).max(5),
  player_highlights: z.array(z.object({
    player_name: z.string(),
    highlight: z.string(),
    stat_line: z.string().optional(),
  })).min(1).max(6),
  team_performance: z.object({
    offensive_note: z.string(),
    defensive_note: z.string(),
    effort_note: z.string(),
  }),
  coach_message: z.string(),  // Short motivational message from the coach
  looking_ahead: z.string(),  // Forward-looking closing sentence
});

export type GameRecap = z.infer<typeof gameRecapSchema>;

export const weeklyStarSchema = z.object({
  player_name: z.string(),
  week_label: z.string(),
  headline: z.string().min(5),            // e.g. "Showed up big all week!"
  achievement: z.string().min(10),         // 2–3 sentences describing what they did well
  growth_moment: z.string().min(10),       // specific coaching observation turned into praise
  challenge_ahead: z.string().min(10),     // what to keep working on
  coach_shoutout: z.string().min(5),       // short 1-sentence kudos from the coach
});

export type WeeklyStar = z.infer<typeof weeklyStarSchema>;
