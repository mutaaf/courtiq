import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createHash } from 'crypto';
import { redis } from '@/lib/cache/redis';
import { cacheKeys } from '@/lib/cache/keys';
import { checkAIRateLimit, RateLimitError, TierLimitError } from '@/lib/rate-limit';
import { TIER_LIMITS, type Tier } from '@/lib/tier';
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
  /** Optional large context block eligible for Anthropic prompt caching. */
  cacheableContext?: string;
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

// Cost-effective model overrides per provider
const COST_EFFECTIVE_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-3-20240307',
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

/**
 * Resolve the API key for a SPECIFIC provider from org settings, then env.
 * Mirrors getConfiguredProvider's org-key-first / env-fallback precedence, but
 * for a single named provider. Returns null when no usable key exists.
 */
function keyForProvider(orgSettings: OrgAISettings | null, provider: AIProvider): string | null {
  const orgKey = orgSettings?.ai_keys?.[provider];
  if (orgKey) return orgKey;
  const envKey =
    provider === 'anthropic'
      ? process.env.ANTHROPIC_API_KEY
      : provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : process.env.GEMINI_API_KEY;
  return envKey || null;
}

/**
 * Pick the next eligible fallback provider after a primary failure (ticket 0012).
 *
 * Deterministic, key-gated: walks anthropic → openai → gemini in fixed order,
 * skips the already-failed `exclude` provider and any provider with no usable
 * key (org settings first, then env). Returns null when no fallback exists, so
 * a single-key org's behavior is unchanged. Does NOT alter primary selection —
 * getConfiguredProvider() still chooses the primary; this only chooses the next.
 */
export async function getFallbackProvider(
  supabase: any,
  orgId: string,
  exclude: AIProvider
): Promise<{ provider: AIProvider; apiKey: string } | null> {
  let orgSettings: OrgAISettings | null = null;
  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .single();
    orgSettings = (org?.settings as OrgAISettings) || null;
  } catch {
    // Org lookup failed — env keys can still provide a fallback.
  }

  for (const p of ['anthropic', 'openai', 'gemini'] as AIProvider[]) {
    if (p === exclude) continue;
    const apiKey = keyForProvider(orgSettings, p);
    if (apiKey) return { provider: p, apiKey };
  }
  return null;
}

/**
 * Classify a provider transport error as retryable-on-another-provider (ticket 0012).
 *
 * Retryable: HTTP >= 500 (incl. Anthropic's 529 overload), a provider-side 429
 * (their rate-limit IS retryable on a DIFFERENT provider — note callAI keeps
 * logging it as status:'rate_limited'), and network errors with no HTTP status.
 * NOT retryable: 4xx client errors (400 bad request, 401 invalid key, 403) — a
 * second provider won't fix a malformed request or a bad key path.
 *
 * Note: TierLimitError/RateLimitError are NOT provider errors and never reach
 * this classifier — callAI rethrows them before failover.
 */
export function isRetryableProviderError(err: any): boolean {
  const status = typeof err?.status === 'number' ? err.status : undefined;
  if (status === undefined) return true; // network / transport error → try another provider
  if (status >= 500) return true; // includes 529 overload
  if (status === 429) return true; // provider rate-limited → retryable on a different provider
  return false; // 400 / 401 / 403 and other 4xx → not retryable
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
  conversationHistory?: ConversationMessage[]
): Promise<ProviderCallResult> {
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    ...(conversationHistory ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userPrompt },
  ];

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages,
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
  temperature: number,
  conversationHistory?: ConversationMessage[]
): Promise<ProviderCallResult> {
  const client = new OpenAI({ apiKey });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
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
  conversationHistory?: ConversationMessage[]
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
  conversationHistory?: ConversationMessage[]
): Promise<ProviderCallResult> {
  const model = modelOverride || DEFAULT_MODELS[provider];

  switch (provider) {
    case 'anthropic':
      return callAnthropic(apiKey, systemPrompt, userPrompt, model, maxTokens, temperature, conversationHistory);
    case 'openai':
      return callOpenAI(apiKey, systemPrompt, userPrompt, model, maxTokens, temperature, conversationHistory);
    case 'gemini':
      return callGemini(apiKey, systemPrompt, userPrompt, model, maxTokens, temperature, conversationHistory);
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
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-3-20240307': { input: 0.25, output: 1.25 },
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

  // Enforce monthly AI call quota for free-tier orgs
  if (orgId) {
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('tier')
        .eq('id', orgId)
        .single();
      const orgTier = ((org as any)?.tier || 'free') as Tier;
      const monthlyLimit = TIER_LIMITS[orgTier].maxAICallsPerMonth;
      if (monthlyLimit < 999999) {
        // Count successful AI calls this calendar month for this coach
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const { count } = await supabase
          .from('ai_interactions')
          .select('id', { count: 'exact', head: true })
          .eq('coach_id', coachId)
          .eq('status', 'success')
          .gte('created_at', monthStart.toISOString());
        if ((count ?? 0) >= monthlyLimit) {
          throw new TierLimitError(orgTier, monthlyLimit);
        }
      }
    } catch (err) {
      // Re-throw TierLimitError; swallow unexpected errors to avoid blocking coaches
      if (err instanceof TierLimitError) throw err;
    }
  }

  // Use cheaper models for cost-effective interaction types (unless explicitly overridden)
  const useCostEffective = !modelOverride && COST_EFFECTIVE_TYPES.includes(interactionType);
  const model = modelOverride || (useCostEffective ? COST_EFFECTIVE_MODELS[provider] : DEFAULT_MODELS[provider]);

  const startTime = Date.now();

  // Run the shared success path for a completed provider call: log cost, insert
  // the status:'success' ai_interactions row, write the dedup cache, and return
  // the AICallResult. Used for BOTH the primary call and a successful failover
  // so the failover path is observably identical to a normal call.
  const recordSuccess = async (providerResult: ProviderCallResult): Promise<AICallResult> => {
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
  };

  // Insert a failed-call ai_interactions row. The 429-as-'rate_limited' label is
  // preserved exactly as before so a provider rate-limit still reads correctly in
  // the audit trail even though it IS retryable on a different provider.
  const recordError = async (failModel: string, error: any): Promise<void> => {
    await supabase.from('ai_interactions').insert({
      coach_id: coachId,
      team_id: teamId,
      interaction_type: interactionType,
      model: failModel,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      prompt_context: promptContext || null,
      response_latency_ms: Date.now() - startTime,
      status: error?.status === 429 ? 'rate_limited' : 'error',
      error_message: error?.message,
    });
  };

  try {
    const providerResult = await callProvider(
      provider,
      apiKey,
      systemPrompt,
      userPrompt,
      model, // Use the fully resolved model (cost-effective or default), not the raw override
      maxTokens,
      temperature,
      conversationHistory
    );

    return await recordSuccess(providerResult);
  } catch (error: any) {
    // Quota / rate-limit refusals are the product working as designed, not a
    // provider outage — propagate unchanged, never fail over (ticket 0012).
    if (error instanceof TierLimitError || error instanceof RateLimitError) {
      throw error;
    }

    // Always log the failed-primary row first — it's half the failover audit trail
    // and the count query's .eq('status','success') naturally excludes it.
    await recordError(model, error);

    // Only retryable transport errors are worth a second provider; a 401/400 won't
    // be fixed by another key path, so rethrow as today.
    if (isRetryableProviderError(error)) {
      const fallback = await getFallbackProvider(supabase, orgId, provider);
      if (fallback) {
        // Resolve the fallback's model the same way a normal call would (cost-effective
        // for cost-effective types, else default), but never carry the primary's override.
        const fallbackModel = useCostEffective
          ? COST_EFFECTIVE_MODELS[fallback.provider]
          : modelOverride || DEFAULT_MODELS[fallback.provider];
        try {
          const fallbackResult = await callProvider(
            fallback.provider,
            fallback.apiKey,
            systemPrompt,
            userPrompt,
            fallbackModel,
            maxTokens,
            temperature,
            conversationHistory
          );
          return await recordSuccess(fallbackResult);
        } catch (fallbackError: any) {
          // The fallback also failed: log its error row too and surface it.
          await recordError(fallbackModel, fallbackError);
          throw fallbackError;
        }
      }
    }

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
