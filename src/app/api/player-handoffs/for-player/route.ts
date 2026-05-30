/**
 * Ticket 0059 — GET /api/player-handoffs/for-player?playerId=<id>.
 *
 * The RECEIVING coach's read path. For one of the receiving coach's local
 * `players` rows, return the most-recent unclaimed handoff in the SAME `org_id`
 * that matches by first name (case-insensitive) + age group (within ±1) +
 * jersey number (when both sides have one).
 *
 * Returns:
 *   { handoff: { handoffId, sourceCoachFirstName, seasonLabel, cardBody } }
 *   or { handoff: null } when no match.
 *
 * Cross-org access is impossible by construction — every candidate is scoped
 * to the caller's `org_id`, resolved server-side (LESSONS#0039 — never trust
 * client-supplied org ids). The matcher uses ONLY data the receiving coach
 * already has on her local rows; there is no cross-DB join.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { firstNameOf, matchHandoffToPlayer } from '@/lib/player-handoff-utils';

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const playerId = url.searchParams.get('playerId');
  if (!playerId) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // Resolve the caller's org_id from the caller record — never from the URL.
  const { data: coachRow } = await admin
    .from('coaches')
    .select('org_id')
    .eq('id', user.id)
    .single();
  const orgId = (coachRow as { org_id?: string | null } | null)?.org_id ?? null;
  if (!orgId) {
    return NextResponse.json({ handoff: null });
  }

  // Resolve the receiving coach's local player row. The player must belong to
  // a team the caller has access to in the same org; we verify ownership via
  // team_coaches so we never echo a foreign player's metadata.
  const { data: player } = await admin
    .from('players')
    .select('id, team_id, name, age_group, jersey_number')
    .eq('id', playerId)
    .single();

  if (!player) {
    return NextResponse.json({ handoff: null });
  }

  const { data: teamCoach } = await admin
    .from('team_coaches')
    .select('coach_id')
    .eq('team_id', (player as { team_id: string }).team_id)
    .eq('coach_id', user.id)
    .maybeSingle();
  if (!teamCoach) {
    return NextResponse.json({ handoff: null });
  }

  // Pull every unclaimed, unarchived handoff in the caller's org, most-recent
  // first. We then apply the in-memory matcher because the schema-level
  // matcher (first name normalized + age within ±1) is not a single SQL
  // predicate; the candidate pool is small (a season's worth of program
  // handoffs), so a fetch + filter is cheap and correct.
  const { data: candidates } = await admin
    .from('player_handoffs')
    .select(
      'id, source_coach_id, source_player_id, season_label, card_body, created_at, claimed_by_coach_id, is_archived, org_id',
    )
    .eq('org_id', orgId)
    .is('claimed_by_coach_id', null)
    .eq('is_archived', false)
    .order('created_at', { ascending: false });

  const handoffs = (candidates || []) as Array<{
    id: string;
    source_coach_id: string;
    source_player_id: string;
    season_label: string;
    card_body: string;
    created_at: string;
  }>;

  for (const h of handoffs) {
    // For each candidate we need the SOURCE player's first name + age + jersey
    // to compare. The source player's name is the canonical anchor for the
    // first-name match.
    const { data: sourcePlayer } = await admin
      .from('players')
      .select('name, age_group, jersey_number')
      .eq('id', h.source_player_id)
      .single();
    if (!sourcePlayer) continue;
    const sp = sourcePlayer as { name: string; age_group: string; jersey_number: number | null };

    const matched = matchHandoffToPlayer(
      firstNameOf(sp.name),
      sp.age_group,
      sp.jersey_number,
      {
        name: (player as { name: string }).name,
        age_group: (player as { age_group: string }).age_group,
        jersey_number: (player as { jersey_number: number | null }).jersey_number,
      },
    );
    if (!matched) continue;

    // Resolve the source coach's first name for display. Failure to resolve
    // falls back to "your prior coach" so the badge still renders.
    const { data: sourceCoach } = await admin
      .from('coaches')
      .select('full_name')
      .eq('id', h.source_coach_id)
      .single();
    const sourceCoachFirstName = firstNameOf(
      (sourceCoach as { full_name?: string } | null)?.full_name || 'your prior coach',
    );

    return NextResponse.json({
      handoff: {
        handoffId: h.id,
        sourceCoachFirstName,
        seasonLabel: h.season_label,
        cardBody: h.card_body,
      },
    });
  }

  return NextResponse.json({ handoff: null });
}
