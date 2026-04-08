import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import type { AIProvider } from '@/lib/ai/client';

function maskKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

// GET — return masked keys + active provider
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const { data: coach } = await admin
    .from('coaches')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!coach) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
  }

  const { data: org } = await admin
    .from('organizations')
    .select('settings')
    .eq('id', coach.org_id)
    .single();

  const settings = (org?.settings || {}) as Record<string, any>;
  const aiKeys = settings.ai_keys || {};
  const activeProvider = settings.ai_provider || null;

  return NextResponse.json({
    provider: activeProvider,
    keys: {
      anthropic: aiKeys.anthropic ? maskKey(aiKeys.anthropic) : null,
      openai: aiKeys.openai ? maskKey(aiKeys.openai) : null,
      gemini: aiKeys.gemini ? maskKey(aiKeys.gemini) : null,
    },
    envKeys: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
    },
  });
}

// POST — save an AI key for a provider
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { provider, apiKey, setActive } = body as {
    provider: AIProvider;
    apiKey: string;
    setActive?: boolean;
  };

  if (!provider || !['anthropic', 'openai', 'gemini'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 5) {
    return NextResponse.json({ error: 'A valid API key is required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  const { data: coach } = await admin
    .from('coaches')
    .select('org_id, role')
    .eq('id', user.id)
    .single();

  if (!coach) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
  }

  // Read current settings
  const { data: org } = await admin
    .from('organizations')
    .select('settings')
    .eq('id', coach.org_id)
    .single();

  const settings = (org?.settings || {}) as Record<string, any>;
  const aiKeys = settings.ai_keys || {};

  aiKeys[provider] = apiKey.trim();

  const updatedSettings: Record<string, any> = {
    ...settings,
    ai_keys: aiKeys,
  };

  if (setActive !== false) {
    updatedSettings.ai_provider = provider;
  }

  const { error } = await admin
    .from('organizations')
    .update({ settings: updatedSettings })
    .eq('id', coach.org_id);

  if (error) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    provider,
    active: updatedSettings.ai_provider,
  });
}
