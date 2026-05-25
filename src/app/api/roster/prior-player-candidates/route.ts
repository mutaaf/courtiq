import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET /api/roster/prior-player-candidates?playerId=<id> — the org-scoped list of
// players the coach could link the given player to as their prior-season self
// (ticket 0034). Used by the roster "Did you coach this player last season?"
// control.
//
// Org-scoping is the security boundary: candidates come ONLY from teams in the
// caller's OWN org, and never from the current player's own team (you link to a
// PRIOR season's row, not a teammate). No other org's players are ever returned.
//
// Returns { candidates: [{ id, name, team_name, season }] }. Carries no new
// minor-scoped data — only the name the coach already entered plus the team/season
// labels needed to disambiguate which "Maya" is the prior-season one. Graceful:
// returns an empty list (never an error) when the caller has no org.
export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const url = new URL(request.url);
  const playerId = url.searchParams.get('playerId');

  // Resolve the caller's org.
  const { data: coach } = await admin
    .from('coaches')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!coach?.org_id) {
    return NextResponse.json({ candidates: [] });
  }

  // The current player's team — so we exclude same-team rows from the candidates
  // (a prior-season link points at a DIFFERENT team's row, not a current teammate).
  let currentTeamId: string | null = null;
  if (playerId) {
    const { data: currentPlayer } = await admin
      .from('players')
      .select('team_id')
      .eq('id', playerId)
      .single();
    currentTeamId = (currentPlayer as { team_id?: string | null } | null)?.team_id ?? null;
  }

  // Teams in the caller's org (the org boundary).
  const { data: orgTeams } = await admin
    .from('teams')
    .select('id, name, season')
    .eq('org_id', coach.org_id);

  const teams = (orgTeams || []).filter((t) => t.id !== currentTeamId);
  if (teams.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  const teamMeta = new Map<string, { name: string; season: string | null }>();
  for (const t of teams) {
    teamMeta.set(t.id, { name: t.name as string, season: (t.season as string | null) ?? null });
  }

  // Players on those org teams — the candidate prior-season selves.
  const { data: orgPlayers } = await admin
    .from('players')
    .select('id, name, team_id')
    .in(
      'team_id',
      teams.map((t) => t.id)
    )
    .order('name', { ascending: true });

  const candidates = (orgPlayers || []).map((p) => {
    const meta = teamMeta.get(p.team_id as string);
    return {
      id: p.id as string,
      name: p.name as string,
      team_name: meta?.name ?? '',
      season: meta?.season ?? '',
    };
  });

  return NextResponse.json({ candidates });
}
