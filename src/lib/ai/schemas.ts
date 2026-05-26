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
  // Ticket 0045 — optional rollover annotation. The route copies the diff'd
  // rollover drills into this array so the plans page can render the quiet
  // "Carrying from last week: …" line above the drills section. Empty by
  // default; a plan without it (today's cold-start) still validates.
  rollover_from_last_week: z.array(
    z.object({
      drill_id: z.string().min(1),
      drill_name: z.string().min(1),
      source_plan_id: z.string().min(1),
    })
  ).optional(),
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
  since_last_report: z.string().nullable().optional(),
  // Ticket 0034 — optional cross-season growth note, populated only when the
  // target player has a coach-confirmed prior-season link (prior_player_id) and a
  // prior-season report was resolvable. Optional so existing reports, the no-link
  // path, and the 0016 since_last_report path all still validate.
  since_last_season: z.string().nullable().optional(),
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

export const playerOfMatchSchema = z.object({
  player_name: z.string(),
  session_label: z.string(),
  headline: z.string().min(5),
  achievement: z.string().min(10),
  key_moment: z.string().min(10),
  coach_message: z.string().min(5),
});

export type PlayerOfMatch = z.infer<typeof playerOfMatchSchema>;

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

export const teamTalkSchema = z.object({
  team_talk: z.string().min(30),
  focus_words: z.array(z.string().min(2).max(20)).min(2).max(3),
  energy_level: z.enum(['high', 'focused', 'calm']),
  chant: z.string().min(5).max(60),
});

export type TeamTalk = z.infer<typeof teamTalkSchema>;

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

// ── Season Letter (personal end-of-season letter to a player's family) ───────

export const seasonLetterSchema = z.object({
  player_name: z.string().min(1),
  season_label: z.string().min(3),
  letter: z.string().min(100),              // 3-4 warm paragraphs, coach's voice
  highlight_moment: z.string().min(20),     // One standout positive moment from observations
  growth_note: z.string().min(10),          // One area where they genuinely improved
  off_season_challenge: z.string().min(10), // One specific skill to work on over the break
  coach_name: z.string().min(1),
});

export type SeasonLetter = z.infer<typeof seasonLetterSchema>;

// ── Player Coaching Brief (what to say to a specific player before practice) ─

export const coachingBriefSchema = z.object({
  status: z.string(),                          // "On a Roll!", "Making Progress", "Needs Support"
  acknowledge: z.string(),                     // Sentence starting with player's first name
  focus: z.string(),                           // One specific thing to focus on today
  script: z.string(),                          // 2–3 sentence verbatim script for the coach to read
  focus_skill: z.string(),                     // Skill category (e.g., "Defense")
  tone: z.enum(['celebrating', 'encouraging', 'redirecting']),
});

export type CoachingBrief = z.infer<typeof coachingBriefSchema>;

// ── Weekly Coaching Digest (ticket 0023) ────────────────────────────────────
//
// A coach-private "your week in coaching" recap built from the last 7 days of a
// team's observations. The `next_action.kind` is a CLOSED enum so the home card
// can map it to a known in-app route (parent report / weekly star / practice
// plan / capture). COPPA: `top_players` carries only first names the coach
// already entered in their own observations — no new minor-scoped field.

export const WEEKLY_DIGEST_ACTION_KINDS = [
  'parent_report',
  'weekly_star',
  'practice_plan',
  'capture',
] as const;

export type WeeklyDigestActionKind = (typeof WEEKLY_DIGEST_ACTION_KINDS)[number];

export const weeklyDigestSchema = z.object({
  week_summary: z.string().min(1),               // One glanceable line about the week
  top_players: z.array(z.object({
    player_name: z.string().min(1),              // First name from the coach's own notes
    note: z.string().min(1),                     // One line on why they stood out
  })),
  next_action: z.object({
    label: z.string().min(1),                    // The button text, e.g. "Send Maya's report"
    kind: z.enum(WEEKLY_DIGEST_ACTION_KINDS),    // Closed set → mapped to a route client-side
    rationale: z.string().min(1),                // Why this is the one thing worth doing
  }),
});

export type WeeklyDigest = z.infer<typeof weeklyDigestSchema>;

// ── Program Pulse (ticket 0028) ─────────────────────────────────────────────
//
// A director-private weekly "program pulse" built from the org's last 7 days of
// COACH activity (sessions + observations). The pulse is coach/team aggregate
// only — never per-minor. `next_action.kind` is a CLOSED enum so the admin card
// maps it to a known in-app route (the 0024 staff-invite or the org-analytics
// detail). COPPA: no player names, jerseys, or observation text — the prompt is
// fed only aggregate counts + team/coach names, and nothing is collected on
// `players`.

export const PROGRAM_PULSE_ACTION_KINDS = [
  'nudge_coach',
  'invite_staff',
  'view_analytics',
] as const;

export type ProgramPulseActionKind = (typeof PROGRAM_PULSE_ACTION_KINDS)[number];

export const programPulseSchema = z.object({
  week_summary: z.string().min(1),               // One glanceable line about the program's week
  active_coaches: z.number().int(),              // Coaches with ≥1 obs/session in the last 7 days
  total_coaches: z.number().int(),               // All coaches in the org
  teams_to_watch: z.array(z.object({
    team_name: z.string().min(1),                // Team-level aggregate only — never a player
    note: z.string().min(1),                     // One line on why this team is worth attention
  })),
  next_action: z.object({
    label: z.string().min(1),                    // The button text, e.g. "Nudge Coach Rivera"
    kind: z.enum(PROGRAM_PULSE_ACTION_KINDS),    // Closed set → mapped to a route client-side
    rationale: z.string().min(1),                // Why this is the one thing worth doing
  }),
});

export type ProgramPulse = z.infer<typeof programPulseSchema>;

// ── Sideline Talking Points (ticket 0046) ──────────────────────────────────
//
// A coach-private one-tap sideline cheat sheet: one row per active player on
// the team, two lines per row — a positive specific thing the coach can lead
// with, and a "we're working on" pivot for when the parent asks for more.
//
// The schema is STRICT (`.strict()` at both top-level AND per-entry) so any
// extra key — including any descriptive minor field — is rejected. The COPPA
// pin is that the artifact carries `player_first_name` ONLY, never a full
// surname / DOB / parent field. The artifact NEVER reaches a public surface
// (no token route, no sitemap entry); it lives only in `plans.content_structured`
// alongside every other coach-private artifact.

export const sidelineTalkingPointEntrySchema = z
  .object({
    player_id: z.string().min(1),
    player_first_name: z.string().min(1),
    lead_line: z.string().min(1),         // one sentence, the positive specific thing
    working_on_line: z.string().min(1),    // one sentence, the "we're working on" pivot
  })
  .strict();

export const sidelineTalkingPointsSchema = z
  .object({
    team_id: z.string().min(1),
    entries: z.array(sidelineTalkingPointEntrySchema).min(1),
  })
  .strict();

export type SidelineTalkingPointEntry = z.infer<typeof sidelineTalkingPointEntrySchema>;
export type SidelineTalkingPoints = z.infer<typeof sidelineTalkingPointsSchema>;

// ── Pre-game Brief (ticket 0040) ────────────────────────────────────────────
//
// A coach-private one-tap brief synthesised from an existing opponent scouting
// profile + this team's last 4 weeks of observations + the coach's signature.
// The schema is STRICT (`.strict()`) so any extra key — including any per-player
// field — is rejected; this is the COPPA pin for the artifact's shape (the
// brief is about the OPPONENT and the TEAM by construction; never per-minor).
// LIGHTER than the dormant gamedaySheet on purpose: four blocks, four keys,
// readable in 90 seconds.

export const pregameBriefSchema = z.object({
  opponent_read: z.string().min(20),       // 2 sentences on what the opponent does well
  our_edge: z.string().min(20),            // 2 sentences on what we have been working on that fits
  huddle_points: z.array(z.string().min(5)).min(2).max(5), // 3-ish points the coach reads in the huddle
  coach_note: z.string().min(5),           // a single coach-private reminder line
}).strict();

export type PregameBrief = z.infer<typeof pregameBriefSchema>;
