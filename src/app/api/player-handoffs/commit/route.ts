/**
 * Ticket 0059 — POST /api/player-handoffs/commit.
 *
 * The source coach taps "Send to program" after reviewing the previews. This
 * route persists ONE `player_handoffs` row per checked player. The route is
 * idempotent at (source_coach_id, source_player_id, source_team_id) by the
 * migration's UNIQUE constraint — a second commit returns the existing rows
 * rather than minting duplicates.
 *
 * Defense in depth:
 *   - Auth → 401 before any DB read.
 *   - Team ownership via team_coaches join (LESSONS#0057 — never check via
 *     teams.coach_id, which does not exist on this schema).
 *   - Every cardBody is length-bounded (<= 1000 chars per the schema) and
 *     stripped of planted email / URL / phone via the SHARED helper
 *     `stripContactInfo` from `src/lib/parent-reply-utils.ts` (LESSONS#0056
 *     family — server is the only honest authority on user-supplied prose).
 *   - The tier gate is checked again here so a free coach who somehow POSTs
 *     directly (bypassing the UI gate) still 402s.
 *
 * Returns `{ committed: Array<{ playerId, handoffId }> }`.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { stripContactInfo } from '@/lib/parent-reply-utils';
import { canAccess, type Tier } from '@/lib/tier';

const MAX_CARD_BODY = 1000;

interface PreviewIn {
  playerId: string;
  cardBody: string;
  aiProvider?: string;
}

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
  const previews: PreviewIn[] = Array.isArray(body?.previews)
    ? (body.previews as PreviewIn[]).filter(
        (p): p is PreviewIn =>
          !!p && typeof p.playerId === 'string' && typeof p.cardBody === 'string',
      )
    : [];

  if (!teamId || playerIds.length === 0 || previews.length === 0) {
    return NextResponse.json(
      { error: 'teamId, playerIds, and previews required' },
      { status: 400 },
    );
  }

  try {
    // ── tier gate (defense in depth) ──────────────────────────────────────
    const { data: coachRow } = await admin
      .from('coaches')
      .select('org_id, organizations(tier)')
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
      .select('id, org_id, season')
      .eq('id', teamId)
      .single();

    if (!team || !(team as { org_id?: string }).org_id) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const seasonLabel =
      (team as { season?: string | null }).season || `${new Date().getFullYear()}`;
    const finalOrgId = (team as { org_id: string }).org_id;
    if (orgId && finalOrgId !== orgId) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // ── per-player commit (idempotent reuse on conflict) ──────────────────
    const committed: Array<{ playerId: string; handoffId: string }> = [];
    const previewByPlayer = new Map(previews.map((p) => [p.playerId, p]));

    for (const playerId of playerIds) {
      const preview = previewByPlayer.get(playerId);
      if (!preview) continue;

      // Server re-validation: length-bound + strip planted contact info.
      const trimmed = preview.cardBody.trim().slice(0, MAX_CARD_BODY);
      const cardBody = stripContactInfo(trimmed);

      // Verify the player actually belongs to this team — never insert a
      // row pointing at a foreign player even if the client lies.
      const { data: player } = await admin
        .from('players')
        .select('id, team_id')
        .eq('id', playerId)
        .single();
      if (!player || (player as { team_id?: string }).team_id !== teamId) {
        return NextResponse.json({ error: 'Player not found' }, { status: 404 });
      }

      // Look up any existing row first (idempotency at (source_coach_id,
      // source_player_id, source_team_id)).
      const { data: existing } = await admin
        .from('player_handoffs')
        .select('id')
        .eq('source_coach_id', user.id)
        .eq('source_player_id', playerId)
        .eq('source_team_id', teamId)
        .maybeSingle();

      if (existing && (existing as { id?: string }).id) {
        committed.push({ playerId, handoffId: (existing as { id: string }).id });
        continue;
      }

      const { data: inserted, error: insertError } = await admin
        .from('player_handoffs')
        .insert({
          source_coach_id: user.id,
          source_player_id: playerId,
          source_team_id: teamId,
          org_id: finalOrgId,
          season_label: seasonLabel,
          card_body: cardBody,
          ai_provider: preview.aiProvider || 'anthropic',
        })
        .select('id')
        .single();

      if (insertError || !inserted) {
        return NextResponse.json(
          { error: insertError?.message || 'Failed to commit handoff' },
          { status: 500 },
        );
      }

      committed.push({ playerId, handoffId: (inserted as { id: string }).id });
    }

    return NextResponse.json({ committed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Player handoff commit error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
