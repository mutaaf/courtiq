import { describe, it, expect } from 'vitest';
import {
  segmentedObservationSchema,
  practicePlanSchema,
  reportCardSchema,
  developmentCardSchema,
  parentReportSchema,
  gamedaySheetSchema,
  rosterImportSchema,
} from '@/lib/ai/schemas';
import type { ConversationMessage } from '@/lib/ai/client';

// Mirrors the validation logic in the assistant API route
function validateConversationHistory(raw: unknown[]): ConversationMessage[] {
  return raw
    .filter(
      (m): m is ConversationMessage =>
        m !== null &&
        typeof m === 'object' &&
        'role' in (m as object) &&
        'content' in (m as object) &&
        ((m as ConversationMessage).role === 'user' ||
          (m as ConversationMessage).role === 'assistant') &&
        typeof (m as ConversationMessage).content === 'string'
    )
    .slice(-10);
}

describe('AI Output Schema Contracts', () => {
  describe('Segmented Observations', () => {
    it('validates well-formed segmented output', () => {
      const valid = {
        observations: [
          {
            player_name: 'Marcus',
            category: 'Offense',
            sentiment: 'positive' as const,
            text: 'Great cut to the basket after the pass',
            skill_id: 'pass_and_cut',
            result: 'success' as const,
          },
          {
            player_name: 'Jayden',
            category: 'Defense',
            sentiment: 'needs-work' as const,
            text: 'Needs to close out harder on shooters',
            skill_id: null,
          },
        ],
        unmatched_names: ['unknown_player'],
        team_observations: [
          { category: 'Effort', sentiment: 'positive' as const, text: 'Great energy in practice today' },
        ],
      };

      const result = segmentedObservationSchema.parse(valid);
      expect(result.observations).toHaveLength(2);
      expect(result.unmatched_names).toHaveLength(1);
    });

    it('rejects observation with empty player name', () => {
      const invalid = {
        observations: [
          { player_name: '', category: 'Offense', sentiment: 'positive', text: 'Good play' },
        ],
      };

      expect(() => segmentedObservationSchema.parse(invalid)).toThrow();
    });

    it('rejects observation with short text', () => {
      const invalid = {
        observations: [
          { player_name: 'Marcus', category: 'Offense', sentiment: 'positive', text: 'ok' },
        ],
      };

      expect(() => segmentedObservationSchema.parse(invalid)).toThrow();
    });
  });

  describe('Practice Plan', () => {
    it('validates well-formed practice plan', () => {
      const valid = {
        title: 'Tuesday Practice - Week 4',
        duration_minutes: 60,
        warmup: { name: 'Dynamic Stretching', duration_minutes: 5, description: 'Jogging and stretching' },
        drills: [
          { name: 'Pass and Cut 3v0', duration_minutes: 10, description: 'Three person passing drill', skill_id: 'pass_and_cut' },
          { name: 'Layup Lines', duration_minutes: 10, description: 'Alternating layups from both sides' },
        ],
        scrimmage: { duration_minutes: 15, focus: 'Using pass and cut in live play' },
        cooldown: { duration_minutes: 5, notes: 'Free throws and team talk' },
      };

      const result = practicePlanSchema.parse(valid);
      expect(result.drills).toHaveLength(2);
    });

    it('rejects plan with no drills', () => {
      const invalid = {
        title: 'Empty Plan',
        duration_minutes: 60,
        warmup: { name: 'Warm Up', duration_minutes: 5, description: 'Stretching' },
        drills: [],
      };

      expect(() => practicePlanSchema.parse(invalid)).toThrow();
    });
  });

  describe('Report Card', () => {
    it('validates well-formed report card', () => {
      const valid = {
        player_name: 'Marcus Johnson',
        skills: [
          { skill_name: 'Pass and Cut', proficiency_level: 'practicing', narrative: 'Marcus is showing great improvement in cutting after passes.', trend: 'improving' as const },
        ],
        strengths: ['Great attitude', 'Strong ball handling'],
        growth_areas: ['Defensive positioning'],
        coach_note: 'Marcus has been a joy to coach this season. Keep working on that defense!',
        home_practice_suggestion: 'Practice dribbling with both hands for 10 minutes daily.',
      };

      const result = reportCardSchema.parse(valid);
      expect(result.skills).toHaveLength(1);
      expect(result.strengths).toHaveLength(2);
    });

    it('rejects report card without strengths', () => {
      const invalid = {
        player_name: 'Marcus',
        skills: [],
        strengths: [],
        growth_areas: [],
        coach_note: 'Good season for Marcus overall.',
      };

      expect(() => reportCardSchema.parse(invalid)).toThrow();
    });
  });

  describe('Development Card', () => {
    it('validates well-formed development card', () => {
      const valid = {
        player_name: 'Sofia Chen',
        strengths: ['Excellent court vision'],
        growth_areas: ['Shooting consistency'],
        goals: [
          {
            skill: 'Free Throw Routine',
            current_level: 'exploring',
            target_level: 'practicing',
            action_steps: ['Establish a consistent pre-shot routine', 'Practice 20 free throws daily'],
          },
        ],
        coach_note: 'Sofia is a natural leader on the court. Focus on building shooting confidence.',
      };

      const result = developmentCardSchema.parse(valid);
      expect(result.goals).toHaveLength(1);
    });
  });

  describe('Parent Report', () => {
    it('validates well-formed parent report', () => {
      const valid = {
        player_name: 'Jayden',
        greeting: 'Hi! Here is Jayden\'s progress update.',
        highlights: ['Great improvement in dribbling this week!'],
        skill_progress: [
          { skill_name: 'Dribbling', level: 'Practicing', narrative: 'Jayden can now dribble with eyes up most of the time.' },
        ],
        encouragement: 'Keep up the great work, Jayden!',
        home_activity: { name: 'Ball Handling Challenge', description: 'Dribble around cones in the driveway', duration_minutes: 15 },
        coach_note: 'Jayden is making excellent progress and shows great enthusiasm.',
      };

      const result = parentReportSchema.parse(valid);
      expect(result.highlights).toHaveLength(1);
    });
  });

  describe('Gameday Sheet', () => {
    it('validates well-formed gameday sheet', () => {
      const valid = {
        title: 'Game vs Hawks',
        opponent: 'Hawks',
        game_plan: {
          offensive_focus: ['Push the ball in transition', 'Attack the paint'],
          defensive_focus: ['Man-to-man full court'],
        },
      };

      const result = gamedaySheetSchema.parse(valid);
      expect(result.game_plan.offensive_focus).toHaveLength(2);
    });
  });

  describe('Roster Import', () => {
    it('validates roster extraction', () => {
      const valid = {
        players: [
          { name: 'Marcus Johnson', jersey_number: 12, position: 'PG' },
          { name: 'Sofia Chen', jersey_number: 5 },
          { name: 'Jayden Smith' },
        ],
      };

      const result = rosterImportSchema.parse(valid);
      expect(result.players).toHaveLength(3);
    });

    it('rejects empty player name', () => {
      const invalid = { players: [{ name: '' }] };
      expect(() => rosterImportSchema.parse(invalid)).toThrow();
    });
  });

  describe('Conversation History (multi-turn assistant)', () => {
    it('passes through valid user/assistant messages', () => {
      const raw = [
        { role: 'user', content: 'Generate a practice plan' },
        { role: 'assistant', content: 'Here is your practice plan...' },
        { role: 'user', content: 'Can you add more defensive drills?' },
      ];
      const result = validateConversationHistory(raw);
      expect(result).toHaveLength(3);
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('assistant');
    });

    it('filters out messages with invalid roles', () => {
      const raw = [
        { role: 'user', content: 'Hello' },
        { role: 'system', content: 'Injected content' },
        { role: 'assistant', content: 'Hi there' },
      ];
      const result = validateConversationHistory(raw);
      expect(result).toHaveLength(2);
      expect(result.every((m) => m.role === 'user' || m.role === 'assistant')).toBe(true);
    });

    it('filters out messages with non-string content', () => {
      const raw = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 42 },
        { role: 'user', content: null },
      ];
      const result = validateConversationHistory(raw);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hello');
    });

    it('filters out null and non-object entries', () => {
      const raw = [null, undefined, 'string', 42, { role: 'user', content: 'Valid' }];
      const result = validateConversationHistory(raw as unknown[]);
      expect(result).toHaveLength(1);
    });

    it('caps history at 10 most recent messages', () => {
      const raw = Array.from({ length: 15 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1}`,
      }));
      const result = validateConversationHistory(raw);
      expect(result).toHaveLength(10);
      // Should keep the LAST 10 messages
      expect(result[0].content).toBe('Message 6');
      expect(result[9].content).toBe('Message 15');
    });

    it('allows empty history', () => {
      expect(validateConversationHistory([])).toHaveLength(0);
    });
  });
});
