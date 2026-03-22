import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { redis } from '@/lib/cache/redis';
import { cacheKeys } from '@/lib/cache/keys';
import type { AIInteractionType } from '@/types/database';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface AICallOptions {
  coachId: string;
  teamId: string;
  interactionType: AIInteractionType;
  systemPrompt: string;
  userPrompt: string;
  promptContext?: Record<string, unknown>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface AICallResult {
  text: string;
  parsed?: unknown;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  interactionId: string;
  _cached?: boolean;
}

function hashPrompt(system: string, user: string, context?: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify({ system, user, context }))
    .digest('hex')
    .slice(0, 16);
}

const CACHEABLE_TYPES: AIInteractionType[] = [
  'generate_practice_plan',
  'generate_development_card',
  'generate_parent_report',
  'generate_report_card',
];

export async function callAI(options: AICallOptions, supabase: any): Promise<AICallResult> {
  const {
    coachId,
    teamId,
    interactionType,
    systemPrompt,
    userPrompt,
    promptContext,
    model = 'claude-sonnet-4-20250514',
    maxTokens = 4096,
    temperature = 0.7,
  } = options;

  // Check dedup cache for cacheable types
  const cacheable = CACHEABLE_TYPES.includes(interactionType);
  if (cacheable && redis) {
    const hash = hashPrompt(systemPrompt, userPrompt, promptContext);
    const hit = await redis.get<AICallResult>(cacheKeys.aiDedup(hash));
    if (hit) {
      return { ...hit, _cached: true };
    }
  }

  const startTime = Date.now();

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const latencyMs = Date.now() - startTime;
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Log to ai_interactions table
    const { data: interaction } = await supabase
      .from('ai_interactions')
      .insert({
        coach_id: coachId,
        team_id: teamId,
        interaction_type: interactionType,
        model,
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        prompt_context: promptContext || null,
        response_text: text,
        response_tokens_in: response.usage.input_tokens,
        response_tokens_out: response.usage.output_tokens,
        response_latency_ms: latencyMs,
        status: 'success',
      })
      .select('id')
      .single();

    const result: AICallResult = {
      text,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
      latencyMs,
      interactionId: interaction?.id || '',
    };

    // Cache if cacheable
    if (cacheable && redis) {
      const hash = hashPrompt(systemPrompt, userPrompt, promptContext);
      await redis.set(cacheKeys.aiDedup(hash), result, { ex: 86400 });
    }

    return result;
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;

    await supabase.from('ai_interactions').insert({
      coach_id: coachId,
      team_id: teamId,
      interaction_type: interactionType,
      model,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      prompt_context: promptContext || null,
      response_latency_ms: latencyMs,
      status: error.status === 429 ? 'rate_limited' : 'error',
      error_message: error.message,
    });

    throw error;
  }
}

export async function callAIWithJSON<T>(
  options: AICallOptions,
  supabase: any
): Promise<AICallResult & { parsed: T }> {
  const result = await callAI(
    {
      ...options,
      systemPrompt: options.systemPrompt + '\n\nYou MUST respond with valid JSON only. No markdown, no explanation.',
    },
    supabase
  );

  let parsed: T;
  try {
    // Try to extract JSON from the response
    let jsonText = result.text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonText = jsonMatch[1].trim();
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse AI response as JSON: ${result.text.slice(0, 200)}`);
  }

  // Update the interaction with parsed data
  if (result.interactionId) {
    await supabase
      .from('ai_interactions')
      .update({ response_parsed: parsed })
      .eq('id', result.interactionId);
  }

  return { ...result, parsed };
}
