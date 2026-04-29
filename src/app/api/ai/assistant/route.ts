import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { buildAIContext } from '@/lib/ai/context-builder';
import type { ConversationMessage } from '@/lib/ai/client';
import { handleAIError } from '@/lib/ai/error';
import { requireAIAccess } from '@/lib/ai/guard';

type AssistantResponseType = 'plan' | 'drill' | 'report' | 'analysis' | 'general';

interface AssistantResponse {
  message: string;
  type: AssistantResponseType;
  structured_data?: Record<string, unknown>;
  suggestions: string[];
}

export async function POST(request: Request) {
  const _guard = await requireAIAccess('assistant');
  if ('response' in _guard) return _guard.response;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const body = await request.json();
  const { message, teamId, history } = body;

  if (!message || !teamId) {
    return NextResponse.json({ error: 'message and teamId required' }, { status: 400 });
  }

  // Validate and cap conversation history to last 10 messages (5 turns)
  const conversationHistory: ConversationMessage[] = Array.isArray(history)
    ? history
        .filter(
          (m: unknown) =>
            m !== null &&
            typeof m === 'object' &&
            'role' in (m as object) &&
            'content' in (m as object) &&
            ((m as ConversationMessage).role === 'user' || (m as ConversationMessage).role === 'assistant') &&
            typeof (m as ConversationMessage).content === 'string'
        )
        .slice(-10)
    : [];

  try {
    // Get coach org_id for AI provider resolution
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const context = await buildAIContext(teamId, admin);

    // Get recent observations for context
    const { data: recentObservations } = await admin
      .from('observations')
      .select('player_id, category, sentiment, text, skill_id, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(20);

    // Get roster with proficiency
    const { data: players } = await admin
      .from('players')
      .select('id, name, position, jersey_number')
      .eq('team_id', teamId)
      .eq('is_active', true);

    const systemPrompt = [
      `You are SportsIQ's AI coaching assistant for youth ${context.sportName}.`,
      'You help volunteer coaches with:',
      '- Generating practice plans and game day preparations',
      '- Creating age-appropriate drills',
      '- Analyzing player progress and providing insights',
      '- Writing parent-friendly progress reports',
      '- Answering coaching strategy questions',
      '',
      'You have access to the team\'s roster, curriculum skills, and observation history.',
      'Always be encouraging, practical, and age-appropriate in your recommendations.',
      '',
      `Team: ${context.teamName}`,
      `Age group: ${context.ageGroup}`,
      `Season week: ${context.seasonWeek}`,
      `Player count: ${context.playerCount}`,
      context.roster.length > 0
        ? `Roster: ${context.roster.map(p => `${p.name} (#${p.jersey_number || '?'}, ${p.position || 'N/A'})`).join(', ')}`
        : '',
      context.skills.length > 0
        ? `Curriculum skills: ${context.skills.map(s => `${s.name} (${s.category})`).join(', ')}`
        : '',
      recentObservations && recentObservations.length > 0
        ? `Recent observations (last ${recentObservations.length}):\n${recentObservations.map(o => `- [${o.sentiment}] ${o.text}`).slice(0, 10).join('\n')}`
        : '',
      '',
      'When generating structured content (plans, drills, reports), include it in the structured_data field.',
      'For general advice, respond conversationally with type "general".',
      '',
      'Respond with JSON:',
      '{',
      '  "message": "your conversational response",',
      '  "type": "plan" | "drill" | "report" | "analysis" | "general",',
      '  "structured_data": { ... },',
      '  "suggestions": ["follow-up question 1", "follow-up question 2"]',
      '}',
    ].filter(Boolean).join('\n');

    const result = await callAIWithJSON<AssistantResponse>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt,
        userPrompt: message,
        orgId: coach?.org_id || '',
        conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
      },
      admin
    );

    let content: AssistantResponse;
    try {
      // Validate basic structure
      content = result.parsed;
      if (!content.message) content.message = 'I generated something for you.';
      if (!content.type) content.type = 'general';
      if (!content.suggestions) content.suggestions = [];
    } catch {
      content = {
        message: typeof result.parsed === 'string' ? result.parsed : JSON.stringify(result.parsed),
        type: 'general',
        suggestions: [],
      };
    }

    return NextResponse.json({
      response: content.message,
      type: content.type,
      structured_data: content.structured_data || null,
      suggestions: content.suggestions || [],
      interactionId: result.interactionId,
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Assistant');
  }
}
