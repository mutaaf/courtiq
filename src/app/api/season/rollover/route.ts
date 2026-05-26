import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// ─── POST /api/season/rollover ────────────────────────────────────────────────
// Ticket 0036 — "Start next season with this team".
//
// Creates the next season for ONE team (the active team): advances the team's
// season label, resets current_week to 1, and carries the RETURNING roster
// forward — re-creating each ACTIVE player on the new season with prior_player_id
// pointing at the finished-season player (the 0034 cross-season mechanism, so
// next season's parent reports inherit the returning player's growth story).
//
// Auth + ownership: authed via createServerSupabase().auth.getUser() → 401; then
// service-role for the writes. The team MUST belong to the caller's coaches.org_id
// (mirrors /api/ai/weekly-star + /api/analytics/season-momentum) → 404 for a
// foreign team, and NOTHING is written. Service-role only; never a direct client
// Supabase write (AGENTS.md rule 3).
//
// COPPA / data minimization: the carry copies ONLY name/jersey/position/nickname/
// age_group the coach already entered, plus the prior_player_id pointer (0034). It
// copies NOTHING new about the minor — no date_of_birth, medical_notes, or
// parent_* fields ride forward, and no new field is added to players.

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const teamId = body?.teamId as string | undefined;
  const newSeasonLabel = (body?.newSeasonLabel as string | undefined)?.trim();

  if (!teamId || !newSeasonLabel) {
    return NextResponse.json(
      { error: 'teamId and newSeasonLabel are required' },
      { status: 400 }
    );
  }

  const admin = await createServiceSupabase();

  // Resolve the caller's org BEFORE touching the team.
  const { data: coach } = await admin
    .from('coaches')
    .select('org_id')
    .eq('id', user.id)
    .single();
  const callerOrgId = (coach as { org_id?: string } | null)?.org_id;

  // Confirm the team belongs to the caller's org. A non-owned / missing team is
  // 404 and writes NOTHING (mirrors weekly-star's not-found contract).
  const { data: team } = await admin
    .from('teams')
    .select('id, org_id, season')
    .eq('id', teamId)
    .single();

  const teamOrgId = (team as { org_id?: string } | null)?.org_id;
  if (!team || !callerOrgId || teamOrgId !== callerOrgId) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  // Advance the season label and reset the week counter for the new season.
  const { error: updateError } = await admin
    .from('teams')
    .update({ season: newSeasonLabel, current_week: 1 })
    .eq('id', teamId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // The returning roster: ACTIVE players only — inactive players are not carried.
  const { data: activePlayers } = await admin
    .from('players')
    .select('id, name, nickname, age_group, position, jersey_number')
    .eq('team_id', teamId)
    .eq('is_active', true);

  const roster = (activePlayers ?? []) as Array<{
    id: string;
    name: string;
    nickname: string | null;
    age_group: string;
    position: string;
    jersey_number: number | null;
  }>;

  let carried: unknown[] = [];
  if (roster.length > 0) {
    // Carry ONLY columns the coach already entered + the prior_player_id pointer.
    // No new minor-scoped field rides forward (COPPA — AGENTS.md non-negotiable 2).
    const newRows = roster.map((p) => ({
      team_id: teamId,
      name: p.name,
      nickname: p.nickname,
      age_group: p.age_group,
      position: p.position,
      jersey_number: p.jersey_number,
      is_active: true,
      prior_player_id: p.id,
    }));

    const { data: inserted, error: insertError } = await admin
      .from('players')
      .insert(newRows)
      .select('id, name, prior_player_id');
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    carried = inserted ?? [];
  }

  return NextResponse.json({
    teamId,
    season: newSeasonLabel,
    carriedCount: carried.length,
    players: carried,
  });
}
