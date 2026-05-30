/**
 * Ticket 0059 — POST /api/player-handoffs/[handoffId]/claim.
 *
 * The receiving coach's "Save to my coach notes" action. Stamps the handoff
 * row with claimed_by_coach_id / claimed_at / claimed_player_id AND inserts a
 * row into the existing `player_notes` table so the card body lives on the
 * receiving coach's coach-private journal for the player.
 *
 * No new column on `players` (COPPA — the ticket's load-bearing constraint).
 * Reusing `player_notes` keeps the per-minor schema unchanged.
 *
 * Idempotency: a second claim by the SAME coach returns 409 with the SAME
 * `claimed_player_id` so a double-tap on the receiving sheet is safe. A
 * cross-org claim (handoff.org_id != caller.org_id) returns 404.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ handoffId: string }> },
) {
  const { handoffId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const playerId = typeof body?.playerId === 'string' ? body.playerId : null;
  if (!playerId) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // Resolve caller org.
  const { data: coachRow } = await admin
    .from('coaches')
    .select('org_id')
    .eq('id', user.id)
    .single();
  const callerOrgId = (coachRow as { org_id?: string | null } | null)?.org_id ?? null;
  if (!callerOrgId) {
    return NextResponse.json({ error: 'Handoff not found' }, { status: 404 });
  }

  // Resolve the handoff. A cross-org row → 404; a foreign claim → 409 with
  // the existing claimed_player_id (idempotent re-claim semantics).
  const { data: handoff } = await admin
    .from('player_handoffs')
    .select(
      'id, org_id, card_body, season_label, source_coach_id, claimed_by_coach_id, claimed_player_id',
    )
    .eq('id', handoffId)
    .maybeSingle();

  if (!handoff || (handoff as { org_id?: string }).org_id !== callerOrgId) {
    return NextResponse.json({ error: 'Handoff not found' }, { status: 404 });
  }

  const h = handoff as {
    id: string;
    org_id: string;
    card_body: string;
    season_label: string;
    source_coach_id: string;
    claimed_by_coach_id: string | null;
    claimed_player_id: string | null;
  };

  if (h.claimed_by_coach_id) {
    return NextResponse.json(
      {
        error: 'Handoff already claimed',
        handoffId: h.id,
        claimed_player_id: h.claimed_player_id,
      },
      { status: 409 },
    );
  }

  // Verify the receiving player belongs to the caller (via team_coaches).
  const { data: player } = await admin
    .from('players')
    .select('id, team_id, name')
    .eq('id', playerId)
    .single();
  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }
  const { data: teamCoach } = await admin
    .from('team_coaches')
    .select('coach_id')
    .eq('team_id', (player as { team_id: string }).team_id)
    .eq('coach_id', user.id)
    .maybeSingle();
  if (!teamCoach) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  // Look up the source coach's first name for the note prefix. Failures fall
  // back to a generic prefix; the claim itself still succeeds.
  const { data: sourceCoach } = await admin
    .from('coaches')
    .select('full_name')
    .eq('id', h.source_coach_id)
    .single();
  const sourceCoachFirstName = ((): string => {
    const raw = (sourceCoach as { full_name?: string } | null)?.full_name?.trim();
    if (!raw) return 'a prior coach';
    return raw.split(/\s+/)[0];
  })();

  // Insert into the existing player_notes table (no new column on players).
  // We prefix the body with "Handoff from <coach>, <season>:" so a coach
  // skimming her notes sees the provenance at a glance.
  const noteContent = `Handoff from Coach ${sourceCoachFirstName} (${h.season_label}): ${h.card_body}`;
  await admin.from('player_notes').insert({
    player_id: (player as { id: string }).id,
    team_id: (player as { team_id: string }).team_id,
    coach_id: user.id,
    content: noteContent,
    pinned: false,
  });

  // Stamp the handoff row.
  const { error: updateError } = await admin
    .from('player_handoffs')
    .update({
      claimed_by_coach_id: user.id,
      claimed_at: new Date().toISOString(),
      claimed_player_id: (player as { id: string }).id,
    })
    .eq('id', h.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    handoffId: h.id,
    claimed_player_id: (player as { id: string }).id,
  });
}
