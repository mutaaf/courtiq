import { describe, it, expect } from 'vitest';
import { PROMPT_REGISTRY } from './prompts';

const MAX_TOKENS_APPROX = 8000; // 4 chars per token × 2000 token safety limit

// ─── segmentTranscript ────────────────────────────────────────────────────────

describe('PROMPT_REGISTRY.segmentTranscript', () => {
  const baseParams = {
    transcript: 'Marcus had great defensive footwork today.',
    roster: [
      { name: 'Marcus', nickname: null, position: 'Guard', jersey_number: 12, name_variants: [] },
      { name: 'Jayden', nickname: 'Jay', position: 'Forward', jersey_number: 7, name_variants: ['Jayden'] },
    ],
  };

  it('returns an object with system and user fields', () => {
    const prompt = PROMPT_REGISTRY.segmentTranscript(baseParams);
    expect(prompt).toHaveProperty('system');
    expect(prompt).toHaveProperty('user');
    expect(typeof prompt.system).toBe('string');
    expect(typeof prompt.user).toBe('string');
  });

  it('includes the transcript text in user prompt', () => {
    const prompt = PROMPT_REGISTRY.segmentTranscript(baseParams);
    expect(prompt.user).toContain(baseParams.transcript);
  });

  it('includes player names from roster in user prompt', () => {
    const prompt = PROMPT_REGISTRY.segmentTranscript(baseParams);
    expect(prompt.user).toContain('Marcus');
    expect(prompt.user).toContain('Jayden');
  });

  it('includes jersey numbers in user prompt', () => {
    const prompt = PROMPT_REGISTRY.segmentTranscript(baseParams);
    expect(prompt.user).toContain('12');
  });

  it('includes nickname when present', () => {
    const prompt = PROMPT_REGISTRY.segmentTranscript(baseParams);
    expect(prompt.user).toContain('"Jay"');
  });

  it('includes name_variants when present', () => {
    const params = {
      ...baseParams,
      roster: [
        { name: 'Amin', nickname: null, position: 'Guard', jersey_number: 5, name_variants: ['I mean', 'a mean'] },
      ],
    };
    const prompt = PROMPT_REGISTRY.segmentTranscript(params);
    expect(prompt.user).toContain('I mean');
  });

  it('system prompt contains sport context', () => {
    const prompt = PROMPT_REGISTRY.segmentTranscript({ ...baseParams, sportName: 'soccer' });
    expect(prompt.system).toContain('soccer');
  });

  it('system prompt mentions YMCA context', () => {
    const prompt = PROMPT_REGISTRY.segmentTranscript(baseParams);
    expect(prompt.system).toContain('YMCA');
  });

  it('user prompt includes JSON schema hint', () => {
    const prompt = PROMPT_REGISTRY.segmentTranscript(baseParams);
    expect(prompt.user).toContain('observations');
    expect(prompt.user).toContain('player_name');
  });

  it('handles empty roster gracefully', () => {
    const prompt = PROMPT_REGISTRY.segmentTranscript({ transcript: 'Good practice today.', roster: [] });
    expect(typeof prompt.user).toBe('string');
    expect(typeof prompt.system).toBe('string');
  });

  it('handles long transcripts without exceeding rough token limit', () => {
    const longTranscript = 'Player worked on defense. '.repeat(200);
    const prompt = PROMPT_REGISTRY.segmentTranscript({ ...baseParams, transcript: longTranscript });
    expect(prompt.user.length).toBeLessThan(MAX_TOKENS_APPROX * 4);
  });

  it('includes custom instructions when provided', () => {
    const prompt = PROMPT_REGISTRY.segmentTranscript({
      ...baseParams,
      customInstructions: 'Always use formal language.',
    });
    expect(prompt.system).toContain('Always use formal language.');
  });

  it('includes curriculum skills in user prompt when provided', () => {
    const params = {
      ...baseParams,
      skills: [
        { skill_id: 'def_footwork', name: 'Defensive Footwork', category: 'Defense' },
      ],
    };
    const prompt = PROMPT_REGISTRY.segmentTranscript(params);
    expect(prompt.user).toContain('def_footwork');
    expect(prompt.user).toContain('Defensive Footwork');
  });
});

// ─── practicePlan ─────────────────────────────────────────────────────────────

describe('PROMPT_REGISTRY.practicePlan', () => {
  const baseParams = {
    teamName: 'Blue Tigers',
    ageGroup: '8-10',
    sportName: 'basketball',
    practiceDuration: 60,
    playerCount: 12,
    seasonWeek: 4,
  };

  it('returns an object with system and user fields', () => {
    const prompt = PROMPT_REGISTRY.practicePlan(baseParams);
    expect(prompt).toHaveProperty('system');
    expect(prompt).toHaveProperty('user');
  });

  it('includes team name in user prompt', () => {
    const prompt = PROMPT_REGISTRY.practicePlan(baseParams);
    expect(prompt.user).toContain('Blue Tigers');
  });

  it('includes age group in system prompt', () => {
    const prompt = PROMPT_REGISTRY.practicePlan(baseParams);
    expect(prompt.system).toContain('8-10');
  });

  it('includes practice duration in system prompt', () => {
    const prompt = PROMPT_REGISTRY.practicePlan(baseParams);
    expect(prompt.system).toContain('60');
  });

  it('includes player count in system prompt', () => {
    const prompt = PROMPT_REGISTRY.practicePlan(baseParams);
    expect(prompt.system).toContain('12');
  });

  it('includes JSON schema hint in user prompt', () => {
    const prompt = PROMPT_REGISTRY.practicePlan(baseParams);
    expect(prompt.user).toContain('drills');
    expect(prompt.user).toContain('warmup');
  });

  it('includes observation insights when provided', () => {
    const params = {
      ...baseParams,
      observationInsights: {
        totalObs: 25,
        daysOfData: 14,
        topNeedsWork: [{ category: 'dribbling', count: 8 }],
        topStrengths: [{ category: 'teamwork', count: 5 }],
      },
    };
    const prompt = PROMPT_REGISTRY.practicePlan(params);
    expect(prompt.user).toContain('dribbling');
    expect(prompt.user).toContain('teamwork');
  });

  it('includes trend data when provided', () => {
    const params = {
      ...baseParams,
      observationInsights: {
        totalObs: 30,
        daysOfData: 14,
        topNeedsWork: [{ category: 'defense', count: 6 }],
        topStrengths: [],
        trendData: {
          declining: [{ category: 'defense', recentCount: 6, priorCount: 2 }],
          improving: [{ category: 'passing', recentCount: 1, priorCount: 4 }],
          persistent: ['dribbling'],
          totalRecentObs: 15,
          totalPriorObs: 10,
        },
      },
    };
    const prompt = PROMPT_REGISTRY.practicePlan(params);
    expect(prompt.user).toContain('DECLINING');
    expect(prompt.user).toContain('IMPROVING');
    expect(prompt.user).toContain('dribbling');
  });

  it('includes focus skills when provided', () => {
    const params = { ...baseParams, focusSkills: ['ball handling', 'pivoting'] };
    const prompt = PROMPT_REGISTRY.practicePlan(params);
    expect(prompt.user).toContain('ball handling');
    expect(prompt.user).toContain('pivoting');
  });

  it('works without optional params', () => {
    const prompt = PROMPT_REGISTRY.practicePlan({});
    expect(typeof prompt.system).toBe('string');
    expect(typeof prompt.user).toBe('string');
  });

  it('system prompt stays within rough token limit', () => {
    const prompt = PROMPT_REGISTRY.practicePlan(baseParams);
    expect(prompt.system.length).toBeLessThan(MAX_TOKENS_APPROX * 4);
  });
});

// ─── gamedaySheet ─────────────────────────────────────────────────────────────

describe('PROMPT_REGISTRY.gamedaySheet', () => {
  const baseParams = {
    teamName: 'Blue Tigers',
    ageGroup: '11-13',
    sportName: 'basketball',
    opponent: 'Red Hawks',
  };

  it('includes opponent name in user prompt', () => {
    const prompt = PROMPT_REGISTRY.gamedaySheet(baseParams);
    expect(prompt.user).toContain('Red Hawks');
  });

  it('includes team name in user prompt', () => {
    const prompt = PROMPT_REGISTRY.gamedaySheet(baseParams);
    expect(prompt.user).toContain('Blue Tigers');
  });

  it('returns system and user strings', () => {
    const prompt = PROMPT_REGISTRY.gamedaySheet(baseParams);
    expect(typeof prompt.system).toBe('string');
    expect(typeof prompt.user).toBe('string');
    expect(prompt.system.length).toBeGreaterThan(0);
    expect(prompt.user.length).toBeGreaterThan(0);
  });
});

// ─── Cross-prompt: sport preamble propagation ─────────────────────────────────

describe('sport preamble propagation', () => {
  it('segmentTranscript uses default sport when not specified', () => {
    const prompt = PROMPT_REGISTRY.segmentTranscript({ transcript: 'Good session.' });
    expect(prompt.system).toContain('basketball');
  });

  it('practicePlan uses custom sport name', () => {
    const prompt = PROMPT_REGISTRY.practicePlan({ sportName: 'soccer', teamName: 'Stars' });
    expect(prompt.system).toContain('soccer');
  });
});
