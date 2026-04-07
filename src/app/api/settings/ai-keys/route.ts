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

  // Get coach's org
  const { data: coach } = await supabase
    .from('coaches')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!coach) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
  }

  // Read org settings via service role (settings may contain sensitive data)
  const service = await createServiceSupabase();
  const { data: org } = await service
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
    // Also report which env vars are set (without exposing values)
    envKeys: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
    },
  });
}

// POST — save an AI key for a provider (admin only)
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

  if (!apiKey || typeof apiKey !== 'string') {
    return NextResponse.json({ error: 'API key is required' }, { status: 400 });
  }

  // Get coach + verify admin role
  const { data: coach } = await supabase
    .from('coaches')
    .select('org_id, role')
    .eq('id', user.id)
    .single();

  if (!coach) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
  }

  if (!['admin', 'head_coach'].includes(coach.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Read current settings via service role
  const service = await createServiceSupabase();
  const { data: org } = await service
    .from('organizations')
    .select('settings')
    .eq('id', coach.org_id)
    .single();

  const settings = (org?.settings || {}) as Record<string, any>;
  const aiKeys = settings.ai_keys || {};

  // Update the key
  aiKeys[provider] = apiKey;

  const updatedSettings: Record<string, any> = {
    ...settings,
    ai_keys: aiKeys,
  };

  // Optionally set as active provider
  if (setActive !== false) {
    updatedSettings.ai_provider = provider;
  }

  const { error } = await service
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
