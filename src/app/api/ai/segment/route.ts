import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { segmentedObservationSchema, type SegmentedObservations } from '@/lib/ai/schemas';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { transcript, teamId, sessionId } = body;

  if (!transcript || !teamId) {
    return NextResponse.json({ error: 'transcript and teamId required' }, { status: 400 });
  }

  try {
    const context = await buildAIContext(teamId, supabase);
    const prompt = PROMPT_REGISTRY.segmentTranscript({ ...context, transcript });

    const result = await callAIWithJSON<SegmentedObservations>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'segment_transcript',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
      },
      supabase
    );

    // Validate with Zod
    const validated = segmentedObservationSchema.parse(result.parsed);

    return NextResponse.json({
      observations: validated.observations,
      unmatched_names: validated.unmatched_names || [],
      team_observations: validated.team_observations || [],
      interactionId: result.interactionId,
    });
  } catch (error: any) {
    console.error('Segment error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
