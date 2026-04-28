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
    confidence: z.enum(['high', 'medium', 'low']).optional(),
  })),
  notes: z.string().optional(),
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

export const seasonSummarySchema = z.object({
  headline: z.string().min(5),               // e.g. "A Season of Breakthroughs"
  season_period: z.string(),                 // e.g. "Fall 2024 · Sep 1 – Dec 15"
  overall_assessment: z.string().min(20),    // 2-3 sentence narrative overview
  team_highlights: z.array(z.object({
    title: z.string(),
    description: z.string(),
  })).min(1).max(5),
  skill_progress: z.array(z.object({
    skill: z.string(),
    status: z.enum(['strength', 'most_improved', 'consistent', 'needs_work']),
    description: z.string(),
  })).min(1).max(8),
  player_breakthroughs: z.array(z.object({
    player_name: z.string(),
    achievement: z.string(),
  })).max(6),
  team_challenges: z.array(z.string()).min(1).max(4),
  coaching_insights: z.string().min(10),    // What the data reveals about coaching patterns
  next_season_priorities: z.array(z.string()).min(1).max(4),
  closing_message: z.string().min(10),      // Motivational season-end note
});

export type SeasonSummary = z.infer<typeof seasonSummarySchema>;

export const seasonAwardsSchema = z.object({
  season_label: z.string().min(5),           // e.g. "Spring 2025 Season Awards"
  ceremony_intro: z.string().min(10),        // Warm opening from the coach perspective
  awards: z.array(z.object({
    player_name: z.string().min(1),
    award_title: z.string().min(3).max(80),  // e.g. "Defensive Anchor Award"
    emoji: z.string().min(1),                // e.g. "🛡️"
    description: z.string().min(10),        // 2-3 sentences on why this player
    standout_moment: z.string().min(5),      // One specific observation or moment
  })).min(1).max(30),
  team_message: z.string().min(10),          // Closing team-wide note
});

export type SeasonAwards = z.infer<typeof seasonAwardsSchema>;

export const coachReflectionSchema = z.object({
  session_summary: z.string().min(10),       // 2-3 sentence AI overview of the session
  questions: z.array(z.object({
    id: z.string().min(1),
    question: z.string().min(10),            // The reflection question text
    context: z.string().min(5),             // Why this question is relevant (data-driven)
    category: z.enum([
      'player_development',                  // About individual player growth
      'team_dynamics',                       // About how the team worked together
      'coaching_approach',                   // About the coach's own methods
      'session_design',                      // About practice structure and planning
    ]),
  })).min(3).max(5),
  growth_focus: z.string().min(5),           // One key area for the coach to prioritize next session
});

export type CoachReflection = z.infer<typeof coachReflectionSchema>;

export const playerSessionMessagesSchema = z.object({
  session_label: z.string(),                   // e.g. "Tuesday's Practice — Apr 14"
  messages: z.array(z.object({
    player_name: z.string(),
    message: z.string().min(20),               // 2–3 sentence warm, parent-friendly note
    highlight: z.string().min(5),              // One specific thing they did well today
    next_focus: z.string().min(5),             // One growth tip for next session
  })).min(1).max(15),
  team_note: z.string().min(10),               // Brief 1–2 sentence team-wide observation
});

export type PlayerSessionMessages = z.infer<typeof playerSessionMessagesSchema>;

export const teamGroupMessageSchema = z.object({
  message: z.string().min(30),                  // 2–4 warm, parent-friendly sentences
  session_label: z.string(),                    // e.g. "Tuesday's Practice — Apr 22"
  team_highlight: z.string().min(10),           // Key team moment worth celebrating
  coaching_focus: z.array(z.string()).min(1).max(4), // Skills worked on
  encouragement: z.string().min(10),            // Closing note for parents
  next_session_note: z.string().optional(),     // Optional next-session hint
});

export type TeamGroupMessage = z.infer<typeof teamGroupMessageSchema>;

export const huddleScriptSchema = z.object({
  huddle_script: z.string().min(30),             // Full 30-second script the coach reads aloud
  player_spotlight: z.object({
    player_id: z.string().optional(),
    name: z.string().min(1),                     // Player first name
    achievement: z.string().min(5),              // Specific thing they did well
  }),
  team_shoutout: z.string().min(10),             // One thing the whole team did well
  team_challenge: z.string().min(10),            // One skill to practice before next session
  next_session_hint: z.string().optional(),      // e.g. "Thursday at 4pm at Northside Gym"
});

export type HuddleScript = z.infer<typeof huddleScriptSchema>;

export const teamPersonalitySchema = z.object({
  team_type: z.string().min(3).max(40),          // e.g. "The Grinders"
  type_emoji: z.string().min(1).max(4),          // e.g. "💪"
  tagline: z.string().min(10).max(80),           // e.g. "Hard work is their superpower"
  description: z.string().min(30),              // 2-3 sentences about this team's personality
  traits: z.array(z.object({
    name: z.string().min(2).max(30),             // e.g. "Work Ethic"
    score: z.number().int().min(0).max(100),     // 0-100 score
    description: z.string().min(10),            // 1 sentence: what this score means for them
  })).min(3).max(5),
  strengths: z.array(z.string().min(3)).min(1).max(3),
  growth_areas: z.array(z.string().min(3)).min(1).max(3),
  coaching_tips: z.array(z.string().min(10)).min(2).max(4),  // What works for this team type
  team_motto: z.string().min(5).max(60),         // Short punchy motto: "Leave it all on the court"
});

export type TeamPersonality = z.infer<typeof teamPersonalitySchema>;

// ── Practice Arc (multi-session progression plan) ───────────────────────────

const practiceArcSessionSchema = z.object({
  session_number: z.number().int().min(1).max(3),
  title: z.string().min(3),
  theme: z.string().min(3),                        // e.g. "Defense Foundations"
  duration_minutes: z.number().positive(),
  session_goal: z.string().min(10),
  warmup: z.object({
    name: z.string().min(3),
    duration_minutes: z.number().positive(),
    description: z.string().min(10),
  }),
  drills: z.array(z.object({
    name: z.string().min(3),
    duration_minutes: z.number().positive(),
    description: z.string().min(10),
    coaching_cues: z.array(z.string().min(5)),
    progression_note: z.string().optional(),       // "Builds on Session 1's zone principles"
  })).min(2),
  cooldown: z.object({
    duration_minutes: z.number().positive(),
    notes: z.string().min(5),
  }),
  key_coaching_point: z.string().min(10),         // The ONE thing to say to players today
  carries_forward: z.string().optional(),          // What carries into the next practice
});

export const practiceArcSchema = z.object({
  arc_title: z.string().min(5),                   // e.g. "Tournament Prep — 3-Practice Arc"
  arc_goal: z.string().min(10),
  primary_focus: z.array(z.string().min(2)).min(1).max(3),
  total_sessions: z.number().int().min(2).max(3),
  sessions: z.array(practiceArcSessionSchema).min(2).max(3),
  progression_note: z.string().min(20),           // Narrative connecting the sessions together
  game_day_tip: z.string().optional(),            // Final advice for game / event day
});

export type PracticeArc = z.infer<typeof practiceArcSchema>;
export type PracticeArcSession = z.infer<typeof practiceArcSessionSchema>;
