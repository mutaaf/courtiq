import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { parentReportSchema, type ParentReport } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import {
  isThinSecondPlusReport,
  renderThinWeekFallback,
  containsBannedToken,
} from '@/lib/thin-week-utils';
import {
  extractVoiceAnchors,
  type CoachPlanRow,
  type CoachingSignature,
} from '@/lib/coaching-signature-utils';

/**
 * Ticket 0070 — bound the cross-team prior-report read at 40 rows. The
 * voice-anchor extractor is O(n) on this input so the bound also caps the
 * extractor's work for a long-tenured coach (200+ prior reports). 40 rows is
 * enough to surface stable recurring phrasings without enlarging the read
 * surface beyond what the AI-cost tier-gating already pays for.
 */
const COACH_PRIOR_PARENT_REPORTS_LIMIT = 40;

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

    // Fetch the most recent prior parent reports for continuity context
    // (ticket 0016) AND for the thin-week safety net (ticket 0066).
    //
    // The select carries an explicit allow-list per LESSONS#0036 — adding
    // `id, created_at` here is what the 0066 thin-week branch keys off
    // (artifact count = priorPlans.length + 1; daysSinceLastReport derived
    // from the most-recent created_at). We DROP the .limit(1) so the helper
    // can count prior artifacts WITHOUT a second from() call (LESSONS#0049 —
    // a new from() cascades into every sibling mock queue).
    //
    // Wrapped in try/catch so any read failure degrades to a clean snapshot
    // rather than erroring — the continuity note is best-effort and never
    // gates generation.
    let priorReport: import('@/lib/ai/schemas').ParentReport | null = null;
    let priorReportCreatedAt: string | null = null;
    let priorArtifactCount = 0;
    try {
      const { data: priorPlans } = await admin
        .from('plans')
        .select('id, content_structured, created_at')
        .eq('player_id', playerId)
        .eq('type', 'parent_report')
        .order('created_at', { ascending: false });
      if (priorPlans && Array.isArray(priorPlans)) {
        priorArtifactCount = priorPlans.length;
        if (priorPlans[0]?.content_structured) {
          priorReport = priorPlans[0].content_structured as import('@/lib/ai/schemas').ParentReport;
          const createdAt = (priorPlans[0] as { created_at?: string | null }).created_at;
          priorReportCreatedAt = typeof createdAt === 'string' ? createdAt : null;
        }
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

    // Ticket 0070 — read the coach's OWN prior parent_report plans across
    // every team they have ever coached (scoped by `coach_id`, NOT `team_id`)
    // so the voice-anchor extractor sees the full history. The 40-row LIMIT
    // bounds the read for a long-tenured coach without changing the bounded
    // cost surface this AI route already pays for. Wrapped in try/catch so
    // a read failure degrades to today's behavior (best-effort posture per
    // LESSONS#0036) — the parent-report still generates, just without the
    // soft-preference voice block.
    //
    // The .select() is an explicit allow-list (per LESSONS#0036): only the
    // persisted coach-authored `content_structured` is read. No `players`
    // row field, no `observations`, no `parent_*` or `date_of_birth` ever
    // touches this query — the COPPA boundary is the same as the 0037
    // plan-rows-in / signature-out contract.
    //
    // Note (per LESSONS#0112): the EXISTING `from('plans')` reads in this
    // route are scoped by `player_id` (0016) and `prior_player_id` (0034) and
    // cannot be widened to subsume the coach-scoped read (different filter
    // family). A new `from()` call is required; every sibling test that
    // mocks the chain queue was extended in the same PR (LESSONS#0049 /
    // #0092 / #0100 / #0110).
    let coachingSignature: CoachingSignature | null = null;
    try {
      const { data: coachPriorReports } = await admin
        .from('plans')
        .select('content_structured')
        .eq('coach_id', user.id)
        .eq('type', 'parent_report')
        .order('created_at', { ascending: false })
        .limit(COACH_PRIOR_PARENT_REPORTS_LIMIT);
      const priorParentReports: CoachPlanRow[] = Array.isArray(coachPriorReports)
        ? (coachPriorReports as CoachPlanRow[])
        : [];
      // The parentReport prompt consumes only `voice_anchors` from the
      // signature (not top_skills / recurring_drills / typical_session_minutes),
      // so we build a minimal signature object with just the voice anchors.
      // This sidesteps the buildCoachingSignature gate on MIN_PLANS_FOR_SIGNATURE
      // (which counts practice plans, not parent reports) — a coach can have
      // shipped 60 parent reports without ever having created a practice plan
      // and still deserve the voice signal.
      const voiceAnchors = extractVoiceAnchors(priorParentReports);
      // Surface a signature object whose only meaningful field is the voice
      // anchors. The 0037 fields are present-but-empty defaults so the type
      // contract is honored; the parentReport prompt branches on
      // `voice_anchors.length > 0` and ignores the others.
      coachingSignature = voiceAnchors.length > 0
        ? {
            top_skills: [],
            recurring_drills: [],
            typical_session_minutes: 0,
            voice_anchors: voiceAnchors,
          }
        : null;
    } catch {
      // Degrade silently — the parent-report still ships without the soft
      // voice preference. LESSONS#0036 best-effort posture.
      coachingSignature = null;
    }

    const reportData = {
      observations: observations || [],
      proficiency: proficiency || [],
      seasonWeek: context.seasonWeek,
    };

    // Ticket 0066 — thin-week detection. The artifact count is "what this
    // generation will be" so the first-ever report (no prior plans) is
    // artifactCount = 1, which the helper correctly maps to false.
    // newObservationCount counts observations whose created_at is newer than
    // the previous report's; absent a prior, every observation counts (which
    // also can't flip the helper true because artifactCount stays 1).
    // daysSinceLastReport falls to Infinity when there is no prior or no
    // created_at on the prior row — keeps the helper false and the prompt
    // byte-identical for the pre-0066 path.
    const artifactCount = priorArtifactCount + 1;
    const priorMs = priorReportCreatedAt ? Date.parse(priorReportCreatedAt) : NaN;
    const newObservationCount = !Number.isNaN(priorMs)
      ? (observations || []).filter((o: { created_at?: string | null }) => {
          const ts = o?.created_at ? Date.parse(o.created_at) : NaN;
          return !Number.isNaN(ts) && ts >= priorMs;
        }).length
      : (observations || []).length;
    const daysSinceLastReport = !Number.isNaN(priorMs)
      ? Math.floor((Date.now() - priorMs) / (24 * 60 * 60 * 1000))
      : Number.POSITIVE_INFINITY;

    const isThinWeek = isThinSecondPlusReport({
      artifactCount,
      newObservationCount,
      daysSinceLastReport,
    });

    // Derive the previous commitments from the existing parent-report shape
    // — no new persisted field, no new migration. Prefer the previous
    // report's skill_progress[].skill_name (the focus areas the report
    // already named); fall back to highlights[] if skill_progress is thin;
    // final fallback to the coach_note as a single quoted commitment.
    const previousCommitments: string[] = (() => {
      if (!priorReport) return [];
      const fromSkillProgress = Array.isArray(priorReport.skill_progress)
        ? priorReport.skill_progress
            .map((s) => (s && typeof s === 'object' ? (s as { skill_name?: string }).skill_name : null))
            .filter((s): s is string => typeof s === 'string' && s.length > 0)
        : [];
      if (fromSkillProgress.length > 0) return fromSkillProgress.slice(0, 3);
      const fromHighlights = Array.isArray(priorReport.highlights)
        ? priorReport.highlights.filter((s): s is string => typeof s === 'string' && s.length > 0)
        : [];
      if (fromHighlights.length > 0) return fromHighlights.slice(0, 3);
      if (typeof priorReport.coach_note === 'string' && priorReport.coach_note.length > 0) {
        return [priorReport.coach_note];
      }
      return [];
    })();

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
      // Ticket 0066 — only when isThinWeek; otherwise byte-identical to the
      // post-0034 prompt.
      isThinWeek,
      previousCommitments: isThinWeek ? previousCommitments : undefined,
      // Ticket 0070 — soft-preference voice signal. When absent (or its
      // voice_anchors is []) the prompt body is byte-identical to today's
      // post-0066 behavior (LESSONS#0103). When present and non-empty, the
      // system prompt gains a "lean on" block naming the coach's recurring
      // phrasings on a single line joined by ` / `.
      coachingSignature,
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

    // Ticket 0066 — POST-VALIDATE the AI's rendered output against the
    // banned-token list. If the model emitted a banned word despite the
    // positive prompt instruction, fall back to the structured-template
    // rendering (no second AI call — the fallback path is pure).
    let usedThinWeekFallback = false;
    if (isThinWeek) {
      const rendered = JSON.stringify(validated);
      if (containsBannedToken(rendered)) {
        usedThinWeekFallback = true;
        const playerFirstName = (player.name || '').split(/\s+/)[0] || player.name || 'Your player';
        const carryForwardObservations = (observations || [])
          .filter((o: { text?: string | null; sentiment?: string | null }) =>
            typeof o?.text === 'string' && o.text.length > 0,
          )
          .slice(0, 2)
          .map((o: { text?: string | null }) => String(o.text));
        const upcomingFocus = previousCommitments[0] || 'how the next practice goes';
        const fallbackParagraph = renderThinWeekFallback({
          playerFirstName,
          previousCommitments,
          carryForwardObservations,
          upcomingFocus,
        });
        // Render a structurally-valid parentReport object using the template
        // text as the coach_note. The route preserves the existing schema
        // (no new field on the public response) and replaces only the
        // free-form narrative portions.
        validated = {
          player_name: player.name,
          greeting: fallbackParagraph,
          highlights: carryForwardObservations.length > 0 ? carryForwardObservations : ['Lighter week — see note.'],
          skill_progress: previousCommitments.slice(0, 3).map((c) => ({
            skill_name: c,
            level: 'Practicing',
            narrative: 'Carrying this forward from last time.',
          })),
          encouragement: 'Keep showing up.',
          coach_note: fallbackParagraph,
          since_last_report: null,
        };

        // Log the fallback marker on the ai_interactions row so the loop
        // can revisit the prompt if the fallback rate climbs. Best-effort
        // — never gate the response on the log write.
        try {
          await admin
            .from('ai_interactions')
            .update({ prompt_context: { thin_week_fallback: true } })
            .eq('id', result.interactionId);
        } catch {
          // Logging is best-effort; never gate generation on the log write.
        }
      }
    }
    void usedThinWeekFallback;

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
