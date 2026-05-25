import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { canAccess, type Tier } from '@/lib/tier';
import type { SeasonMomentum } from '@/lib/season-momentum-utils';
import { weeksActiveFromEarliest } from '@/lib/season-momentum-utils';

// ─── GET /api/analytics/season-momentum?teamId=<id> ──────────────────────────────
// Ticket 0032 — the coach-private "where am I in the season" home card.
//
// Reads ONLY data we already collect (teams.current_week / teams.season_weeks +
// accumulated observations) and returns aggregate position + trend counts. No AI
// call (the one-line trend sentence is derived deterministically on the client
// from these counts), no new artifact persisted, no migration.
//
// Org-scoped (mirrors /api/ai/weekly-star + /api/capture/player-memory): the
// caller's coaches.org_id must own the team, else 404 with NO observation read —
// we never leak another team's history. Tier-gated server-side BOTH here and via
// <UpgradeGate> on the surface (AGENTS.md rule 5): canAccess(tier,
// 'feature_season_momentum') → 403 for a free coach, Coach tier and up otherwise.
//
// COPPA / data minimization: the response carries only aggregate integers + the
// team's own season position — no player name, jersey, or observation text, and
// the route is never added to publicPaths.

// Deterministic recent window: the trend is computed over the team's most recent
// 30 observations (created_at desc, limit 30). Documented per the ticket's
// engineering note; mirrors the order/limit pattern in the weekly-star route.
const RECENT_OBSERVATION_WINDOW = 30;

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

  // Resolve the caller's org + tier and gate server-side BEFORE any team read.
  const { data: coach } = await admin
    .from('coaches')
    .select('org_id, organizations(tier)')
    .eq('id', user.id)
    .single();

  const callerOrgId = (coach as any)?.org_id as string | undefined;
  const tier = (((coach as any)?.organizations?.tier) || 'free') as Tier;

  // Tier gate: Coach tier and up (free is excluded). Returns 403 BEFORE reading
  // any observations so a free coach can't probe the data either.
  if (!canAccess(tier, 'feature_season_momentum')) {
    return NextResponse.json(
      { error: 'The season-momentum card is a Coach plan feature.' },
      { status: 403 }
    );
  }

  // Confirm the team belongs to the caller's org. A non-owned / missing team is
  // 404 (mirrors weekly-star's not-found contract) and reads NO observations.
  const { data: team } = await admin
    .from('teams')
    .select('org_id, season_weeks, current_week')
    .eq('id', teamId)
    .single();

  if (!team || !callerOrgId || (team as any).org_id !== callerOrgId) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  // Recent observations for the trend (sentiment + created_at only — never reads
  // player rows or observation text). Ordered desc + limited to the recent window.
  const { data: recentRows } = await admin
    .from('observations')
    .select('sentiment, created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(RECENT_OBSERVATION_WINDOW);

  const recent = (recentRows ?? []) as Array<{ sentiment: string; created_at: string }>;
  const totalCount = recent.length;
  const positiveCount = recent.filter((o) => o.sentiment === 'positive').length;

  // The earliest observation drives weeksActive (the season-long "you're N weeks
  // in" fallback). Read just the earliest created_at, ascending + limit 1.
  const { data: earliestRows } = await admin
    .from('observations')
    .select('created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: true })
    .limit(1);

  const earliestIso = (earliestRows?.[0]?.created_at as string | undefined) ?? null;

  const payload: SeasonMomentum = {
    weekPosition: (team as any).current_week as number,
    weekTotal: ((team as any).season_weeks as number | null) ?? null,
    weeksActive: weeksActiveFromEarliest(earliestIso),
    trend: { positiveCount, totalCount },
  };

  return NextResponse.json(payload);
}
