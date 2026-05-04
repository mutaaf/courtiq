import type { Player, CurriculumSkill, Team } from '@/types/database';

export interface ObservationInsightsParam {
  totalObs: number;
  daysOfData: number;
  topNeedsWork: Array<{ category: string; count: number }>;
  topStrengths: Array<{ category: string; count: number }>;
  trendData?: {
    declining: Array<{ category: string; recentCount: number; priorCount: number }>;
    improving: Array<{ category: string; recentCount: number; priorCount: number }>;
    persistent: string[];
    totalRecentObs: number;
    totalPriorObs: number;
  };
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
      '',
      'LONG TRANSCRIPTS (>500 words):',
      '- Process the ENTIRE transcript from start to finish. Do not skip, summarize, or truncate any section.',
      '- Group observations by player, then by topic — this prevents duplicate or scattered observations about the same player.',
      '- If timestamps or time markers are available in the transcript (e.g., "at the start", "in the second half"), include approximate timing in the observation text.',
      '- For very long transcripts, it is better to produce many detailed observations than to merge or skip sections.',
      '- Maintain chronological order of observations as they appear in the transcript.',
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

    const td = insights?.trendData;
    const hasTrends = td && (td.declining.length > 0 || td.improving.length > 0 || td.persistent.length > 0);

    const trendBlock = hasTrends && td
      ? [
          '',
          `TREND ANALYSIS — comparing last 7 days (${td.totalRecentObs} obs) vs prior 7 days (${td.totalPriorObs} obs):`,
          td.declining.length > 0
            ? `⚠ DECLINING (getting worse — HIGHEST priority for drill time):\n${td.declining
                .map((e) => e.priorCount === 0
                  ? `  - ${e.category}: new issue, ${e.recentCount} needs-work observations this week`
                  : `  - ${e.category}: ${e.priorCount} → ${e.recentCount} needs-work (↑${e.recentCount - e.priorCount} more)`)
                .join('\n')}`
            : '',
          td.persistent.length > 0
            ? `⚡ PERSISTENT ISSUES (consistently struggling — steady focus needed):\n${td.persistent
                .map((c) => `  - ${c}`)
                .join('\n')}`
            : '',
          td.improving.length > 0
            ? `✓ IMPROVING (getting better — light reinforcement only):\n${td.improving
                .map((e) => e.recentCount === 0
                  ? `  - ${e.category}: resolved this week (was ${e.priorCount} needs-work)`
                  : `  - ${e.category}: ${e.priorCount} → ${e.recentCount} needs-work (↓${e.priorCount - e.recentCount} fewer)`)
                .join('\n')}`
            : '',
          '',
          'DRILL TIME ALLOCATION RULE: Spend the most time on DECLINING areas, then PERSISTENT areas. IMPROVING areas only need a brief review drill.',
        ]
        .filter(Boolean)
        .join('\n')
      : '';

    const insightsBlock = hasInsights
      ? [
          '',
          `REAL TEAM PERFORMANCE DATA (last ${insights.daysOfData} days, ${insights.totalObs} observations):`,
          trendBlock || (insights.topNeedsWork.length > 0
            ? `Areas most needing improvement:\n${insights.topNeedsWork
                .map((c) => `  - ${c.category}: ${c.count} needs-work observation${c.count !== 1 ? 's' : ''}`)
                .join('\n')}`
            : ''),
          insights.topStrengths.length > 0
            ? `Team strengths to reinforce:\n${insights.topStrengths
                .map((c) => `  - ${c.category}: ${c.count} positive observation${c.count !== 1 ? 's' : ''}`)
                .join('\n')}`
            : '',
          '',
          'IMPORTANT: Use this real performance data to make this plan highly specific to this team.',
          !hasTrends && insights.topNeedsWork.length > 0
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

  gamedaySheet: (params: PromptParams & {
    opponent?: string;
    gameNotes?: string;
    opponentStrengths?: string[];
    opponentWeaknesses?: string[];
    keyOpponentPlayers?: string[];
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You generate comprehensive game day preparation sheets for youth coaches.',
      'Use specific scouting information to create actionable, opponent-specific strategies.',
      'Keep strategies accessible for volunteer coaches, not just elite-level staff.',
      'Always lead with positivity — build team confidence while preparing smart.',
    ].join('\n'),
    user: [
      `Generate a complete game day prep sheet for ${params.teamName || 'the team'}.`,
      params.opponent ? `Opponent: ${params.opponent}` : 'Opponent: TBD',
      params.opponentStrengths?.length
        ? `Opponent Strengths (what they do well): ${params.opponentStrengths.join('; ')}`
        : '',
      params.opponentWeaknesses?.length
        ? `Opponent Weaknesses (areas to exploit): ${params.opponentWeaknesses.join('; ')}`
        : '',
      params.keyOpponentPlayers?.length
        ? `Key Opponent Players to Watch: ${params.keyOpponentPlayers.join('; ')}`
        : '',
      params.gameNotes ? `Additional Notes: ${params.gameNotes}` : '',
      params.roster?.length
        ? `\nOur Roster (${params.roster.length} players): ${params.roster
            .map((p) => `${p.name} #${p.jersey_number || '?'} (${p.position})`)
            .join(', ')}`
        : '',
      '',
      'Create a comprehensive prep sheet with:',
      '1. An energizing pregame_message for the team (2-3 sentences, confidence-building)',
      '2. scouting_report with opponent_strengths, opponent_weaknesses, and key_players_to_watch (each with name, threat_level: high/medium/low, defensive_assignment, notes)',
      '3. game_plan with offensive_focus (3-5 items), defensive_focus (3-5 items), key_matchups, and set_plays (name, description, use_when)',
      '4. lineup suggestions (player_name, position, focus_areas)',
      '5. substitution_plan (rotation strategy as a string)',
      '6. halftime_adjustments (3-4 items to consider based on opponent)',
      '7. coaching_reminders (4-6 quick sideline reminders)',
      '',
      'Respond with JSON:',
      '{ "title", "opponent", "pregame_message", "scouting_report": { "opponent_strengths": [], "opponent_weaknesses": [], "key_players_to_watch": [{ "name", "threat_level", "defensive_assignment", "notes" }] }, "game_plan": { "offensive_focus": [], "defensive_focus": [], "key_matchups": [], "set_plays": [{ "name", "description", "use_when" }] }, "lineup": [{ "player_name", "position", "focus_areas": [] }], "substitution_plan", "halftime_adjustments": [], "coaching_reminders": [] }',
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
    system: [
      'You extract player information from roster images with high accuracy.',
      '',
      'You handle many roster formats:',
      '- Screenshots from team management apps (TeamSnap, GameChanger, SportsEngine, etc.)',
      '- Photos of printed paper rosters or sign-up sheets',
      '- Whiteboard photos with handwritten names',
      '- Screenshots of spreadsheets or documents',
      '- Team website roster pages',
      '',
      'Extraction rules:',
      '- Look carefully for: full player names, jersey/uniform numbers, positions, and any role designations.',
      '- Jersey numbers may appear as "#12", "No. 12", or just "12" next to a name.',
      '- Positions may be abbreviated (PG, SG, SF, PF, C, GK, DEF, MID, FWD, P, 1B, SS, etc.).',
      '- If a name is partially obscured or blurry, extract what you can and set confidence to "low".',
      '- If a jersey number is not visible for a player, set jersey_number to null.',
      '- If position is not visible, set position to null.',
      '- Assign a confidence score to each player: "high" (clearly readable), "medium" (somewhat legible), "low" (guessing from partial/blurry data).',
      '- Include ALL players you can detect, even with low confidence.',
      '- If the image is not a roster or contains no player information, return an empty players array with a notes field explaining what you see.',
    ].join('\n'),
    user: [
      'Extract all player information from this roster image.',
      'Look for jersey numbers, player names, and positions.',
      'Respond with JSON:',
      '{ "players": [{ "name": "string", "jersey_number": number|null, "position": "string|null", "confidence": "high|medium|low" }], "notes": "string (optional, any issues with the image)" }',
    ].join('\n'),
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
  gameRecap: (params: PromptParams & {
    sessionDate: string;
    sessionType: string;
    opponent?: string | null;
    result?: string | null;
    observations: Array<{ playerName: string; text: string; sentiment: string; category: string }>;
    teamObservations: string[];
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You write engaging, celebratory game recap narratives for youth sports teams.',
      '',
      'Rules:',
      '- Write in an uplifting, age-appropriate sports-journalist tone.',
      '- Highlight individual players by name — use the observations to find standout moments.',
      '- Be factual and specific — draw directly from the observations provided.',
      '- Include a motivating coach message appropriate for youth athletes.',
      '- Keep each field concise: intro ≤ 3 sentences, key moment descriptions ≤ 2 sentences.',
      '- result_headline should be a short punchy phrase (4-8 words), not a sentence.',
      '- If result is W/Win, use celebratory language. If L/Loss, be encouraging and growth-minded. If T/Tie, acknowledge the fight.',
      '- Always end with a forward-looking statement to build excitement for next session.',
    ].join('\n'),
    user: [
      `Session: ${params.sessionType} on ${params.sessionDate}`,
      params.opponent ? `Opponent: ${params.opponent}` : '',
      params.result ? `Result: ${params.result}` : '',
      `Team: ${params.teamName || 'the team'} (${params.ageGroup || 'youth'})`,
      '',
      'Player observations from this session:',
      params.observations.length > 0
        ? params.observations.map((o) => `- ${o.playerName}: [${o.sentiment}] ${o.text}`).join('\n')
        : '(No individual observations recorded)',
      params.teamObservations.length > 0
        ? '\nTeam observations:\n' + params.teamObservations.map((t) => `- ${t}`).join('\n')
        : '',
      '',
      'Respond with JSON:',
      '{ "title": "string", "result_headline": "string", "intro": "string", "key_moments": [{ "headline": "string", "description": "string", "player_name": "string?" }], "player_highlights": [{ "player_name": "string", "highlight": "string", "stat_line": "string?" }], "team_performance": { "offensive_note": "string", "defensive_note": "string", "effort_note": "string" }, "coach_message": "string", "looking_ahead": "string" }',
    ].filter(Boolean).join('\n'),
  }),
  snapObservation: (params: PromptParams & { customFocus?: string }) => ({
    system: [
      buildSystemPreamble(params),
      'You analyze practice/game photos and generate specific, actionable coaching observations.',
      '',
      'Rules:',
      '- Each observation must be about ONE player and ONE specific coaching point.',
      '- Focus on: body positioning, footwork, hand placement, defensive stance, spacing, communication, effort.',
      `- Categories: ${(params.categories || ['Offense', 'Defense', 'IQ', 'Effort', 'Coachability']).join(', ')}`,
      '- Sentiment: positive (good technique/effort), needs-work (improvement opportunity), or neutral (factual observation).',
      '- Match player names to the roster — use jersey numbers in the photo if visible.',
      '- If you cannot identify a specific player, use "Unknown Player" as the player_name.',
      '- Team-level observations (spacing, communication, formation) go in team_observations.',
      '- Be specific and descriptive — "wide defensive stance, arms active" not just "good defense".',
      '- Generate 2-6 observations total. Quality over quantity.',
      '- If the photo is blurry, unclear, or not a sports photo, return empty arrays with a note in image_description.',
    ].join('\n'),
    user: [
      'Roster (match jersey numbers or visible names to these players):',
      (params.roster || []).map((p) => {
        let line = `- ${p.name}`;
        if (p.nickname) line += ` ("${p.nickname}")`;
        line += ` #${p.jersey_number || '?'} ${p.position}`;
        return line;
      }).join('\n'),
      params.skills ? '\nCurriculum Skills:\n' + params.skills.map((s) => `- ${s.skill_id}: ${s.name} (${s.category})`).join('\n') : '',
      params.customFocus ? `\nCoach's focus for this photo: ${params.customFocus}` : '',
      '',
      'Analyze this practice photo and generate coaching observations.',
      'Respond with JSON:',
      '{ "image_description": "brief description of what you see", "observations": [{ "player_name", "category", "sentiment", "text", "skill_id" }], "team_observations": [{ "category", "sentiment", "text" }] }',
    ].filter(Boolean).join('\n'),
  }),
  playerWeeklyStar: (params: PromptParams & {
    playerName: string;
    weekLabel: string;
    positiveObservations: Array<{ category: string; text: string }>;
    totalObsCount: number;
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You write a celebratory "Player of the Week" spotlight for the coach to share.',
      '',
      'Rules:',
      '- Tone is warm, enthusiastic, and age-appropriate — celebrate genuine growth.',
      '- Base everything on the observations provided. Do not invent skills not mentioned.',
      '- Keep language positive and growth-mindset oriented.',
      '- The achievement (2–3 sentences) should highlight what made this week special.',
      '- The growth_moment should quote or paraphrase a specific observation from the list.',
      '- The challenge_ahead is encouraging — one area to keep building, framed positively.',
      '- The coach_shoutout is a short, personal-sounding one-liner like "Marcus brings it every single rep."',
    ].join('\n'),
    user: [
      `Team: ${params.teamName} (${params.sportName}, ${params.ageGroup})`,
      `Week of: ${params.weekLabel}`,
      `Player: ${params.playerName}`,
      `Total observations this week: ${params.totalObsCount}`,
      '',
      `Positive observations that earned the spotlight:`,
      params.positiveObservations.map((o) => `- [${o.category}] ${o.text}`).join('\n'),
      '',
      'Write the Weekly Star spotlight as JSON:',
      '{ "player_name": "string", "week_label": "string", "headline": "string (catchy 5-8 word phrase, no player name)", "achievement": "string (2-3 sentences, warm and specific)", "growth_moment": "string (1-2 sentences quoting or paraphrasing a specific observation)", "challenge_ahead": "string (1-2 sentences, encouraging, growth-mindset framing)", "coach_shoutout": "string (1 sentence, personal kudos)" }',
    ].filter(Boolean).join('\n'),
  }),

  seasonSummary: (params: PromptParams & {
    seasonPeriod: string;
    totalObservations: number;
    totalSessions: number;
    totalPlayers: number;
    weeksOfData: number;
    healthScore: number;
    topCategories: string[];
    sessionBreakdown: Record<string, number>;
    playerObservationCounts: Array<{ name: string; count: number; positiveRatio: number }>;
    categoryBreakdown: Array<{ category: string; positive: number; needsWork: number; total: number }>;
    sampleObservations: Array<{ playerName: string; category: string; sentiment: string; text: string }>;
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You write comprehensive, honest, and uplifting season summary reports for youth sports teams.',
      '',
      'Rules:',
      '- Draw directly from the provided observation data — be specific, not generic.',
      '- Acknowledge both strengths AND areas for growth with a growth-mindset framing.',
      '- Name players by name in player_breakthroughs — make it personal.',
      '- coaching_insights should reflect patterns the DATA reveals (e.g. "The team received far more offense observations than defense").',
      '- next_season_priorities should follow logically from team_challenges.',
      '- Keep each field concise: overall_assessment ≤ 3 sentences, highlight descriptions ≤ 2 sentences.',
      '- Status values: "strength" = top performing skill, "most_improved" = biggest growth area, "consistent" = reliable, "needs_work" = recurring challenge.',
      '- closing_message should be warm and forward-looking — not a cliché.',
    ].join('\n'),
    user: [
      `Team: ${params.teamName || 'the team'} (${params.ageGroup || 'youth'} ${params.sportName || 'basketball'})`,
      `Season period: ${params.seasonPeriod}`,
      `Stats: ${params.totalObservations} observations · ${params.totalSessions} sessions · ${params.totalPlayers} players · ${params.weeksOfData} weeks`,
      `Overall health score: ${params.healthScore}% positive`,
      '',
      'Session breakdown:',
      Object.entries(params.sessionBreakdown).map(([type, count]) => `- ${type}: ${count}`).join('\n') || '(none)',
      '',
      'Top observed categories: ' + (params.topCategories.join(', ') || 'none'),
      '',
      'Category performance breakdown:',
      params.categoryBreakdown.map((c) =>
        `- ${c.category}: ${c.total} obs (${c.positive} positive, ${c.needsWork} needs-work)`
      ).join('\n') || '(none)',
      '',
      'Player engagement (most observed first):',
      params.playerObservationCounts.slice(0, 10).map((p) =>
        `- ${p.name}: ${p.count} obs, ${Math.round(p.positiveRatio * 100)}% positive`
      ).join('\n') || '(none)',
      '',
      'Sample observations (representative moments from the season):',
      params.sampleObservations.slice(0, 20).map((o) =>
        `- ${o.playerName}: [${o.sentiment}/${o.category}] ${o.text}`
      ).join('\n') || '(none)',
      '',
      'Write the season summary as JSON:',
      '{ "headline": "string (5-10 word inspiring title)", "season_period": "string (copy from input)", "overall_assessment": "string (2-3 sentences)", "team_highlights": [{ "title": "string", "description": "string" }], "skill_progress": [{ "skill": "string", "status": "strength|most_improved|consistent|needs_work", "description": "string (1 sentence)" }], "player_breakthroughs": [{ "player_name": "string", "achievement": "string (1 sentence)" }], "team_challenges": ["string"], "coaching_insights": "string (2-3 sentences)", "next_season_priorities": ["string"], "closing_message": "string (1-2 sentences)" }',
    ].filter(Boolean).join('\n'),
  }),

  seasonAwards: (params: PromptParams & {
    seasonLabel: string;
    totalPlayers: number;
    totalObservations: number;
    players: Array<{
      name: string;
      totalObs: number;
      positiveObs: number;
      needsWorkObs: number;
      positiveRatio: number;
      topCategory: string;
      bestObservation: string;
    }>;
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You create personalized, celebratory end-of-season award titles for youth sports players.',
      '',
      'Rules:',
      '- Every player listed must receive exactly ONE award — no player should be skipped or doubled.',
      '- Every award_title must be UNIQUE across the entire team — absolutely no duplicate award names.',
      '- Award titles should be specific to the player\'s actual data, not generic (e.g. "Defensive Anchor Award" not "Good Player Award").',
      '- Base the award on the player\'s strongest observed quality — positive ratio, top category, or most memorable observation.',
      '- For players with mostly needs-work observations, find something genuine to celebrate (growth, effort, specific moment).',
      '- description should be 2 warm sentences explaining why this player earned this award.',
      '- standout_moment should paraphrase or quote the player\'s best observation naturally.',
      '- Tone: celebratory, age-appropriate, parent-friendly. Make every player feel seen.',
      '- Use one of these emojis per award (vary them — no repeats): 🏆 🛡️ ⚡ 🎯 🧠 💪 🤝 ⭐ 🎖️ 🔥 🌱 🎪 🏅 🌟 🦁 🎶 🎨 🐐 🚀 💡 🌊 🏋️ 🎭 🦊 🐺',
      '- ceremony_intro should be warm and reference the season and number of players.',
      '- team_message should be a short, motivational close for the whole group.',
    ].join('\n'),
    user: [
      `Team: ${params.teamName || 'the team'} (${params.ageGroup || 'youth'} ${params.sportName || 'basketball'})`,
      `Season: ${params.seasonLabel}`,
      `${params.totalPlayers} players · ${params.totalObservations} observations`,
      '',
      'Player data (generate one award for EACH player listed):',
      params.players.map((p) =>
        [
          `Player: ${p.name}`,
          `  Observations: ${p.totalObs} (${p.positiveObs} positive, ${p.needsWorkObs} needs-work)`,
          `  Positive ratio: ${Math.round(p.positiveRatio * 100)}%`,
          `  Top category: ${p.topCategory}`,
          `  Best observation: "${p.bestObservation}"`,
        ].join('\n')
      ).join('\n\n'),
      '',
      'Write the season awards ceremony as JSON:',
      '{ "season_label": "string", "ceremony_intro": "string (2-3 warm sentences)", "awards": [{ "player_name": "string (exact name from data)", "award_title": "string (unique, specific, ends with Award)", "emoji": "string (single emoji)", "description": "string (2 sentences)", "standout_moment": "string (1 sentence, specific moment)" }], "team_message": "string (1-2 sentences)" }',
    ].filter(Boolean).join('\n'),
  }),

  coachReflection: (params: PromptParams & {
    sessionDate: string;
    sessionType: string;
    totalObservations: number;
    positiveCount: number;
    needsWorkCount: number;
    observedPlayerCount: number;
    totalPlayers: number;
    underobservedPlayers: string[];
    topCategories: Array<{ category: string; count: number; dominant: string }>;
    standoutMoments: Array<{ playerName: string; category: string; sentiment: string; text: string }>;
    priorSessionHealthScore: number | null;
    activeGoalCount: number;
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You generate personalized post-session reflection prompts to help coaches grow their coaching practice.',
      '',
      'Rules:',
      '- Each question must be rooted in the actual session data provided — never ask generic questions.',
      '- Reference specific players, categories, or statistics from the session when possible.',
      '- Vary question categories across player_development, team_dynamics, coaching_approach, and session_design.',
      '- Questions should be open-ended and thought-provoking, not yes/no.',
      '- The context field explains WHY this question is relevant (cite the data).',
      '- Keep questions concise (1 sentence), context concise (1 sentence).',
      '- session_summary is a factual 2-sentence overview of what the data shows.',
      '- growth_focus is one actionable coaching priority for the next session.',
      '- Generate exactly 4 questions covering a mix of categories.',
    ].join('\n'),
    user: [
      `Team: ${params.teamName || 'your team'} (${params.ageGroup || 'youth'} ${params.sportName || 'basketball'})`,
      `Session: ${params.sessionType} on ${params.sessionDate}`,
      `Observations recorded: ${params.totalObservations} (${params.positiveCount} positive, ${params.needsWorkCount} needs-work)`,
      `Players observed: ${params.observedPlayerCount} of ${params.totalPlayers}`,
      params.underobservedPlayers.length
        ? `Players with NO observations today: ${params.underobservedPlayers.join(', ')}`
        : 'All players received at least one observation today.',
      '',
      'Top observed skill categories:',
      params.topCategories.map((c) => `- ${c.category}: ${c.count} obs (mostly ${c.dominant})`).join('\n') || '(none)',
      '',
      'Standout moments from the session:',
      params.standoutMoments.slice(0, 8).map((m) =>
        `- ${m.playerName}: [${m.sentiment}/${m.category}] "${m.text}"`
      ).join('\n') || '(none)',
      params.priorSessionHealthScore !== null
        ? `\nPrior session health score: ${params.priorSessionHealthScore}% (compare to today's ${Math.round((params.positiveCount / Math.max(params.totalObservations, 1)) * 100)}%)`
        : '',
      params.activeGoalCount > 0
        ? `Active player development goals: ${params.activeGoalCount}`
        : '',
      '',
      'Generate the coach reflection as JSON:',
      '{ "session_summary": "string (2 sentences, factual)", "questions": [{ "id": "q1", "question": "string", "context": "string", "category": "player_development|team_dynamics|coaching_approach|session_design" }, ...], "growth_focus": "string (1 actionable sentence)" }',
    ].filter(Boolean).join('\n'),
  }),

  playerSessionMessages: (params: PromptParams & {
    sessionLabel: string;
    sessionType: string;
    playerObservations: Array<{
      playerName: string;
      observations: Array<{ text: string; sentiment: string; category: string }>;
    }>;
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You write warm, encouraging post-session message snippets that coaches can send directly to players or their parents via text or WhatsApp.',
      '',
      'Rules:',
      '- Each message must be 2–3 friendly, conversational sentences — no formal language.',
      '- Reference at least one specific thing you observed about that player today.',
      '- Balance encouragement (lead with the positive) with one practical growth tip.',
      '- Keep language simple, warm, and parent-friendly — avoid jargon.',
      '- highlight is a single short phrase (e.g. "Great hustle on defense") — not a full sentence.',
      '- next_focus is one actionable tip for the player to practise (e.g. "Work on holding your follow-through on jump shots").',
      '- team_note is 1–2 sentences about the team overall for the coach\'s personal use.',
      '- Generate one message per player listed — do not skip any player.',
    ].join('\n'),
    user: [
      `Session: ${params.sessionLabel} (${params.sessionType})`,
      `Team: ${params.teamName || 'your team'} · ${params.ageGroup || 'youth'} ${params.sportName || 'basketball'}`,
      '',
      'Players and their observations from this session:',
      params.playerObservations.map((p) =>
        [
          `${p.playerName}:`,
          p.observations.map((o) => `  - [${o.sentiment}] ${o.category}: "${o.text}"`).join('\n'),
        ].join('\n')
      ).join('\n\n'),
      '',
      'Generate one message per player as JSON:',
      '{ "session_label": "string", "messages": [{ "player_name": "string", "message": "2-3 sentence text", "highlight": "short phrase", "next_focus": "one tip" }, ...], "team_note": "1-2 sentences" }',
    ].filter(Boolean).join('\n'),
  }),
  teamGroupMessage: (params: PromptParams & {
    sessionLabel: string;
    sessionType: string;
    observationSummary: {
      totalObs: number;
      positiveCount: number;
      needsWorkCount: number;
      topCategories: string[];
      teamHighlightObs?: string;
    };
    coachName?: string;
    teamName?: string;
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You write warm, brief parent group-chat messages that volunteer coaches paste into their team WhatsApp/SMS group after a session.',
      '',
      'Rules:',
      '- message: 2–4 sentences, conversational, positive but honest. Mention what the team worked on and one thing to celebrate.',
      '- No individual player callouts — this is a team-wide message.',
      '- team_highlight: one specific team moment or achievement (e.g. "The whole team stayed focused during the defensive drill").',
      '- coaching_focus: 2–3 skill areas actually practiced (from observations).',
      '- encouragement: one warm closing sentence motivating parents and kids for next session.',
      '- next_session_note (optional): only include if there is something notable coming up. Otherwise omit.',
      '- Keep the tone inclusive, brief, and emoji-free (parents can add their own).',
      '- Avoid coaching jargon — write as if speaking to a parent who has never played the sport.',
    ].join('\n'),
    user: [
      `Session: ${params.sessionLabel} (${params.sessionType})`,
      `Team: ${params.teamName || 'your team'} · ${params.ageGroup || 'youth'} ${params.sportName || 'basketball'}`,
      `Coach: ${params.coachName || 'Coach'}`,
      '',
      'Session observation summary:',
      `- Total observations: ${params.observationSummary.totalObs}`,
      `- Positive: ${params.observationSummary.positiveCount}, Needs work: ${params.observationSummary.needsWorkCount}`,
      `- Top skill areas covered: ${params.observationSummary.topCategories.join(', ') || 'general coaching'}`,
      params.observationSummary.teamHighlightObs
        ? `- Standout team moment: "${params.observationSummary.teamHighlightObs}"`
        : '',
      '',
      'Generate a team group-chat message as JSON:',
      '{ "message": "2-4 sentence team-wide text", "session_label": "string", "team_highlight": "string", "coaching_focus": ["skill1", "skill2"], "encouragement": "closing sentence", "next_session_note": "optional string" }',
    ].filter(Boolean).join('\n'),
  }),
  huddleScript: (params: PromptParams & {
    sessionLabel: string;
    sessionType: string;
    observationSummary: {
      totalObs: number;
      positive: number;
      needsWork: number;
      topStrengths: string[];
      topChallenges: string[];
    };
    playerSpotlight?: { name: string; achievement: string } | null;
    coachName?: string;
    teamName?: string;
    nextSessionHint?: string;
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You write short, energising end-of-practice team huddle scripts for volunteer coaches to read aloud to their players (ages 6–18).',
      '',
      'Rules:',
      '- huddle_script: the full script the coach reads aloud — 4–6 sentences. Structure: (1) team shoutout, (2) player spotlight callout, (3) team challenge for the week, (4) next session reminder (if provided), (5) team chant closer ("On three — 1, 2, 3, GO TEAM!").',
      '- player_spotlight.name: use the provided player name. player_spotlight.achievement: one specific thing they did today.',
      '- team_shoutout: one thing the WHOLE team did well (not about one player).',
      '- team_challenge: one simple, concrete skill to practise before next session (e.g. "dribble with your weak hand for 5 minutes a day"). Phrased as a fun challenge, not a homework assignment.',
      '- next_session_hint (optional): only include when provided. Otherwise omit.',
      '- Tone: warm, celebratory, age-appropriate. No jargon. Mention player by first name only.',
      '- Keep the total script under 80 words so it takes 30 seconds to read.',
    ].join('\n'),
    user: [
      `Session: ${params.sessionLabel} (${params.sessionType})`,
      `Team: ${params.teamName || 'your team'} · ${params.ageGroup || 'youth'} ${params.sportName || 'basketball'}`,
      `Coach: ${params.coachName || 'Coach'}`,
      '',
      'Session summary:',
      `- ${params.observationSummary.totalObs} observations total (${params.observationSummary.positive} positive, ${params.observationSummary.needsWork} needs-work)`,
      `- Team strengths today: ${params.observationSummary.topStrengths.join(', ') || 'general effort'}`,
      `- Areas to improve: ${params.observationSummary.topChallenges.join(', ') || 'keep working hard'}`,
      params.playerSpotlight
        ? `- Player to spotlight: ${params.playerSpotlight.name} (achievement: ${params.playerSpotlight.achievement})`
        : '- No specific player to spotlight — pick a positive team moment instead',
      params.nextSessionHint
        ? `- Next session: ${params.nextSessionHint}`
        : '',
      '',
      'Generate huddle script JSON:',
      '{ "huddle_script": "full 4-6 sentence script under 80 words", "player_spotlight": { "name": "FirstName", "achievement": "specific achievement" }, "team_shoutout": "what the whole team did well", "team_challenge": "one skill to practise", "next_session_hint": "optional" }',
    ].filter(Boolean).join('\n'),
  }),

  teamPersonality: (params: PromptParams & {
    totalObservations: number;
    totalSessions: number;
    totalPlayers: number;
    healthScore: number;
    categoryBreakdown: Array<{ category: string; positive: number; needsWork: number; total: number }>;
    topStrengths: string[];
    topChallenges: string[];
    sessionQualityAvg: number | null;
    effortObsRatio: number;
    teamworkObsRatio: number;
    coachingPatternLabel: string;
    sampleObservations: Array<{ playerName: string; category: string; sentiment: string; text: string }>;
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You write creative, accurate, and uplifting team personality profiles for youth sports teams.',
      '',
      'Rules:',
      '- team_type: 3–5 words, always starts with "The" (e.g. "The Grinders", "The Playmakers", "The Defenders"). Make it specific to THIS team\'s data, not generic.',
      '- type_emoji: single emoji that captures the personality best.',
      '- tagline: punchy one-liner that would make coaches smile and want to share it.',
      '- description: 2–3 sentences drawing directly from the observation data — be specific about what makes this team unique.',
      '- traits: 3–5 key traits. Score 0–100 reflects the data (e.g. 85+ = defining characteristic, 40–60 = developing, <40 = challenge area). Every trait description must reference something specific from the data.',
      '- strengths: 1–3 things this team genuinely does well (from observations).',
      '- growth_areas: 1–3 honest areas for improvement (frame positively, not negatively).',
      '- coaching_tips: 2–4 specific coaching strategies that work for THIS team type (actionable, not generic advice).',
      '- team_motto: a short phrase (3–8 words) the team could adopt as their identity. Should feel earned, not cheesy.',
      '- Tone: warm, celebratory, data-grounded. This will be shown to coaches AND players.',
    ].join('\n'),
    user: [
      `Team: ${params.teamName || 'the team'} (${params.ageGroup || 'youth'} ${params.sportName || 'basketball'})`,
      `Coach: ${params.coachName || 'Coach'}`,
      `Season stats: ${params.totalObservations} observations · ${params.totalSessions} sessions · ${params.totalPlayers} players`,
      `Overall health score: ${params.healthScore}% positive observations`,
      params.sessionQualityAvg ? `Average session quality rating: ${params.sessionQualityAvg.toFixed(1)}/5` : '',
      '',
      'Observation breakdown by skill category:',
      params.categoryBreakdown.map((c) =>
        `- ${c.category}: ${c.total} obs (${c.positive} positive, ${c.needsWork} needs-work)`
      ).join('\n') || '(none)',
      '',
      `Top strengths from data: ${params.topStrengths.join(', ') || 'none identified'}`,
      `Top challenges from data: ${params.topChallenges.join(', ') || 'none identified'}`,
      `Effort/hustle observation ratio: ${Math.round(params.effortObsRatio * 100)}% of total obs`,
      `Teamwork observation ratio: ${Math.round(params.teamworkObsRatio * 100)}% of total obs`,
      `Coach observation pattern: ${params.coachingPatternLabel}`,
      '',
      'Sample observations (representative moments):',
      params.sampleObservations.slice(0, 15).map((o) =>
        `- ${o.playerName}: [${o.sentiment}/${o.category}] ${o.text}`
      ).join('\n') || '(none)',
      '',
      'Generate team personality JSON:',
      '{ "team_type": "The [Name]", "type_emoji": "emoji", "tagline": "punchy one-liner", "description": "2-3 sentences", "traits": [{ "name": "Trait Name", "score": 0-100, "description": "1 sentence from data" }], "strengths": ["string"], "growth_areas": ["string"], "coaching_tips": ["actionable tip"], "team_motto": "short motto" }',
    ].filter(Boolean).join('\n'),
  }),

  practiceArc: (params: PromptParams & {
    numSessions: number;
    sessionDurationMinutes: number;
    upcomingEvent?: string;
    focusArea?: string;
    topNeedsWork: string[];
    topStrengths: string[];
    totalObs: number;
    recentSessions: number;
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You create multi-session practice arcs for volunteer coaches — coherent 2–3 session progressions where each practice builds on the last.',
      '',
      'Rules:',
      '- arc_title: short and descriptive (e.g. "Defense & Passing — 3-Practice Arc").',
      '- arc_goal: one sentence explaining what the team will achieve across the full arc.',
      '- primary_focus: 1–3 skill categories that are the central theme across all sessions.',
      '- sessions: generate exactly ' + params.numSessions + ' sessions, each with increasing complexity.',
      '- session themes must show clear progression: Session 1 = fundamentals/introduce, Session 2 = combine/develop' + (params.numSessions === 3 ? ', Session 3 = apply/game-speed' : '') + '.',
      '- Each drill: name, duration_minutes, description (2 sentences max), 2–3 coaching_cues (short actionable phrases), optional progression_note linking to prior session.',
      '- carries_forward: one sentence on what skill/concept carries into the next session (omit on last session).',
      '- key_coaching_point: the ONE coaching phrase the coach says to the team during that practice.',
      '- progression_note (arc level): 2–3 sentences explaining how sessions connect and build.',
      `- game_day_tip: ${params.upcomingEvent ? 'one practical tip for ' + params.upcomingEvent : 'omit this field (no upcoming event)'}`,
      '- Each session total drill time (warmup + drills + cooldown) must equal session_duration_minutes.',
      '- Tone: clear, actionable, volunteer-coach-friendly. No jargon. Each drill must be runnable by one coach with a full team.',
    ].join('\n'),
    user: [
      `Team: ${params.teamName || 'Team'} · ${params.ageGroup || 'youth'} ${params.sportName || 'basketball'}`,
      `Players: ${params.playerCount || 'unknown'}`,
      `Arc length: ${params.numSessions} practices`,
      `Each practice: ${params.sessionDurationMinutes} minutes`,
      params.upcomingEvent ? `Upcoming event: ${params.upcomingEvent}` : '',
      params.focusArea ? `Requested focus: ${params.focusArea}` : '',
      '',
      `Team skill data (${params.totalObs} total observations, ${params.recentSessions} recent sessions):`,
      `- Top needs-work areas: ${params.topNeedsWork.join(', ') || 'general fundamentals'}`,
      `- Current strengths: ${params.topStrengths.join(', ') || 'effort and teamwork'}`,
      '',
      `Skill categories available: ${params.categories?.join(', ') || 'shooting, defense, passing, dribbling, footwork, teamwork'}`,
      '',
      `Generate a ${params.numSessions}-session practice arc JSON:`,
      `{ "arc_title": "string", "arc_goal": "string", "primary_focus": ["skill1"], "total_sessions": ${params.numSessions}, "sessions": [{ "session_number": 1, "title": "string", "theme": "string", "duration_minutes": ${params.sessionDurationMinutes}, "session_goal": "string", "warmup": { "name": "string", "duration_minutes": 5, "description": "string" }, "drills": [{ "name": "string", "duration_minutes": 10, "description": "string", "coaching_cues": ["string"], "progression_note": "string" }], "cooldown": { "duration_minutes": 5, "notes": "string" }, "key_coaching_point": "string", "carries_forward": "string" }], "progression_note": "string", "game_day_tip": "string" }`,
    ].filter(Boolean).join('\n'),
  }),

  playerOfMatch: (params: PromptParams & {
    playerName: string;
    sessionLabel: string;
    positiveObservations: Array<{ category: string; text: string }>;
    allObsCount: number;
    positiveCount: number;
    topCategories: string[];
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You write a celebratory "Player of the Match" spotlight for the coach to share with parents immediately after a game.',
      '',
      'Rules:',
      '- Tone is immediate, enthusiastic, warm — like a post-game shoutout in the team WhatsApp group.',
      '- Base everything on the observations provided. Do not invent skills not mentioned.',
      '- The headline is 5–8 words max, catchy, no player name (it will be added separately).',
      '- The achievement (2–3 sentences) describes exactly what made this game special.',
      '- The key_moment must quote or directly paraphrase ONE specific observation from the list.',
      '- The coach_message is a single warm sentence the coach would actually say to this player.',
      '- Use age-appropriate, encouraging language suitable for youth sports.',
    ].join('\n'),
    user: [
      `Team: ${params.teamName} (${params.sportName}, ${params.ageGroup})`,
      `Session: ${params.sessionLabel}`,
      `Player: ${params.playerName}`,
      `Total observations this game: ${params.allObsCount} (${params.positiveCount} positive)`,
      `Top skill areas: ${params.topCategories.join(', ')}`,
      '',
      'Observations that earned the spotlight:',
      params.positiveObservations.map((o) => `- [${o.category}] ${o.text}`).join('\n'),
      '',
      'Write the Player of the Match card as JSON:',
      '{ "player_name": "string", "session_label": "string (copy from Session above)", "headline": "string (5-8 words, no player name)", "achievement": "string (2-3 sentences, warm and specific)", "key_moment": "string (1-2 sentences, directly quoting one observation)", "coach_message": "string (1 sentence, personal and warm)" }',
    ].filter(Boolean).join('\n'),
  }),

  teamTalk: (params: PromptParams & {
    sessionType: string;
    sessionLabel: string;
    opponent?: string;
    topStrengths: string[];
    topChallenges: string[];
    weeklyFocusLabel?: string;
    recentSessionCount: number;
  }) => ({
    system: [
      buildSystemPreamble(params),
      'You write short, energising opening team talks for volunteer coaches to read aloud at the START of a practice or game (before any play begins).',
      '',
      'Rules:',
      '- team_talk: the full script the coach reads aloud — 3–4 short sentences. Structure: (1) attention-grabber, (2) 1–2 concrete focus points tied to today\'s session type and team data, (3) motivational close. Keep it under 70 words so it takes 20 seconds to read.',
      '- focus_words: 2–3 single-word themes (e.g. "Defense", "Communication", "Hustle") that visually reinforce the talk. Derive them from the focus points.',
      '- energy_level: "high" for games/tournaments (competitive urgency), "focused" for practices where technique matters, "calm" for first sessions or training (relaxed, patient).',
      '- chant: a short team chant the coach leads at the end (e.g. "1-2-3 ROCKETS!"). Use the team name.',
      '- Tone: warm, direct, age-appropriate (6–18). No clichés. One clear message the players will remember.',
      '- For games: mention the opponent if provided. Channel competitive energy.',
      '- For practices: ground in a specific skill or theme (not generic "work hard").',
    ].join('\n'),
    user: [
      `Session: ${params.sessionLabel} (${params.sessionType})`,
      `Team: ${params.teamName || 'your team'} · ${params.ageGroup || 'youth'} ${params.sportName || 'basketball'}`,
      params.opponent ? `Opponent today: ${params.opponent}` : '',
      params.weeklyFocusLabel ? `Weekly focus theme: ${params.weeklyFocusLabel}` : '',
      '',
      `Recent team data (${params.recentSessionCount} sessions):`,
      `- Strengths: ${params.topStrengths.join(', ') || 'effort and teamwork'}`,
      `- Areas to improve: ${params.topChallenges.join(', ') || 'fundamentals'}`,
      '',
      'Generate the opening team talk JSON:',
      '{ "team_talk": "full 3-4 sentence script under 70 words", "focus_words": ["Word1", "Word2"], "energy_level": "high|focused|calm", "chant": "1-2-3 TEAMNAME!" }',
    ].filter(Boolean).join('\n'),
  }),
} as const;
