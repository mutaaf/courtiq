import type { Player, CurriculumSkill, Team } from '@/types/database';

export interface ObservationInsightsParam {
  totalObs: number;
  daysOfData: number;
  topNeedsWork: Array<{ category: string; count: number }>;
  topStrengths: Array<{ category: string; count: number }>;
}

interface PromptParams {
  sportName?: string;
  sportPreamble?: string;
  teamName?: string;
  ageGroup?: string;
  playerCount?: number;
  seasonWeek?: number;
  practiceDuration?: number;
  roster?: Pick<Player, 'name' | 'nickname' | 'position' | 'jersey_number' | 'name_variants'>[];
  skills?: Pick<CurriculumSkill, 'skill_id' | 'name' | 'category'>[];
  categories?: string[];
  positions?: string[];
  customInstructions?: string;
  [key: string]: unknown;
}

function buildSystemPreamble(params: PromptParams): string {
  const parts = [
    `You are an expert youth ${params.sportName || 'basketball'} coach and AI coaching assistant for SportsIQ.`,
    params.sportPreamble || '',
    'You work with volunteer coaches at organizations like the YMCA.',
    'Your communication style is encouraging, growth-mindset oriented, and age-appropriate.',
    params.customInstructions || '',
  ].filter(Boolean);
  return parts.join('\n');
}

export const PROMPT_REGISTRY = {
  segmentTranscript: (params: PromptParams & { transcript: string }) => ({
    system: [
      buildSystemPreamble(params),
      'You segment coaching voice transcripts into individual player observations.',
      '',
      'CRITICAL: This transcript comes from speech-to-text recognition and WILL contain errors.',
      '- Player names are frequently misrecognized by speech-to-text. For example:',
      '  - "Amin" may appear as "I mean", "a mean", "ah mean"',
      '  - "Jamal" may appear as "jam all" or "ja mall"',
      '  - "DeAndre" may appear as "the Andre" or "de Andre"',
      '- ALWAYS check for PHONETIC matches between words in the transcript and names on the roster.',
      '- When you see a word or phrase that SOUNDS LIKE a player name when spoken aloud, match it to the closest roster name.',
      '- Be aggressive about matching — it is MUCH better to create an observation with your best phonetic guess than to miss a player entirely.',
      '- Only use unmatched_names when you genuinely cannot find any phonetic match on the roster.',
      '',
      'Rules:',
      '- Each observation should be about ONE player and ONE topic.',
      `- Categories: ${(params.categories || ['Offense', 'Defense', 'IQ', 'Effort', 'Coachability']).join(', ')}`,
      '- Sentiment: positive, needs-work, or neutral.',
      '- If a skill_id can be matched from the curriculum skills list, include it.',
      '- Team-level observations (not about specific players) go in team_observations.',
      '- Extract any stats mentioned (points, rebounds, assists, steals, blocks, turnovers)',
      '- Note player-to-player interactions (passes, screens, picks)',
      '- Identify tendencies and patterns ("always drives left", "hesitates on open shots")',
      '- Include a "stats" field in each observation if any stats are mentioned',
      '- Include a "tendency" field if a pattern or habit is described',
      '- Even if the transcript is short or unclear, try to extract at least one observation.',
    ].join('\n'),
    user: [
      'Roster (match transcript words phonetically to these names):',
      (params.roster || []).map((p) => {
        let line = `- ${p.name}`;
        if (p.nickname) line += ` ("${p.nickname}")`;
        if (p.name_variants?.length) line += ` [also sounds like: ${p.name_variants.join(', ')}]`;
        line += ` #${p.jersey_number || '?'} ${p.position}`;
        return line;
      }).join('\n'),
      params.skills ? '\nCurriculum Skills:\n' + params.skills.map((s) => `- ${s.skill_id}: ${s.name} (${s.category})`).join('\n') : '',
      '\nTranscript:',
      params.transcript,
      '\nSegment into individual observations. Respond with JSON matching this schema:',
      '{ "observations": [{ "player_name", "category", "sentiment", "text", "skill_id", "result", "stats", "tendency" }], "unmatched_names": [], "team_observations": [{ "category", "sentiment", "text" }] }',
    ].join('\n'),
  }),

  practicePlan: (params: PromptParams & {
    proficiencyData?: unknown;
    focusSkills?: string[];
    observationInsights?: ObservationInsightsParam;
  }) => {
    const insights = params.observationInsights;
    const hasInsights = insights && insights.totalObs > 0;

    const insightsBlock = hasInsights
      ? [
          '',
          `REAL TEAM PERFORMANCE DATA (last ${insights.daysOfData} days, ${insights.totalObs} observations):`,
          insights.topNeedsWork.length > 0
            ? `Areas most needing improvement:\n${insights.topNeedsWork
                .map((c) => `  - ${c.category}: ${c.count} needs-work observation${c.count !== 1 ? 's' : ''}`)
                .join('\n')}`
            : '',
          insights.topStrengths.length > 0
            ? `Team strengths to reinforce:\n${insights.topStrengths
                .map((c) => `  - ${c.category}: ${c.count} positive observation${c.count !== 1 ? 's' : ''}`)
                .join('\n')}`
            : '',
          '',
          'IMPORTANT: Use this real performance data to make this plan highly specific to this team.',
          insights.topNeedsWork.length > 0
            ? `Allocate at least 50% of drill time to the top ${Math.min(2, insights.topNeedsWork.length)} needs-improvement area(s) listed above.`
            : '',
          insights.topStrengths.length > 0
            ? `Include at least one drill that celebrates and builds on the team\'s strengths.`
            : '',
        ]
        .filter(Boolean)
        .join('\n')
      : '';

    return {
      system: [
        buildSystemPreamble(params),
        'You generate age-appropriate, curriculum-aligned practice plans.',
        `Age group: ${params.ageGroup || '8-10'}`,
        `Practice duration: ${params.practiceDuration || 60} minutes`,
        `Season week: ${params.seasonWeek || 1}`,
        `Player count: ${params.playerCount || 10}`,
      ].join('\n'),
      user: [
        `Generate a practice plan for ${params.teamName || 'the team'}.`,
        params.focusSkills?.length ? `Requested focus skills: ${params.focusSkills.join(', ')}` : '',
        insightsBlock,
        params.proficiencyData ? `Additional proficiency data: ${JSON.stringify(params.proficiencyData)}` : '',
        'Respond with JSON: { "title", "duration_minutes", "warmup": { "name", "duration_minutes", "description" }, "drills": [{ "name", "skill_id", "duration_minutes", "description", "coaching_cues" }], "scrimmage": { "duration_minutes", "focus" }, "cooldown": { "duration_minutes", "notes" } }',
      ].filter(Boolean).join('\n'),
    };
  },

  gamedaySheet: (params: PromptParams & { opponent?: string; gameNotes?: string }) => ({
    system: [
      buildSystemPreamble(params),
      'You generate game day preparation sheets for youth coaches.',
    ].join('\n'),
    user: [
      `Generate a game day sheet for ${params.teamName || 'the team'}.`,
      params.opponent ? `Opponent: ${params.opponent}` : '',
      params.gameNotes || '',
      'Respond with JSON: { "title", "opponent", "game_plan": { "offensive_focus": [], "defensive_focus": [] }, "substitution_plan", "halftime_adjustments": [] }',
    ].filter(Boolean).join('\n'),
  }),

  developmentCard: (params: PromptParams & { playerName: string; observations: unknown[]; proficiency: unknown }) => ({
    system: [
      buildSystemPreamble(params),
      'You generate individual player development cards with specific, actionable goals.',
      'Always lead with positives. Use growth-mindset language.',
    ].join('\n'),
    user: [
      `Generate a development card for ${params.playerName}.`,
      `Recent observations: ${JSON.stringify(params.observations)}`,
      `Current proficiency: ${JSON.stringify(params.proficiency)}`,
      'Respond with JSON: { "player_name", "strengths": [], "growth_areas": [], "goals": [{ "skill", "current_level", "target_level", "action_steps": [] }], "coach_note", "recommended_drills": [{ "name", "description", "focus" }] }',
    ].join('\n'),
  }),

  parentReport: (params: PromptParams & { playerName: string; reportData: unknown }) => ({
    system: [
      buildSystemPreamble(params),
      'You generate parent-friendly progress reports.',
      'Rules:',
      '- ALWAYS lead with positives. Every player has something to celebrate.',
      '- Use encouraging, growth-mindset language.',
      '- 4th-grade reading level.',
      '- Never compare to other players.',
      '- Include 1 at-home practice suggestion.',
      '- Maximum 500 words.',
    ].join('\n'),
    user: [
      `Generate a parent report for ${params.playerName}.`,
      `Progress data: ${JSON.stringify(params.reportData)}`,
      'Respond with JSON: { "player_name", "greeting", "highlights": [], "skill_progress": [{ "skill_name", "level", "narrative" }], "encouragement", "home_activity": { "name", "description", "duration_minutes" }, "coach_note" }',
    ].join('\n'),
  }),

  reportCard: (params: PromptParams & { playerName: string; proficiency: unknown; recentObservations: unknown[] }) => ({
    system: [
      buildSystemPreamble(params),
      'You generate curriculum-aligned skill report cards.',
      'Lead with positives. Growth-mindset language. Age-appropriate.',
    ].join('\n'),
    user: [
      `Generate a report card for ${params.playerName}.`,
      `Proficiency: ${JSON.stringify(params.proficiency)}`,
      `Recent observations: ${JSON.stringify(params.recentObservations)}`,
      'Respond with JSON: { "player_name", "skills": [{ "skill_name", "proficiency_level", "narrative", "trend" }], "strengths": [], "growth_areas": [], "coach_note", "home_practice_suggestion" }',
    ].join('\n'),
  }),

  analyzePhoto: (params: PromptParams & { analysisType: string; customPrompt?: string }) => ({
    system: [
      buildSystemPreamble(params),
      `You are analyzing a ${params.analysisType} photo for coaching purposes.`,
    ].join('\n'),
    user: params.customPrompt || 'Analyze this image and provide coaching observations.',
  }),

  importRoster: () => ({
    system: 'You extract player information from roster screenshots. Return structured data with player names, jersey numbers, and positions when visible.',
    user: 'Extract all player information from this roster image. Respond with JSON: { "players": [{ "name", "jersey_number", "position" }] }',
  }),

  weeklyNewsletter: (params: PromptParams & {
    dateRange: string;
    sessionSummaries: Array<{ date: string; type: string; observationCount: number }>;
    playerSpotlights: Array<{
      name: string;
      positiveHighlights: string[];
      needsWorkAreas: string[];
    }>;
    teamPositiveCount: number;
    teamNeedsWorkCount: number;
    topStrengthCategories: string[];
    topFocusCategories: string[];
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You write warm, encouraging weekly newsletters for parents of youth athletes.',
      'Rules:',
      '- Write in a friendly, conversational tone parents will enjoy reading.',
      '- ALWAYS lead with positives — celebrate growth and effort.',
      '- Keep player spotlights focused on progress, not comparison.',
      '- Use age-appropriate, jargon-free language (4th-grade reading level).',
      '- Home challenges should be simple, fun, and doable in 5-10 minutes.',
      '- Never single out any player for negative feedback in a shared newsletter.',
      '- Maximum 600 words total.',
    ].join('\n'),
    user: [
      `Generate a weekly parent newsletter for ${params.teamName || 'the team'}.`,
      `Team: ${params.teamName || 'Team'} | Sport: ${params.sportName || 'basketball'} | Age group: ${params.ageGroup || 'youth'} | Season week: ${params.seasonWeek || 1}`,
      `Date range: ${params.dateRange}`,
      '',
      params.sessionSummaries.length > 0
        ? `Sessions this week:\n${params.sessionSummaries.map(s => `- ${s.type} on ${s.date} (${s.observationCount} coaching observations)`).join('\n')}`
        : 'No formal sessions this week.',
      '',
      `Team observations: ${params.teamPositiveCount} positive, ${params.teamNeedsWorkCount} needing work`,
      params.topStrengthCategories.length > 0
        ? `Team strengths: ${params.topStrengthCategories.join(', ')}`
        : '',
      params.topFocusCategories.length > 0
        ? `Areas we are developing: ${params.topFocusCategories.join(', ')}`
        : '',
      '',
      params.playerSpotlights.length > 0
        ? `Player spotlights (include one per player listed, positive highlights only):\n${params.playerSpotlights.map(p =>
            `- ${p.name}: positives: ${p.positiveHighlights.slice(0, 3).join('; ')}${p.needsWorkAreas.length ? ` | growth areas: ${p.needsWorkAreas.slice(0, 2).join('; ')}` : ''}`
          ).join('\n')}`
        : '',
      '',
      'Respond with JSON:',
      '{ "title": "string", "date_range": "string", "week_summary": "string (2-3 sentences)", "team_highlight": "string (1-2 sentences celebrating something the whole team did well)", "player_spotlights": [{ "player_name": "string", "highlight": "string (1-2 sentences, positive only)", "home_challenge": "string (simple at-home activity, 1 sentence)" }], "upcoming_focus": "string (what next week will focus on, 1-2 sentences)", "coaching_note": "string (warm personal note from the coach, 2-3 sentences)" }',
    ].filter(Boolean).join('\n'),
  }),

  skillChallenge: (params: PromptParams & {
    playerName: string;
    ageGroup?: string;
    growthAreas: string[];
    recentNeedsWorkObs: string[];
    weekLabel: string;
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You create personalized weekly skill challenge cards for youth athletes.',
      'Rules:',
      '- Challenges must be safe, age-appropriate, and doable at home without a coach.',
      '- Each challenge should target a specific growth area observed in recent practices.',
      '- Keep steps simple and concrete (3-5 numbered steps per challenge).',
      '- Write success criteria that are MEASURABLE (e.g., "Make 7 out of 10 free throws").',
      '- The encouragement message should feel personal and motivating.',
      '- Parent note should be warm, brief, and include safety tips if relevant.',
      '- Difficulty: match to player age and skill level.',
      '- Max 3 challenges per week — focused beats exhaustive.',
    ].join('\n'),
    user: [
      `Create a weekly skill challenge card for ${params.playerName}.`,
      `Sport: ${params.sportName || 'basketball'} | Age group: ${params.ageGroup || 'youth'} | Week: ${params.weekLabel}`,
      '',
      params.growthAreas.length > 0
        ? `Growth areas identified by coach: ${params.growthAreas.join(', ')}`
        : 'No specific growth areas on record yet.',
      params.recentNeedsWorkObs.length > 0
        ? `Recent coaching observations (needs-work):\n${params.recentNeedsWorkObs.map(o => `- ${o}`).join('\n')}`
        : '',
      '',
      'Generate 1-3 challenges. Respond with JSON:',
      '{ "player_name": "string", "week_label": "string", "challenges": [{ "title": "string", "skill_area": "string", "difficulty": "beginner|intermediate|advanced", "minutes_per_day": number, "description": "string (1 sentence)", "steps": ["string", ...], "success_criteria": "string", "encouragement": "string (1 sentence, personal to this player)" }], "parent_note": "string (2-3 sentences for parents)" }',
    ].filter(Boolean).join('\n'),
  }),
  seasonStoryline: (params: PromptParams & {
    playerName: string;
    seasonLabel: string;
    totalObservations: number;
    weeklyBreakdown: Array<{
      week: number;
      positiveCount: number;
      needsWorkCount: number;
      categories: string[];
      highlights: string[];
    }>;
    overallStrengths: string[];
    overallGrowthAreas: string[];
    firstObservationDate: string;
    latestObservationDate: string;
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You write compelling season narrative arcs for individual youth athletes.',
      'Rules:',
      '- Write like a sportswriter telling a developmental story, not a clinical report.',
      '- Every player has a story worth telling. Find the arc even if growth was slow.',
      '- Use concrete observations to ground the narrative (e.g., "In the early weeks, Marcus struggled with…").',
      '- Celebrate effort, courage, and small wins as much as skill milestones.',
      '- Growth-mindset language throughout — "exploring", "building", "unlocking".',
      '- The opening should set the scene from Week 1 — where did this player start?',
      '- Each chapter should feel like a natural story beat (Early Season / Building / Breakthrough / etc.).',
      '- coach_reflection should be a personal, heartfelt message the coach could share.',
      '- Keep the full narrative under 800 words.',
    ].join('\n'),
    user: [
      `Write a season storyline narrative for ${params.playerName}.`,
      `Sport: ${params.sportName || 'basketball'} | Team: ${params.teamName || 'the team'} | Age group: ${params.ageGroup || 'youth'} | Season: ${params.seasonLabel}`,
      `Season span: ${params.firstObservationDate} – ${params.latestObservationDate} | Total coaching observations: ${params.totalObservations}`,
      '',
      params.overallStrengths.length > 0
        ? `Observed strengths: ${params.overallStrengths.join(', ')}`
        : '',
      params.overallGrowthAreas.length > 0
        ? `Growth areas worked on: ${params.overallGrowthAreas.join(', ')}`
        : '',
      '',
      params.weeklyBreakdown.length > 0
        ? `Week-by-week coaching data:\n${params.weeklyBreakdown.map(w =>
            `  Week ${w.week}: ${w.positiveCount} positive, ${w.needsWorkCount} needs-work` +
            (w.categories.length ? ` | categories: ${w.categories.join(', ')}` : '') +
            (w.highlights.length ? `\n    Notable: ${w.highlights.slice(0, 2).join(' | ')}` : '')
          ).join('\n')}`
        : 'Limited week-by-week data available — build the narrative from what is known.',
      '',
      'Write a season storyline with narrative chapters. Respond with JSON:',
      '{ "player_name": "string", "season_label": "string", "opening": "string (2-3 sentences setting the scene from the start of season)", "chapters": [{ "phase": "string (e.g. Early Season, Building Momentum, Breakthrough, etc.)", "weeks": "string (e.g. Weeks 1-3)", "narrative": "string (3-5 sentences telling the story of this phase)", "highlights": ["string"], "growth_moments": ["string"] }], "current_strengths": ["string"], "trajectory": "string (2-3 sentences on where this player is headed)", "coach_reflection": "string (2-3 sentences — a personal, heartfelt coaching perspective)" }',
    ].filter(Boolean).join('\n'),
  }),
  drillBuilder: (params: PromptParams & {
    description: string;
    preferredCategory?: string;
    preferredAgeGroup?: string;
    preferredDuration?: number;
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You design complete, ready-to-run youth sport drills from a coach\'s description.',
      'Rules:',
      '- Drills must be safe, age-appropriate, and require no specialized equipment unless described.',
      '- Setup instructions should be concrete and easy to follow for a volunteer coach.',
      '- Coaching cues should be short, memorable phrases coaches say DURING the drill.',
      '- Include 2-3 progressions/variations so coaches can scale difficulty.',
      '- Player count should be realistic for a typical youth team (2-20).',
      '- Duration should be practical for a youth practice (5-20 minutes typical).',
      '- If the description is vague, make reasonable, sport-appropriate assumptions.',
    ].join('\n'),
    user: [
      `Design a ${params.sportName || 'basketball'} drill based on this description:`,
      `"${params.description}"`,
      '',
      params.preferredCategory ? `Preferred category: ${params.preferredCategory}` : '',
      params.preferredAgeGroup ? `Target age group: ${params.preferredAgeGroup}` : `Team age group: ${params.ageGroup || 'youth'}`,
      params.preferredDuration ? `Target duration: ${params.preferredDuration} minutes` : '',
      params.categories?.length ? `Available categories for this sport: ${params.categories.join(', ')}` : '',
      '',
      'Respond with JSON:',
      '{ "name": "string", "description": "string (2-3 sentences)", "category": "string", "age_groups": ["string"], "duration_minutes": number, "player_count_min": number, "player_count_max": number|null, "equipment": ["string"], "setup_instructions": "string (paragraph)", "teaching_cues": ["string (short phrase)", ...], "variations": [{ "title": "string", "description": "string" }, ...] }',
    ].filter(Boolean).join('\n'),
  }),
} as const;
