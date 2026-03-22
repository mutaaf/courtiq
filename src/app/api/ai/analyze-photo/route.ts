import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { callAI } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { teamId, imageUrl, imageBase64, analysisType = 'coaching', customPrompt, mediaId } = body;

  if (!teamId || (!imageUrl && !imageBase64)) {
    return NextResponse.json({ error: 'teamId and imageUrl or imageBase64 required' }, { status: 400 });
  }

  try {
    const context = await buildAIContext(teamId, supabase);
    const prompt = PROMPT_REGISTRY.analyzePhoto({ ...context, analysisType, customPrompt });

    // Use Claude vision — pass image as base64 or URL in user prompt
    const imageContent = imageBase64
      ? `[Image provided as base64 data]\n\ndata:image/jpeg;base64,${imageBase64}`
      : `[Image URL: ${imageUrl}]`;

    const result = await callAI(
      {
        coachId: user.id,
        teamId,
        interactionType: 'analyze_photo',
        systemPrompt: prompt.system,
        userPrompt: `${prompt.user}\n\n${imageContent}`,
      },
      supabase
    );

    // If a mediaId was provided, update the media record with the analysis
    if (mediaId) {
      await supabase
        .from('media')
        .update({
          ai_analysis: result.text,
          ai_interaction_id: result.interactionId,
        })
        .eq('id', mediaId);
    }

    return NextResponse.json({
      analysis: result.text,
      interactionId: result.interactionId,
    });
  } catch (error: any) {
    console.error('Photo analysis error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
