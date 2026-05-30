/**
 * Ticket 0059 — POST /api/player-handoffs/generate-preview.
 *
 * The source coach's preview endpoint. The /home handoff sheet POSTs this on
 * open with { teamId, playerIds }. For each player it:
 *
 *   1. Verifies the team belongs to the caller (404 otherwise).
 *   2. Verifies each player belongs to the team (404 otherwise — never leak
 *      a player from another team).
 *   3. Cold-start guard: any player with fewer than MIN_OBSERVATIONS_FOR_HANDOFF
 *      observations this season is SILENTLY dropped from `previews` and
 *      reported in `dropped` with reason `insufficient_observations`.
 *   4. Calls `callAIWithJSON` per player with the new `playerHandoffCard`
 *      prompt (one AI call per eligible player; the quota / provider routing
 *      goes through the existing multi-provider client).
 *
 * Tier gate (server-side, paired with <UpgradeGate feature='feature_player_handoff'/>):
 *   feature_player_handoff is registered in `coach`, `pro_coach`, `organization`.
 *   A free coach gets 402 with { upgrade: true, feature: 'feature_player_handoff' }.
 *   This is the SOURCE coach path; the receiver routes are universal.
 *
 * AGENTS.md rule 4: every AI call goes through `callAI()` / `callAIWithJSON()`.
 * LESSONS#0023: prompt voice is positive in the prompt module, not enumerated
 * here. LESSONS#0039: never trust a client-supplied org_id — resolve from the
 * caller server-side.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { playerHandoffCardSchema, type PlayerHandoffCard } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { canAccess, type Tier } from '@/lib/tier';
import {
  buildStructuredHandoffInputs,
  firstNameOf,
  MIN_OBSERVATIONS_FOR_HANDOFF,
} from '@/lib/player-handoff-utils';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const body = await request.json().catch(() => ({}));
  const teamId = typeof body?.teamId === 'string' ? body.teamId : null;
  const playerIds: string[] = Array.isArray(body?.playerIds)
    ? body.playerIds.filter((s: unknown): s is string => typeof s === 'string')
    : [];

  if (!teamId || playerIds.length === 0) {
    return NextResponse.json({ error: 'teamId and playerIds required' }, { status: 400 });
  }

  try {
    // ── tier gate (server-side, paired with <UpgradeGate>) ─────────────────
    const { data: coachRow } = await admin
      .from('coaches')
      .select('org_id, full_name, organizations(tier)')
      .eq('id', user.id)
      .single();

    const orgId = (coachRow as { org_id?: string | null } | null)?.org_id ?? null;
    const tier = (
      ((coachRow as { organizations?: { tier?: string } | null } | null)?.organizations?.tier) ||
      'free'
    ) as Tier;

    if (!canAccess(tier, 'feature_player_handoff')) {
      return NextResponse.json(
        {
          error:
            'Handing off your players to next season\'s coach is a Coach plan feature. Upgrade to send the cards.',
          upgrade: true,
          feature: 'feature_player_handoff',
        },
        { status: 402 },
      );
    }

    // ── team ownership ────────────────────────────────────────────────────
    const { data: teamCoach } = await admin
      .from('team_coaches')
      .select('coach_id')
      .eq('team_id', teamId)
      .eq('coach_id', user.id)
      .maybeSingle();

    if (!teamCoach) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const { data: team } = await admin
      .from('teams')
      .select('id, name, age_group, org_id, season, sports(name)')
      .eq('id', teamId)
      .single();

    if (!team || (team as { org_id?: string | null }).org_id !== orgId) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const sportName =
      ((team as { sports?: { name?: string } | null }).sports?.name) || 'basketball';
    const ageGroup = (team as { age_group?: string }).age_group || '';
    const seasonLabel =
      (team as { season?: string | null }).season || `${new Date().getFullYear()}`;

    // ── per-player processing ──────────────────────────────────────────────
    const previews: Array<{ playerId: string; playerFirstName: string; cardBody: string }> = [];
    const dropped: Array<{ playerId: string; reason: 'insufficient_observations' | 'not_in_team' }> = [];

    for (const playerId of playerIds) {
      const { data: player } = await admin
        .from('players')
        .select('id, team_id, name, age_group, jersey_number')
        .eq('id', playerId)
        .single();

      if (!player || (player as { team_id?: string }).team_id !== teamId) {
        // Any miss → 404 the whole call. The ticket says "404 on any miss"
        // so we surface it immediately rather than silently dropping.
        return NextResponse.json({ error: 'Player not found' }, { status: 404 });
      }

      const { data: observations } = await admin
        .from('observations')
        .select('category, sentiment, text')
        .eq('player_id', playerId);

      const obsList = observations || [];
      if (obsList.length < MIN_OBSERVATIONS_FOR_HANDOFF) {
        dropped.push({ playerId, reason: 'insufficient_observations' });
        continue;
      }

      const inputs = buildStructuredHandoffInputs(
        { id: player.id, name: player.name },
        obsList,
        [],
      );

      const playerFirstName = firstNameOf(player.name);

      const prompt = PROMPT_REGISTRY.playerHandoffCard({
        playerFirstName,
        ageGroup,
        sportName,
        topStrengths: inputs.topStrengths,
        topGrowthArea: inputs.topGrowthArea,
        signatureDrillNames: inputs.signatureDrillNames,
        coachAuthoredHighlights: inputs.coachAuthoredHighlights,
        seasonLabel,
      });

      const result = await callAIWithJSON<PlayerHandoffCard>(
        {
          coachId: user.id,
          teamId,
          interactionType: 'generate_player_handoff_card',
          systemPrompt: prompt.system,
          userPrompt: prompt.user,
          orgId: orgId || '',
        },
        admin,
      );

      let validated: PlayerHandoffCard;
      try {
        validated = playerHandoffCardSchema.parse(result.parsed);
      } catch {
        // Provider returned a slightly off shape; coerce so the preview still
        // lands. The commit route re-validates length + strips contact info
        // before persisting.
        validated = { card_body: String((result.parsed as { card_body?: unknown })?.card_body ?? '') };
      }

      previews.push({
        playerId,
        playerFirstName,
        cardBody: validated.card_body,
      });
    }

    return NextResponse.json({ previews, dropped });
  } catch (error: unknown) {
    return handleAIError(error, 'Player handoff preview');
  }
}
