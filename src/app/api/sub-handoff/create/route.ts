import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  generateObserverToken,
  validateSubFirstName,
} from '@/lib/sub-handoff-utils';

// POST /api/sub-handoff/create — turn ONE session a regular coach is about
// to miss into a public, no-auth sub-coach handoff link (ticket 0067).
// The response carries a URL the regular coach forwards into the group
// chat; the sub opens it on their phone unauthed.
//
// This route is AUTHENTICATED — it is NOT in publicPaths (only
// /api/sub-handoff/<token> + /api/sub-handoff/<token>/sub-note are public).
// It self-enforces auth below (same posture as
// /api/practice-plan-shares/create).
//
// Free for every tier — gating substitution inverts the moat (the sub-
// handoff is a fairness primitive; every coach occasionally needs one).
// This route DOES NOT import @/lib/tier.
//
// Idempotency: a second invocation by the same coach for the same session
// UPDATES the existing row with the new include-flags + name + token.
// (The token is re-minted on each create so the regular coach can refresh
// a stale link without piling up dead handoff rows.)
//
// Head-coach check: scoped via `team_coaches` (LESSONS#0057 — never
// `teams.coach_id`, that column does not exist).
export async function POST(request: Request) {
  // Server supabase only for the auth check.
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const {
    sessionId,
    subFirstName,
    includeQueuedDrills,
    includeWeeklyFocus,
    includeEyesOnPlayers,
  } = body as {
    sessionId?: string;
    subFirstName?: string;
    includeQueuedDrills?: boolean;
    includeWeeklyFocus?: boolean;
    includeEyesOnPlayers?: boolean;
  };

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  // Validate the optional sub-name BEFORE doing any DB work. Throws
  // `length` when too long, `voice` when banned; both become 400 with the
  // specific reason. Same shape as /api/drill-shares/create's caption
  // validation.
  let trimmedSubName: string | null = null;
  try {
    trimmedSubName = validateSubFirstName(subFirstName);
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'invalid';
    if (reason === 'voice') {
      return NextResponse.json({ reason: 'voice', field: 'subFirstName' }, { status: 400 });
    }
    return NextResponse.json({ error: 'subFirstName too long' }, { status: 400 });
  }

  // Service role for all DB operations (bypasses RLS).
  const supabase = await createServiceSupabase();

  try {
    // Resolve the session. The .select() is an explicit allow-list — never
    // a `*` — so a future schema widening on `sessions` doesn't quietly
    // leak through this route.
    const { data: session } = await supabase
      .from('sessions')
      .select('id, team_id, coach_id, type, date')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Head-coach check via team_coaches (LESSONS#0057). The route accepts
    // any role on the team — head_coach, coach, assistant — because all
    // three may legitimately need to hand off a practice. The schema's
    // team_coaches.role enum is not narrowed here.
    const { data: teamCoach } = await supabase
      .from('team_coaches')
      .select('coach_id')
      .eq('team_id', session.team_id)
      .eq('coach_id', user.id)
      .single();

    if (!teamCoach) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Mint the 24h observer token via the existing helper (LESSONS#0096 —
    // do NOT re-inline). The sub_handoffs.observer_token column stores
    // this for indexed lookup at GET; validation flows through
    // validateObserverToken so an expired token gets a 410.
    const observerToken = generateObserverToken(session.id, 24);

    // Default the three include-flags to TRUE — the AC says all three
    // checkboxes start checked on the regular coach's sheet.
    const flagDrills = includeQueuedDrills === false ? false : true;
    const flagFocus = includeWeeklyFocus === false ? false : true;
    const flagEyes = includeEyesOnPlayers === false ? false : true;

    // Idempotency: look for an existing handoff on (session_id, coach_id).
    // If one exists, UPDATE it (rolling the token + flags + name); if not,
    // INSERT. Two DB roundtrips kept clear so the test can sequence
    // mockReturnValueOnce chains predictably.
    const { data: existing } = await supabase
      .from('sub_handoffs')
      .select(
        'id, session_id, coach_id, observer_token, sub_first_name, include_queued_drills, include_weekly_focus, include_eyes_on_players',
      )
      .eq('session_id', session.id)
      .eq('coach_id', user.id)
      .single();

    let row;
    if (existing) {
      const { data: updated, error: updateErr } = await supabase
        .from('sub_handoffs')
        .update({
          observer_token: observerToken,
          sub_first_name: trimmedSubName,
          include_queued_drills: flagDrills,
          include_weekly_focus: flagFocus,
          include_eyes_on_players: flagEyes,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
      row = updated;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('sub_handoffs')
        .insert({
          session_id: session.id,
          coach_id: user.id,
          observer_token: observerToken,
          sub_first_name: trimmedSubName,
          include_queued_drills: flagDrills,
          include_weekly_focus: flagFocus,
          include_eyes_on_players: flagEyes,
        })
        .select()
        .single();
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
      row = inserted;
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get('origin') ||
      '';
    const url = `${appUrl}/sub/${observerToken}`;

    return NextResponse.json({
      token: observerToken,
      url,
      expiresIn: '24 hours',
      handoff: row,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Sub-handoff create error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
