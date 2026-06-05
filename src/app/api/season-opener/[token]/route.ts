import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';

// GET /api/season-opener/[token] — PUBLIC, no auth. Resolves the share
// token → its season_opener_shares row → team + sport + coach's first
// name + handle. The /opener/<token> page reads this payload server-side
// and renders the single-screen parent-facing card (ticket 0068).
//
// The route's `.select()` calls are EXPLICIT ALLOW-LISTS per LESSONS#0036;
// no `*`. Players, observations, parent_email, parent_phone, DOB, medical
// notes, jersey numbers, photo URLs — none of those ever reach this
// response by design. The card is team-level only.
//
// 404 on unknown token. 400 on empty param.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const supabase = await createServiceSupabase();

  try {
    // Lookup the share row by token (indexed).
    const { data: share } = await supabase
      .from('season_opener_shares')
      .select('id, team_id, coach_id, token, season_label, focus_line, created_at')
      .eq('token', token)
      .single();

    if (!share) {
      return NextResponse.json({ error: 'Season opener not found' }, { status: 404 });
    }

    // Team — allow-list select. Never reads parent-side or minor-side
    // fields; never reads `settings` (could carry future per-team data we
    // don't want to expose publicly).
    const { data: team } = await supabase
      .from('teams')
      .select('id, name, age_group, sport_id')
      .eq('id', share.team_id)
      .single();

    let sportName: string | null = null;
    if (team?.sport_id) {
      const { data: sport } = await supabase
        .from('sports')
        .select('id, name')
        .eq('id', team.sport_id)
        .single();
      sportName = sport?.name ?? null;
    }

    // Coach — allow-list to full_name (for first-name derivation) +
    // optional handle (for the 0026 /coach/<handle> deep link). NEVER
    // reads email / preferences / avatar_url.
    const { data: coach } = await supabase
      .from('coaches')
      .select('id, full_name, handle')
      .eq('id', share.coach_id)
      .single();

    const coachFirstName = coach?.full_name
      ? String(coach.full_name).trim().split(/\s+/)[0] || null
      : null;
    const coachHandle =
      coach && typeof (coach as { handle?: string | null }).handle === 'string'
        ? (coach as { handle: string | null }).handle
        : null;

    return NextResponse.json({
      teamName: team?.name ?? '',
      ageGroup: team?.age_group ?? '',
      sportName,
      seasonLabel: share.season_label,
      coachFirstName,
      coachHandle,
      focusLine: share.focus_line,
      createdAt: share.created_at,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Season-opener token GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
