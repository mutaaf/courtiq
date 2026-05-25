import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { parentReportSchema, type ParentReport } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const body = await request.json();
  const { teamId, playerId } = body;

  if (!teamId || !playerId) {
    return NextResponse.json({ error: 'teamId and playerId required' }, { status: 400 });
  }

  try {
    // Get coach org_id for AI provider resolution
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const context = await buildAIContext(teamId, admin);

    // Get player info
    const { data: player } = await admin
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Get recent observations
    const { data: observations } = await admin
      .from('observations')
      .select('category, sentiment, text, skill_id, created_at')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(30);

    // Get proficiency data
    const { data: proficiency } = await admin
      .from('player_skill_proficiency')
      .select('skill_id, proficiency_level, success_rate, trend')
      .eq('player_id', playerId);

    // Fetch the most recent prior parent report for continuity context (ticket 0016).
    // Wrapped in try/catch so any read failure degrades to a clean snapshot rather
    // than erroring — the continuity note is best-effort and never gates generation.
    let priorReport: import('@/lib/ai/schemas').ParentReport | null = null;
    try {
      const { data: priorPlans } = await admin
        .from('plans')
        .select('content_structured')
        .eq('player_id', playerId)
        .eq('type', 'parent_report')
        .order('created_at', { ascending: false })
        .limit(1);
      if (priorPlans?.[0]?.content_structured) {
        priorReport = priorPlans[0].content_structured as import('@/lib/ai/schemas').ParentReport;
      }
    } catch {
      // Degrade silently — snapshot report is still valuable without continuity
    }

    // Cross-season continuity (ticket 0034). If the coach has confirmed that this
    // player is the SAME player as a prior season (player.prior_player_id), thread
    // that prior player's most recent parent report as a "since last season" note.
    // Verify the prior player belongs to a team in the SAME org before reading
    // anything — a forged/cross-org link reads nothing. Wrapped in try/catch so a
    // read failure degrades to the single-season snapshot and never 500s, mirroring
    // the 0016 degrade-to-snapshot behavior above.
    let priorSeasonReport: import('@/lib/ai/schemas').ParentReport | null = null;
    const priorPlayerId = (player as { prior_player_id?: string | null }).prior_player_id;
    if (priorPlayerId) {
      try {
        // Resolve the prior player → its team → org_id, and only proceed if the
        // org matches the caller's org. Reading nothing cross-org is the security
        // boundary for the cross-season link.
        const { data: priorPlayer } = await admin
          .from('players')
          .select('id, team_id')
          .eq('id', priorPlayerId)
          .single();

        const priorTeamId = (priorPlayer as { team_id?: string | null } | null)?.team_id;
        if (priorTeamId) {
          const { data: priorTeam } = await admin
            .from('teams')
            .select('org_id')
            .eq('id', priorTeamId)
            .single();
          const priorOrgId = (priorTeam as { org_id?: string | null } | null)?.org_id;

          if (priorOrgId && priorOrgId === coach?.org_id) {
            const { data: priorSeasonPlans } = await admin
              .from('plans')
              .select('content_structured')
              .eq('player_id', priorPlayerId)
              .eq('type', 'parent_report')
              .order('created_at', { ascending: false })
              .limit(1);
            if (priorSeasonPlans?.[0]?.content_structured) {
              priorSeasonReport = priorSeasonPlans[0]
                .content_structured as import('@/lib/ai/schemas').ParentReport;
            }
          }
        }
      } catch {
        // Degrade silently to single-season — the cross-season note is best-effort.
        priorSeasonReport = null;
      }
    }

    const reportData = {
      observations: observations || [],
      proficiency: proficiency || [],
      seasonWeek: context.seasonWeek,
    };

    const prompt = PROMPT_REGISTRY.parentReport({
      ...context,
      playerName: player.name,
      reportData,
      priorReport,
      // Only the prior-season report's coach-authored narrative is threaded; the
      // prompt builder serializes just highlights / skill_progress / coach_note, so
      // no raw DB minor field reaches the model (ticket 0034 COPPA boundary).
      priorSeasonReport: priorSeasonReport
        ? {
            highlights: priorSeasonReport.highlights,
            skill_progress: priorSeasonReport.skill_progress,
            coach_note: priorSeasonReport.coach_note,
          }
        : null,
    });

    const result = await callAIWithJSON<ParentReport>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'generate_parent_report',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
      },
      admin
    );

    let validated;
    try {
      validated = parentReportSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Zod validation relaxed:', zodError);
      validated = result.parsed as ParentReport;
    }

    // Save as a plan
    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      player_id: playerId,
      ai_interaction_id: result.interactionId,
      type: 'parent_report',
      title: `Parent Report - ${player.name}`,
      content: JSON.stringify(validated),
      content_structured: validated,
      curriculum_week: context.seasonWeek,
    }).select().single();

    return NextResponse.json({ plan, content: validated, interactionId: result.interactionId });
  } catch (error: unknown) {
    return handleAIError(error, 'Parent report');
  }
}
