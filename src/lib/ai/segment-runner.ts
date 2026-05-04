import { createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { segmentedObservationSchema, type SegmentedObservations } from '@/lib/ai/schemas';

export interface SegmentationInput {
  transcript: string;
  teamId: string;
  coachId: string;
  sessionId?: string | null;
  orgId?: string | null;
}

export interface SegmentationResult {
  observations: SegmentedObservations['observations'];
  unmatched_names: string[];
  team_observations: NonNullable<SegmentedObservations['team_observations']>;
  interactionId: string | null;
  warning?: string;
}

/**
 * Run transcript segmentation. Used by both /api/ai/segment (HTTP)
 * and the long-session transcript webhook (internal).
 *
 * Caller is responsible for auth + AI provider availability checks.
 */
export async function runSegmentation(input: SegmentationInput): Promise<SegmentationResult> {
  const admin = await createServiceSupabase();
  const context = await buildAIContext(input.teamId, admin);
  const prompt = PROMPT_REGISTRY.segmentTranscript({ ...context, transcript: input.transcript }) as {
    system: string;
    user: string;
    cacheableContext?: string;
  };

  const result = await callAIWithJSON<SegmentedObservations>(
    {
      coachId: input.coachId,
      teamId: input.teamId,
      interactionType: 'segment_transcript',
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      cacheableContext: prompt.cacheableContext,
      orgId: input.orgId ?? undefined,
    },
    admin
  );

  try {
    const validated = segmentedObservationSchema.parse(result.parsed);
    return {
      observations: validated.observations,
      unmatched_names: validated.unmatched_names || [],
      team_observations: validated.team_observations || [],
      interactionId: result.interactionId,
    };
  } catch (zodError) {
    console.error('Segmentation Zod validation failed, returning raw output:', zodError);
    const raw = result.parsed as {
      observations?: SegmentedObservations['observations'];
      unmatched_names?: string[];
      team_observations?: SegmentedObservations['team_observations'];
    };
    return {
      observations: raw?.observations || [],
      unmatched_names: raw?.unmatched_names || [],
      team_observations: raw?.team_observations || [],
      interactionId: result.interactionId,
      warning: 'AI output validation was relaxed',
    };
  }
}
