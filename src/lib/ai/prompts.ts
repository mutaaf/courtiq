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
} as const;
