import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createHash } from 'crypto';
import { redis } from '@/lib/cache/redis';
import { cacheKeys } from '@/lib/cache/keys';
import type { AIInteractionType } from '@/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIProvider = 'anthropic' | 'openai' | 'gemini';

interface OrgAISettings {
  ai_provider?: AIProvider;
  ai_keys?: {
    anthropic?: string;
    openai?: string;
    gemini?: string;
  };
}

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
  orgId?: string;
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

interface ProviderCallResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-flash',
};

const CACHEABLE_TYPES: AIInteractionType[] = [
  'generate_practice_plan',
  'generate_development_card',
  'generate_parent_report',
  'generate_report_card',
];

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

/**
 * Determine the active AI provider and its API key.
 * Priority: org settings (from Supabase) → environment variables.
 */
export async function getConfiguredProvider(
  supabase: any,
  orgId: string
): Promise<{ provider: AIProvider; apiKey: string }> {
  // 1) Try org settings from Supabase
  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .single();

    if (org?.settings) {
      const settings = org.settings as OrgAISettings;
      const preferred = settings.ai_provider;
      const keys = settings.ai_keys || {};

      // If a preferred provider is set and has a key, use it
      if (preferred && keys[preferred]) {
        return { provider: preferred, apiKey: keys[preferred]! };
      }

      // Otherwise try any key that exists in org settings
      for (const p of ['anthropic', 'openai', 'gemini'] as AIProvider[]) {
        if (keys[p]) {
          return { provider: p, apiKey: keys[p]! };
        }
      }
    }
  } catch {
    // Org lookup failed — fall through to env vars
  }

  // 2) Fallback to environment variables
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.GEMINI_API_KEY) {
    return { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY };
  }

  throw new Error('No AI provider configured. Add an API key in settings or set an environment variable.');
}

// ---------------------------------------------------------------------------
// Provider-specific calls
// ---------------------------------------------------------------------------

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<ProviderCallResult> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    text,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
    model,
  };
}

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<ProviderCallResult> {
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const text = response.choices[0]?.message?.content || '';

  return {
    text,
    tokensIn: response.usage?.prompt_tokens || 0,
    tokensOut: response.usage?.completion_tokens || 0,
    model,
  };
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<ProviderCallResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  });

  const result = await geminiModel.generateContent(userPrompt);
  const response = result.response;
  const text = response.text();

  // Gemini doesn't always return exact token counts — approximate from text length
  const usage = response.usageMetadata;
  const tokensIn = usage?.promptTokenCount || Math.ceil((systemPrompt.length + userPrompt.length) / 4);
  const tokensOut = usage?.candidatesTokenCount || Math.ceil(text.length / 4);

  return { text, tokensIn, tokensOut, model };
}

async function callProvider(
  provider: AIProvider,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  modelOverride: string | undefined,
  maxTokens: number,
  temperature: number
): Promise<ProviderCallResult> {
  const model = modelOverride || DEFAULT_MODELS[provider];

  switch (provider) {
    case 'anthropic':
      return callAnthropic(apiKey, systemPrompt, userPrompt, model, maxTokens, temperature);
    case 'openai':
      return callOpenAI(apiKey, systemPrompt, userPrompt, model, maxTokens, temperature);
    case 'gemini':
      return callGemini(apiKey, systemPrompt, userPrompt, model, maxTokens, temperature);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashPrompt(system: string, user: string, context?: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify({ system, user, context }))
    .digest('hex')
    .slice(0, 16);
}

async function getOrgId(supabase: any, coachId: string): Promise<string> {
  const { data: coach } = await supabase
    .from('coaches')
    .select('org_id')
    .eq('id', coachId)
    .single();
  return coach?.org_id || '';
}

// ---------------------------------------------------------------------------
// Main entry points
// ---------------------------------------------------------------------------

export async function callAI(options: AICallOptions, supabase: any): Promise<AICallResult> {
  const {
    coachId,
    teamId,
    interactionType,
    systemPrompt,
    userPrompt,
    promptContext,
    model: modelOverride,
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

  // Resolve provider
  const orgId = options.orgId || await getOrgId(supabase, coachId);
  const { provider, apiKey } = await getConfiguredProvider(supabase, orgId);
  const model = modelOverride || DEFAULT_MODELS[provider];

  const startTime = Date.now();

  try {
    const providerResult = await callProvider(
      provider,
      apiKey,
      systemPrompt,
      userPrompt,
      modelOverride,
      maxTokens,
      temperature
    );

    const latencyMs = Date.now() - startTime;

    // Log to ai_interactions table
    const { data: interaction } = await supabase
      .from('ai_interactions')
      .insert({
        coach_id: coachId,
        team_id: teamId,
        interaction_type: interactionType,
        model: providerResult.model,
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        prompt_context: promptContext || null,
        response_text: providerResult.text,
        response_tokens_in: providerResult.tokensIn,
        response_tokens_out: providerResult.tokensOut,
        response_latency_ms: latencyMs,
        status: 'success',
      })
      .select('id')
      .single();

    const result: AICallResult = {
      text: providerResult.text,
      tokensIn: providerResult.tokensIn,
      tokensOut: providerResult.tokensOut,
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
