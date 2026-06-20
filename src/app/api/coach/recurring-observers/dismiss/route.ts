/**
 * POST /api/coach/recurring-observers/dismiss — ticket 0092.
 *
 * The /home `<RealCoCoachCard />` "Not yet" button calls this route
 * with `{ helperIdentifier, teamId }`. The route UPSERTs a row into
 * `recurring_observer_dismissals` (unique on
 * `(coach_id, helper_identifier, team_id)`) so the next /home read
 * sees the dismissal and silences the card for that helper-team pair
 * for the next 30 days (the cooldown lives in the GET route's
 * derivation step).
 *
 * COPPA: writes only (coach_id, helper_identifier, team_id,
 * dismissed_at). Never reads or writes any minor-data field.
 * Service-role write per AGENTS.md rule 3.
 *
 * LESSONS#0044 — the auth check is load-bearing.
 * LESSONS#0072 — never mutate a DB-read row.
 *
 * Voice posture (LESSONS#0023): this jsdoc instructs positively.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    helperIdentifier?: unknown;
    teamId?: unknown;
  };
  const helperIdentifier =
    typeof body.helperIdentifier === 'string' ? body.helperIdentifier.trim() : '';
  const teamId = typeof body.teamId === 'string' ? body.teamId.trim() : '';

  if (!helperIdentifier) {
    return NextResponse.json(
      { error: 'helperIdentifier required' },
      { status: 400 },
    );
  }
  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();
  try {
    const nowIso = new Date().toISOString();
    const { error } = await admin
      .from('recurring_observer_dismissals')
      .upsert(
        {
          coach_id: user.id,
          helper_identifier: helperIdentifier,
          team_id: teamId,
          dismissed_at: nowIso,
        },
        { onConflict: 'coach_id,helper_identifier,team_id' },
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
