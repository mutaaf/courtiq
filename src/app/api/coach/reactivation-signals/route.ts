/**
 * GET /api/coach/reactivation-signals — ticket 0072.
 *
 * Returns the caller coach's unconsumed `coach_reactivation_signals`
 * from the last 14 days, joined with the prior player's first name AND
 * the prior team's name so the home-page `<ReturningParentCard />` can
 * render "Liam's parent is back on SportsIQ this week — they opened a
 * parent portal for their other kid's team."
 *
 * COPPA contract (LESSONS#0036):
 *  - `.select()` allow-list on every read. NEVER reads parent_email,
 *    parent_phone, DOB, medical_notes on the prior-player row.
 *  - The response shape is `{ signals: Array<{ id,
 *    priorPlayerFirstName, priorTeamName, firedAt, priorPlayerId }> }`.
 *    The signal's `returning_parent_email_hash` is NEVER returned (the
 *    coach has no reason to see the hash; the surface is about the
 *    prior kid the coach already coached).
 *  - The prior player's FIRST NAME ONLY is returned (`name.split(' ')[0]`)
 *    so a last-name leak is structurally impossible.
 *
 * Auth: the caller must be authenticated. The signals are scoped to the
 * caller via `dormant_coach_id = user.id` (the `coaches.id` is the
 * auth.users id by migration 001).
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;

export async function GET() {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createServiceSupabase();

  try {
    const windowStartIso = new Date(Date.now() - WINDOW_DAYS * DAY_MS).toISOString();
    // 1) Caller's unconsumed signals from the last 14 days. Allow-list:
    //    id + prior_team_id + prior_player_id + fired_at. NEVER reads the
    //    hashed parent email back out — the surface never shows it.
    const { data: signals, error: signalsErr } = await admin
      .from('coach_reactivation_signals')
      .select('id, prior_team_id, prior_player_id, fired_at')
      .eq('dormant_coach_id', user.id)
      .is('consumed_at', null)
      .gte('fired_at', windowStartIso)
      .order('fired_at', { ascending: false });

    if (signalsErr) {
      return NextResponse.json({ error: signalsErr.message }, { status: 500 });
    }

    const rows = (signals ?? []) as Array<{
      id: string;
      prior_team_id: string;
      prior_player_id: string;
      fired_at: string;
    }>;
    if (rows.length === 0) {
      return NextResponse.json({ signals: [] });
    }

    // 2) Resolve prior player first names. Allow-list: id + name. NEVER
    //    reads parent_email, parent_phone, DOB, medical_notes,
    //    jersey_number, photo_url.
    const priorPlayerIds = Array.from(new Set(rows.map((r) => r.prior_player_id)));
    const { data: priorPlayers } = await admin
      .from('players')
      .select('id, name')
      .in('id', priorPlayerIds);
    const nameByPlayerId = new Map<string, string>();
    for (const p of (priorPlayers ?? []) as Array<{ id: string; name: string }>) {
      // First name only — defensive split on a literal space (LESSONS#0061).
      const firstName = (p.name || '').split(' ')[0] || '';
      nameByPlayerId.set(p.id, firstName);
    }

    // 3) Resolve prior team names. Allow-list: id + name.
    const priorTeamIds = Array.from(new Set(rows.map((r) => r.prior_team_id)));
    const { data: priorTeams } = await admin
      .from('teams')
      .select('id, name')
      .in('id', priorTeamIds);
    const teamNameById = new Map<string, string>();
    for (const t of (priorTeams ?? []) as Array<{ id: string; name: string }>) {
      teamNameById.set(t.id, t.name);
    }

    const joined = rows.map((r) => ({
      id: r.id,
      priorPlayerId: r.prior_player_id,
      priorPlayerFirstName: nameByPlayerId.get(r.prior_player_id) ?? '',
      priorTeamName: teamNameById.get(r.prior_team_id) ?? '',
      firedAt: r.fired_at,
    }));

    return NextResponse.json({ signals: joined });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
