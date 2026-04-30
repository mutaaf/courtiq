import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { handleAIError } from '@/lib/ai/error';
import { runSegmentation } from '@/lib/ai/segment-runner';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { transcript, teamId, sessionId } = body;

  if (!transcript || !teamId) {
    return NextResponse.json({ error: 'transcript and teamId required' }, { status: 400 });
  }

  // Check if any AI provider is configured
  const admin = await createServiceSupabase();
  const { data: coach } = await admin.from('coaches').select('org_id').eq('id', user.id).single();
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
    const result = await runSegmentation({
      transcript,
      teamId,
      coachId: user.id,
      sessionId: sessionId ?? null,
      orgId: coach?.org_id ?? null,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return handleAIError(error, 'Segment');
  }
}
