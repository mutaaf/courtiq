import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { snapObservationSchema, type SnapObservationResult } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { teamId, imageBase64, customFocus } = body;

  if (!teamId || !imageBase64) {
    return NextResponse.json({ error: 'teamId and imageBase64 required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();
  const { data: coach } = await admin.from('coaches').select('org_id').eq('id', user.id).single();

  // Verify AI is configured
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
    const prompt = PROMPT_REGISTRY.snapObservation({ ...context, customFocus });

    const imageContent = `[Image provided as base64]\ndata:image/jpeg;base64,${imageBase64}`;

    const result = await callAIWithJSON<SnapObservationResult>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'analyze_photo',
        systemPrompt: prompt.system,
        userPrompt: `${prompt.user}\n\n${imageContent}`,
        orgId: coach?.org_id,
      },
      admin
    );

    // Validate with Zod — fall back to raw output on schema mismatch
    try {
      const validated = snapObservationSchema.parse(result.parsed);
      return NextResponse.json({
        image_description: validated.image_description || '',
        observations: validated.observations,
        team_observations: validated.team_observations || [],
        interactionId: result.interactionId,
      });
    } catch {
      const raw = result.parsed as any;
      return NextResponse.json({
        image_description: raw?.image_description || '',
        observations: raw?.observations || [],
        team_observations: raw?.team_observations || [],
        interactionId: result.interactionId,
        warning: 'AI output validation was relaxed',
      });
    }
  } catch (error: unknown) {
    return handleAIError(error, 'Snap observation');
  }
}
