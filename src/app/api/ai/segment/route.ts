import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { segmentedObservationSchema, type SegmentedObservations } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { transcript, teamId, sessionId } = body;

  if (!transcript || !teamId) {
    return NextResponse.json({ error: 'transcript and teamId required' }, { status: 400 });
  }

  // Check if any AI provider is configured
  const admin = await createServiceSupabase();
  const { data: coach } = await admin.from('coaches').select('org_id').eq('id', user.id).single();
  if (coach?.org_id) {
    const { data: org } = await admin.from('organizations').select('settings').eq('id', coach.org_id).single();
    const settings = (org?.settings || {}) as Record<string, unknown>;
    const aiKeys = (settings.ai_keys || {}) as Record<string, string>;
    const hasOrgKey = Object.values(aiKeys).some((k) => k && k.length > 5);
    const hasEnvKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_AI_API_KEY);

    if (!hasOrgKey && !hasEnvKey) {
      return NextResponse.json({
        error: 'No AI provider configured. Go to Settings → AI & API Keys to add your API key.',
        needsSetup: true,
      }, { status: 400 });
    }
  }

  try {
    const context = await buildAIContext(teamId, admin);
    const prompt = PROMPT_REGISTRY.segmentTranscript({ ...context, transcript });

    const result = await callAIWithJSON<SegmentedObservations>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'segment_transcript',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id,
      },
      admin
    );

    // Validate with Zod — if validation fails, return raw AI output anyway
    try {
      const validated = segmentedObservationSchema.parse(result.parsed);

      return NextResponse.json({
        observations: validated.observations,
        unmatched_names: validated.unmatched_names || [],
        team_observations: validated.team_observations || [],
        interactionId: result.interactionId,
      });
    } catch (zodError) {
      console.error('Zod validation failed, returning raw AI output:', zodError);
      const raw = result.parsed as any;
      return NextResponse.json({
        observations: raw?.observations || [],
        unmatched_names: raw?.unmatched_names || [],
        team_observations: raw?.team_observations || [],
        interactionId: result.interactionId,
        warning: 'AI output validation was relaxed',
      });
    }
  } catch (error: unknown) {
    return handleAIError(error, 'Segment');
  }
}
