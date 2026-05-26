import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  getSeasonPhase,
  buildSeasonWrap,
  type SeasonWrap,
  type SeasonPhase,
} from '@/lib/season-wrap-utils';

// ─── GET /api/season/wrap?teamId=<id> ─────────────────────────────────────────
// Ticket 0036 — feeds the coach-private "that's a wrap" home card.
//
// Reads ONLY data we already collect (teams.current_week / season_weeks +
// sessions + observations) and returns the season phase plus, when complete, the
// factual totals + one growth highlight (derived deterministically — no AI, no
// quota). Org-scoped (mirrors /api/analytics/season-momentum): the caller's
// coaches.org_id must own the team, else 404 with NO further read. Available to
// EVERY coach — a free coach should be re-activated too; no tier gate and no AI.
//
// COPPA / data minimization: the response carries aggregate integers + ONE plain
// highlight line; it is coach-private and never added to publicPaths.

export interface SeasonWrapResponse extends SeasonWrap {
  phase: SeasonPhase;
  season: string | null;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');
  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  const { data: coach } = await admin
    .from('coaches')
    .select('org_id')
    .eq('id', user.id)
    .single();
  const callerOrgId = (coach as { org_id?: string } | null)?.org_id;

  const { data: team } = await admin
    .from('teams')
    .select('org_id, season, season_weeks, current_week')
    .eq('id', teamId)
    .single();

  const t = team as
    | { org_id: string; season: string | null; season_weeks: number | null; current_week: number }
    | null;

  if (!t || !callerOrgId || t.org_id !== callerOrgId) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  // Sessions for the practice count + phase decision.
  const { data: sessionRows } = await admin
    .from('sessions')
    .select('id, type, date')
    .eq('team_id', teamId);
  const sessions = (sessionRows ?? []) as Array<{ id: string; type: string; date: string }>;

  const phase = getSeasonPhase(
    { season: t.season, season_weeks: t.season_weeks, current_week: t.current_week },
    sessions.filter((s) => s.type === 'practice').length,
  );

  // Only build the full wrap when the season is actually complete — otherwise the
  // card renders nothing and we skip the heavier observation read.
  if (phase !== 'complete') {
    const empty: SeasonWrapResponse = {
      phase,
      season: t.season,
      weeksCoached: 0,
      practiceCount: 0,
      playersObserved: 0,
      highlight: null,
    };
    return NextResponse.json(empty);
  }

  const { data: obsRows } = await admin
    .from('observations')
    .select('player_id, category, sentiment, created_at')
    .eq('team_id', teamId);
  const observations = (obsRows ?? []) as Array<{
    player_id: string | null;
    category: string | null;
    sentiment: string;
    created_at: string;
  }>;

  const { data: playerRows } = await admin
    .from('players')
    .select('id, name')
    .eq('team_id', teamId);
  const players = (playerRows ?? []) as Array<{ id: string; name: string }>;

  const wrap = buildSeasonWrap(
    { season: t.season, season_weeks: t.season_weeks, current_week: t.current_week },
    sessions,
    observations,
    players,
  );

  const payload: SeasonWrapResponse = {
    phase,
    season: t.season,
    ...wrap,
  };

  return NextResponse.json(payload);
}
