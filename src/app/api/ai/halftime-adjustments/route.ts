import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { handleAIError } from '@/lib/ai/error';
import type { HalftimeAdjustments } from '@/lib/halftime-utils';
import {
  buildHalftimeSummaryLines,
  buildCategoryBreakdown,
  classifyMomentum,
  getMomentumLabel,
} from '@/lib/halftime-utils';

export type { HalftimeAdjustments };

export interface HalftimeAdjustmentsResult extends HalftimeAdjustments {
  sessionId: string;
  observationCount: number;
}

const GAME_TYPES = ['game', 'scrimmage', 'tournament'];

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId, sessionId } = body;

  if (!teamId || !sessionId) {
    return NextResponse.json({ error: 'teamId and sessionId required' }, { status: 400 });
  }

  try {
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    // Fetch session details
    const { data: session } = await admin
      .from('sessions')
      .select('id, type, date, opponent, result')
      .eq('id', sessionId)
      .eq('team_id', teamId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (!GAME_TYPES.includes(session.type)) {
      return NextResponse.json(
        { error: 'Half-time adjustments are only available for game, scrimmage, or tournament sessions' },
        { status: 400 }
      );
    }

    // Fetch team context
    const { data: team } = await admin
      .from('teams')
      .select('name, age_group, sports(name)')
      .eq('id', teamId)
      .single();

    // Fetch all observations for this session so far
    const { data: obsRows } = await admin
      .from('observations')
      .select('player_id, category, sentiment, text, players:player_id(name)')
      .eq('session_id', sessionId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });

    const allObs = (obsRows || []).map((o: any) => ({
      player_id: o.player_id,
      player_name: (o.players as any)?.name,
      sentiment: o.sentiment,
      category: o.category,
      text: o.text,
    }));

    if (allObs.length < 3) {
      return NextResponse.json(
        { error: 'Not enough observations yet. Capture at least 3 before generating adjustments.' },
        { status: 422 }
      );
    }

    const sportName = (team?.sports as any)?.name || 'basketball';
    const momentum = classifyMomentum(allObs);
    const momentumLabel = getMomentumLabel(momentum);

    const playerSummaryLines = buildHalftimeSummaryLines(allObs);
    const categoryBreakdown = buildCategoryBreakdown(allObs);

    const sessionTypeLabel: Record<string, string> = {
      game: 'Game',
      scrimmage: 'Scrimmage',
      tournament: 'Tournament game',
    };
    const sessionDate = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    const positiveCount = allObs.filter((o) => o.sentiment === 'positive').length;
    const needsWorkCount = allObs.filter((o) => o.sentiment === 'needs-work').length;

    const systemPrompt = [
      `You are SportsIQ's AI coaching assistant for youth ${sportName}.`,
      'You help volunteer coaches make quick, actionable half-time adjustments based on their observations.',
      'Be specific, practical, and concise. Keep advice appropriate for youth athletes.',
      'Focus on 2–3 things — coaches cannot process more than that at half-time.',
    ].join('\n');

    const userPrompt = [
      `=== HALF-TIME ADJUSTMENTS REQUEST ===`,
      `${sessionTypeLabel[session.type] || 'Game'} on ${sessionDate}`,
      `Team: ${team?.name || 'Team'} | Sport: ${sportName} | Age Group: ${team?.age_group || 'Youth'}`,
      session.opponent ? `Opponent: ${session.opponent}` : null,
      '',
      `=== FIRST HALF SUMMARY ===`,
      `Total observations: ${allObs.length} (${positiveCount} positive, ${needsWorkCount} needs-work)`,
      `Overall momentum: ${momentumLabel}`,
      '',
      categoryBreakdown ? `=== SKILL CATEGORY BREAKDOWN ===\n${categoryBreakdown}` : null,
      '',
      playerSummaryLines.length > 0
        ? `=== PLAYER PERFORMANCE (first half) ===\n${playerSummaryLines.join('\n')}`
        : null,
      '',
      `=== GENERATE HALF-TIME ADJUSTMENTS ===`,
      'Produce a concise, high-impact half-time adjustment plan. Output JSON:',
      '{',
      '  "momentum": "building"|"level"|"trailing",',
      '  "whats_working": ["string", "string"],',
      '  "what_needs_fixing": ["string", "string"],',
      '  "adjustments": [',
      '    { "focus": "string", "action": "string", "priority": "immediate"|"secondary" }',
      '  ],',
      '  "player_spotlight": { "name": "string", "note": "string" } | null,',
      '  "halftime_message": "string"',
      '}',
      '',
      'Rules:',
      '- momentum: set based on observation data (' + momentumLabel + ' detected)',
      '- whats_working: 2–3 things going well (based on positive observations)',
      '- what_needs_fixing: 2–3 specific areas that need correction',
      '- adjustments: 2–3 tactical changes, first is "immediate" priority',
      '- player_spotlight: one player to feature more in second half (or null if no standout)',
      '- halftime_message: one motivational sentence for the team',
    ]
      .filter((l) => l !== null)
      .join('\n');

    const result = await callAIWithJSON<HalftimeAdjustments>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt,
        userPrompt,
        orgId: coach?.org_id || '',
        maxTokens: 800,
        temperature: 0.5,
      },
      admin
    );

    const adjustments = result.parsed;

    // Ensure arrays exist
    if (!adjustments.whats_working) adjustments.whats_working = [];
    if (!adjustments.what_needs_fixing) adjustments.what_needs_fixing = [];
    if (!adjustments.adjustments) adjustments.adjustments = [];
    if (!adjustments.momentum) adjustments.momentum = momentum;

    return NextResponse.json({
      adjustments,
      interactionId: result.interactionId,
      stats: {
        observationCount: allObs.length,
        positiveCount,
        needsWorkCount,
        momentumDetected: momentum,
      },
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Half-time adjustments');
  }
}
