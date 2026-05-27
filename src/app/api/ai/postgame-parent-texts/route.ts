import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY, type ObservationInsightsParam } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import {
  postgameParentTextsSchema,
  type PostgameParentTexts,
} from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { canAccess, type Tier } from '@/lib/tier';

// ─── POST /api/ai/postgame-parent-texts ───────────────────────────────────────
// Ticket 0048 — coach-private one-tap post-game parent texts.
//
// Inputs (body): { sessionId }.
// 1. Auth → 401 when no user.
// 2. Resolve coach.org_id + organizations.tier; canAccess(tier, 'report_cards')
//    → 402 { upgrade: true, feature: 'report_cards' } on free (the same key
//    the parent report and the 0046 sideline sheet use — AGENTS.md rule 5;
//    LESSONS#0023: the feature prop / response key must equal the tier-key
//    string verbatim).
// 3. Session ownership: the session's team must belong to caller's org → 404
//    on cross-org.
// 4. Session must be a GAME: session.type === 'game' → 400 { error: 'not_a_game' }
//    on anything else (the analog for practice sessions is the 0046 sideline
//    cheat sheet on /home, not a per-parent text).
// 5. Below-threshold short-circuit: a too-cold game (< 6 observations in the
//    24h window either side of the session start) returns 200 { sheet: null }
//    and never calls AI — mirrors the 0046 sideline below-threshold pattern
//    so a cold just-finished game burns no quota.
// 6. Happy path: group recent observations by player, render the prompt, call
//    callAIWithJSON({ orgId }) so multi-provider failover (0012), quota
//    counting, and the 0035 quota-wall resume all apply unchanged, then
//    persist as a new `plans` row of type 'postgame_parent_texts' bound to
//    `session_id` (the same session_id binding the 0027 game_recap uses; both
//    artifacts coexist on the same session row by design).
//
// COPPA: the artifact is COACH-PRIVATE by construction. No companion token
// route is created here; no /share/postgame/<token>; the new plan type is not
// added to any public allow-list. First names only on the entries (the schema
// enforces this strictly), and the per-entry payload is a single 220-char
// text message sized for one SMS.

const RECENT_HOURS = 24;
const MIN_TOTAL_OBS = 6; // below this the game is too cold to write specific lines

type AdminClient = Awaited<ReturnType<typeof createServiceSupabase>>;

interface ObservationRow {
  player_id: string | null;
  category: string | null;
  sentiment: string | null;
  created_at: string;
  text?: string | null;
}

/** Derive a first name from `players.name` for the prompt + the artifact. */
function firstNameOf(fullName: string): string {
  return (fullName || '').trim().split(/\s+/)[0] || 'Player';
}

/**
 * Group observations by player into the same shape the parent-report prompt
 * already consumes (`ObservationInsightsParam`). Categories with > 0 needs-work
 * become `topNeedsWork`; with > 0 positives become `topStrengths`.
 */
function groupInsightsByPlayer(
  observations: ObservationRow[],
  playerIds: string[],
): Record<string, ObservationInsightsParam> {
  const out: Record<string, ObservationInsightsParam> = {};
  for (const pid of playerIds) {
    out[pid] = {
      totalObs: 0,
      // Post-game window is hours-not-days; the consumer of this field is the
      // prompt's per-player line ("light data this stretch") which only
      // depends on `totalObs === 0`. 1 keeps the shape valid.
      daysOfData: 1,
      topNeedsWork: [],
      topStrengths: [],
    };
  }
  const tally: Record<string, { needs: Record<string, number>; pos: Record<string, number> }> = {};
  for (const pid of playerIds) tally[pid] = { needs: {}, pos: {} };

  for (const o of observations) {
    if (!o.player_id || !o.category) continue;
    if (!tally[o.player_id]) continue;
    out[o.player_id].totalObs += 1;
    if (o.sentiment === 'needs-work') {
      tally[o.player_id].needs[o.category] = (tally[o.player_id].needs[o.category] ?? 0) + 1;
    } else if (o.sentiment === 'positive') {
      tally[o.player_id].pos[o.category] = (tally[o.player_id].pos[o.category] ?? 0) + 1;
    }
  }

  for (const pid of playerIds) {
    out[pid].topNeedsWork = Object.entries(tally[pid].needs)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }));
    out[pid].topStrengths = Object.entries(tally[pid].pos)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }));
  }

  return out;
}

async function fetchSessionObservations(
  teamId: string,
  sessionStart: string | null,
  admin: AdminClient,
) {
  // The window is 24h either side of the session start so a coach who logs
  // game observations the morning of OR right after the buzzer still gets
  // a non-cold sheet. Anchoring to "the last RECENT_HOURS" keeps the route
  // honest for tests (and matches the sideline sheet's recent-window
  // philosophy from 0046).
  const anchor = sessionStart ? new Date(sessionStart).getTime() : Date.now();
  const since = new Date(anchor - RECENT_HOURS * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from('observations')
    .select('player_id, category, sentiment, created_at, text')
    .eq('team_id', teamId)
    .gte('created_at', since)
    .limit(500);
  return (data ?? []) as ObservationRow[];
}

async function fetchActivePlayers(teamId: string, admin: AdminClient) {
  const { data } = await admin
    .from('players')
    .select('id, name, is_active')
    .eq('team_id', teamId)
    .eq('is_active', true);
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json().catch(() => ({}));
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  try {
    // ── tier gate (server-side, paired with <UpgradeGate> on the surface) ────
    const { data: coachRow } = await admin
      .from('coaches')
      .select('org_id, organizations(tier)')
      .eq('id', user.id)
      .single();

    const orgId = (coachRow as { org_id?: string | null } | null)?.org_id ?? undefined;
    const tier = (
      ((coachRow as { organizations?: { tier?: string } | null } | null)?.organizations?.tier) ||
      'free'
    ) as Tier;

    if (!canAccess(tier, 'report_cards')) {
      // Per LESSONS#0023 — feature key MUST equal the tier-key string verbatim
      // so the client `<UpgradeGate feature="report_cards">` and the 402
      // response line up on the same unlock path.
      return NextResponse.json(
        {
          error:
            'Post-game parent texts are a Coach feature. Upgrade to turn each game into one short text per kid.',
          upgrade: true,
          feature: 'report_cards',
        },
        { status: 402 },
      );
    }

    // ── session ownership + game-only gate ────────────────────────────────
    const { data: session } = await admin
      .from('sessions')
      .select('id, team_id, type, date, started_at, opponent')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const sessionRow = session as {
      id: string;
      team_id: string;
      type?: string | null;
      date?: string | null;
      started_at?: string | null;
      opponent?: string | null;
    };

    const { data: team } = await admin
      .from('teams')
      .select('id, org_id')
      .eq('id', sessionRow.team_id)
      .single();

    if (!team || (team as { org_id?: string | null }).org_id !== orgId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (sessionRow.type !== 'game') {
      // Game-only by design — the practice/training analog is the 0046
      // sideline cheat sheet on /home, not a per-parent text. The string
      // contract `not_a_game` is the client-facing signal so a session page
      // wired across multiple session types can hide the card cleanly.
      return NextResponse.json({ error: 'not_a_game' }, { status: 400 });
    }

    const teamId = sessionRow.team_id;

    // ── below-threshold short-circuit ──────────────────────────────────────
    // A cold game (no observations yet) does not get a fabricated sheet.
    // Better to render nothing than to spend quota on lines the coach cannot
    // back up.
    const sessionAnchor = sessionRow.started_at || sessionRow.date || null;
    const [players, observations] = await Promise.all([
      fetchActivePlayers(teamId, admin),
      fetchSessionObservations(teamId, sessionAnchor, admin),
    ]);

    if (observations.length < MIN_TOTAL_OBS) {
      return NextResponse.json({ sheet: null });
    }

    if (players.length === 0) {
      return NextResponse.json({ sheet: null });
    }

    // ── group + render prompt + call AI ────────────────────────────────────
    const promptPlayers = players.map((p) => ({
      id: p.id,
      first_name: firstNameOf(p.name),
    }));

    const observationInsightsByPlayer = groupInsightsByPlayer(
      observations,
      players.map((p) => p.id),
    );

    const context = await buildAIContext(teamId, admin);

    const prompt = PROMPT_REGISTRY.postgameParentTexts({
      ...context,
      team: { id: teamId, name: context.teamName },
      players: promptPlayers,
      sessionMeta: {
        id: sessionRow.id,
        started_at: sessionRow.started_at || sessionRow.date || null,
        opponent_name: sessionRow.opponent || null,
      },
      observationInsightsByPlayer,
    });

    const result = await callAIWithJSON<PostgameParentTexts>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: orgId || '',
        maxTokens: 1500,
        temperature: 0.6,
      },
      admin,
    );

    let validated: PostgameParentTexts;
    try {
      validated = postgameParentTextsSchema.parse(result.parsed);
    } catch (zodError) {
      // Same degrade-rather-than-500 posture as 0040 / 0046: schema is the
      // contract, but a model that returns a slightly extra key shouldn't
      // crash the call. The schema test pins the strict shape for the served
      // happy path.
      console.warn('Postgame parent texts Zod validation relaxed:', zodError);
      validated = result.parsed as PostgameParentTexts;
    }

    const { data: planRow } = await admin
      .from('plans')
      .insert({
        team_id: teamId,
        coach_id: user.id,
        session_id: sessionRow.id,
        ai_interaction_id: result.interactionId,
        type: 'postgame_parent_texts',
        title: `Parent texts — ${context.teamName ?? 'this team'}`,
        content: JSON.stringify(validated),
        content_structured: validated,
        curriculum_week: context.seasonWeek,
      })
      .select()
      .single();

    const planId = (planRow as { id?: string } | null)?.id ?? null;

    return NextResponse.json({
      planId,
      content_structured: validated,
      interactionId: result.interactionId,
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Post-game parent texts');
  }
}
