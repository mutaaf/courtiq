import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createHash } from 'crypto';
import { redis } from '@/lib/cache/redis';
import { cacheKeys } from '@/lib/cache/keys';
import { checkAIRateLimit, RateLimitError, TierLimitError } from '@/lib/rate-limit';
import { type Tier } from '@/lib/tier';
import { enforceAIQuota } from '@/lib/ai/quota';
import type { AIInteractionType } from '@/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIProvider = 'anthropic' | 'openai' | 'gemini';

/** A single turn in a multi-turn conversation. */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

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
  /** Previous conversation turns to pass as context for multi-turn interactions. */
  conversationHistory?: ConversationMessage[];
  /**
   * Stable, per-team context (roster, curriculum, etc.) appended to the system
   * prompt. On Anthropic this block is marked with cache_control: ephemeral so
   * consecutive calls with the same context skip re-encoding (~90% input-cost
   * reduction within the 5-minute TTL). Other providers receive it concatenated
   * to the system prompt.
   */
  cacheableContext?: string;
  /**
   * Request a strict JSON object from the provider. Used by callAIWithJSON to
   * enable native JSON mode on OpenAI (response_format) and Gemini
   * (responseMimeType) — much more reliable than prompt-only "respond with
   * JSON" instructions on those providers.
   */
  jsonMode?: boolean;
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

// Latest stable models for structured extraction + reasoning (Apr 2026).
// Sonnet 4.6 ≫ Sonnet 4 for JSON-shaped outputs; Haiku 4.5 is a generational
// jump over Haiku 3 in both speed and quality.
const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-flash',
};

const CACHEABLE_TYPES: AIInteractionType[] = [
  'generate_practice_plan',
  'generate_development_card',
  'generate_parent_report',
  'generate_report_card',
  'generate_gameday_sheet',
  'generate_weekly_plan',
  'generate_season_storyline',
  'transcription',
  'segment_transcript',
  'roster_import',
];

// Type-specific TTLs (seconds)
const CACHE_TTL: Partial<Record<AIInteractionType, number>> = {
  segment_transcript: 3600,       // 1hr — roster changes frequently
  roster_import: 7200,            // 2hr — same image = same result
  generate_practice_plan: 43200,  // 12hr — plans are session-specific
  generate_gameday_sheet: 43200,  // 12hr
  generate_weekly_plan: 43200,    // 12hr
  generate_season_storyline: 86400, // 24hr — rarely changes
};
const DEFAULT_CACHE_TTL = 86400; // 24 hours

// Interaction types that should prefer the cheapest/fastest model
const COST_EFFECTIVE_TYPES: AIInteractionType[] = [
  'transcription',
];

// Cost-effective model overrides per provider — 8–20× cheaper than the
// defaults with minimal quality loss for transcription/segmentation.
const COST_EFFECTIVE_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};

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
  temperature: number,
  conversationHistory?: ConversationMessage[],
  cacheableContext?: string,
): Promise<ProviderCallResult> {
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    ...(conversationHistory ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userPrompt },
  ];

  // Build the system as a multi-block array when we have a cacheable context,
  // so Anthropic can hash + cache the stable prefix. The instruction block is
  // shorter and varies more (custom instructions per org), so we cache only
  // the larger, stable team-context block — that's where the savings are.
  const systemBlocks: Anthropic.TextBlockParam[] = cacheableContext
    ? [
        { type: 'text', text: systemPrompt },
        {
          type: 'text',
          text: cacheableContext,
          cache_control: { type: 'ephemeral' },
        },
      ]
    : [{ type: 'text', text: systemPrompt }];

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemBlocks,
    messages,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // Anthropic counts cached tokens separately; surface a combined input total
  // for cost logging while the cost helper down below knows about the cached
  // discount.
  const usage = response.usage as Anthropic.Usage & {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const tokensIn = usage.input_tokens + cacheCreate + cacheRead;

  return {
    text,
    tokensIn,
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
  temperature: number,
  conversationHistory?: ConversationMessage[],
  cacheableContext?: string,
  jsonMode?: boolean,
): Promise<ProviderCallResult> {
  const client = new OpenAI({ apiKey });

  // OpenAI doesn't have a Stripe-style explicit cache API, but its automatic
  // prompt caching (gpt-4o family) hashes the prefix of the system message,
  // so concatenating cacheableContext to the system maximizes cache reuse.
  const fullSystem = cacheableContext ? `${systemPrompt}\n\n${cacheableContext}` : systemPrompt;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: fullSystem },
    ...(conversationHistory ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userPrompt },
  ];

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages,
    ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
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
  temperature: number,
  conversationHistory?: ConversationMessage[],
  cacheableContext?: string,
  jsonMode?: boolean,
): Promise<ProviderCallResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const fullSystem = cacheableContext ? `${systemPrompt}\n\n${cacheableContext}` : systemPrompt;
  const geminiModel = genAI.getGenerativeModel({
    model,
    systemInstruction: fullSystem,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  });

  let text: string;
  let tokensIn: number;
  let tokensOut: number;

  if (conversationHistory && conversationHistory.length > 0) {
    // Use chat session for multi-turn conversations
    const chat = geminiModel.startChat({
      history: conversationHistory.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    });
    const result = await chat.sendMessage(userPrompt);
    const response = result.response;
    text = response.text();
    const usage = response.usageMetadata;
    tokensIn = usage?.promptTokenCount || Math.ceil((systemPrompt.length + userPrompt.length) / 4);
    tokensOut = usage?.candidatesTokenCount || Math.ceil(text.length / 4);
  } else {
    const result = await geminiModel.generateContent(userPrompt);
    const response = result.response;
    text = response.text();
    // Gemini doesn't always return exact token counts — approximate from text length
    const usage = response.usageMetadata;
    tokensIn = usage?.promptTokenCount || Math.ceil((systemPrompt.length + userPrompt.length) / 4);
    tokensOut = usage?.candidatesTokenCount || Math.ceil(text.length / 4);
  }

  return { text, tokensIn, tokensOut, model };
}

async function callProvider(
  provider: AIProvider,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  modelOverride: string | undefined,
  maxTokens: number,
  temperature: number,
  conversationHistory?: ConversationMessage[],
  cacheableContext?: string,
  jsonMode?: boolean,
): Promise<ProviderCallResult> {
  const model = modelOverride || DEFAULT_MODELS[provider];

  switch (provider) {
    case 'anthropic':
      return callAnthropic(
        apiKey, systemPrompt, userPrompt, model, maxTokens, temperature,
        conversationHistory, cacheableContext,
      );
    case 'openai':
      return callOpenAI(
        apiKey, systemPrompt, userPrompt, model, maxTokens, temperature,
        conversationHistory, cacheableContext, jsonMode,
      );
    case 'gemini':
      return callGemini(
        apiKey, systemPrompt, userPrompt, model, maxTokens, temperature,
        conversationHistory, cacheableContext, jsonMode,
      );
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashPrompt(system: string, user: string, context?: unknown, history?: ConversationMessage[]): string {
  return createHash('sha256')
    .update(JSON.stringify({ system, user, context, history }))
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
// Token estimation & cost tracking
// ---------------------------------------------------------------------------

/**
 * Estimate token count from text (rough: ~4 chars per token for English).
 * Useful for cost warnings before making expensive AI calls.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate the cost tier of a request based on input size.
 * Returns 'low' (<1k tokens), 'medium' (1k-8k), 'high' (>8k).
 */
export function estimateCostTier(systemPrompt: string, userPrompt: string): 'low' | 'medium' | 'high' {
  const totalTokens = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
  if (totalTokens < 1000) return 'low';
  if (totalTokens < 8000) return 'medium';
  return 'high';
}

// Approximate cost per 1M tokens (USD) — input / output
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },           // legacy
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
  'claude-haiku-3-20240307': { input: 0.25, output: 1.25 },       // legacy
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
};

/**
 * Estimate cost in USD from token counts and model name.
 */
function estimateCostUSD(model: string, tokensIn: number, tokensOut: number): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;
  return (tokensIn * costs.input + tokensOut * costs.output) / 1_000_000;
}

function logCost(interactionType: AIInteractionType, model: string, tokensIn: number, tokensOut: number, latencyMs: number): void {
  const costUSD = estimateCostUSD(model, tokensIn, tokensOut);
  if (costUSD > 0) {
    console.log(
      `[AI Cost] ${interactionType} | ${model} | ${tokensIn}+${tokensOut} tokens | $${costUSD.toFixed(4)} | ${latencyMs}ms`
    );
  }
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
    conversationHistory,
  } = options;

  // Enforce per-coach hourly rate limit before any expensive operations
  const rateCheck = await checkAIRateLimit(coachId);
  if (!rateCheck.allowed) {
    throw new RateLimitError(rateCheck.limit, rateCheck.resetAt);
  }

  // Check dedup cache for cacheable types
  const cacheable = CACHEABLE_TYPES.includes(interactionType);
  if (cacheable && redis) {
    const hash = hashPrompt(systemPrompt, userPrompt, promptContext, conversationHistory);
    const hit = await redis.get<AICallResult>(cacheKeys.aiDedup(hash));
    if (hit) {
      return { ...hit, _cached: true };
    }
  }

  // Resolve provider
  const orgId = options.orgId || await getOrgId(supabase, coachId);
  const { provider, apiKey } = await getConfiguredProvider(supabase, orgId);

  // Enforce monthly AI call quota — shared helper used here AND in
  // /api/ai/import-roster (which doesn't go through callAI). If you find
  // yourself reimplementing the quota check, use enforceAIQuota instead.
  try {
    await enforceAIQuota(supabase, coachId);
  } catch (err) {
    if (err instanceof TierLimitError) throw err;
    // Anything else (e.g. transient DB error) shouldn't hard-block the call.
  }

  // Use cheaper models for cost-effective interaction types (unless explicitly overridden)
  const useCostEffective = !modelOverride && COST_EFFECTIVE_TYPES.includes(interactionType);
  const model = modelOverride || (useCostEffective ? COST_EFFECTIVE_MODELS[provider] : DEFAULT_MODELS[provider]);

  const startTime = Date.now();

  try {
    const providerResult = await callProvider(
      provider,
      apiKey,
      systemPrompt,
      userPrompt,
      model, // Use the fully resolved model (cost-effective or default), not the raw override
      maxTokens,
      temperature,
      conversationHistory,
      options.cacheableContext,
      options.jsonMode,
    );

    const latencyMs = Date.now() - startTime;

    // Log estimated cost
    logCost(interactionType, providerResult.model, providerResult.tokensIn, providerResult.tokensOut, latencyMs);

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

    // Cache if cacheable — use type-specific TTL
    if (cacheable && redis) {
      const hash = hashPrompt(systemPrompt, userPrompt, promptContext, conversationHistory);
      const ttl = CACHE_TTL[interactionType] ?? DEFAULT_CACHE_TTL;
      await redis.set(cacheKeys.aiDedup(hash), result, { ex: ttl });
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
      // Belt-and-suspenders — even with native JSON mode (OpenAI/Gemini) and
      // the schema reminder in the user prompt, telling the model in plain
      // English produces cleaner output for Anthropic too.
      systemPrompt: options.systemPrompt + '\n\nYou MUST respond with valid JSON only. No markdown, no explanation.',
      jsonMode: true,
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
