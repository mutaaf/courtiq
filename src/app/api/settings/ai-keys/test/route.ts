import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider } from '@/lib/ai/client';

const TEST_PROMPT = 'Say hello in one sentence.';

async function testAnthropic(apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 64,
    messages: [{ role: 'user', content: TEST_PROMPT }],
  });
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return text;
}

async function testOpenAI(apiKey: string): Promise<string> {
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 64,
    messages: [{ role: 'user', content: TEST_PROMPT }],
  });
  return response.choices[0]?.message?.content || '';
}

async function testGemini(apiKey: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent(TEST_PROMPT);
  return result.response.text();
}

// POST — test an AI provider connection
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { provider } = body as { provider: AIProvider };

  if (!provider || !['anthropic', 'openai', 'gemini'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  // Get coach's org via service role (bypasses RLS)
  const service = await createServiceSupabase();

  const { data: coach } = await service
    .from('coaches')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!coach) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
  }
  const { data: org } = await service
    .from('organizations')
    .select('settings')
    .eq('id', coach.org_id)
    .single();

  const settings = (org?.settings || {}) as Record<string, any>;
  const aiKeys = settings.ai_keys || {};

  const envKeyMap: Record<AIProvider, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };

  const apiKey = aiKeys[provider] || envKeyMap[provider];

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: `No API key configured for ${provider}`,
    }, { status: 400 });
  }

  try {
    const startTime = Date.now();

    let response: string;
    switch (provider) {
      case 'anthropic':
        response = await testAnthropic(apiKey);
        break;
      case 'openai':
        response = await testOpenAI(apiKey);
        break;
      case 'gemini':
        response = await testGemini(apiKey);
        break;
      default:
        return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
    }

    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      provider,
      response: response.slice(0, 200),
      latencyMs,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      provider,
      error: error.message || 'Connection test failed',
    }, { status: 400 });
  }
}
