import { http, HttpResponse } from 'msw';

export const handlers = [
  // Health check
  http.get('*/api/health', () => {
    return HttpResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  }),

  // AI segment
  http.post('*/api/ai/segment', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      observations: [
        {
          player_name: 'Test Player',
          category: 'Offense',
          sentiment: 'positive',
          text: 'Great play by the player',
          skill_id: null,
        },
      ],
      unmatched_names: [],
      team_observations: [],
    });
  }),

  // AI plan
  http.post('*/api/ai/plan', async () => {
    return HttpResponse.json({
      plan: {
        id: 'test-plan-id',
        type: 'practice',
        title: 'Test Practice Plan',
      },
      content: {
        title: 'Test Practice Plan',
        duration_minutes: 60,
        warmup: { name: 'Dynamic Warm Up', duration_minutes: 5, description: 'Jogging and stretching' },
        drills: [
          { name: 'Layup Lines', duration_minutes: 10, description: 'Basic layup drill' },
        ],
      },
    });
  }),

  // Voice token
  http.post('*/api/voice/token', () => {
    return HttpResponse.json({ token: 'mock-deepgram-token', expires_at: Date.now() + 120000 });
  }),

  // Config
  http.get('*/api/config/:domain', () => {
    return HttpResponse.json({
      categories: ['Offense', 'Defense', 'IQ', 'Effort', 'Coachability'],
      _source: { categories: 'system' },
    });
  }),

  // Features
  http.get('*/api/features', () => {
    return HttpResponse.json({
      cv_processing: false,
      parent_portal: true,
      curriculum_engine: true,
    });
  }),

  // Share
  http.get('*/api/share/:token', ({ params }) => {
    return HttpResponse.json({
      player: { name: 'Test Player', age_group: '8-10' },
      proficiency: [],
      coach_note: 'Great progress!',
    });
  }),
];
